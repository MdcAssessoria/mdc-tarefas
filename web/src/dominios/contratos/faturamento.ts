// Regras puras do faturamento dos contratos a receber (migrações 043 e 048). As mesmas contas do banco:
// app.fin_recorrente_data_geracao, app.fin_recorrente_vencimento e as validações de fin_recorrente_salvar.
// 048 (decisão do Edvaldo, 03/11/2026): a fatura vence no MESMO mês em que é gerada; por isso o dia de gerar não pode
// passar do dia de vencer (a fatura nasceria vencida).
// O banco decide; a tela só mostra e avisa antes de mandar.
import { vencimentoNoMes } from "./regras";
import { somarMeses } from "@/lib/datas";
import type { NomeIcone } from "@/components/ui/Icone";
import type { Tom } from "@/components/ui/Tons";
import type { BancoBoleto, CanalEnvio, DocumentoFatura, EnvioDaFatura, EnvioFatura, SituacaoBoleto, SituacaoFatura, SituacaoNfse } from "./tipos";

/** As 4 opções de "O que enviar ao cliente", na ordem do pedido do Edvaldo (03/11/2026). */
export const OPCOES_ENVIO: {
  id: EnvioFatura;
  documento: DocumentoFatura;
  titulo: string;
  detalhe: string;
  icones: NomeIcone[];
}[] = [
  {
    id: "nf_fatura_boleto",
    documento: "nfse",
    titulo: "Nota fiscal + fatura + boleto",
    detalhe: "Tudo junto: o cliente recebe a nota, a fatura e o boleto para pagar.",
    icones: ["documento", "arquivo", "banco"],
  },
  {
    id: "nf_fatura",
    documento: "nfse",
    titulo: "Nota fiscal + fatura",
    detalhe: "O boleto vai depois, num envio separado.",
    icones: ["documento", "arquivo"],
  },
  {
    id: "fatura_boleto",
    documento: "fatura",
    titulo: "Fatura + boleto",
    detalhe: "Sem nota fiscal: a fatura e o boleto para pagar.",
    icones: ["arquivo", "banco"],
  },
  {
    id: "fatura",
    documento: "fatura",
    titulo: "Só a fatura",
    detalhe: "Sem nota fiscal e sem boleto (ex.: o cliente paga por PIX ou transferência).",
    icones: ["arquivo"],
  },
];

export const NOME_DOCUMENTO: Record<DocumentoFatura, string> = {
  nfse: "Nota fiscal de serviço (NFS-e)",
  fatura: "Nota fatura (sem nota fiscal)",
};

export const CANAIS_ENVIO: { id: CanalEnvio; nome: string; icone: NomeIcone; explicacao: string }[] = [
  { id: "email", nome: "E-mail", icone: "enviar", explicacao: "Manda para o e-mail do cliente" },
  { id: "whatsapp", nome: "WhatsApp", icone: "chat", explicacao: "Manda para o WhatsApp do cliente" },
  { id: "portal", nome: "Portal do Cliente", icone: "pessoas", explicacao: "Aparece no Portal, no login do próprio cliente" },
];

export const SITUACOES_FATURA: Record<SituacaoFatura, { nome: string; tom: Tom; explicacao: string }> = {
  gerada: { nome: "Gerada", tom: "neutro", explicacao: "Nenhum canal de envio marcado: baixe o PDF e mande você mesmo" },
  aguardando_nf: { nome: "Aguardando nota fiscal", tom: "ambar", explicacao: "A nota fiscal ainda precisa ser emitida" },
  pronta: { nome: "Pronta para enviar", tom: "azul", explicacao: "Falta enviar por algum canal" },
  enviada: { nome: "Enviada", tom: "verde", explicacao: "Chegou ao cliente por todos os canais marcados" },
  cancelada: { nome: "Cancelada", tom: "neutro", explicacao: "Cancelada com motivo" },
};

export const SITUACOES_NFSE: Record<SituacaoNfse, string> = {
  nao_se_aplica: "Sem nota fiscal",
  a_emitir: "NFS-e pronta para emitir",
  emitida: "Nota fiscal emitida",
  erro: "Nota fiscal com problema",
};

export const SITUACOES_BOLETO: Record<SituacaoBoleto, string> = {
  nao_se_aplica: "Sem boleto",
  a_definir: "Boleto: aguardando configuração",
  gerado: "Boleto gerado",
};

export const SITUACOES_ENVIO: Record<EnvioDaFatura["situacao"], { nome: string; tom: Tom }> = {
  pendente: { nome: "Na fila", tom: "azul" },
  enviado: { nome: "Enviado", tom: "verde" },
  erro: { nome: "Erro", tom: "vermelho" },
  aguardando_configuracao: { nome: "Aguardando configuração", tom: "ambar" },
  cancelado: { nome: "Cancelado", tom: "neutro" },
};

/** Documento que combina com a opção de envio. */
export const documentoDoEnvio = (envio: EnvioFatura): DocumentoFatura =>
  envio === "nf_fatura_boleto" || envio === "nf_fatura" ? "nfse" : "fatura";

/** Dia em que a conta do mês nasce: a receber no dia de gerar (1–28); a pagar no dia 1. */
export function dataGeracao(mes: string, tipo: "pagar" | "receber", diaGeracao: number): string {
  const d = tipo === "receber" ? Math.max(1, Math.min(28, Math.floor(diaGeracao) || 1)) : 1;
  return `${mes.slice(0, 7)}-${String(d).padStart(2, "0")}`;
}

/** A receber com o dia de gerar depois do dia de vencer: a fatura nasceria vencida (o banco recusa, 048). */
export const geraDepoisDoVencimento = (tipo: "pagar" | "receber", diaGeracao: number, diaVencimento: number) =>
  tipo === "receber" && diaGeracao > diaVencimento;

/** Vencimento da conta do mês: sempre no mesmo mês da geração (igual a app.fin_recorrente_vencimento, 048). */
export function vencimentoDoMes(mes: string, _tipo: "pagar" | "receber", _diaGeracao: number, diaVencimento: number): string {
  return vencimentoNoMes(mes.slice(0, 7), diaVencimento);
}

/** Bancos do boleto pelo Ledgra Link (decisão do Edvaldo, 03/11/2026). */
export const BANCOS_BOLETO: { id: BancoBoleto; nome: string; codigo: string }[] = [
  { id: "itau", nome: "Itaú", codigo: "341" },
  { id: "santander", nome: "Santander", codigo: "033" },
];

/** Primeiro mês cuja geração ainda não passou: este mês se o dia de gerar ainda vem, senão o próximo. */
export function proximaGeracao(hoje: string, tipo: "pagar" | "receber", diaGeracao: number): string {
  const esteMes = hoje.slice(0, 7);
  return dataGeracao(esteMes, tipo, diaGeracao) >= hoje ? esteMes : somarMeses(esteMes, 1).slice(0, 7);
}

export const soDigitosTel = (s: string) => s.replace(/\D/g, "");
export const emailValido = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
export const whatsappValido = (s: string) => soDigitosTel(s).length >= 10 && soDigitosTel(s).length <= 13;
/** Código de tributação nacional (17.01.01 / 170101) ou item da LC 116 (17.01 / 1701). */
export const codigoServicoValido = (s: string) => /^[0-9]{2}\.?[0-9]{2}(\.?[0-9]{2})?$/.test(s.trim());

export interface FaturamentoForm {
  envio: EnvioFatura;
  diaGeracao: string;
  canais: CanalEnvio[];
  email: string;
  whatsapp: string;
  carteira: string;
  servicoDescricao: string;
  servicoCodigo: string;
  iss: string;
  boletoBanco: BancoBoleto | "";
}

/** Mesmas regras do banco, para avisar antes de salvar. Devolve a mensagem do primeiro problema ou "". */
export function conferirFaturamento(f: FaturamentoForm, numero: (s: string) => number, diaVencimento?: number): string {
  const dia = Number(f.diaGeracao);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return "Dia de gerar: de 1 a 28 (todo mês tem esses dias).";
  if (diaVencimento != null && geraDepoisDoVencimento("receber", dia, diaVencimento))
    return `A fatura vence no mesmo mês em que é gerada: gere até o dia ${diaVencimento} (ex.: gerar dia 1 e vencer dia ${diaVencimento}).`;
  if (f.envio !== "fatura" && !f.boletoBanco) return "Escolha o banco do boleto: Itaú ou Santander.";
  if (f.canais.includes("email") && !emailValido(f.email)) return "Informe o e-mail que recebe a fatura (ex.: financeiro@cliente.com.br).";
  if (f.canais.includes("whatsapp") && !whatsappValido(f.whatsapp)) return "Informe o WhatsApp que recebe a fatura, com DDD.";
  if (f.canais.includes("portal") && !f.carteira) return "Para publicar no Portal, escolha o cliente da carteira.";
  if (documentoDoEnvio(f.envio) === "nfse") {
    if (!f.servicoDescricao.trim()) return "Com nota fiscal, descreva o serviço (é o texto que vai na nota).";
    if (!codigoServicoValido(f.servicoCodigo)) return "Informe o código do serviço (ex.: 17.01.01).";
    const iss = numero(f.iss);
    if (!f.iss.trim() || !(iss >= 0 && iss <= 5)) return "Informe a alíquota do ISS (de 0% a 5%).";
  }
  return "";
}

/** "Nota fiscal + fatura + boleto" a partir do conteúdo de um envio. */
export function textoConteudo(c: EnvioDaFatura["conteudo"]): string {
  const nomes = { nfse: "Nota fiscal", fatura: "fatura", boleto: "boleto" } as const;
  const t = (["nfse", "fatura", "boleto"] as const).filter((x) => c.includes(x)).map((x) => nomes[x]);
  return t.join(" + ").replace(/^./, (x) => x.toUpperCase());
}

/** "(11) 98888-7777" a partir dos dígitos. */
export function fmtWhatsapp(d: string | null | undefined): string {
  const n = soDigitosTel(d ?? "");
  const local = n.length > 11 ? n.slice(n.length - 11) : n;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return n;
}
