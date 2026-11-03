// Espelho da nota: monta, a partir do XML guardado, os dados de um documento no estilo do DANFE (NF-e/NFC-e), da
// DANFSe (NFS-e Nacional e NFS-e municipal no padrão ABRASF), do DACTE (CT-e) ou uma lista genérica dos campos
// (resumo da NF-e e qualquer outro XML). Função pura: o mesmo resultado desenha a janela (EspelhoNota.tsx) e o PDF
// (espelhoPdf.ts). Os valores já saem formatados em português (R$, CNPJ/CPF, datas).
//
// Reaproveita o leitor de XML (xml.ts) e a leitura dos campos do banco (documentos.ts: lerNFe, lerNfse, lerResNFe);
// aqui só se leem os campos a mais que o banco não guarda (endereços, transporte, volumes, informações complementares,
// alíquotas por item). Este arquivo NÃO vai para as Funções Edge (scripts/nucleo_fiscal.py copia só xml, sefaz,
// documentos e regras), por isso pode usar lib/.
//
// Fontes: MOC da NF-e 7.0 (leiaute 4.00, anexo II — DANFE), leiaute da NFS-e Nacional 1.00 (NFSe/infNFSe/DPS) e
// leiaute da DANFSe (NT 008/2025 do Sistema Nacional NFS-e), ABRASF 1.0/2.04 (CompNfse/InfNfse) e MOC do CT-e 4.00.
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { formatarDocumento } from "@/lib/documento";
import { ErroApp } from "@/lib/erros";
import { semAcento } from "@/lib/texto";
import { lerNFe, lerNfse, lerResNFe } from "./documentos";
import { achar, descendente, descendentes, filho, filhos, lerXml, num, txt } from "./xml";
import type { NoXml } from "./xml";

export const FAIXA_ESPELHO = "Espelho gerado pelo HUB-MDC a partir do XML — não substitui o documento oficial";

export interface CampoEspelho {
  rotulo: string;
  valor: string;
  /** Largura relativa dentro da linha (padrão 1). */
  peso?: number;
  direita?: boolean;
  /** Valor em negrito (total da nota, valor líquido). */
  destaque?: boolean;
}

export interface ColunaEspelho {
  titulo: string;
  peso: number;
  direita?: boolean;
}

export type BlocoEspelho =
  | { tipo: "campos"; titulo: string; linhas: CampoEspelho[][] }
  | { tipo: "tabela"; titulo: string; colunas: ColunaEspelho[]; linhas: string[][] }
  | { tipo: "texto"; titulo: string; texto: string };

export type TipoEspelho = "nfe" | "nfce" | "nfse" | "cte" | "resumo" | "outro";

export interface Espelho {
  tipo: TipoEspelho;
  /** Sigla grande do cabeçalho: DANFE, DANFSe, DACTE ou ESPELHO. */
  sigla: string;
  /** Nome por extenso do documento auxiliar. */
  descricao: string;
  /** Quadro do emitente; `rotulo` troca o título padrão "Identificação do emitente" (NFS-e: "Prestador do serviço"). */
  emitente: { nome: string; linhas: string[]; rotulo?: string };
  /** Caixa do meio do cabeçalho: entrada/saída, número, série, código de verificação… */
  identificacao: CampoEspelho[];
  /** Chave de acesso só com os dígitos (ou null quando o documento não tem). */
  chave: string | null;
  /** Chave em blocos de 4 dígitos. */
  chaveFormatada: string | null;
  /** Desenhar o código de barras CODE-128C da chave (DANFE e DACTE, chave de 44 dígitos). */
  codigoBarras: boolean;
  /** Onde consultar a autenticidade. */
  consulta: string | null;
  /** Tarja de situação: nota cancelada, uso denegado, homologação. */
  aviso: string | null;
  blocos: BlocoEspelho[];
  /** "NF-e 1.234 · Fornecedor Ltda" (título da janela). */
  titulo: string;
  /** Nome do PDF: NFe-1234-Fornecedor-Ltda.pdf */
  arquivo: string;
}

// ------------------------------------------------------------------------------------------------ formatos

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const ou = (s: string | null | undefined, padrao = "") => (s && s.trim() ? s.trim() : padrao);

/** Chave em blocos de 4 dígitos: "3526 1011 2223 …". */
export const formatarChave = (chave: string) => so(chave).replace(/(\d{4})(?=\d)/g, "$1 ");

/** Data e hora como estão escritas no XML ("2026-10-20T10:15:00-03:00" → "20/10/2026 10:15"), sem trocar de fuso. */
export function dataHoraXml(s: string | null | undefined): string {
  if (!s) return "";
  const hora = /T(\d{2}:\d{2})/.exec(s)?.[1];
  return fmtData(s) + (hora ? ` ${hora}` : "");
}
const data = (s: string | null | undefined) => (s ? fmtData(s) : "");
const hora = (s: string | null | undefined) => /T(\d{2}:\d{2}:\d{2})/.exec(s ?? "")?.[1] ?? "";

const decimal = (v: number, min: number, max: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
const quantidade = (v: number) => decimal(v, 2, 4);
const unitario = (v: number) => decimal(v, 2, 4);
const aliquota = (v: number) => decimal(v, 2, 2);
const reais = (v: number) => brl(v);
const doc = (d: string | null | undefined) => (d ? formatarDocumento(d) : "");
const cep = (c: string | null | undefined) => (so(c).length === 8 ? so(c).replace(/(\d{5})(\d{3})/, "$1-$2") : ou(c));
const fone = (f: string | null | undefined) => {
  const d = so(f);
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  return ou(f);
};
const juntar = (partes: (string | null | undefined)[], sep = " · ") => partes.filter((p) => p && p.trim()).join(sep);
const docDe = (no: NoXml | undefined) => txt(no, "CNPJ") ?? txt(no, "CPF") ?? txt(no, "idEstrangeiro");

/** Número no padrão do DANFE: 1234 → "000.001.234". */
export const numeroDanfe = (n: string | null) =>
  n
    ? so(n)
        .padStart(9, "0")
        .slice(-9)
        .replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3")
    : "";

/** Nome do PDF sem acento nem símbolo: NFe-1234-Fornecedor-de-Teste-Cia-Ltda.pdf */
export function nomeArquivoEspelho(prefixo: string, numero: string | null, emitente: string): string {
  const limpo = (s: string) =>
    semAcento(s)
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${[prefixo, limpo(numero ?? "") || "sn", limpo(emitente).slice(0, 40).replace(/-+$/, "")].filter(Boolean).join("-")}.pdf`;
}

const campo = (rotulo: string, valor: string | null | undefined, peso = 1, extra: Partial<CampoEspelho> = {}): CampoEspelho => ({
  rotulo,
  valor: ou(valor),
  peso,
  ...extra,
});
const valorCampo = (rotulo: string, v: number, peso = 1, destaque = false) => campo(rotulo, reais(v), peso, { direita: true, destaque });

/** Endereço em uma linha: "Rua X, 10 - Sala 2". */
const logradouro = (no: NoXml | undefined, rua = "xLgr", numero = "nro", compl = "xCpl") =>
  juntar([juntar([txt(no, rua), txt(no, numero)], ", "), txt(no, compl)], " - ");

// ------------------------------------------------------------------------------------------------ NF-e / NFC-e

const MOD_FRETE: Record<string, string> = {
  "0": "0 - Por conta do emitente",
  "1": "1 - Por conta do destinatário",
  "2": "2 - Por conta de terceiros",
  "3": "3 - Próprio, do remetente",
  "4": "4 - Próprio, do destinatário",
  "9": "9 - Sem frete",
};

const FORMA_PAGAMENTO: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de crédito",
  "04": "Cartão de débito",
  "05": "Crédito na loja",
  "10": "Vale-alimentação",
  "11": "Vale-refeição",
  "12": "Vale-presente",
  "13": "Vale-combustível",
  "15": "Boleto bancário",
  "16": "Depósito bancário",
  "17": "PIX",
  "18": "Transferência bancária",
  "19": "Programa de fidelidade",
  "90": "Sem pagamento",
  "99": "Outros",
};

function avisoDaSituacao(situacao: "autorizada" | "cancelada" | "denegada", homologacao: boolean, sigla: string): string | null {
  if (situacao === "cancelada") return `${sigla} CANCELADA`;
  if (situacao === "denegada") return "USO DENEGADO";
  if (homologacao) return "EMITIDA EM HOMOLOGAÇÃO — SEM VALOR FISCAL";
  return null;
}

function espelhoNFe(raiz: NoXml): Espelho {
  const nota = lerNFe(raiz);
  const nfe = raiz.nome === "NFe" ? raiz : descendente(raiz, "NFe");
  const inf = filho(nfe, "infNFe")!;
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const ender = filho(emit, "enderEmit");
  const dest = filho(inf, "dest");
  const enderDest = filho(dest, "enderDest");
  const tot = achar(inf, "total/ICMSTot");
  const transp = filho(inf, "transp");
  const transporta = filho(transp, "transporta");
  const veiculo = filho(transp, "veicTransp");
  const vols = filhos(transp, "vol");
  const infAdic = filho(inf, "infAdic");
  const nfce = nota.modelo === "65";
  const sigla = nfce ? "DANFE NFC-e" : "DANFE";
  const nomeEmit = ou(txt(emit, "xNome"), "Emitente não informado");

  const blocos: BlocoEspelho[] = [];
  blocos.push({
    tipo: "campos",
    titulo: "Dados da nota",
    linhas: [
      [
        campo("Natureza da operação", nota.natureza, 3),
        campo("Protocolo de autorização de uso", juntar([nota.protocolo, dataHoraXml(nota.autorizacao)], " - "), 2),
      ],
      [
        campo("Inscrição estadual", txt(emit, "IE")),
        campo("Inscrição estadual do subst. tributário", txt(emit, "IEST")),
        campo("CNPJ / CPF do emitente", doc(docDe(emit))),
      ],
    ],
  });

  if (dest) {
    blocos.push({
      tipo: "campos",
      titulo: "Destinatário / remetente",
      linhas: [
        [
          campo("Nome / razão social", txt(dest, "xNome"), 4),
          campo("CNPJ / CPF", doc(docDe(dest)), 2),
          campo("Data da emissão", data(nota.emissao), 1.4),
        ],
        [
          campo("Endereço", logradouro(enderDest), 3.4),
          campo("Bairro / distrito", txt(enderDest, "xBairro"), 1.6),
          campo("CEP", cep(txt(enderDest, "CEP"))),
          campo("Data da saída / entrada", data(txt(ide, "dhSaiEnt") ?? txt(ide, "dSaiEnt")), 1.4),
        ],
        [
          campo("Município", txt(enderDest, "xMun"), 2.6),
          campo("Fone / fax", fone(txt(enderDest, "fone")), 1.4),
          campo("UF", txt(enderDest, "UF"), 0.6),
          campo("Inscrição estadual", txt(dest, "IE"), 1.4),
          campo("Hora da saída / entrada", hora(txt(ide, "dhSaiEnt")) || ou(txt(ide, "hSaiEnt")), 1.4),
        ],
      ],
    });
  }

  const fat = achar(inf, "cobr/fat");
  const pagamentos = filhos(filho(inf, "pag"), "detPag");
  if (nota.duplicatas.length || fat || pagamentos.length) {
    const linhas: CampoEspelho[][] = [];
    const dups = nota.duplicatas.map((d, i) =>
      campo(`Parcela ${ou(d.numero, String(i + 1).padStart(3, "0"))}`, `${data(d.vencimento)} · ${reais(d.valor)}`),
    );
    for (let i = 0; i < dups.length; i += 4) linhas.push(dups.slice(i, i + 4));
    const resumo: CampoEspelho[] = [];
    if (fat)
      resumo.push(
        campo("Fatura", txt(fat, "nFat")),
        valorCampo("Valor original", num(fat, "vOrig")),
        valorCampo("Desconto", num(fat, "vDesc")),
        valorCampo("Valor líquido", num(fat, "vLiq")),
      );
    if (pagamentos.length)
      resumo.push(
        campo(
          "Forma de pagamento",
          pagamentos
            .map((p) => `${FORMA_PAGAMENTO[txt(p, "tPag") ?? ""] ?? `Código ${txt(p, "tPag") ?? "—"}`} ${reais(num(p, "vPag"))}`)
            .join("; "),
          2,
        ),
      );
    if (resumo.length) linhas.push(resumo);
    blocos.push({ tipo: "campos", titulo: "Fatura / duplicatas", linhas });
  }

  const extras: CampoEspelho[] = [
    ["Valor do imposto de importação", num(tot, "vII")],
    ["Valor do FCP", num(tot, "vFCP")],
    ["Valor do FCP ST", num(tot, "vFCPST")],
    ["ICMS UF destino (DIFAL)", num(tot, "vICMSUFDest")],
    ["IBS (reforma)", nota.ibs_valor],
    ["CBS (reforma)", nota.cbs_valor],
  ]
    .filter(([, v]) => (v as number) > 0)
    .map(([r, v]) => valorCampo(r as string, v as number));
  blocos.push({
    tipo: "campos",
    titulo: "Cálculo do imposto",
    linhas: [
      [
        valorCampo("Base de cálculo do ICMS", nota.icms_base),
        valorCampo("Valor do ICMS", nota.icms_valor),
        valorCampo("Base de cálculo do ICMS ST", nota.icms_st_base),
        valorCampo("Valor do ICMS ST", nota.icms_st_valor),
        valorCampo("Valor do PIS", nota.pis_valor),
        valorCampo("Valor da COFINS", nota.cofins_valor),
        valorCampo("Valor total dos produtos", nota.valor_produtos),
      ],
      [
        valorCampo("Valor do frete", nota.valor_frete),
        valorCampo("Valor do seguro", nota.valor_seguro),
        valorCampo("Desconto", nota.valor_desconto),
        valorCampo("Outras despesas", nota.valor_outros),
        valorCampo("Valor do IPI", nota.ipi_valor),
        valorCampo("Tributos aproximados", num(tot, "vTotTrib")),
        valorCampo("Valor total da nota", nota.valor_total, 1, true),
      ],
      ...(extras.length ? [extras] : []),
    ],
  });

  if (!nfce || transporta || vols.length) {
    const soma = (campoVol: string) => vols.reduce((a, v) => a + num(v, campoVol), 0);
    const um = (campoVol: string) =>
      juntar(
        vols.map((v) => txt(v, campoVol)),
        ", ",
      );
    blocos.push({
      tipo: "campos",
      titulo: "Transportador / volumes transportados",
      linhas: [
        [
          campo("Nome / razão social", txt(transporta, "xNome"), 3.4),
          campo("Frete por conta", MOD_FRETE[txt(transp, "modFrete") ?? ""] ?? txt(transp, "modFrete"), 2.2),
          campo("Código ANTT", txt(veiculo, "RNTC")),
          campo("Placa do veículo", txt(veiculo, "placa")),
          campo("UF", txt(veiculo, "UF"), 0.6),
        ],
        [
          campo("CNPJ / CPF", doc(docDe(transporta)), 1.8),
          campo("Endereço", txt(transporta, "xEnder"), 3.2),
          campo("Município", txt(transporta, "xMun"), 1.8),
          campo("UF", txt(transporta, "UF"), 0.6),
          campo("Inscrição estadual", txt(transporta, "IE"), 1.4),
        ],
        [
          campo("Quantidade", vols.length ? decimal(soma("qVol"), 0, 0) : ""),
          campo("Espécie", um("esp")),
          campo("Marca", um("marca")),
          campo("Numeração", um("nVol")),
          campo("Peso bruto", vols.length ? `${decimal(soma("pesoB"), 3, 3)} kg` : ""),
          campo("Peso líquido", vols.length ? `${decimal(soma("pesoL"), 3, 3)} kg` : ""),
        ],
      ],
    });
  }

  const dets = filhos(inf, "det");
  blocos.push({
    tipo: "tabela",
    titulo: "Dados dos produtos / serviços",
    colunas: [
      { titulo: "Código", peso: 1.3 },
      { titulo: "Descrição do produto / serviço", peso: 4.2 },
      { titulo: "NCM/SH", peso: 1.15 },
      { titulo: "O/CST", peso: 0.75 },
      { titulo: "CFOP", peso: 0.75 },
      { titulo: "Un.", peso: 0.6 },
      { titulo: "Quant.", peso: 1.05, direita: true },
      { titulo: "Valor unit.", peso: 1.15, direita: true },
      { titulo: "Valor total", peso: 1.2, direita: true },
      { titulo: "BC ICMS", peso: 1.15, direita: true },
      { titulo: "Valor ICMS", peso: 1.05, direita: true },
      { titulo: "Valor IPI", peso: 1, direita: true },
      { titulo: "Alíq. ICMS", peso: 0.8, direita: true },
      { titulo: "Alíq. IPI", peso: 0.75, direita: true },
    ],
    linhas: nota.itens.map((it, k) => {
      const det = dets[k];
      const icms = filho(filho(det, "imposto"), "ICMS")?.filhos[0];
      const ipiTrib = filho(filho(filho(det, "imposto"), "IPI"), "IPITrib");
      const infAd = txt(det, "infAdProd");
      const sem = (v: number) => (v ? reais(v) : "");
      return [
        ou(it.codigo),
        infAd ? `${it.descricao}\n${infAd}` : it.descricao,
        ou(it.ncm),
        `${ou(txt(icms, "orig"))}${ou(it.icms_cst)}`,
        ou(it.cfop),
        ou(it.unidade),
        quantidade(it.quantidade),
        unitario(it.valor_unitario),
        reais(it.valor_total),
        sem(it.icms_base),
        sem(it.icms_valor),
        sem(it.ipi_valor),
        it.icms_aliquota ? aliquota(it.icms_aliquota) : "",
        num(ipiTrib, "pIPI") ? aliquota(num(ipiTrib, "pIPI")) : "",
      ];
    }),
  });

  const adicionais = juntar(
    [txt(infAdic, "infCpl"), txt(infAdic, "infAdFisco") ? `Reservado ao fisco: ${txt(infAdic, "infAdFisco")}` : null],
    "\n\n",
  );
  if (adicionais) blocos.push({ tipo: "texto", titulo: "Dados adicionais · informações complementares", texto: adicionais });

  const chave = nota.chave;
  return {
    tipo: nfce ? "nfce" : "nfe",
    sigla,
    descricao: nfce ? "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica" : "Documento Auxiliar da Nota Fiscal Eletrônica",
    emitente: {
      nome: nomeEmit,
      linhas: [
        logradouro(ender),
        juntar([txt(ender, "xBairro"), cep(txt(ender, "CEP")) ? `CEP ${cep(txt(ender, "CEP"))}` : ""], " - "),
        juntar([txt(ender, "xMun"), txt(ender, "UF")], " - "),
        fone(txt(ender, "fone")) ? `Fone ${fone(txt(ender, "fone"))}` : "",
      ].filter(Boolean),
    },
    identificacao: [
      campo("Tipo", nota.tipo_nf === "0" ? "0 - Entrada" : "1 - Saída"),
      campo("Número", numeroDanfe(nota.numero)),
      campo("Série", nota.serie),
      campo("Emissão", dataHoraXml(nota.emissao)),
    ],
    chave,
    chaveFormatada: formatarChave(chave),
    codigoBarras: true,
    consulta: nfce
      ? ou(txt(descendente(raiz, "infNFeSupl"), "urlChave"), "Consulte pela chave de acesso no site da SEFAZ do estado")
      : "Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br/portal) ou no site da SEFAZ autorizadora",
    aviso: avisoDaSituacao(nota.situacao, txt(ide, "tpAmb") === "2", nfce ? "NFC-e" : "NF-e"),
    blocos,
    titulo: `${nfce ? "NFC-e" : "NF-e"} ${nota.numero ?? ""} · ${nomeEmit}`,
    arquivo: nomeArquivoEspelho(nfce ? "NFCe" : "NFe", nota.numero, nomeEmit),
  };
}

// ------------------------------------------------------------------------------------------------ NFS-e Nacional

const TRIB_ISSQN: Record<string, string> = {
  "1": "Operação tributável",
  "2": "Imunidade",
  "3": "Exportação de serviço",
  "4": "Não incidência",
};
const RET_ISSQN: Record<string, string> = { "1": "Não retido", "2": "Retido pelo tomador", "3": "Retido pelo intermediário" };

function blocoPessoaNfse(titulo: string, pessoa: NoXml | undefined, nomeReserva?: string | null, municipio?: string | null): BlocoEspelho {
  const end = filho(pessoa, "end") ?? filho(pessoa, "enderNac");
  const endNac = filho(end, "endNac") ?? end;
  return {
    tipo: "campos",
    titulo,
    linhas: [
      [
        campo("Nome / razão social", txt(pessoa, "xNome") ?? nomeReserva, 3),
        campo("CNPJ / CPF", doc(docDe(pessoa)), 1.6),
        campo("Inscrição municipal", txt(pessoa, "IM"), 1.2),
      ],
      [
        campo("Endereço", juntar([logradouro(end), txt(end, "xBairro")], " - "), 3),
        campo("Município", juntar([municipio ?? (txt(endNac, "cMun") && `IBGE ${txt(endNac, "cMun")}`), txt(endNac, "UF")], " - "), 1.6),
        campo("CEP", cep(txt(endNac, "CEP")), 1.2),
      ],
      [campo("Telefone", fone(txt(pessoa, "fone"))), campo("E-mail", txt(pessoa, "email"), 2)],
    ].filter((l, i) => i === 0 || l.some((c) => c.valor)),
  };
}

function espelhoNfseNacional(raiz: NoXml): Espelho {
  const nota = lerNfse(raiz);
  const inf = descendente(raiz, "infNFSe")!;
  const dps = descendente(inf, "infDPS");
  const emit = filho(inf, "emit");
  const prest = filho(dps, "prest");
  const toma = filho(dps, "toma");
  const interm = filho(dps, "interm");
  const serv = filho(dps, "serv");
  const cServ = filho(serv, "cServ");
  const valNfse = filho(inf, "valores");
  const valDps = filho(dps, "valores");
  const trib = filho(valDps, "trib");
  const tribMun = filho(trib, "tribMun");
  const tribFed = filho(trib, "tribFed");
  const piscofins = filho(tribFed, "piscofins");
  const nomeEmit = ou(nota.emitente_nome, "Prestador não informado");
  const servico = nota.valor_total;
  const issRetido = nota.iss_retido ? nota.iss_valor : 0;
  const pisCofinsRetido = txt(piscofins, "tpRetPisCofins") === "1";
  const deducoes = num(achar(valDps, "vDedRed"), "vDR") || num(valNfse, "vCalcDR");
  const descIncond = num(achar(valDps, "vDescCondIncond"), "vDescIncond");
  const descCond = num(achar(valDps, "vDescCondIncond"), "vDescCond");
  const base = num(valNfse, "vBC") || Math.max(0, servico - deducoes - descIncond);
  const liquido = num(valNfse, "vLiq") || servico - issRetido - nota.retencoes - descIncond - descCond;
  const enderEmit = filho(emit, "enderNac");

  const blocos: BlocoEspelho[] = [
    {
      tipo: "campos",
      titulo: "Dados da NFS-e",
      linhas: [
        [
          campo("Número da NFS-e", nota.numero),
          campo("Competência", data(txt(dps, "dCompet"))),
          campo("Data e hora da emissão da NFS-e", dataHoraXml(txt(inf, "dhProc")), 1.4),
          campo("Número do DFS-e", txt(inf, "nDFSe")),
        ],
        [
          campo("Número da DPS", txt(dps, "nDPS")),
          campo("Série da DPS", txt(dps, "serie")),
          campo("Data e hora da emissão da DPS", dataHoraXml(txt(dps, "dhEmi")), 1.4),
          campo("Local de emissão", txt(inf, "xLocEmi")),
        ],
      ],
    },
    blocoPessoaNfse("Prestador do serviço", emit ?? prest, txt(prest, "xNome"), txt(inf, "xLocEmi")),
  ];
  if (toma) blocos.push(blocoPessoaNfse("Tomador do serviço", toma));
  else blocos.push({ tipo: "texto", titulo: "Tomador do serviço", texto: "Tomador não identificado na NFS-e." });
  if (interm) blocos.push(blocoPessoaNfse("Intermediário do serviço", interm));

  blocos.push({
    tipo: "campos",
    titulo: "Serviço prestado",
    linhas: [
      [
        campo("Código de tributação nacional", juntar([txt(cServ, "cTribNac"), txt(inf, "xTribNac")], " - "), 3),
        campo("Código de tributação municipal", juntar([txt(cServ, "cTribMun"), txt(inf, "xTribMun")], " - "), 1.6),
        campo("Código NBS", txt(cServ, "cNBS"), 1.2),
      ],
      [
        campo("Local da prestação", juntar([txt(inf, "xLocPrestacao"), txt(filho(serv, "locPrest"), "cLocPrestacao")], " - "), 3),
        campo("Município de incidência do ISSQN", txt(inf, "xLocIncid"), 2.8),
      ],
    ],
  });
  blocos.push({ tipo: "texto", titulo: "Descrição do serviço", texto: ou(txt(cServ, "xDescServ"), "(sem descrição)") });

  blocos.push({
    tipo: "campos",
    titulo: "Tributação municipal (ISSQN)",
    linhas: [
      [
        campo("Tributação do ISSQN", TRIB_ISSQN[txt(tribMun, "tribISSQN") ?? ""] ?? txt(tribMun, "tribISSQN"), 1.4),
        campo("Retenção do ISSQN", RET_ISSQN[txt(tribMun, "tpRetISSQN") ?? ""] ?? txt(tribMun, "tpRetISSQN"), 1.4),
        valorCampo("Valor do serviço", servico),
        valorCampo("Desconto incondicionado", descIncond),
      ],
      [
        valorCampo("Deduções / reduções", deducoes),
        valorCampo("Base de cálculo", base),
        campo(
          "Alíquota",
          num(valNfse, "pAliqAplic") || num(tribMun, "pAliq") ? `${aliquota(num(valNfse, "pAliqAplic") || num(tribMun, "pAliq"))}%` : "",
          1,
          {
            direita: true,
          },
        ),
        valorCampo("ISSQN apurado", nota.iss_valor),
        valorCampo("ISSQN retido", issRetido),
      ],
    ],
  });

  blocos.push({
    tipo: "campos",
    titulo: "Tributação federal",
    linhas: [
      [
        valorCampo(`PIS${pisCofinsRetido ? " (retido)" : ""}`, num(piscofins, "vPis")),
        valorCampo(`COFINS${pisCofinsRetido ? " (retida)" : ""}`, num(piscofins, "vCofins")),
        valorCampo("IRRF retido", num(tribFed, "vRetIRRF")),
        valorCampo("CSLL retida", num(tribFed, "vRetCSLL")),
        valorCampo("INSS / contribuição previdenciária retida", num(tribFed, "vRetCP"), 1.4),
      ],
    ],
  });

  blocos.push({
    tipo: "campos",
    titulo: "Valor total da NFS-e",
    linhas: [
      [
        valorCampo("Valor do serviço", servico),
        valorCampo("Desconto condicionado", descCond),
        valorCampo("Desconto incondicionado", descIncond),
        valorCampo("ISSQN retido", issRetido),
        valorCampo("Retenções federais", nota.retencoes),
        valorCampo("Valor líquido da NFS-e", liquido, 1.2, true),
      ],
    ],
  });

  const compl = juntar(
    [
      txt(filho(serv, "infoCompl"), "xInfComp"),
      txt(filho(serv, "infoCompl"), "xPed") ? `Pedido: ${txt(filho(serv, "infoCompl"), "xPed")}` : null,
      nota.ibs_valor || nota.cbs_valor
        ? `IBS ${reais(nota.ibs_valor)} · CBS ${reais(nota.cbs_valor)} (reforma tributária, informativo)`
        : null,
    ],
    "\n\n",
  );
  if (compl) blocos.push({ tipo: "texto", titulo: "Informações complementares", texto: compl });

  return {
    tipo: "nfse",
    sigla: "DANFSe",
    descricao: "Documento Auxiliar da NFS-e (padrão nacional)",
    emitente: {
      rotulo: "Prestador do serviço",
      nome: nomeEmit,
      linhas: [
        juntar([logradouro(enderEmit), txt(enderEmit, "xBairro")], " - "),
        juntar([txt(inf, "xLocEmi"), txt(enderEmit, "UF"), cep(txt(enderEmit, "CEP")) ? `CEP ${cep(txt(enderEmit, "CEP"))}` : ""], " - "),
        juntar([doc(nota.emitente_doc) && `CNPJ/CPF ${doc(nota.emitente_doc)}`, txt(emit, "IM") && `IM ${txt(emit, "IM")}`]),
        juntar([fone(txt(emit, "fone")) && `Fone ${fone(txt(emit, "fone"))}`, txt(emit, "email")]),
      ].filter(Boolean),
    },
    identificacao: [
      campo("Número da NFS-e", nota.numero),
      campo("Competência", data(txt(dps, "dCompet"))),
      campo("Emissão", dataHoraXml(txt(inf, "dhProc") ?? nota.emissao)),
    ],
    chave: nota.chave,
    chaveFormatada: formatarChave(nota.chave),
    codigoBarras: false,
    consulta: "Consulte a autenticidade pela chave de acesso em www.nfse.gov.br/consultapublica",
    aviso: avisoDaSituacao(nota.situacao, txt(dps, "tpAmb") === "2", "NFS-e"),
    blocos,
    titulo: `NFS-e ${nota.numero ?? ""} · ${nomeEmit}`,
    arquivo: nomeArquivoEspelho("NFSe", nota.numero, nomeEmit),
  };
}

// ------------------------------------------------------------------------------------------------ NFS-e ABRASF

/** Primeiro texto entre vários nomes de elemento procurados em qualquer nível. */
const t = (no: NoXml | undefined, ...nomes: string[]) => {
  for (const n of nomes) {
    const v = txt(descendente(no, n));
    if (v) return v;
  }
  return null;
};
const n = (no: NoXml | undefined, ...nomes: string[]) => {
  const v = t(no, ...nomes);
  return v ? Number(v.replace(",", ".")) || 0 : 0;
};

/** Prestador/tomador ABRASF: na versão 2.x o nome e o endereço ficam na NFS-e e o CNPJ/IM na declaração (DPS). */
function blocoPessoaAbrasf(titulo: string, nos: (NoXml | undefined)[]): BlocoEspelho {
  const v = (...nomes: string[]) => nos.reduce<string | null>((achado, no) => achado ?? t(no, ...nomes), null);
  const end = nos.map((no) => descendente(no, "Endereco")).find(Boolean);
  return {
    tipo: "campos",
    titulo,
    linhas: [
      [
        campo("Nome / razão social", v("RazaoSocial", "NomeFantasia"), 3),
        campo("CNPJ / CPF", doc(v("Cnpj", "Cpf"))),
        campo("Inscrição municipal", v("InscricaoMunicipal")),
      ],
      [
        campo("Endereço", juntar([logradouro(end, "Endereco", "Numero", "Complemento"), txt(end, "Bairro")], " - "), 3),
        campo("Município / UF", juntar([t(end, "CodigoMunicipio"), t(end, "Uf", "UF")], " - ")),
        campo("CEP", cep(t(end, "Cep"))),
      ],
      [campo("Telefone", fone(v("Telefone"))), campo("E-mail", v("Email"), 2)],
    ].filter((l, i) => i === 0 || l.some((c) => c.valor)),
  };
}

function espelhoNfseAbrasf(raiz: NoXml, inf: NoXml): Espelho {
  const decl = descendente(raiz, "InfDeclaracaoPrestacaoServico") ?? inf;
  const servico = descendente(decl, "Servico") ?? descendente(inf, "Servico");
  const valores = filho(servico, "Valores");
  const valNfse = filho(inf, "ValoresNfse") ?? valores;
  const prestador = filho(inf, "PrestadorServico");
  const prestadorDecl = descendente(decl, "Prestador");
  const tomador = descendente(decl, "TomadorServico") ?? descendente(decl, "Tomador") ?? descendente(inf, "TomadorServico");
  const numero = txt(inf, "Numero");
  const nomeEmit = ou(t(prestador, "RazaoSocial", "NomeFantasia") ?? t(prestadorDecl, "RazaoSocial"), "Prestador não informado");
  const docPrestador = t(prestador, "Cnpj", "Cpf") ?? t(prestadorDecl, "Cnpj", "Cpf");
  const imPrestador = t(prestador, "InscricaoMunicipal") ?? t(prestadorDecl, "InscricaoMunicipal");
  const vServ = n(valores, "ValorServicos");
  const ret = {
    pis: n(valores, "ValorPis"),
    cofins: n(valores, "ValorCofins"),
    inss: n(valores, "ValorInss"),
    ir: n(valores, "ValorIr"),
    csll: n(valores, "ValorCsll"),
    outras: n(valores, "OutrasRetencoes"),
  };
  const issRetido = (t(servico, "IssRetido") ?? t(valores, "IssRetido")) === "1";
  const iss = n(valNfse, "ValorIss") || n(valores, "ValorIss");
  const aliq = n(valNfse, "Aliquota") || n(valores, "Aliquota");
  const descIncond = n(valores, "DescontoIncondicionado");
  const descCond = n(valores, "DescontoCondicionado");
  const somaRet = ret.pis + ret.cofins + ret.inss + ret.ir + ret.csll + ret.outras;
  const liquido = n(valNfse, "ValorLiquidoNfse") || vServ - somaRet - (issRetido ? iss : 0) - descIncond - descCond;
  const verificacao = txt(inf, "CodigoVerificacao");
  const cancelada = !!descendente(raiz, "NfseCancelamento") || !!descendente(raiz, "Cancelamento");
  const emissao = txt(inf, "DataEmissao");
  const competencia = t(decl, "Competencia") ?? txt(inf, "Competencia");
  const rps = descendente(decl, "IdentificacaoRps");

  const blocos: BlocoEspelho[] = [
    {
      tipo: "campos",
      titulo: "Dados da NFS-e",
      linhas: [
        [
          campo("Número da NFS-e", numero),
          campo("Código de verificação", verificacao, 1.4),
          campo("Data e hora da emissão", dataHoraXml(emissao), 1.4),
          campo("Competência", data(competencia)),
        ],
        [
          campo("RPS (número / série)", juntar([txt(rps, "Numero"), txt(rps, "Serie")], " / ")),
          campo("Município gerador (código IBGE)", t(filho(inf, "OrgaoGerador"), "CodigoMunicipio"), 1.4),
          campo("Natureza da operação", t(inf, "NaturezaOperacao") ?? t(decl, "NaturezaOperacao"), 1.4),
          campo(
            "Optante pelo Simples",
            { "1": "Sim", "2": "Não" }[t(decl, "OptanteSimplesNacional") ?? t(inf, "OptanteSimplesNacional") ?? ""] ?? "",
          ),
        ],
      ],
    },
    blocoPessoaAbrasf("Prestador do serviço", [prestador, prestadorDecl]),
    tomador
      ? blocoPessoaAbrasf("Tomador do serviço", [tomador])
      : { tipo: "texto", titulo: "Tomador do serviço", texto: "Tomador não identificado na NFS-e." },
    {
      tipo: "campos",
      titulo: "Serviço prestado",
      linhas: [
        [
          campo("Item da lista de serviços (LC 116)", t(servico, "ItemListaServico"), 1.4),
          campo("CNAE", t(servico, "CodigoCnae")),
          campo("Código de tributação municipal", t(servico, "CodigoTributacaoMunicipio"), 1.4),
          campo("Local da prestação (código IBGE)", t(servico, "CodigoMunicipio", "MunicipioPrestacaoServico"), 1.4),
          campo("Município de incidência", t(servico, "MunicipioIncidencia")),
        ],
      ],
    },
    { tipo: "texto", titulo: "Descrição do serviço", texto: ou(t(servico, "Discriminacao"), "(sem descrição)") },
    {
      tipo: "campos",
      titulo: "Valores e impostos",
      linhas: [
        [
          valorCampo("Valor do serviço", vServ),
          valorCampo("Deduções", n(valores, "ValorDeducoes")),
          valorCampo("Desconto incondicionado", descIncond),
          valorCampo("Base de cálculo", n(valNfse, "BaseCalculo") || n(valores, "BaseCalculo")),
          campo("Alíquota", aliq ? `${aliquota(aliq < 1 ? aliq * 100 : aliq)}%` : "", 1, { direita: true }),
          valorCampo("ISS", iss),
        ],
        [
          campo("ISS retido", issRetido ? `Sim · ${reais(iss)}` : "Não", 1, { direita: true }),
          valorCampo("PIS retido", ret.pis),
          valorCampo("COFINS retida", ret.cofins),
          valorCampo("CSLL retida", ret.csll),
          valorCampo("IR retido", ret.ir),
          valorCampo("INSS retido", ret.inss),
        ],
        [
          valorCampo("Outras retenções", ret.outras),
          valorCampo("Desconto condicionado", descCond),
          valorCampo("Valor líquido da NFS-e", liquido, 1.2, true),
        ],
      ],
    },
  ];
  const outras = t(inf, "OutrasInformacoes") ?? t(decl, "InformacoesComplementares");
  if (outras) blocos.push({ tipo: "texto", titulo: "Informações complementares", texto: outras });

  return {
    tipo: "nfse",
    sigla: "NFS-e",
    descricao: "Espelho da Nota Fiscal de Serviços Eletrônica (padrão municipal ABRASF)",
    emitente: {
      rotulo: "Prestador do serviço",
      nome: nomeEmit,
      linhas: [
        juntar([docPrestador && `CNPJ/CPF ${doc(docPrestador)}`, imPrestador && `IM ${imPrestador}`]),
        juntar([logradouro(descendente(prestador, "Endereco"), "Endereco", "Numero", "Complemento"), t(prestador, "Bairro")], " - "),
      ].filter(Boolean),
    },
    identificacao: [campo("Número da NFS-e", numero), campo("Código de verificação", verificacao), campo("Emissão", dataHoraXml(emissao))],
    chave: null,
    chaveFormatada: null,
    codigoBarras: false,
    consulta: "Consulte a autenticidade no site da prefeitura do prestador, com o número e o código de verificação",
    aviso: cancelada ? "NFS-e CANCELADA" : null,
    blocos,
    titulo: `NFS-e ${numero ?? ""} · ${nomeEmit}`,
    arquivo: nomeArquivoEspelho("NFSe", numero, nomeEmit),
  };
}

// ------------------------------------------------------------------------------------------------ CT-e

const TOMADOR_CTE: Record<string, string> = { "0": "Remetente", "1": "Expedidor", "2": "Recebedor", "3": "Destinatário", "4": "Outro" };
const MODAL_CTE: Record<string, string> = {
  "01": "Rodoviário",
  "02": "Aéreo",
  "03": "Aquaviário",
  "04": "Ferroviário",
  "05": "Dutoviário",
  "06": "Multimodal",
};

function espelhoCte(raiz: NoXml, inf: NoXml): Espelho {
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const ender = filho(emit, "enderEmit");
  const prot = descendente(raiz, "infProt");
  const vPrest = filho(inf, "vPrest");
  const icms = achar(inf, "imp/ICMS")?.filhos[0];
  const carga = descendente(inf, "infCarga");
  const chave = so(inf.atributos.Id) || so(txt(prot, "chCTe"));
  const numero = txt(ide, "nCT");
  const nomeEmit = ou(txt(emit, "xNome"), "Emitente não informado");
  const codTomador = txt(achar(ide, "toma3"), "toma") ?? txt(achar(ide, "toma4"), "toma") ?? txt(ide, "toma3/toma");
  const pessoa = (titulo: string, no: NoXml | undefined): CampoEspelho[] =>
    no
      ? [
          campo(titulo, txt(no, "xNome"), 2.4),
          campo("CNPJ / CPF", doc(docDe(no))),
          campo("Município / UF", juntar([txtDeEnder(no, "xMun"), txtDeEnder(no, "UF")], " - ")),
        ]
      : [];
  const cStat = txt(prot, "cStat");
  const blocos: BlocoEspelho[] = [
    {
      tipo: "campos",
      titulo: "Dados do CT-e",
      linhas: [
        [
          campo("CFOP - natureza da prestação", juntar([txt(ide, "CFOP"), txt(ide, "natOp")], " - "), 2.4),
          campo("Protocolo de autorização", juntar([txt(prot, "nProt"), dataHoraXml(txt(prot, "dhRecbto"))], " - "), 1.8),
        ],
        [
          campo("Modal", MODAL_CTE[txt(ide, "modal") ?? ""] ?? txt(ide, "modal")),
          campo("Início da prestação", juntar([txt(ide, "xMunIni"), txt(ide, "UFIni")], " - "), 1.4),
          campo("Término da prestação", juntar([txt(ide, "xMunFim"), txt(ide, "UFFim")], " - "), 1.4),
          campo("Tomador do serviço", TOMADOR_CTE[codTomador ?? ""] ?? ""),
        ],
      ],
    },
    {
      tipo: "campos",
      titulo: "Participantes",
      linhas: [
        pessoa("Remetente", filho(inf, "rem")),
        pessoa("Destinatário", filho(inf, "dest")),
        pessoa("Expedidor", filho(inf, "exped")),
        pessoa("Recebedor", filho(inf, "receb")),
        pessoa("Tomador (outro)", achar(ide, "toma4")),
      ].filter((l) => l.length),
    },
    {
      tipo: "campos",
      titulo: "Valores da prestação e imposto",
      linhas: [
        [
          ...filhos(vPrest, "Comp").map((c) => valorCampo(ou(txt(c, "xNome"), "Componente"), num(c, "vComp"))),
          valorCampo("Valor total da prestação", num(vPrest, "vTPrest"), 1.2, true),
          valorCampo("Valor a receber", num(vPrest, "vRec")),
        ],
        [
          campo("CST do ICMS", txt(icms, "CST")),
          valorCampo("Base de cálculo do ICMS", num(icms, "vBC")),
          campo("Alíquota do ICMS", num(icms, "pICMS") ? `${aliquota(num(icms, "pICMS"))}%` : "", 1, { direita: true }),
          valorCampo("Valor do ICMS", num(icms, "vICMS")),
        ],
      ],
    },
  ];
  if (carga)
    blocos.push({
      tipo: "campos",
      titulo: "Carga",
      linhas: [
        [
          campo("Produto predominante", txt(carga, "proPred"), 2),
          valorCampo("Valor da carga", num(carga, "vCarga")),
          campo(
            "Quantidades",
            filhos(carga, "infQ")
              .map((q) => `${txt(q, "tpMed") ?? ""} ${quantidade(num(q, "qCarga"))}`.trim())
              .join("; "),
            2,
          ),
        ],
      ],
    });
  const docs = descendentes(filho(descendente(inf, "infCTeNorm"), "infDoc"), "chave").map((c) => [formatarChave(c.texto)]);
  if (docs.length)
    blocos.push({
      tipo: "tabela",
      titulo: "Documentos transportados (chaves)",
      colunas: [{ titulo: "Chave de acesso", peso: 1 }],
      linhas: docs,
    });
  const obs = txt(achar(inf, "compl"), "xObs");
  if (obs) blocos.push({ tipo: "texto", titulo: "Observações", texto: obs });
  return {
    tipo: "cte",
    sigla: "DACTE",
    descricao: "Documento Auxiliar do Conhecimento de Transporte Eletrônico",
    emitente: {
      nome: nomeEmit,
      linhas: [
        logradouro(ender),
        juntar([txt(ender, "xMun"), txt(ender, "UF")], " - "),
        juntar([doc(docDe(emit)) && `CNPJ ${doc(docDe(emit))}`, txt(emit, "IE") && `IE ${txt(emit, "IE")}`]),
      ].filter(Boolean),
    },
    identificacao: [
      campo("Número", numeroDanfe(numero)),
      campo("Série", txt(ide, "serie")),
      campo("Emissão", dataHoraXml(txt(ide, "dhEmi"))),
    ],
    chave: chave.length === 44 ? chave : null,
    chaveFormatada: chave.length === 44 ? formatarChave(chave) : null,
    codigoBarras: chave.length === 44,
    consulta: "Consulta de autenticidade no portal nacional do CT-e (www.cte.fazenda.gov.br/portal) ou no site da SEFAZ autorizadora",
    aviso:
      cStat && ["101", "135", "151", "155"].includes(cStat)
        ? "CT-e CANCELADO"
        : txt(ide, "tpAmb") === "2"
          ? "EMITIDO EM HOMOLOGAÇÃO — SEM VALOR FISCAL"
          : null,
    blocos,
    titulo: `CT-e ${numero ?? ""} · ${nomeEmit}`,
    arquivo: nomeArquivoEspelho("CTe", numero, nomeEmit),
  };
}
function txtDeEnder(no: NoXml, campoEnd: string) {
  const end = no.filhos.find((f) => f.nome.startsWith("ender"));
  return txt(end, campoEnd);
}

// ------------------------------------------------------------------------------------------------ resumo e genérico

function espelhoResumo(raiz: NoXml): Espelho {
  const r = lerResNFe(raiz);
  const nome = ou(r.emitente_nome, "Fornecedor não informado");
  return {
    tipo: "resumo",
    sigla: "RESUMO",
    descricao: "Resumo da NF-e entregue pela SEFAZ antes da ciência",
    emitente: {
      nome,
      linhas: [juntar([doc(r.emitente_doc) && `CNPJ/CPF ${doc(r.emitente_doc)}`, r.emitente_ie && `IE ${r.emitente_ie}`])].filter(Boolean),
    },
    identificacao: [campo("Número", numeroDanfe(r.numero)), campo("Série", r.serie), campo("Emissão", dataHoraXml(r.emissao))],
    chave: r.chave,
    chaveFormatada: formatarChave(r.chave),
    codigoBarras: true,
    consulta: "Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br/portal)",
    aviso: r.situacao === "cancelada" ? "NF-e CANCELADA" : r.situacao === "denegada" ? "USO DENEGADO" : null,
    blocos: [
      {
        tipo: "campos",
        titulo: "Dados do resumo",
        linhas: [
          [campo("Fornecedor", nome, 2.4), campo("CNPJ / CPF", doc(r.emitente_doc)), campo("Inscrição estadual", r.emitente_ie)],
          [
            campo("Tipo", r.tipo_nf === "0" ? "0 - Entrada" : "1 - Saída"),
            campo("Protocolo de autorização", juntar([r.protocolo, dataHoraXml(r.autorizacao)], " - "), 2),
            valorCampo("Valor total da nota", r.valor_total, 1, true),
          ],
        ],
      },
      {
        tipo: "texto",
        titulo: "Por que só o resumo?",
        texto:
          "A SEFAZ entrega o XML completo (com itens, impostos e transporte) depois que a empresa dá ciência ou confirma a operação. " +
          "Responda à nota em Notas recebidas; o XML completo chega numa das próximas buscas automáticas e aí o espelho fica igual ao DANFE.",
      },
    ],
    titulo: `NF-e ${r.numero ?? ""} · ${nome} (resumo)`,
    arquivo: nomeArquivoEspelho("NFe-resumo", r.numero, nome),
  };
}

/** Qualquer outro XML: lista de todos os campos com texto (caminho e valor), até 200 linhas. */
function espelhoGenerico(raiz: NoXml, motivo?: string): Espelho {
  const linhas: string[][] = [];
  const andar = (no: NoXml, caminho: string) => {
    if (linhas.length >= 200) return;
    const aqui = caminho ? `${caminho} › ${no.nome}` : no.nome;
    const texto = no.texto.trim();
    if (texto && !no.filhos.length) linhas.push([aqui, texto.length > 400 ? texto.slice(0, 400) + "…" : texto]);
    for (const f of no.filhos) if (f.nome !== "Signature") andar(f, aqui);
  };
  andar(raiz, "");
  const chave = [descendente(raiz, "chNFe"), descendente(raiz, "chCTe")].map((c) => so(c?.texto)).find((c) => c.length === 44) ?? null;
  const nome = ou(txt(descendente(raiz, "xNome")) ?? t(raiz, "RazaoSocial"), "Documento fiscal");
  return {
    tipo: "outro",
    sigla: "ESPELHO",
    descricao: `Conteúdo do XML (${raiz.nome})`,
    emitente: { nome, linhas: [doc(txt(descendente(raiz, "CNPJ")) ?? txt(descendente(raiz, "Cnpj")))].filter(Boolean) },
    identificacao: [campo("Tipo de arquivo", raiz.nome)],
    chave,
    chaveFormatada: chave ? formatarChave(chave) : null,
    codigoBarras: false,
    consulta: null,
    aviso: null,
    blocos: [
      ...(motivo ? [{ tipo: "texto" as const, titulo: "Aviso", texto: motivo }] : []),
      {
        tipo: "texto",
        titulo: "Sobre este espelho",
        texto:
          "O HUB ainda não tem um layout próprio para este tipo de XML. Abaixo estão todos os campos preenchidos, na ordem do arquivo.",
      },
      {
        tipo: "tabela",
        titulo: "Campos do XML",
        colunas: [
          { titulo: "Campo", peso: 2 },
          { titulo: "Valor", peso: 3 },
        ],
        linhas,
      },
    ],
    titulo: `${nome} · ${raiz.nome}`,
    arquivo: nomeArquivoEspelho("Documento", raiz.nome, nome),
  };
}

// ------------------------------------------------------------------------------------------------ porta de entrada

/** Qual nota abrir: a chave de acesso (NF-e, CT-e, NFS-e Nacional) ou, no ABRASF, o número e o CNPJ/CPF do prestador. */
export interface AlvoEspelho {
  chave?: string | null;
  numero?: string | null;
  prestador?: string | null;
}

export const ERRO_NOTA_FORA_DO_LOTE = "Não encontrei esta nota dentro do arquivo guardado. Baixe o XML para conferir.";

/** Número da NFS-e sem zeros à esquerda ("000321" e "321" são a mesma nota). */
const numeroNota = (s: string | null | undefined) => (s ?? "").trim().replace(/^0+(?=.)/, "");

/**
 * Escolhe, num arquivo com várias notas (lote de NFS-e, vários nfeProc/cteProc, lista ABRASF), a nota pedida.
 * Sem correspondência lança `ErroApp`: mostrar outra nota do mesmo arquivo levaria a baixar o PDF errado.
 */
function escolherNoLote(raiz: NoXml, alvo?: AlvoEspelho): NoXml {
  const chave = so(alvo?.chave);
  for (const nome of ["NFSe", "nfeProc", "cteProc"]) {
    const lista = descendentes(raiz, nome);
    if (lista.length <= 1) continue;
    const inf = nome === "NFSe" ? "infNFSe" : nome === "cteProc" ? "infCte" : "infNFe";
    const achada = chave
      ? lista.find((no) => Object.values(descendente(no, inf)?.atributos ?? {}).some((v) => so(v) === chave))
      : undefined;
    if (!achada) throw new ErroApp(ERRO_NOTA_FORA_DO_LOTE);
    return achada;
  }
  const abrasf = descendentes(raiz, "CompNfse");
  if (abrasf.length > 1) {
    // dois prestadores podem usar a mesma numeração: confere o número E o CNPJ/CPF do prestador
    const numero = numeroNota(alvo?.numero);
    const prestador = so(alvo?.prestador);
    const achada = numero
      ? abrasf.find((c) => {
          if (numeroNota(txt(descendente(c, "InfNfse"), "Numero")) !== numero) return false;
          if (!prestador) return true;
          const docXml = t(descendente(c, "PrestadorServico"), "Cnpj", "Cpf") ?? t(descendente(c, "Prestador"), "Cnpj", "Cpf");
          return so(docXml) === prestador;
        })
      : undefined;
    if (!achada) throw new ErroApp(ERRO_NOTA_FORA_DO_LOTE);
    return achada;
  }
  return raiz;
}

/**
 * Monta o espelho a partir do texto do XML guardado. `alvo` escolhe a nota certa quando o arquivo traz várias.
 * Lança erro em português quando o arquivo não é XML ou quando a nota pedida não está no lote; um XML de layout
 * desconhecido vira o espelho genérico.
 */
export function montarEspelho(xml: string, alvo?: AlvoEspelho): Espelho {
  const raiz = escolherNoLote(lerXml(xml), alvo);
  try {
    if (raiz.nome === "resNFe") return espelhoResumo(raiz);
    // o CT-e cita as NF-e transportadas (infDoc/infNFe): ele é conferido antes da NF-e
    const infCte = descendente(raiz, "infCte");
    if (infCte) return espelhoCte(raiz, infCte);
    if (descendente(raiz, "infNFe")) return espelhoNFe(raiz);
    if (descendente(raiz, "infNFSe")) return espelhoNfseNacional(raiz);
    const infAbrasf = descendente(raiz, "InfNfse");
    if (infAbrasf) return espelhoNfseAbrasf(raiz, infAbrasf);
  } catch (e) {
    return espelhoGenerico(
      raiz,
      `Não foi possível montar o layout próprio deste documento (${e instanceof Error ? e.message : "erro na leitura"}). Os campos do XML estão abaixo.`,
    );
  }
  return espelhoGenerico(raiz);
}
