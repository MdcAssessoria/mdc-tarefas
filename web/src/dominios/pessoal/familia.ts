// Regras da tela Família do MDC · Pessoal (075): nome da permissão de cada pessoa, situação dos convites e a mensagem
// do convite para o WhatsApp. Funções puras (sem banco), testadas em familia.test.ts.

export type Permissao = "responsavel" | "lancar" | "consultar";

export const PERMISSOES: { valor: Permissao; nome: string; explica: string }[] = [
  { valor: "lancar", nome: "Pode lançar", explica: "Vê tudo e lança contas, pagamentos e tarefas." },
  { valor: "consultar", nome: "Só consulta", explica: "Vê as finanças e as tarefas, mas não muda nada." },
  { valor: "responsavel", nome: "Responsável", explica: "Faz tudo, inclusive convidar e tirar pessoas." },
];

export const nomePermissao = (p: Permissao) => PERMISSOES.find((x) => x.valor === p)?.nome ?? p;

/** Permissão de um membro a partir do papel na família e do nível de acesso às Finanças. */
export function permissaoDoMembro(papel: string, acessoFinanceiro: string | null | undefined): Permissao {
  if (papel === "admin") return "responsavel";
  return acessoFinanceiro === "operar" || acessoFinanceiro === "gerir" ? "lancar" : "consultar";
}

export interface ConviteFamilia {
  id: string;
  nome: string;
  permissao: "lancar" | "consultar";
  criado_em: string;
  expira_em: string;
  usado_em: string | null;
  cancelado_em: string | null;
}

export type SituacaoConvite = "aguardando" | "aceito" | "cancelado" | "vencido";

/** Situação do convite no instante `agora` (ISO). */
export function situacaoConvite(c: ConviteFamilia, agora: string): SituacaoConvite {
  if (c.usado_em) return "aceito";
  if (c.cancelado_em) return "cancelado";
  return c.expira_em <= agora ? "vencido" : "aguardando";
}

export const NOME_SITUACAO: Record<SituacaoConvite, string> = {
  aguardando: "Aguardando",
  aceito: "Aceito",
  cancelado: "Cancelado",
  vencido: "Vencido",
};

/** Endereço que abre a entrada do app já com o código preenchido. */
export function linkConvite(origem: string, base: string, codigo: string): string {
  return `${origem}${base}/pessoal?convite=${encodeURIComponent(codigo)}`;
}

/** Texto do convite (para copiar ou mandar pelo WhatsApp). */
export function mensagemConvite(familia: string, link: string, codigo: string): string {
  return (
    `Oi! Estou te convidando para a "${familia}" no MDC · Pessoal, onde organizamos as contas e as tarefas de casa.\n` +
    `Abra o link, crie a sua conta (ou entre com a que já tem) e pronto:\n${link}\n` +
    `Se pedir, o código é ${codigo}. Vale por 7 dias e só pode ser usado uma vez.`
  );
}

export const whatsappDe = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;
