// Edge Function: envia o convite de acesso por e-mail (a pessoa cria a própria senha pelo link).
// O cadastro e a permissão ficam no banco (hub_convidar / portal_convidar); aqui só se dispara o e-mail,
// e apenas para quem foi convidado por alguém com permissão (hub_pode_enviar_convite).
// Se o e-mail não puder ser enviado (SMTP), devolve o link para o administrador repassar.
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// endereços onde o Hub roda; o link do convite só pode voltar para um deles
const ORIGENS = ["https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://mdc-tarefas.vercel.app", "http://localhost:3000"];
const BASE = "/hub-mdc";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });

  let corpo: { email?: string; nome?: string; origem?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: "Pedido inválido." });
  }
  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { erro: "E-mail inválido." });
  const origem = ORIGENS.includes(String(corpo.origem)) ? String(corpo.origem) : ORIGENS[0];
  const redirectTo = `${origem}${BASE}/login?convite=1`;

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: pode, error: ePode } = await usuario.rpc("hub_pode_enviar_convite", { p_email: email });
  if (ePode) return json(401, { erro: "Sessão expirada. Entre de novo." });
  if (!pode) return json(403, { erro: "Este e-mail não tem convite pendente feito por você." });

  const nome = String(corpo.nome ?? "").trim().slice(0, 120) || undefined;
  const { error } = await servico.auth.admin.inviteUserByEmail(email, { redirectTo, data: nome ? { nome } : undefined });
  if (!error) return json(200, { enviado: true });

  // conta já existe (reenvio) ou e-mail indisponível: gera o link para repassar
  console.error("convite por e-mail falhou", error.message);
  for (const type of ["invite", "magiclink"] as const) {
    const { data, error: eLink } = await servico.auth.admin.generateLink({ type, email, options: { redirectTo, data: nome ? { nome } : undefined } });
    if (!eLink && data?.properties?.action_link) return json(200, { enviado: false, link: data.properties.action_link });
  }
  return json(500, { erro: "Não foi possível gerar o convite. Tente de novo em instantes." });
});
