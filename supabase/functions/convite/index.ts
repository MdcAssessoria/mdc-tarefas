// Edge Function: envia o convite de acesso por e-mail (a pessoa cria a própria senha pelo link).
// O cadastro e a permissão ficam no banco (hub_convidar / portal_convidar); aqui só se dispara o e-mail,
// e apenas para quem foi convidado por alguém com permissão (hub_pode_enviar_convite).
// Link para repassar pelo WhatsApp: com { so_link: true } (ou quando o e-mail falha) devolve o link de criar senha,
// só para quem pode convidar aquela pessoa e só se a conta nunca entrou (hub_pode_ver_link_convite, migração 024).
// Gerar um link novo invalida o do e-mail anterior (o Supabase guarda um link válido por conta).
import { createClient } from "@supabase/supabase-js";

// endereços onde o Hub roda; o link do convite só pode voltar para um deles
const ORIGENS = ["https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://hub.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const BASE = "/hub-mdc";

const CORS = {
  "Access-Control-Allow-Origin": "https://mdc-tarefas.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// CORS: responde com a origem do pedido quando ela é uma das do Hub
const cors = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return ORIGENS.includes(o) ? { ...CORS, "Access-Control-Allow-Origin": o } : CORS;
};

Deno.serve(async (req) => {
  const cabecalhos = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cabecalhos, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });

  let corpo: { email?: string; nome?: string; origem?: string; so_link?: boolean } = {};
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
  if (ePode) return json(/limite/i.test(ePode.message) ? 429 : 401, { erro: /limite/i.test(ePode.message) ? ePode.message : "Sessão expirada. Entre de novo." });
  if (!pode) return json(403, { erro: "Este e-mail não tem convite pendente feito por você, ou a conta já está ativa." });

  const nome = String(corpo.nome ?? "").trim().slice(0, 120) || undefined;
  if (!corpo.so_link) {
    const { error } = await servico.auth.admin.inviteUserByEmail(email, { redirectTo, data: nome ? { nome } : undefined });
    if (!error) return json(200, { enviado: true });
    console.error("convite por e-mail falhou", error.message);
  }

  // link para repassar (WhatsApp): só para quem pode e só para conta que nunca entrou
  const { data: verLink, error: eVer } = await usuario.rpc("hub_pode_ver_link_convite", { p_email: email });
  if (eVer || !verLink) {
    return json(corpo.so_link ? 403 : 502, {
      erro: corpo.so_link
        ? "Você não pode gerar o link desta pessoa, ou ela já criou a senha."
        : "O e-mail de convite não pôde ser enviado agora. Tente de novo mais tarde ou peça ao administrador.",
    });
  }
  // conta ainda não existe → link de convite (cria a conta); já convidada → link para criar a senha
  const { data: conta } = await servico.rpc("hub_conta_existe", { p_email: email });
  const tipo = conta === true ? "recovery" : "invite";
  const { data, error: eLink } = await servico.auth.admin.generateLink(
    tipo === "invite" ? { type: "invite", email, options: { redirectTo, data: nome ? { nome } : undefined } } : { type: "recovery", email, options: { redirectTo } },
  );
  if (!eLink && data?.properties?.action_link) return json(200, { enviado: false, link: data.properties.action_link, so_link: !!corpo.so_link });
  console.error("link de convite falhou", eLink?.message);
  return json(500, { erro: "Não foi possível gerar o link. Tente de novo em instantes." });
});
