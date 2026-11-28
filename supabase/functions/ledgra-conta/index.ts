// Edge Function ledgra-conta (HUB-MDC · Licenças, migração 127; par no Ledgra: migração 20261737, PR #244).
//
//   POST { contrato, nome, email }  →  { email, usuario_novo, senha_provisoria?, entrada, licenca, criada }
//
// Cria no Ledgra a conta própria do cliente que comprou só módulos avulsos (XML, Cofre, Auditor, Legislação, Raio-X,
// Entrega, Integrações, Varredura), sem passar pelo Ledgra ERP. Quem pode: Licenças › operar, conferido no banco por
// public.lic_ledgra_conta_preparar com o login de quem chamou; ela também confere a licença e gera a chave nova do
// Ledgra (a anterior deixa de valer). A chave vai do servidor do HUB ao servidor do Ledgra e não volta à tela.
// A senha provisória do responsável vem só quando a conta dele é nova e aparece UMA vez na tela; ele troca no primeiro
// acesso. Código de integração: o do Ledgra no Vault do HUB (092). Endereço: segredo opcional LEDGRA_URL.
import { createClient } from "@supabase/supabase-js";
import { chavePublica, chaveSecreta } from "../_compartilhado/chaves.ts";

const ORIGENS = [
  "https://mdcassessoria.com",
  "https://www.mdcassessoria.com",
  "https://hub.mdcassessoria.com",
  "https://mdc-tarefas.vercel.app",
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cabecalhos = (req: Request) => {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
};

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });

  const corpo = (await req.json().catch(() => null)) as { contrato?: unknown; nome?: unknown; email?: unknown } | null;
  const contrato = String(corpo?.contrato ?? "");
  const nome = String(corpo?.nome ?? "").trim().slice(0, 120);
  const email = String(corpo?.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[0-9a-f-]{36}$/i.test(contrato)) return json(400, { erro: "Licença não informada." });
  if (nome.length < 2) return json(400, { erro: "Informe o nome do responsável." });
  if (!EMAIL.test(email)) return json(400, { erro: "E-mail do responsável inválido." });

  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: dados, error: ePrep } = await usuario.rpc("lic_ledgra_conta_preparar", { p_contrato: contrato });
  if (ePrep) return json(422, { erro: ePrep.message });
  const d = dados as Record<string, unknown>;

  const servico = createClient(Deno.env.get("SUPABASE_URL")!, chaveSecreta(), { auth: { persistSession: false } });
  const { data: token, error: eToken } = await servico.rpc("integracao_token_ler", { p_sistema: "ledgra" });
  if (eToken || !token) return json(500, { erro: "A ligação com o Ledgra não está configurada no HUB." });

  const base = (Deno.env.get("LEDGRA_URL") ?? "https://ledgra.com.br").replace(/\/+$/, "");
  let r: Response;
  try {
    r = await fetch(`${base}/api/public/hub/conta`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-sistema": "hub", "x-hub-integracao": String(token) },
      body: JSON.stringify({ ...d, responsavel: { nome, email } }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return json(502, {
      erro: "O Ledgra não respondeu agora. A chave nova já foi gerada; tente de novo em instantes (gera outra).",
    });
  }
  const resp = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.status === 422 && typeof resp?.["erro"] === "string") return json(422, { erro: resp["erro"] });
  if (!r.ok || !resp || typeof resp["empresa_id"] !== "string") {
    if (r.status === 401) console.error("o Ledgra recusou o código de integração do HUB");
    else console.error("ledgra-conta: resposta", r.status);
    return json(502, { erro: "O Ledgra não conseguiu criar a conta agora. Tente de novo em instantes." });
  }
  // só o que a tela mostra (o id da empresa no Ledgra fica no Ledgra)
  return json(200, {
    email: resp["email"],
    usuario_novo: resp["usuario_novo"] === true,
    ...(typeof resp["senha_provisoria"] === "string" ? { senha_provisoria: resp["senha_provisoria"] } : {}),
    entrada: resp["entrada"],
    licenca: resp["licenca"],
    criada: resp["criada"] === true,
  });
});
