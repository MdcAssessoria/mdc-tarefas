// Mapa de navegação do HUB: módulos, abas de cada módulo, qual módulo está ativo em cada rota
// e o filtro de quais abas cada pessoa pode ver. Usado pelo menu, pela barra superior e pela busca rápida.
import type { PapelApp } from "@/dominios/acessos/tipos";

import type { NomeIcone } from "@/components/ui/Icone";

export type Modulo =
  | "hub"
  | "tarefas"
  | "societario"
  | "demonstrativos"
  | "atendimento"
  | "vencimentos"
  | "comercial"
  | "financeiro"
  | "licencas"
  | "estoque"
  | "entradas"
  | "saidas"
  | "plano_contas"
  | "centros_custo"
  | "relatorios"
  | "contratos"
  | "cadastros";

/**
 * Aba de um módulo. `minimo` exige um nível na ferramenta; `gestor` exige poder editar cadastros (admin ou gestor).
 * `grupo` junta abas num menu suspenso da barra superior (ex.: Financeiro › Dinheiro › A pagar); sem grupo é aba solta.
 */
export interface LinkModulo {
  href: string;
  nome: string;
  /** Ícone da aba (Icone.tsx), ao lado do nome: deixa a barra mais fácil de reconhecer pelo desenho. */
  icone?: NomeIcone;
  minimo?: PapelApp;
  gestor?: boolean;
  grupo?: string;
}

/**
 * `grupos` (opcional) dá a ordem dos menus do módulo. Grupo sem nenhuma aba visível não aparece, então dá para deixar
 * o lugar reservado para telas que ainda vão chegar.
 * `acesso` (opcional): ferramentas (slugs do hub_apps) que liberam o módulo, quando ele não tem ferramenta própria
 * (ex.: o cadastro comum de fornecedores e clientes vale para quem tem qualquer módulo de gestão). Sem `acesso`, o
 * módulo exige a ferramenta de mesmo nome.
 */
export const NAV: Record<Modulo, { titulo: string; links: LinkModulo[]; grupos?: string[]; acesso?: string[] }> = {
  hub: { titulo: "Início", links: [] },
  tarefas: {
    titulo: "Tarefas",
    links: [
      { href: "/tarefas", nome: "Tarefas", icone: "check" },
      { href: "/tarefas/relatorio", nome: "Relatórios", icone: "grafico" },
      { href: "/tv", nome: "Painel TV", icone: "tv" },
      { href: "/config", nome: "Configurações", icone: "engrenagem", gestor: true },
    ],
  },
  societario: {
    titulo: "Societário",
    links: [
      { href: "/societario", nome: "Processos", icone: "pasta" },
      { href: "/societario/painel", nome: "Painel", icone: "grade" },
    ],
  },
  demonstrativos: {
    titulo: "Demonstrativos",
    links: [
      { href: "/demonstrativos", nome: "Balancetes", icone: "planilha" },
      { href: "/demonstrativos/importar", nome: "Importar", icone: "importar", minimo: "operar" },
      { href: "/demonstrativos/importacoes", nome: "Histórico de importações", icone: "relogio" },
      { href: "/demonstrativos/riscos", nome: "Riscos da carteira", icone: "alerta" },
    ],
  },
  atendimento: {
    titulo: "Atendimento",
    links: [
      { href: "/atendimento", nome: "Caixa de entrada", icone: "chat" },
      { href: "/atendimento/portal", nome: "Acessos do portal", icone: "pessoas", minimo: "gerir" },
    ],
  },
  vencimentos: {
    titulo: "Vencimentos",
    links: [
      { href: "/vencimentos", nome: "Vencimentos", icone: "relogio" },
      { href: "/vencimentos/certificados", nome: "Certificados digitais", icone: "escudo" },
    ],
  },
  // Gestão do cliente (modelo Conta Azul/Omie): cada módulo é um item do menu lateral, vendável e liberável por cliente.
  // Entradas (/entradas), Saídas (/saidas) e Estoque (/estoque) continuam no código, mas desde a 059 (05/11/2026) as
  // ferramentas ficam "desligadas" no catálogo: o HUB serve às finanças da MDC e à receita dos sistemas licenciados.
  financeiro: {
    titulo: "Financeiro",
    grupos: ["Bancos"],
    links: [
      { href: "/financeiro", nome: "Início", icone: "casa" },
      { href: "/financeiro/pagar", nome: "A pagar", icone: "seta-saida" },
      { href: "/financeiro/receber", nome: "A receber", icone: "seta-entrada" },
      { href: "/financeiro/movimento", nome: "Entradas e saídas", icone: "lista" },
      { href: "/financeiro/bancos", nome: "Contas bancárias", icone: "banco", grupo: "Bancos" },
      { href: "/financeiro/transferencias", nome: "Transferências", icone: "transferir", grupo: "Bancos" },
      { href: "/financeiro/extratos", nome: "Extratos", icone: "documento", grupo: "Bancos" },
      { href: "/financeiro/conciliacao", nome: "Conciliação", icone: "check", grupo: "Bancos" },
      // certificado da NFS-e (059): saiu de Entradas, que ficou desligada
      { href: "/financeiro/certificado", nome: "Certificado digital", icone: "escudo", minimo: "gerir" },
    ],
  },
  licencas: {
    titulo: "Cobrança Ledgra",
    links: [
      { href: "/licencas", nome: "Painel", icone: "grade" },
      { href: "/licencas/cobrancas", nome: "Mensalidades", icone: "moeda" },
      { href: "/licencas/inadimplentes", nome: "Inadimplentes", icone: "alerta" },
      { href: "/licencas/contratos", nome: "Contratos", icone: "documento" },
      { href: "/licencas/faturamento", nome: "Faturamento do mês", icone: "calendario" },
      { href: "/licencas/produtos", nome: "Produtos e planos", icone: "caixa" },
    ],
  },
  estoque: {
    titulo: "Estoque",
    links: [
      { href: "/estoque", nome: "Itens", icone: "caixa" },
      { href: "/estoque/posicao", nome: "Posição", icone: "grafico" },
      { href: "/estoque/ficha", nome: "Ficha do item", icone: "documento" },
      { href: "/estoque/movimentos", nome: "Movimentações", icone: "transferir" },
      { href: "/estoque/inventario", nome: "Inventário", icone: "lista", minimo: "operar" },
      { href: "/estoque/locais", nome: "Estoques", icone: "pasta" },
    ],
  },
  saidas: {
    titulo: "Saídas",
    links: [{ href: "/saidas", nome: "Pedidos de venda", icone: "enviar" }],
  },
  plano_contas: {
    titulo: "Plano de contas",
    links: [
      { href: "/plano-contas", nome: "Plano do Domínio", icone: "lista" },
      { href: "/plano-contas/categorias", nome: "Despesas e receitas", icone: "etiqueta" },
    ],
  },
  centros_custo: { titulo: "Centros de custo", links: [{ href: "/centros-custo", nome: "Centros de custo", icone: "etiqueta" }] },
  relatorios: { titulo: "Relatórios", links: [{ href: "/relatorios", nome: "Relatórios", icone: "grafico" }] },
  // Contratos fixos (041): cadastro, vigência, anexos, contas do mês no Financeiro e reajuste anual; faturas (043);
  // parâmetros da emissão da NFS-e pelo Emissor Nacional, só para quem gere (046); boleto pelo Ledgra Link (049);
  // envio automático por e-mail e WhatsApp, só para quem gere (053)
  contratos: {
    titulo: "Contratos",
    links: [
      { href: "/contratos", nome: "Contratos", icone: "documento" },
      { href: "/contratos/sistemas", nome: "Receita por sistema", icone: "tendencia" },
      { href: "/contratos/faturas", nome: "Faturas", icone: "arquivo" },
      { href: "/contratos/reajustes", nome: "Reajustes", icone: "seta-cima" },
      { href: "/contratos/nota-fiscal", nome: "Regras fiscais", icone: "escudo", minimo: "gerir" },
      { href: "/contratos/boleto", nome: "Boleto", icone: "banco", minimo: "gerir" },
      { href: "/contratos/envio", nome: "Envio (e-mail e WhatsApp)", icone: "enviar", minimo: "gerir" },
    ],
  },
  // PN - Parceiros de negócio (05/11/2026): clientes e fornecedores em telas próprias (o mesmo cadastro, filtrado)
  cadastros: {
    titulo: "PN - Parceiros de negócio",
    acesso: ["financeiro", "entradas", "saidas", "estoque"],
    links: [
      { href: "/cadastros/clientes", nome: "Clientes", icone: "alvo" },
      { href: "/cadastros/fornecedores", nome: "Fornecedores", icone: "caixa" },
      { href: "/cadastros/pessoas", nome: "Todos", icone: "pessoas" },
    ],
  },
  entradas: {
    titulo: "Entradas",
    links: [
      { href: "/entradas", nome: "Notas recebidas", icone: "importar" },
      { href: "/entradas/lancar", nome: "Lançar nota", icone: "mais", minimo: "operar" },
      { href: "/entradas/compras", nome: "Pedidos de compra", icone: "caixa" },
      { href: "/entradas/carga-tributaria", nome: "Carga tributária", icone: "grafico" },
      { href: "/entradas/certificado", nome: "Certificado digital", icone: "escudo" },
    ],
  },
  comercial: {
    titulo: "CRM Comercial",
    links: [
      { href: "/comercial", nome: "Funil", icone: "funil" },
      { href: "/comercial/leads", nome: "Leads", icone: "alvo" },
      { href: "/comercial/contratos", nome: "Contratos", icone: "documento" },
      { href: "/comercial/modelo", nome: "Modelo de contrato", icone: "arquivo", minimo: "gerir" },
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
  licencas: "licencas",
  estoque: "estoque",
  saidas: "saidas",
  "plano-contas": "plano_contas",
  "centros-custo": "centros_custo",
  relatorios: "relatorios",
  contratos: "contratos",
  cadastros: "cadastros",
  entradas: "entradas",
};

/**
 * Ferramenta (hub_apps.slug) que libera cada módulo, quando é diferente do nome do módulo. Desde a migração 035 cada
 * módulo de gestão tem a sua ferramenta (Entradas usa "entradas"); mapa vazio mantido para módulos futuros.
 */
/**
 * Módulos de gestão: no menu lateral ficam juntos no grupo "Gestão" (pedido do Edvaldo, 02/11/2026). Desde então a
 * MDC usa esses módulos só para a própria gestão (o produto para clientes é o Ledgra, sistema à parte), mais a
 * Cobrança Ledgra. Cada um continua com permissão própria; o grupo é só apresentação.
 */
export const MODULOS_GESTAO = [
  "financeiro",
  "entradas",
  "saidas",
  "estoque",
  "centros_custo",
  "plano_contas",
  "relatorios",
  // Contratos fixos (041): honorários, aluguel, sistemas; lança as contas no Financeiro e propõe o reajuste anual
  "contratos",
  // Cobrança Ledgra (antigo Licenças): cobrava os assinantes do Ledgra (02/11/2026). Desligada na 060 (05/11/2026): o
  // Ledgra cobra os próprios clientes; o HUB controla as licenças vendidas em Contratos › Receita por sistema
  "licencas",
] as const;
export const ehModuloGestao = (slug: string) => (MODULOS_GESTAO as readonly string[]).includes(slug);

export const APP_DO_MODULO: Partial<Record<Modulo, string>> = {};
export const appDoModulo = (m: Modulo) => APP_DO_MODULO[m] ?? m;

/** Módulo da rota atual (caminho sem o /hub-mdc, como devolve o usePathname). */
export function moduloDaRota(rota: string): Modulo {
  const primeiro = rota.split("/")[1] ?? "";
  return MODULO_POR_PREFIXO[primeiro] ?? "tarefas";
}

/** Ferramentas (slugs) que liberam o módulo: as de `acesso` ou a de mesmo nome. */
export const ferramentasDoModulo = (modulo: Modulo): string[] => NAV[modulo].acesso ?? [modulo];

/** A pessoa pode abrir o módulo? Basta ter uma das ferramentas que o liberam, no nível pedido. */
export function podeModulo(modulo: Modulo, pode: (app: string, minimo?: PapelApp) => boolean, minimo?: PapelApp): boolean {
  return ferramentasDoModulo(modulo).some((app) => pode(app, minimo));
}

/** Abas do módulo que a pessoa pode ver, conforme o nível dela na ferramenta e se edita cadastros. */
export function filtrarLinks(
  modulo: Modulo,
  permissoes: { pode: (app: string, minimo?: PapelApp) => boolean; podeEditarCadastros: boolean },
): LinkModulo[] {
  return NAV[modulo].links.filter((l) =>
    l.gestor ? permissoes.podeEditarCadastros : l.minimo ? podeModulo(modulo, permissoes.pode, l.minimo) : true,
  );
}

/** O que uma tela exige além de abrir o módulo. `admin`: só o administrador da organização. */
export interface ExigenciaTela {
  minimo?: PapelApp;
  gestor?: boolean;
  admin?: boolean;
}

/**
 * Telas sem aba própria na barra que exigem mais do que abrir o módulo (as que têm aba usam `minimo`/`gestor` do NAV).
 * A Guarda aplica a regra também nas subpáginas.
 */
export const TELAS_RESTRITAS: Record<string, ExigenciaTela> = {
  "/clientes/importar": { gestor: true },
  "/demonstrativos/certificado": { admin: true },
};

/**
 * Exigência da rota atual: a de TELAS_RESTRITAS ou a da aba mais específica do módulo que contém a rota (a aba
 * "/demonstrativos/importar" vence a "/demonstrativos"). Sem exigência, devolve null (basta abrir o módulo).
 */
export function exigenciaDaRota(rota: string, modulo: Modulo): ExigenciaTela | null {
  const dentro = (href: string) => rota === href || rota.startsWith(href + "/");
  const extra = Object.keys(TELAS_RESTRITAS)
    .filter(dentro)
    .sort((a, b) => b.length - a.length)[0];
  if (extra) return TELAS_RESTRITAS[extra];
  const aba = NAV[modulo].links.filter((l) => linkAtivo(rota, l.href, modulo)).sort((a, b) => b.href.length - a.href.length)[0];
  if (!aba || (!aba.minimo && !aba.gestor)) return null;
  return { minimo: aba.minimo, gestor: aba.gestor };
}

/**
 * A pessoa pode abrir esta rota? Primeiro o módulo (alguma ferramenta que o libera), depois a exigência da tela.
 * Mesma regra das abas visíveis (filtrarLinks), aplicada pela Guarda a quem chega pelo endereço direto.
 */
export function podeAbrirRota(
  rota: string,
  modulo: Modulo,
  permissoes: { pode: (app: string, minimo?: PapelApp) => boolean; podeEditarCadastros: boolean; admin: boolean },
): boolean {
  if (modulo === "hub") return true;
  if (!podeModulo(modulo, permissoes.pode)) return false;
  const e = exigenciaDaRota(rota, modulo);
  if (!e) return true;
  if (e.admin && !permissoes.admin) return false;
  if (e.gestor && !permissoes.podeEditarCadastros) return false;
  if (e.minimo && !podeModulo(modulo, permissoes.pode, e.minimo)) return false;
  return true;
}

/** A aba está ativa na rota? A aba inicial do módulo (ex.: /financeiro) só vale na própria rota; as outras valem também nas subpáginas. */
export function linkAtivo(rota: string, href: string, modulo: Modulo): boolean {
  return rota === href || (href !== `/${modulo}` && rota.startsWith(href + "/"));
}

/** Entrada da barra do módulo: aba solta ou grupo (menu suspenso) com as abas dele. */
export type EntradaMenu = { tipo: "link"; link: LinkModulo } | { tipo: "grupo"; nome: string; links: LinkModulo[] };

/**
 * Monta a barra do módulo a partir das abas já filtradas: abas soltas na ordem em que aparecem, cada grupo no lugar
 * da sua primeira aba (ou na ordem de `grupos`, quando o módulo define). Grupo vazio some; grupo com uma aba só vira
 * aba solta com o nome do grupo (ex.: "Estoque" enquanto Pedidos não chega).
 */
export function agruparLinks(links: LinkModulo[], grupos: string[] = []): EntradaMenu[] {
  const porGrupo = new Map<string, LinkModulo[]>();
  for (const l of links) if (l.grupo) porGrupo.set(l.grupo, [...(porGrupo.get(l.grupo) ?? []), l]);
  const ordem = [...grupos.filter((g) => porGrupo.has(g)), ...[...porGrupo.keys()].filter((g) => !grupos.includes(g))];
  const entradaDoGrupo = (g: string): EntradaMenu => {
    const ls = porGrupo.get(g)!;
    return ls.length === 1 ? { tipo: "link", link: { ...ls[0], nome: g } } : { tipo: "grupo", nome: g, links: ls };
  };
  const saida: EntradaMenu[] = [];
  const postos = new Set<string>();
  for (const l of links) {
    if (!l.grupo) {
      saida.push({ tipo: "link", link: l });
      continue;
    }
    // ao achar a primeira aba de algum grupo, entram ali todos os grupos que vêm antes dele na ordem, e ele
    if (postos.has(l.grupo)) continue;
    for (const g of ordem.slice(0, ordem.indexOf(l.grupo) + 1)) {
      if (postos.has(g)) continue;
      postos.add(g);
      saida.push(entradaDoGrupo(g));
    }
  }
  return saida;
}

/** O módulo tem menus agrupados (barra com menus suspensos e, no celular, a lista em gaveta)? */
export const temGrupos = (modulo: Modulo) => NAV[modulo].links.some((l) => l.grupo);
