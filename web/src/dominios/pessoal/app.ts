// MDC · Pessoal no celular (desenho de 14/11/2026): regras puras das telas novas — agrupar as contas por quando
// vencem, resumo do mês (sobra prevista e quanto já foi pago), o teclado de valor e o ícone de cada tipo de gasto.
// As telas só mostram; quem grava é o banco (fin_lancar e fin_baixar, as mesmas funções do Financeiro do HUB).
import { somarDias } from "@/lib/datas";
import type { NomeIcone } from "@/components/ui/Icone";

export interface ContaApp {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  vencimento: string;
  valor: number;
  valor_pago: number;
  situacao: string;
  quitado_em: string | null;
  parcela: number | null;
  parcelas: number | null;
  categoria: string | null;
}

export type Quando = "atrasada" | "hoje" | "semana" | "depois";

export const falta = (c: Pick<ContaApp, "valor" | "valor_pago">) => Math.max(0, Math.round((c.valor - c.valor_pago) * 100) / 100);
export const quitada = (c: ContaApp) => c.situacao === "quitado" || falta(c) === 0;

export function quando(vencimento: string, hoje: string): Quando {
  if (vencimento < hoje) return "atrasada";
  if (vencimento === hoje) return "hoje";
  if (vencimento <= somarDias(hoje, 7)) return "semana";
  return "depois";
}

export const TITULO_QUANDO: Record<Quando, string> = {
  atrasada: "Atrasadas",
  hoje: "Hoje",
  semana: "Próximos 7 dias",
  depois: "Mais para frente",
};

export interface GrupoContas {
  quando: Quando;
  titulo: string;
  total: number;
  contas: ContaApp[];
}

/** Contas em aberto de um tipo, em grupos na ordem Atrasadas → Hoje → 7 dias → depois (grupo vazio some). */
export function agruparAbertas(contas: ContaApp[], tipo: "pagar" | "receber", hoje: string): GrupoContas[] {
  const abertas = contas
    .filter((c) => c.tipo === tipo && c.situacao !== "cancelado" && !quitada(c))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor);
  return (["atrasada", "hoje", "semana", "depois"] as Quando[])
    .map((q) => {
      const doGrupo = abertas.filter((c) => quando(c.vencimento, hoje) === q);
      return { quando: q, titulo: TITULO_QUANDO[q], total: soma(doGrupo.map(falta)), contas: doGrupo };
    })
    .filter((g) => g.contas.length);
}

const soma = (v: number[]) => Math.round(v.reduce((t, x) => t + x, 0) * 100) / 100;

/** Primeiro e último dia do mês de uma data AAAA-MM-DD. */
export function limitesDoMes(dia: string): { de: string; ate: string } {
  const [a, m] = dia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { de: `${a}-${mm}-01`, ate: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

export interface ResumoMes {
  /** O que entra no mês (recebido + a receber) menos o que sai (pago + a pagar). */
  sobra: number;
  totalPagar: number;
  pago: number;
  /** 0 a 100: quanto das contas do mês já foi pago. */
  percentualPago: number;
}

/** Resumo das contas que vencem no mês de `hoje` (as canceladas ficam fora). */
export function resumoDoMes(contas: ContaApp[], hoje: string): ResumoMes {
  const { de, ate } = limitesDoMes(hoje);
  const doMes = contas.filter((c) => c.situacao !== "cancelado" && c.vencimento >= de && c.vencimento <= ate);
  const pagar = doMes.filter((c) => c.tipo === "pagar");
  const receber = doMes.filter((c) => c.tipo === "receber");
  const totalPagar = soma(pagar.map((c) => c.valor));
  const pago = soma(pagar.map((c) => c.valor_pago));
  const sobra = soma([soma(receber.map((c) => c.valor)), -totalPagar]);
  return { sobra, totalPagar, pago, percentualPago: totalPagar ? Math.min(100, Math.round((pago / totalPagar) * 100)) : 0 };
}

/** Teclado de valor: os dígitos são centavos ("18640" = R$ 186,40). Sem zeros à esquerda e no máximo 9 dígitos. */
export function teclar(digitos: string, tecla: string): string {
  if (tecla === "apagar") return digitos.slice(0, -1);
  if (!/^\d+$/.test(tecla)) return digitos;
  return (digitos + tecla).replace(/^0+/, "").slice(0, 9);
}

export const valorDosDigitos = (digitos: string) => Number(digitos || "0") / 100;

/** Ícone pelo nome do tipo de gasto ou de entrada (o plano padrão da família e os que ela criar). */
export function iconeDaCategoria(nome: string | null | undefined, tipo: "pagar" | "receber" = "pagar"): NomeIcone {
  const n = (nome ?? "").toLowerCase();
  const regras: [RegExp, NomeIcone][] = [
    [/mercado|supermercado|feira|aliment/, "carrinho"],
    [/restaurante|delivery|lanche/, "sacola"],
    [/aluguel|financiamento|moradia|iptu|casa/, "casa"],
    [/condom/, "casa"],
    [/energia|luz/, "raio"],
    [/água|agua|gás|gas/, "gota"],
    [/internet|telefone|celular/, "wifi"],
    [/escola|faculdade|curso|educa/, "escola"],
    [/combust|veículo|veiculo|ipva|carro|transporte|seguro/, "carro"],
    [/saúde|saude|médic|medic|remédio|remedio|exame|consulta|plano de saúde/, "coracao"],
    [/lazer|viage/, "aviao"],
    [/vestu|roupa|pessoais|cuidados/, "sacola"],
    [/assinatura|aplicativo/, "celular"],
    [/imposto|taxa|irpf/, "documento"],
    [/tarifa|juro|banc|financeir/, "banco"],
    [/salário|salario|pró-labore|pro-labore|lucro/, "carteira"],
    [/investiment|rendiment/, "tendencia"],
  ];
  for (const [r, i] of regras) if (r.test(n)) return i;
  return tipo === "receber" ? "seta-entrada" : "etiqueta";
}

/** "Venceu há 5 dias" / "Vence hoje" / "Vence amanhã" / "Vence em 18/11". */
export function textoVencimento(c: Pick<ContaApp, "vencimento" | "tipo">, hoje: string): string {
  const dias = Math.round((Date.parse(hoje) - Date.parse(c.vencimento)) / 86_400_000);
  const verbo = c.tipo === "receber" ? "Entra" : "Vence";
  if (dias > 0) return dias === 1 ? `${c.tipo === "receber" ? "Era para entrar" : "Venceu"} ontem` : `${c.tipo === "receber" ? "Atrasado" : "Atrasada"} há ${dias} dias`;
  if (dias === 0) return `${verbo} hoje`;
  if (dias === -1) return `${verbo} amanhã`;
  const [, m, d] = c.vencimento.split("-");
  return `${verbo} em ${d}/${m}`;
}
