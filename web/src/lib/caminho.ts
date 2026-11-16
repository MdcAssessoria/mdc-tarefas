// O Hub roda sob /hub-mdc (mdcassessoria.com/hub-mdc). Links do Next (<Link>, router) já recebem o prefixo;
// endereços montados à mão (window.location, <a href>, <img src>, rotas gravadas no banco) passam por aqui.
export const BASE = "/hub-mdc";

/** Prefixa caminhos internos ("/tarefas" → "/hub-mdc/tarefas"); URLs externas e "#" ficam como estão. */
export function caminho(p: string): string {
  if (!p.startsWith("/") || p.startsWith("//") || p === BASE || p.startsWith(BASE + "/")) return p;
  return BASE + p;
}

/** Endereço oficial do HUB. Todo link que vai para outra pessoa (convite, senha provisória, assinatura, TV, QR do
 *  app) sai com ele, mesmo quando quem gera abriu o HUB por outro endereço (ex.: mdc-tarefas.vercel.app). */
export const ENDERECO_OFICIAL = "https://hub.mdcassessoria.com";

/** Origem dos links enviados: a oficial; no computador de desenvolvimento (localhost), a do próprio navegador. */
export function origemPublica(origemAtual?: string): string {
  const o = origemAtual ?? (typeof window === "undefined" ? "" : window.location.origin);
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o) ? o : ENDERECO_OFICIAL;
}

/** Endereço completo do Hub para links em e-mails, convites e mensagens (sempre o oficial). */
export function enderecoHub(p = "/"): string {
  return origemPublica() + caminho(p);
}
