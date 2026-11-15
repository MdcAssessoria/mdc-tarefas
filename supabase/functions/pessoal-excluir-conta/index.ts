// Edge Function: "Excluir minha conta" do MDC · Pessoal (083). Exigência da Google Play e direito do titular (LGPD,
// art. 18). 1º o banco apaga as famílias em que a pessoa está sozinha e a tira das outras (pessoal_excluir_conta_preparar,
// com a permissão de quem chamou); 2º esta função apaga o login (auth.users) com a chave de serviço, que só existe aqui.
// Conta que também é do HUB da MDC ou do Portal do Cliente é barrada no 1º passo. Se o 2º falhar, a pessoa repete:
// o 1º passo já não tem o que apagar e segue direto.
import { createClient } from "@supabase/supabase-js";

const ORIGENS = ["https://hub.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const cors = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };
};

const NEGOCIO = /^(Entre na sua conta|Para confirmar|Esta conta também é usada)/;

Deno.serve(async (req) => {
  const cabecalhos = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cabecalhos, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Entre na sua conta para excluir." });

  let corpo: { confirmacao?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: "Pedido inválido." });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: quem, error: eQuem } = await usuario.auth.getUser();
  if (eQuem || !quem?.user) return json(401, { erro: "Entre na sua conta para excluir." });

  const { data: resumo, error: ePrep } = await usuario.rpc("pessoal_excluir_conta_preparar", {
    p_confirmacao: String(corpo.confirmacao ?? ""),
  });
  if (ePrep) {
    const negocio = NEGOCIO.test(ePrep.message ?? "");
    if (!negocio) console.error("pessoal-excluir-conta: passo do banco falhou", ePrep.code ?? "");
    return json(negocio ? 400 : 500, { erro: negocio ? ePrep.message : "Não deu para excluir agora. Tente de novo em alguns minutos." });
  }

  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { error: eApagar } = await servico.auth.admin.deleteUser(quem.user.id);
  if (eApagar) {
    console.error("pessoal-excluir-conta: apagar o login falhou", eApagar.status ?? "");
    return json(500, { erro: "Suas famílias já foram tratadas, mas o login não foi apagado. Toque em Excluir de novo." });
  }
  return json(200, { ok: true, ...(resumo as Record<string, number>) });
});
