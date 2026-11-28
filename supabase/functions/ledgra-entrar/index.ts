// Edge Function ledgra-entrar (HUB-MDC · Módulos do Ledgra, migração 126).
//
//   POST { org, modulo }  modulo = xml | auditor | legislacao | varredura  →  { url }
//
// Quem pode: equipe com Módulos do Ledgra (ver), conferido no banco por public.ledgra_entrada_pode com o login de quem
// chamou. No Ledgra, a entrada só abre se o MESMO e-mail tiver usuário ativo com o módulo liberado (o Ledgra confere e
// registra). A resposta é o endereço do Ledgra com a sessão no fragmento (#), aberto numa aba nova pela tela.
//
// Código de integração: o do Ledgra no Vault do HUB (092), lido por public.integracao_token_ler (só a chave de
// serviço). Endereço do Ledgra: segredo opcional LEDGRA_URL; sem ele, https://ledgra.com.br. Nada é digitado.
import { createClient } from "@supabase/supabase-js";
import { chavePublica, chaveSecreta } from "../_compartilhado/chaves.ts";

const ORIGENS = [
  "https://mdcassessoria.com",
  "https://www.mdcassessoria.com",
  "https://hub.mdcassessoria.com",
  "https://mdc-tarefas.vercel.app",
];
const MODULOS = ["xml", "auditor", "legislacao", "varredura"];
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

  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user?.email) return json(401, { erro: "Sessão expirada. Entre de novo." });

  const corpo = (await req.json().catch(() => null)) as { org?: unknown; modulo?: unknown } | null;
  const org = String(corpo?.org ?? "");
  const modulo = String(corpo?.modulo ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(org)) return json(400, { erro: "Organização não informada." });
  if (!MODULOS.includes(modulo)) return json(400, { erro: "Módulo desconhecido." });
  const { data: pode } = await usuario.rpc("ledgra_entrada_pode", { p_org: org });
  if (pode !== true) return json(403, { erro: "Você não tem acesso a Módulos do Ledgra no HUB." });

  const servico = createClient(Deno.env.get("SUPABASE_URL")!, chaveSecreta(), { auth: { persistSession: false } });
  const { data: token, error: eToken } = await servico.rpc("integracao_token_ler", { p_sistema: "ledgra" });
  if (eToken || !token) return json(500, { erro: "A ligação com o Ledgra não está configurada no HUB." });

  const base = (Deno.env.get("LEDGRA_URL") ?? "https://ledgra.com.br").replace(/\/+$/, "");
  let r: Response;
  try {
    r = await fetch(`${base}/api/public/hub/entrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-sistema": "hub", "x-hub-integracao": String(token) },
      body: JSON.stringify({ email: u.user.email, modulo }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return json(502, { erro: "O Ledgra não respondeu agora. Tente de novo em instantes." });
  }
  const resp = (await r.json().catch(() => null)) as { url?: unknown; erro?: unknown } | null;
  if (r.status === 422 && typeof resp?.erro === "string") return json(422, { erro: resp.erro });
  const url = typeof resp?.url === "string" ? resp.url : "";
  if (!r.ok || !url.startsWith(`${base}/entrar-hub#`)) {
    if (r.status === 401) console.error("o Ledgra recusou o código de integração do HUB");
    else console.error("ledgra-entrar: resposta", r.status);
    return json(502, { erro: "O Ledgra não conseguiu abrir o módulo agora. Tente de novo em instantes." });
  }
  return json(200, { url });
});
