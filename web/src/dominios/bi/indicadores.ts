// BI de Gestão: indicadores dos títulos do Omie (bi_indicadores, migração 097). Tipos e regras puras de exibição;
// testadas em indicadores.test.ts.

export interface Posicao {
  aberto?: number | null;
  vencido?: number | null;
  a30?: number | null;
  a60?: number | null;
  a90?: number | null;
  mais90?: number | null;
}
export interface ItemTop {
  doc: string | null;
  nome: string | null;
  valor: number;
}
export interface Liquidez {
  empresa: string;
  competencia: string;
  corrente: number | null;
  seca: number | null;
  imediata: number | null;
  geral: number | null;
}
export interface Indicadores {
  corte: string;
  pmr: number | null;
  pmp: number | null;
  receber: Posicao;
  pagar: Posicao;
  clientes_total: number;
  clientes: ItemTop[];
  fornecedores_total: number;
  fornecedores: ItemTop[];
  liquidez: Liquidez[];
}

const n = (v: number | null | undefined) => Number(v ?? 0);

/** Inadimplência: parte do a receber em aberto que já venceu (fração); null sem nada a receber. */
export function inadimplencia(i: Indicadores): number | null {
  return n(i.receber.aberto) > 0 ? n(i.receber.vencido) / n(i.receber.aberto) : null;
}

/** Cobertura de curto prazo (estimativa sem balanço): a receber em aberto ÷ a pagar em aberto. */
export function cobertura(i: Indicadores): number | null {
  return n(i.pagar.aberto) > 0 ? n(i.receber.aberto) / n(i.pagar.aberto) : null;
}

/** Ciclo financeiro simplificado (sem estoque): prazo de receber − prazo de pagar, em dias. */
export function cicloFinanceiro(i: Indicadores): number | null {
  return i.pmr === null || i.pmp === null ? null : Math.round((Number(i.pmr) - Number(i.pmp)) * 10) / 10;
}

/** Faixas de atraso na ordem da tela. */
export const FAIXAS: { chave: keyof Posicao; nome: string }[] = [
  { chave: "a30", nome: "1 a 30 dias" },
  { chave: "a60", nome: "31 a 60 dias" },
  { chave: "a90", nome: "61 a 90 dias" },
  { chave: "mais90", nome: "Mais de 90 dias" },
];

/** CNPJ (14) ou CPF (11) formatado; CPF é pessoa física (no Omie, muitas vezes sócio ou funcionário). */
export function fmtDoc(doc: string | null | undefined): { texto: string; pf: boolean } {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 14) return { texto: d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"), pf: false };
  if (d.length === 11) return { texto: d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"), pf: true };
  return { texto: d || "Sem documento", pf: false };
}

/** Nome para a tela: o nome do Omie ou o documento formatado (o Omie não manda o nome do fornecedor). */
export function nomeItem(i: ItemTop): string {
  if (i.nome && i.nome.trim()) return i.nome.trim();
  const f = fmtDoc(i.doc);
  return f.pf ? `${f.texto} (pessoa física)` : f.texto;
}

/** Participação no total (fração); null sem total. */
export const participacao = (valor: number, total: number) => (total ? valor / total : null);

/** Índice com 2 casas ("1,35") ou travessão. */
export function fmtIndice(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(Number(v))
    ? "—"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prazo em dias ("27,5 dias") ou travessão. */
export function fmtDias(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}
