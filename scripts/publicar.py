#!/usr/bin/env python3
"""Publicação automática · Repasses de Cocorretagem

Roda no GitHub Actions (.github/workflows/publicar.yml) a cada envio para a branch main.

  python3 scripts/publicar.py supabase   banco, segredos, funções, agendamento, login, e-mail e usuários
  python3 scripts/publicar.py site       monta a pasta _site com o config.js preenchido

Pode rodar quantas vezes quiser: tudo é idempotente. Chaves geradas uma vez
(VAPID do push e senha do agendamento) ficam guardadas no próprio banco e são
reaproveitadas nas próximas publicações.

Teste local, sem chamar APIs: SQL_LOCAL="host=... dbname=..." python3 scripts/publicar.py supabase
"""
import json, os, pathlib, re, secrets, shutil, subprocess, sys, urllib.error, urllib.request

R = pathlib.Path(__file__).resolve().parent.parent
def env(k, d=""): return (os.environ.get(k) or d).strip()
LOCAL = env("SQL_LOCAL")
GH = bool(os.environ.get("GITHUB_ACTIONS"))

def info(m): print(m, flush=True)
def aviso(m): print(("::warning::" if GH else "AVISO: ") + m, flush=True)
def falha(m):
    print(("::error::" if GH else "ERRO: ") + m, flush=True)
    sys.exit(1)
def mascarar(v):
    if v and GH: print("::add-mask::" + v, flush=True)
def saida(k, v):
    f = os.environ.get("GITHUB_OUTPUT")
    if f:
        with open(f, "a") as o: o.write(f"{k}={v}\n")
def q(s): return "'" + str(s).replace("'", "''") + "'"

def http(method, url, body=None, token="", extra=None, suave=False):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "repasses-cocorretagem-publicar")
    for k, v in (extra or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            t = r.read().decode()
            return json.loads(t) if t.strip() else None
    except urllib.error.HTTPError as e:
        msg = f"{method} {url.split('?')[0]} respondeu {e.code}: {e.read().decode()[:600]}"
        if suave:
            aviso(msg)
            return None
        falha(msg)

# ---------------------------------------------------------------- supabase
def supabase():
    ref, token = env("SUPABASE_PROJECT_REF"), env("SUPABASE_ACCESS_TOKEN")
    if not LOCAL:
        if not ref: falha("Falta a variável SUPABASE_PROJECT_REF (Settings → Secrets and variables → Actions → Variables). É o código do projeto na URL do Supabase.")
        if not token: falha("Falta o secret SUPABASE_ACCESS_TOKEN (crie em supabase.com/dashboard/account/tokens).")
    api = f"https://api.supabase.com/v1/projects/{ref}"
    url = f"https://{ref}.supabase.co"

    def sql(texto):
        if LOCAL:  # teste: o Postgres local não tem pg_cron/pg_net (usa stubs)
            texto = re.sub(r"create extension if not exists pg_(net|cron);", "", texto)
            subprocess.run(["psql", LOCAL, "-v", "ON_ERROR_STOP=1", "-q", "-X", "-f", "-"], input=texto.encode(), check=True)
            return None
        return http("POST", api + "/database/query", {"query": texto}, token)
    def linhas(select):
        if LOCAL:
            out = subprocess.run(["psql", LOCAL, "-X", "-At", "-c", f"select coalesce(json_agg(t),'[]') from ({select}) t"], capture_output=True, check=True).stdout.decode().strip()
            return json.loads(out or "[]")
        return http("POST", api + "/database/query", {"query": select}, token) or []

    # app no ar (GitHub Pages ou domínio próprio)
    repo = env("REPO", "usuario/repasses-cocorretagem")
    dono, nome = repo.split("/", 1)
    app_url = env("APP_URL") or f"https://{dono.lower()}.github.io/{nome}/"
    if not app_url.endswith("/"): app_url += "/"

    # equipe inicial
    equipe = []
    for l in env("EQUIPE").splitlines():
        l = l.strip()
        if not l or l.startswith("#"): continue
        p = [x.strip() for x in re.split(r"[;,|]", l)]
        email = p[0].lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email): falha(f"EQUIPE: e-mail inválido na linha \"{l}\".")
        nomep = p[1] if len(p) > 1 and p[1] else email.split("@")[0].title()
        admin = any(x.lower() in ("admin", "administrador", "administradora", "sim") for x in p[2:])
        equipe.append((email, nomep, admin))
    if not equipe: falha("Falta a variável EQUIPE: uma pessoa por linha, \"email, Nome, admin\" (veja o README).")
    if not any(a for _, _, a in equipe): falha("EQUIPE: marque pelo menos uma pessoa como admin.")

    # 1) banco
    info("1/7 · Banco (01_schema.sql)")
    s = (R / "supabase/01_schema.sql").read_text(encoding="utf-8")
    valores = ",\n".join(f"  ({q(e)}, {q(n)}, {'true' if a else 'false'})" for e, n, a in equipe)
    s, n = re.subn(r"(insert into public\.autorizados \(email, nome, admin\) values\n).*?(\non conflict \(email\) do nothing;)",
                   lambda m: m.group(1) + valores + m.group(2), s, count=1, flags=re.S)
    if n != 1: falha("Não achei o bloco da equipe no 01_schema.sql.")
    sql(s)

    # 2) chaves geradas uma vez e guardadas no banco
    info("2/7 · Chaves do push e do agendamento")
    sql("""create table if not exists public.config_publicacao (
  id int primary key default 1 check (id = 1),
  vapid_publica text, vapid_privada text, cron_secret text, atualizado_em timestamptz default now());
alter table public.config_publicacao enable row level security;  -- ninguém lê pelo app""")
    cfg = (linhas("select vapid_publica, vapid_privada, cron_secret from public.config_publicacao where id = 1") or [{}])[0]
    vpub, vpriv, cron = cfg.get("vapid_publica"), cfg.get("vapid_privada"), cfg.get("cron_secret")
    if not cron:
        antigo = linhas("select segredo from public.config_notificacoes where id = 1") if linhas("select to_regclass('public.config_notificacoes') is not null as ok")[0]["ok"] else []
        cron = antigo[0]["segredo"] if antigo and "<<<" not in antigo[0]["segredo"] else secrets.token_urlsafe(40)
    if not (vpub and vpriv):
        out = subprocess.run(["npx", "--yes", "web-push@3.6.7", "generate-vapid-keys", "--json"], capture_output=True, check=True).stdout.decode()
        k = json.loads(out[out.index("{"):])
        vpub, vpriv = k["publicKey"], k["privateKey"]
    mascarar(vpriv); mascarar(cron)
    sql(f"""insert into public.config_publicacao (id, vapid_publica, vapid_privada, cron_secret) values (1, {q(vpub)}, {q(vpriv)}, {q(cron)})
on conflict (id) do update set vapid_publica = excluded.vapid_publica, vapid_privada = excluded.vapid_privada, cron_secret = excluded.cron_secret, atualizado_em = now();""")

    # 3) segredos das funções
    info("3/7 · Segredos das funções")
    resend = env("RESEND_API_KEY")
    email_from = env("EMAIL_FROM")
    remetente = email_from or "Repasses · Clube do Seguro Garantia <onboarding@resend.dev>"
    seg = {"CRON_SECRET": cron, "APP_URL": app_url, "VAPID_PUBLIC_KEY": vpub, "VAPID_PRIVATE_KEY": vpriv,
           "VAPID_SUBJECT": env("VAPID_SUBJECT") or "mailto:" + equipe[0][0], "EMAIL_FROM": remetente}
    if resend: seg["RESEND_API_KEY"] = resend
    else: aviso("Sem RESEND_API_KEY: os lembretes saem só por push até você criar o secret.")
    # IA trocável: OpenRouter (créditos pré-pagos, qualquer modelo) ou Anthropic direto
    for k in ("OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "IA_MODELO", "ANTHROPIC_MODEL"):
        if env(k): seg[k] = env(k)
    if not (env("OPENROUTER_API_KEY") or env("ANTHROPIC_API_KEY")):
        aviso("Sem OPENROUTER_API_KEY: a leitura de apólices e extratos por IA fica desligada até você criar o secret.")
    if not LOCAL: http("POST", api + "/secrets", [{"name": k, "value": v} for k, v in seg.items()], token)

    # 4) funções
    info("4/7 · Funções (lembretes, baixa, usuarios, ler-documento)")
    if not LOCAL:
        for fn, publica in (("lembretes", True), ("baixa", True), ("usuarios", False), ("ler-documento", False)):
            cmd = ["supabase", "functions", "deploy", fn, "--project-ref", ref] + (["--no-verify-jwt"] if publica else [])
            r = subprocess.run(cmd, cwd=R)
            if r.returncode: falha(f"Não foi possível publicar a função {fn}.")

    # 5) agendamento
    info("5/7 · Agendamento de hora em hora (02_notificacoes.sql)")
    s2 = (R / "supabase/02_notificacoes.sql").read_text(encoding="utf-8")
    s2 = s2.replace("https://<<<SEU-PROJETO>>>.supabase.co", url).replace("'<<<O MESMO VALOR QUE VOCÊ USOU EM CRON_SECRET>>>'", q(cron))
    if "<<<SEU-PROJETO>>>" in s2 or "<<<O MESMO VALOR" in s2: falha("02_notificacoes.sql: marcadores não substituídos.")
    sql(s2)

    # chaves do projeto (a anon vai para o site; a service_role só fica aqui)
    anon = service = None
    if not LOCAL:
        for k in http("GET", api + "/api-keys?reveal=true", token=token) or []:
            if k.get("name") == "anon": anon = k.get("api_key")
            if k.get("name") == "service_role": service = k.get("api_key")
        if not anon or not service: falha("Não consegui ler as chaves anon e service_role do projeto.")
        mascarar(service)

    # 6) login e e-mail de autenticação pelo Resend
    info("6/7 · Login (sem cadastro aberto) e e-mail pelo Resend")
    smtp = bool(resend and email_from)
    auth = {"site_url": app_url, "uri_allow_list": f"{app_url},{app_url}**", "disable_signup": True, "external_email_enabled": True}
    if smtp:
        m = re.match(r"\s*(.*?)\s*<\s*([^>]+)\s*>\s*$", email_from)
        nome_rem, end_rem = (m.group(1).strip('" '), m.group(2)) if m else ("Clube do Seguro Garantia", email_from)
        auth.update({"smtp_admin_email": end_rem, "smtp_host": "smtp.resend.com", "smtp_port": 465, "smtp_user": "resend",
                     "smtp_pass": resend, "smtp_sender_name": nome_rem or "Clube do Seguro Garantia"})
    elif resend:
        aviso("Defina a variável EMAIL_FROM (com o domínio verificado no Resend) para os e-mails de senha saírem pelo Resend e chegarem a toda a equipe.")
    if not LOCAL:
        http("PATCH", api + "/config/auth", auth, token)
        # textos em português (se o Supabase recusar algum campo, segue sem eles)
        http("PATCH", api + "/config/auth", {"mailer_otp_exp": 86400}, token, suave=True)  # links de senha valem 24 horas
        http("PATCH", api + "/config/auth", {
            "mailer_subjects_recovery": "Defina sua senha · Repasses de Cocorretagem",
            "mailer_templates_recovery_content": "<p>Olá,</p><p>Para definir sua senha no app de Repasses de Cocorretagem do Clube do Seguro Garantia, clique no link abaixo:</p><p><a href=\"{{ .ConfirmationURL }}\">Definir minha senha</a></p><p>Se você não pediu, ignore este e-mail.</p>",
        }, token, suave=True)

    # 7) usuários da equipe
    info("7/7 · Usuários da equipe")
    if not LOCAL:
        h = {"apikey": service}
        existentes = {u.get("email", "").lower() for u in (http("GET", url + "/auth/v1/admin/users?per_page=1000", token=service, extra=h) or {}).get("users", [])}
        senha = env("SENHA_INICIAL")
        for email, nomep, _ in equipe:
            if email in existentes: continue
            if not resend and not senha:
                aviso(f"{email} ainda não tem login. Crie o secret RESEND_API_KEY (convite por e-mail) ou SENHA_INICIAL e rode de novo."); continue
            http("POST", url + "/auth/v1/admin/users", {"email": email, "password": (senha if not resend and senha else secrets.token_urlsafe(24)), "email_confirm": True, "user_metadata": {"nome": nomep}}, token=service, extra=h)
            if resend:
                ok = convidar(url, service, resend, remetente, app_url, email, nomep)
                info(f"  {email}: login criado; " + ("convite para criar a senha enviado por e-mail." if ok else "o convite não saiu (veja o aviso). Use Senha → Enviar link no app."))
            else:
                info(f"  {email}: login criado com a SENHA_INICIAL. Peça para trocar em Configurações → Trocar minha senha.")

    saida("url", url); saida("anon", anon or ""); saida("vapid", vpub); saida("app_url", app_url)
    info(f"Pronto. App: {app_url}")

def convidar(url, service, resend, remetente, app_url, email, nome):
    """Gera o link de criar senha no Supabase e manda pelo Resend (mesmo texto do convite do app)."""
    r = http("POST", url + "/auth/v1/admin/generate_link", {"type": "recovery", "email": email, "redirect_to": app_url}, token=service, extra={"apikey": service}, suave=True) or {}
    link = r.get("action_link") or (r.get("properties") or {}).get("action_link")
    if not link: return False
    primeiro = (nome or "").split(" ")[0]
    html = f"""<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0D1E36">
<div style="background:#022D5B;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><b>Clube do Seguro Garantia</b><div style="font-size:13px;color:#C7A887">Repasses de Cocorretagem</div></div>
<div style="border:1px solid #DCE1E8;border-top:0;padding:22px;border-radius:0 0 10px 10px">
<p>Olá{', ' + primeiro if primeiro else ''}!</p>
<p>Você recebeu acesso ao app que controla os pagamentos e recebimentos de comissão de cocorretagem. Clique no botão para criar sua senha:</p>
<p style="margin:24px 0"><a href="{link}" style="background:#022D5B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Criar minha senha</a></p>
<p style="font-size:13px;color:#5A6679">O link vale por 24 horas. Depois de entrar, ative as notificações no celular em <b>Notificações</b> para receber os avisos de pagar e receber.</p>
</div></div>"""
    r2 = http("POST", "https://api.resend.com/emails", {"from": remetente, "to": [email], "subject": "Seu acesso ao app de Repasses de Cocorretagem", "html": html,
              "text": f"Você recebeu acesso ao app de Repasses de Cocorretagem.\nCrie sua senha: {link}\nO link vale por 24 horas."}, token=resend, suave=True)
    return bool(r2)

# ---------------------------------------------------------------- site
def site():
    url, anon, vapid = env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), env("VAPID_PUBLIC_KEY")
    if not url or not anon: falha("Faltam a URL e a chave anon do Supabase (a etapa do Supabase não terminou).")
    d = R / "_site"
    if d.exists(): shutil.rmtree(d)
    d.mkdir()
    for f in ("index.html", "styles.css", "app.js", "sw.js", "manifest.webmanifest"):
        shutil.copy2(R / f, d / f)
    shutil.copytree(R / "icons", d / "icons")
    c = (R / "config.js").read_text(encoding="utf-8")
    for k, v in (("SUPABASE_URL", url), ("SUPABASE_ANON_KEY", anon), ("VAPID_PUBLIC_KEY", vapid)):
        c, n = re.subn(rf'({k}:\s*)"[^"]*"', lambda m: m.group(1) + json.dumps(v), c, count=1)
        if n != 1: falha(f"config.js: não achei {k}.")
    (d / "config.js").write_text(c, encoding="utf-8")
    (d / ".nojekyll").write_text("")
    info("Site montado em _site.")

if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else ""
    {"supabase": supabase, "site": site}.get(modo, lambda: falha("Use: publicar.py supabase | site"))()
