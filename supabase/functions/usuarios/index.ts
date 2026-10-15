// Repasses de Cocorretagem · função "usuarios"
// Gestão de acessos pela página Configurações. Só administradores podem alterar.
// Ações (campo "acao" no corpo):
//   listar                                  → pessoas autorizadas + último acesso (qualquer autorizado)
//   criar         {email, nome, admin, recebe_email, convite?, senha?}
//                 convite=true: manda pelo Resend o link para a pessoa criar a própria senha
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
        admin.from("autorizados").select("email, nome, admin, criado_em").order("nome"),
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
      const convite = !!b.convite;
      const senha = convite ? crypto.randomUUID() + crypto.randomUUID() : String(b.senha || "");
      if (!emailOk(email)) return erro("E-mail inválido.");
      if (!nome) return erro("Informe o nome.");
      if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
      if (convite && !env("RESEND_API_KEY")) return erro("O e-mail ainda não está configurado (falta RESEND_API_KEY). Use uma senha inicial.");
      const { data: ja } = await admin.from("autorizados").select("email").eq("email", email).maybeSingle();
      if (ja) return erro("Este e-mail já tem acesso.");
      const existente = await idPorEmail(email);
      if (existente) {
        const { error } = await admin.auth.admin.updateUserById(existente, { password: senha, email_confirm: true });
        if (error) return erro(error.message);
      } else {
        const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
        if (error) return erro(error.message);
      }
      const { error: e2 } = await admin.from("autorizados").insert({ email, nome, admin: !!b.admin });
      if (e2) return erro(e2.message);
      if (b.recebe_email !== false) {
        const { data: ems } = await admin.from("emissoras").select("id");
        if (ems?.length) await admin.from("destinatarios").upsert(ems.map((e) => ({ emissora_id: e.id, email, nome, fechamento: true, push: true })), { onConflict: "emissora_id,email" });
      }
      if (convite) {
        try { await enviarConvite(email, nome, true); }
        catch (e) { return json({ ok: true, convite: false, aviso: (e as Error).message }); }
      }
      return json({ ok: true, convite });
    }

    if (acao === "excluir") {
      if (email === eu.email) return erro("Você não pode excluir a própria conta.");
      const { data: alvo } = await admin.from("autorizados").select("admin").eq("email", email).maybeSingle();
      if (alvo?.admin && (await contarAdmins()) <= 1) return erro("É preciso manter pelo menos um administrador.");
      const id = await idPorEmail(email);
      if (id) { const { error } = await admin.auth.admin.deleteUser(id); if (error) return erro(error.message); }
      await admin.from("autorizados").delete().eq("email", email);
      await admin.from("push_inscricoes").delete().eq("email", email);
      return json({ ok: true });
    }

    if (acao === "definir_senha") {
      const senha = String(b.senha || "");
      if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
      const id = await idPorEmail(email);
      if (!id) {
        const { data: a } = await admin.from("autorizados").select("nome").eq("email", email).maybeSingle();
        if (!a) return erro("Pessoa não encontrada.");
        const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: a.nome } });
        if (error) return erro(error.message);
        return json({ ok: true, criado: true });
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
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
