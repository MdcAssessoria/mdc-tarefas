// Quem pode receber senha provisória de uma vez (Pessoas e acessos › "Liberar acesso de quem falta"): convites que ainda
// não viraram conta e pessoas da equipe que nunca entraram. Quem já entrou aparece para marcar à mão (ex.: entrou pelo
// link mas a senha não gravou). Nunca entram: a própria pessoa, o Painel TV e quem não tem e-mail.

export interface CandidatoAcesso {
  email: string;
  nome: string;
  /** true = ainda não tem acesso (vem marcado); false = já entrou alguma vez (fica para marcar à mão). */
  pendente: boolean;
  motivo: string;
}

interface PessoaEquipe {
  user_id: string;
  nome: string;
  email: string | null;
  papel: string;
  ativo: boolean;
}

/** Monta a lista em ordem: primeiro quem não tem acesso, depois os demais; por nome dentro de cada grupo. */
export function candidatosAcesso(
  equipe: PessoaEquipe[],
  contas: Map<string, { confirmado: boolean; ultimo_acesso: string | null }>,
  convites: { email: string; nome: string | null }[],
  euId: string,
): CandidatoAcesso[] {
  const vistos = new Set<string>();
  const lista: CandidatoAcesso[] = [];
  const ehTv = (email: string, papel?: string) => papel === "tv" || /^tv@/i.test(email);
  for (const c of convites) {
    const email = c.email.trim().toLowerCase();
    if (!email || vistos.has(email) || ehTv(email)) continue;
    vistos.add(email);
    lista.push({ email, nome: c.nome?.trim() || email, pendente: true, motivo: "Cadastrada, ainda sem acesso" });
  }
  for (const m of equipe) {
    const email = (m.email ?? "").trim().toLowerCase();
    if (!m.ativo || m.user_id === euId || !email || vistos.has(email) || ehTv(email, m.papel)) continue;
    vistos.add(email);
    const conta = contas.get(m.user_id);
    const nunca = !conta || !conta.confirmado || !conta.ultimo_acesso;
    lista.push({
      email,
      nome: m.nome,
      pendente: nunca,
      motivo: nunca ? "Nunca entrou no HUB" : "Já entrou (marque se esqueceu a senha)",
    });
  }
  return lista.sort((a, b) => Number(b.pendente) - Number(a.pendente) || a.nome.localeCompare(b.nome, "pt-BR"));
}
