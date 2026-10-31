// Tipos da organização (escritório) e da equipe: organização, membro, setor e papel de cada pessoa.

export type Papel = "admin" | "gestor" | "analista" | "tv";

export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  logo_url: string | null;
  cor_primaria: string;
  cor_destaque: string;
  fuso: string;
}

export interface Membro {
  org_id: string;
  user_id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  setor_id: string | null;
  ativo: boolean;
  perfil_id?: string | null;
}

export interface Setor {
  id: string;
  org_id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export const PAPEIS: { id: Papel; nome: string }[] = [
  { id: "admin", nome: "Administrador" },
  { id: "gestor", nome: "Gestor" },
  { id: "analista", nome: "Analista" },
  { id: "tv", nome: "Painel TV (somente leitura)" },
];
