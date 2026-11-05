// Contas do painel "Receita por sistema" (059): totais das linhas, participação de cada sistema na receita mensal e
// o texto curto do mês. O banco entrega os números por sistema; aqui só se soma e se formata para a tela e o PDF.
import type { LinhaReceitaSistema } from "./tipos";

export interface TotaisSistemas {
  contratos: number;
  clientes: number;
  mensal: number;
  faturado: number;
  recebido: number;
  atraso: number;
  previsto: number;
  novos: number;
  encerrados: number;
  porMes: number[];
}

/** Soma as linhas do painel. Clientes somam por sistema (o mesmo cliente com dois sistemas conta duas vezes). */
export function totaisSistemas(linhas: LinhaReceitaSistema[]): TotaisSistemas {
  const n = Math.max(0, ...linhas.map((l) => l.por_mes.length));
  const t: TotaisSistemas = {
    contratos: 0,
    clientes: 0,
    mensal: 0,
    faturado: 0,
    recebido: 0,
    atraso: 0,
    previsto: 0,
    novos: 0,
    encerrados: 0,
    porMes: Array.from({ length: n }, () => 0),
  };
  for (const l of linhas) {
    t.contratos += l.contratos;
    t.clientes += l.clientes;
    t.mensal += l.mensal;
    t.faturado += l.faturado;
    t.recebido += l.recebido;
    t.atraso += l.atraso;
    t.previsto += l.previsto;
    t.novos += l.novos;
    t.encerrados += l.encerrados;
    l.por_mes.forEach((v, i) => (t.porMes[i] += v));
  }
  for (const k of ["mensal", "faturado", "recebido", "atraso", "previsto"] as const) t[k] = Math.round(t[k] * 100) / 100;
  t.porMes = t.porMes.map((v) => Math.round(v * 100) / 100);
  return t;
}

/** Quanto da receita mensal contratada vem deste sistema (0 a 100, uma casa). Sem receita: 0. */
export function participacao(mensal: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.round((mensal / total) * 1000) / 10;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2029-06-01" → "jun/29" (cabeçalho das colunas dos 12 meses). */
export function mesCurto(iso: string): string {
  const [a, m] = iso.split("-");
  return `${MESES[Number(m) - 1] ?? m}/${(a ?? "").slice(2)}`;
}
