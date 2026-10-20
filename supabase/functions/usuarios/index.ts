// Repasses de Cocorretagem · função "usuarios"
// Gestão de acessos pela página Configurações. Só administradores podem alterar.
// Ações (campo "acao" no corpo):
//   listar                                  → pessoas autorizadas + último acesso (qualquer autorizado)
//   criar         {email, nome, admin, recebe_email, senha, boas_vindas?, app_url?}
//                 cria o acesso com uma senha temporária; boas_vindas=true manda pelo Resend o e-mail
//                 de boas-vindas com o usuário, a senha temporária, o passo a passo e as funcionalidades
//   excluir       {email}                   → apaga a conta de login e tira da lista
//   definir_senha {email, senha}            → troca a senha da pessoa
//   enviar_link   {email}                   → manda pelo Resend o link para (re)definir a senha
//   alterar       {email, nome?, admin?, novo_email?} → muda nome, perfil ou e-mail
//
// Usa SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (já existem por padrão)
// e os secrets APP_URL, RESEND_API_KEY e EMAIL_FROM (os mesmos dos lembretes).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const env = (k: string) => Deno.env.get(k) ?? "";
const SUPABASE_URL = env("SUPABASE_URL");
const admin = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status);
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

async function quemChama(req: Request) {
  const userClient = createClient(SUPABASE_URL, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data } = await userClient.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: a } = await admin.from("autorizados").select("email, nome, admin").eq("email", email).maybeSingle();
  return a ? { email, nome: a.nome as string, admin: !!a.admin } : null;
}

async function todosUsuariosAuth() {
  const out: { id: string; email?: string; last_sign_in_at?: string | null; created_at?: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}
async function idPorEmail(email: string) {
  const u = (await todosUsuariosAuth()).find((x) => x.email?.toLowerCase() === email);
  return u?.id ?? null;
}
// convite: link de definir senha gerado pelo Supabase e enviado pelo Resend (mesmo remetente dos lembretes)
async function enviarConvite(email: string, nome: string, novo: boolean) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("O e-mail ainda não está configurado (falta RESEND_API_KEY). Use uma senha inicial.");
  const app = env("APP_URL");
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: app ? { redirectTo: app } : undefined });
  if (error) throw error;
  const link = data.properties?.action_link;
  if (!link) throw new Error("Não foi possível gerar o link.");
  const primeiro = (nome || "").split(" ")[0];
  const titulo = novo ? "Seu acesso ao app de Repasses de Cocorretagem" : "Defina uma nova senha · Repasses de Cocorretagem";
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0D1E36">
  <div style="background:#022D5B;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><b>Clube do Seguro Garantia</b><div style="font-size:13px;color:#C7A887">Repasses de Cocorretagem</div></div>
  <div style="border:1px solid #DCE1E8;border-top:0;padding:22px;border-radius:0 0 10px 10px">
  <p>Olá${primeiro ? ", " + primeiro : ""}!</p>
  <p>${novo ? "Você recebeu acesso ao app que controla os pagamentos e recebimentos de comissão de cocorretagem. Clique no botão para criar sua senha:" : "Clique no botão para definir uma nova senha:"}</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#022D5B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Criar minha senha</a></p>
  <p style="font-size:13px;color:#5A6679">O link vale por 24 horas. Depois de entrar, ative as notificações no celular em <b>Notificações</b> para receber os avisos de pagar e receber.</p>
  </div></div>`;
  const texto = `${novo ? "Você recebeu acesso ao app de Repasses de Cocorretagem." : "Defina uma nova senha no app de Repasses de Cocorretagem."}\nCrie sua senha: ${link}\nO link vale por 24 horas.`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM") || "Repasses · Clube do Seguro Garantia <onboarding@resend.dev>", to: [email], subject: titulo, html, text: texto }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("resend", r.status, t.slice(0, 300));
    throw new Error(/verify a domain|testing emails/i.test(t)
      ? "O Resend ainda está em modo de teste: só envia para o e-mail dono da conta. Verifique o domínio no Resend e defina o EMAIL_FROM."
      : `O e-mail não pôde ser enviado (${r.status}).`);
  }
}

// ------------------------------------------------------------------ e-mail de boas-vindas
const escH = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
async function enviarEmail(para: string, assunto: string, html: string, texto: string) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("O e-mail ainda não está configurado (falta RESEND_API_KEY).");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM") || "Repasses · Clube do Seguro Garantia <onboarding@resend.dev>", to: [para], subject: assunto, html, text: texto }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("resend", r.status, t.slice(0, 300));
    throw new Error(/verify a domain|testing emails/i.test(t)
      ? "O Resend ainda está em modo de teste: só envia para o e-mail dono da conta. Verifique o domínio no Resend e defina o EMAIL_FROM."
      : `O e-mail não pôde ser enviado (${r.status}).`);
  }
}
export function emailBoasVindas(o: { nome: string; email: string; usuario: string; senha: string; app: string; quem: string; quemEmail: string }) {
  const primeiro = (o.nome || "").split(" ")[0];
  const NAVY = "#022D5B", GOLD = "#B99269", INK = "#0D1E36", MUTED = "#5A6679", LINE = "#DCE1E8";
  const passo = (n: number, t: string, d: string) => `<tr><td style="vertical-align:top;padding:0 12px 14px 0;width:28px"><div style="width:26px;height:26px;border-radius:7px;background:${NAVY};color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:26px">${n}</div></td>
    <td style="vertical-align:top;padding:0 0 14px;font-size:14px;color:${INK};line-height:1.5"><b>${t}</b><br><span style="color:${MUTED};font-size:13px">${d}</span></td></tr>`;
  const func = (t: string, d: string) => `<td style="vertical-align:top;width:50%;padding:6px"><div style="border:1px solid ${LINE};border-radius:10px;padding:12px 14px;height:100%"><div style="font-size:14px;font-weight:700;color:${NAVY}">${t}</div><div style="font-size:12.5px;color:${MUTED};line-height:1.5;margin-top:3px">${d}</div></div></td>`;
  const linha = (rot: string, val: string, mono = false) => `<tr><td style="padding:7px 0;font-size:13px;color:${MUTED};width:130px">${rot}</td><td style="padding:7px 0;font-size:15px;color:${INK};font-weight:700;${mono ? "letter-spacing:.04em;" : ""}">${val}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F5F7;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:${NAVY};padding:28px 30px 26px;border-bottom:3px solid ${GOLD}">
      <div style="color:#C7A887;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700">Clube do Seguro Garantia · Hub interno</div>
      <div style="color:#ffffff;font-size:24px;font-weight:700;margin-top:6px">Boas-vindas${primeiro ? ", " + escH(primeiro) : ""}!</div>
      <div style="color:#ffffff;opacity:.8;font-size:14px;margin-top:6px;line-height:1.5">Seu acesso ao Hub de Repasses de Cocorretagem está pronto.</div></td></tr>
    <tr><td style="padding:24px 30px 6px;color:${INK};font-size:14.5px;line-height:1.6">
      ${escH(o.quem)} liberou seu acesso ao <b>Hub de Repasses de Cocorretagem</b>, a ferramenta de uso interno do Clube para controlar o que pagamos e recebemos das corretoras parceiras em cada apólice. A ideia é simples: <b>nenhuma comissão esquecida</b>.</td></tr>
    <tr><td style="padding:14px 30px 4px"><div style="background:#F4F5F7;border:1px solid ${LINE};border-radius:12px;padding:16px 18px">
      <div style="font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#8A6740;margin-bottom:4px">Seus dados de acesso</div>
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
        ${linha("Usuário", escH(o.usuario))}${linha("ou e-mail", escH(o.email))}${linha("Senha temporária", escH(o.senha), true)}
      </table>
      <div style="margin-top:14px"><a href="${escH(o.app)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:9px">Entrar no Hub</a></div></div></td></tr>
    <tr><td style="padding:14px 30px 2px"><div style="background:#FBEFD8;border-radius:10px;padding:12px 14px;font-size:13.5px;color:#6B4300;line-height:1.5"><b>Troque a senha no primeiro acesso.</b> A senha acima é temporária. Logo depois de entrar, o Hub pede para você criar a sua senha pessoal. Não compartilhe sua senha com ninguém.</div></td></tr>
    <tr><td style="padding:22px 30px 4px"><div style="font-size:16px;font-weight:700;color:${INK};margin-bottom:12px">Primeiros passos</div>
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
        ${passo(1, "Entre no Hub", `Clique em <b>Entrar no Hub</b> e use o usuário (ou o e-mail) e a senha temporária. Se o computador for só seu, marque <b>Manter conectado</b>.`)}
        ${passo(2, "Crie a sua senha", `O Hub pede a troca logo no primeiro acesso. Depois, dá para trocar quando quiser em <b>Configurações → Trocar minha senha</b>.`)}
        ${passo(3, "Ative os avisos no celular", `Abra o Hub no celular, vá em <b>Notificações</b> e toque em <b>Ativar avisos</b>. No iPhone, abra no Safari, toque em <b>Compartilhar → Adicionar à Tela de Início</b>, abra pelo ícone e ative por lá.`)}
        ${passo(4, "Escolha o que receber", `Em <b>Notificações → Avisos ativados nesta conta → Editar</b>, escolha o que chega por e-mail e no celular.`)}
      </table></td></tr>
    <tr><td style="padding:12px 24px 4px"><div style="font-size:16px;font-weight:700;color:${INK};margin:0 6px 8px">O que você encontra no Hub</div>
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
        <tr>${func("Leitura de apólice por IA", "Envie o PDF da apólice ou do boleto e a IA preenche apólice, seguradora, tomador, prêmio, comissão e parcelas. Você só confere e define a divisão.")}${func("Avisos de repasse", "5 dias depois de cada vencimento, às 8h e às 19h, por e-mail e no celular, até haver baixa. Dá para marcar Já paguei ou Já recebi direto no aviso.")}</tr>
        <tr>${func("Fechamento do mês", "No penúltimo dia, o aviso de pendências em aberto. No último dia, o lembrete para baixar o relatório mensal.")}${func("Repasses e calendário", "O que pagar e receber de cada corretora parceira, mês a mês, com as cobranças em atraso em destaque.")}</tr>
        <tr>${func("Demonstrativo de pagamento", "PDF ou Excel por corretora, pronto para enviar ao parceiro junto com o pagamento.")}${func("Extratos e relatórios", "Leitura do extrato de comissões para conferir com as apólices e relatórios mensais em PDF e Excel.")}</tr>
      </table></td></tr>
    <tr><td style="padding:20px 30px 26px;color:${MUTED};font-size:12.5px;line-height:1.6;border-top:1px solid ${LINE}">
      Dúvidas? Fale com ${escH(o.quem)}${o.quemEmail ? ` (<a href="mailto:${escH(o.quemEmail)}" style="color:${NAVY}">${escH(o.quemEmail)}</a>)` : ""}.<br>
      Você recebeu este e-mail porque foi incluído no Hub de Repasses do Clube do Seguro Garantia. Uso interno.<br>
      Especialistas em Seguro Garantia. Parceiros do corretor de seguros.</td></tr>
  </table></td></tr></table></body></html>`;
  const texto = [`Boas-vindas${primeiro ? ", " + primeiro : ""}!`, "",
    `${o.quem} liberou seu acesso ao Hub de Repasses de Cocorretagem, a ferramenta de uso interno do Clube para controlar o que pagamos e recebemos das corretoras parceiras.`, "",
    "SEUS DADOS DE ACESSO", `Endereço: ${o.app}`, `Usuário: ${o.usuario} (ou o e-mail ${o.email})`, `Senha temporária: ${o.senha}`, "",
    "Troque a senha no primeiro acesso: logo depois de entrar, o Hub pede para você criar a sua senha pessoal.", "",
    "PRIMEIROS PASSOS", "1. Entre no Hub com o usuário (ou e-mail) e a senha temporária.", "2. Crie a sua senha (o Hub pede no primeiro acesso).",
    "3. Ative os avisos no celular em Notificações → Ativar avisos (no iPhone: Safari → Compartilhar → Adicionar à Tela de Início).",
    "4. Escolha o que receber em Notificações → Avisos ativados nesta conta → Editar.", "",
    "O QUE VOCÊ ENCONTRA NO HUB", "- Leitura de apólice por IA", "- Avisos de repasse 5 dias depois de cada vencimento, às 8h e às 19h",
    "- Fechamento do mês: pendências no penúltimo dia e relatório no último", "- Repasses e calendário por corretora", "- Demonstrativo de pagamento em PDF ou Excel", "- Leitura de extratos e relatórios mensais", "",
    `Dúvidas? Fale com ${o.quem}${o.quemEmail ? ` (${o.quemEmail})` : ""}.`].join("\n");
  return { assunto: "Boas-vindas ao Hub de Repasses · Clube do Seguro Garantia", html, texto };
}

async function contarAdmins() {
  const { count } = await admin.from("autorizados").select("email", { count: "exact", head: true }).eq("admin", true);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const eu = await quemChama(req);
    if (!eu) return erro("não autorizado", 401);
    const b = await req.json().catch(() => ({}));
    const acao = String(b.acao || "");
    const email = String(b.email || "").trim().toLowerCase();

    if (acao === "listar") {
      const [{ data: lista }, auth] = await Promise.all([
        admin.from("autorizados").select("email, nome, admin, criado_em, usuario").order("nome"),
        todosUsuariosAuth().catch(() => []),
      ]);
      const porEmail = new Map(auth.map((u) => [u.email?.toLowerCase(), u]));
      return json({
        usuarios: (lista ?? []).map((a) => {
          const u = porEmail.get(a.email.toLowerCase());
          return { ...a, tem_login: !!u, ultimo_acesso: u?.last_sign_in_at ?? null };
        }),
      });
    }

    if (!eu.admin) return erro("Só administradores podem fazer isso.", 403);

    if (acao === "criar") {
      const nome = String(b.nome || "").trim();
      const boasVindas = b.boas_vindas !== false;
      const senha = String(b.senha || "");
      if (!emailOk(email)) return erro("E-mail inválido.");
      if (!nome) return erro("Informe o nome.");
      if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
      const { data: ja } = await admin.from("autorizados").select("email").eq("email", email).maybeSingle();
      if (ja) return erro("Este e-mail já tem acesso.");
      const existente = await idPorEmail(email);
      if (existente) {
        const { error } = await admin.auth.admin.updateUserById(existente, { password: senha, email_confirm: true, user_metadata: { nome, senha_temporaria: true } });
        if (error) return erro(error.message);
      } else {
        const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, senha_temporaria: true } });
        if (error) return erro(error.message);
      }
      const { error: e2 } = await admin.from("autorizados").insert({ email, nome, admin: !!b.admin });
      if (e2) return erro(e2.message);
      if (b.recebe_email !== false) {
        const { data: ems } = await admin.from("emissoras").select("id");
        if (ems?.length) await admin.from("destinatarios").upsert(ems.map((e) => ({ emissora_id: e.id, email, nome, fechamento: true, push: true })), { onConflict: "emissora_id,email" });
      }
      const { data: criado } = await admin.from("autorizados").select("usuario").eq("email", email).maybeSingle();
      const usuario = (criado?.usuario as string) || email;
      if (!boasVindas) return json({ ok: true, usuario, enviado: false });
      try {
        const app = env("APP_URL") || String(b.app_url || "");
        const m = emailBoasVindas({ nome, email, usuario, senha, app, quem: eu.nome, quemEmail: eu.email });
        await enviarEmail(email, m.assunto, m.html, m.texto);
      } catch (e) { return json({ ok: true, usuario, enviado: false, aviso: (e as Error).message }); }
      return json({ ok: true, usuario, enviado: true });
    }

    if (acao === "excluir") {
      if (email === eu.email) return erro("Você não pode excluir a própria conta.");
      const { data: alvo } = await admin.from("autorizados").select("admin").eq("email", email).maybeSingle();
      if (alvo?.admin && (await contarAdmins()) <= 1) return erro("É preciso manter pelo menos um administrador.");
      const id = await idPorEmail(email);
      if (id) { const { error } = await admin.auth.admin.deleteUser(id); if (error) return erro(error.message); }
      await admin.from("autorizados").delete().eq("email", email);
      await admin.from("push_inscricoes").delete().eq("email", email);
      await admin.from("destinatarios").delete().eq("email", email);   // sai também da lista de avisos
      return json({ ok: true });
    }

    if (acao === "definir_senha") {
      const senha = String(b.senha || "");
      if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
      const id = await idPorEmail(email);
      if (!id) {
        const { data: a } = await admin.from("autorizados").select("nome").eq("email", email).maybeSingle();
        if (!a) return erro("Pessoa não encontrada.");
        const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: a.nome, senha_temporaria: true } });
        if (error) return erro(error.message);
        return json({ ok: true, criado: true });
      }
      const { data: ua } = await admin.auth.admin.getUserById(id);
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha, user_metadata: { ...(ua?.user?.user_metadata ?? {}), senha_temporaria: true } });
      if (error) return erro(error.message);
      return json({ ok: true });
    }

    if (acao === "enviar_link") {
      const { data: a } = await admin.from("autorizados").select("nome").eq("email", email).maybeSingle();
      if (!a) return erro("Pessoa não encontrada.");
      if (!(await idPorEmail(email))) {
        const { error } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true, user_metadata: { nome: a.nome } });
        if (error) return erro(error.message);
      }
      try { await enviarConvite(email, a.nome, false); } catch (e) { return erro((e as Error).message); }
      return json({ ok: true });
    }

    if (acao === "alterar") {
      const { data: alvo } = await admin.from("autorizados").select("email, nome, admin").eq("email", email).maybeSingle();
      if (!alvo) return erro("Pessoa não encontrada.");
      const patch: Record<string, unknown> = {};
      if (typeof b.nome === "string" && b.nome.trim()) patch.nome = b.nome.trim();
      if (typeof b.admin === "boolean" && b.admin !== alvo.admin) {
        if (!b.admin && (await contarAdmins()) <= 1) return erro("É preciso manter pelo menos um administrador.");
        patch.admin = b.admin;
      }
      const novo = String(b.novo_email || "").trim().toLowerCase();
      if (novo && novo !== email) {
        if (email === eu.email) return erro("Para trocar o seu próprio e-mail, peça a outro administrador.");
        if (!emailOk(novo)) return erro("E-mail novo inválido.");
        const { data: ja } = await admin.from("autorizados").select("email").eq("email", novo).maybeSingle();
        if (ja) return erro("O e-mail novo já tem acesso.");
        const id = await idPorEmail(email);
        if (id) { const { error } = await admin.auth.admin.updateUserById(id, { email: novo, email_confirm: true }); if (error) return erro(error.message); }
        const { error: e1 } = await admin.from("autorizados").update({ ...patch, email: novo }).eq("email", email);
        if (e1) return erro(e1.message);
        // leva o novo e-mail para o histórico e as listas
        await admin.from("destinatarios").update({ email: novo }).eq("email", email);
        await admin.from("push_inscricoes").update({ email: novo }).eq("email", email);
        for (const col of ["criado_por", "atualizado_por"]) await admin.from("cocorretagens").update({ [col]: novo }).eq(col, email);
        await admin.from("parcelas").update({ pago_por: novo }).eq("pago_por", email);
        await admin.from("anexos").update({ enviado_por: novo }).eq("enviado_por", email);
        return json({ ok: true, email: novo });
      }
      if (!Object.keys(patch).length) return json({ ok: true, semMudanca: true });
      const { error } = await admin.from("autorizados").update(patch).eq("email", email);
      if (error) return erro(error.message);
      if (patch.nome) await admin.from("destinatarios").update({ nome: patch.nome }).eq("email", email);
      return json({ ok: true });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    console.error(e);
    return erro((e as Error).message, 500);
  }
});
