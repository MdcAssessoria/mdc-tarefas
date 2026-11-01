// Carga tributária das entradas e créditos ESTIMADOS conforme o regime da empresa. Nada de alíquota fixa aqui: as
// regras vêm da tabela fis_regras_credito (migração 032), com fonte legal e vigência; lei nova = linha nova.
// A tela mostra o resultado como "estimativa": a apuração oficial é a da MDC no Domínio.

export type Tributo = "icms" | "icms_st" | "ipi" | "pis" | "cofins" | "iss" | "ibs" | "cbs";

export interface RegraCredito {
  id: string | number;
  org_id: string | null;
  regime: string;
  tributo: Tributo;
  /** nenhum = não gera crédito; destacado = crédito igual ao imposto da nota; aliquota = base × alíquota. */
  forma: "nenhum" | "destacado" | "aliquota";
  aliquota: number | null;
  /** Base da forma "aliquota": item (produto + frete + seguro + outras − desconto + IPI) ou sem o ICMS destacado. */
  base: "item" | "item_sem_icms" | null;
  /** Tipos de entrada que dão crédito (null = todos). */
  tipos_entrada: string[] | null;
  /** Só vale se a empresa for contribuinte do imposto. */
  condicao: "contribuinte_icms" | "contribuinte_ipi" | null;
  /** CST do fornecedor que indica compra sem o tributo (monofásico, alíquota zero, suspensão…): sem crédito. */
  cst_sem_credito: string[] | null;
  explicacao: string;
  fonte_legal: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface ItemParaCredito {
  valor_total: number;
  desconto: number;
  frete: number;
  seguro: number;
  outros: number;
  icms_valor: number;
  icms_st_valor: number;
  ipi_valor: number;
  pis_cst: string | null;
  cofins_cst: string | null;
}

export interface ContextoCredito {
  regime: string | null;
  tipoEntrada: string | null;
  /** Data da entrada/emissão (AAAA-MM-DD): escolhe a regra vigente. */
  data: string;
  contribuinteIcms: boolean;
  contribuinteIpi: boolean;
  orgId?: string | null;
}

export const TRIBUTOS_CREDITO: Tributo[] = ["icms", "ipi", "pis", "cofins"];

export const NOMES_TRIBUTO: Record<Tributo, string> = {
  icms: "ICMS",
  icms_st: "ICMS-ST",
  ipi: "IPI",
  pis: "PIS",
  cofins: "COFINS",
  iss: "ISS",
  ibs: "IBS",
  cbs: "CBS",
};

/** Regra que vale para o regime, tributo e data; a regra da organização tem preferência sobre a geral. */
export function regraVigente(regras: RegraCredito[], regime: string, tributo: Tributo, data: string, orgId?: string | null) {
  const d = data.slice(0, 10);
  const vale = regras.filter(
    (r) => r.regime === regime && r.tributo === tributo && r.vigencia_inicio <= d && (!r.vigencia_fim || r.vigencia_fim >= d),
  );
  return (
    vale.filter((r) => orgId && r.org_id === orgId).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0] ??
    vale.filter((r) => !r.org_id).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0] ??
    null
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Valor do item para crédito de PIS/COFINS: produto + frete + seguro + outras − desconto + IPI (− ICMS, conforme a regra). */
export function baseDoItem(i: ItemParaCredito, base: RegraCredito["base"]): number {
  const v = i.valor_total + i.frete + i.seguro + i.outros - i.desconto + i.ipi_valor;
  return r2(Math.max(0, base === "item_sem_icms" ? v - i.icms_valor : v));
}

export interface CreditoEstimado {
  valor: number;
  regra: RegraCredito | null;
  motivo: string;
}

/** Crédito estimado de um tributo para um item, com o motivo em linguagem simples. */
export function creditoDoItem(i: ItemParaCredito, tributo: Tributo, ctx: ContextoCredito, regras: RegraCredito[]): CreditoEstimado {
  if (!ctx.regime) return { valor: 0, regra: null, motivo: "Regime tributário da empresa não informado no cadastro." };
  const regra = regraVigente(regras, ctx.regime, tributo, ctx.data, ctx.orgId);
  if (!regra) return { valor: 0, regra: null, motivo: "Sem regra cadastrada para este regime e data." };
  if (regra.forma === "nenhum") return { valor: 0, regra, motivo: regra.explicacao };
  if (regra.tipos_entrada && ctx.tipoEntrada && !regra.tipos_entrada.includes(ctx.tipoEntrada))
    return { valor: 0, regra, motivo: "Este tipo de entrada não dá crédito deste imposto." };
  if (regra.condicao === "contribuinte_icms" && !ctx.contribuinteIcms)
    return { valor: 0, regra, motivo: "A empresa não está marcada como contribuinte do ICMS." };
  if (regra.condicao === "contribuinte_ipi" && !ctx.contribuinteIpi)
    return { valor: 0, regra, motivo: "A empresa não está marcada como contribuinte do IPI (indústria)." };
  const cst = tributo === "pis" ? i.pis_cst : tributo === "cofins" ? i.cofins_cst : null;
  if (cst && regra.cst_sem_credito?.includes(cst.padStart(2, "0")))
    return { valor: 0, regra, motivo: `O fornecedor vendeu sem ${NOMES_TRIBUTO[tributo]} (CST ${cst}): não gera crédito.` };
  if (regra.forma === "destacado") {
    const v = tributo === "icms" ? i.icms_valor : tributo === "ipi" ? i.ipi_valor : tributo === "icms_st" ? i.icms_st_valor : 0;
    return { valor: r2(v), regra, motivo: regra.explicacao };
  }
  return { valor: r2((baseDoItem(i, regra.base) * Number(regra.aliquota ?? 0)) / 100), regra, motivo: regra.explicacao };
}

export interface ResumoCreditos {
  porTributo: Record<Tributo, number>;
  total: number;
}

/** Soma dos créditos estimados dos itens de uma nota (ICMS, IPI, PIS e COFINS). */
export function creditosDaNota(itens: ItemParaCredito[], ctx: ContextoCredito, regras: RegraCredito[]): ResumoCreditos {
  const porTributo = { icms: 0, icms_st: 0, ipi: 0, pis: 0, cofins: 0, iss: 0, ibs: 0, cbs: 0 } as Record<Tributo, number>;
  for (const i of itens) for (const t of TRIBUTOS_CREDITO) porTributo[t] = r2(porTributo[t] + creditoDoItem(i, t, ctx, regras).valor);
  return { porTributo, total: r2(TRIBUTOS_CREDITO.reduce((a, t) => a + porTributo[t], 0)) };
}

/** Impostos destacados numa nota (o que o fornecedor cobrou dentro do preço). */
export function impostosDestacados(n: {
  icms_valor: number;
  icms_st_valor: number;
  ipi_valor: number;
  pis_valor: number;
  cofins_valor: number;
  iss_valor: number;
  ibs_valor: number;
  cbs_valor: number;
}): number {
  return r2(n.icms_valor + n.icms_st_valor + n.ipi_valor + n.pis_valor + n.cofins_valor + n.iss_valor + n.ibs_valor + n.cbs_valor);
}

/** Carga tributária: impostos destacados ÷ valor da nota (em %). */
export const cargaPercentual = (impostos: number, total: number) => (total > 0 ? r2((impostos / total) * 100) : 0);
