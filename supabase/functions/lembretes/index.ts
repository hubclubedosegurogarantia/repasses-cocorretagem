// Repasses de Cocorretagem · função "lembretes"
// Envia os lembretes de repasse por E-MAIL e por PUSH (celular/computador).
//   tipo "agenda" → chamado de hora em hora pelo banco (02_notificacoes.sql). Nos horários escolhidos (padrão 8h e 19h):
//                   · cobrança por parcela: 5 dias depois do vencimento do boleto (uma vez em cada horário)
//                   · penúltimo dia do mês: "verifique se faltou alguma pendência" (sempre)
//                   · outros dias escolhidos (opcional): pendências do mês, só se houver algo em aberto
//                   · último dia do mês, às 19h: "baixe o relatório mensal" (sempre)
//   tipo "teste"  → botão "Enviar teste agora" do app; manda o resumo atual só para quem clicou
//
// Secrets (Supabase → Edge Functions → Secrets):
//   CRON_SECRET                                   senha compartilhada com o banco
//   RESEND_API_KEY, EMAIL_FROM                    e-mail (resend.com)
//   APP_URL                                       endereço do app no GitHub Pages (link do e-mail)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   push (opcional)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem por padrão.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { assinar } from "../_shared/token.ts";
import { agoraBrasilia, ehDiaDeFechamento, ultimoDia, type ConfigLembretes } from "./regras.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const SUPABASE_URL = env("SUPABASE_URL");
const CRON_SECRET = env("CRON_SECRET");
const RESEND_API_KEY = env("RESEND_API_KEY");
const EMAIL_FROM = env("EMAIL_FROM") || "Repasses de Cocorretagem <onboarding@resend.dev>";
const APP_URL = env("APP_URL");
const PUSH_ON = !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY"));
if (PUSH_ON) webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:contato@clubedosegurogarantia.com.br", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

const admin = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function nomeMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// nome curto de uma corretora do grupo (ex.: "Nosso Porto")
const curto = (n: string) => n.replace(/\s+(LTDA|S\.?A\.?|ME|EPP)\.?$/i, "").replace(/\s+(ADMINISTRADORA\s+E\s+)?(CORRETORA|CORRETAGEM|COR)(\s+DE\s+(SEGUROS|SEG))?\.?$/i, "").trim()
  .toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
const mesCurto = (ym: string) => { const [y, m] = ym.split("-"); return `${m}/${y}`; };

// ------------------------------------------------------------------ dados
type Em = { id: string; nome: string; cnpj: string | null };
const fmtCnpj = (c: string | null) => c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : (c ?? "");
async function emissoras(): Promise<Em[]> {
  const { data, error } = await admin.from("emissoras").select("id, nome, cnpj").order("ordem").order("criado_em");
  if (error) throw error;
  return data ?? [];
}
async function emissoraPorId(id?: string | null): Promise<Em> {
  const todas = await emissoras();
  return todas.find((e) => e.id === id) ?? todas[0];
}
type Dir = "pagar" | "receber";
type Linha = { apolice: string; grupo: string | null; corretor: string; corretor_pix: string | null; tomador: string | null; valor: number; competencia: string; dir: Dir; parcela: string };
type Grupo = { corretor: string; pix: string; total: number; qtd: number; aguardando: number; itens: Linha[] };

type Cfg = ConfigLembretes & { avisar_nova_push: boolean; ultimo_fechamento: string | null; ultimo_atraso: string | null; avisos_venc?: boolean; avisos_dias?: number[]; horas?: number[]; pendencias_fim_mes?: boolean; relatorio_fim_mes?: boolean; hora_relatorio?: number };
async function carregarConfig(em: Em): Promise<Cfg> {
  const { data, error } = await admin.from("config_lembretes").select("*").eq("emissora_id", em.id).maybeSingle();
  if (error) throw error;
  return data ?? { dias: [], hora: 8, antecipar_fds: true, atraso_dia_semana: null, avisar_nova_push: true, ultimo_fechamento: null, ultimo_atraso: null, avisos_venc: true, avisos_dias: [5], horas: [8, 19], pendencias_fim_mes: true, relatorio_fim_mes: true, hora_relatorio: 19 };
}
function agrupar(linhas: Linha[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const l of linhas) {
    const k = (l.corretor || "").trim().toLowerCase();
    const g = m.get(k) ?? { corretor: l.corretor, pix: "", total: 0, qtd: 0, aguardando: 0, itens: [] };
    g.total += Number(l.valor || 0); g.qtd++;
    if (l.corretor_pix) g.pix = l.corretor_pix; g.itens.push(l); m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
type Bloco = { linhas: Linha[]; total: number; grupos: Grupo[] };
const soma = (l: Linha[]) => l.reduce((a, d) => a + Number(d.valor || 0), 0);
const bloco = (l: Linha[]): Bloco => ({ linhas: l, total: soma(l), grupos: agrupar(l) });
// Parcelas em aberto do painel. Quando a emissora é a líder, ela PAGA a parceira;
// quando a parceira é a líder, a emissora RECEBE da parceira.
async function resumo(em: Em, ym: string) {
  const { data, error } = await admin.from("parcelas")
    .select("numero, valor, competencia, vencimento, cocorretagens!inner(apolice, corretor, corretor_pix, tomador, lider, parcelas_qtd, emissora_id, emitida_por)")
    .eq("pago", false).eq("cocorretagens.emissora_id", em.id);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  const abertas: Linha[] = (data ?? []).map((p: any) => {
    const c = Array.isArray(p.cocorretagens) ? p.cocorretagens[0] : p.cocorretagens;
    return {
      apolice: c.apolice, grupo: c.emitida_por ?? null, corretor: c.corretor, corretor_pix: c.corretor_pix, tomador: c.tomador,
      valor: Number(p.valor || 0), competencia: p.vencimento ? String(p.vencimento).slice(0, 7) : p.competencia,
      dir: c.lider === "parceira" ? "receber" : "pagar", parcela: (c.parcelas_qtd || 1) > 1 ? `${p.numero}/${c.parcelas_qtd}` : "",
    };
  });
  const de = (dir: Dir, f: (l: Linha) => boolean) => bloco(abertas.filter((l) => l.dir === dir && f(l)));
  const mes = (l: Linha) => l.competencia === ym, atraso = (l: Linha) => l.competencia < ym;
  const pagarMes = de("pagar", mes), receberMes = de("receber", mes), pagarAtraso = de("pagar", atraso), receberAtraso = de("receber", atraso);
  return { em, ym, pagarMes, receberMes, pagarAtraso, receberAtraso,
    nMes: pagarMes.linhas.length + receberMes.linhas.length, nAtraso: pagarAtraso.linhas.length + receberAtraso.linhas.length };
}
type Resumo = Awaited<ReturnType<typeof resumo>>;
// tipos de aviso que cada pessoa escolhe receber (por e-mail e no celular) em Notificações
type TipoAviso = "cobrancas" | "pendencias" | "relatorio";
async function destinatariosEmail(em: Em, tipo: TipoAviso, soEmail?: string) {
  if (soEmail) return [soEmail.toLowerCase()];
  const { data: todos, error } = await admin.from("destinatarios").select("email, email_tipos").eq("emissora_id", em.id);
  if (!error && todos && todos.length) return todos.filter((d) => (d.email_tipos ?? []).includes(tipo)).map((d) => d.email.toLowerCase());
  // lista vazia ou tabela ausente: usa a equipe autorizada
  const { data: aut } = await admin.from("autorizados").select("email");
  return (aut ?? []).map((a) => a.email.toLowerCase());
}

// ------------------------------------------------------------------ e-mail
function tabela(grupos: Grupo[], dir: Dir, comMes: boolean) {
  const th = 'style="text-align:left;padding:8px 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5A6679;border-bottom:1px solid #DCE1E8"';
  const td = 'style="padding:10px;border-bottom:1px solid #ECEFF3;font-size:14px;color:#0D1E36;vertical-align:top"';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
    <tr><th ${th}>Corretora parceira</th><th ${th}>Apólices</th><th ${th} align="right">${dir === "pagar" ? "A pagar" : "A receber"}</th></tr>
    ${grupos.map((g) => `<tr><td ${td}><b>${esc(g.corretor)}</b>
      </td>
      <td ${td}>${g.itens.map((i) => esc(i.apolice) + (i.grupo ? ` <span style="color:#8A6740;font-weight:600">(${esc(curto(i.grupo))})</span>` : "") + (i.parcela ? ` <span style="color:#5A6679">parc. ${esc(i.parcela)}</span>` : "") + (comMes ? "" : ` <span style="color:#5A6679">(${mesCurto(i.competencia)})</span>`)).join("<br>")}</td>
      <td ${td} align="right" style="padding:10px;border-bottom:1px solid #ECEFF3;font-size:14px;color:#0D1E36;vertical-align:top;white-space:nowrap"><b>${brl(g.total)}</b></td></tr>`).join("")}
  </table>`;
}
function secao(b: Bloco, rotulo: string, cor: string, dir: Dir, comMes: boolean) {
  if (!b.grupos.length) return "";
  return `<tr><td style="padding:14px 26px 4px"><div style="font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${cor};margin-bottom:6px">${esc(rotulo)} · ${brl(b.total)}</div>${tabela(b.grupos, dir, comMes)}</td></tr>`;
}
function emailHtml(r: Resumo, titulo: string, intro: string, soAtraso = false) {
  const mes = nomeMes(r.ym);
  return `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Poppins,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F5F7;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#022D5B;padding:22px 26px;border-bottom:3px solid #B99269">
      <div style="color:#C7A887;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">Clube do Seguro Garantia · ${esc(r.em.nome)}</div>
      <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:4px">${esc(titulo)}</div></td></tr>
    <tr><td style="padding:22px 26px 6px;color:#0D1E36;font-size:14px;line-height:1.55">${intro}</td></tr>
    ${soAtraso ? "" : secao(r.pagarMes, `A pagar às parceiras · ${mes}`, "#022D5B", "pagar", true)}
    ${soAtraso ? "" : secao(r.receberMes, `A receber das parceiras líderes · ${mes}`, "#8A6740", "receber", true)}
    ${secao(r.pagarAtraso, "Pagamentos em atraso", "#B0261E", "pagar", false)}
    ${secao(r.receberAtraso, "Recebimentos em atraso", "#B0261E", "receber", false)}
    ${APP_URL ? `<tr><td style="padding:22px 26px 8px"><a href="${esc(APP_URL)}" style="display:inline-block;background:#022D5B;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:9px">Abrir o controle de repasses</a></td></tr>` : ""}
    <tr><td style="padding:16px 26px 24px;color:#5A6679;font-size:12px">Cocorretagens de ${esc(r.em.nome)}${r.em.cnpj ? " · CNPJ " + fmtCnpj(r.em.cnpj) : ""}. Valores por parcela do prêmio.<br>Especialistas em Seguro Garantia. Parceiros do corretor de seguros.<br>Para deixar de receber este e-mail, abra o app → Notificações.</td></tr>
  </table></td></tr></table></body></html>`;
}
function emailTexto(r: Resumo, titulo: string, soAtraso = false) {
  const linhas = (gs: Grupo[]) => gs.map((g) => `- ${g.corretor}: ${brl(g.total)} (${g.itens.map((i) => i.apolice + (i.grupo ? ` (${curto(i.grupo)})` : "") + (i.parcela ? ` parc. ${i.parcela}` : "")).join(", ")})`).join("\n");
  const sec = (b: Bloco, rot: string) => b.grupos.length ? `\n${rot} · ${brl(b.total)}\n${linhas(b.grupos)}` : "";
  return [titulo,
    soAtraso ? "" : sec(r.pagarMes, `A pagar às parceiras · ${nomeMes(r.ym)}`),
    soAtraso ? "" : sec(r.receberMes, `A receber das parceiras · ${nomeMes(r.ym)}`),
    sec(r.pagarAtraso, "Pagamentos em atraso"), sec(r.receberAtraso, "Recebimentos em atraso"),
    APP_URL ? `\nAbrir: ${APP_URL}` : ""].filter(Boolean).join("\n");
}
async function enviarEmail(para: string[], assunto: string, html: string, texto: string) {
  if (!RESEND_API_KEY) return { email: "desligado (falta RESEND_API_KEY)" };
  if (!para.length) return { email: "sem destinatários" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: para, subject: assunto, html, text: texto }),
  });
  if (!res.ok) { const t = await res.text(); console.error("resend", res.status, t); return { email: `falhou (${res.status})`, detalhe: t.slice(0, 300) }; }
  return { email: "enviado", para };
}

// ------------------------------------------------------------------ push
type Aviso = { title: string; body: string; tag: string; url?: string; actions?: { action: string; title: string }[]; baixa?: { api: string; t: string; k: string } };
// deno-lint-ignore no-explicit-any
type Inscricao = any;
const FN_BAIXA = `${SUPABASE_URL}/functions/v1/baixa`;
async function enviarPush(aviso: Aviso | ((s: Inscricao) => Promise<Aviso>), filtro?: { excetoEmail?: string; soEmail?: string }, tipo?: TipoAviso) {
  if (!PUSH_ON) return { push: "desligado" };
  let q = admin.from("push_inscricoes").select("*");
  if (filtro?.soEmail) q = q.eq("email", filtro.soEmail.toLowerCase());
  const { data: subs, error } = await q;
  if (error) throw error;
  // quem foi desligado do celular (ou tirado da lista) na página Notificações não recebe push
  let permitidos: Set<string> | null = null;
  if (!filtro?.soEmail) {
    const { data: ds, error: e2 } = await admin.from("destinatarios").select("email, push, push_tipos");
    if (!e2 && ds && ds.length) permitidos = new Set(ds.filter((d) => tipo ? (d.push_tipos ?? []).includes(tipo) : d.push !== false).map((d) => String(d.email).toLowerCase()));
  }
  const alvos = (subs ?? []).filter((s) => (!filtro?.excetoEmail || s.email.toLowerCase() !== filtro.excetoEmail.toLowerCase()) && (!permitidos || permitidos.has(s.email.toLowerCase())));
  let ok = 0;
  await Promise.all(alvos.map(async (s) => {
    try {
      const payload = typeof aviso === "function" ? await aviso(s) : aviso;
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_inscricoes").delete().eq("id", s.id);
      else console.error("push falhou", code, (e as Error).message);
    }
  }));
  return { push: `${ok}/${alvos.length} aparelhos` };
}

async function registrar(em: Em, tipo: string, titulo: string, resumo: string, r: Record<string, unknown>) {
  const { error } = await admin.from("notificacoes_log").insert({
    emissora_id: em.id, tipo, titulo, resumo, email: (r.email as string) ?? null, push: (r.push as string) ?? null,
    destinatarios: Array.isArray(r.para) ? r.para : null,
  });
  if (error) console.error("log", error.message);
}

// ------------------------------------------------------------------ lembretes
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
async function lembreteFechamento(em: Em, ym: string, opts: { soEmail?: string; teste?: boolean } = {}) {
  const r = await resumo(em, ym);
  if (!r.nMes && !r.nAtraso && !opts.teste) return { fechamento: "nada pendente" };
  const P = r.pagarMes, R = r.receberMes;
  const atrasoP = r.pagarAtraso.total, atrasoR = r.receberAtraso.total;
  const titulo = `Cocorretagens de ${nomeMes(ym)} · ${em.nome}`;
  const partes: string[] = [];
  if (P.linhas.length) partes.push(`<b>pagar ${brl(P.total)}</b> a ${plural(P.grupos.length, "corretora parceira", "corretoras parceiras")} (${plural(P.linhas.length, "parcela", "parcelas")})`);
  if (R.linhas.length) partes.push(`<b>receber ${brl(R.total)}</b> de ${plural(R.grupos.length, "parceira líder", "parceiras líderes")} (${plural(R.linhas.length, "parcela", "parcelas")})`);
  const atrasoTxt = [atrasoP ? `${brl(atrasoP)} a pagar` : "", atrasoR ? `${brl(atrasoR)} a receber` : ""].filter(Boolean).join(" e ");
  const intro = partes.length
    ? `Chegou o dia de acertar as cocorretagens desta competência: ${partes.join(" e ")}.` + (atrasoTxt ? ` De meses anteriores ainda há <b style="color:#B0261E">${atrasoTxt}</b>.` : "")
    : atrasoTxt ? `Nada desta competência, mas ainda há <b style="color:#B0261E">${atrasoTxt}</b> de meses anteriores.`
    : "Nada pendente no momento. Este é um envio de teste.";
  const resumoTxt = [P.total ? `pagar ${brl(P.total)}` : "", R.total ? `receber ${brl(R.total)}` : "", atrasoTxt ? `atraso: ${atrasoTxt}` : ""].filter(Boolean).join(" · ") || "nada pendente";
  const assunto = `${opts.teste ? "[Teste] " : ""}${titulo}: ${resumoTxt}`;
  const para = await destinatariosEmail(em, "pendencias", opts.soEmail);
  const email = await enviarEmail(para, assunto, emailHtml(r, titulo, intro), emailTexto(r, titulo));
  const push = await enviarPush({
    title: `${opts.teste ? "[Teste] " : ""}${titulo}`,
    body: r.nMes || r.nAtraso ? resumoTxt.charAt(0).toUpperCase() + resumoTxt.slice(1) : "Nada pendente. Tudo certo com as notificações.",
    tag: "fechamento",
  }, opts.soEmail ? { soEmail: opts.soEmail } : undefined, "pendencias");
  await registrar(em, opts.teste ? "teste" : "fechamento", (opts.teste ? "[Teste] " : "") + titulo, resumoTxt, { ...email, ...push });
  return { fechamento: "enviado", ...email, ...push };
}
// Penúltimo dia do mês: "verifique se faltou alguma pendência" (sai sempre, mesmo sem nada em aberto)
async function lembretePendencias(em: Em, ym: string, hora: number, opts: { soEmail?: string; teste?: boolean } = {}) {
  const T = opts.teste ? "[Teste] " : "";
  const r = await resumo(em, ym);
  const P = r.pagarMes.total + r.pagarAtraso.total, R = r.receberMes.total + r.receberAtraso.total;
  const titulo = `Faltou alguma pendência em ${nomeMes(ym)}?`;
  const intro = (r.nMes || r.nAtraso
    ? `O mês está acabando. Ainda em aberto: <b>${brl(P)} a pagar</b> às parceiras e <b>${brl(R)} a receber</b> das parceiras líderes, em ${plural(r.nMes + r.nAtraso, "parcela", "parcelas")}. Dê baixa no que já foi pago ou recebido e cobre o que falta.`
    : `O mês está acabando e não há nenhuma parcela em aberto.`)
    + ` Confira também se todas as apólices do mês foram lançadas no app.`;
  const resumoTxt = r.nMes || r.nAtraso ? `em aberto: pagar ${brl(P)} · receber ${brl(R)}` : "nada em aberto · confira se lançou todas as apólices";
  const email = await enviarEmail(await destinatariosEmail(em, "pendencias", opts.soEmail), `${T}${titulo} · ${resumoTxt}`, emailHtml(r, T + titulo, intro), emailTexto(r, T + titulo));
  const push = await enviarPush({ title: T + titulo, body: resumoTxt.charAt(0).toUpperCase() + resumoTxt.slice(1), tag: `pendencias-${hora}`, url: APP_URL ? `${APP_URL}#repasses` : undefined }, opts.soEmail ? { soEmail: opts.soEmail } : undefined, "pendencias");
  await registrar(em, opts.teste ? "teste" : "pendencias", T + titulo, resumoTxt, { ...email, ...push });
  return { pendencias: "enviado", ...email, ...push };
}
// Último dia do mês: "baixe o relatório mensal"
async function lembreteRelatorio(em: Em, ym: string, opts: { soEmail?: string; teste?: boolean } = {}) {
  const titulo = `${opts.teste ? "[Teste] " : ""}Baixe o relatório de ${nomeMes(ym)}`;
  const link = APP_URL ? `${APP_URL}#relatorios` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Poppins,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F5F7;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#022D5B;padding:22px 26px;border-bottom:3px solid #B99269"><div style="color:#C7A887;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">Clube do Seguro Garantia · ${esc(em.nome)}</div>
      <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:4px">${esc(titulo)}</div></td></tr>
    <tr><td style="padding:22px 26px 6px;color:#0D1E36;font-size:14px;line-height:1.55">Último dia do mês. Abra <b>Relatórios</b> no app e baixe o relatório mensal de comissões em PDF ou Excel para arquivar.</td></tr>
    ${link ? `<tr><td style="padding:16px 26px 8px"><a href="${esc(link)}" style="display:inline-block;background:#022D5B;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:9px">Abrir Relatórios</a></td></tr>` : ""}
    <tr><td style="padding:16px 26px 24px;color:#5A6679;font-size:12px">Para deixar de receber este e-mail, abra o app → Notificações.</td></tr>
  </table></td></tr></table></body></html>`;
  const texto = [titulo, "", "Último dia do mês. Abra Relatórios no app e baixe o relatório mensal de comissões (PDF ou Excel).", link ? `\nAbrir: ${link}` : ""].join("\n");
  const email = await enviarEmail(await destinatariosEmail(em, "relatorio", opts.soEmail), titulo, html, texto);
  const push = await enviarPush({ title: titulo, body: "Último dia do mês: baixe o relatório mensal em Relatórios.", tag: "relatorio", url: link || undefined }, opts.soEmail ? { soEmail: opts.soEmail } : undefined, "relatorio");
  await registrar(em, opts.teste ? "teste" : "relatorio", titulo, "relatório mensal", { ...email, ...push });
  return { relatorio: "enviado", ...email, ...push };
}
// ------------------------------------------------------------------ avisos por vencimento
// A comissão cai na conta da corretora líder ~1 dia depois do vencimento de cada parcela do prêmio.
// Cobra 1 dia depois do vencimento do boleto (quando a comissão cai) e 5 dias depois (padrão 1 e 5), em dia útil:
// "Pagou X?" (a emissora é a líder) ou "Recebeu de X?" (a parceira é a líder).
const addDias = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaUtil = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); const w = d.getUTCDay(); if (w === 6) d.setUTCDate(d.getUTCDate() + 2); else if (w === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const dataBR = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
type Av = { tk?: string; pid: string; dias: number; todos: number[]; data: string; dir: Dir; apolice: string; grupo: string | null; corretor: string; seguradora: string | null; valor: number; vencimento: string; parcela: string };
function pergunta(a: Av) {
  const nome = curtoNome(a.corretor);
  if (a.dias === 0) return a.dir === "pagar" ? `Vence hoje: a comissão cai amanhã. Separe o repasse de ${nome}` : `Vence hoje: ${nome} recebe a comissão amanhã e deve repassar a nossa parte`;
  if (a.dias <= 1) {
    const cai = addDias(a.vencimento, 1);
    const q = cai === a.data ? "a comissão cai hoje" : cai > a.data ? `a comissão cai em ${dataBR(cai).slice(0, 5)}` : `a comissão caiu em ${dataBR(cai).slice(0, 5)}`;
    return a.dir === "pagar" ? `Pagar ${nome}: ${q}` : `Cobrar ${nome}: ${q}`;
  }
  return a.dir === "pagar" ? `Pagou ${nome}?` : `Recebeu de ${nome}? Se não, cobre a corretora.`;
}
const curtoNome = (n: string) => curto(n || "a parceira");
function linhaAv(a: Av) {
  return `${a.apolice}${a.grupo ? ` (${curto(a.grupo)})` : ""}${a.parcela ? ` · parcela ${a.parcela}` : ""} · ${a.dias === 0 ? "vence" : "venceu"} em ${dataBR(a.vencimento)}${a.seguradora ? ` · ${a.seguradora}` : ""}`;
}
async function avisosVencimento(em: Em, now: ReturnType<typeof agoraBrasilia>, cfg: Cfg, opts: { soEmail?: string; teste?: boolean } = {}) {
  const H = now.hora;
  if (cfg.avisos_venc === false && !opts.teste) return { avisos: "desligados" };
  const dias = [...new Set((cfg.avisos_dias && cfg.avisos_dias.length ? cfg.avisos_dias : [5]).map(Number))].sort((a, b) => a - b);
  const { data, error } = await admin.from("parcelas")
    .select("id, numero, valor, vencimento, cocorretagens!inner(apolice, corretor, seguradora, lider, parcelas_qtd, emissora_id, emitida_por)")
    .eq("pago", false).not("vencimento", "is", null).gte("vencimento", addDias(now.iso, -75)).eq("cocorretagens.emissora_id", em.id);
  if (error) throw error;
  const rows = data ?? [];
  const pids = rows.map((p: { id: string }) => p.id);
  const feito = new Set<string>(), algum = new Set<string>();
  if (pids.length && !opts.teste) {
    const { data: ja } = await admin.from("avisos_parcela").select("parcela_id, dias, hora").in("parcela_id", pids);
    (ja ?? []).forEach((x: { parcela_id: string; dias: number; hora: number }) => {
      algum.add(`${x.parcela_id}:${x.dias}`);
      if (x.hora === 0) feito.add(`${x.parcela_id}:${x.dias}:*`); else feito.add(`${x.parcela_id}:${x.dias}:${x.hora}`);
    });
  }
  const jaFoi = (pid: string, n: number) => feito.has(`${pid}:${n}:*`) || feito.has(`${pid}:${n}:${H}`);
  const limite = addDias(now.iso, opts.teste ? -30 : -7); // recupera avisos de dias em que a função não rodou
  const itens: Av[] = [];
  // deno-lint-ignore no-explicit-any
  for (const p of rows as any[]) {
    const c = Array.isArray(p.cocorretagens) ? p.cocorretagens[0] : p.cocorretagens;
    // no dia certo: sai em cada horário; dia perdido (função fora do ar, apólice lançada depois): sai uma vez só
    const devidos = dias.filter((n) => { const alvo = diaUtil(addDias(p.vencimento, n)); if (alvo > now.iso || alvo < limite || jaFoi(p.id, n)) return false;
      return alvo === now.iso || opts.teste || !algum.has(`${p.id}:${n}`); });
    if (!devidos.length) continue;
    const n = Math.max(...devidos); // se atrasou mais de um, manda só o mais recente
    itens.push({
      pid: p.id, dias: n, todos: devidos, data: now.iso, dir: c.lider === "parceira" ? "receber" : "pagar", apolice: c.apolice, grupo: c.emitida_por ?? null,
      corretor: c.corretor, seguradora: c.seguradora, valor: Number(p.valor || 0), vencimento: String(p.vencimento).slice(0, 10),
      parcela: (c.parcelas_qtd || 1) > 1 ? `${p.numero}/${c.parcelas_qtd}` : "",
    });
  }
  if (!itens.length && opts.teste) {
    // teste sem cobrança no dia: usa até 3 parcelas em aberto (as já vencidas primeiro) só para mostrar o modelo do e-mail
    // deno-lint-ignore no-explicit-any
    const ab = (rows as any[]).slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    const ord = [...ab.filter((p) => String(p.vencimento) <= now.iso).reverse(), ...ab.filter((p) => String(p.vencimento) > now.iso)].slice(0, 3);
    for (const p of ord) {
      const c = Array.isArray(p.cocorretagens) ? p.cocorretagens[0] : p.cocorretagens;
      itens.push({ pid: p.id, dias: 5, todos: [5], data: now.iso, dir: c.lider === "parceira" ? "receber" : "pagar", apolice: c.apolice, grupo: c.emitida_por ?? null,
        corretor: c.corretor, seguradora: c.seguradora, valor: Number(p.valor || 0), vencimento: String(p.vencimento).slice(0, 10),
        parcela: (c.parcelas_qtd || 1) > 1 ? `${p.numero}/${c.parcelas_qtd}` : "" });
    }
  }
  if (!itens.length) return { avisos: "nada hoje" };
  const vence = itens.filter((a) => a.dias === 0), pagou = itens.filter((a) => a.dias > 0 && a.dir === "pagar"), recebeu = itens.filter((a) => a.dias > 0 && a.dir === "receber");
  const partes = [pagou.length ? `${pagou.length} a pagar` : "", recebeu.length ? `${recebeu.length} a cobrar` : "", vence.length ? `${vence.length} vencendo hoje` : ""].filter(Boolean);
  const titulo = `${opts.teste ? "[Teste] " : ""}Cobranças de hoje`;
  for (const a of itens) a.tk = await assinar(a.pid, opts.soEmail || "e-mail");
  const lista = (l: Av[], cor: string, rot: string) => !l.length ? "" : `<tr><td style="padding:14px 26px 4px"><div style="font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${cor};margin-bottom:8px">${esc(rot)}</div>
    ${l.map((a) => `<div style="padding:10px 12px;border:1px solid #ECEFF3;border-radius:8px;margin-bottom:8px"><div style="font-size:15px;font-weight:600;color:#0D1E36">${esc(pergunta(a))} <span style="float:right;white-space:nowrap;color:${a.dir === "pagar" ? "#022D5B" : "#8A6740"}">${brl(a.valor)}</span></div><div style="font-size:12px;color:#5A6679;margin-top:3px">${esc(linhaAv(a))}</div>${a.tk && APP_URL ? `<div style="margin-top:9px"><a href="${esc(APP_URL)}#baixa=${a.tk}" style="display:inline-block;background:${a.dir === "pagar" ? "#022D5B" : "#B99269"};color:${a.dir === "pagar" ? "#ffffff" : "#00214C"};text-decoration:none;font-weight:600;font-size:13px;padding:8px 14px;border-radius:7px">${a.dir === "pagar" ? "Já paguei" : "Já recebi"}</a></div>` : ""}</div>`).join("")}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Poppins,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F5F7;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#022D5B;padding:22px 26px;border-bottom:3px solid #B99269"><div style="color:#C7A887;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">Clube do Seguro Garantia · ${esc(em.nome)}</div>
      <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:4px">${esc(titulo)}</div></td></tr>
    <tr><td style="padding:20px 26px 4px;color:#0D1E36;font-size:14px;line-height:1.55">A comissão cai na conta da corretora líder um dia depois do vencimento de cada parcela. Hoje: <b>${esc(partes.join(", "))}</b>. Depois de pagar ou receber, toque em <b>Já paguei</b> ou <b>Já recebi</b> e as cobranças daquela parcela param.${opts.teste ? " <i>(Teste: os botões dão baixa de verdade.)</i>" : ""}</td></tr>
    ${lista(pagou, "#022D5B", "Pagar à parceira")}${lista(recebeu, "#8A6740", "Cobrar da parceira")}${lista(vence, "#3A5877", "Vencem hoje")}
    ${APP_URL ? `<tr><td style="padding:18px 26px 8px"><a href="${esc(APP_URL)}#notificacoes" style="display:inline-block;background:#022D5B;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:9px">Confirmar no app</a></td></tr>` : ""}
    <tr><td style="padding:16px 26px 24px;color:#5A6679;font-size:12px">Cobranças às ${horasDe(cfg).map((h) => h + "h").join(" e ")}, ${dias.map((n) => n === 0 ? "no dia do vencimento" : `${n} dia${n > 1 ? "s" : ""} depois do vencimento`).join(" e ")}, em dia útil. Ajuste em Notificações.</td></tr>
  </table></td></tr></table></body></html>`;
  const texto = [titulo, "", ...itens.map((a) => `- ${pergunta(a)} ${brl(a.valor)} · ${linhaAv(a)}`), APP_URL ? `\nConfirmar: ${APP_URL}#notificacoes` : ""].join("\n");
  const assunto = `${titulo}: ${partes.join(", ")}`;
  const email = await enviarEmail(await destinatariosEmail(em, "cobrancas", opts.soEmail), assunto, html, texto);
  const url = APP_URL ? `${APP_URL}#notificacoes` : undefined;
  const filtro = opts.soEmail ? { soEmail: opts.soEmail } : undefined;
  let push: Record<string, unknown>;
  if (itens.length <= 3) {
    const res = [];
    for (const a of itens) {
      res.push((await enviarPush(async (s: Inscricao) => {
        const t = await assinar(a.pid, String(s.email || "push").toLowerCase());
        return {
          title: `${opts.teste ? "[Teste] " : ""}${pergunta(a)}`, body: `${brl(a.valor)} · ${linhaAv(a)}`, tag: `venc-${a.pid}-${a.dias}-${H}`,
          url: APP_URL ? `${APP_URL}#baixa=${t}` : url,
          actions: [{ action: "baixa", title: a.dir === "pagar" ? "Já paguei" : "Já recebi" }],
          baixa: { api: FN_BAIXA, t, k: env("SUPABASE_ANON_KEY") },
        };
      }, filtro, "cobrancas")).push);
    }
    push = { push: res.join(" | ") };
  } else {
    const nomes = (l: Av[]) => { const n = [...new Set(l.map((a) => curtoNome(a.corretor)))]; return n.length > 1 ? n.slice(0, -1).join(", ") + " e " + n[n.length - 1] : n[0]; };
    const corpo = [pagou.length ? `Pagar ${nomes(pagou)}` : "", recebeu.length ? `Cobrar ${nomes(recebeu)}` : "", vence.length ? `Vencem hoje: ${nomes(vence)}` : ""].filter(Boolean).join(" · ");
    push = await enviarPush({ title: `${titulo}: ${partes.join(", ")}`, body: corpo, tag: "vencimentos", url }, filtro, "cobrancas");
  }
  if (!opts.teste) {
    const regs = itens.flatMap((a) => a.todos.map((n) => ({ parcela_id: a.pid, dias: n, hora: H })));
    const { error: e2 } = await admin.from("avisos_parcela").upsert(regs, { onConflict: "parcela_id,dias,hora", ignoreDuplicates: true });
    if (e2) console.error("avisos_parcela", e2.message);
  }
  await registrar(em, opts.teste ? "teste" : "vencimento", titulo, partes.join(" · "), { ...email, ...push });
  return { avisos: "enviado", itens: itens.length, ...email, ...push };
}
const horasDe = (cfg: Cfg) => [...new Set((cfg.horas && cfg.horas.length ? cfg.horas : [8, 19]).map(Number))].sort((a, b) => a - b);
// marca um envio do calendário; devolve false se ele já tinha saído (evita repetir quando a função roda duas vezes)
async function primeiraVez(em: Em, chave: string) {
  const { error } = await admin.from("envios_agenda").insert({ emissora_id: em.id, chave });
  if (!error) return true;
  if (error.code !== "23505") console.error("envios_agenda", error.message);
  return false;
}
async function agenda() {
  const now = agoraBrasilia();
  const out: Record<string, unknown>[] = [];
  const ult = ultimoDia(now.ano, now.mes);
  for (const em of await emissoras()) {
    const cfg = await carregarConfig(em);
    const horas = horasDe(cfg), hRel = Number(cfg.hora_relatorio ?? 19);
    const naHora = horas.includes(now.hora);
    if (!naHora && now.hora !== hRel) { out.push({ painel: em.nome, acao: "fora do horário" }); continue; }
    const r: Record<string, unknown> = { painel: em.nome };
    if (naHora) {
      if (cfg.pendencias_fim_mes !== false && now.dia === ult - 1 && await primeiraVez(em, `pendencias:${now.iso}:${now.hora}`))
        r.pendencias = await lembretePendencias(em, now.ym, now.hora);
      else if (ehDiaDeFechamento(now.ano, now.mes, now.dia, cfg) && await primeiraVez(em, `fechamento:${now.iso}:${now.hora}`))
        r.fechamento = await lembreteFechamento(em, now.ym);
      r.vencimentos = await avisosVencimento(em, now, cfg);
    }
    if (cfg.relatorio_fim_mes !== false && now.hora === hRel && now.dia === ult && await primeiraVez(em, `relatorio:${now.iso}`))
      r.relatorio = await lembreteRelatorio(em, now.ym);
    out.push(r);
  }
  return { agora: now, paineis: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corpo = await req.json().catch(() => ({}));

    if (corpo.tipo === "teste") {   // vem do app: exige login de alguém autorizado
      const userClient = createClient(SUPABASE_URL, env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
      });
      const { data: u } = await userClient.auth.getUser();
      const email = u.user?.email?.toLowerCase();
      if (!email) return json({ erro: "não autenticado" }, 401);
      const { data: ok } = await admin.from("autorizados").select("nome").eq("email", email).maybeSingle();
      if (!ok) return json({ erro: "não autorizado" }, 403);
      const em = await emissoraPorId(corpo.emissora_id);
      // os 3 e-mails da rotina, só para quem clicou: cobranças, pendências do fim do mês e relatório
      const agora = agoraBrasilia(), o = { soEmail: email, teste: true };
      const cobrancas = await avisosVencimento(em, agora, await carregarConfig(em), o);
      const pendencias = await lembretePendencias(em, agora.ym, agora.hora, o);
      const relatorio = await lembreteRelatorio(em, agora.ym, o);
      return json({ cobrancas, pendencias, relatorio });
    }

    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ erro: "não autorizado" }, 401);
    if (corpo.tipo === "agenda") return json(await agenda());
    if (corpo.tipo === "nova") return json({ ignorado: "aviso de nova apólice desligado" });
    return json({ erro: "tipo desconhecido" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: (e as Error).message }, 500);
  }
});
