// Acesso direto aos módulos do Ledgra (migração 127, pedido do Edvaldo de 28/11/2026): cliente que comprou só módulos
// avulsos (XML, Cofre, Auditor, Legislação, Raio-X, Entrega, Integrações, Varredura) ganha conta própria no Ledgra, sem
// o Ledgra ERP. A tela pede nome e e-mail do responsável; a Função ledgra-conta cria a conta e devolve a senha
// provisória UMA vez (só quando o e-mail ainda não tinha conta no Ledgra). Quem confere a licença é o banco.

/** Mostra a opção na janela da chave: licença do Ledgra, ativa, que não seja full (o banco confere os módulos). */
export function mostraAcessoDireto(k: { sistema: string; situacao: string; modalidade: string }): boolean {
  return k.sistema === "ledgra" && k.situacao === "ativo" && k.modalidade !== "full";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Confere o formulário antes de chamar a Função; devolve a mensagem do primeiro problema ou null. */
export function problemaResponsavel(nome: string, email: string): string | null {
  if (nome.trim().length < 2) return "Informe o nome do responsável pelo acesso.";
  if (!EMAIL.test(email.trim())) return "Informe um e-mail válido do responsável.";
  return null;
}

export interface RespostaAcesso {
  email: string;
  usuarioNovo: boolean;
  senha: string | null;
  entrada: string;
  licenca: string;
}

/** Lê a resposta da Função; entrada só se for https do ledgra.com.br (senão cai no endereço padrão). */
export function lerRespostaAcesso(r: unknown): RespostaAcesso {
  const b = (r ?? {}) as Record<string, unknown>;
  let entrada = "https://ledgra.com.br/modulos";
  if (typeof b["entrada"] === "string") {
    try {
      const u = new URL(b["entrada"]);
      if (u.protocol === "https:" && /(^|\.)ledgra\.com\.br$/.test(u.hostname)) entrada = u.toString();
    } catch {
      /* fica o padrão */
    }
  }
  return {
    email: typeof b["email"] === "string" ? b["email"] : "",
    usuarioNovo: b["usuario_novo"] === true,
    senha: typeof b["senha_provisoria"] === "string" && b["senha_provisoria"] ? b["senha_provisoria"] : null,
    entrada,
    licenca: typeof b["licenca"] === "string" ? b["licenca"] : "verificando",
  };
}

/** Texto da situação da licença que o Ledgra conferiu na hora. */
export function textoLicencaLedgra(s: string): string {
  if (s === "ativa") return "Licença conferida: os módulos já estão liberados.";
  if (s === "verificando") return "O Ledgra confere a licença na próxima rotina (até a manhã seguinte).";
  if (s === "sem_contrato") return "O Ledgra não achou módulo nesta licença; confira os módulos do contrato.";
  if (s === "bloqueada") return "Cliente bloqueado: os módulos ficam fechados até o desbloqueio.";
  return `O Ledgra respondeu: ${s}.`;
}
