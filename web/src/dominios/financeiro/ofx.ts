// Leitura do extrato bancário em OFX (formato que todos os bancos exportam: SGML 1.x ou XML 2.x).
// Só regras puras: devolve conta, período e os lançamentos com o identificador do banco (FITID), que é o que
// impede importar o mesmo lançamento duas vezes.

export interface LancamentoExtrato {
  data: string; // YYYY-MM-DD
  valor: number; // positivo = entrou, negativo = saiu
  descricao: string;
  documento: string | null;
  fitid: string | null; // identificador do lançamento no banco (OFX)
}

export interface ExtratoLido {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  inicio: string | null;
  fim: string | null;
  saldoFinal: number | null;
  lancamentos: LancamentoExtrato[];
  avisos: string[];
}

/** Valor de uma tag OFX: aceita <TAG>valor (SGML, sem fechar) e <TAG>valor</TAG> (XML). */
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>\\s*([^<\\r\\n]*)`, "i"));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/** 20260131120000[-3:BRT] → 2026-01-31 */
function dataOfx(v: string | null): string | null {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "-1.234,56", "1234.56", "-150,00" → número */
export function valorOfx(v: string | null): number | null {
  if (!v) return null;
  let s = v.replace(/\s/g, "");
  if (s.includes(",") && s.includes("."))
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function lerOfx(texto: string): ExtratoLido {
  const avisos: string[] = [];
  if (!/<OFX>/i.test(texto)) throw new Error("O arquivo não é um extrato OFX (não encontrei a marca <OFX>).");
  const corpo = texto.slice(texto.search(/<OFX>/i));
  const lancamentos: LancamentoExtrato[] = [];
  const blocos = corpo.split(/<STMTTRN>/i).slice(1);
  for (const b of blocos) {
    const bloco = b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0];
    const data = dataOfx(tag(bloco, "DTPOSTED"));
    const valor = valorOfx(tag(bloco, "TRNAMT"));
    if (!data || valor === null) {
      avisos.push("Um lançamento sem data ou valor foi ignorado.");
      continue;
    }
    const nome = tag(bloco, "NAME");
    const memo = tag(bloco, "MEMO");
    const descricao = [nome, memo && memo !== nome ? memo : null].filter(Boolean).join(" · ") || "(sem descrição)";
    lancamentos.push({
      data,
      valor: Math.round(valor * 100) / 100,
      descricao,
      documento: tag(bloco, "CHECKNUM") ?? tag(bloco, "REFNUM"),
      fitid: tag(bloco, "FITID"),
    });
  }
  if (!lancamentos.length) avisos.push("O extrato não tem lançamentos no período.");
  const saldo = corpo.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i)?.[1] ?? "";
  return {
    banco: tag(corpo, "BANKID"),
    agencia: tag(corpo, "BRANCHID"),
    conta: tag(corpo, "ACCTID"),
    inicio: dataOfx(tag(corpo, "DTSTART")),
    fim: dataOfx(tag(corpo, "DTEND")),
    saldoFinal: valorOfx(tag(saldo, "BALAMT")),
    lancamentos,
    avisos,
  };
}

/**
 * Chave que identifica um lançamento na conta para não importar duas vezes: o FITID do banco quando existe;
 * senão data + valor + descrição + documento (e a ordem, para dois lançamentos iguais no mesmo dia).
 */
export function chaveLancamento(l: LancamentoExtrato, repeticao = 0): string {
  if (l.fitid) return `fitid:${l.fitid}`;
  return `${l.data}|${l.valor.toFixed(2)}|${l.descricao.trim().toUpperCase()}|${l.documento ?? ""}|${repeticao}`;
}

/** Chaves de todos os lançamentos do arquivo; iguais dentro do mesmo arquivo ganham número de repetição. */
export function chavesDoArquivo(lancamentos: LancamentoExtrato[]): string[] {
  const vistos = new Map<string, number>();
  return lancamentos.map((l) => {
    const base = chaveLancamento(l);
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return l.fitid ? base : chaveLancamento(l, n);
  });
}
