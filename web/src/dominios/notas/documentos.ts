// Leitura dos documentos fiscais para os campos do banco (fis_notas, fis_nota_itens, fis_eventos):
// NF-e completa (nfeProc/procNFe ou NFe sem protocolo), resumo da NF-e (resNFe), eventos (resEvento e procEventoNFe)
// e NFS-e do padrão nacional (NFSe). Mesmo código no navegador (upload de XML) e na Função Edge (captura).
//
// Fontes dos campos: Manual de Orientação do Contribuinte da NF-e (MOC 7.0, leiaute 4.00), NT 2025.002 (grupos
// IBSCBS/IBSCBSTot da reforma), NT 2014.002 (schemas resNFe/resEvento) e leiaute da NFS-e Nacional (NFSe/infNFSe/DPS).
import { achar, descendente, descendentes, filho, filhos, lerXml, num, numDesc, txt, txtDesc } from "./xml";
import type { NoXml } from "./xml";

export interface ItemLido {
  numero: number;
  codigo: string | null;
  gtin: string | null;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  desconto: number;
  frete: number;
  seguro: number;
  outros: number;
  icms_cst: string | null;
  icms_base: number;
  icms_aliquota: number;
  icms_valor: number;
  icms_st_valor: number;
  ipi_valor: number;
  pis_cst: string | null;
  pis_valor: number;
  cofins_cst: string | null;
  cofins_valor: number;
  ibs_valor: number;
  cbs_valor: number;
}

export interface Duplicata {
  numero: string | null;
  vencimento: string;
  valor: number;
}

export interface NotaLida {
  modelo: "55" | "65" | "nfse" | "outro";
  chave: string;
  conteudo: "completa" | "resumo";
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  autorizacao: string | null;
  protocolo: string | null;
  situacao: "autorizada" | "cancelada" | "denegada";
  /** tpNF da NF-e: 0 = entrada (emitida pelo próprio destinatário), 1 = saída. */
  tipo_nf: string | null;
  natureza: string | null;
  emitente_doc: string | null;
  emitente_nome: string | null;
  emitente_ie: string | null;
  emitente_uf: string | null;
  destinatario_doc: string | null;
  destinatario_nome: string | null;
  valor_total: number;
  valor_produtos: number;
  valor_frete: number;
  valor_seguro: number;
  valor_desconto: number;
  valor_outros: number;
  icms_base: number;
  icms_valor: number;
  icms_st_base: number;
  icms_st_valor: number;
  ipi_valor: number;
  pis_valor: number;
  cofins_valor: number;
  iss_valor: number;
  iss_retido: boolean;
  ibs_valor: number;
  cbs_valor: number;
  /** Retenções na NFS-e (IR, CSLL, INSS/CP, PIS/COFINS retidos), somadas. */
  retencoes: number;
  cfop_principal: string | null;
  itens: ItemLido[];
  duplicatas: Duplicata[];
}

export interface EventoLido {
  chave: string;
  tpEvento: string;
  sequencia: number;
  descricao: string | null;
  protocolo: string | null;
  registrado_em: string | null;
  autor_doc: string | null;
  justificativa: string | null;
  cStat: string | null;
}

export type DocumentoLido =
  | { tipo: "nota"; nota: NotaLida }
  | { tipo: "evento"; evento: EventoLido }
  | { tipo: "desconhecido"; raiz: string };

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const r2 = (v: number) => Math.round(v * 100) / 100;
const docDe = (no: NoXml | undefined) => txt(no, "CNPJ") ?? txt(no, "CPF") ?? txt(no, "idEstrangeiro");

/** Situação pelo cStat do protocolo: 100/150 autorizada; 110, 205, 301, 302, 303 denegada; 101/151/135 cancelada. */
function situacaoPorStat(cStat: string | null): NotaLida["situacao"] {
  if (!cStat) return "autorizada";
  if (["110", "205", "301", "302", "303"].includes(cStat)) return "denegada";
  if (["101", "151", "135", "155"].includes(cStat)) return "cancelada";
  return "autorizada";
}

const vazioValores = {
  valor_total: 0,
  valor_produtos: 0,
  valor_frete: 0,
  valor_seguro: 0,
  valor_desconto: 0,
  valor_outros: 0,
  icms_base: 0,
  icms_valor: 0,
  icms_st_base: 0,
  icms_st_valor: 0,
  ipi_valor: 0,
  pis_valor: 0,
  cofins_valor: 0,
  iss_valor: 0,
  iss_retido: false,
  ibs_valor: 0,
  cbs_valor: 0,
  retencoes: 0,
};

/** CFOP que mais pesa no valor da nota (para o relatório e a sugestão do tipo de entrada). */
function cfopPrincipal(itens: ItemLido[]): string | null {
  const soma = new Map<string, number>();
  for (const i of itens) if (i.cfop) soma.set(i.cfop, (soma.get(i.cfop) ?? 0) + i.valor_total);
  return [...soma.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ------------------------------------------------------------------------------------------------ NF-e completa

function lerItem(det: NoXml): ItemLido {
  const prod = filho(det, "prod");
  const imp = filho(det, "imposto");
  const icms = filho(imp, "ICMS")?.filhos[0];
  const ipi = filho(imp, "IPI");
  const pis = filho(imp, "PIS")?.filhos[0];
  const cofins = filho(imp, "COFINS")?.filhos[0];
  const ibscbs = filho(imp, "IBSCBS");
  const gtin = txt(prod, "cEAN");
  return {
    numero: Number(det.atributos.nItem ?? 0),
    codigo: txt(prod, "cProd"),
    gtin: gtin && gtin !== "SEM GTIN" ? gtin : null,
    descricao: txt(prod, "xProd") ?? "(sem descrição)",
    ncm: txt(prod, "NCM"),
    cest: txt(prod, "CEST"),
    cfop: txt(prod, "CFOP"),
    unidade: txt(prod, "uCom"),
    quantidade: num(prod, "qCom"),
    valor_unitario: num(prod, "vUnCom"),
    valor_total: num(prod, "vProd"),
    desconto: num(prod, "vDesc"),
    frete: num(prod, "vFrete"),
    seguro: num(prod, "vSeg"),
    outros: num(prod, "vOutro"),
    icms_cst: txt(icms, "CST") ?? txt(icms, "CSOSN"),
    icms_base: num(icms, "vBC"),
    icms_aliquota: num(icms, "pICMS"),
    icms_valor: num(icms, "vICMS"),
    icms_st_valor: num(icms, "vICMSST"),
    ipi_valor: num(filho(ipi, "IPITrib"), "vIPI"),
    pis_cst: txt(pis, "CST"),
    pis_valor: num(pis, "vPIS"),
    cofins_cst: txt(cofins, "CST"),
    cofins_valor: num(cofins, "vCOFINS"),
    ibs_valor: numDesc(ibscbs, "vIBS"),
    cbs_valor: numDesc(filho(descendente(ibscbs, "gIBSCBS"), "gCBS"), "vCBS") || numDesc(ibscbs, "vCBS"),
  };
}

/** NF-e completa: aceita nfeProc (procNFe), NFe sem protocolo ou o envelope com os dois. */
export function lerNFe(raiz: NoXml): NotaLida {
  const nfe = raiz.nome === "NFe" ? raiz : descendente(raiz, "NFe");
  const inf = filho(nfe, "infNFe");
  if (!inf) throw new Error("Este XML não é uma NF-e (falta o grupo infNFe).");
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  const tot = achar(inf, "total/ICMSTot");
  const ibsTot = achar(inf, "total/IBSCBSTot");
  const prot = descendente(raiz, "infProt");
  const itens = filhos(inf, "det").map(lerItem);
  const chave = so(inf.atributos.Id) || so(txt(prot, "chNFe"));
  if (chave.length !== 44) throw new Error("Chave de acesso da NF-e não encontrada no XML.");
  const modelo = txt(ide, "mod");
  return {
    modelo: modelo === "65" ? "65" : modelo === "55" ? "55" : "outro",
    chave,
    conteudo: "completa",
    numero: txt(ide, "nNF"),
    serie: txt(ide, "serie"),
    emissao: txt(ide, "dhEmi") ?? txt(ide, "dEmi"),
    autorizacao: txt(prot, "dhRecbto"),
    protocolo: txt(prot, "nProt"),
    situacao: situacaoPorStat(txt(prot, "cStat")),
    tipo_nf: txt(ide, "tpNF"),
    natureza: txt(ide, "natOp"),
    emitente_doc: docDe(emit),
    emitente_nome: txt(emit, "xNome"),
    emitente_ie: txt(emit, "IE"),
    emitente_uf: txt(emit, "enderEmit/UF"),
    destinatario_doc: docDe(dest),
    destinatario_nome: txt(dest, "xNome"),
    ...vazioValores,
    valor_total: num(tot, "vNF"),
    valor_produtos: num(tot, "vProd"),
    valor_frete: num(tot, "vFrete"),
    valor_seguro: num(tot, "vSeg"),
    valor_desconto: num(tot, "vDesc"),
    valor_outros: num(tot, "vOutro"),
    icms_base: num(tot, "vBC"),
    icms_valor: num(tot, "vICMS"),
    icms_st_base: num(tot, "vBCST"),
    icms_st_valor: num(tot, "vST"),
    ipi_valor: num(tot, "vIPI"),
    pis_valor: num(tot, "vPIS"),
    cofins_valor: num(tot, "vCOFINS"),
    ibs_valor: numDesc(filho(ibsTot, "gIBS"), "vIBS") || r2(itens.reduce((a, i) => a + i.ibs_valor, 0)),
    cbs_valor: numDesc(filho(ibsTot, "gCBS"), "vCBS") || r2(itens.reduce((a, i) => a + i.cbs_valor, 0)),
    cfop_principal: cfopPrincipal(itens),
    itens,
    duplicatas: filhos(achar(inf, "cobr"), "dup").map((d) => ({
      numero: txt(d, "nDup"),
      vencimento: (txt(d, "dVenc") ?? "").slice(0, 10),
      valor: num(d, "vDup"),
    })),
  };
}

// ------------------------------------------------------------------------------------------------ resumo da NF-e

/** resNFe: o que a SEFAZ entrega antes da ciência (sem itens). cSitNFe: 1 autorizada, 2 denegada, 3 cancelada. */
export function lerResNFe(res: NoXml): NotaLida {
  const chave = so(txt(res, "chNFe"));
  if (chave.length !== 44) throw new Error("Resumo de NF-e sem chave de acesso.");
  const sit = txt(res, "cSitNFe");
  return {
    modelo: chave.slice(20, 22) === "65" ? "65" : "55",
    chave,
    conteudo: "resumo",
    numero: String(Number(chave.slice(25, 34))),
    serie: String(Number(chave.slice(22, 25))),
    emissao: txt(res, "dhEmi"),
    autorizacao: txt(res, "dhRecbto"),
    protocolo: txt(res, "nProt"),
    situacao: sit === "2" ? "denegada" : sit === "3" ? "cancelada" : "autorizada",
    tipo_nf: txt(res, "tpNF"),
    natureza: null,
    emitente_doc: docDe(res),
    emitente_nome: txt(res, "xNome"),
    emitente_ie: txt(res, "IE"),
    emitente_uf: null,
    destinatario_doc: null,
    destinatario_nome: null,
    ...vazioValores,
    valor_total: num(res, "vNF"),
    cfop_principal: null,
    itens: [],
    duplicatas: [],
  };
}

// ------------------------------------------------------------------------------------------------ eventos

/** resEvento (resumo distribuído) ou procEventoNFe (evento + retorno). Cancelamento = 110111. */
export function lerEvento(raiz: NoXml): EventoLido {
  if (raiz.nome === "resEvento") {
    return {
      chave: so(txt(raiz, "chNFe")),
      tpEvento: txt(raiz, "tpEvento") ?? "",
      sequencia: Number(txt(raiz, "nSeqEvento") ?? 1),
      descricao: txt(raiz, "xEvento"),
      protocolo: txt(raiz, "nProt"),
      registrado_em: txt(raiz, "dhRecbto"),
      autor_doc: docDe(raiz),
      justificativa: null,
      cStat: null,
    };
  }
  const inf = achar(descendente(raiz, "evento"), "infEvento");
  const ret = achar(descendente(raiz, "retEvento"), "infEvento");
  return {
    chave: so(txt(inf, "chNFe") ?? txt(ret, "chNFe")),
    tpEvento: txt(inf, "tpEvento") ?? txt(ret, "tpEvento") ?? "",
    sequencia: Number(txt(inf, "nSeqEvento") ?? txt(ret, "nSeqEvento") ?? 1),
    descricao: txtDesc(inf, "descEvento") ?? txt(ret, "xEvento"),
    protocolo: txt(ret, "nProt"),
    registrado_em: txt(ret, "dhRegEvento"),
    autor_doc: docDe(inf),
    justificativa: txtDesc(inf, "xJust"),
    cStat: txt(ret, "cStat"),
  };
}

// ------------------------------------------------------------------------------------------------ NFS-e Nacional

/** NFS-e do padrão nacional (NFSe/infNFSe com a DPS dentro). Vira uma nota de modelo "nfse" com um item de serviço. */
export function lerNfse(raiz: NoXml): NotaLida {
  const inf = descendente(raiz, "infNFSe");
  if (!inf) throw new Error("Este XML não é uma NFS-e do padrão nacional (falta infNFSe).");
  const dps = descendente(inf, "infDPS");
  const chave = so(inf.atributos.Id);
  if (chave.length < 44) throw new Error("Chave de acesso da NFS-e não encontrada no XML.");
  const emit = filho(inf, "emit");
  const prest = filho(dps, "prest");
  const toma = filho(dps, "toma");
  const valoresNfse = filho(inf, "valores");
  const valoresDps = filho(dps, "valores");
  const trib = filho(valoresDps, "trib");
  const tribMun = filho(trib, "tribMun");
  const tribFed = filho(trib, "tribFed");
  const piscofins = filho(tribFed, "piscofins");
  const servico = num(valoresDps, "vServPrest/vServ") || numDesc(valoresDps, "vServ");
  const iss = num(valoresNfse, "vISSQN") || numDesc(tribMun, "vISSQN");
  const retido = txt(tribMun, "tpRetISSQN");
  // tpRetPisCofins 1 = retido pelo tomador (leiaute 1.00 da NFS-e Nacional)
  const pisRetido = txt(piscofins, "tpRetPisCofins") === "1";
  const retencoes =
    num(tribFed, "vRetIRRF") +
    num(tribFed, "vRetCSLL") +
    num(tribFed, "vRetCP") +
    (pisRetido ? num(piscofins, "vPis") + num(piscofins, "vCofins") : 0);
  const cserv = filho(filho(dps, "serv"), "cServ");
  const item: ItemLido = {
    numero: 1,
    codigo: txt(cserv, "cTribNac"),
    gtin: null,
    descricao: txt(cserv, "xDescServ") ?? txt(inf, "xTribNac") ?? "Serviço",
    ncm: txt(cserv, "cNBS"),
    cest: null,
    cfop: null,
    unidade: "UN",
    quantidade: 1,
    valor_unitario: servico,
    valor_total: servico,
    desconto: numDesc(valoresDps, "vDescIncond"),
    frete: 0,
    seguro: 0,
    outros: 0,
    icms_cst: null,
    icms_base: 0,
    icms_aliquota: 0,
    icms_valor: 0,
    icms_st_valor: 0,
    ipi_valor: 0,
    pis_cst: txt(piscofins, "CST"),
    pis_valor: num(piscofins, "vPis"),
    cofins_cst: txt(piscofins, "CST"),
    cofins_valor: num(piscofins, "vCofins"),
    ibs_valor: numDesc(descendente(inf, "IBSCBS") ?? descendente(dps, "IBSCBS"), "vIBS"),
    cbs_valor: numDesc(descendente(inf, "IBSCBS") ?? descendente(dps, "IBSCBS"), "vCBS"),
  };
  const situacao = txt(inf, "cStat") === "101" || txt(inf, "cStat") === "102" ? "cancelada" : "autorizada";
  return {
    modelo: "nfse",
    chave,
    conteudo: "completa",
    numero: txt(inf, "nNFSe"),
    serie: txt(dps, "serie"),
    emissao: txt(dps, "dhEmi") ?? txt(inf, "dhProc"),
    autorizacao: txt(inf, "dhProc"),
    protocolo: txt(inf, "nDFSe"),
    situacao,
    tipo_nf: null,
    natureza: txt(inf, "xTribNac"),
    emitente_doc: docDe(emit) ?? docDe(prest),
    emitente_nome: txt(emit, "xNome") ?? txt(prest, "xNome"),
    emitente_ie: txt(emit, "IM"),
    emitente_uf: txt(emit, "enderNac/UF"),
    destinatario_doc: docDe(toma),
    destinatario_nome: txt(toma, "xNome"),
    ...vazioValores,
    valor_total: servico,
    valor_produtos: servico,
    valor_desconto: item.desconto,
    pis_valor: item.pis_valor,
    cofins_valor: item.cofins_valor,
    iss_valor: iss,
    iss_retido: retido === "2" || retido === "3",
    ibs_valor: item.ibs_valor,
    cbs_valor: item.cbs_valor,
    retencoes: r2(retencoes),
    cfop_principal: null,
    itens: [item],
    duplicatas: [],
  };
}

// ------------------------------------------------------------------------------------------------ porta de entrada

/** Lê qualquer documento fiscal suportado pelo elemento raiz. */
export function lerDocumento(xml: string): DocumentoLido {
  const raiz = lerXml(xml);
  switch (raiz.nome) {
    case "nfeProc":
    case "NFe":
      return { tipo: "nota", nota: lerNFe(raiz) };
    case "resNFe":
      return { tipo: "nota", nota: lerResNFe(raiz) };
    case "resEvento":
    case "procEventoNFe":
      return { tipo: "evento", evento: lerEvento(raiz) };
    case "NFSe":
      return { tipo: "nota", nota: lerNfse(raiz) };
    default:
      if (descendente(raiz, "infNFSe")) return { tipo: "nota", nota: lerNfse(raiz) };
      if (descendente(raiz, "infNFe")) return { tipo: "nota", nota: lerNFe(raiz) };
      return { tipo: "desconhecido", raiz: raiz.nome };
  }
}

/** Notas de um XML que pode trazer várias (lote de NFS-e de prefeitura, por exemplo): uma por infNFSe/infNFe. */
export function lerVariasNotas(xml: string): NotaLida[] {
  const raiz = lerXml(xml);
  const nfses = descendentes(raiz, "NFSe");
  if (nfses.length > 1) return nfses.map(lerNfse);
  const nfes = descendentes(raiz, "nfeProc");
  if (nfes.length > 1) return nfes.map(lerNFe);
  const d = lerDocumento(xml);
  if (d.tipo !== "nota") throw new Error("O arquivo não traz uma nota fiscal (NF-e ou NFS-e nacional).");
  return [d.nota];
}

/**
 * Entrada ou saída para a empresa: é saída quando ela é a emitente de uma nota de saída (tpNF 1) ou a prestadora da
 * NFS-e; é entrada quando é destinatária/tomadora ou quando emitiu a própria nota de entrada (tpNF 0).
 */
export function direcaoParaEmpresa(n: Pick<NotaLida, "emitente_doc" | "tipo_nf" | "modelo">, cnpjEmpresa: string): "entrada" | "saida" {
  const emitente = so(n.emitente_doc) === so(cnpjEmpresa);
  if (!emitente) return "entrada";
  if (n.modelo !== "nfse" && n.tipo_nf === "0") return "entrada";
  return "saida";
}

/** A nota pertence à empresa (emitente, destinatária ou tomadora com o mesmo CNPJ raiz)? */
export function notaDaEmpresa(n: Pick<NotaLida, "emitente_doc" | "destinatario_doc">, cnpjEmpresa: string): boolean {
  const raiz = so(cnpjEmpresa).slice(0, 8);
  if (raiz.length !== 8) return false;
  return [n.emitente_doc, n.destinatario_doc].some((d) => so(d).length === 14 && so(d).slice(0, 8) === raiz);
}
