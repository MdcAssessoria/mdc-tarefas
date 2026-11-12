// Convite por e-mail (ou link para WhatsApp) para a pessoa criar a própria senha, pela Função Edge "convite".
import { chamarFuncao } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";

export interface RespostaConvite {
  enviado: boolean;
  link?: string;
  erro?: string;
  /** Senha provisória (só no modo senha_provisoria): aparece uma vez, para o administrador repassar. */
  senha?: string;
  /** Endereço de entrada do HUB, para ir na mensagem junto com a senha. */
  endereco?: string;
}

/**
 * Dispara o e-mail de convite (a pessoa cria a própria senha pelo link).
 * O convite precisa ter sido registrado antes (hub_convidar ou portal_convidar).
 * Quando o e-mail não sai (SMTP), volta o link para o administrador repassar.
 */
export async function enviarConvite(email: string, nome?: string): Promise<RespostaConvite> {
  return chamar({ email, nome });
}

/**
 * Gera o link de criar senha para repassar pelo WhatsApp (sem mandar e-mail). Só para quem pode convidar a pessoa e
 * só para conta que nunca entrou. O link novo substitui o do e-mail anterior (o Supabase guarda um válido por conta).
 */
export async function gerarLinkConvite(email: string, nome?: string): Promise<RespostaConvite> {
  return chamar({ email, nome, so_link: true });
}

/**
 * Senha provisória (071): cria a conta (ou redefine a senha de quem já tem) com uma senha aleatória para mandar pelo
 * WhatsApp. No primeiro acesso o HUB obriga a pessoa a criar a própria senha. Não depende de e-mail.
 */
/** Senha provisória pronta para repassar (tela de Acessos e do Portal). */
export interface SenhaGerada {
  senha: string;
  email: string;
  endereco: string;
}

export async function gerarSenhaProvisoria(email: string, nome?: string): Promise<RespostaConvite> {
  return chamar({ email, nome, senha_provisoria: true });
}

async function chamar(pedido: { email: string; nome?: string; so_link?: boolean; senha_provisoria?: boolean }): Promise<RespostaConvite> {
  try {
    return await chamarFuncao<RespostaConvite>("convite", { corpo: { ...pedido, origem: window.location.origin } });
  } catch (e) {
    // quem chama mostra o erro ao lado do link/aviso; aqui nunca lança
    return { enviado: false, erro: traduzirErro(e) };
  }
}
