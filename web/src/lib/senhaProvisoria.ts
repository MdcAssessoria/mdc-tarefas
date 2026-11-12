// Senha provisória (migração 071): a conta criada ou redefinida pelo administrador vem com a marca trocar_senha no
// app_metadata (só o servidor grava). Enquanto ela existir, o HUB manda a pessoa para a tela de criar a própria senha.
type SessaoMinima = { user?: { app_metadata?: Record<string, unknown> | null } | null } | null | undefined;

export function precisaTrocarSenha(sessao: SessaoMinima): boolean {
  return sessao?.user?.app_metadata?.trocar_senha === true;
}
