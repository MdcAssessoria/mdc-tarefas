// Módulos do Ledgra no HUB (migração 126): o que cada botão abre e a regra do endereço que o Ledgra devolve. A entrada
// é feita pela Função ledgra-entrar; quem decide o que a pessoa vê lá dentro é o Ledgra (licença e acesso do e-mail).
import type { NomeIcone } from "@/components/ui/Icone";

export type ModuloLedgra = "xml" | "auditor" | "legislacao" | "varredura" | "raiox" | "entrega" | "integracoes" | "cofre";

export const MODULOS_LEDGRA: { chave: ModuloLedgra; nome: string; descricao: string; icone: NomeIcone }[] = [
  {
    chave: "xml",
    nome: "Ledgra XML",
    descricao: "Notas fiscais (NF-e, CT-e e NFS-e) dos clientes captadas da SEFAZ, guardadas e conferidas.",
    icone: "arquivo",
  },
  {
    chave: "auditor",
    nome: "Ledgra Auditor",
    descricao: "Auditoria de SPED, conferência fiscal, recuperação de créditos e agenda de obrigações.",
    icone: "escudo",
  },
  {
    chave: "legislacao",
    nome: "Ledgra Legislação",
    descricao: "Legislação federal, estadual e municipal, NCM/TIPI, tabelas de ICMS e respostas a consulta.",
    icone: "documento",
  },
  {
    chave: "varredura",
    nome: "Ledgra Varredura",
    descricao: "Confere na Receita o que cada cliente entregou e pagou e avisa o que falta.",
    icone: "busca",
  },
  // 127 (28/11/2026): os demais módulos avulsos também entram direto
  {
    chave: "raiox",
    nome: "Ledgra Raio-X",
    descricao: "Diagnóstico tributário com os dados oficiais da Receita: o que a empresa paga hoje e com a reforma.",
    icone: "grafico",
  },
  {
    chave: "entrega",
    nome: "Ledgra Entrega",
    descricao: "Agenda das obrigações, recibos, guias e arquivos entregues de cada empresa.",
    icone: "calendario",
  },
  {
    chave: "integracoes",
    nome: "Ledgra Integrações",
    descricao: "Traz os dados de outros sistemas (Domínio, SAP Business One) para o Ledgra.",
    icone: "transferir",
  },
  {
    chave: "cofre",
    nome: "Ledgra Cofre",
    descricao: "Senhas de portais, procurações e certificados digitais dos clientes, com registro de cada acesso.",
    icone: "caixa",
  },
];

/** Só endereço do próprio Ledgra (https) com a página de entrada; o resto é recusado antes de abrir a aba. */
export function enderecoValido(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)ledgra\.com\.br$/.test(u.hostname) && u.pathname === "/entrar-hub" && !!u.hash;
  } catch {
    return false;
  }
}
