// Traduz para português as mensagens de erro do Supabase, do Postgres e do navegador.
const REGRAS: [RegExp, string][] = [
  [
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i,
    "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
  ],
  [/invalid login credentials|invalid login/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "E-mail ainda não confirmado. Abra o link enviado para seu e-mail antes de entrar."],
  [/user already registered|already been registered|already exists/i, "Já existe uma conta com este e-mail."],
  [/password should be at least (\d+)/i, "A senha precisa ter pelo menos $1 caracteres."],
  [/password.*(weak|pwned|known to be)/i, "Senha fraca ou já vazada na internet. Escolha outra senha."],
  [/new password should be different/i, "A nova senha precisa ser diferente da atual."],
  [
    /unable to validate email|invalid email|email address .* is invalid|email_address_invalid/i,
    "E-mail inválido. Confira o endereço digitado.",
  ],
  [/signups? not allowed|signup is disabled/i, "Cadastro de novas contas está desativado. Peça acesso ao administrador."],
  [/email rate limit|over_email_send_rate_limit/i, "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo."],
  [/for security purposes, you can only request this after (\d+) seconds?/i, "Por segurança, aguarde $1 segundos antes de tentar de novo."],
  [/rate limit|too many requests/i, "Muitas tentativas seguidas. Aguarde um pouco e tente novamente."],
  [
    /error sending (confirmation|recovery|magic link|invite).*email|error sending email/i,
    "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.",
  ],
  [/token has expired|otp.*expired|link is invalid or has expired|email link is invalid/i, "O link expirou ou já foi usado. Peça um novo."],
  [/auth session missing|jwt expired|invalid jwt|not authenticated|não autenticado/i, "Sua sessão expirou. Entre novamente."],
  [/user not found/i, "Usuário não encontrado."],
  [
    /row-level security|permission denied|violates row-level/i,
    "Você não tem permissão para esta ação. Fale com o administrador da equipe.",
  ],
  [/duplicate key value|unique constraint/i, "Este registro já existe."],
  [/violates foreign key/i, "Este registro está ligado a outros dados e não pode ser alterado ou excluído."],
  [/violates not-null|null value in column/i, "Preencha todos os campos obrigatórios."],
  [/violates check constraint/i, "Algum valor informado não é válido. Confira os campos."],
  [/invalid input syntax/i, "Formato de dado inválido. Confira os campos."],
  [/timeout|timed out/i, "O servidor demorou para responder. Tente novamente."],
  [/internal server error|unexpected failure|database error/i, "Erro no servidor. Tente novamente; se continuar, avise o suporte."],
];

export function traduzirErro(e: unknown): string {
  const msg =
    typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message ?? "") : "";
  if (!msg) return "Ocorreu um erro inesperado. Tente novamente.";
  for (const [re, pt] of REGRAS) {
    const m = msg.match(re);
    if (m) return pt.replace("$1", m[1] ?? "");
  }
  // Mensagens já em português (geradas pelo próprio banco/app) passam direto.
  return msg;
}
