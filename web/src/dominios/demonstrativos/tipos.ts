// Tipos dos registros de demonstrativos como vêm do banco (balancete importado, linhas e parecer).
// Usados pelas telas da equipe e pelo Portal do Cliente.
import type { Alerta, Conferencia, Indices, Linha, Resumo } from "@/lib/balancete";
import type { Demonstracoes } from "@/lib/demonstracoes";

export interface BalanceteReg {
  id: string;
  org_id: string;
  cliente_id: string;
  competencia: string;
  status: "rascunho" | "publicado";
  arquivo_nome: string | null;
  resumo: Resumo;
  indices: Indices;
  alertas: Alerta[];
  conferencias: Conferencia[];
  comentario: string | null;
  importado_em: string;
  publicado_em: string | null;
  demonstracoes?: Demonstracoes | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
}

export interface LinhaReg extends Linha {
  id: number;
}

export interface ParecerReg {
  id: string;
  balancete_id: string;
  versao: number;
  status: "rascunho" | "publicado";
  texto: string;
  contador_nome: string | null;
  contador_crc: string | null;
  publicado_em: string | null;
}
