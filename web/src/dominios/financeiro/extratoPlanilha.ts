// Leitura de extrato bancário em Excel ou CSV (quando o banco não dá OFX): acha a linha de cabeçalho com
// Data + Valor (ou Débito/Crédito) e a descrição, e devolve os lançamentos no mesmo formato do OFX.
import { semAcento } from "@/lib/texto";
import type { ExtratoLido, LancamentoExtrato } from "./ofx";

const norm = (v: unknown) =>
  semAcento(String(v ?? ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const COL = {
  data: /^(DATA|DT|DATA LANC|DATA DO LANCAMENTO|DATA MOVIMENTO|DATA MOV)/,
  descricao: /(HISTORICO|DESCRICAO|LANCAMENTO|DETALHE|MOVIMENTACAO)/,
  documento: /(DOCUMENTO|DOC|N DOC|NUM DOC|NUMERO)/,
  natureza:
    /^(D ?\/ ?C|C ?\/ ?D|DC|CD|TIPO|TIPO (DE )?(LANC|LANCAMENTO|MOVIMENTO|OPERACAO)|NATUREZA|DEB ?\/ ?CRED|CRED ?\/ ?DEB|DEBITO ?\/ ?CREDITO|CREDITO ?\/ ?DEBITO|ENTRADA ?\/ ?SAIDA|SAIDA ?\/ ?ENTRADA|E ?\/ ?S|SINAL)$/,
  valor: /^(VALOR|VALOR \(R\$\)|VALOR R\$|QUANTIA)$/,
  debito: /(DEBITO|SAIDA)/,
  credito: /(CREDITO|ENTRADA)/,
};

/** "1.234,56", "-150,00", "150,00 D", "(80,00)", número do Excel → número com sinal (D/saída negativo). */
export function valorBr(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let sinal = 1;
  const nat = s.match(/\s*([DC])\s*$/i);
  if (nat) {
    if (nat[1].toUpperCase() === "D") sinal = -1;
    s = s.slice(0, nat.index).trim();
  }
  if (/^\(.*\)$/.test(s)) {
    sinal = -sinal;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    sinal = -sinal;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    sinal = -sinal;
    s = s.slice(0, -1);
  }
  s = s.replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && s !== "" ? Math.round(sinal * n * 100) / 100 : null;
}

/** 31/01/2026, 31/01/26, 2026-01-31 ou número de data do Excel → YYYY-MM-DD */
export function dataBr(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function lerExtratoPlanilha(matriz: unknown[][]): ExtratoLido {
  const avisos: string[] = [];
  let cab = -1;
  let idx: Partial<Record<keyof typeof COL, number>> = {};
  for (let i = 0; i < Math.min(matriz.length, 40); i++) {
    const cels = matriz[i].map(norm);
    const achar = (re: RegExp) => cels.findIndex((c) => re.test(c));
    const d = achar(COL.data);
    const v = achar(COL.valor),
      deb = achar(COL.debito),
      cred = achar(COL.credito);
    if (d >= 0 && (v >= 0 || (deb >= 0 && cred >= 0))) {
      cab = i;
      idx = { data: d, valor: v >= 0 ? v : undefined, debito: deb >= 0 ? deb : undefined, credito: cred >= 0 ? cred : undefined };
      // descrição: nunca a coluna da data ("Data Lançamento"); prefere Histórico/Descrição a "Lançamento"
      const desc =
        [/HISTORICO/, /DESCRICAO/, /DETALHE/, /MOVIMENTACAO/, COL.descricao]
          .map((re) => cels.findIndex((c, k) => k !== d && k !== v && re.test(c)))
          .find((k) => k >= 0) ?? -1;
      if (desc >= 0) idx.descricao = desc;
      const doc = cels.findIndex((c, k) => k !== desc && COL.documento.test(c));
      if (doc >= 0) idx.documento = doc;
      const nat = cels.findIndex((c, k) => k !== d && k !== desc && k !== v && COL.natureza.test(c));
      if (nat >= 0) idx.natureza = nat;
      break;
    }
  }
  if (cab < 0) throw new Error("Não encontrei as colunas de Data e Valor (ou Débito e Crédito) no extrato.");

  const lancamentos: LancamentoExtrato[] = [];
  for (const lin of matriz.slice(cab + 1)) {
    const data = dataBr(lin[idx.data!]);
    if (!data) continue;
    const descricao = String(lin[idx.descricao ?? -1] ?? "").trim() || "(sem descrição)";
    if (/^SALDO\b/.test(norm(descricao))) continue; // linhas de saldo do banco não são lançamentos
    let valor: number | null;
    if (idx.valor !== undefined) {
      valor = valorBr(lin[idx.valor]);
      // valor sem sinal com a natureza em outra coluna ("D"/"C", "Débito"/"Crédito", "Saída"/"Entrada")
      if (valor !== null && idx.natureza !== undefined) {
        const n = norm(lin[idx.natureza]);
        if (/^(D|DB|DEB|DEBITO|S|SAIDA|PAGAMENTO|-)$/.test(n)) valor = -Math.abs(valor);
        else if (/^(C|CR|CRED|CREDITO|E|ENTRADA|RECEBIMENTO|\+)$/.test(n)) valor = Math.abs(valor);
      }
    } else {
      const c = valorBr(lin[idx.credito!]) ?? 0,
        d = valorBr(lin[idx.debito!]) ?? 0;
      valor = Math.round((Math.abs(c) - Math.abs(d)) * 100) / 100;
    }
    if (valor === null || valor === 0) continue;
    const doc = idx.documento !== undefined ? String(lin[idx.documento] ?? "").trim() : "";
    lancamentos.push({ data, valor, descricao, documento: doc || null, fitid: null });
  }
  if (!lancamentos.length) avisos.push("Não encontrei lançamentos com data e valor abaixo do cabeçalho.");
  else if (lancamentos.length >= 3 && lancamentos.every((l) => l.valor > 0))
    avisos.push(
      "Atenção: todos os lançamentos vieram como entrada (nenhuma saída). Se a planilha marca as saídas em outra coluna, confira antes de gravar.",
    );
  const datas = lancamentos.map((l) => l.data).sort();
  return {
    banco: null,
    agencia: null,
    conta: null,
    inicio: datas[0] ?? null,
    fim: datas.at(-1) ?? null,
    saldoFinal: null,
    lancamentos,
    avisos,
  };
}
