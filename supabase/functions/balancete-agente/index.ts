// Edge Function balancete-agente: lê a pasta de balancetes no SharePoint (Microsoft Graph) e importa cada arquivo
// com as MESMAS regras da tela (cópias em nucleo/, feitas por scripts/sync-funcoes.sh).
//
// Quem chama:
//   - o agendador do banco (pg_cron, a cada 15 min) com o cabeçalho x-agente-token  → { acao: "rodar" }
//   - o administrador na tela Configurações › Integrações (login dele)               → { acao: "testar" | "rodar_agora", org_id }
//
// Para cada arquivo da pasta: lê, reconhece a empresa (CNPJ ou código do Domínio) e a competência, classifica as
// contas com as regras salvas, calcula e grava o rascunho numa transação só (portal_gravar_balancete).
// Depois move o arquivo para "Processados" ou "Com problema" e registra tudo no histórico (hub_importacoes).
// Nunca publica nada e nunca substitui mês publicado nem rascunho existente: esses ficam para revisão na tela.
//
// Segredos (painel do Supabase › Edge Functions › Secrets, colocados pelo TI/Edvaldo, nunca no código):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  → aplicativo do Entra ID com Sites.Selected (infra/microsoft-365).
import { createClient } from "@supabase/supabase-js";
import {
  abrirPasta,
  arquivosDaPasta,
  type Config,
  ErroAgente,
  ErroOcupado,
  ORIGENS,
  processarOrg,
  registrarExecucao,
  tokenGraph,
} from "./agente.ts";

function cors(req: Request) {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem)
      ? origem
      : ORIGENS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// ------------------------------------------------------------------------------------------------ entrada
Deno.serve(async (req) => {
  const h = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...h, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(
    url,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let corpo: { acao?: string; org_id?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    /* corpo vazio */
  }

  // 1) agendador do banco: todas as organizações com a pasta ligada
  const tokenAgente = req.headers.get("x-agente-token");
  if (tokenAgente) {
    const ok = await servico.rpc("agente_token_confere", {
      p_token: tokenAgente,
    });
    if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });
    const { data } = await servico
      .from("hub_integracoes")
      .select("org_id,config")
      .eq("tipo", "sharepoint_balancetes")
      .eq("ativo", true);
    const saida: Record<string, string> = {};
    for (const i of (data ?? []) as { org_id: string; config: Config }[]) {
      let ocupado = false;
      try {
        saida[i.org_id] = (
          await processarOrg(servico, i.org_id, i.config)
        ).resumo;
      } catch (e) {
        ocupado = e instanceof ErroOcupado;
        saida[i.org_id] =
          e instanceof ErroAgente
            ? e.message
            : "Falha inesperada ao ler a pasta.";
        if (!(e instanceof ErroAgente)) console.error("org", i.org_id, e);
      }
      if (!ocupado) await registrarExecucao(servico, i.org_id, saida[i.org_id]);
    }
    return json(200, saida);
  }

  // 2) administrador pela tela
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer "))
    return json(401, { erro: "Faça login de novo." });
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: quem } = await usuario.auth.getUser();
  if (!quem.user)
    return json(401, { erro: "Sua sessão expirou. Entre de novo." });
  if (!/^[0-9a-f-]{36}$/i.test(corpo.org_id ?? ""))
    return json(400, { erro: "Organização inválida." });
  // a regra de acesso da tabela só deixa o administrador ler a integração
  const { data: integ } = await usuario
    .from("hub_integracoes")
    .select("config,ativo")
    .eq("org_id", corpo.org_id!)
    .eq("tipo", "sharepoint_balancetes")
    .maybeSingle();
  if (!integ)
    return json(403, {
      erro: "Só o administrador usa esta tela. Salve a pasta antes de testar.",
    });
  const config = integ.config as Config;
  if (!config?.site || !config?.pasta)
    return json(400, {
      erro: "Preencha o endereço do site, a biblioteca e a pasta e salve.",
    });

  try {
    if (corpo.acao === "testar") {
      const token = await tokenGraph();
      const p = await abrirPasta(token, config);
      const n = (await arquivosDaPasta(token, p.driveId, p.pastaId)).length;
      const msg = `Conexão ok: o HUB lê a pasta e já criou "Processados" e "Com problema". ${n ? `${n} arquivo(s) esperando.` : "Nenhum arquivo esperando."}`;
      await registrarExecucao(servico, corpo.org_id!, msg);
      return json(200, { ok: true, mensagem: msg });
    }
    if (corpo.acao === "rodar_agora") {
      const r = await processarOrg(servico, corpo.org_id!, config);
      await registrarExecucao(servico, corpo.org_id!, r.resumo);
      return json(200, {
        ok: true,
        mensagem: r.resumo,
        resultados: r.resultados,
      });
    }
    return json(400, { erro: "Ação desconhecida." });
  } catch (e) {
    const msg =
      e instanceof ErroAgente
        ? e.message
        : "Falha inesperada ao falar com o SharePoint.";
    if (!(e instanceof ErroAgente)) console.error(e);
    if (!(e instanceof ErroOcupado))
      await registrarExecucao(servico, corpo.org_id!, msg);
    return json(200, { ok: false, mensagem: msg });
  }
});
