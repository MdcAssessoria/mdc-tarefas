// Edge Function: lançar falando no MDC · Pessoal (082). Recebe o TEXTO de uma fala que o app não entendeu sozinho
// ("passei no posto e coloquei cento e poucos, uns 130") e a lista de tipos de gasto/entrada da família, e devolve os
// lançamentos montados pela IA (Claude). Nada é gravado aqui: a pessoa confere no cartão "Entendi assim" e salva.
// Antes de chamar a IA o banco confere a pessoa e o limite de uso (pessoal_voz_pode). O áudio nunca chega aqui (o
// celular transforma a fala em texto); o texto não é guardado. A chave ANTHROPIC_API_KEY fica nos segredos do
// Supabase; sem ela, ou sem o segredo PESSOAL_VOZ_LIGADA = "sim" (SEG-03), a função responde { indisponivel: true } e o
// app segue só com o que ele mesmo entende.
import { createClient } from "@supabase/supabase-js";
import { chavePublica } from "../_compartilhado/chaves.ts";

const ORIGENS = ["https://hub.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const CORS = {
  "Access-Control-Allow-Origin": ORIGENS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const cors = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return ORIGENS.includes(o) ? { ...CORS, "Access-Control-Allow-Origin": o } : CORS;
};

const MODELO = Deno.env.get("PESSOAL_VOZ_MODELO") ?? "claude-haiku-5-5";
const DATA = /^\d{4}-\d{2}-\d{2}$/;

interface Lancamento {
  tipo: "pagar" | "receber";
  valor: number;
  categoria: string | null;
  descricao: string;
  data: string;
  pago: boolean;
}

/** Confere cada item que a IA devolveu: só tipos conhecidos, valor e data plausíveis, categoria da lista. */
function conferir(itens: unknown, categorias: { nome: string; tipo: string }[], hoje: string): Lancamento[] {
  if (!Array.isArray(itens)) return [];
  const base = Date.parse(hoje);
  const saida: Lancamento[] = [];
  for (const i of itens.slice(0, 10)) {
    if (!i || typeof i !== "object") continue;
    const o = i as Record<string, unknown>;
    const tipo = o.tipo === "receber" ? "receber" : o.tipo === "pagar" ? "pagar" : null;
    const valor = Math.round(Number(o.valor) * 100) / 100;
    if (!tipo || !(valor > 0) || valor > 10_000_000) continue;
    let data = typeof o.data === "string" && DATA.test(o.data) ? o.data : hoje;
    if (Math.abs(Date.parse(data) - base) > 400 * 86_400_000) data = hoje;
    const cat = categorias.find((c) => c.nome === o.categoria && c.tipo === (tipo === "pagar" ? "despesa" : "receita"));
    saida.push({
      tipo,
      valor,
      categoria: cat?.nome ?? null,
      descricao: String(o.descricao ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
      data,
      pago: o.pago === false ? false : data <= hoje,
    });
  }
  return saida;
}

Deno.serve(async (req) => {
  const cabecalhos = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cabecalhos, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });

  let corpo: { org?: unknown; texto?: unknown; hoje?: unknown; categorias?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: "Pedido inválido." });
  }
  const org = String(corpo.org ?? "");
  const texto = String(corpo.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const hoje = typeof corpo.hoje === "string" && DATA.test(corpo.hoje) ? corpo.hoje : new Date().toISOString().slice(0, 10);
  const categorias = (Array.isArray(corpo.categorias) ? corpo.categorias : [])
    .slice(0, 80)
    .map((c) => ({ nome: String((c as { nome?: unknown })?.nome ?? "").slice(0, 60), tipo: String((c as { tipo?: unknown })?.tipo ?? "") }))
    .filter((c) => c.nome && (c.tipo === "despesa" || c.tipo === "receita"));
  if (!/^[0-9a-f-]{36}$/i.test(org)) return json(400, { erro: "Família não encontrada." });
  if (texto.length < 3) return json(400, { erro: "Não deu para ouvir. Fale de novo." });

  // SEG-03 (20/11/2026): a IA paga fica desligada até alguém pôr o segredo PESSOAL_VOZ_LIGADA = "sim" no Supabase.
  // Sem isso a função responde como sem chave e o app segue só com o que ele mesmo entende (nenhuma chamada paga).
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave || Deno.env.get("PESSOAL_VOZ_LIGADA") !== "sim") return json(200, { indisponivel: true, lancamentos: [] });

  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: pode, error: ePode } = await usuario.rpc("pessoal_voz_pode", { p_org: org });
  if (ePode) {
    // mensagem do banco em português (raise exception) passa; o resto vira texto simples
    const negocio = /^(Entre na sua conta|Família não encontrada|Você não tem permissão)/.test(ePode.message ?? "");
    return json(403, { erro: negocio ? ePode.message : "Entre de novo e tente outra vez." });
  }
  if (pode === "limite_hora") return json(429, { erro: "Muitos lançamentos falados nesta hora. Espere um pouco ou lance pelo teclado." });
  if (pode === "limite_dia") return json(429, { erro: "Você chegou ao limite de lançamentos falados de hoje. Lance pelo teclado." });

  const lista = (tipo: string) => categorias.filter((c) => c.tipo === tipo).map((c) => c.nome).join(", ");
  const sistema =
    "Você monta lançamentos de finanças pessoais de uma família brasileira a partir do que a pessoa falou. " +
    "Cada coisa paga, gasta ou recebida vira um lançamento. Valores em reais (\"5 mil\" = 5000; \"cento e poucos, uns 130\" = 130). " +
    `Hoje é ${hoje}. Datas relativas (ontem, dia 10, semana que vem) viram AAAA-MM-DD. ` +
    "pago=true quando já aconteceu; pago=false quando é algo a pagar ou a receber no futuro. " +
    `Tipos de gasto (tipo pagar): ${lista("despesa")}. Tipos de entrada (tipo receber): ${lista("receita")}. ` +
    "Use exatamente um desses nomes em categoria; se nenhum servir, use o de \"Outros\"/\"Outras\". " +
    "descricao: até 5 palavras, com a primeira letra maiúscula (ex.: \"Gasolina\", \"Salário de novembro\"). " +
    "Se a fala não tiver nenhum valor em dinheiro, devolva a lista vazia. Não invente valores.";

  let resposta: Response;
  try {
    resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 800,
        system: sistema,
        tools: [
          {
            name: "lancamentos",
            description: "Lançamentos que a pessoa falou.",
            input_schema: {
              type: "object",
              properties: {
                lancamentos: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tipo: { type: "string", enum: ["pagar", "receber"] },
                      valor: { type: "number" },
                      categoria: { type: "string" },
                      descricao: { type: "string" },
                      data: { type: "string" },
                      pago: { type: "boolean" },
                    },
                    required: ["tipo", "valor", "categoria", "descricao", "data", "pago"],
                  },
                },
              },
              required: ["lancamentos"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "lancamentos" },
        messages: [{ role: "user", content: texto }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error("pessoal-voz: IA sem resposta:", e instanceof Error ? e.name : "erro");
    return json(502, { erro: "A IA não respondeu agora. Confira os campos e complete à mão." });
  }
  if (!resposta.ok) {
    console.error("pessoal-voz: IA respondeu", resposta.status);
    return json(502, { erro: "A IA não respondeu agora. Confira os campos e complete à mão." });
  }
  const j = (await resposta.json().catch(() => null)) as { content?: { type: string; input?: { lancamentos?: unknown } }[] } | null;
  const uso = j?.content?.find((c) => c.type === "tool_use");
  return json(200, { lancamentos: conferir(uso?.input?.lancamentos, categorias, hoje) });
});
