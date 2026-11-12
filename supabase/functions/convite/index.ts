// Edge Function: envia o convite de acesso por e-mail (a pessoa cria a própria senha pelo link).
// O cadastro e a permissão ficam no banco (hub_convidar / portal_convidar); aqui só se dispara o e-mail,
// e apenas para quem foi convidado por alguém com permissão (hub_pode_enviar_convite).
// Link para repassar pelo WhatsApp: com { so_link: true } (ou quando o e-mail falha) devolve o link de criar senha,
// só para quem pode convidar aquela pessoa e só se a conta nunca entrou (hub_pode_ver_link_convite, migração 024).
// Gerar um link novo invalida o do e-mail anterior (o Supabase guarda um link válido por conta).
// Senha provisória ({ senha_provisoria: true }, migração 071): cria ou redefine a conta com uma senha aleatória que o
// administrador manda pelo WhatsApp; a marca trocar_senha obriga a pessoa a criar a própria senha no 1º acesso.
// Com os segredos GRAPH_* o e-mail sai pelo Microsoft Graph (caixa hub@); sem eles, pelo SMTP do Supabase.
import { createClient } from "@supabase/supabase-js";
import { enviarPeloGraph, lerGraph } from "../_email/graph.ts";
import { ASSUNTO_CONVITE, ASSUNTO_SENHA, htmlConvite, htmlSenha } from "../_email/modelos.ts";

// endereços onde o Hub roda; o link do convite só pode voltar para um deles
const ORIGENS = ["https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://hub.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const BASE = "/hub-mdc";

// Senha provisória: "Mdc-" + 4 letras + "-" + 4 números (sem letras que confundem: I, L, O). Aleatória a cada vez.
function senhaProvisoria(): string {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const n = crypto.getRandomValues(new Uint32Array(8));
  const l = Array.from(n.slice(0, 4), (x) => letras[x % letras.length]).join("");
  const d = Array.from(n.slice(4), (x) => String(x % 10)).join("");
  return `Mdc-${l}-${d}`;
}

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

  let corpo: { email?: string; nome?: string; origem?: string; so_link?: boolean; senha_provisoria?: boolean; senha?: string } = {};
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

  // senha provisória (071): o administrador recebe uma senha para mandar pelo WhatsApp; no 1º acesso a pessoa troca
  if (corpo.senha_provisoria) {
    const { data: podeSenha, error: eSenha } = await usuario.rpc("hub_pode_senha_provisoria", { p_email: email });
    if (eSenha) return json(401, { erro: "Sessão expirada. Entre de novo." });
    if (!podeSenha) return json(403, { erro: "Você não pode gerar a senha desta pessoa." });
    // o administrador pode digitar a senha provisória (mesma regra de web/src/lib/senhaProvisoria.ts); vazio = gerada
    const digitada = typeof corpo.senha === "string" ? corpo.senha : "";
    if (digitada && (digitada.trim() !== digitada || digitada.length < 8 || digitada.length > 72))
      return json(400, { erro: "A senha provisória precisa ter de 8 a 72 caracteres, sem espaço no começo ou no fim." });
    const senha = digitada || senhaProvisoria();
    const nomeP = String(corpo.nome ?? "").trim().slice(0, 120) || undefined;
    const { data: id } = await servico.rpc("hub_conta_id", { p_email: email });
    const { error: eConta } = id
      ? await servico.auth.admin.updateUserById(String(id), { password: senha, email_confirm: true, app_metadata: { trocar_senha: true } })
      : await servico.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: nomeP ? { nome: nomeP } : undefined,
          app_metadata: { trocar_senha: true },
        });
    if (eConta) {
      console.error("senha provisória falhou:", eConta.status ?? "", eConta.message);
      return json(500, { erro: "Não foi possível criar a senha provisória agora. Tente de novo em instantes." });
    }
    return json(200, { enviado: false, senha, endereco: `${origem}${BASE}/login` });
  }

  const { data: pode, error: ePode } = await usuario.rpc("hub_pode_enviar_convite", { p_email: email });
  if (ePode) return json(/limite/i.test(ePode.message) ? 429 : 401, { erro: /limite/i.test(ePode.message) ? ePode.message : "Sessão expirada. Entre de novo." });
  if (!pode) return json(403, { erro: "Este e-mail não tem convite pendente feito por você, ou a conta já está ativa." });

  const nome = String(corpo.nome ?? "").trim().slice(0, 120) || undefined;
  const graph = lerGraph((n) => Deno.env.get(n));
  if (!corpo.so_link && graph) {
    // e-mail pelo Microsoft Graph (12/11/2026): o HUB gera o link e manda; sem corrida com envio atrasado do Supabase
    const { data: jaTem } = await servico.rpc("hub_conta_existe", { p_email: email });
    const recuperar = jaTem === true;
    const { data, error: eLink } = await servico.auth.admin.generateLink(
      recuperar ? { type: "recovery", email, options: { redirectTo } } : { type: "invite", email, options: { redirectTo, data: nome ? { nome } : undefined } },
    );
    const link = data?.properties?.action_link;
    if (eLink || !link) {
      console.error("link do convite falhou", eLink?.message);
      return json(500, { erro: "Não foi possível gerar o link. Tente de novo em instantes." });
    }
    try {
      await enviarPeloGraph(graph, recuperar ? { para: email, assunto: ASSUNTO_SENHA, html: htmlSenha(link) } : { para: email, assunto: ASSUNTO_CONVITE, html: htmlConvite(link) });
      return json(200, { enviado: true });
    } catch (e) {
      console.error("convite pelo Microsoft 365 falhou:", (e as Error).message);
      // o link gerado continua valendo (nenhum outro envio vai anulá-lo): devolve para mandar pelo WhatsApp
      const { data: verLink } = await usuario.rpc("hub_pode_ver_link_convite", { p_email: email });
      return verLink
        ? json(200, { enviado: false, link })
        : json(502, { erro: `O e-mail não saiu: ${(e as Error).message}. Tente de novo mais tarde ou peça ao administrador.` });
    }
  }
  if (!corpo.so_link) {
    // conta já criada pelo convite anterior (e ainda sem senha): o e-mail sai como "criar/redefinir senha"
    const { data: jaTem } = await servico.rpc("hub_conta_existe", { p_email: email });
    const { error } = jaTem === true
      ? await servico.auth.resetPasswordForEmail(email, { redirectTo })
      : await servico.auth.admin.inviteUserByEmail(email, { redirectTo, data: nome ? { nome } : undefined });
    if (!error) return json(200, { enviado: true });
    console.error("convite por e-mail falhou", error.status ?? "", error.message);
    // E-mail que demorou (servidor de e-mail lento): o Supabase termina o envio depois e cria um link novo, que anularia
    // o link gerado aqui (12/11/2026). Então não entrega link agora: pede para gerar o link daqui a pouco.
    if ((error.status ?? 0) >= 500 || /timeout|deadline|tempo/i.test(error.message)) {
      return json(502, {
        erro: "O e-mail de convite demorou para sair e pode chegar atrasado. Se não chegar, espere 1 minuto e use " +
          "\"Link para WhatsApp\" (o link novo substitui o do e-mail).",
      });
    }
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
