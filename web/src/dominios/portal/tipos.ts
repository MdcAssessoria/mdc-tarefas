// Tipos do Portal do Cliente usados pela gestão de acessos.

export interface VinculoCliente {
  user_id: string | null; // null = convite ainda não aceito
  cliente_id: string;
  nome: string | null;
  email: string;
  permissoes: string[];
  ativo: boolean;
}
