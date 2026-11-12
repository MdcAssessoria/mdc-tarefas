// Edge Function pública: "Esqueci a senha" da tela de entrada. Manda o link de criar nova senha pela caixa do HUB
// (Microsoft Graph). Sem os segredos GRAPH_*, usa o envio do próprio Supabase (SMTP), como antes.
// Limite de pedidos no banco (hub_pedir_senha, migração 071). A resposta é sempre a mesma, exista ou não a conta, para
// ninguém descobrir quem tem acesso; erros só no registro da Função, sem o e-mail da pessoa.
import { createClient } from "@supabase/supabase-js";
import { enviarPeloGraph, lerGraph } from "../_email/graph.ts";
import { ASSUNTO_SENHA, htmlSenha } from "../_email/modelos.ts";

const ORIGENS = ["https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://hub.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const BASE = "/hub-mdc";
const RESPOSTA = { ok: true, texto: "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." };

const cors = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[3],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};

Deno.serve(async (req) => {
  const cabecalhos = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cabecalhos, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  let corpo: { email?: string; origem?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: "Pedido inválido." });
  }
  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json(400, { erro: "E-mail inválido." });
  const origem = ORIGENS.includes(String(corpo.origem)) ? String(corpo.origem) : ORIGENS[2];
  const redirectTo = `${origem}${BASE}/login?redefinir=1`;

  const servico = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: pode, error: ePode } = await servico.rpc("hub_pedir_senha", { p_email: email });
  if (ePode) {
    console.error("senha: limite não conferido:", ePode.message);
    return json(500, { erro: "Não foi possível pedir o link agora. Tente de novo em instantes." });
  }
  if (!pode) return json(200, RESPOSTA); // sem conta ou acima do limite: mesma resposta

  const graph = lerGraph((n) => Deno.env.get(n));
  if (!graph) {
    const { error } = await servico.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) console.error("senha: envio pelo Supabase falhou:", error.status ?? "", error.message);
    return json(200, RESPOSTA);
  }
  const { data, error: eLink } = await servico.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  const link = data?.properties?.action_link;
  if (eLink || !link) {
    console.error("senha: link não gerado:", eLink?.message);
    return json(200, RESPOSTA);
  }
  try {
    await enviarPeloGraph(graph, { para: email, assunto: ASSUNTO_SENHA, html: htmlSenha(link) });
  } catch (e) {
    // mesma resposta de sempre (uma resposta diferente contaria que a conta existe); o motivo fica no registro
    console.error("senha: envio pelo Microsoft 365 falhou:", (e as Error).message);
  }
  return json(200, RESPOSTA);
});
