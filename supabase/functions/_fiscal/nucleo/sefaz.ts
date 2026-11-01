// Cópia de web/src/dominios/notas/sefaz.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// Comunicação com a SEFAZ (Ambiente Nacional) e com o Ambiente de Dados Nacional da NFS-e (ADN): endereços, montagem
// das mensagens SOAP e leitura dos retornos. Código puro (sem rede): a Função Edge faz a chamada com o certificado.
//
// Fontes:
//  - NT 2014.002 v1.40 (Distribuição de DF-e de interesse dos atores da NF-e), Portal Nacional da NF-e.
//  - NT 2020.001 v1.60 (Manifestação do Destinatário; prazo conclusivo de 90 dias desde 01/06/2026, Ajuste SINIEF 14/26).
//  - Endereços e montagem do evento conferidos com o projeto aberto NFePHP/sped-nfe (storage/wsnfe_4.00_mod55.xml e
//    src/Tools.php: sefazDistDFe, sefazEvento, sefazManifesta).
//  - ADN (NFS-e Nacional): "Manual Contribuintes – APIs ADN" (gov.br/nfse) e o projeto aberto dfe-nfse (PyPI):
//    GET {base}/DFe/{NSU}?cnpjConsulta=...&lote=true, resposta JSON com LoteDFe[].ArquivoXml em gzip + base64.
import { descendente, filho, filhos, lerXml, txt } from "./xml.ts";
import type { NoXml } from "./xml.ts";

export type Ambiente = "producao" | "homologacao";

export const URLS = {
  /** NFeDistribuicaoDFe do Ambiente Nacional (SOAP 1.2, método nfeDistDFeInteresse, versão 1.01). */
  distDFe: {
    producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  },
  /** NFeRecepcaoEvento4 do Ambiente Nacional (manifestação do destinatário, cOrgao 91). */
  recepcaoEvento: {
    producao: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
    homologacao: "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  },
  /** API de contribuintes do ADN da NFS-e Nacional. */
  adn: {
    producao: "https://adn.nfse.gov.br/contribuintes",
    homologacao: "https://adn.producaorestrita.nfse.gov.br/contribuintes",
  },
} as const;

export const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
export const NS_DIST = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
export const NS_EVENTO = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";
export const NS_SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
/** Órgão do Ambiente Nacional nos eventos de manifestação. */
export const ORGAO_AN = "91";

/** Código IBGE da UF (cUFAutor). */
export const CODIGO_UF: Record<string, string> = {
  RO: "11",
  AC: "12",
  AM: "13",
  RR: "14",
  PA: "15",
  AP: "16",
  TO: "17",
  MA: "21",
  PI: "22",
  CE: "23",
  RN: "24",
  PB: "25",
  PE: "26",
  AL: "27",
  SE: "28",
  BA: "29",
  MG: "31",
  ES: "32",
  RJ: "33",
  SP: "35",
  PR: "41",
  SC: "42",
  RS: "43",
  MS: "50",
  MT: "51",
  GO: "52",
  DF: "53",
};

export const tpAmb = (a: Ambiente) => (a === "producao" ? "1" : "2");
const so = (s: string) => s.replace(/\D/g, "");
export const nsu15 = (n: number | string) => String(n).replace(/\D/g, "").padStart(15, "0").slice(-15);

/** Envelope SOAP 1.2 (igual ao do sped-nfe). */
export function envelopeSoap12(corpo: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="${NS_SOAP12}">` +
    `<soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`
  );
}

export interface RequisicaoSoap {
  url: string;
  corpo: string;
  /** Cabeçalho Content-Type (SOAP 1.2 leva a ação aqui). */
  contentType: string;
}

const tipoSoap = (ns: string, metodo: string) => `application/soap+xml; charset=utf-8; action="${ns}/${metodo}"`;

/**
 * Consulta da Distribuição DF-e. Sem `chave`: próximos documentos depois de `ultNSU` (lote de até 50).
 * Com `chave`: um documento pela chave (consChNFe), usado para buscar o XML completo depois da ciência.
 */
export function montarDistDFe(o: {
  ambiente: Ambiente;
  uf: string;
  cnpj: string;
  ultNSU?: number | string;
  chave?: string;
}): RequisicaoSoap {
  const cuf = CODIGO_UF[(o.uf ?? "").toUpperCase()];
  if (!cuf) throw new Error(`UF da empresa inválida ou não cadastrada (${o.uf || "vazia"}). Corrija o cadastro do cliente.`);
  const cnpj = so(o.cnpj);
  if (cnpj.length !== 14) throw new Error("CNPJ da empresa inválido para consultar a SEFAZ.");
  const consulta = o.chave
    ? `<consChNFe><chNFe>${so(o.chave)}</chNFe></consChNFe>`
    : `<distNSU><ultNSU>${nsu15(o.ultNSU ?? 0)}</ultNSU></distNSU>`;
  const dist =
    `<distDFeInt xmlns="${NS_NFE}" versao="1.01"><tpAmb>${tpAmb(o.ambiente)}</tpAmb><cUFAutor>${cuf}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ>${consulta}</distDFeInt>`;
  return {
    url: URLS.distDFe[o.ambiente],
    corpo: envelopeSoap12(`<nfeDistDFeInteresse xmlns="${NS_DIST}"><nfeDadosMsg>${dist}</nfeDadosMsg></nfeDistDFeInteresse>`),
    contentType: tipoSoap(NS_DIST, "nfeDistDFeInteresse"),
  };
}

export interface DocZip {
  nsu: number;
  /** Ex.: "resNFe_v1.01.xsd", "procNFe_v4.00.xsd", "resEvento_v1.01.xsd", "procEventoNFe_v1.00.xsd". */
  schema: string;
  /** Conteúdo ainda compactado (gzip + base64). */
  conteudo: string;
}

export interface RetornoDistDFe {
  cStat: string;
  xMotivo: string;
  dhResp: string | null;
  ultNSU: number;
  maxNSU: number;
  documentos: DocZip[];
}

/** Se a resposta SOAP veio com erro (Fault), devolve a mensagem. */
function falhaSoap(raiz: NoXml): string | null {
  const corpo = filho(raiz, "Body");
  const fault = filho(corpo, "Fault");
  if (!fault) return null;
  return txt(fault, "Reason/Text") ?? txt(fault, "faultstring") ?? "Falha SOAP sem descrição";
}

/** Lê o retorno retDistDFeInt (aceita a resposta SOAP inteira ou só o retDistDFeInt). */
export function lerRetornoDistDFe(xml: string): RetornoDistDFe {
  const raiz = lerXml(xml);
  const falha = falhaSoap(raiz);
  if (falha) throw new Error(`A SEFAZ recusou a consulta: ${falha}`);
  const ret = descendente(raiz, "retDistDFeInt");
  if (!ret) throw new Error("A SEFAZ respondeu sem o retorno da distribuição (retDistDFeInt).");
  const lote = filho(ret, "loteDistDFeInt");
  return {
    cStat: txt(ret, "cStat") ?? "",
    xMotivo: txt(ret, "xMotivo") ?? "",
    dhResp: txt(ret, "dhResp"),
    ultNSU: Number(txt(ret, "ultNSU") ?? 0),
    maxNSU: Number(txt(ret, "maxNSU") ?? 0),
    documentos: filhos(lote, "docZip").map((d) => ({
      nsu: Number(d.atributos.NSU ?? 0),
      schema: d.atributos.schema ?? "",
      conteudo: d.texto.trim(),
    })),
  };
}

// ------------------------------------------------------------------------------------------------ gzip

function base64ParaBytes(b64: string): Uint8Array {
  const limpo = b64.replace(/\s/g, "");
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Descompacta um docZip (ou ArquivoXml do ADN): base64 → gzip → texto UTF-8. */
export async function descompactarDocZip(b64: string): Promise<string> {
  const bytes = base64ParaBytes(b64);
  const fluxo = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(fluxo).text();
}

/** Compacta em gzip + base64 (usado nos testes para montar docZip de exemplo). */
export async function compactarDocZip(texto: string): Promise<string> {
  const fluxo = new Blob([new TextEncoder().encode(texto) as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ------------------------------------------------------------------------------------------------ eventos

export type CodigoManifestacao = "ciencia" | "confirmada" | "desconhecida" | "nao_realizada";

/** Eventos da manifestação do destinatário: código SEFAZ, descrição exata exigida no XML e nome para o leigo. */
export const EVENTOS: Record<CodigoManifestacao, { tp: string; descEvento: string; nome: string; explicacao: string }> = {
  ciencia: {
    tp: "210210",
    descEvento: "Ciencia da Operacao",
    nome: "Ciência da operação",
    explicacao: "Avisa a SEFAZ que a empresa viu a nota. Libera o XML completo, mas ainda não confirma a compra.",
  },
  confirmada: {
    tp: "210200",
    descEvento: "Confirmacao da Operacao",
    nome: "Confirmação da operação",
    explicacao: "A empresa confirma que comprou e recebeu. Só nota confirmada vira conta a pagar e entrada de estoque.",
  },
  desconhecida: {
    tp: "210220",
    descEvento: "Desconhecimento da Operacao",
    nome: "Desconhecimento da operação",
    explicacao: "A empresa não reconhece esta compra (pode ser uso indevido do CNPJ).",
  },
  nao_realizada: {
    tp: "210240",
    descEvento: "Operacao nao Realizada",
    nome: "Operação não realizada",
    explicacao: "A compra existiu mas não aconteceu (devolvida, recusada na entrega). Exige justificativa.",
  },
};

export const manifestacaoDoTipo = (tp: string): CodigoManifestacao | null =>
  (Object.keys(EVENTOS) as CodigoManifestacao[]).find((k) => EVENTOS[k].tp === tp) ?? null;

/** Justificativa da "Operação não realizada": 15 a 255 caracteres, sem quebra de linha. */
export function justificativaValida(s: string | null | undefined): boolean {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length >= 15 && t.length <= 255;
}

/** Data e hora do evento no formato da SEFAZ (AAAA-MM-DDThh:mm:ss-03:00), no horário de Brasília. */
export function dataHoraEvento(d: Date, deslocamentoMin = -180): string {
  const local = new Date(d.getTime() + deslocamentoMin * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const sinal = deslocamentoMin < 0 ? "-" : "+";
  const abs = Math.abs(deslocamentoMin);
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}T` +
    `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}${sinal}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

export const idEvento = (tp: string, chave: string, seq: number) => `ID${tp}${so(chave)}${String(seq).padStart(2, "0")}`;

/** Troca caracteres que a SEFAZ recusa e limita o tamanho (como o sped-nfe). */
export const textoSefaz = (s: string, max = 255) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export interface DadosEvento {
  ambiente: Ambiente;
  cnpj: string;
  chave: string;
  tipo: CodigoManifestacao;
  sequencia: number;
  dhEvento: string;
  justificativa?: string | null;
}

/**
 * infEvento da manifestação, já na forma canônica (C14N) quando `comNamespace` (é o texto que entra no DigestValue:
 * a declaração xmlns herdada de <evento> aparece no elemento, como faz a canonicalização de um subconjunto).
 * Sem `comNamespace`, é o texto que vai dentro do <evento> no documento.
 */
export function montarInfEvento(d: DadosEvento, comNamespace = false): string {
  const ev = EVENTOS[d.tipo];
  if (!ev) throw new Error("Tipo de manifestação inválido.");
  const chave = so(d.chave);
  if (chave.length !== 44) throw new Error("Chave de acesso da NF-e inválida (precisa ter 44 números).");
  const cnpj = so(d.cnpj);
  if (cnpj.length !== 14) throw new Error("CNPJ da empresa inválido para manifestar.");
  if (d.sequencia < 1 || d.sequencia > 20) throw new Error("Sequência do evento inválida.");
  let det = `<descEvento>${ev.descEvento}</descEvento>`;
  if (d.tipo === "nao_realizada") {
    if (!justificativaValida(d.justificativa)) throw new Error("Escreva a justificativa com 15 a 255 letras.");
    det += `<xJust>${textoSefaz(d.justificativa ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</xJust>`;
  }
  const ns = comNamespace ? ` xmlns="${NS_NFE}"` : "";
  return (
    `<infEvento${ns} Id="${idEvento(ev.tp, chave, d.sequencia)}"><cOrgao>${ORGAO_AN}</cOrgao><tpAmb>${tpAmb(d.ambiente)}</tpAmb>` +
    `<CNPJ>${cnpj}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${d.dhEvento}</dhEvento><tpEvento>${ev.tp}</tpEvento>` +
    `<nSeqEvento>${d.sequencia}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00">${det}</detEvento></infEvento>`
  );
}

/** <evento> com o infEvento e a assinatura (a assinatura vem pronta da Função Edge). */
export const montarEvento = (infEvento: string, assinatura: string) =>
  `<evento xmlns="${NS_NFE}" versao="1.00">${infEvento}${assinatura}</evento>`;

/** Lote de até 20 eventos assinados, já no envelope SOAP do NFeRecepcaoEvento4. */
export function montarEnvioEventos(ambiente: Ambiente, idLote: string, eventos: string[]): RequisicaoSoap {
  if (!eventos.length || eventos.length > 20) throw new Error("O lote de manifestação aceita de 1 a 20 notas por vez.");
  const env = `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${so(idLote).slice(0, 15) || "1"}</idLote>${eventos.join("")}</envEvento>`;
  return {
    url: URLS.recepcaoEvento[ambiente],
    corpo: envelopeSoap12(`<nfeDadosMsg xmlns="${NS_EVENTO}">${env}</nfeDadosMsg>`),
    contentType: tipoSoap(NS_EVENTO, "nfeRecepcaoEvento"),
  };
}

export interface RetornoEvento {
  chave: string;
  tpEvento: string;
  sequencia: number;
  cStat: string;
  xMotivo: string;
  protocolo: string | null;
  dhRegEvento: string | null;
  /** XML do retEvento (para guardar com o evento enviado). */
  xml: string;
}

/** Evento aceito pela SEFAZ: 135 (registrado e vinculado), 136 (registrado, não vinculado) ou 155 (já cancelada, registrado). */
export const eventoAceito = (cStat: string) => cStat === "135" || cStat === "136" || cStat === "155";

/** Lê o retEnvEvento: situação do lote e de cada evento. */
export function lerRetornoEvento(xml: string): { cStat: string; xMotivo: string; eventos: RetornoEvento[] } {
  const raiz = lerXml(xml);
  const falha = falhaSoap(raiz);
  if (falha) throw new Error(`A SEFAZ recusou o envio: ${falha}`);
  const ret = descendente(raiz, "retEnvEvento");
  if (!ret) throw new Error("A SEFAZ respondeu sem o retorno do evento (retEnvEvento).");
  const brutos = xml.match(/<(?:\w+:)?retEvento\b[\s\S]*?<\/(?:\w+:)?retEvento>/g) ?? [];
  return {
    cStat: txt(ret, "cStat") ?? "",
    xMotivo: txt(ret, "xMotivo") ?? "",
    eventos: filhos(ret, "retEvento").map((r, k) => {
      const inf = filho(r, "infEvento");
      return {
        chave: txt(inf, "chNFe") ?? "",
        tpEvento: txt(inf, "tpEvento") ?? "",
        sequencia: Number(txt(inf, "nSeqEvento") ?? 1),
        cStat: txt(inf, "cStat") ?? "",
        xMotivo: txt(inf, "xMotivo") ?? "",
        protocolo: txt(inf, "nProt"),
        dhRegEvento: txt(inf, "dhRegEvento"),
        xml: brutos[k] ?? "",
      };
    }),
  };
}

/** procEventoNFe (evento enviado + retorno), o arquivo que se guarda como comprovante. */
export const montarProcEvento = (evento: string, retEvento: string) =>
  `<procEventoNFe xmlns="${NS_NFE}" versao="1.00">${evento}${retEvento.replace(/<(\/?)\w+:/g, "<$1")}</procEventoNFe>`;

// ------------------------------------------------------------------------------------------------ ADN (NFS-e)

/** Endereço da distribuição de NFS-e do ADN a partir do NSU (lote de documentos). */
export function urlAdn(ambiente: Ambiente, nsu: number, cnpj: string): string {
  return `${URLS.adn[ambiente]}/DFe/${Math.max(0, Math.trunc(nsu))}?cnpjConsulta=${so(cnpj)}&lote=true`;
}

export interface DocumentoAdn {
  nsu: number;
  chave: string | null;
  tipo: string | null;
  /** XML compactado (gzip + base64). */
  conteudo: string;
  geradoEm: string | null;
}

export interface RetornoAdn {
  status: string;
  documentos: DocumentoAdn[];
  erros: string[];
}

/**
 * Lê a resposta do ADN. O ADN devolve os documentos a partir do NSU pedido; quem chama descarta os que já tinha
 * (NSU menor ou igual ao último guardado), então não importa se o NSU pedido vem incluído ou não.
 */
export function lerRetornoAdn(corpo: unknown): RetornoAdn {
  const o = (corpo ?? {}) as Record<string, unknown>;
  const lote = (o.LoteDFe ?? o.loteDFe ?? []) as Record<string, unknown>[];
  const erros = ((o.Erros ?? o.erros ?? []) as Record<string, unknown>[]).map((e) =>
    [e.Codigo ?? e.codigo, e.Descricao ?? e.descricao].filter(Boolean).join(" · "),
  );
  return {
    status: String(
      o.StatusProcessamento ?? o.statusProcessamento ?? (lote.length ? "DOCUMENTOS_LOCALIZADOS" : "NENHUM_DOCUMENTO_LOCALIZADO"),
    ),
    documentos: lote
      .map((d) => ({
        nsu: Number(d.NSU ?? d.nsu ?? 0),
        chave: (d.ChaveAcesso ?? d.chaveAcesso ?? null) as string | null,
        tipo: (d.TipoDocumento ?? d.tipoDocumento ?? null) as string | null,
        conteudo: String(d.ArquivoXml ?? d.arquivoXml ?? ""),
        geradoEm: (d.DataHoraGeracao ?? d.dataHoraGeracao ?? null) as string | null,
      }))
      .filter((d) => d.conteudo)
      .sort((a, b) => a.nsu - b.nsu),
    erros,
  };
}
