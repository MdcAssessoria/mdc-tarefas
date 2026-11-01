// Mapa de navegação do HUB: módulos, abas de cada módulo, qual módulo está ativo em cada rota
// e o filtro de quais abas cada pessoa pode ver. Usado pelo menu, pela barra superior e pela busca rápida.
import type { PapelApp } from "@/dominios/acessos/tipos";

export type Modulo =
  | "hub"
  | "tarefas"
  | "societario"
  | "demonstrativos"
  | "atendimento"
  | "vencimentos"
  | "comercial"
  | "financeiro"
  | "estoque"
  | "saidas";

/** Aba de um módulo. `minimo` exige um nível na ferramenta; `gestor` exige poder editar cadastros (admin ou gestor). */
export interface LinkModulo {
  href: string;
  nome: string;
  minimo?: PapelApp;
  gestor?: boolean;
}

export const NAV: Record<Modulo, { titulo: string; links: LinkModulo[] }> = {
  hub: { titulo: "Início", links: [] },
  tarefas: {
    titulo: "Tarefas",
    links: [
      { href: "/tarefas", nome: "Tarefas" },
      { href: "/tarefas/relatorio", nome: "Relatórios" },
      { href: "/tv", nome: "Painel TV" },
      { href: "/config", nome: "Configurações", gestor: true },
    ],
  },
  societario: {
    titulo: "Societário",
    links: [
      { href: "/societario", nome: "Processos" },
      { href: "/societario/painel", nome: "Painel" },
    ],
  },
  demonstrativos: {
    titulo: "Demonstrativos",
    links: [
      { href: "/demonstrativos", nome: "Balancetes" },
      { href: "/demonstrativos/importar", nome: "Importar", minimo: "operar" },
      { href: "/demonstrativos/importacoes", nome: "Histórico de importações" },
      { href: "/demonstrativos/riscos", nome: "Riscos da carteira" },
    ],
  },
  atendimento: {
    titulo: "Atendimento",
    links: [
      { href: "/atendimento", nome: "Caixa de entrada" },
      { href: "/atendimento/portal", nome: "Acessos do portal", minimo: "gerir" },
    ],
  },
  vencimentos: { titulo: "Vencimentos", links: [{ href: "/vencimentos", nome: "Vencimentos" }] },
  financeiro: {
    titulo: "Financeiro",
    links: [
      { href: "/financeiro/pagar", nome: "A pagar" },
      { href: "/financeiro/receber", nome: "A receber" },
      { href: "/financeiro/movimento", nome: "Entradas e saídas" },
      { href: "/financeiro", nome: "Bancos" },
      { href: "/financeiro/extratos", nome: "Extratos" },
      { href: "/financeiro/cadastros", nome: "Cadastros" },
      { href: "/financeiro/plano", nome: "Plano de contas" },
    ],
  },
  estoque: {
    titulo: "Estoque",
    links: [
      { href: "/estoque", nome: "Itens" },
      { href: "/estoque/posicao", nome: "Posição" },
      { href: "/estoque/ficha", nome: "Ficha do item" },
      { href: "/estoque/movimentos", nome: "Movimentações" },
      { href: "/estoque/inventario", nome: "Inventário", minimo: "operar" },
      { href: "/estoque/locais", nome: "Estoques" },
    ],
  },
  saidas: {
    titulo: "Saídas",
    links: [{ href: "/saidas", nome: "Pedidos de venda" }],
  },
  comercial: {
    titulo: "CRM Comercial",
    links: [
      { href: "/comercial", nome: "Funil" },
      { href: "/comercial/leads", nome: "Leads" },
      { href: "/comercial/contratos", nome: "Contratos" },
      { href: "/comercial/modelo", nome: "Modelo de contrato", minimo: "gerir" },
    ],
  },
};

/**
 * Módulo ativo pelo primeiro trecho da rota. Configurações e importação de clientes ficam no módulo Tarefas
 * (é onde estão no menu e é a ferramenta exigida para abri-las). Rota fora do mapa conta como Tarefas.
 */
export const MODULO_POR_PREFIXO: Record<string, Modulo> = {
  "": "hub",
  hub: "hub",
  tarefas: "tarefas",
  config: "tarefas",
  clientes: "tarefas",
  societario: "societario",
  demonstrativos: "demonstrativos",
  atendimento: "atendimento",
  vencimentos: "vencimentos",
  comercial: "comercial",
  financeiro: "financeiro",
  estoque: "estoque",
  saidas: "saidas",
};

/** Módulo da rota atual (caminho sem o /hub-mdc, como devolve o usePathname). */
export function moduloDaRota(rota: string): Modulo {
  const primeiro = rota.split("/")[1] ?? "";
  return MODULO_POR_PREFIXO[primeiro] ?? "tarefas";
}

/** Abas do módulo que a pessoa pode ver, conforme o nível dela na ferramenta e se edita cadastros. */
export function filtrarLinks(
  modulo: Modulo,
  permissoes: { pode: (app: string, minimo?: PapelApp) => boolean; podeEditarCadastros: boolean },
): LinkModulo[] {
  return NAV[modulo].links.filter((l) => (l.gestor ? permissoes.podeEditarCadastros : l.minimo ? permissoes.pode(modulo, l.minimo) : true));
}
