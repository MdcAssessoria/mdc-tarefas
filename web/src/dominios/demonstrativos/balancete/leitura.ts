// Leitura do balancete exportado pelo Domínio (Excel já convertido em matriz de células): cabeçalho, contas,
// valores com D/C e a normalização do sinal.
// Convenção dos saldos: devedor = positivo, credor = negativo.
import { semAcento } from "@/lib/texto";
import type { Cabecalho, Linha } from "./tipos";

/** Descrição de conta normalizada para as regras: sem acento, maiúscula, "(-)" vira "(MENOS)" e traços viram espaço. */
export const sem = (s: unknown) =>
  semAcento(s)
    .toUpperCase()
    .replace(/\(\s*-\s*\)/g, "(MENOS)")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "1.234,56D", "(1.234,56)", "-1234.56", "1.234,56 C" → número com sinal (D positivo, C negativo). */
export function lerValor(v: unknown): { valor: number; natureza: "D" | "C" | null } {
  if (typeof v === "number") return { valor: v, natureza: null };
  let s = String(v ?? "").trim();
  if (!s) return { valor: 0, natureza: null };
  let nat: "D" | "C" | null = null;
  const m = s.match(/\s*([DC])\s*$/i);
  if (m) {
    nat = m[1].toUpperCase() as "D" | "C";
    s = s.slice(0, m.index).trim();
  }
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  s = s.replace(/[R$\s]/g, "");
  const ultV = s.lastIndexOf(","),
    ultP = s.lastIndexOf(".");
  if (ultV >= 0 && ultP >= 0) s = ultV > ultP ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (ultV >= 0) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return { valor: 0, natureza: nat };
  const abs = neg ? -n : n;
  return { valor: nat === "C" ? -Math.abs(abs) : nat === "D" ? Math.abs(abs) : abs, natureza: nat };
}

function data(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const COLS: Record<string, RegExp> = {
  codigo: /^(COD|CODIGO|CONTA|REDUZIDO|COD\.? ?REDUZIDO|CODIGO REDUZIDO)$/,
  classificacao: /CLASSIFICA/,
  descricao: /^(DESCRICAO|DESCRICAO DA CONTA|NOME DA CONTA|CONTA CONTABIL|NOME|HISTORICO)/,
  saldo_anterior: /SALDO ANTERIOR|SALDO INICIAL/,
  debitos: /^DEBITOS?$|^DEBITO NO PERIODO|^MOVIMENTO DEBITO/,
  creditos: /^CREDITOS?$|^CREDITO NO PERIODO|^MOVIMENTO CREDITO/,
  saldo_atual: /SALDO ATUAL|SALDO FINAL/,
};

export interface Leitura {
  cabecalho: Cabecalho;
  linhas: Linha[];
  avisos: string[];
}

/** Recebe a planilha como matriz de células (primeira aba) e devolve as contas. */
export function lerBalancete(matriz: unknown[][]): Leitura {
  const avisos: string[] = [];
  const cab: Cabecalho = { empresa: null, cnpj: null, codigoEmpresa: null, inicio: null, fim: null };

  // cabeçalho do relatório (primeiras 15 linhas)
  for (const lin of matriz.slice(0, 15)) {
    const txt = lin
      .map((c) => String(c ?? ""))
      .join(" ")
      .replace(/\s+/g, " ");
    const t = sem(txt);
    const cnpj = txt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (cnpj && !cab.cnpj) cab.cnpj = cnpj[0];
    const per = txt.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|à|-|até|ate)\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (per && !cab.inicio) {
      cab.inicio = data(per[1]);
      cab.fim = data(per[2]);
    }
    const emp = txt.match(/Empresa\s*:?\s*(?:(\d+)\s*[-–]\s*)?(.+?)(?:\s{2,}|C\.?N\.?P\.?J|CNPJ|Folha|P[aá]gina|$)/i);
    if (emp && !cab.empresa && /EMPRESA/.test(t)) {
      cab.codigoEmpresa = emp[1] ?? null;
      cab.empresa = emp[2].trim() || null;
    }
  }
  if (!cab.empresa) {
    const primeira = matriz.find((l) => l.some((c) => String(c ?? "").trim().length > 3));
    if (primeira) cab.empresa = String(primeira.find((c) => String(c ?? "").trim()) ?? "").trim() || null;
  }

  // linha de títulos das colunas
  let hdr = -1;
  let mapa: Record<string, number> = {};
  for (let i = 0; i < Math.min(matriz.length, 40); i++) {
    const m: Record<string, number> = {};
    matriz[i].forEach((c, j) => {
      const t = sem(c);
      for (const [k, re] of Object.entries(COLS)) if (m[k] === undefined && re.test(t)) m[k] = j;
    });
    if ((m.classificacao !== undefined || m.codigo !== undefined) && m.saldo_atual !== undefined) {
      hdr = i;
      mapa = m;
      break;
    }
  }
  if (hdr < 0)
    throw new Error(
      "Não encontrei os títulos das colunas (Classificação, Descrição, Saldo atual). Exporte o Balancete do Domínio em Excel.",
    );
  if (mapa.descricao === undefined) {
    // Domínio às vezes deixa a descrição sem título, ao lado da classificação
    const base = mapa.classificacao ?? mapa.codigo;
    mapa.descricao = base + 1;
    avisos.push("Coluna de descrição sem título: usei a coluna ao lado da classificação.");
  }

  const linhas: Linha[] = [];
  let temNatureza = false;
  const valor = (lin: unknown[], k: string) => {
    if (mapa[k] === undefined) return 0;
    // o Domínio às vezes põe a natureza (D/C) na célula seguinte
    const v = lin[mapa[k]];
    const prox = String(lin[mapa[k] + 1] ?? "")
      .trim()
      .toUpperCase();
    const r = lerValor(prox === "D" || prox === "C" ? `${v}${prox}` : v);
    if (r.natureza) temNatureza = true;
    return r.valor;
  };

  for (let i = hdr + 1; i < matriz.length; i++) {
    const lin = matriz[i];
    const clas = String(lin[mapa.classificacao ?? -1] ?? "").trim();
    const cod = mapa.codigo !== undefined ? String(lin[mapa.codigo] ?? "").trim() : "";
    const desc = String(lin[mapa.descricao] ?? "").trim();
    const chave = clas || cod;
    if (!chave || !/^\d[\d.\-]*$/.test(chave)) continue; // títulos, totais, rodapés
    if (!desc) continue;
    linhas.push({
      codigo: cod && cod !== clas ? cod : null,
      classificacao: chave.replace(/-/g, "."),
      descricao: desc,
      nivel: chave.replace(/-/g, ".").split(".").filter(Boolean).length,
      analitica: true,
      saldo_anterior: valor(lin, "saldo_anterior"),
      debitos: Math.abs(valor(lin, "debitos")),
      creditos: Math.abs(valor(lin, "creditos")),
      saldo_atual: valor(lin, "saldo_atual"),
      grupo: null,
    });
  }
  if (!linhas.length) throw new Error("Nenhuma conta encontrada no arquivo.");

  // sintética = tem filha
  const classes = linhas.map((l) => l.classificacao);
  for (const l of linhas) l.analitica = !classes.some((c) => c !== l.classificacao && c.startsWith(l.classificacao + "."));

  // sem D/C no arquivo: saldos vêm pela natureza da conta → passivo, PL e receitas viram credores
  if (!temNatureza && normalizarSinal(linhas))
    avisos.push(
      "Saldos sem D/C: considerei a natureza normal de cada conta (ativo e despesas devedores; passivo, PL e receitas credores).",
    );

  return { cabecalho: cab, linhas, avisos };
}

/**
 * Garante a convenção devedor +, credor −. O Excel do Domínio já grava assim (e só formata positivo):
 * a soma das contas de 1º nível fecha em zero e nada muda. Se os saldos vierem todos positivos
 * (relatório sem D/C), passivo, PL e receitas são invertidos. Devolve true quando inverteu.
 */
export function normalizarSinal(linhas: Linha[]): boolean {
  const topo = linhas.filter((l) => l.nivel === 1);
  const somaTopo = topo.reduce((a, l) => a + l.saldo_atual, 0);
  const maiorTopo = Math.max(1, ...topo.map((l) => Math.abs(l.saldo_atual)));
  const temCredorNegativo = topo.some((l) => /PASSIVO/.test(sem(l.descricao)) && l.saldo_atual < 0);
  if (temCredorNegativo || Math.abs(somaTopo) <= maiorTopo * 0.005) return false;
  const credoras = new Set<string>();
  for (const l of linhas) {
    const d = sem(l.descricao);
    if (l.nivel === 1 && /PASSIVO|RECEITA/.test(d)) credoras.add(l.classificacao);
    if (l.nivel <= 2 && /PATRIMONIO LIQUIDO|RECEITA/.test(d)) credoras.add(l.classificacao);
  }
  if (!credoras.size) return false;
  for (const l of linhas) {
    if ([...credoras].some((c) => l.classificacao === c || l.classificacao.startsWith(c + "."))) {
      l.saldo_anterior = -l.saldo_anterior;
      l.saldo_atual = -l.saldo_atual;
    }
  }
  return true;
}
