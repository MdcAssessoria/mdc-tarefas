// Regras puras da tela da NFS-e das faturas (046): situação da nota na lista em linguagem simples, quando dá para
// emitir, formatos dos códigos e os textos dos regimes. O banco decide (nfse_preparar, nfse_reservar); a tela só mostra.
import type { Tom } from "@/components/ui/Tons";
import type { AmbienteNfse, EmissaoNfse, Fatura, ModoNfse } from "./tipos";

export const NOMES_AMBIENTE: Record<AmbienteNfse, string> = {
  producao_restrita: "Ambiente de teste (sem valor fiscal)",
  producao: "Produção (nota com valor fiscal)",
};

export const EXPLICA_AMBIENTE: Record<AmbienteNfse, string> = {
  producao_restrita:
    "A nota sai na produção restrita do Emissor Nacional: serve só para conferir. Não vale como nota fiscal, não muda a fatura e não vai para o cliente.",
  producao: "A nota vale como documento fiscal. Depois de emitida, só se cancela no Emissor Nacional.",
};

export const MODOS_NFSE: { id: ModoNfse; titulo: string; detalhe: string }[] = [
  {
    id: "conferir",
    titulo: "Conferir antes de emitir",
    detalhe: 'A fatura fica "NFS-e pronta para emitir"; alguém confere os dados e clica em Emitir nota fiscal.',
  },
  {
    id: "automatico",
    titulo: "Automático (próxima etapa)",
    detalhe: "O HUB vai emitir sozinho no dia de gerar. Até essa etapa chegar, funciona como Conferir.",
  },
];

/** Regime de apuração do Simples (regApTribSN). */
export const REGIMES_APURACAO: { id: "1" | "2" | "3"; nome: string }[] = [
  { id: "1", nome: "Tudo pelo Simples (tributos federais e ISS no DAS)" },
  { id: "2", nome: "Federais pelo Simples e ISS fora do Simples (passou do sublimite)" },
  { id: "3", nome: "Federais e ISS fora do Simples (passou do limite)" },
];

/** Regime especial de tributação (regEspTrib). */
export const REGIMES_ESPECIAIS: { id: string; nome: string }[] = [
  { id: "0", nome: "Nenhum" },
  { id: "1", nome: "Ato cooperado (cooperativa)" },
  { id: "2", nome: "Estimativa" },
  { id: "3", nome: "Microempresa municipal" },
  { id: "4", nome: "Notário ou registrador" },
  { id: "5", nome: "Profissional autônomo" },
  { id: "6", nome: "Sociedade de profissionais" },
];

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** 171901 → 17.19.01 (código de tributação nacional). */
export const formatarCodigoServico = (c: string | null | undefined) => {
  const d = so(c);
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : d.length === 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : (c ?? "");
};

/** 113021000 → 1.1302.10.00 (NBS). */
export const formatarNbs = (c: string | null | undefined) => {
  const d = so(c);
  return d.length === 9 ? `${d.slice(0, 1)}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : (c ?? "");
};

/** Chave de acesso de 50 números em blocos de 5 (para ler e copiar). */
export const formatarChaveNfse = (c: string | null | undefined) => so(c).replace(/(\d{5})(?=\d)/g, "$1 ");

/** Última tentativa de emissão de cada fatura (a lista vem do banco, mais recente primeiro). */
export function ultimasEmissoes(emissoes: EmissaoNfse[]): Map<string, EmissaoNfse> {
  const m = new Map<string, EmissaoNfse>();
  for (const e of [...emissoes].sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0)))
    if (!m.has(e.fatura_id)) m.set(e.fatura_id, e);
  return m;
}

/** A nota de verdade da fatura (emitida em produção), se houver. */
export const notaEmitida = (emissoes: EmissaoNfse[], fatura: string) =>
  emissoes.find((e) => e.fatura_id === fatura && e.situacao === "emitida" && e.ambiente === "producao") ?? null;

/** Dá para pedir a emissão (o banco confere o resto). */
export const podeEmitirNota = (f: Pick<Fatura, "documento" | "situacao" | "nfse_situacao">) =>
  f.documento === "nfse" && f.situacao !== "cancelada" && f.nfse_situacao !== "emitida";

export interface SituacaoNota {
  texto: string;
  tom: Tom;
  /** Motivo da recusa (ou o que fazer), para mostrar abaixo. */
  detalhe: string | null;
}

/** Situação da nota fiscal da fatura na lista, em linguagem simples. */
export function situacaoDaNota(f: Pick<Fatura, "documento" | "nfse_situacao" | "nfse_numero" | "situacao">, ultima?: EmissaoNfse | null): SituacaoNota {
  if (f.documento !== "nfse") return { texto: "Sem nota fiscal", tom: "neutro", detalhe: null };
  if (f.nfse_situacao === "emitida") return { texto: `Nota fiscal nº ${f.nfse_numero ?? "—"} emitida`, tom: "verde", detalhe: null };
  if (f.situacao === "cancelada") return { texto: "Fatura cancelada", tom: "neutro", detalhe: null };
  const teste = ultima?.ambiente === "producao_restrita";
  if (ultima?.situacao === "enviando") return { texto: "Enviando ao Emissor Nacional…", tom: "azul", detalhe: null };
  if (ultima?.situacao === "rejeitada")
    return { texto: teste ? "Nota de teste recusada" : "Nota fiscal recusada", tom: "vermelho", detalhe: ultima.mensagem };
  if (ultima?.situacao === "erro")
    return {
      texto: "Sem resposta certa do Emissor",
      tom: "ambar",
      detalhe: 'Clique em "Emitir nota fiscal": o HUB confere no Emissor se a nota saiu antes de mandar de novo.',
    };
  if (ultima?.situacao === "emitida" && teste)
    return { texto: `Nota de teste nº ${ultima.numero_nfse ?? "—"} emitida`, tom: "violeta", detalhe: "Sem valor fiscal: a nota de verdade ainda não saiu." };
  return { texto: "NFS-e pronta para emitir", tom: "ambar", detalhe: null };
}
