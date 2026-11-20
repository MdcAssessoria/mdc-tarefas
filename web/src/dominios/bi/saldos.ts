// BI de Gestão: saldos dos bancos do Omie (bi_saldos, migração 105) ao lado do fluxo de caixa. Saldo inicial = saldo
// anterior do primeiro mês; saldo final = saldo do fim do último mês; a diferença para a variação do DFC mostra o que
// passou pelo banco sem conta a pagar/receber (tarifas lançadas direto, transferências entre empresas tiradas do grupo).
// Testado em saldos.test.ts.

export interface SaldoBanco {
  empresa: string;
  conta_corrente: string;
  descricao: string | null;
  mes: string;
  saldo_anterior: number;
  saldo_final: number;
  atualizado_em: string;
}

export interface SaldoConta {
  empresa: string;
  conta: string;
  inicial: number;
  final: number;
  /** Faltam meses desta conta no período (a sincronização ainda está trazendo). */
  incompleta: boolean;
}

export interface ResumoSaldos {
  contas: SaldoConta[];
  inicial: number;
  final: number;
  variacaoBanco: number;
  /** variação dos bancos − variação do DFC (null sem o DFC). */
  diferenca: number | null;
  incompleto: boolean;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Resume os saldos do período (meses "AAAA-MM" pedidos) e compara com a variação do caixa do DFC. */
export function resumirSaldos(linhas: SaldoBanco[], meses: string[], variacaoDfc: number | null): ResumoSaldos | null {
  if (!linhas.length || !meses.length) return null;
  const porConta = new Map<string, SaldoBanco[]>();
  for (const l of linhas) {
    const k = `${l.empresa}|${l.conta_corrente}`;
    porConta.set(k, [...(porConta.get(k) ?? []), l]);
  }
  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];
  const contas: SaldoConta[] = [...porConta.values()].map((ls) => {
    const ord = [...ls].sort((a, b) => a.mes.localeCompare(b.mes));
    const tem = new Set(ord.map((l) => l.mes.slice(0, 7)));
    const ini = ord.find((l) => l.mes.slice(0, 7) === primeiro);
    const fim = ord.find((l) => l.mes.slice(0, 7) === ultimo);
    return {
      empresa: ord[0].empresa,
      conta: ord[0].descricao ?? ord[0].conta_corrente,
      inicial: Number(ini?.saldo_anterior ?? ord[0].saldo_anterior),
      final: Number(fim?.saldo_final ?? ord[ord.length - 1].saldo_final),
      incompleta: meses.some((m) => !tem.has(m)),
    };
  });
  contas.sort((a, b) => a.empresa.localeCompare(b.empresa) || a.conta.localeCompare(b.conta));
  const inicial = centavos(contas.reduce((a, c) => a + c.inicial, 0));
  const final = centavos(contas.reduce((a, c) => a + c.final, 0));
  const variacaoBanco = centavos(final - inicial);
  return {
    contas,
    inicial,
    final,
    variacaoBanco,
    diferenca: variacaoDfc === null ? null : centavos(variacaoBanco - variacaoDfc),
    incompleto: contas.some((c) => c.incompleta),
  };
}

/** Meses "AAAA-MM" de um período (datas "AAAA-MM-DD"), em ordem. */
export function mesesDoPeriodo(de: string, ate: string): string[] {
  const r: string[] = [];
  let [a, m] = de.slice(0, 7).split("-").map(Number);
  const fim = ate.slice(0, 7);
  for (let k = `${a}-${String(m).padStart(2, "0")}`; k <= fim; k = `${a}-${String(m).padStart(2, "0")}`) {
    r.push(k);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return r;
}
