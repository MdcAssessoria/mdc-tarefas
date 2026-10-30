// O Hub roda sob /hub-mdc (mdcassessoria.com/hub-mdc). Links do Next (<Link>, router) já recebem o prefixo;
// endereços montados à mão (window.location, <a href>, <img src>, rotas gravadas no banco) passam por aqui.
export const BASE = "/hub-mdc";

/** Prefixa caminhos internos ("/tarefas" → "/hub-mdc/tarefas"); URLs externas e "#" ficam como estão. */
export function caminho(p: string): string {
  if (!p.startsWith("/") || p.startsWith("//") || p === BASE || p.startsWith(BASE + "/")) return p;
  return BASE + p;
}

/** Endereço completo do Hub no navegador atual (para links em e-mails e convites). */
export function enderecoHub(p = "/"): string {
  return typeof window === "undefined" ? caminho(p) : window.location.origin + caminho(p);
}
