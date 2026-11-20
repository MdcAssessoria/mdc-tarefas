// BI de Gestão: lançamentos complementares e orçamento — modelos de planilha e conversão para o banco
// (bi_complementar_importar e bi_orcamento_gravar). Regras puras; testadas em lancamentos.test.ts.

export interface LinhaRelatorio {
  relatorio: "dre" | "dfc";
  codigo: string;
  nome: string;
  natureza: string | null;
}

/** Colunas do modelo de lançamentos complementares (na ordem da planilha). */
export const COLUNAS_COMPLEMENTAR = ["CNPJ", "Competência", "Data do caixa", "Linha DRE", "Linha DFC", "Histórico", "Valor"] as const;
/** Colunas do modelo de orçamento. */
export const COLUNAS_ORCAMENTO = ["CNPJ", "Relatório", "Linha", "Mês", "Valor"] as const;

const so = (v: unknown) => String(v ?? "").trim();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Data da planilha (Date, número serial do Excel, "dd/mm/aaaa", "mm/aaaa" ou "aaaa-mm-dd") em "aaaa-mm-dd". */
export function lerData(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = so(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
  return null;
}

/** Valor da planilha ("1.234,56", "1234.56", número) em número; null em branco. */
export function lerValor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = so(v).replace(/[R$\s]/g, "");
  if (!s) return null;
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const x = Number(t);
  return Number.isFinite(x) ? x : NaN;
}

/** Acha a linha do relatório pelo código ("despesas_pessoal") ou pelo nome ("(−) Despesas com pessoal"). */
export function acharLinha(texto: string, linhas: LinhaRelatorio[], relatorio: "dre" | "dfc"): string | null {
  const t = semAcento(texto)
    .replace(/[()−-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  const doRel = linhas.filter((l) => l.relatorio === relatorio);
  const porCodigo = doRel.find((l) => l.codigo === t.replace(/ /g, "_"));
  if (porCodigo) return porCodigo.codigo;
  const porNome = doRel.find(
    (l) =>
      semAcento(l.nome)
        .replace(/[()−-]/g, " ")
        .replace(/\s+/g, " ")
        .trim() === t,
  );
  return porNome?.codigo ?? null;
}

/** Linhas da planilha → linhas para o banco, com erros por linha (nº da linha na planilha). */
function converter<T>(
  matriz: unknown[][],
  colunas: readonly string[],
  ler: (c: (nome: string) => unknown) => T | string,
): { linhas: T[]; erros: string[] } {
  const [cab, ...dados] = matriz;
  const idx = new Map((cab ?? []).map((c, i) => [semAcento(so(c)), i]));
  const faltam = colunas.filter((c) => !idx.has(semAcento(c)));
  if (faltam.length) return { linhas: [], erros: [`Faltam colunas no cabeçalho: ${faltam.join(", ")}. Use o modelo.`] };
  const linhas: T[] = [];
  const erros: string[] = [];
  dados.forEach((r, i) => {
    if (!r || r.every((v) => so(v) === "")) return;
    const res = ler((nome) => r[idx.get(semAcento(nome)) ?? -1]);
    if (typeof res === "string") erros.push(`Linha ${i + 2}: ${res}`);
    else linhas.push(res);
  });
  if (!linhas.length && !erros.length) erros.push("A planilha não tem linhas preenchidas.");
  return { linhas, erros };
}

export interface ComplementarBanco {
  cnpj: string;
  competencia: string;
  data_caixa: string | null;
  linha_dre: string | null;
  linha_dfc: string | null;
  historico: string;
  valor: number;
}

export function lerPlanilhaComplementares(matriz: unknown[][], linhas: LinhaRelatorio[]) {
  return converter<ComplementarBanco>(matriz, COLUNAS_COMPLEMENTAR, (c) => {
    const cnpj = so(c("CNPJ")).replace(/\D/g, "");
    if (cnpj.length !== 14) return "CNPJ inválido";
    const competencia = lerData(c("Competência"));
    if (!competencia) return "competência vazia ou inválida (use mm/aaaa)";
    const dre = so(c("Linha DRE"));
    const dfc = so(c("Linha DFC"));
    const linha_dre = dre ? acharLinha(dre, linhas, "dre") : null;
    const linha_dfc = dfc ? acharLinha(dfc, linhas, "dfc") : null;
    if (dre && !linha_dre) return `linha da DRE "${dre}" não existe`;
    if (dfc && !linha_dfc) return `linha do DFC "${dfc}" não existe`;
    if (!linha_dre && !linha_dfc) return "informe a linha da DRE e/ou do DFC";
    const data_caixa = lerData(c("Data do caixa"));
    if (linha_dfc && !data_caixa) return "lançamento no DFC precisa da data do caixa";
    const valor = lerValor(c("Valor"));
    if (valor === null || Number.isNaN(valor) || valor === 0) return "valor vazio, zero ou inválido";
    const historico = so(c("Histórico"));
    if (!historico) return "histórico vazio";
    return { cnpj, competencia, data_caixa, linha_dre, linha_dfc, historico, valor };
  });
}

export interface OrcamentoBanco {
  cnpj: string;
  relatorio: "dre" | "dfc";
  linha: string;
  competencia: string;
  valor: number | null;
}

export function lerPlanilhaOrcamento(matriz: unknown[][], linhas: LinhaRelatorio[]) {
  return converter<OrcamentoBanco>(matriz, COLUNAS_ORCAMENTO, (c) => {
    const cnpj = so(c("CNPJ")).replace(/\D/g, "");
    if (cnpj.length !== 14) return "CNPJ inválido";
    const rel = semAcento(so(c("Relatório")));
    const relatorio = rel === "dre" ? "dre" : rel === "dfc" ? "dfc" : null;
    if (!relatorio) return "relatório deve ser DRE ou DFC";
    const nomeLinha = so(c("Linha"));
    const linha = acharLinha(nomeLinha, linhas, relatorio);
    if (!linha) return `linha "${nomeLinha}" não existe no ${relatorio.toUpperCase()}`;
    const competencia = lerData(c("Mês"));
    if (!competencia) return "mês vazio ou inválido (use mm/aaaa)";
    const valor = lerValor(c("Valor"));
    if (Number.isNaN(valor)) return "valor inválido";
    return { cnpj, relatorio, linha, competencia: `${competencia.slice(0, 7)}-01`, valor: valor === null ? null : Math.abs(valor) };
  });
}

/** Meses "aaaa-mm-01" de um ano. */
export const mesesDoAno = (ano: number) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}-01`);
