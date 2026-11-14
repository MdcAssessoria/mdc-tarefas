// MDC · Pessoal (077): regras puras do cartão "Você tem empresa?" — máscara do telefone, o que vai da consulta da
// Receita para o banco e a frase da situação depois do pedido. Testadas em contatoEmpresa.test.ts.
import type { DadosCnpj } from "@/lib/consultaCnpj";

/** Telefone com DDD: (11) 98888-7777 ou (11) 3333-4444. Aceita digitar com ou sem pontuação. */
export function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const telefoneValido = (v: string) => {
  const n = v.replace(/\D/g, "").length;
  return n === 0 || n === 10 || n === 11;
};

/** Dados públicos da Receita que acompanham o pedido (sem sócios: só a empresa). */
export function receitaParaContato(d: DadosCnpj) {
  return {
    nome_fantasia: d.nomeFantasia,
    municipio: d.municipio,
    uf: d.uf,
    cnae: d.cnae,
    porte: d.porte,
    simples: d.simples,
    mei: d.mei,
    abertura: d.abertura,
    situacao: d.situacao,
    endereco: d.endereco,
    telefone: d.telefone,
    email: d.email,
  };
}

export type SituacaoContato = "lead_novo" | "lead_existente" | "ja_cliente";

export const TEXTO_DEPOIS: Record<SituacaoContato, string> = {
  lead_novo: "Pronto! A equipe da MDC vai entrar em contato em breve.",
  lead_existente: "Pronto! A MDC já conhecia a empresa e vai retomar o contato com você.",
  ja_cliente: "Esta empresa já é cliente da MDC. Para qualquer assunto, fale com a sua equipe de sempre.",
};
