// Repasses de Cocorretagem · função "baixa"
// Dá baixa (pago/recebido) numa parcela a partir do botão "Já paguei / Já recebi" do e-mail ou do push.
// Não exige login: quem autoriza é o token assinado que vai no aviso (vale 60 dias e serve só para aquela parcela).
// Publicar com:  npx supabase functions deploy baixa --no-verify-jwt
//
// Corpo (POST JSON): { t: "<token>", acao: "ver" | "confirmar" | "desfazer" }

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { verificar } from "../_shared/token.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const hojeBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const tok = await verificar(String(b.t || ""));
    if (!tok) return json({ erro: "Link inválido ou vencido. Abra o app para dar baixa." }, 401);
    const { data: p, error } = await admin.from("parcelas")
      .select("id, numero, valor, vencimento, pago, data_pagamento, pago_por, cocorretagens!inner(apolice, corretor, seguradora, lider, parcelas_qtd, emissora_id, emitida_por)")
      .eq("id", tok.p).maybeSingle();
    if (error) throw error;
    if (!p) return json({ erro: "Esta parcela não existe mais." }, 404);
    // deno-lint-ignore no-explicit-any
    const c: any = Array.isArray(p.cocorretagens) ? p.cocorretagens[0] : p.cocorretagens;
    const dir = c.lider === "parceira" ? "receber" : "pagar";
    const info = {
      apolice: c.apolice, corretor: c.corretor, seguradora: c.seguradora, emitida_por: c.emitida_por, dir,
      valor: Number(p.valor || 0), vencimento: p.vencimento, parcela: (c.parcelas_qtd || 1) > 1 ? `${p.numero}/${c.parcelas_qtd}` : "",
      pago: !!p.pago, data_pagamento: p.data_pagamento,
    };
    const acao = String(b.acao || "ver");
    if (acao === "ver") return json(info);

    const quem = tok.e || "aviso";
    const verbo = dir === "pagar" ? "Pagamento" : "Recebimento";
    if (acao === "confirmar") {
      if (p.pago) return json({ ...info, ja: true });
      const dt = hojeBrasilia();
      const { error: e2 } = await admin.from("parcelas").update({ pago: true, data_pagamento: dt, pago_por: quem }).eq("id", p.id).eq("pago", false);
      if (e2) throw e2;
      await admin.from("notificacoes_log").insert({ emissora_id: c.emissora_id, tipo: "baixa", titulo: `${verbo} registrado pelo aviso`, resumo: `${c.corretor} · ${brl(info.valor)} · apólice ${c.apolice}${info.parcela ? ` parc. ${info.parcela}` : ""} · por ${quem}` });
      return json({ ...info, pago: true, data_pagamento: dt, ok: true });
    }
    if (acao === "desfazer") {
      if (!p.pago) return json({ ...info, ok: true });
      if (p.pago_por !== quem) return json({ erro: "Esta baixa foi feita por outra pessoa. Para desfazer, abra o app." }, 409);
      const { error: e3 } = await admin.from("parcelas").update({ pago: false, data_pagamento: null, pago_por: null }).eq("id", p.id);
      if (e3) throw e3;
      await admin.from("notificacoes_log").insert({ emissora_id: c.emissora_id, tipo: "baixa", titulo: `${verbo} desfeito pelo aviso`, resumo: `${c.corretor} · ${brl(info.valor)} · apólice ${c.apolice} · por ${quem}` });
      return json({ ...info, pago: false, data_pagamento: null, ok: true });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: (e as Error).message }, 500);
  }
});
