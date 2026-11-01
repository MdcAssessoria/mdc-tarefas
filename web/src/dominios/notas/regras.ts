// Regras puras das notas de entrada: prazos e situação da manifestação em linguagem simples, e quando a captura pode
// consultar a SEFAZ/ADN de novo. Testadas em notas.test.ts; usadas na tela e na Função Edge fiscal-captura.
import type { CodigoManifestacao } from "./sefaz";

// ------------------------------------------------------------------------------------------------ prazos

/**
 * Prazos da manifestação do destinatário, em dias contados da autorização da NF-e, com vigência (vale a linha mais
 * recente cujo início é anterior ou igual à data de autorização).
 * - Ajuste SINIEF 44/20 + NT 2020.001 v1.10: ciência 10 dias; conclusivas 180 dias (desde 01/06/2022).
 * - Ajuste SINIEF 14/26 + NT 2020.001 v1.60: conclusivas 90 dias (produção desde 01/06/2026).
 */
export const PRAZOS_MANIFESTACAO = [
  { desde: "2022-06-01", ciencia: 10, conclusiva: 180, fonte: "Ajuste SINIEF 44/20; NT 2020.001 v1.10" },
  { desde: "2026-06-01", ciencia: 10, conclusiva: 90, fonte: "Ajuste SINIEF 14/26; NT 2020.001 v1.60" },
];

/** Dias antes do fim do prazo em que a nota aparece como "Prazo vencendo". */
export const AVISO_PRAZO_DIAS = 10;

const dia = (iso: string) => iso.slice(0, 10);
function somarDiasIso(iso: string, n: number): string {
  const d = new Date(`${dia(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${dia(ate)}T12:00:00Z`) - Date.parse(`${dia(de)}T12:00:00Z`)) / 864e5);

/** Último dia para a ciência e para a manifestação conclusiva (confirmar, desconhecer ou "não realizada"). */
export function prazosDaNota(autorizacao: string | null | undefined): { ciencia: string; conclusiva: string; fonte: string } | null {
  if (!autorizacao) return null;
  const d = dia(autorizacao);
  const regra = [...PRAZOS_MANIFESTACAO].reverse().find((p) => p.desde <= d) ?? PRAZOS_MANIFESTACAO[0];
  return { ciencia: somarDiasIso(d, regra.ciencia), conclusiva: somarDiasIso(d, regra.conclusiva), fonte: regra.fonte };
}

// ------------------------------------------------------------------------------------------------ situação na tela

export type SituacaoPainel = "aguardando" | "prazo_vencendo" | "confirmada" | "recusada" | "cancelada" | "prazo_encerrado" | "recebida";

export const SITUACOES_PAINEL: Record<SituacaoPainel, { nome: string; tom: string; dica: string }> = {
  aguardando: {
    nome: "Aguardando sua resposta",
    tom: "bg-amber-50 text-amber-900",
    dica: "Confirme se a compra aconteceu ou recuse. Só nota confirmada vira conta a pagar e entrada de estoque.",
  },
  prazo_vencendo: {
    nome: "Prazo vencendo",
    tom: "bg-red-50 text-red-800",
    dica: `Faltam ${AVISO_PRAZO_DIAS} dias ou menos para o prazo legal de resposta à SEFAZ.`,
  },
  confirmada: { nome: "Confirmada", tom: "bg-emerald-50 text-emerald-800", dica: "A empresa confirmou a compra na SEFAZ." },
  recusada: {
    nome: "Recusada",
    tom: "bg-neutral-100 text-neutral-700",
    dica: "A empresa informou à SEFAZ que não reconhece a nota ou que a operação não aconteceu.",
  },
  cancelada: { nome: "Cancelada pelo fornecedor", tom: "bg-neutral-100 text-neutral-500", dica: "O fornecedor cancelou esta nota." },
  prazo_encerrado: {
    nome: "Prazo encerrado",
    tom: "bg-neutral-100 text-neutral-700",
    dica: "Passou o prazo legal sem resposta; para a SEFAZ a operação conta como confirmada.",
  },
  recebida: { nome: "Recebida", tom: "bg-sky-50 text-sky-900", dica: "Nota de serviço ou documento sem manifestação na SEFAZ." },
};

export interface NotaParaSituacao {
  modelo: string;
  direcao: string;
  situacao: string;
  manifestacao: CodigoManifestacao | null;
  autorizacao: string | null;
  emissao: string | null;
}

/** Só NF-e modelo 55 recebida (entrada de terceiro) tem manifestação do destinatário. */
export const temManifestacao = (n: Pick<NotaParaSituacao, "modelo" | "direcao">) => n.modelo === "55" && n.direcao === "entrada";

/** Situação da nota em linguagem simples, com os dias que faltam para o prazo conclusivo. */
export function situacaoDaNota(
  n: NotaParaSituacao,
  hoje: string,
): { id: SituacaoPainel; diasRestantes: number | null; prazo: string | null } {
  if (n.situacao === "cancelada" || n.situacao === "denegada") return { id: "cancelada", diasRestantes: null, prazo: null };
  if (!temManifestacao(n)) return { id: "recebida", diasRestantes: null, prazo: null };
  if (n.manifestacao === "confirmada") return { id: "confirmada", diasRestantes: null, prazo: null };
  if (n.manifestacao === "desconhecida" || n.manifestacao === "nao_realizada") return { id: "recusada", diasRestantes: null, prazo: null };
  const p = prazosDaNota(n.autorizacao ?? n.emissao);
  if (!p) return { id: "aguardando", diasRestantes: null, prazo: null };
  const faltam = diasEntre(hoje, p.conclusiva);
  if (faltam < 0) return { id: "prazo_encerrado", diasRestantes: faltam, prazo: p.conclusiva };
  return { id: faltam <= AVISO_PRAZO_DIAS ? "prazo_vencendo" : "aguardando", diasRestantes: faltam, prazo: p.conclusiva };
}

/** Pode ser lançada agora: entrada completa, autorizada, não lançada; NF-e só depois de confirmada (mesma regra do banco). */
export const prontaParaLancar = (n: {
  direcao: string;
  processada: boolean;
  situacao: string;
  conteudo: string;
  modelo: string;
  manifestacao: CodigoManifestacao | null;
}) =>
  n.direcao === "entrada" &&
  !n.processada &&
  n.situacao === "autorizada" &&
  n.conteudo === "completa" &&
  (n.modelo !== "55" || n.manifestacao === "confirmada");

/**
 * Quais manifestações a pessoa pode pedir agora. A ciência só antes de qualquer manifestação e dentro de 10 dias;
 * as conclusivas dentro do prazo e, pela NT 2020.001 v1.50, no máximo dois eventos de cada tipo por nota.
 */
export function manifestacoesPermitidas(
  n: NotaParaSituacao & { eventos?: { tipo: CodigoManifestacao }[] },
  hoje: string,
): { tipo: CodigoManifestacao; motivo?: string }[] {
  if (!temManifestacao(n) || n.situacao !== "autorizada") return [];
  const p = prazosDaNota(n.autorizacao ?? n.emissao);
  const conta = (t: CodigoManifestacao) => (n.eventos ?? []).filter((e) => e.tipo === t).length;
  const saida: { tipo: CodigoManifestacao; motivo?: string }[] = [];
  const cienciaAberta = !n.manifestacao && (!p || hoje <= p.ciencia);
  if (cienciaAberta) saida.push({ tipo: "ciencia" });
  const dentro = !p || hoje <= p.conclusiva;
  for (const t of ["confirmada", "desconhecida", "nao_realizada"] as CodigoManifestacao[]) {
    if (!dentro) continue;
    if (n.manifestacao === t) continue;
    if (conta(t) >= 2) continue;
    saida.push({ tipo: t });
  }
  return saida;
}

/** Sequência do próximo evento do mesmo tipo (nSeqEvento): 1 na primeira vez, 2 na segunda. */
export const proximaSequencia = (eventos: { tipo: CodigoManifestacao }[], tipo: CodigoManifestacao) =>
  eventos.filter((e) => e.tipo === tipo).length + 1;

// ------------------------------------------------------------------------------------------------ captura

export const UMA_HORA_MS = 60 * 60 * 1000;
/** Espera depois de falha de rede ou da SEFAZ fora do ar (não é o bloqueio da NT, é só para não insistir). */
export const ESPERA_FALHA_MS = 15 * 60 * 1000;

export interface DecisaoCaptura {
  /** Pode pedir o próximo lote agora, na mesma rodada. */
  continuar: boolean;
  proximaConsulta: string;
  bloqueadoAte: string | null;
  erro: string | null;
}

/**
 * Regra da NT 2014.002 para a Distribuição DF-e:
 * - 138 (documentos localizados) e ultNSU < maxNSU: pode consultar de novo em seguida;
 * - 138 com ultNSU = maxNSU, ou 137 (nada novo): só depois de 1 hora;
 * - 656 (consumo indevido): bloqueio de 1 hora; não consultar antes.
 * - outros códigos: erro registrado e nova tentativa em 1 hora.
 */
export function decidirDistDFe(r: { cStat: string; xMotivo?: string; ultNSU: number; maxNSU: number }, agora: Date): DecisaoCaptura {
  const mais = (ms: number) => new Date(agora.getTime() + ms).toISOString();
  if (r.cStat === "138" && r.ultNSU < r.maxNSU)
    return { continuar: true, proximaConsulta: agora.toISOString(), bloqueadoAte: null, erro: null };
  if (r.cStat === "138" || r.cStat === "137")
    return { continuar: false, proximaConsulta: mais(UMA_HORA_MS), bloqueadoAte: null, erro: null };
  if (r.cStat === "656")
    return {
      continuar: false,
      proximaConsulta: mais(UMA_HORA_MS + 60_000),
      bloqueadoAte: mais(UMA_HORA_MS),
      erro: `SEFAZ bloqueou por 1 hora (656${r.xMotivo ? `: ${r.xMotivo}` : ""}).`,
    };
  return {
    continuar: false,
    proximaConsulta: mais(UMA_HORA_MS),
    bloqueadoAte: null,
    erro: `SEFAZ respondeu ${r.cStat}${r.xMotivo ? `: ${r.xMotivo}` : ""}`,
  };
}

/** ADN da NFS-e: lote cheio (50) continua; vazio ou incompleto espera 1 hora (o ADN não publica regra; seguimos a da NF-e). */
export function decidirAdn(r: { quantidade: number; status: string; erro?: string | null; limite?: number }, agora: Date): DecisaoCaptura {
  const mais = (ms: number) => new Date(agora.getTime() + ms).toISOString();
  if (r.erro) return { continuar: false, proximaConsulta: mais(UMA_HORA_MS), bloqueadoAte: null, erro: r.erro };
  if (r.quantidade >= (r.limite ?? 50)) return { continuar: true, proximaConsulta: agora.toISOString(), bloqueadoAte: null, erro: null };
  return { continuar: false, proximaConsulta: mais(UMA_HORA_MS), bloqueadoAte: null, erro: null };
}

/** A empresa pode ser consultada agora (passou a hora marcada e não está bloqueada)? */
export function podeConsultar(c: { proxima_consulta_em: string | null; bloqueado_ate: string | null }, agora: Date): boolean {
  const t = agora.getTime();
  if (c.bloqueado_ate && Date.parse(c.bloqueado_ate) > t) return false;
  return !c.proxima_consulta_em || Date.parse(c.proxima_consulta_em) <= t;
}

/** "daqui a 40 min", "às 15:20" — quando a próxima busca automática acontece, para a tela. */
export function quandoProximaBusca(iso: string | null, agora: Date): string {
  if (!iso) return "na próxima rodada (a cada 15 minutos)";
  const ms = Date.parse(iso) - agora.getTime();
  if (ms <= 0) return "na próxima rodada (a cada 15 minutos)";
  const min = Math.ceil(ms / 60_000);
  return min < 60 ? `daqui a ${min} min` : `daqui a ${Math.floor(min / 60)} h ${min % 60} min`;
}
