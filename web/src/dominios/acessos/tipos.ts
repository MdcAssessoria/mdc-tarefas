// Tipos de Pessoas e acessos: nível numa ferramenta (ver, operar, gerir), ferramenta do HUB liberada para a pessoa,
// acesso de uma pessoa a uma ferramenta, perfil de acesso, situação da conta e registro do histórico (auditoria).

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

export type PapelApp = "ver" | "operar" | "gerir";

export interface HubApp {
  slug: string;
  nome: string;
  descricao: string;
  icone: string;
  rota: string;
  status: "ativo" | "beta" | "em_breve" | "desligado";
  externo: boolean;
  ordem: number;
  papel: PapelApp | null;
}

export const PAPEIS_APP: { id: PapelApp; nome: string; ajuda: string }[] = [
  { id: "ver", nome: "Ver", ajuda: "consulta, sem alterar" },
  { id: "operar", nome: "Operar", ajuda: "trabalha no dia a dia" },
  { id: "gerir", nome: "Gerir", ajuda: "configura, publica e exclui" },
];

export const PESO_PAPEL_APP: Record<PapelApp, number> = { ver: 1, operar: 2, gerir: 3 };
