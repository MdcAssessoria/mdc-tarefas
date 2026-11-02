// Tipos do Portal do Cliente (gestão de acessos e a tela do cliente).

export interface VinculoCliente {
  user_id: string | null; // null = convite ainda não aceito
  cliente_id: string;
  nome: string | null;
  email: string;
  permissoes: string[];
  ativo: boolean;
}

/** Empresa que a pessoa logada no Portal pode ver (função do banco portal_minhas_empresas). */
export interface EmpresaPortal {
  cliente_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  regime: string | null;
  uf: string | null;
  org_id: string;
  org_nome: string;
  cor_primaria: string;
  cor_destaque: string;
  logo_url: string | null;
  /** Partes do Portal liberadas: demonstrativos, rotinas, chat, societario, documentos… */
  permissoes: string[];
}
