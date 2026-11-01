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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { lerPlanilhaBytes } from "./nucleo/lib/arquivos/planilhaBytes.ts";
import type { SheetJS } from "./nucleo/lib/arquivos/planilhaBytes.ts";
import { lerBalancete } from "./nucleo/dominios/demonstrativos/balancete/leitura.ts";
import { classificar } from "./nucleo/dominios/demonstrativos/balancete/classificacao.ts";
import type { Grupo, Linha } from "./nucleo/dominios/demonstrativos/balancete/tipos.ts";
import type { Resumo } from "./nucleo/dominios/demonstrativos/balancete/resumo.ts";
import { analisar } from "./nucleo/dominios/demonstrativos/analise.ts";
import type { MapaDfc } from "./nucleo/dominios/demonstrativos/calculosDemonstracoes.ts";
import { competenciaDoArquivo, identificarEmpresa } from "./nucleo/dominios/demonstrativos/importacaoLote.ts";

// deno-lint-ignore no-explicit-any
type Sb = SupabaseClient<any>;
type Config = { site: string; biblioteca: string; pasta: string };
type Cliente = { id: string; cnpj: string | null; codigo_dominio: string | null; razao_social: string };
type Resultado = { arquivo: string; resultado: "importado" | "revisar" | "erro"; motivo: string; empresa?: string; competencia?: string };

const ORIGENS = ["https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const POR_RODADA = 20; // arquivos por organização a cada chamada (o resto fica para a próxima, em 15 minutos)
const EXTENSOES = /\.(xls|xlsx|csv|txt)$/i;

class ErroAgente extends Error {}

function cors(req: Request) {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// ------------------------------------------------------------------------------------------------ Microsoft Graph
async function tokenGraph(): Promise<string> {
  const tenant = Deno.env.get("MS_TENANT_ID"),
    id = Deno.env.get("MS_CLIENT_ID"),
    segredo = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !segredo)
    throw new ErroAgente("O acesso ao Microsoft 365 ainda não foi configurado. O TI precisa seguir o passo a passo de infra/microsoft-365.");
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: id, client_secret: segredo, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new ErroAgente("A Microsoft recusou o acesso do HUB. Confira com o TI o aplicativo e o segredo cadastrados.");
  return j.access_token as string;
}

async function graph(token: string, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 403)
    throw new ErroAgente("O HUB não tem permissão nessa pasta do SharePoint. O TI precisa liberar o site para o aplicativo do HUB.");
  if (!r.ok) throw new ErroAgente(`O SharePoint respondeu com erro (${r.status}). Tente de novo em alguns minutos.`);
  return r;
}

const codificar = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/** Acha o site, a biblioteca e a pasta; cria "Processados" e "Com problema" se faltarem. */
async function abrirPasta(token: string, c: Config) {
  let url: URL;
  try {
    url = new URL(c.site);
  } catch {
    throw new ErroAgente("O endereço do site do SharePoint não é válido (ex.: https://mdcassessoria.sharepoint.com/sites/HUB).");
  }
  if (!url.hostname.endsWith(".sharepoint.com")) throw new ErroAgente("O endereço precisa ser de um site do SharePoint (…sharepoint.com).");
  const caminhoSite = url.pathname.replace(/\/+$/, "");
  const site = await graph(token, caminhoSite ? `/sites/${url.hostname}:${caminhoSite}` : `/sites/${url.hostname}`);
  if (!site) throw new ErroAgente("Não encontrei esse site do SharePoint. Confira o endereço.");
  const siteId = (await site.json()).id as string;

  const drives = await graph(token, `/sites/${siteId}/drives`);
  const lista = ((await drives!.json()).value ?? []) as { id: string; name: string }[];
  const alvo = c.biblioteca.trim().toLowerCase();
  const drive = lista.find((d) => d.name.toLowerCase() === alvo) ??
    (["documentos", "documents", "shared documents", "documentos compartilhados"].includes(alvo)
      ? lista.find((d) => ["documentos", "documents", "shared documents", "documentos compartilhados"].includes(d.name.toLowerCase()))
      : undefined);
  if (!drive) throw new ErroAgente(`Não encontrei a biblioteca "${c.biblioteca}" nesse site. Bibliotecas existentes: ${lista.map((d) => d.name).join(", ")}.`);

  const pasta = await graph(token, `/drives/${drive.id}/root:/${codificar(c.pasta)}`);
  if (!pasta) throw new ErroAgente(`Não encontrei a pasta "${c.pasta}" na biblioteca ${drive.name}.`);
  const pastaId = (await pasta.json()).id as string;

  const sub = async (nome: string) => {
    const existe = await graph(token, `/drives/${drive.id}/root:/${codificar(c.pasta)}/${encodeURIComponent(nome)}`);
    if (existe) return (await existe.json()).id as string;
    const nova = await graph(token, `/drives/${drive.id}/items/${pastaId}/children`, {
      method: "POST",
      body: JSON.stringify({ name: nome, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    return (await nova!.json()).id as string;
  };
  return { driveId: drive.id, pastaId, processados: await sub("Processados"), problema: await sub("Com problema") };
}

async function arquivosDaPasta(token: string, driveId: string, pastaId: string) {
  const r = await graph(token, `/drives/${driveId}/items/${pastaId}/children?$top=200&$select=id,name,file,size`);
  const itens = ((await r!.json()).value ?? []) as { id: string; name: string; file?: unknown; size: number }[];
  return itens.filter((i) => i.file && EXTENSOES.test(i.name)).sort((a, b) => a.name.localeCompare(b.name));
}

async function mover(token: string, driveId: string, itemId: string, destino: string, nome: string) {
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  await graph(token, `/drives/${driveId}/items/${itemId}?@microsoft.graph.conflictBehavior=rename`, {
    method: "PATCH",
    body: JSON.stringify({ parentReference: { id: destino }, name: `${carimbo}-${nome}` }),
  });
}

// ------------------------------------------------------------------------------------------------ leitura do banco
async function lerTudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const todas: T[] = [];
  for (;;) {
    const { data, error } = await montar(todas.length, todas.length + 999);
    if (error) throw new ErroAgente("Não consegui ler os dados do HUB. Tente de novo em instantes.");
    const p = (data as T[] | null) ?? [];
    if (!p.length) return todas;
    todas.push(...p);
  }
}

/** Mesmo critério da tela: a regra do cliente vem depois da padrão e prevalece. */
const doCliente = <R extends { cliente_id: string | null }>(rows: R[], cliente: string) => [
  ...rows.filter((r) => !r.cliente_id),
  ...rows.filter((r) => r.cliente_id === cliente),
];

// ------------------------------------------------------------------------------------------------ uma organização
async function processarOrg(servico: Sb, orgId: string, config: Config): Promise<{ resumo: string; resultados: Resultado[] }> {
  const token = await tokenGraph();
  const p = await abrirPasta(token, config);
  const arquivos = (await arquivosDaPasta(token, p.driveId, p.pastaId)).slice(0, POR_RODADA);
  if (!arquivos.length) return { resumo: "Pasta lida: nenhum arquivo novo.", resultados: [] };

  const clientes = await lerTudo<Cliente>((de, ate) =>
    servico.from("clientes").select("id,cnpj,codigo_dominio,razao_social").eq("org_id", orgId).order("id").range(de, ate),
  );
  const mapaContas = await lerTudo<{ classificacao: string; grupo: Grupo; cliente_id: string | null }>((de, ate) =>
    servico.from("portal_mapa_contas").select("id,classificacao,grupo,cliente_id").eq("org_id", orgId).order("id").range(de, ate),
  );
  const mapaDfc = await lerTudo<{ classificacao: string; linha: string; cliente_id: string | null }>((de, ate) =>
    servico.from("portal_mapa_dfc").select("id,classificacao,linha,cliente_id").eq("org_id", orgId).order("id").range(de, ate),
  );

  const resultados: Resultado[] = [];
  for (const a of arquivos) {
    const r: Resultado = { arquivo: a.name, resultado: "erro", motivo: "" };
    let clienteId: string | null = null,
      competencia: string | null = null;
    try {
      const baixado = await graph(token, `/drives/${p.driveId}/items/${a.id}/content`);
      if (!baixado) throw new ErroAgente("O arquivo sumiu da pasta antes de ser lido.");
      const bytes = new Uint8Array(await baixado.arrayBuffer());
      const { abas, dados } = lerPlanilhaBytes(XLSX as unknown as SheetJS, a.name, bytes, true);
      const leitura = lerBalancete(dados[abas[0]]);
      const c = identificarEmpresa(leitura.cabecalho, clientes);
      const comp = competenciaDoArquivo(leitura.cabecalho);
      if (!c) {
        r.resultado = "revisar";
        r.motivo = `Empresa não encontrada no HUB (CNPJ ${leitura.cabecalho.cnpj ?? "—"}, código ${leitura.cabecalho.codigoEmpresa ?? "—"}). Importe pela tela escolhendo a empresa.`;
      } else if (!comp) {
        r.resultado = "revisar";
        r.motivo = "Não encontrei o período no cabeçalho do arquivo. Importe pela tela informando a competência.";
      } else {
        clienteId = c.id;
        competencia = comp + "-01";
        r.empresa = c.razao_social;
        r.competencia = comp;
        const existe = await servico.from("portal_balancetes").select("status").eq("cliente_id", c.id).eq("competencia", competencia).maybeSingle();
        if (existe.data) {
          r.resultado = "revisar";
          r.motivo =
            existe.data.status === "publicado"
              ? "Este mês já está publicado para o cliente. Para trocar, despublique e importe pela tela."
              : "Já existe um rascunho deste mês. Para trocar, importe pela tela marcando \"Substituir\".";
        } else {
          const linhas = leitura.linhas.map((l) => ({ ...l, grupo: null })) as Linha[];
          classificar(linhas, doCliente(mapaContas, c.id));
          const ant = await servico.from("portal_balancetes").select("resumo").eq("cliente_id", c.id).lt("competencia", competencia)
            .order("competencia", { ascending: false }).limit(1);
          const anterior = ((ant.data?.[0] as { resumo: Resumo } | undefined)?.resumo ?? null) as Resumo | null;
          const analise = analisar(linhas, competencia, anterior, leitura.cabecalho.inicio, leitura.cabecalho.fim, doCliente(mapaDfc, c.id) as MapaDfc);
          const g = await servico.rpc("portal_gravar_balancete", {
            p_org: orgId, p_cliente: c.id, p_competencia: competencia, p_arquivo: a.name,
            p_analise: analise, p_linhas: linhas, p_origem: "pasta",
          });
          if (g.error) throw new ErroAgente(`O HUB recusou a gravação: ${g.error.message}`);
          r.resultado = "importado";
          r.motivo = "Rascunho criado: revise e publique na tela de Demonstrativos.";
        }
      }
    } catch (e) {
      r.resultado = "erro";
      r.motivo = e instanceof ErroAgente ? e.message : "Arquivo ilegível ou fora do padrão do balancete do Domínio.";
      if (!(e instanceof ErroAgente)) console.error("arquivo", a.name, e);
    }
    resultados.push(r);
    // o importado já entrou no histórico pela própria função do banco; os outros entram aqui
    if (r.resultado !== "importado")
      await servico.from("hub_importacoes").insert({
        org_id: orgId, origem: "pasta", arquivo: a.name, cliente_id: clienteId, competencia,
        resultado: r.resultado, motivo: r.motivo,
      });
    await mover(token, p.driveId, a.id, r.resultado === "importado" ? p.processados : p.problema, a.name).catch((e) =>
      console.error("mover", a.name, e),
    );
  }

  const n = (t: Resultado["resultado"]) => resultados.filter((x) => x.resultado === t).length;
  const resumo = `${n("importado")} importado(s), ${n("revisar")} para revisar, ${n("erro")} com erro.`;
  // aviso no sino para administradores e gestores
  const equipe = await servico.from("membros").select("user_id").eq("org_id", orgId).eq("ativo", true).in("papel", ["admin", "gestor"]);
  const avisos = ((equipe.data ?? []) as { user_id: string }[]).map((m) => ({
    org_id: orgId, user_id: m.user_id, app: "demonstrativos",
    titulo: `Pasta de balancetes: ${resumo}`,
    texto: resultados.slice(0, 8).map((x) => `${x.arquivo}: ${x.resultado === "importado" ? `${x.empresa} ${x.competencia}` : x.motivo}`).join(" · "),
    link: "/demonstrativos/importacoes",
  }));
  if (avisos.length) await servico.from("hub_notificacoes").insert(avisos);
  return { resumo, resultados };
}

async function registrarExecucao(servico: Sb, orgId: string, resultado: string) {
  await servico.from("hub_integracoes").update({ ultima_execucao: new Date().toISOString(), ultimo_resultado: resultado.slice(0, 500) })
    .eq("org_id", orgId).eq("tipo", "sharepoint_balancetes");
}

// ------------------------------------------------------------------------------------------------ entrada
Deno.serve(async (req) => {
  const h = cors(req);
  const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let corpo: { acao?: string; org_id?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    /* corpo vazio */
  }

  // 1) agendador do banco: todas as organizações com a pasta ligada
  const tokenAgente = req.headers.get("x-agente-token");
  if (tokenAgente) {
    const ok = await servico.rpc("agente_token_confere", { p_token: tokenAgente });
    if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });
    const { data } = await servico.from("hub_integracoes").select("org_id,config").eq("tipo", "sharepoint_balancetes").eq("ativo", true);
    const saida: Record<string, string> = {};
    for (const i of (data ?? []) as { org_id: string; config: Config }[]) {
      try {
        saida[i.org_id] = (await processarOrg(servico, i.org_id, i.config)).resumo;
      } catch (e) {
        saida[i.org_id] = e instanceof ErroAgente ? e.message : "Falha inesperada ao ler a pasta.";
        if (!(e instanceof ErroAgente)) console.error("org", i.org_id, e);
      }
      await registrarExecucao(servico, i.org_id, saida[i.org_id]);
    }
    return json(200, saida);
  }

  // 2) administrador pela tela
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { erro: "Faça login de novo." });
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: quem } = await usuario.auth.getUser();
  if (!quem.user) return json(401, { erro: "Sua sessão expirou. Entre de novo." });
  if (!/^[0-9a-f-]{36}$/i.test(corpo.org_id ?? "")) return json(400, { erro: "Organização inválida." });
  // a regra de acesso da tabela só deixa o administrador ler a integração
  const { data: integ } = await usuario.from("hub_integracoes").select("config,ativo").eq("org_id", corpo.org_id!).eq("tipo", "sharepoint_balancetes").maybeSingle();
  if (!integ) return json(403, { erro: "Só o administrador usa esta tela. Salve a pasta antes de testar." });
  const config = integ.config as Config;
  if (!config?.site || !config?.pasta) return json(400, { erro: "Preencha o endereço do site, a biblioteca e a pasta e salve." });

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
      return json(200, { ok: true, mensagem: r.resumo, resultados: r.resultados });
    }
    return json(400, { erro: "Ação desconhecida." });
  } catch (e) {
    const msg = e instanceof ErroAgente ? e.message : "Falha inesperada ao falar com o SharePoint.";
    if (!(e instanceof ErroAgente)) console.error(e);
    await registrarExecucao(servico, corpo.org_id!, msg);
    return json(200, { ok: false, mensagem: msg });
  }
});
