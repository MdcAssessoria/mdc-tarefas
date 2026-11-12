// Senha provisória (migração 071): a conta criada ou redefinida pelo administrador vem com a marca trocar_senha no
// app_metadata (só o servidor grava). Enquanto ela existir, o HUB manda a pessoa para a tela de criar a própria senha.
type SessaoMinima = { user?: { app_metadata?: Record<string, unknown> | null } | null } | null | undefined;

export function precisaTrocarSenha(sessao: SessaoMinima): boolean {
  return sessao?.user?.app_metadata?.trocar_senha === true;
}

/** Regra da senha provisória digitada pelo administrador (a Função confere a mesma). Vazio = o HUB gera uma. */
export const SENHA_PROVISORIA = { minimo: 8, maximo: 72 } as const;

/** Mensagem do problema, ou null se a senha serve (ou se está vazia, para o HUB gerar). */
export function problemaSenhaProvisoria(senha: string): string | null {
  if (senha === "") return null;
  if (senha.trim() !== senha) return "A senha não pode começar nem terminar com espaço.";
  if (senha.length < SENHA_PROVISORIA.minimo) return `A senha precisa ter pelo menos ${SENHA_PROVISORIA.minimo} caracteres.`;
  if (senha.length > SENHA_PROVISORIA.maximo) return `A senha pode ter no máximo ${SENHA_PROVISORIA.maximo} caracteres.`;
  return null;
}
