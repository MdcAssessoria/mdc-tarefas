// Tipos de Pessoas e acessos: acesso de uma pessoa a uma ferramenta, perfil de acesso, situação da conta
// e registro do histórico (auditoria).

import type { PapelApp } from "@/lib/types";

export interface Acesso {
  user_id: string;
  app: string;
  papel: PapelApp;
}
export interface Perfil {
  id: string;
  nome: string;
  apps: Record<string, PapelApp>;
}
export interface Conta {
  user_id: string;
  confirmado: boolean;
  ultimo_acesso: string | null;
}
export interface Auditoria {
  id: number;
  user_id: string | null;
  acao: string;
  alvo: string | null;
  antes: unknown;
  depois: unknown;
  em: string;
}
