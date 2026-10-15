// Token assinado para dar baixa em uma parcela direto do aviso (e-mail ou push).
// Formato: base64url(JSON {p: parcela_id, e: quem recebeu, x: expira em (ms)}) + "." + assinatura HMAC-SHA256.
// O segredo é o secret BAIXA_SECRET (ou, se não existir, o CRON_SECRET).

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function segredo() {
  const s = Deno.env.get("BAIXA_SECRET") || Deno.env.get("CRON_SECRET") || "";
  if (!s) throw new Error("Falta o secret BAIXA_SECRET (ou CRON_SECRET).");
  return s;
}
async function chave() {
  return await crypto.subtle.importKey("raw", enc.encode(segredo()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export type DadosToken = { p: string; e: string; x: number };

export async function assinar(parcelaId: string, quem: string, dias = 60): Promise<string> {
  const corpo = b64url(enc.encode(JSON.stringify({ p: parcelaId, e: quem, x: Date.now() + dias * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await chave(), enc.encode(corpo)));
  return `${corpo}.${b64url(sig)}`;
}

export async function verificar(token: string): Promise<DadosToken | null> {
  const [corpo, sig] = String(token || "").split(".");
  if (!corpo || !sig) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await chave(), deB64url(sig), enc.encode(corpo)); } catch { return null; }
  if (!ok) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as DadosToken;
    if (!d.p || !d.x || d.x < Date.now()) return null;
    return d;
  } catch { return null; }
}
