// Regras do agente da pasta de balancetes (usado por index.ts; separado para poder ser testado sem servidor).
import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { lerPlanilhaBytes } from "./nucleo/lib/arquivos/planilhaBytes.ts";
import type { SheetJS } from "./nucleo/lib/arquivos/planilhaBytes.ts";
import { lerBalancete } from "./nucleo/dominios/demonstrativos/balancete/leitura.ts";
import { classificar } from "./nucleo/dominios/demonstrativos/balancete/classificacao.ts";
import type {
  Grupo,
  Linha,
} from "./nucleo/dominios/demonstrativos/balancete/tipos.ts";
import type { Resumo } from "./nucleo/dominios/demonstrativos/balancete/resumo.ts";
import { analisar } from "./nucleo/dominios/demonstrativos/analise.ts";
import type { MapaDfc } from "./nucleo/dominios/demonstrativos/calculosDemonstracoes.ts";
import {
  competenciaDoArquivo,
  identificarEmpresa,
} from "./nucleo/dominios/demonstrativos/importacaoLote.ts";

// deno-lint-ignore no-explicit-any
export type Sb = SupabaseClient<any>;
export type Config = { site: string; biblioteca: string; pasta: string };
type Cliente = {
  id: string;
  cnpj: string | null;
  codigo_dominio: string | null;
  razao_social: string;
};
type Resultado = {
  arquivo: string;
  resultado: "importado" | "revisar" | "erro";
  motivo: string;
  empresa?: string;
  competencia?: string;
};

export const ORIGENS = [
  "https://mdcassessoria.com",
  "https://www.mdcassessoria.com",
  "https://hub.mdcassessoria.com",
  "https://mdc-tarefas.vercel.app",
];
const POR_RODADA = 8; // arquivos por organização a cada chamada (o resto fica para a próxima, em 15 minutos; reauditoria R-M1)
const EXTENSOES = /\.(xls|xlsx|csv|txt)$/i;
const TAMANHO_MAXIMO = 5 * 1024 * 1024; // balancete do Domínio tem poucas centenas de KB; acima disso não é lido aqui

export class ErroAgente extends Error {}
/** A pasta já está sendo lida por outra chamada: não grava resultado por cima da leitura em andamento. */
export class ErroOcupado extends ErroAgente {}

// ------------------------------------------------------------------------------------------------ Microsoft Graph
export async function tokenGraph(): Promise<string> {
  const tenant = Deno.env.get("MS_TENANT_ID"),
    id = Deno.env.get("MS_CLIENT_ID"),
    segredo = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !segredo)
    throw new ErroAgente(
      "O acesso ao Microsoft 365 ainda não foi configurado. O TI precisa seguir o passo a passo de infra/microsoft-365.",
    );
  const r = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: id,
        client_secret: segredo,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token)
    throw new ErroAgente(
      "A Microsoft recusou o acesso do HUB. Confira com o TI o aplicativo e o segredo cadastrados.",
    );
  return j.access_token as string;
}

/** Erro que passa sozinho (Microsoft ocupada, rede): o arquivo fica na pasta e entra na próxima rodada. */
export class ErroPassageiro extends ErroAgente {}

async function graph(
  token: string,
  caminho: string,
  init: RequestInit = {},
): Promise<Response | null> {
  for (let tentativa = 1; ; tentativa++) {
    let r: Response;
    try {
      r = await fetch(`https://graph.microsoft.com/v1.0${caminho}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      if (tentativa < 2) continue;
      throw new ErroPassageiro(
        "Sem resposta do SharePoint agora. O arquivo fica na pasta e será lido na próxima rodada.",
      );
    }
    if (r.status === 404) return null;
    if (r.status === 401 || r.status === 403)
      throw new ErroAgente(
        "O HUB não tem permissão nessa pasta do SharePoint. O TI precisa liberar o site para o aplicativo do HUB.",
      );
    if (r.status === 429 || r.status >= 500) {
      if (tentativa < 2) {
        const espera = Math.min(Number(r.headers.get("Retry-After")) || 2, 5);
        await new Promise((ok) => setTimeout(ok, espera * 1000));
        continue;
      }
      throw new ErroPassageiro(
        `O SharePoint está ocupado (${r.status}). O arquivo fica na pasta e será lido na próxima rodada.`,
      );
    }
    if (!r.ok)
      throw new ErroAgente(
        `O SharePoint respondeu com erro (${r.status}). Tente de novo em alguns minutos.`,
      );
    return r;
  }
}

const codificar = (p: string) =>
  p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/** Acha o site, a biblioteca e a pasta; cria "Processados" e "Com problema" se faltarem. */
export async function abrirPasta(token: string, c: Config) {
  let url: URL;
  try {
    url = new URL(c.site);
  } catch {
    throw new ErroAgente(
      "O endereço do site do SharePoint não é válido (ex.: https://mdcassessoria.sharepoint.com/sites/HUB).",
    );
  }
  if (!url.hostname.endsWith(".sharepoint.com"))
    throw new ErroAgente(
      "O endereço precisa ser de um site do SharePoint (…sharepoint.com).",
    );
  const caminhoSite = url.pathname.replace(/\/+$/, "");
  const site = await graph(
    token,
    caminhoSite
      ? `/sites/${url.hostname}:${caminhoSite}`
      : `/sites/${url.hostname}`,
  );
  if (!site)
    throw new ErroAgente(
      "Não encontrei esse site do SharePoint. Confira o endereço.",
    );
  const siteId = (await site.json()).id as string;

  const drives = await graph(token, `/sites/${siteId}/drives`);
  const lista = ((await drives!.json()).value ?? []) as {
    id: string;
    name: string;
  }[];
  const alvo = c.biblioteca.trim().toLowerCase();
  const drive =
    lista.find((d) => d.name.toLowerCase() === alvo) ??
    ([
      "documentos",
      "documents",
      "shared documents",
      "documentos compartilhados",
    ].includes(alvo)
      ? lista.find((d) =>
          [
            "documentos",
            "documents",
            "shared documents",
            "documentos compartilhados",
          ].includes(d.name.toLowerCase()),
        )
      : undefined);
  if (!drive)
    throw new ErroAgente(
      `Não encontrei a biblioteca "${c.biblioteca}" nesse site. Bibliotecas existentes: ${lista.map((d) => d.name).join(", ")}.`,
    );

  const pasta = await graph(
    token,
    `/drives/${drive.id}/root:/${codificar(c.pasta)}`,
  );
  if (!pasta)
    throw new ErroAgente(
      `Não encontrei a pasta "${c.pasta}" na biblioteca ${drive.name}.`,
    );
  const pastaId = (await pasta.json()).id as string;

  const sub = async (nome: string) => {
    const existe = await graph(
      token,
      `/drives/${drive.id}/root:/${codificar(c.pasta)}/${encodeURIComponent(nome)}`,
    );
    if (existe) return (await existe.json()).id as string;
    const nova = await graph(
      token,
      `/drives/${drive.id}/items/${pastaId}/children`,
      {
        method: "POST",
        body: JSON.stringify({
          name: nome,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
    );
    return (await nova!.json()).id as string;
  };
  return {
    driveId: drive.id,
    pastaId,
    processados: await sub("Processados"),
    problema: await sub("Com problema"),
  };
}

export async function arquivosDaPasta(
  token: string,
  driveId: string,
  pastaId: string,
) {
  const r = await graph(
    token,
    `/drives/${driveId}/items/${pastaId}/children?$top=200&$select=id,name,file,size`,
  );
  const itens = ((await r!.json()).value ?? []) as {
    id: string;
    name: string;
    file?: unknown;
    size: number;
  }[];
  return itens
    .filter((i) => i.file && EXTENSOES.test(i.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Move o arquivo para outra pasta (com carimbo de data no nome, se pedido). Devolve false se não conseguiu. */
async function mover(
  token: string,
  driveId: string,
  itemId: string,
  destino: string,
  novoNome?: string,
): Promise<boolean> {
  try {
    const r = await graph(
      token,
      `/drives/${driveId}/items/${itemId}?@microsoft.graph.conflictBehavior=rename`,
      {
        method: "PATCH",
        body: JSON.stringify({
          parentReference: { id: destino },
          ...(novoNome ? { name: novoNome } : {}),
        }),
      },
    );
    return !!r;
  } catch (e) {
    console.error("mover", itemId, e);
    return false;
  }
}

const carimbo = () =>
  new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

// ------------------------------------------------------------------------------------------------ leitura do banco
async function lerTudo<T>(
  montar: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (;;) {
    const { data, error } = await montar(todas.length, todas.length + 999);
    if (error)
      throw new ErroAgente(
        "Não consegui ler os dados do HUB. Tente de novo em instantes.",
      );
    const p = (data as T[] | null) ?? [];
    if (!p.length) return todas;
    todas.push(...p);
  }
}

/** Mesmo critério da tela: a regra do cliente vem depois da padrão e prevalece. */
const doCliente = <R extends { cliente_id: string | null }>(
  rows: R[],
  cliente: string,
) => [
  ...rows.filter((r) => !r.cliente_id),
  ...rows.filter((r) => r.cliente_id === cliente),
];

// ------------------------------------------------------------------------------------------------ uma organização
const LENDO = "Lendo a pasta agora";

/** Trava simples (auditoria B-1): "Ler a pasta agora" e o agendador não leem a mesma pasta ao mesmo tempo.
 *  Um único UPDATE condicional; a trava vence sozinha em 10 minutos se a função cair no meio. */
async function travar(servico: Sb, orgId: string): Promise<boolean> {
  const limite = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await servico
    .from("hub_integracoes")
    .update({
      ultima_execucao: new Date().toISOString(),
      ultimo_resultado: LENDO,
    })
    .eq("org_id", orgId)
    .eq("tipo", "sharepoint_balancetes")
    .or(
      `ultimo_resultado.is.null,ultimo_resultado.neq."${LENDO}",ultima_execucao.lt.${limite}`,
    )
    .select("org_id");
  if (error)
    throw new ErroAgente(
      "Não consegui ler os dados do HUB. Tente de novo em instantes.",
    );
  return (data ?? []).length > 0;
}

export async function processarOrg(
  servico: Sb,
  orgId: string,
  config: Config,
): Promise<{ resumo: string; resultados: Resultado[] }> {
  if (!(await travar(servico, orgId)))
    throw new ErroOcupado(
      "A pasta já está sendo lida neste momento. Aguarde alguns minutos.",
    );
  const token = await tokenGraph();
  const p = await abrirPasta(token, config);
  const arquivos = (await arquivosDaPasta(token, p.driveId, p.pastaId)).slice(
    0,
    POR_RODADA,
  );
  if (!arquivos.length)
    return { resumo: "Pasta lida: nenhum arquivo novo.", resultados: [] };

  const clientes = await lerTudo<Cliente>((de, ate) =>
    servico
      .from("clientes")
      .select("id,cnpj,codigo_dominio,razao_social")
      .eq("org_id", orgId)
      .order("id")
      .range(de, ate),
  );
  const mapaContas = await lerTudo<{
    classificacao: string;
    grupo: Grupo;
    cliente_id: string | null;
  }>((de, ate) =>
    servico
      .from("portal_mapa_contas")
      .select("id,classificacao,grupo,cliente_id")
      .eq("org_id", orgId)
      .order("id")
      .range(de, ate),
  );
  const mapaDfc = await lerTudo<{
    classificacao: string;
    linha: string;
    cliente_id: string | null;
  }>((de, ate) =>
    servico
      .from("portal_mapa_dfc")
      .select("id,classificacao,linha,cliente_id")
      .eq("org_id", orgId)
      .order("id")
      .range(de, ate),
  );

  // Ordem segura (auditoria A-2, A-3, M-1, M-2):
  //  1. arquivo grande demais vai direto para "Com problema", sem baixar;
  //  2. baixa (falha passageira → o arquivo fica na pasta para a próxima rodada);
  //  3. ANTES de ler, move para "Com problema" e deixa no histórico "leitura interrompida": se a leitura derrubar a
  //     função, o arquivo não volta a ser lido a cada 15 minutos e o histórico mostra o que houve;
  //  4. grava na ordem empresa → mês (o alerta "comparado com o mês anterior" usa o mês certo);
  //  5. só o importado vai para "Processados".
  const resultados: Resultado[] = [];
  type Lido = {
    a: (typeof arquivos)[number];
    hist: number | null;
    leitura: ReturnType<typeof lerBalancete>;
    cliente: Cliente;
    comp: string;
  };
  const lidos: Lido[] = [];
  let adiados = 0;

  const historico = async (
    dados: Record<string, unknown>,
    id: number | null,
  ) => {
    const q = id
      ? await servico
          .from("hub_importacoes")
          .update(dados)
          .eq("id", id)
          .select("id")
          .maybeSingle()
      : await servico
          .from("hub_importacoes")
          .insert({ org_id: orgId, origem: "pasta", ...dados })
          .select("id")
          .maybeSingle();
    if (q.error) console.error("histórico", q.error.message);
    return (q.data as { id: number } | null)?.id ?? id;
  };
  const concluir = async (
    a: (typeof arquivos)[number],
    hist: number | null,
    r: Resultado,
    clienteId: string | null,
    competencia: string | null,
  ) => {
    resultados.push(r);
    if (r.resultado === "importado") {
      // o importado já entrou no histórico pela função do banco; tira a marca provisória
      if (hist) {
        const d = await servico.from("hub_importacoes").delete().eq("id", hist);
        if (d.error) console.error("histórico", d.error.message);
      }
      await mover(token, p.driveId, a.id, p.processados);
    } else {
      await historico(
        {
          arquivo: a.name,
          cliente_id: clienteId,
          competencia,
          resultado: r.resultado,
          motivo: r.motivo,
        },
        hist,
      );
    }
  };

  for (const a of arquivos) {
    if (a.size > TAMANHO_MAXIMO) {
      const r: Resultado = {
        arquivo: a.name,
        resultado: "erro",
        motivo: `Arquivo grande demais para a leitura automática (${(a.size / 1048576).toFixed(1)} MB). Confira se é mesmo o balancete e importe pela tela.`,
      };
      if (
        await mover(
          token,
          p.driveId,
          a.id,
          p.problema,
          `${carimbo()}-${a.name}`,
        )
      )
        await concluir(a, null, r, null, null);
      else adiados++;
      continue;
    }
    let bytes: Uint8Array;
    try {
      const baixado = await graph(
        token,
        `/drives/${p.driveId}/items/${a.id}/content`,
      );
      if (!baixado) continue; // sumiu da pasta: nada a fazer
      bytes = new Uint8Array(await baixado.arrayBuffer());
    } catch (e) {
      if (e instanceof ErroPassageiro) {
        adiados++;
        continue;
      }
      throw e; // permissão / configuração: vale para a pasta toda
    }
    if (
      !(await mover(
        token,
        p.driveId,
        a.id,
        p.problema,
        `${carimbo()}-${a.name}`,
      ))
    ) {
      adiados++; // não conseguiu tirar da entrada: tenta de novo na próxima rodada, sem aviso repetido
      continue;
    }
    const hist = await historico(
      {
        arquivo: a.name,
        resultado: "erro",
        motivo:
          "A leitura deste arquivo foi interrompida (arquivo fora do padrão ou pesado demais). Importe pela tela.",
      },
      null,
    );
    try {
      const { abas, dados } = lerPlanilhaBytes(
        XLSX as unknown as SheetJS,
        a.name,
        bytes,
        true,
      );
      const leitura = lerBalancete(dados[abas[0]]);
      const c = identificarEmpresa(leitura.cabecalho, clientes);
      const comp = competenciaDoArquivo(leitura.cabecalho);
      if (!c)
        await concluir(
          a,
          hist,
          {
            arquivo: a.name,
            resultado: "revisar",
            motivo: `Empresa não encontrada no HUB (CNPJ ${leitura.cabecalho.cnpj ?? "—"}, código ${leitura.cabecalho.codigoEmpresa ?? "—"}). Importe pela tela escolhendo a empresa.`,
          },
          null,
          null,
        );
      else if (!comp)
        await concluir(
          a,
          hist,
          {
            arquivo: a.name,
            resultado: "revisar",
            motivo:
              "Não encontrei o período no cabeçalho do arquivo. Importe pela tela informando a competência.",
            empresa: c.razao_social,
          },
          c.id,
          null,
        );
      else lidos.push({ a, hist, leitura, cliente: c, comp });
    } catch (e) {
      // a mensagem do leitor já é escrita para o usuário (ex.: "Não encontrei os títulos das colunas…")
      const motivo =
        e instanceof Error && e.message && e.message.length < 300
          ? e.message
          : "Arquivo ilegível ou fora do padrão do balancete do Domínio.";
      if (!(e instanceof ErroAgente)) console.error("arquivo", a.name, e);
      await concluir(
        a,
        hist,
        { arquivo: a.name, resultado: "erro", motivo },
        null,
        null,
      );
    }
  }

  lidos.sort(
    (x, y) =>
      x.cliente.razao_social.localeCompare(y.cliente.razao_social) ||
      x.comp.localeCompare(y.comp),
  );
  for (const { a, hist, leitura, cliente: c, comp } of lidos) {
    const competencia = comp + "-01";
    const r: Resultado = {
      arquivo: a.name,
      resultado: "erro",
      motivo: "",
      empresa: c.razao_social,
      competencia: comp,
    };
    try {
      const existe = await servico
        .from("portal_balancetes")
        .select("status")
        .eq("cliente_id", c.id)
        .eq("competencia", competencia)
        .maybeSingle();
      if (existe.error)
        throw new ErroPassageiro("Não consegui consultar o HUB agora.");
      if (existe.data) {
        r.resultado = "revisar";
        r.motivo =
          existe.data.status === "publicado"
            ? "Este mês já está publicado para o cliente. Para trocar, despublique e importe pela tela."
            : 'Já existe um rascunho deste mês. Para trocar, importe pela tela marcando "Substituir".';
      } else {
        const linhas = leitura.linhas.map((l) => ({
          ...l,
          grupo: null,
        })) as Linha[];
        classificar(linhas, doCliente(mapaContas, c.id));
        const ant = await servico
          .from("portal_balancetes")
          .select("resumo")
          .eq("cliente_id", c.id)
          .lt("competencia", competencia)
          .order("competencia", { ascending: false })
          .limit(1);
        if (ant.error)
          throw new ErroPassageiro("Não consegui consultar o HUB agora.");
        const anterior = ((ant.data?.[0] as { resumo: Resumo } | undefined)
          ?.resumo ?? null) as Resumo | null;
        const analise = analisar(
          linhas,
          competencia,
          anterior,
          leitura.cabecalho.inicio,
          leitura.cabecalho.fim,
          doCliente(mapaDfc, c.id) as MapaDfc,
        );
        const g = await servico.rpc("portal_gravar_balancete", {
          p_org: orgId,
          p_cliente: c.id,
          p_competencia: competencia,
          p_arquivo: a.name,
          p_analise: analise,
          p_linhas: linhas,
          p_origem: "pasta",
        });
        if (g.error)
          throw new ErroAgente(`O HUB recusou a gravação: ${g.error.message}`);
        r.resultado = "importado";
        r.motivo =
          "Rascunho criado: revise e publique na tela de Demonstrativos.";
      }
    } catch (e) {
      r.resultado = "erro";
      r.motivo =
        e instanceof ErroAgente
          ? e.message
          : "Falha ao calcular este balancete. Importe pela tela.";
      if (!(e instanceof ErroAgente)) console.error("arquivo", a.name, e);
    }
    await concluir(a, hist, r, c.id, competencia);
  }

  if (!resultados.length)
    return {
      resumo: adiados
        ? `${adiados} arquivo(s) ficaram para a próxima rodada (SharePoint ocupado).`
        : "Pasta lida: nenhum arquivo novo.",
      resultados,
    };

  const n = (t: Resultado["resultado"]) =>
    resultados.filter((x) => x.resultado === t).length;
  const resumo =
    `${n("importado")} importado(s), ${n("revisar")} para revisar, ${n("erro")} com erro.` +
    (adiados ? ` ${adiados} ficaram para a próxima rodada.` : "");
  // aviso no sino para administradores e gestores
  const equipe = await servico
    .from("membros")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("ativo", true)
    .in("papel", ["admin", "gestor"]);
  const avisos = ((equipe.data ?? []) as { user_id: string }[]).map((m) => ({
    org_id: orgId,
    user_id: m.user_id,
    app: "demonstrativos",
    titulo: `Pasta de balancetes: ${resumo}`,
    texto: resultados
      .slice(0, 8)
      .map(
        (x) =>
          `${x.arquivo}: ${x.resultado === "importado" ? `${x.empresa} ${x.competencia}` : x.motivo}`,
      )
      .join(" · "),
    link: "/demonstrativos/importacoes",
  }));
  if (avisos.length) {
    const av = await servico.from("hub_notificacoes").insert(avisos);
    if (av.error) console.error("avisos", av.error.message);
  }
  return { resumo, resultados };
}

export async function registrarExecucao(
  servico: Sb,
  orgId: string,
  resultado: string,
) {
  const { error } = await servico
    .from("hub_integracoes")
    .update({
      ultima_execucao: new Date().toISOString(),
      ultimo_resultado: resultado.slice(0, 500),
    })
    .eq("org_id", orgId)
    .eq("tipo", "sharepoint_balancetes");
  if (error) console.error("registrar execução", error.message);
}
