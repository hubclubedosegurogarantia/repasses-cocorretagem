// Repasses de Cocorretagem · função "ler-documento"
// Lê um documento anexado (apólice, endosso, boleto, comprovante) com o Claude
// e devolve os dados em formato estruturado para preencher o lançamento.
//
// Corpo: { path: "<caminho do arquivo no bucket documentos>" }
//    ou, para extrato de comissão da seguradora:
//        { tipo: "extrato", path } (PDF ou imagem) ou { tipo: "extrato", texto, nome } (planilha convertida em texto pelo app)
// Exige login de alguém autorizado.
//
// Secrets (Supabase → Edge Functions → Secrets):
// A IA é trocável. Use UM destes provedores:
//   OPENROUTER_API_KEY  chave de openrouter.ai (créditos pré-pagos; dá acesso a Claude, GPT, Gemini…)
//   IA_MODELO           opcional; modelo no OpenRouter, padrão anthropic/claude-sonnet-5.5
//                       (qualquer modelo de openrouter.ai/models que aceite arquivo)
// ou, direto na Anthropic:
//   ANTHROPIC_API_KEY   chave de console.anthropic.com
//   ANTHROPIC_MODEL     opcional; padrão claude-sonnet-5-5
// Se as duas chaves existirem, vale o OpenRouter.
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem por padrão.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "jsr:@std/encoding@1.0.5/base64";

const env = (k: string) => Deno.env.get(k) ?? "";
const SUPABASE_URL = env("SUPABASE_URL");
// tira espaços, quebras de linha e caracteres invisíveis que vêm ao colar
const limpa = (v: string) => v.replace(/[\s\u200B-\u200D\uFEFF]/g, "");
const OR_KEY = limpa(env("OPENROUTER_API_KEY"));
const ANT_KEY = limpa(env("ANTHROPIC_API_KEY"));
// só o final e o tamanho, para conferir com a lista de chaves sem expor a chave
const pista = (k: string) => k ? `terminada em "…${k.slice(-4)}", com ${k.length} caracteres` : "vazia";
const PROVEDOR = OR_KEY ? "openrouter" : ANT_KEY ? "anthropic" : "";
const MODEL = OR_KEY ? (env("IA_MODELO") || "anthropic/claude-sonnet-5.5") : (env("ANTHROPIC_MODEL") || env("IA_MODELO") || "claude-sonnet-5-5");
const APP_URL = env("APP_URL");
const admin = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const erro = (m: string, status = 400) => json({ erro: m }, status);

const MODALIDADES = [
  "Licitante", "Executante Construtor", "Executante Fornecedor", "Prestação de Serviços", "Adiantamento de Pagamentos",
  "Retenção de Pagamentos", "Judicial Cível", "Judicial Trabalhista", "Judicial Fiscal / Execução Fiscal", "Aduaneiro",
  "Imobiliário", "Parcelamento Administrativo", "Outra",
];

const txt = { type: ["string", "null"] };
const num = { type: ["number", "null"] };
const data = { type: ["string", "null"], description: "Data no formato AAAA-MM-DD" };
const doc = { type: ["string", "null"], description: "CNPJ ou CPF só com números" };

const FERRAMENTA = {
  name: "registrar_dados",
  description: "Registra os dados extraídos do documento de seguro garantia.",
  input_schema: {
    type: "object",
    properties: {
      tipo_documento: { type: "string", enum: ["apolice", "endosso", "boleto", "comprovante", "proposta", "nota_fiscal", "outro"] },
      numero_apolice: { ...txt, description: "Número da apólice dado pela seguradora (ou da apólice a que o endosso/boleto se refere)" },
      numero_apolice_susep: { ...txt, description: "Número da apólice no registro SUSEP, quando o documento traz um segundo número (geralmente mais longo, rotulado 'Apólice SUSEP', 'Nº SUSEP da apólice' ou 'Código SUSEP'). Só dígitos e pontuação como aparecem" },
      numero_endosso: txt,
      data_emissao: data,
      vigencia_inicio: data,
      vigencia_fim: data,
      seguradora_razao_social: txt,
      seguradora_cnpj: doc,
      corretora_razao_social: { ...txt, description: "Corretora principal (líder) que consta no documento" },
      corretora_cnpj: doc,
      corretoras: {
        type: "array",
        description: "Todas as corretoras que aparecem no documento, inclusive as de cocorretagem/co-corretagem",
        items: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Razão social como escrita" },
            cnpj: doc,
            susep: { ...txt, description: "Código SUSEP da corretora, só dígitos, sem zeros à esquerda" },
            lider: { type: ["boolean", "null"], description: "true se for a corretora líder/principal; false se for co-corretora; null se o documento não deixar claro" },
            participacao_pct: { ...num, description: "Percentual de participação na corretagem, se constar" },
          },
          required: ["nome"],
        },
      },
      parcelas: {
        type: "array",
        description: "Parcelas do prêmio, na ordem. Prêmio à vista = uma parcela. Vazio se o documento não mostrar o parcelamento",
        items: {
          type: "object",
          properties: { numero: { type: "integer" }, valor: num, vencimento: data },
          required: ["numero"],
        },
      },
      modalidade: { type: ["string", "null"], enum: [...MODALIDADES, null], description: "Modalidade de seguro garantia, escolhida da lista" },
      modalidade_texto: { ...txt, description: "Modalidade como escrita no documento" },
      tomador_nome: txt,
      tomador_cnpj: doc,
      segurado_nome: txt,
      segurado_cnpj: doc,
      importancia_segurada: num,
      premio_liquido: { ...num, description: "SEMPRE o prêmio LÍQUIDO: sem IOF, sem custo de apólice e sem adicional/juros de fracionamento. Nunca use o prêmio total aqui" },
      premio_total: num,
      iof: num,
      custo_apolice: num,
      adicional_fracionamento: { ...num, description: "Juros ou adicional de fracionamento, se houver" },
      comissao_percentual: { ...num, description: "Percentual de comissão/corretagem, se constar (ex.: 20 para 20%)" },
      comissao_valor: num,
      boleto_valor: num,
      boleto_vencimento: data,
      boleto_linha_digitavel: txt,
      campos_incertos: { type: "array", items: { type: "string" }, description: "Nomes dos campos acima em que você não tem certeza da leitura" },
      observacao: { ...txt, description: "Algo relevante que não coube nos campos, em uma frase curta" },
    },
    required: ["tipo_documento", "campos_incertos"],
  },
};

const INSTRUCOES = `Você lê documentos de Seguro Garantia emitidos no Brasil (apólices, endossos, boletos de prêmio, comprovantes, propostas e notas fiscais) para uma assessoria que controla repasses de cocorretagem.
Extraia os dados do documento e chame a ferramenta registrar_dados uma única vez. Responda SEMPRE chamando a ferramenta, nunca em texto.
Regras:
- Copie números e nomes exatamente como aparecem. Não invente: se um dado não constar, use null.
- Datas em AAAA-MM-DD. Valores em número, com ponto decimal (ex.: 12345.67), sem "R$".
- CNPJ/CPF só com dígitos.
- Prêmio: o que importa é SEMPRE o prêmio LÍQUIDO (antes de IOF, custo de apólice e adicional/juros de fracionamento). Copie o valor rotulado "Prêmio líquido". Se o documento só mostrar o total mas trouxer os componentes, calcule: líquido = total − IOF − custo de apólice − adicional de fracionamento, e liste "premio_liquido" em campos_incertos. Se não houver como chegar ao líquido, deixe premio_liquido nulo. Nunca coloque o total em premio_liquido.
- Escolha a modalidade da lista; se nenhuma servir, use "Outra" e escreva a original em modalidade_texto.
- Corretoras: liste todas em "corretoras". A líder é a que aparece como "corretora principal", "líder: sim", ou no quadro "Dados do corretor" quando as demais aparecem num quadro de cocorretagem/co-corretagem. Marque as que aparecem com "líder: não" ou como co-corretoras com lider=false. Se o documento mostrar uma corretora só (ex.: quadro "Código/Corretor"), ela é a líder (lider=true). Em corretora_razao_social/corretora_cnpj, repita a líder.
- Apólice: muitas seguradoras mostram dois números, o da seguradora e o do registro SUSEP. Coloque o da seguradora em numero_apolice e o SUSEP em numero_apolice_susep. Se houver um só, use numero_apolice.
- Parcelas: copie o quadro de parcelamento do prêmio (número, valor e vencimento). Prêmio à vista é uma parcela só. Num boleto ou carnê com várias fichas (ex.: "Parcela 001/004"), liste cada ficha em parcelas e use em numero_apolice o número do documento antes da barra (ex.: 1007500043935 em "1007500043935/00000000/001").
- Seguradora: use a razão social da seguradora emissora (no boleto, o beneficiário/cedente), não o banco.
- Liste em campos_incertos todo campo cuja leitura não esteja clara (texto cortado, borrado, ambíguo).`;

// ---- extrato de comissão (demonstrativo que a seguradora manda à corretora) ----
const FERRAMENTA_EXTRATO = {
  name: "registrar_extrato",
  description: "Registra as linhas de um extrato de comissão de corretagem enviado pela seguradora.",
  input_schema: {
    type: "object",
    properties: {
      seguradora_razao_social: txt,
      seguradora_cnpj: doc,
      corretora_nome: { ...txt, description: "Corretora que recebe a comissão (destinatária do extrato)" },
      corretora_cnpj: doc,
      data_pagamento: { ...data, description: "Data do crédito/pagamento das comissões, se constar" },
      periodo_texto: { ...txt, description: "Período ou referência do extrato como escrito (ex.: 'Outubro/2026', 'Lote 1234')" },
      total_comissao: { ...num, description: "Total BRUTO de comissão do extrato, antes de impostos retidos" },
      itens: {
        type: "array",
        description: "Uma entrada por linha de comissão (apólice/endosso/parcela). Não inclua linhas de total, subtotal ou impostos.",
        items: {
          type: "object",
          properties: {
            apolice: { type: "string", description: "Número da apólice como escrito" },
            endosso: txt,
            parcela: { type: ["integer", "null"], description: "Número da parcela do prêmio a que a comissão se refere" },
            parcelas_total: { type: ["integer", "null"], description: "Total de parcelas, se constar (ex.: 4 em '1/4')" },
            tomador: { ...txt, description: "Tomador / cliente / segurado da linha" },
            tomador_cnpj: doc,
            premio: { ...num, description: "Prêmio LÍQUIDO base de cálculo da comissão desta linha" },
            comissao_pct: { ...num, description: "Percentual de comissão (ex.: 30 para 30%)" },
            comissao_valor: { ...num, description: "Valor BRUTO da comissão da linha; negativo se for estorno" },
            data: { ...data, description: "Data da linha (pagamento do prêmio ou crédito), se houver" },
          },
          required: ["apolice"],
        },
      },
      campos_incertos: { type: "array", items: { type: "string" } },
      observacao: { ...txt, description: "Retenções (IR, ISS), estornos ou algo relevante, em uma frase curta" },
    },
    required: ["itens", "campos_incertos"],
  },
};

const INSTRUCOES_EXTRATO = `Você lê extratos de comissão de corretagem que seguradoras de Seguro Garantia mandam para uma corretora no Brasil.
Chame a ferramenta registrar_extrato uma única vez, com TODAS as linhas de comissão do extrato. Responda SEMPRE chamando a ferramenta, nunca em texto.
Regras:
- Uma entrada em "itens" para cada linha de comissão (apólice, endosso ou parcela). Ignore cabeçalhos, totais, subtotais e linhas de imposto.
- Copie o número da apólice exatamente como escrito. Se houver número de endosso, coloque em "endosso".
- Valores em número com ponto decimal, sem "R$". Percentuais como número (30 para 30%).
- comissao_valor é a comissão BRUTA da linha (antes de IR/ISS). Estorno ou cancelamento vai negativo.
- premio é o prêmio líquido usado como base da comissão naquela linha. Se só houver o prêmio total, deixe null e registre em campos_incertos.
- Parcela: "1/4", "Parc. 01 de 04" → parcela 1, parcelas_total 4. Se não constar, null.
- Datas em AAAA-MM-DD. CNPJ só com dígitos. Não invente: o que não constar fica null.
- Retenções (IR, ISS) e o valor líquido creditado vão em "observacao", em uma frase.`;

async function quemChama(req: Request) {
  const userClient = createClient(SUPABASE_URL, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data } = await userClient.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: a } = await admin.from("autorizados").select("email").eq("email", email).maybeSingle();
  return a ? email : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await quemChama(req))) return erro("não autorizado", 401);
    if (!PROVEDOR) return erro("A leitura por IA ainda não foi configurada: falta a chave da IA (OPENROUTER_API_KEY).", 503);
    const b = await req.json().catch(() => ({}));
    const extrato = b.tipo === "extrato";
    const path = String(b.path || "");
    const texto = typeof b.texto === "string" ? b.texto.slice(0, 200000) : "";

    if (extrato && texto) {
      return await chamarIA(INSTRUCOES_EXTRATO, FERRAMENTA_EXTRATO, [{ texto: `Extrato de comissão em planilha (${String(b.nome || "arquivo")}), convertido em texto (colunas separadas por ";"):\n\n${texto}` }, { texto: "Extraia as linhas de comissão deste extrato." }], 16000);
    }
    if (!path || path.includes("..")) return erro("Arquivo inválido.");

    const { data: arquivo, error: e1 } = await admin.storage.from("documentos").download(path);
    if (e1 || !arquivo) return erro("Não encontrei o arquivo no armazenamento.", 404);
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) return erro("Arquivo grande demais para leitura (máx. 20 MB).");
    const tipo = arquivo.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    const b64 = encodeBase64(bytes);

    let bloco: Parte;
    if (tipo === "application/pdf") bloco = { pdf: b64 };
    else if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(tipo)) bloco = { img: b64, tipo };
    else return erro("Só é possível ler PDF ou imagem.");

    if (extrato) return await chamarIA(INSTRUCOES_EXTRATO, FERRAMENTA_EXTRATO, [bloco, { texto: "Extraia as linhas de comissão deste extrato." }], 16000);
    return await chamarIA(INSTRUCOES, FERRAMENTA, [bloco, { texto: "Extraia os dados deste documento." }], 4096);
  } catch (e) {
    console.error(e);
    return erro((e as Error).message, 500);
  }
});

// ---- chamada à IA: OpenRouter (qualquer modelo) ou Anthropic direto ----
// plano B: se o modelo responder em texto em vez de usar a ferramenta, pega o JSON do texto
function jsonDoTexto(t: unknown): unknown {
  const s = Array.isArray(t) ? t.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : String(t ?? "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}
type Parte = { pdf?: string; img?: string; tipo?: string; texto?: string };
type Ferramenta = { name: string; description: string; input_schema: Record<string, unknown> };

function erroIA(status: number, msg: string) {
  const k = PROVEDOR === "openrouter" ? OR_KEY : ANT_KEY;
  if (status === 401 || status === 403) return erro(`A IA recusou a chave (${msg}). A chave em uso está ${pista(k)}${PROVEDOR === "openrouter" && !k.startsWith("sk-or-") ? " e deveria começar com sk-or-" : ""}. Confira se ela aparece em openrouter.ai, em API Keys.`, 502);
  if (status === 402) return erro("Os créditos da IA acabaram. Recarregue em openrouter.ai/credits e tente de novo.", 402);
  if (status === 429) return erro("Muitas leituras ao mesmo tempo. Tente de novo em instantes.", 429);
  return erro(`A IA não conseguiu ler: ${msg}`, 502);
}

async function chamarIA(system: string, f: Ferramenta, partes: Parte[], maxTokens: number) {
  return PROVEDOR === "openrouter" ? await viaOpenRouter(system, f, partes, maxTokens) : await viaAnthropic(system, f, partes, maxTokens);
}

async function viaOpenRouter(system: string, f: Ferramenta, partes: Parte[], maxTokens: number) {
  const content = partes.map((p) =>
    p.pdf ? { type: "file", file: { filename: "documento.pdf", file_data: `data:application/pdf;base64,${p.pdf}` } }
    : p.img ? { type: "image_url", image_url: { url: `data:${p.tipo};base64,${p.img}` } }
    : { type: "text", text: p.texto ?? "" });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json", "HTTP-Referer": APP_URL || "https://github.com", "X-Title": "Repasses de Cocorretagem" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content }],
      tools: [{ type: "function", function: { name: f.name, description: f.description, parameters: f.input_schema } }],
      // alguns modelos (ex.: Claude Sonnet 5.5) não aceitam ferramenta obrigatória; as instruções pedem a ferramenta
      tool_choice: "auto",
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.error) {
    console.error("openrouter", res.status, JSON.stringify(out).slice(0, 500));
    return erroIA(out?.error?.code || res.status, out?.error?.message || `erro ${res.status}`);
  }
  const ch = out.choices?.[0];
  if (ch?.finish_reason === "length") return erro("O documento é grande demais para uma leitura só. Divida o arquivo e envie em partes.", 413);
  const args = ch?.message?.tool_calls?.find((t: { function?: { name?: string } }) => t.function?.name === f.name)?.function?.arguments ?? ch?.message?.tool_calls?.[0]?.function?.arguments;
  let dados: unknown = null;
  try { dados = typeof args === "string" ? JSON.parse(args) : args; } catch { /* resposta fora do formato */ }
  if (!dados) dados = jsonDoTexto(ch?.message?.content);
  if (!dados) return erro(`O modelo ${MODEL} não devolveu os dados no formato esperado. Tente de novo ou troque o IA_MODELO.`, 502);
  return json({ dados, modelo: MODEL, provedor: "openrouter", uso: out.usage ?? null });
}

async function viaAnthropic(system: string, f: Ferramenta, partes: Parte[], maxTokens: number) {
  const content = partes.map((p) =>
    p.pdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.pdf } }
    : p.img ? { type: "image", source: { type: "base64", media_type: p.tipo, data: p.img } }
    : { type: "text", text: p.texto ?? "" });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANT_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, tools: [f], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("anthropic", res.status, JSON.stringify(out).slice(0, 500));
    return erroIA(res.status === 400 && /credit/i.test(out?.error?.message || "") ? 402 : res.status, out?.error?.message || `erro ${res.status}`);
  }
  const uso = (out.content || []).find((c: { type: string; name?: string }) => c.type === "tool_use");
  if (out.stop_reason === "max_tokens") return erro("O documento é grande demais para uma leitura só. Divida o arquivo e envie em partes.", 413);
  const dados = uso?.input ?? jsonDoTexto((out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"));
  if (!dados) return erro("A IA não devolveu os dados. Tente de novo.", 502);
  return json({ dados, modelo: MODEL, provedor: "anthropic", uso: out.usage ?? null });
}
