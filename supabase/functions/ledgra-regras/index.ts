// Edge Function ledgra-regras (HUB-MDC · Auditoria fiscal › Regras de validação, migração 125).
//
//   POST (JSON): { org, cnpj, acao, dados } → pede ao Ledgra Auditor (POST /api/public/hub/auditoria-erp-regras) para
//   listar ou gravar as regras próprias e as utilizações do ERP da empresa. A biblioteca é UMA só e fica no Ledgra: o
//   que muda aqui aparece lá e vice-versa (pedido do Edvaldo, 27/11/2026).
//   Ações: listar | salvar_regra | situacao_regra | salvar_utilizacao | situacao_utilizacao.
//
// Quem pode: listar = Auditoria fiscal › ver; gravar = Auditoria fiscal › operar (public.auditoria_regras_pode com o
// login de quem chamou). No Ledgra vale também a regra de lá (usuário com o MESMO e-mail; gravar = equipe MDC; para
// todas as empresas, só o Administrador MDC). Código de integração e endereço: os mesmos da ledgra-auditoria.
import { createClient } from "@supabase/supabase-js";
import { chavePublica, chaveSecreta } from "../_compartilhado/chaves.ts";

const ORIGENS = [
  "https://mdcassessoria.com",
  "https://www.mdcassessoria.com",
  "https://hub.mdcassessoria.com",
  "https://mdc-tarefas.vercel.app",
];
const cabecalhos = (req: Request) => {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};
const resposta = (h: Record<string, string>) => (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...h, "Content-Type": "application/json" } });

const ACOES = ["listar", "salvar_regra", "situacao_regra", "salvar_utilizacao", "situacao_utilizacao"];

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user?.email) return json(401, { erro: "Sessão expirada. Entre de novo." });

  // deno-lint-ignore no-explicit-any
  const p = (await req.json().catch(() => null)) as any;
  const org = String(p?.org ?? "");
  const cnpj = String(p?.cnpj ?? "").replace(/\D/g, "");
  const acao = String(p?.acao ?? "");
  const dados = p?.dados && typeof p.dados === "object" ? p.dados : null;
  if (!/^[0-9a-f-]{36}$/i.test(org)) return json(400, { erro: "Organização não informada." });
  if (cnpj.length !== 14) return json(400, { erro: "Escolha a empresa (CNPJ com 14 dígitos)." });
  if (!ACOES.includes(acao)) return json(400, { erro: "Ação desconhecida." });
  const gravar = acao !== "listar";
  if (gravar && !dados) return json(400, { erro: "Faltam os dados para gravar." });
  const { data: pode } = await usuario.rpc("auditoria_regras_pode", { p_org: org, p_gravar: gravar });
  if (pode !== true)
    return json(403, {
      erro: gravar
        ? "Você não tem permissão para alterar as regras (Auditoria fiscal, operar)."
        : "Você não tem acesso à Auditoria fiscal.",
    });

  const servico = createClient(Deno.env.get("SUPABASE_URL")!, chaveSecreta(), { auth: { persistSession: false } });
  const { data: token, error: eToken } = await servico.rpc("integracao_token_ler", { p_sistema: "ledgra" });
  if (eToken || !token) return json(500, { erro: "A ligação com o Ledgra não está configurada no HUB." });

  const base = (Deno.env.get("LEDGRA_URL") ?? "https://ledgra.com.br").replace(/\/+$/, "");
  let r: Response;
  try {
    r = await fetch(`${base}/api/public/hub/auditoria-erp-regras`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-sistema": "hub", "x-hub-integracao": String(token) },
      body: JSON.stringify({ acao, cnpj, solicitante_email: u.user.email, dados }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return json(502, { erro: "O Ledgra não respondeu agora. Tente de novo em instantes." });
  }
  const corpo = await r.json().catch(() => null);
  if (r.status === 422 && corpo?.erro) return json(422, { erro: String(corpo.erro) });
  if (!r.ok || !corpo) {
    if (r.status === 401) console.error("o Ledgra recusou o código de integração do HUB");
    else console.error("ledgra-regras: resposta", r.status);
    return json(502, { erro: "O Ledgra não conseguiu atender agora. Tente de novo em instantes." });
  }
  return json(200, corpo);
});
