// Edge Function: gera o PDF completo das demonstrações no padrão MDC e, quando tudo o que entra nele está
// publicado e há certificado A1 cadastrado, assina digitalmente.
// Pode ser de um mês (o balancete pedido) ou do período escolhido na tela (trimestre, semestre, ano): nesse caso o
// cálculo é refeito aqui, com as mesmas regras da tela (selecaoPeriodo.ts), só com meses publicados, para que
// ninguém consiga mandar números próprios para um documento assinado pela MDC.
// O acesso aos balancetes segue as regras do banco (RLS) do usuário que pediu.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gerarPdf } from "./pdf.ts";
import { assinar } from "./assinatura.ts";
import { somarDfc, somarDre } from "./demonstracoes.ts";
import type { Demonstracoes, Dfc } from "./demonstracoes.ts";
import type { Alerta, Linha, Resumo } from "./balancete.ts";
import { VISOES, listarMeses, mesmoPeriodoAnoAnterior, quantosPeriodos, rotuloEscolha, selecionar } from "./selecaoPeriodo.ts";
import { situacaoPdf } from "./pdfPeriodo.ts";
import type { Escolha, RegPeriodo, Visao } from "./selecaoPeriodo.ts";
import { combinarLinhas } from "./linhasPeriodo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition, x-assinado",
};


// logo da organização (enviada no Hub e guardada no Storage); cache por caminho
const cacheLogo = new Map<string, Uint8Array | null>();

async function baixar(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

const CAMPOS_LINHA = "classificacao,codigo,descricao,nivel,analitica,saldo_anterior,debitos,creditos,saldo_atual,grupo";

/** Todas as linhas do balancete, página por página: a API do Supabase corta cada consulta em 1.000 linhas sem avisar. */
// deno-lint-ignore no-explicit-any
async function lerTodasLinhas(sb: SupabaseClient<any>, balanceteId: string) {
  const data: Record<string, unknown>[] = [];
  for (;;) {
    const r = await sb
      .from("portal_balancete_linhas")
      .select(CAMPOS_LINHA)
      .eq("balancete_id", balanceteId)
      .order("classificacao")
      .order("id")
      .range(data.length, data.length + 999);
    if (r.error) return { data: null, error: r.error };
    if (!r.data?.length) return { data, error: null };
    data.push(...(r.data as Record<string, unknown>[]));
    if (data.length > 200_000) return { data: null, error: new Error("balancete grande demais") };
  }
}

/** Período pedido pela tela; null quando não veio (PDF do mês) e "invalido" quando veio errado. */
function lerEscolha(x: unknown): Escolha | null | "invalido" {
  if (x == null) return null;
  const o = x as Record<string, unknown>;
  const ano = Number(o.ano),
    numero = Number(o.numero),
    visao = String(o.visao) as Visao;
  if (!VISOES.some((v) => v.id === visao)) return "invalido";
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return "invalido";
  if (!Number.isInteger(numero) || numero < 1 || numero > quantosPeriodos(visao)) return "invalido";
  return { ano, visao, numero };
}

const num = (x: Record<string, unknown>) =>
  ({
    ...x,
    saldo_anterior: Number(x.saldo_anterior),
    debitos: Number(x.debitos),
    creditos: Number(x.creditos),
    saldo_atual: Number(x.saldo_atual),
  }) as unknown as Linha;

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login para baixar o PDF." });
  let id = "";
  let escolha: Escolha | null | "invalido" = null;
  try {
    const corpo = await req.json();
    id = String(corpo.balancete_id ?? "");
    escolha = lerEscolha(corpo.periodo);
  } catch {
    /* corpo inválido */
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { erro: "Balancete inválido." });
  if (escolha === "invalido") return json(400, { erro: "Período inválido. Escolha o período de novo na tela." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1. o próprio usuário precisa conseguir ler o balancete (equipe com acesso ou cliente com o mês publicado)
  let { data: b } = await usuario.from("portal_balancetes").select("*").eq("id", id).maybeSingle();
  if (!b) return json(404, { erro: "Balancete não encontrado ou sem permissão." });

  // período de um mês só: é o PDF daquele mês (pode ser outro mês que não o aberto na tela)
  if (escolha?.visao === "mensal") {
    const competencia = `${escolha.ano}-${String(escolha.numero).padStart(2, "0")}-01`;
    const { data: m } = await usuario.from("portal_balancetes").select("*").eq("cliente_id", b.cliente_id).eq("competencia", competencia).maybeSingle();
    if (!m) return json(404, { erro: `Não há balancete de ${rotuloEscolha(escolha)} para baixar.` });
    b = m;
    id = String(m.id);
    escolha = null;
  }
  if (escolha) return await pdfDoPeriodo(usuario, servico, b, escolha);
  if (!b.demonstracoes) return json(409, { erro: "As demonstrações deste mês ainda não foram geradas. Peça à MDC para reprocessar o balancete." });

  const ano = String(b.competencia).slice(0, 4);
  const [linhas, hist, cli, par] = await Promise.all([
    lerTodasLinhas(usuario, id),
    // acumulado: só meses publicados (revisados) + o próprio mês; rascunho nunca entra no PDF
    usuario.from("portal_balancetes").select("competencia,resumo,demonstracoes").eq("cliente_id", b.cliente_id).gte("competencia", `${ano}-01-01`).lte("competencia", b.competencia).or(`status.eq.publicado,id.eq.${id}`).order("competencia"),
    servico.from("clientes").select("razao_social,cnpj").eq("id", b.cliente_id).single(),
    usuario.from("portal_pareceres").select("texto,status,contador_nome,contador_crc,versao").eq("balancete_id", id).order("versao", { ascending: false }),
  ]);
  if (linhas.error) return json(500, { erro: "Não foi possível ler todas as contas do balancete. Tente de novo em instantes." });
  const pareceres = (par.data ?? []) as { texto: string; status: string; contador_nome: string | null; contador_crc: string | null }[];
  const parecer = pareceres.find((p) => p.status === "publicado") ?? (b.status !== "publicado" ? pareceres[0] : undefined) ?? null;

  // acumulado do ano somando os meses (quando todos os meses do ano estão disponíveis)
  const demo = b.demonstracoes as Demonstracoes;
  const meses = (hist.data ?? []) as { competencia: string; resumo: Resumo; demonstracoes: Demonstracoes | null }[];
  const completo = demo.periodo.dias <= 31 && meses.length === Number(String(b.competencia).slice(5, 7)) && meses.length > 1;
  const acumulado = completo
    ? {
        titulo: `Acumulado ${ano}`,
        dre: somarDre(meses.map((m) => m.resumo.mes)),
        dfc: somarDfc(meses.map((m) => m.demonstracoes?.dfc).filter((x): x is Dfc => !!x)),
      }
    : null;

  return await finalizar(servico, b.org_id, b.status === "publicado", (cli.data ?? null) as Cliente | null, {
    competencia: b.competencia,
    status: b.status,
    resumo: b.resumo,
    indices: b.indices,
    alertas: b.alertas ?? [],
    demonstracoes: demo,
    acumulado,
    linhas: (linhas.data ?? []).map(num),
    comentario: b.comentario,
    parecer,
  });
});

type Cliente = { razao_social: string; cnpj: string | null };
type Dados = Omit<Parameters<typeof gerarPdf>[0], "empresa" | "cnpj" | "logo" | "assinatura">;
// deno-lint-ignore no-explicit-any
type Sb = SupabaseClient<any>;

/** PDF completo do período escolhido (trimestre, semestre ou ano), só com meses publicados. */
// deno-lint-ignore no-explicit-any
async function pdfDoPeriodo(usuario: Sb, servico: Sb, ref: any, escolha: Escolha) {
  const { data, error } = await usuario
    .from("portal_balancetes")
    .select("id,competencia,status,resumo,indices,alertas,demonstracoes,periodo_inicio")
    .eq("cliente_id", ref.cliente_id)
    .eq("status", "publicado")
    .gte("competencia", `${escolha.ano - 1}-01-01`)
    .lte("competencia", `${escolha.ano}-12-01`)
    .order("competencia");
  if (error) return json(500, { erro: "Não foi possível ler os balancetes do período. Tente de novo em instantes." });
  type Reg = RegPeriodo & { id: string; alertas: Alerta[] | null };
  const hist = (data ?? []) as Reg[];
  const sel = selecionar(hist, escolha);
  if (!sel) return json(404, { erro: `Nenhum mês de ${rotuloEscolha(escolha)} foi publicado ainda.` });
  // período com mês publicado faltando antes do último: os números não fechariam, então não gera
  const sit = situacaoPdf(sel.meses, sel.importados);
  if (sit.tipo === "lacuna")
    return json(409, { erro: `Para baixar o PDF de ${sel.rotulo}, publique antes: ${listarMeses(sit.faltam)}.` });
  const parcial = sit.tipo === "parcial";
  const base = sel.base.demonstracoes;
  if (!base || !sel.ag.dfc || !sel.ag.balanco || sel.registros.some((r) => !r.demonstracoes))
    return json(409, { erro: `Algum mês de ${sel.rotulo} está sem as demonstrações geradas. Peça à MDC para reprocessar os balancetes do período.` });

  const lidas = await Promise.all(sel.registros.map((r) => lerTodasLinhas(usuario, r.id)));
  if (lidas.some((l) => l.error)) return json(500, { erro: "Não foi possível ler todas as contas do período. Tente de novo em instantes." });
  const linhas = combinarLinhas(lidas.map((l) => (l.data ?? []).map(num)));

  // comparação só entre períodos inteiros (parcial contra ano completo não diz nada)
  const ant = mesmoPeriodoAnoAnterior(hist, escolha);
  const anterior = !parcial && ant && situacaoPdf(ant.meses, ant.importados).tipo === "completo" ? ant : null;
  const dias = Math.round((Date.parse(sel.fim) - Date.parse(sel.inicio)) / 864e5) + 1;
  const { data: cli } = await servico.from("clientes").select("razao_social,cnpj").eq("id", ref.cliente_id).single();
  // assina só período completo; parcial sai sem assinatura e com selo
  return await finalizar(servico, ref.org_id, !parcial, (cli ?? null) as Cliente | null, {
    competencia: sel.base.competencia,
    status: "publicado",
    resumo: sel.ag.resumo,
    indices: sel.ag.indices,
    alertas: sel.base.alertas ?? [],
    demonstracoes: {
      periodo: { inicio: sel.inicio, fim: sel.fim, dias },
      balanco: sel.ag.balanco,
      dfc: sel.ag.dfc,
      cruzamento: sel.ag.cruzamento ?? base.cruzamento,
      saude: sel.ag.saude ?? base.saude,
    },
    acumulado: anterior ? { titulo: anterior.rotulo, dre: anterior.ag.dre, dfc: anterior.ag.dfc } : null,
    linhas,
    comentario: null,
    parecer: null,
    rotulo: parcial ? `${sel.rotulo} (parcial)` : sel.rotulo,
    completude:
      sel.fonte === "acumulado"
        ? sel.completude
        : parcial
          ? `Período parcial: ${listarMeses(sel.importados)} publicados · ainda não entraram ${listarMeses(sit.faltam)}`
          : `${sel.meses.length} de ${sel.meses.length} meses publicados`,
    parcial,
  });
}

/** Logo, certificado, geração e assinatura: comum ao PDF do mês e ao do período. */
async function finalizar(servico: Sb, orgId: string, publicado: boolean, cli: Cliente | null, dados: Dados) {
  const b = { org_id: orgId };
  // 2. certificado: só assina o que está publicado
  type Cert = { pfx: string; senha: string; titular: string; emissor: string; valido_ate: string };
  let cert: Cert | null = null;
  if (publicado) {
    const { data } = await servico.rpc("cert_obter", { p_org: b.org_id });
    const c = (data as Cert[] | null)?.[0] ?? null;
    if (c && new Date(c.valido_ate) > new Date()) cert = c;
  }

  const { data: orgRow } = await servico.from("organizacoes").select("logo_url").eq("id", b.org_id).single();
  const logoUrl = (orgRow as { logo_url: string | null } | null)?.logo_url ?? "";
  // só a logo da própria organização (Storage) ou do site da MDC
  const permitida =
    (logoUrl.startsWith("storage:") && logoUrl.slice(8).startsWith(`${b.org_id}/`) && !logoUrl.includes("..")) ||
    /^https:\/\/(www\.)?mdcassessoria\.com\//.test(logoUrl);
  if (logoUrl && permitida && !cacheLogo.has(logoUrl)) {
    if (logoUrl.startsWith("storage:")) {
      const { data: arq } = await servico.storage.from("hub-arquivos").download(logoUrl.slice(8));
      cacheLogo.set(logoUrl, arq ? new Uint8Array(await arq.arrayBuffer()) : null);
    } else cacheLogo.set(logoUrl, await baixar(logoUrl));
  }
  const logo = cacheLogo.get(logoUrl) ?? null;

  const cliente = cli ?? { razao_social: "Empresa", cnpj: null };
  const pdf = await gerarPdf({
    ...dados,
    empresa: cliente.razao_social,
    cnpj: cliente.cnpj,
    assinatura: cert ? { titular: cert.titular, emissor: cert.emissor, validade: cert.valido_ate.slice(0, 10).split("-").reverse().join("/") } : null,
    logo,
  });

  let bytes: Uint8Array;
  let assinado = false;
  if (cert) {
    try {
      const pfx = Uint8Array.from(atob(cert.pfx), (c) => c.charCodeAt(0));
      bytes = await assinar(pdf, pfx, cert.senha, {
        nome: cert.titular,
        motivo: "Responsável técnico pelas demonstrações contábeis",
        local: "Bragança Paulista/SP",
        contato: "MDC Assessoria Contábil",
      });
      assinado = true;
    } catch (e) {
      console.error("falha ao assinar", e);
      bytes = await pdf.save();
    }
  } else bytes = await pdf.save();

  const quando = dados.rotulo ? dados.rotulo.replace(/\s+/g, "-") : String(dados.competencia).slice(0, 7);
  const nome = `MDC-${cliente.razao_social.split(" ").slice(0, 2).join("-")}-${quando}${assinado ? "-assinado" : ""}.pdf`
    .normalize("NFD")
    .replace(/[^\w.-]/g, "");
  return new Response(bytes as unknown as BodyInit, {
    headers: { ...CORS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"`, "x-assinado": assinado ? "1" : "0" },
  });
}
