// Edge Function pessoal-aviso: entrega no celular (Web Push) o resumo diário do MDC · Pessoal (migração 076).
//
// Quem chama:
//   - o agendador do banco (pg_cron, minuto 3 de cada hora, só com aviso na fila) com o cabeçalho x-agente-token
//                                                                                  → { acao: "rodar" }
//   - a tela do Início da família, logada, para ligar o aviso no aparelho        → { acao: "chave" } (chave pública)
// As chaves do Web Push (VAPID) são geradas aqui na primeira vez e guardadas no Vault (pessoal_vapid): ninguém digita
// chave. A chave privada nunca sai do servidor. Aparelho que não existe mais (410/404) é esquecido.
// O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const ORIGENS = ["https://hub.mdcassessoria.com", "https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const ASSUNTO = "https://hub.mdcassessoria.com";

const cors = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};

const servico = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Banco = ReturnType<typeof servico>;

/** Chaves VAPID do Vault; na primeira vez gera o par e grava (se duas chamadas correrem juntas, vale a primeira). */
async function chaves(sb: Banco): Promise<{ publica: string; privada: string }> {
  const lidas = await sb.rpc("pessoal_vapid");
  if (lidas.error) throw lidas.error;
  if (lidas.data?.publica && lidas.data?.privada) return lidas.data;
  const novas = webpush.generateVAPIDKeys();
  const gravadas = await sb.rpc("pessoal_vapid", { p_publica: novas.publicKey, p_privada: novas.privateKey });
  if (gravadas.error) throw gravadas.error;
  return gravadas.data;
}

interface Aviso {
  id: number;
  titulo: string;
  texto: string;
  link: string;
  aparelhos: { endpoint: string; p256dh: string; auth: string }[];
}

async function rodar(sb: Banco) {
  const { publica, privada } = await chaves(sb);
  webpush.setVapidDetails(ASSUNTO, publica, privada);
  const fila = await sb.rpc("pessoal_push_reservar");
  if (fila.error) throw fila.error;
  let enviados = 0;
  let falhas = 0;
  for (const a of (fila.data ?? []) as Aviso[]) {
    const mortos: string[] = [];
    let algum = false;
    const carga = JSON.stringify({ titulo: a.titulo, texto: a.texto, link: a.link });
    for (const ap of a.aparelhos) {
      try {
        await webpush.sendNotification({ endpoint: ap.endpoint, keys: { p256dh: ap.p256dh, auth: ap.auth } }, carga, { TTL: 6 * 3600 });
        algum = true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) mortos.push(ap.endpoint);
        else console.error("pessoal-aviso: falha ao entregar", status ?? "sem código");
      }
    }
    // sem aparelho vivo não adianta tentar de novo: conta como entregue
    const ok = algum || a.aparelhos.length === mortos.length;
    await sb.rpc("pessoal_push_resultado", { p_id: a.id, p_ok: ok, p_mortos: mortos });
    if (algum) enviados++;
    else if (!ok) falhas++;
  }
  return { enviados, falhas };
}

Deno.serve(async (req) => {
  const h = cors(req);
  const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  let corpo: { acao?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    /* corpo vazio */
  }
  const sb = servico();
  try {
    const token = req.headers.get("x-agente-token");
    if (token) {
      const ok = await sb.rpc("pessoal_aviso_token_confere", { p_token: token });
      if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });
      return json(200, await rodar(sb));
    }
    if (corpo.acao === "chave") {
      // só quem está logado (qualquer conta) recebe a chave pública
      const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const u = auth ? await sb.auth.getUser(auth) : null;
      if (!u?.data.user) return json(401, { erro: "Entre na sua conta." });
      return json(200, { publica: (await chaves(sb)).publica });
    }
    return json(400, { erro: "Ação inválida." });
  } catch (e) {
    console.error("pessoal-aviso: erro", e instanceof Error ? e.name : "desconhecido");
    return json(500, { erro: "Não foi possível agora. Tente de novo em instantes." });
  }
});
