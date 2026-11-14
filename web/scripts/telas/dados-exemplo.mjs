// Dados fictícios devolvidos no lugar do Supabase durante a verificação de telas (scripts/verificar-telas.mjs).
// Cada tabela/visão é uma lista de linhas; cada RPC é uma função que recebe os argumentos e devolve o resultado.
// Ao criar uma tabela ou tela nova, acrescente aqui uma ou duas linhas de exemplo com as colunas que a tela usa.
import { readFileSync } from "node:fs";

const balancete = JSON.parse(readFileSync(new URL("./balancete-exemplo.json", import.meta.url), "utf8"));

export const ORG = "224d1feb-deb6-4fd1-a2c6-a63140d8426e";
export const EU = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const SETOR = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444441";
/** A própria MDC como cliente: a única empresa das telas de Gestão (organizacoes.gestao_cliente_id, 03/11/2026). */
const CM = "44444444-4444-4444-8444-444444444440";
const C2 = "44444444-4444-4444-8444-444444444442";

/** Ids usados nas rotas dinâmicas ([id]). A chave é a pasta da rota. */
export const IDS_EXEMPLO = {
  "comercial/[id]": "55555555-5555-4555-8555-555555555551",
  "demonstrativos/[id]": "66666666-6666-4666-8666-666666666661",
  "societario/[id]": "77777777-7777-4777-8777-777777777771",
};

const agora = new Date();
const dia = (n) => new Date(agora.getTime() + n * 864e5).toISOString().slice(0, 10);
const momento = (n) => new Date(agora.getTime() + n * 864e5).toISOString();

/**
 * Histórico do Financeiro para os gráficos do painel e os relatórios: 6 meses de vendas, aluguel e tarifas já
 * pagos/recebidos, e contas em aberto espalhadas pelos próximos 30 dias. Gera títulos e as baixas (id, título, dia, valor).
 */
const HISTORICO = (() => {
  const titulos = [];
  const baixas = [];
  const titulo = (k, tipo, categoria_id, descricao, d, valor, pago, centro) => {
    const id = `f8200000-0000-4000-8000-${String(k).padStart(12, "0")}`;
    titulos.push({
      id,
      org_id: ORG,
      cliente_id: CM,
      tipo,
      pessoa_id: tipo === "receber" ? "f5000000-0000-4000-8000-000000000002" : "f5000000-0000-4000-8000-000000000001",
      categoria_id,
      centro_id: centro ? "f6000000-0000-4000-8000-000000000001" : null,
      conta_prevista_id: "f2000000-0000-4000-8000-000000000001",
      descricao,
      documento: null,
      emissao: null,
      vencimento: dia(d),
      valor,
      valor_pago: pago ? valor : 0,
      parcela: 1,
      parcelas: 1,
      grupo: null,
      situacao: pago ? "quitado" : "aberto",
      quitado_em: pago ? dia(d) : null,
      cancelado_motivo: null,
      observacao: null,
    });
    if (pago) baixas.push([100 + k, id, d, valor]);
  };
  const VENDA = "f7000000-0000-4000-8000-000000000003";
  const ALUGUEL = "f7000000-0000-4000-8000-000000000002";
  const TARIFA = "f7000000-0000-4000-8000-000000000001";
  for (let m = 5; m >= 1; m--) {
    const base = -30 * m;
    titulo(m * 10 + 1, "receber", VENDA, `Vendas do mês (−${m})`, base + 5, 9000 + m * 850, true, true);
    titulo(m * 10 + 2, "pagar", ALUGUEL, `Aluguel (−${m})`, base + 10, 2500, true, true);
    titulo(m * 10 + 3, "pagar", TARIFA, `Tarifas (−${m})`, base + 12, 120 + m * 9, true, false);
    titulo(m * 10 + 4, "pagar", ALUGUEL, `Manutenção (−${m})`, base + 18, 1800 + (m % 3) * 1400, true, false);
  }
  titulo(91, "receber", VENDA, "Venda NF 1290", 0, 1850, false, true);
  titulo(92, "pagar", ALUGUEL, "Condomínio", 0, 640, false, true);
  titulo(93, "pagar", TARIFA, "Fornecedor de embalagens", 4, 3900, false, false);
  titulo(94, "receber", VENDA, "Venda NF 1301", 9, 7200, false, true);
  titulo(95, "pagar", ALUGUEL, "Folha de pagamento", 14, 11800, false, true);
  titulo(96, "receber", VENDA, "Venda NF 1315", 21, 6400, false, true);
  titulo(97, "pagar", TARIFA, "Impostos do mês", 19, 2350, false, false);
  return { titulos, baixas };
})();

export const USUARIO = { id: EU, email: "edvaldo@mdcassessoria.com", aud: "authenticated", role: "authenticated", user_metadata: {} };

// PESSOAL=1 abre as telas como uma família do MDC · Pessoal (075): marca, menu e telas do app da família.
const PESSOAL = Boolean(process.env.PESSOAL);
const org = {
  id: ORG,
  tipo: PESSOAL ? "pessoal" : "empresa",
  nome: PESSOAL ? "Família Carvalho" : "MDC Assessoria",
  slug: "mdc",
  cnpj: "48.140.121/0001-65",
  logo_url: null,
  cor_primaria: "#0B2820",
  cor_destaque: "#E2C17E",
  fuso: "America/Sao_Paulo",
  ativo: true,
  gestao_cliente_id: CM,
};

const APPS = [
  ["tarefas", "Tarefas", "Obrigações recorrentes e tarefas da equipe", "check", "/tarefas", false, 10],
  ["societario", "Societário", "Aberturas, alterações e baixas", "pasta", "/societario", false, 20],
  ["demonstrativos", "Demonstrativos", "Balancete, DRE, índices e parecer", "grafico", "/demonstrativos", false, 30],
  ["atendimento", "Atendimento", "Chat do Portal do Cliente", "chat", "/atendimento", false, 40],
  ["vencimentos", "Vencimentos", "Certificados, procurações e alvarás", "relogio", "/vencimentos", false, 50],
  ["financeiro", "Financeiro", "Bancos, extratos e conciliação", "moeda", "/financeiro", false, 35],
  ["estoque", "Estoque", "Itens, saldos e movimentações de estoque", "caixa", "/estoque", false, 38], // ícones iguais aos da produção (034)
  ["saidas", "Saídas", "Pedidos de venda", "enviar", "/saidas", false, 37],
  ["entradas", "Entradas", "Notas recebidas e compras", "importar", "/entradas", false, 36],
  ["comercial", "CRM Comercial", "Leads, proposta e contrato", "alvo", "/comercial", false, 80],
  ["licencas", "Cobrança Ledgra", "Mensalidades dos assinantes do Ledgra", "documento", "/licencas", false, 85],
  ["centros_custo", "Centros de custo", "Centros de custo da MDC", "etiqueta", "/centros-custo", false, 39],
  ["plano_contas", "Plano de contas", "Plano do Domínio e categorias", "lista", "/plano-contas", false, 40],
  ["relatorios", "Relatórios", "Relatórios gerenciais", "grafico", "/relatorios", false, 41],
].map(([slug, nome, descricao, icone, rota, externo, ordem]) => ({
  slug,
  nome,
  descricao,
  icone,
  rota,
  status: "ativo",
  externo,
  ordem,
  papel: "gerir",
}));

const cliente = (id, razao_social, nome_fantasia, cnpj, regime) => ({
  id,
  org_id: ORG,
  razao_social,
  nome_fantasia,
  cnpj,
  regime,
  ativo: true,
  codigo_dominio: "101",
  cidade: "Bragança Paulista",
  uf: "SP",
  cliente_desde: "2020-02-01",
  segmento: "comercio",
  grupos: ["Piloto HUB"],
});

const tarefa = (k, extra = {}) => ({
  id: `88888888-8888-4888-8888-${String(k).padStart(12, "0")}`,
  org_id: ORG,
  titulo: ["DCTFWeb — 09/2026", "EFD-Contribuições — 09/2026", "Folha de pagamento", "Conferir balancete"][k % 4],
  descricao: null,
  cliente_id: [C1, C2, null][k % 3],
  setor_id: SETOR,
  responsavel_id: EU,
  criado_por: EU,
  status: ["a_fazer", "em_andamento", "aguardando"][k % 3],
  prioridade: ["media", "alta", "urgente", "baixa"][k % 4],
  prazo: dia(k - 3),
  competencia: "2026-09-01",
  modelo_id: null,
  concluida_em: null,
  criado_em: momento(-10),
  atualizado_em: momento(-1),
  visivel_cliente: true,
  ...extra,
});

/** Multiplica os valores do movimento (DRE do mês, DFC) para os meses de exemplo não ficarem todos iguais. */
const escalar = (obj, f) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * f * 100) / 100 : v]));

const balanceteReg = (id, competencia, status, fator = 1, periodoInicio = competencia) => ({
  id,
  org_id: ORG,
  cliente_id: C1,
  competencia,
  status,
  arquivo_nome: "balancete.xlsx",
  resumo: { ...balancete.resumo, mes: escalar(balancete.resumo.mes, fator), disponivel: balancete.resumo.disponivel * (0.8 + fator / 5) },
  indices: balancete.indices,
  alertas: balancete.alertas,
  conferencias: balancete.conferencias,
  comentario: null,
  importado_em: momento(-5),
  publicado_em: status === "publicado" ? momento(-4) : null,
  demonstracoes: {
    ...balancete.demonstracoes,
    periodo: {
      inicio: periodoInicio,
      fim: competencia.slice(0, 8) + "28",
      dias: periodoInicio === competencia ? 30 : 365,
    },
    dfc: escalar(balancete.demonstracoes.dfc, fator),
  },
  periodo_inicio: periodoInicio,
  periodo_fim: competencia.slice(0, 8) + "28",
});

/**
 * Histórico do cliente C1 para a visão por período: 2024 com um balancete acumulado do ano inteiro (como MDC e
 * Greencore no banco), 2025 com os 12 meses e 2026 de janeiro a setembro (setembro é o balancete aberto na tela).
 */
const historicoBalancetes = [
  balanceteReg("66666666-6666-4666-8666-666666662412", "2024-12-01", "publicado", 12, "2024-01-01"),
  ...Array.from({ length: 12 }, (_, k) =>
    balanceteReg(
      `66666666-6666-4666-8666-6666666625${String(k + 1).padStart(2, "0")}`,
      `2025-${String(k + 1).padStart(2, "0")}-01`,
      "publicado",
      0.7 + (k % 5) / 10,
    ),
  ),
  ...Array.from({ length: 7 }, (_, k) =>
    balanceteReg(
      `66666666-6666-4666-8666-6666666626${String(k + 1).padStart(2, "0")}`,
      `2026-${String(k + 1).padStart(2, "0")}-01`,
      "publicado",
      0.9 + (k % 4) / 10,
    ),
  ),
];

const oportunidade = {
  id: IDS_EXEMPLO["comercial/[id]"],
  org_id: ORG,
  empresa: "Padaria Exemplo",
  razao_social: "PADARIA EXEMPLO LTDA",
  cnpj: "11.222.333/0001-81",
  contato_nome: "Maria",
  email: "maria@exemplo.com",
  whatsapp: "11999990000",
  cidade: "Atibaia",
  uf: "SP",
  atividade: "Padaria",
  regime_atual: "simples",
  faturamento: 50000,
  valor_mensal: 900,
  etapa: "proposta",
  etapa_desde: momento(-3),
  origem: "indicacao",
  origem_ref: null,
  dados_origem: null,
  responsavel_id: EU,
  cliente_id: null,
  proximo_contato: dia(2),
  observacoes: null,
  motivo_perda: null,
  motivo_arquivo: null,
  arquivado_em: null,
  arquivado_por: null,
  criado_em: momento(-20),
  criado_por: EU,
  atualizado_em: momento(-1),
};

/** Linhas por tabela/visão (o nome é o que vem depois de /rest/v1/). */

// ---------------------------------------------------------------- Licenças (031)
const mesRel = (n) => {
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + n, 1));
  return d.toISOString().slice(0, 10);
};
const LIC_PRODUTOS = [
  ["financeiro", "Financeiro", 120],
  ["entradas", "Entradas", 80],
  ["saidas", "Saídas", 80],
  ["estoque", "Estoque", 60],
  ["centros_custo", "Centros de custo", 30],
  ["plano_contas", "Plano de contas", 30],
  ["relatorios", "Relatórios", 50],
].map(([slug, nome, preco], i) => ({
  id: `99999999-9999-4999-8999-00000000000${i + 1}`,
  org_id: ORG,
  slug,
  nome,
  descricao: `Módulo ${nome}`,
  preco,
  ativo: true,
  ordem: (i + 1) * 10,
  criado_em: momento(-100),
}));
const LIC_PLANO = "99999999-9999-4999-8999-0000000000a1";
const LIC_K1 = "99999999-9999-4999-8999-0000000000b1";
const LIC_K2 = "99999999-9999-4999-8999-0000000000b2";
const licContrato = (id, cliente_id, plano_id, valor_tabela, valor_mensal, inicio) => ({
  id,
  org_id: ORG,
  cliente_id,
  plano_id,
  valor_tabela,
  valor_mensal,
  dia_vencimento: 10,
  inicio,
  fim: null,
  proporcional: false,
  reajuste_indice: "IPCA",
  reajuste_mes: Number(inicio.slice(5, 7)),
  ultimo_reajuste: null,
  situacao: "ativo",
  encerrado_em: null,
  encerrado_motivo: null,
  observacao: null,
  por: EU,
  criado_em: momento(-400),
});
const licCobranca = (k, contrato_id, cliente_id, n, valor, situacao) => ({
  id: `99999999-9999-4999-8999-0000000000c${k}`,
  org_id: ORG,
  cliente_id,
  contrato_id,
  competencia: mesRel(n),
  vencimento: mesRel(n).slice(0, 8) + "10",
  descricao: `Licença HUB ${mesRel(n).slice(5, 7)}/${mesRel(n).slice(0, 4)} · ${contrato_id === LIC_K1 ? "Plano Gestão completa" : "Financeiro"}`,
  valor,
  situacao,
  pago_em: situacao === "paga" ? mesRel(n).slice(0, 8) + "09" : null,
  valor_pago: situacao === "paga" ? valor : null,
  cancelada_em: null,
  cancelado_motivo: null,
  observacao: null,
  por: null,
  criado_em: momento(-30),
});

export const TABELAS = {
  organizacoes: [org],
  pessoal_convites: [
    {
      id: "c0750000-0000-4000-8000-000000000001",
      org_id: ORG,
      nome: "Evelyn",
      permissao: "lancar",
      criado_em: momento(-1),
      expira_em: momento(6),
      usado_por: null,
      usado_em: null,
      cancelado_em: null,
    },
    {
      id: "c0750000-0000-4000-8000-000000000002",
      org_id: ORG,
      nome: "Vó Lúcia",
      permissao: "consultar",
      criado_em: momento(-9),
      expira_em: momento(-2),
      usado_por: null,
      usado_em: null,
      cancelado_em: null,
    },
  ],
  membros: [
    {
      org_id: ORG,
      user_id: EU,
      nome: "Edvaldo Ribeiro de Carvalho",
      email: "edvaldo@mdcassessoria.com",
      papel: "admin",
      setor_id: SETOR,
      ativo: true,
      perfil_id: null,
    },
    {
      org_id: ORG,
      user_id: OUTRO,
      nome: "Analista Exemplo",
      email: "analista@exemplo.com",
      papel: "analista",
      setor_id: SETOR,
      ativo: true,
      perfil_id: null,
    },
  ],
  // papel timbrado do escritório (052): rodapé e responsabilidade técnica do PDF do Demonstrativo
  org_papel_timbrado: [
    {
      org_id: ORG,
      telefone: "(11) 98859-8041",
      site: "mdcassessoria.com",
      email: "edvaldo@mdcassessoria.com",
      instagram: "@mdcassessoria_",
      responsavel: "Edvaldo Ribeiro de Carvalho",
      crc: "1SP346098-O/0",
      atualizado_em: "2026-11-04T10:00:00-03:00",
      atualizado_por: null,
    },
  ],
  setores: [{ id: SETOR, org_id: ORG, nome: "Fiscal", cor: "#2a78d6", ordem: 1, ativo: true }],
  clientes: [
    cliente(CM, "MDC ASSESSORIA LTDA", "MDC Assessoria", "48.140.121/0001-65", "real"),
    cliente(C1, "GREENCORE INDUSTRIA LTDA", "Greencore", "12.345.678/0001-95", "real"),
    cliente(C2, "NEXUS GESTAO DE PESSOAS LTDA", "Nexus", "44.537.381/0001-18", "presumido"),
  ],
  cliente_responsaveis: [{ org_id: ORG, cliente_id: C1, setor_id: SETOR, user_id: EU }],
  tarefas: [
    ...Array.from({ length: 8 }, (_, k) => tarefa(k)),
    // concluídas (relatório de tarefas): no prazo, com atraso e sem prazo
    tarefa(8, { status: "concluida", prazo: dia(-2), concluida_em: momento(-2) }),
    tarefa(9, { status: "concluida", prazo: dia(-6), concluida_em: momento(-1), responsavel_id: OUTRO }),
    tarefa(10, { status: "concluida", prazo: null, concluida_em: momento(-1), responsavel_id: OUTRO }),
  ],
  comentarios: [],
  historico: [],
  modelos_recorrentes: [
    {
      id: "99999999-9999-4999-8999-999999999991",
      org_id: ORG,
      titulo: "DCTFWeb",
      descricao: null,
      setor_id: SETOR,
      prioridade: "alta",
      por_cliente: true,
      regimes: ["real", "presumido"],
      meses: null,
      dia_vencimento: 15,
      meses_apos_competencia: 1,
      ajuste: "antecipa",
      ativo: true,
      visivel_cliente: true,
      segmentos: null,
      grupos: null,
      criado_em: momento(-100),
    },
  ],
  feriados: [{ org_id: ORG, data: "2026-11-02", nome: "Finados" }],
  hub_notificacoes: [
    {
      id: "n1",
      org_id: ORG,
      user_id: EU,
      titulo: "Nova mensagem de Greencore",
      texto: "Pode revisar o balancete?",
      link: "/atendimento",
      lida_em: null,
      criado_em: momento(0),
    },
  ],
  hub_perfis: [{ id: "p1", org_id: ORG, nome: "Analista fiscal", apps: { tarefas: "operar", demonstrativos: "ver" } }],
  hub_acessos: [
    { org_id: ORG, user_id: OUTRO, app: "tarefas", papel: "operar", expira_em: null, liberado_em: momento(-30), liberado_por: EU },
  ],
  hub_auditoria: [
    {
      id: 1,
      org_id: ORG,
      user_id: EU,
      acao: "acesso_liberado",
      alvo: OUTRO,
      app: "tarefas",
      antes: null,
      depois: { papel: "operar" },
      em: momento(-2),
    },
  ],
  fin_plano_contas: [
    ["1", null, "ATIVO", false, 1],
    ["1.1", null, "ATIVO CIRCULANTE", false, 2],
    ["1.1.1", null, "DISPONÍVEL", false, 3],
    ["1.1.1.01", "5", "CAIXA GERAL", true, 4],
    ["1.1.1.02", "7", "BANCO ITAÚ CONTA MOVIMENTO", true, 4],
    ["3.1.1.01", "301", "VENDAS DE MERCADORIAS", true, 4],
    ["4.1.1.09", "455", "TARIFAS BANCÁRIAS", true, 4],
  ].map(([classificacao, codigo, descricao, analitica, nivel], k) => ({
    id: `f1000000-0000-4000-8000-00000000000${k}`,
    org_id: ORG,
    cliente_id: CM,
    classificacao,
    codigo,
    descricao,
    analitica,
    nivel,
    ativo: true,
    atualizado_em: momento(-5),
  })),
  fin_plano_importacoes: [
    { id: 1, org_id: ORG, cliente_id: CM, arquivo: "plano-greencore.xls", total: 7, novas: 7, inativadas: 0, por: EU, em: momento(-5) },
  ],
  fin_transferencias: [
    {
      id: 1,
      org_id: ORG,
      cliente_id: CM,
      origem_id: "f2000000-0000-4000-8000-000000000001",
      destino_id: "f2000000-0000-4000-8000-000000000002",
      data: dia(-6),
      valor: 3000,
      observacao: "Aplicação",
      estornada: false,
      estorno_motivo: null,
      por: EU,
      em: momento(-6),
    },
    {
      id: 2,
      org_id: ORG,
      cliente_id: CM,
      origem_id: "f2000000-0000-4000-8000-000000000002",
      destino_id: "f2000000-0000-4000-8000-000000000001",
      data: dia(1),
      valor: 800,
      observacao: null,
      estornada: false,
      estorno_motivo: null,
      por: EU,
      em: momento(0),
    },
    {
      id: 3,
      org_id: ORG,
      cliente_id: CM,
      origem_id: "f2000000-0000-4000-8000-000000000001",
      destino_id: "f2000000-0000-4000-8000-000000000002",
      data: dia(-20),
      valor: 50,
      observacao: "Lançada duas vezes",
      estornada: true,
      estorno_motivo: "duplicada",
      por: EU,
      em: momento(-20),
    },
  ],
  fin_contas_bancarias: [
    {
      id: "f2000000-0000-4000-8000-000000000002",
      org_id: ORG,
      cliente_id: CM,
      nome: "Sicoob aplicação",
      banco: "756 · Sicoob",
      agencia: "3001",
      numero: "12345-6",
      conta_contabil_id: "f1000000-0000-4000-8000-000000000003",
      saldo_inicial: 20000,
      saldo_inicial_em: dia(-60),
      ativo: true,
      criado_em: momento(-60),
    },

    {
      id: "f2000000-0000-4000-8000-000000000001",
      org_id: ORG,
      cliente_id: CM,
      nome: "Itaú movimento",
      banco: "341 · Itaú",
      agencia: "1234",
      numero: "56789-0",
      conta_contabil_id: "f1000000-0000-4000-8000-000000000004",
      saldo_inicial: 10000,
      saldo_inicial_em: dia(-40),
      ativo: true,
      criado_em: momento(-40),
    },
  ],
  fin_extrato_lotes: [
    {
      id: "f3000000-0000-4000-8000-000000000001",
      org_id: ORG,
      cliente_id: CM,
      conta_id: "f2000000-0000-4000-8000-000000000001",
      arquivo: "extrato-itau.ofx",
      formato: "ofx",
      inicio: dia(-10),
      fim: dia(0),
      saldo_final: 12350.5,
      recebidas: 4,
      novas: 4,
      repetidas: 0,
      por: EU,
      em: momento(-1),
    },
  ],
  fin_extrato_linhas: [
    [-3, 5000, "PIX RECEBIDO CLIENTE ABC", "123"],
    [-2, -1500, "PAGAMENTO FORNECEDOR XYZ", null],
    [-1, -149.5, "TARIFA PACOTE DE SERVIÇOS", null],
    [0, -1000, "PIX ENVIADO FOLHA", "456"],
  ].map(([d, valor, descricao, documento], k) => ({
    id: k + 1,
    org_id: ORG,
    cliente_id: CM,
    conta_id: "f2000000-0000-4000-8000-000000000001",
    lote_id: "f3000000-0000-4000-8000-000000000001",
    data: dia(d),
    valor,
    descricao,
    documento,
    situacao: k === 0 ? "conciliado" : "pendente",
  })),
  fin_pessoas: [
    ["f5000000-0000-4000-8000-000000000001", "fornecedor", "Imobiliária Centro Ltda", "11222333000181"],
    ["f5000000-0000-4000-8000-000000000002", "cliente", "Cliente ABC Comércio", "44537381000118"],
    ["f5000000-0000-4000-8000-000000000003", "ambos", "Maria da Silva", "52998224725"],
  ].map(([id, tipo, nome, documento]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    tipo,
    nome,
    documento,
    email: null,
    telefone: "(11) 4033-0000",
    cidade: "Bragança Paulista",
    uf: "SP",
    observacao: null,
    ativo: true,
    criado_em: momento(-20),
  })),
  fin_centros_custo: [
    { id: "f6000000-0000-4000-8000-000000000001", org_id: ORG, cliente_id: CM, codigo: "01", nome: "Administrativo", ativo: true },
  ],
  fin_categorias: [
    [
      "f7000000-0000-4000-8000-000000000001",
      "despesa",
      "Tarifas bancárias",
      "Despesas financeiras",
      "f1000000-0000-4000-8000-000000000006",
    ],
    ["f7000000-0000-4000-8000-000000000002", "despesa", "Aluguel", "Despesas administrativas", "f1000000-0000-4000-8000-000000000006"],
    ["f7000000-0000-4000-8000-000000000003", "receita", "Venda de mercadorias", "Receitas", "f1000000-0000-4000-8000-000000000005"],
  ].map(([id, tipo, nome, grupo, conta_contabil_id]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    tipo,
    nome,
    grupo,
    conta_contabil_id,
    ativo: true,
  })),
  fin_titulos: [
    [
      "f8000000-0000-4000-8000-000000000001",
      "pagar",
      "f5000000-0000-4000-8000-000000000001",
      "f7000000-0000-4000-8000-000000000002",
      "Aluguel (1/3)",
      -5,
      2500,
      0,
      "aberto",
      1,
      3,
    ],
    [
      "f8000000-0000-4000-8000-000000000002",
      "pagar",
      "f5000000-0000-4000-8000-000000000001",
      "f7000000-0000-4000-8000-000000000002",
      "Aluguel (2/3)",
      25,
      2500,
      0,
      "aberto",
      2,
      3,
    ],
    [
      "f8000000-0000-4000-8000-000000000003",
      "pagar",
      null,
      "f7000000-0000-4000-8000-000000000001",
      "Tarifa do mês",
      -2,
      149.5,
      149.5,
      "quitado",
      1,
      1,
    ],
    [
      "f8000000-0000-4000-8000-000000000004",
      "receber",
      "f5000000-0000-4000-8000-000000000002",
      "f7000000-0000-4000-8000-000000000003",
      "Venda NF 1234",
      3,
      5000,
      2000,
      "aberto",
      1,
      1,
    ],
    [
      "f8000000-0000-4000-8000-000000000005",
      "receber",
      "f5000000-0000-4000-8000-000000000003",
      "f7000000-0000-4000-8000-000000000003",
      "Venda balcão",
      -1,
      300,
      300,
      "quitado",
      1,
      1,
    ],
  ]
    .map(([id, tipo, pessoa_id, categoria_id, descricao, d, valor, valor_pago, situacao, parcela, parcelas]) => ({
      id,
      org_id: ORG,
      cliente_id: CM,
      tipo,
      pessoa_id,
      categoria_id,
      centro_id: null,
      conta_prevista_id: "f2000000-0000-4000-8000-000000000001",
      descricao,
      documento: null,
      emissao: null,
      vencimento: dia(d),
      valor,
      valor_pago,
      parcela,
      parcelas,
      grupo: parcelas > 1 ? "f8100000-0000-4000-8000-000000000001" : null,
      situacao,
      quitado_em: situacao === "quitado" ? dia(d) : null,
      cancelado_motivo: null,
      observacao: null,
    }))
    .concat(HISTORICO.titulos),
  fin_baixas: [
    [1, "f8000000-0000-4000-8000-000000000003", -2, 149.5],
    [2, "f8000000-0000-4000-8000-000000000004", -1, 2000],
    [3, "f8000000-0000-4000-8000-000000000005", -1, 300],
    ...HISTORICO.baixas,
  ].map(([id, titulo_id, d, valor]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    titulo_id,
    conta_id: "f2000000-0000-4000-8000-000000000001",
    data: dia(d),
    valor,
    juros: 0,
    multa: 0,
    desconto: 0,
    total: valor,
    forma: "Pix",
    observacao: null,
    extrato_linha_id: null,
    estornada: false,
    estorno_motivo: null,
  })),
  est_itens: [
    ["f9000000-0000-4000-8000-000000000001", "P001", "Parafuso sextavado 10mm", "produto", "UN", true, 50, 0.35, 0.9],
    ["f9000000-0000-4000-8000-000000000002", "P002", "Tinta acrílica 18L", "produto", "UN", true, 5, 180, 299],
    ["f9000000-0000-4000-8000-000000000003", "S001", "Instalação", "servico", "H", false, 0, null, 120],
  ].map(([id, codigo, nome, tipo, unidade, controla_estoque, estoque_minimo, custo, preco_venda]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    codigo,
    nome,
    tipo,
    unidade,
    controla_estoque,
    estoque_minimo,
    custo,
    preco_venda,
    ncm: null,
    codigo_barras: null,
    categoria_receita_id: null,
    categoria_despesa_id: null,
    observacao: null,
    ativo: true,
    grupo_id: tipo === "servico" ? null : "fb000000-0000-4000-8000-000000000001",
    marca: codigo === "P001" ? "Ciser" : null,
    unidade_compra: codigo === "P001" ? "CX" : null,
    fator_compra: codigo === "P001" ? 100 : 1,
    custo_medio: custo,
    markup: codigo === "P001" ? 150 : null,
    foto_caminho: null,
  })),
  est_grupos: [{ id: "fb000000-0000-4000-8000-000000000001", org_id: ORG, cliente_id: CM, nome: "Ferragens", ativo: true }],
  est_pedidos: [
    ["fc000000-0000-4000-8000-000000000001", "venda", 1, "f5000000-0000-4000-8000-000000000002", -3, 182, "faturado", "NF 1234"],
    ["fc000000-0000-4000-8000-000000000002", "venda", 2, "f5000000-0000-4000-8000-000000000003", 0, 299, "rascunho", null],
    ["fc000000-0000-4000-8000-000000000003", "compra", 1, "f5000000-0000-4000-8000-000000000001", -4, 140, "recebido", "NF 555"],
    ["fc000000-0000-4000-8000-000000000004", "compra", 2, "f5000000-0000-4000-8000-000000000001", -1, 540, "confirmado", null],
  ].map(([id, tipo, numero, pessoa_id, d, total, situacao, documento]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    tipo,
    numero,
    pessoa_id,
    data: dia(d),
    previsao: situacao === "confirmado" ? dia(5) : null,
    local_id: "fa000000-0000-4000-8000-000000000001",
    categoria_id: tipo === "venda" ? "f7000000-0000-4000-8000-000000000003" : "f7000000-0000-4000-8000-000000000002",
    centro_id: null,
    total_itens: total,
    desconto: 0,
    frete: 0,
    total,
    condicao: "30 dias",
    forma_pagamento: "Boleto",
    parcelas: [{ numero: 1, vencimento: dia(d + 30), valor: total }],
    documento,
    observacao: null,
    situacao,
    lancado_em: ["faturado", "recebido"].includes(situacao) ? momento(d) : null,
    cancelado_em: null,
    cancelado_motivo: null,
    criado_em: momento(d),
  })),
  est_pedido_itens: [
    [1, "fc000000-0000-4000-8000-000000000001", "f9000000-0000-4000-8000-000000000001", "Parafuso sextavado 10mm", 80, 0.9, 72, 0.35, 2],
    [2, "fc000000-0000-4000-8000-000000000001", "f9000000-0000-4000-8000-000000000003", "Instalação", 0.917, 120, 110, null, null],
    [3, "fc000000-0000-4000-8000-000000000002", "f9000000-0000-4000-8000-000000000002", "Tinta acrílica 18L", 1, 299, 299, null, null],
    [4, "fc000000-0000-4000-8000-000000000003", "f9000000-0000-4000-8000-000000000002", "Tinta acrílica 18L", 1, 140, 140, 140, 3],
    [5, "fc000000-0000-4000-8000-000000000004", "f9000000-0000-4000-8000-000000000002", "Tinta acrílica 18L", 3, 180, 540, null, null],
  ].map(([id, pedido_id, item_id, descricao, quantidade, preco_unitario, total, custo_unitario, movimento_id], k) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    pedido_id,
    ordem: k + 1,
    item_id,
    descricao,
    unidade: item_id.endsWith("3") ? "H" : "UN",
    fator: 1,
    quantidade,
    preco_unitario,
    desconto: 0,
    total,
    custo_unitario,
    movimento_id,
    removido: false,
  })),
  est_pedido_titulos: [
    { titulo_id: "f8000000-0000-4000-8000-000000000004", pedido_id: "fc000000-0000-4000-8000-000000000001", org_id: ORG, cliente_id: CM },
  ],
  est_locais: [
    { id: "fa000000-0000-4000-8000-000000000001", org_id: ORG, cliente_id: CM, nome: "Depósito principal", padrao: true, ativo: true },
    { id: "fa000000-0000-4000-8000-000000000002", org_id: ORG, cliente_id: CM, nome: "Loja", padrao: false, ativo: true },
  ],
  est_parametros: [{ cliente_id: CM, org_id: ORG, permite_negativo: false }],
  est_saldos: [
    {
      cliente_id: CM,
      item_id: "f9000000-0000-4000-8000-000000000001",
      local_id: "fa000000-0000-4000-8000-000000000001",
      saldo: 320,
      ultimo_movimento: dia(-1),
    },
    {
      cliente_id: CM,
      item_id: "f9000000-0000-4000-8000-000000000002",
      local_id: "fa000000-0000-4000-8000-000000000001",
      saldo: 3,
      ultimo_movimento: dia(-2),
    },
  ],
  est_movimentos: [
    [1, "f9000000-0000-4000-8000-000000000001", -3, "entrada", 400, 0.35],
    [2, "f9000000-0000-4000-8000-000000000001", -1, "saida", -80, null],
    [3, "f9000000-0000-4000-8000-000000000002", -2, "entrada", 3, 180],
  ].map(([id, item_id, d, tipo, quantidade, custo_unitario]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    item_id,
    local_id: "fa000000-0000-4000-8000-000000000001",
    data: dia(d),
    tipo,
    quantidade,
    custo_unitario,
    origem: "manual",
    origem_id: null,
    grupo: null,
    observacao: null,
    estornado: false,
    estorno_motivo: null,
    saldo_apos: id === 1 ? 400 : id === 2 ? 320 : 3,
    custo_medio_apos: id === 3 ? 180 : 0.35,
  })),
  hub_arquivos: [
    {
      id: "5a000000-0000-4000-8000-0000000000a1",
      org_id: ORG,
      app: "societario",
      ref_id: IDS_EXEMPLO["societario/[id]"],
      cliente_id: C1,
      nome: "4a-alteracao-registrada.pdf",
      caminho: `${ORG}/societario/${IDS_EXEMPLO["societario/[id]"]}/4a-alteracao-registrada.pdf`,
      tamanho: 210_000,
      tipo: "application/pdf",
      visivel_cliente: false,
      enviado_por: EU,
      enviado_em: momento(-1),
      retirado_em: null,
    },
  ],
  hub_certificados: [],
  portal_usuarios: [
    {
      org_id: ORG,
      cliente_id: C1,
      user_id: OUTRO,
      nome: "Cliente Exemplo",
      email: "cliente@exemplo.com",
      permissoes: ["tarefas", "demonstrativos"],
      ativo: true,
      criado_em: momento(-30),
    },
  ],
  portal_convites: [],
  portal_conversas: [
    {
      id: "cv1",
      org_id: ORG,
      cliente_id: C1,
      titulo: "Dúvida sobre o balancete",
      assunto: "duvida",
      status: "novo",
      aberto_por: OUTRO,
      responsavel_id: EU,
      setor_id: SETOR,
      processo_id: null,
      tarefa_id: null,
      prazo_resposta: momento(1),
      respondida_em: null,
      resolvida_em: null,
      avaliacao: null,
      criado_em: momento(-1),
      atualizado_em: momento(0),
    },
    {
      id: "cv2",
      org_id: ORG,
      cliente_id: C2,
      titulo: "Admissão da Maria em 10/11",
      assunto: "admissao_demissao",
      status: "aguardando_cliente",
      aberto_por: OUTRO,
      responsavel_id: EU,
      setor_id: SETOR,
      processo_id: null,
      tarefa_id: null,
      prazo_resposta: momento(-1),
      respondida_em: null,
      resolvida_em: null,
      avaliacao: null,
      criado_em: momento(-3),
      atualizado_em: momento(-2),
    },
  ],
  // histórico de importações de balancete (Demonstrativos › Histórico de importações)
  hub_importacoes: [
    {
      id: 1,
      org_id: ORG,
      origem: "lote",
      arquivo: "balancete_greencore_09.xlsx",
      cliente_id: C1,
      competencia: "2026-09-01",
      balancete_id: IDS_EXEMPLO["demonstrativos/[id]"],
      resultado: "importado",
      motivo: null,
      em: momento(-2),
    },
    {
      id: 2,
      org_id: ORG,
      origem: "pasta",
      arquivo: "Balancete 08-2026 padaria.xlsx",
      cliente_id: C2,
      competencia: "2026-08-01",
      balancete_id: null,
      resultado: "revisar",
      motivo: "Contas sem grupo: confira a classificação antes de publicar.",
      em: momento(-3),
    },
    {
      id: 3,
      org_id: ORG,
      origem: "arquivo",
      arquivo: "planilha_qualquer.xlsx",
      cliente_id: null,
      competencia: null,
      balancete_id: null,
      resultado: "erro",
      motivo: "Não parece um balancete do Domínio (faltam as colunas de saldo).",
      em: momento(-4),
    },
  ],
  portal_mensagens: [
    {
      id: "m1",
      org_id: ORG,
      conversa_id: "cv1",
      autor_id: OUTRO,
      autor_nome: "Cliente Exemplo",
      autor_tipo: "cliente",
      texto: "Pode revisar o balancete?",
      interna: false,
      anexo_id: null,
      criado_em: momento(-1),
    },
  ],
  portal_balancetes: [
    ...historicoBalancetes,
    balanceteReg("66666666-6666-4666-8666-666666666660", "2026-08-01", "rascunho", 1.1),
    balanceteReg(IDS_EXEMPLO["demonstrativos/[id]"], "2026-09-01", "publicado"),
  ],
  portal_balancete_linhas: balancete.linhas.map((l, i) => ({ ...l, id: i + 1, balancete_id: IDS_EXEMPLO["demonstrativos/[id]"] })),
  portal_pareceres: [
    {
      id: "pa1",
      org_id: ORG,
      cliente_id: C1,
      balancete_id: IDS_EXEMPLO["demonstrativos/[id]"],
      versao: 1,
      status: "rascunho",
      texto: "# Parecer\n\nTexto de **exemplo**.",
      contador_nome: "Edvaldo Ribeiro de Carvalho",
      contador_crc: "1SP346098-O/0",
      publicado_em: null,
      criado_em: momento(-1),
      criado_por: EU,
    },
  ],
  portal_mapa_contas: [],
  portal_mapa_dfc: [],
  soc_tipos: [
    {
      id: "t1",
      org_id: ORG,
      codigo: "alteracao",
      nome: "Alteração contratual",
      ordem: 1,
      ativo: true,
      fases: [{ codigo: "viabilidade", nome: "Viabilidade", prazo_dias: 5 }],
    },
  ],
  soc_processos: [
    {
      id: IDS_EXEMPLO["societario/[id]"],
      org_id: ORG,
      numero: 12,
      tipo_id: "t1",
      cliente_id: C1,
      futuro_cliente: null,
      cnpj: "12.345.678/0001-95",
      uf: "SP",
      descricao: "Alteração de endereço",
      status: "aberto",
      fase_atual: 1,
      exigencias: 0,
      responsavel_id: EU,
      pedido_em: dia(-10),
      previsao_em: dia(20),
      concluido_em: null,
      visivel_cliente: true,
      criado_em: momento(-10),
      criado_por: EU,
      atualizado_em: momento(-1),
    },
  ],
  soc_fases: [
    {
      id: "f1",
      org_id: ORG,
      processo_id: IDS_EXEMPLO["societario/[id]"],
      codigo: "viabilidade",
      nome: "Viabilidade",
      ordem: 1,
      status: "em_andamento",
      responsavel_id: EU,
      inicio_em: dia(-10),
      fim_em: null,
      prazo_dias: 5,
      prazo_em: dia(-5),
      mudou_em: momento(-10),
      tarefa_id: null,
    },
  ],
  soc_protocolos: [],
  soc_exigencias: [],
  soc_taxas: [],
  soc_eventos: [],
  // acervo societário do cliente (073): o arquivo vem junto, como o select com hub_arquivos devolve
  soc_documentos: [
    ["d1", "contrato_social", "Contrato social de constituição", dia(-2900), "NIRE 35234567890", false, "contrato-social-2018.pdf"],
    ["d2", "alteracao_contratual", "3ª alteração – entrada de sócio", dia(-200), "Arq. 412.556/25-1", true, "3a-alteracao.pdf"],
    ["d3", "cartao_cnpj", null, dia(-30), null, true, "cartao-cnpj.pdf"],
    ["d4", "documento_socio", "RG e CPF – Maria Souza", null, null, true, "rg-maria.pdf"],
    ["d5", "alvara", "Alvará de funcionamento 2026", dia(-90), null, true, "alvara-2026.pdf"],
  ].map(([id, categoria, descricao, data_documento, registro, vigente, nome]) => ({
    id: `5d000000-0000-4000-8000-00000000000${id.slice(1)}`,
    org_id: ORG,
    cliente_id: C1,
    arquivo_id: `5a000000-0000-4000-8000-00000000000${id.slice(1)}`,
    categoria,
    descricao,
    data_documento,
    registro,
    processo_id: null,
    vigente,
    substituido_por: null,
    substituido_em: null,
    retirado_em: null,
    criado_em: momento(-5),
    arquivo: {
      id: `5a000000-0000-4000-8000-00000000000${id.slice(1)}`,
      nome,
      caminho: `${ORG}/societario/${C1}/${nome}`,
      tamanho: 120000,
      tipo: "application/pdf",
    },
    processo: null,
  })),
  venc_itens: [
    {
      id: "v1",
      org_id: ORG,
      cliente_id: C1,
      tipo: "certificado",
      descricao: "Certificado A1",
      vence_em: dia(12),
      status: "ativo",
      avisos: [30, 15, 5],
      responsavel_id: EU,
      observacao: null,
      substituido_por: null,
      tarefa_id: null,
      visivel_cliente: true,
      criado_em: momento(-300),
      criado_por: EU,
    },
  ],
  crm_oportunidades: [oportunidade],
  crm_atividades: [
    {
      id: "a1",
      org_id: ORG,
      oportunidade_id: oportunidade.id,
      tipo: "nota",
      texto: "Primeiro contato",
      quando: null,
      concluida: false,
      autor_id: EU,
      criado_em: momento(-2),
    },
  ],
  crm_contratos: [
    {
      id: "k1",
      org_id: ORG,
      oportunidade_id: oportunidade.id,
      numero: "2026/001",
      status: "rascunho",
      texto: "Contrato de exemplo",
      valores: {
        razao_social: "PADARIA EXEMPLO LTDA",
        cnpj: "11.222.333/0001-81",
        endereco: "Rua Exemplo, 100",
        cidade_uf: "Atibaia/SP",
        representante: "Maria",
        representante_qualificacao: "sócia administradora",
        honorario_mensal: 900,
        vencimento_dia: 10,
        inicio: dia(10),
        funcionarios_incluidos: 3,
        valor_funcionario_adicional: 60,
        taxa_implantacao: 0,
        parcelas_implantacao: 1,
        decimo_terceiro: true,
        reajuste_indice: "IPCA",
        vigencia: "12 meses",
        aviso_previo: 30,
        prazo_documentos: 5,
        servicos: ["Escrituração contábil e elaboração do balancete mensal"],
        cidade_assinatura: "Bragança Paulista",
        data_assinatura: dia(0),
      },
      modelo_id: "mo1",
      modelo_versao: 1,
      enviado_em: null,
      assinado_em: null,
      criado_em: momento(-1),
      criado_por: EU,
    },
  ],
  crm_modelos: [
    {
      id: "mo1",
      org_id: ORG,
      nome: "Contrato padrão",
      texto: "CONTRATO {{empresa}}",
      versao: 1,
      ativo: true,
      atualizado_em: momento(-50),
      atualizado_por: EU,
    },
  ],
  lic_produtos: LIC_PRODUTOS,
  lic_planos: [
    {
      id: LIC_PLANO,
      org_id: ORG,
      nome: "Gestão completa",
      descricao: "Todos os módulos de gestão",
      preco: 390,
      ativo: true,
      criado_em: momento(-100),
    },
  ],
  lic_plano_produtos: LIC_PRODUTOS.map((p) => ({ plano_id: LIC_PLANO, produto_id: p.id, org_id: ORG })),
  lic_contratos: [licContrato(LIC_K1, C1, LIC_PLANO, 390, 350, mesRel(-14)), licContrato(LIC_K2, C2, null, 120, 120, mesRel(-5))],
  lic_contrato_produtos: [
    ...LIC_PRODUTOS.map((p) => ({ contrato_id: LIC_K1, produto_id: p.id, org_id: ORG })),
    { contrato_id: LIC_K2, produto_id: LIC_PRODUTOS[0].id, org_id: ORG },
  ],
  lic_cobrancas: [
    licCobranca(1, LIC_K1, C1, -1, 350, "paga"),
    licCobranca(2, LIC_K1, C1, 0, 350, "aberta"),
    licCobranca(3, LIC_K2, C2, -2, 120, "aberta"),
    licCobranca(4, LIC_K2, C2, -1, 120, "aberta"),
    licCobranca(5, LIC_K2, C2, 0, 120, "aberta"),
  ],
  // Ledgra Link (043): ligado na organização; a mensalidade 2 (em aberto) já tem boleto/Pix emitido
  link_config: [
    {
      org_id: ORG,
      ativo: true,
      conta_link_id: "7c1e2a90-3b4d-4e5f-8a6b-1c2d3e4f5a6b",
      tipo_padrao: "boleto_hibrido",
      multa_percentual: 2,
      juros_mensal_percentual: 1,
      dias_apos_vencimento: 30,
    },
  ],
  link_cobrancas: [
    {
      lic_cobranca_id: "99999999-9999-4999-8999-0000000000c2",
      tipo: "boleto_hibrido",
      situacao: "registrada",
      linha_digitavel: "03399.12345 67890.123456 78901.234567 8 12340000035000",
      pix_copia_cola: "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540535.005802BR6304ABCD",
      emitida_em: mesRel(0) + "T10:00:00Z",
    },
  ],
  lic_baixas: [
    {
      id: 1,
      org_id: ORG,
      cliente_id: C1,
      cobranca_id: "99999999-9999-4999-8999-0000000000c1",
      data: mesRel(-1).slice(0, 8) + "09",
      valor: 350,
      juros: 0,
      desconto: 0,
      total: 350,
      forma: "Pix",
      observacao: null,
      estornada: false,
      estornada_em: null,
      estorno_motivo: null,
      por: EU,
      em: momento(-20),
    },
  ],
  lic_reajustes: [],
  lic_bloqueios: [
    {
      id: 1,
      org_id: ORG,
      cliente_id: C2,
      bloqueado_em: momento(-3),
      bloqueado_por: EU,
      motivo: "Inadimplência: 2 meses",
      desbloqueado_em: null,
      desbloqueado_por: null,
      motivo_desbloqueio: null,
    },
  ],
  lic_parametros: [{ org_id: ORG, dias_sugerir_bloqueio: 30, ultimo_aviso: null, atualizado_em: momento(-1) }],
  vw_painel_kpis: [
    {
      org_id: ORG,
      abertas: 26,
      atrasadas: 3,
      vencem_hoje: 2,
      proximos_7_dias: 9,
      em_andamento: 5,
      concluidas_hoje: 4,
      concluidas_mes: 70,
      pct_no_prazo_mes: 92,
    },
  ],
  // ---------------------------------------------------------------- notas fiscais de entrada (migração 032)
  fis_notas: [
    ["fb000000-0000-4000-8000-000000000001", "55", "resumo", "1201", -3, 1890.4, null, false, null],
    ["fb000000-0000-4000-8000-000000000002", "55", "completa", "1188", -12, 635, "confirmada", false, null],
    ["fb000000-0000-4000-8000-000000000003", "55", "completa", "1150", -82, 2310.75, "ciencia", false, null],
    ["fb000000-0000-4000-8000-000000000004", "nfse", "completa", "52", -20, 2000, null, true, "servico"],
    ["fb000000-0000-4000-8000-000000000005", "55", "resumo", "1199", -5, 412.3, null, false, null],
  ].map(([id, modelo, conteudo, numero, d, valor, manifestacao, processada, tipo_entrada], k) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    direcao: "entrada",
    modelo,
    chave:
      modelo === "nfse" ? "35034012112223330001810000000000000526100000000001" : `352610112223330001815500100000${numero}112345678${k}`,
    conteudo,
    numero,
    serie: "1",
    emissao: momento(d),
    autorizacao: momento(d),
    protocolo: "135260000000001",
    situacao: k === 4 ? "cancelada" : "autorizada",
    natureza: "Venda de mercadoria",
    emitente_doc: "11222333000181",
    emitente_nome: modelo === "nfse" ? "Consultoria Exemplo Ltda" : "Distribuidora Exemplo Ltda",
    emitente_uf: "SP",
    destinatario_doc: "48140121000165",
    valor_total: valor,
    valor_produtos: valor,
    valor_frete: 0,
    valor_desconto: 0,
    icms_valor: modelo === "nfse" ? 0 : Math.round(valor * 0.18 * 100) / 100,
    icms_st_valor: 0,
    ipi_valor: modelo === "nfse" ? 0 : 25,
    pis_valor: modelo === "nfse" ? 13 : 8.25,
    cofins_valor: modelo === "nfse" ? 60 : 38,
    iss_valor: modelo === "nfse" ? 40 : 0,
    iss_retido: false,
    ibs_valor: 0.5,
    cbs_valor: 4.5,
    retencoes: modelo === "nfse" ? 143 : 0,
    cfop_principal: modelo === "nfse" ? null : "5102",
    duplicatas:
      k === 1
        ? [
            { numero: "001", vencimento: dia(18), valor: 317.5 },
            { numero: "002", vencimento: dia(48), valor: 317.5 },
          ]
        : [],
    manifestacao,
    manifestacao_em: manifestacao ? momento(d + 1) : null,
    manifestacao_protocolo: manifestacao ? "891260000000123" : null,
    xml_caminho: `${ORG}/${CM}/nfe/2026/10/${numero}.xml`,
    origem: modelo === "nfse" ? "adn" : "dfe",
    tipo_entrada,
    processada,
    processada_em: processada ? momento(-1) : null,
    data_entrada: processada ? dia(-1) : null,
    pessoa_id: null,
    titulos: [],
  })),
  fis_nota_itens: [
    [
      1,
      "fb000000-0000-4000-8000-000000000002",
      1,
      "ABC-1",
      "Parafuso sextavado (cx 100)",
      "73181500",
      "5102",
      "CX",
      10,
      500,
      91.8,
      25,
      "01",
      8.25,
      38,
    ],
    [2, "fb000000-0000-4000-8000-000000000002", 2, "XYZ-9", "Óleo lubrificante 1L", "27101932", "5405", "UN", 4, 100, 0, 0, "04", 0, 0],
    [
      3,
      "fb000000-0000-4000-8000-000000000003",
      1,
      "TIN-18",
      "Tinta acrílica 18L",
      "32091010",
      "6102",
      "UN",
      10,
      2310.75,
      277.29,
      0,
      "01",
      38.13,
      175.62,
    ],
    [4, "fb000000-0000-4000-8000-000000000004", 1, "170101", "Assessoria em gestão", null, null, "UN", 1, 2000, 0, 0, "01", 13, 60],
  ].map(
    ([
      id,
      nota_id,
      numero,
      codigo,
      descricao,
      ncm,
      cfop,
      unidade,
      quantidade,
      valor_total,
      icms_valor,
      ipi_valor,
      pis_cst,
      pis_valor,
      cofins_valor,
    ]) => ({
      id,
      nota_id,
      numero,
      codigo,
      descricao,
      ncm,
      cfop,
      unidade,
      quantidade,
      valor_unitario: valor_total / quantidade,
      valor_total,
      desconto: 0,
      frete: 0,
      seguro: 0,
      outros: 0,
      icms_cst: "00",
      icms_valor,
      icms_st_valor: 0,
      ipi_valor,
      pis_cst,
      pis_valor,
      cofins_cst: pis_cst,
      cofins_valor,
      ibs_valor: 0,
      cbs_valor: 0,
      item_id: null,
      fator: 1,
    }),
  ),
  fis_eventos: [
    {
      id: 1,
      nota_id: "fb000000-0000-4000-8000-000000000002",
      chave: "35261011222333000181550010000001188112345678" + "1",
      tp_evento: "210200",
      descricao: "Confirmação da operação",
      sequencia: 1,
      justificativa: null,
      cstat: "135",
      motivo: "Evento registrado e vinculado a NF-e",
      protocolo: "891260000000123",
      registrado_em: momento(-11),
      origem: "hub",
      em: momento(-11),
    },
  ],
  fis_dfe_controle: ["nfe", "nfse"].map((fonte) => ({
    cliente_id: CM,
    fonte,
    ult_nsu: fonte === "nfe" ? 1532 : 44,
    proxima_consulta_em: momento(0.03),
    bloqueado_ate: null,
    ultima_consulta_em: momento(-0.01),
    ultimo_cstat: fonte === "nfe" ? "137" : "NENHUM_DOCUMENTO_LOCALIZADO",
    // NF-e com o erro de conexão real visto em 03/11/2026: a tela traduz para o leigo e guarda o técnico em "Ver detalhes"
    ultimo_erro:
      fonte === "nfe"
        ? "Não foi possível falar com a SEFAZ (error sending request from 10.32.144.135:60946 for https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx (www1.nfe.fazenda.gov.br): client error (SendRequest): connection error: Connection reset by peer (os error 104)). Confira se o certificado é ICP-Brasil e válido."
        : null,
    documentos_recebidos: fonte === "nfe" ? 120 : 8,
  })),
  fis_certificados: [
    {
      cliente_id: CM,
      titular: "MDC ASSESSORIA LTDA",
      cnpj: "48140121000165",
      emissor: "AC SOLUTI Multipla v5",
      icp_brasil: true,
      valido_de: momento(-200),
      valido_ate: momento(165),
      enviado_em: momento(-200),
    },
  ],
  fis_parametros: [
    {
      cliente_id: CM,
      org_id: ORG,
      ambiente: "producao",
      captura_ativa: true,
      ciencia_automatica: true,
      contribuinte_icms: true,
      contribuinte_ipi: false,
    },
  ],
  fis_tipos_entrada: [
    ["revenda", "Compra para revenda", true, true],
    ["materia_prima", "Matéria-prima / industrialização", true, true],
    ["uso_consumo", "Uso e consumo", false, true],
    ["imobilizado", "Ativo imobilizado", false, true],
    ["servico", "Serviço tomado", false, true],
    ["devolucao_venda", "Devolução de venda", true, false],
    ["remessa", "Remessa, retorno ou bonificação", false, false],
  ].map(([codigo, nome, movimenta_estoque, gera_pagar], k) => ({
    id: `fc000000-0000-4000-8000-00000000000${k + 1}`,
    org_id: null,
    cliente_id: null,
    codigo,
    nome,
    explicacao: null,
    movimenta_estoque,
    gera_pagar,
    categoria_id: null,
    ativo: true,
  })),
  fis_regras_credito: [
    [
      "real",
      "icms",
      "destacado",
      null,
      null,
      ["revenda", "materia_prima", "devolucao_venda"],
      "contribuinte_icms",
      "LC 87/1996, arts. 19, 20 e 33",
      "1996-11-01",
    ],
    ["real", "ipi", "destacado", null, null, ["materia_prima"], "contribuinte_ipi", "Decreto 7.212/2010 (RIPI), art. 226", "2010-06-16"],
    [
      "real",
      "pis",
      "aliquota",
      1.65,
      "item_sem_icms",
      ["revenda", "materia_prima", "servico", "devolucao_venda"],
      null,
      "Lei 10.637/2002, art. 3º",
      "2023-05-30",
    ],
    [
      "real",
      "cofins",
      "aliquota",
      7.6,
      "item_sem_icms",
      ["revenda", "materia_prima", "servico", "devolucao_venda"],
      null,
      "Lei 10.833/2003, art. 3º",
      "2023-05-30",
    ],
    ["presumido", "pis", "nenhum", null, null, null, null, "Lei 9.718/1998", "2002-12-01"],
    ["simples", "icms", "nenhum", null, null, null, null, "LC 123/2006, art. 23", "2007-07-01"],
  ].map(([regime, tributo, forma, aliquota, base, tipos_entrada, condicao, fonte_legal, vigencia_inicio], k) => ({
    id: k + 1,
    org_id: null,
    regime,
    tributo,
    forma,
    aliquota,
    base,
    tipos_entrada,
    condicao,
    cst_sem_credito: ["04", "05", "06", "07", "08", "09"],
    explicacao: "Regra de exemplo para a verificação das telas.",
    fonte_legal,
    vigencia_inicio,
    vigencia_fim: null,
  })),
  fis_depara_itens: [],
  vw_painel_setores: [
    { org_id: ORG, setor_id: SETOR, nome: "Fiscal", cor: "#2a78d6", ordem: 1, abertas: 26, atrasadas: 3, concluidas_mes: 70 },
  ],
  vw_painel_responsaveis: [
    { org_id: ORG, user_id: EU, nome: "Edvaldo Ribeiro de Carvalho", abertas: 26, atrasadas: 3, concluidas_mes: 70 },
  ],
  vw_painel_vencimentos: [
    {
      org_id: ORG,
      id: "88888888-8888-4888-8888-000000000001",
      titulo: "DCTFWeb — 09/2026",
      cliente: "GREENCORE INDUSTRIA LTDA",
      cliente_curto: "Greencore",
      prazo: dia(0),
      dias: 0,
      prioridade: "alta",
      status: "a_fazer",
      responsavel: "Edvaldo",
      setor: "Fiscal",
      setor_cor: "#2a78d6",
    },
  ],
};

/** Resultado de cada RPC (o nome é o que vem depois de /rest/v1/rpc/). RPC não listada devolve null. */
export const RPCS = {
  // MDC · Pessoal (075): convite da família devolve o código (aparece uma vez)
  pessoal_convidar: () => "AB2C-DE3F",
  // Financeiro › Conciliação (051): extrato do Itaú com sugestões (valor igual, pagamento agrupado, boleto do Ledgra Link)
  fin_conciliacao_dados: () => ({
    conta: "f2000000-0000-4000-8000-000000000001",
    de: dia(-30),
    ate: dia(0),
    pode_operar: true,
    saldos: { extrato: 2650.5, hub: 2200, diferenca: 450.5 },
    linhas: [
      [11, -6, 3200, "PIX RECEBIDO CLIENTE ABC COMERCIO", "pendente"],
      [12, -5, -500, "PAGAMENTO BOLETOS IMOBILIARIA CENTRO", "pendente"],
      [13, -4, -149.5, "TARIFA PACOTE DE SERVIÇOS", "pendente"],
      [14, -3, 900, "LIQUIDACAO COBRANCA BOLETO MARIA DA SILVA", "pendente"],
      [15, -2, -1000, "TED ENVIADA SICOOB APLICACAO", "pendente"],
      [16, -8, 200, "DEPOSITO TESTE", "ignorado"],
      [17, -9, -1500, "PAGAMENTO FORNECEDOR XYZ", "conciliado"],
    ].map(([id, d, valor, descricao, situacao]) => ({
      id,
      data: dia(d),
      valor,
      descricao,
      documento: null,
      situacao,
      conciliacao:
        situacao === "ignorado"
          ? { id: 2, tipo: "ignorado", observacao: "Depósito de teste do banco, devolvido", em: momento(-1), itens: [] }
          : situacao === "conciliado"
            ? {
                id: 1,
                tipo: "lancamentos",
                observacao: null,
                em: momento(-1),
                itens: [
                  {
                    valor: -1500,
                    criado_aqui: false,
                    descricao: "Aluguel",
                    pessoa: "Imobiliária Centro Ltda",
                    baixa: 9,
                    transferencia: null,
                  },
                ],
              }
            : null,
    })),
    baixas: [
      {
        id: 21,
        data: dia(-3),
        valor: 900,
        tipo: "receber",
        descricao: "Honorários",
        documento: null,
        pessoa: "Maria da Silva",
        forma: "Boleto (Ledgra Link)",
      },
    ],
    titulos: [
      ["f6000000-0000-4000-8000-000000000101", "receber", -6, 3200, "Honorários do mês", "Cliente ABC Comércio"],
      ["f6000000-0000-4000-8000-000000000102", "pagar", -6, 300, "Aluguel sala 1", "Imobiliária Centro Ltda"],
      ["f6000000-0000-4000-8000-000000000103", "pagar", -6, 200, "Aluguel sala 2", "Imobiliária Centro Ltda"],
      ["f6000000-0000-4000-8000-000000000104", "pagar", 4, 780, "Energia elétrica", null],
    ].map(([id, tipo, d, saldo, descricao, pessoa]) => ({ id, tipo, vencimento: dia(d), saldo, descricao, documento: null, pessoa })),
    transferencias: [],
  }),
  hub_meus_apps: () => APPS,
  hub_situacao_contas: () => [{ user_id: EU, confirmado: true, ultimo_acesso: momento(0) }],
  convites_pendentes: () => [{ email: "jean@exemplo.com", nome: "Jean Exemplo", papel: "analista", setor_id: null, criado_em: momento(0) }],
  hub_pendencias_membro: () => ({ tarefas: 0, clientes: 0 }),
  portal_minhas_empresas: () => [
    {
      org_id: ORG,
      org_nome: "MDC Assessoria",
      cliente_id: C1,
      razao_social: "GREENCORE INDUSTRIA LTDA",
      nome_fantasia: "Greencore",
      cnpj: "12.345.678/0001-95",
      regime: "real",
      uf: "SP",
      logo_url: null,
      cor_primaria: "#0B2820",
      cor_destaque: "#E2C17E",
      permissoes: ["tarefas", "demonstrativos", "societario", "atendimento", "vencimentos", "folha", "documentos"],
    },
    // segunda empresa com todas as partes do Portal liberadas (Rotinas, Fale com a MDC, Documentos) e sem fechamento
    // publicado: serve para ver as telas vazias que ensinam (escolha "mdc-portal:empresa" = C2 no navegador)
    {
      org_id: ORG,
      org_nome: "MDC Assessoria",
      cliente_id: C2,
      razao_social: "PADARIA EXEMPLO LTDA",
      nome_fantasia: "Padaria Exemplo",
      cnpj: "11.222.333/0001-81",
      regime: "simples",
      uf: "SP",
      logo_url: null,
      cor_primaria: "#0B2820",
      cor_destaque: "#E2C17E",
      permissoes: ["demonstrativos", "rotinas", "chat", "societario", "documentos"],
    },
  ],
  // Portal › Faturas (050): uma a vencer com boleto, uma paga com nota fiscal e uma vencida sem boleto
  portal_faturas_detalhe: () =>
    [
      { n: "2026/00031", comp: -3, venc: 6, valor: 1850, paga: false, boleto: true, nota: null },
      { n: "2026/00024", comp: -33, venc: -24, valor: 1850, paga: true, boleto: false, nota: "157" },
      { n: "2026/00017", comp: -63, venc: -54, valor: 1790.5, paga: false, boleto: false, nota: "141" },
    ].map((x, i) => ({
      id: `fp${i}`,
      numero: x.n,
      competencia: `${dia(x.comp).slice(0, 7)}-01`,
      emissao: dia(x.comp),
      vencimento: dia(x.venc),
      valor: x.valor,
      descricao: "Honorários contábeis — assessoria mensal",
      documento: x.nota ? "nfse" : "fatura",
      envio: x.nota ? "nf_fatura_boleto" : "fatura_boleto",
      situacao: "enviada",
      nfse_situacao: x.nota ? "emitida" : "nao_se_aplica",
      nfse_numero: x.nota,
      boleto_situacao: x.boleto ? "gerado" : "a_definir",
      servico_codigo: x.nota ? "17.19.01" : null,
      iss_aliquota: x.nota ? 2 : null,
      cancelamento_motivo: null,
      contrato: "Assessoria contábil Greencore",
      paga: x.paga,
      pago_em: x.paga ? dia(x.venc) : null,
      tomador: {
        nome: "GREENCORE INDUSTRIA LTDA",
        documento: "12345678000195",
        email: "financeiro@greencore.com.br",
        cidade: "Bragança Paulista",
        uf: "SP",
      },
      nfse: x.nota
        ? {
            numero: x.nota,
            chave: "35071052481401210001650000000000157" + "000000000000000",
            xml_caminho: `${ORG}/x/nfse-emitidas/2026/09/n${i}.xml`,
          }
        : null,
      boleto: x.boleto
        ? {
            banco: "itau",
            linha_digitavel: "34191.79001 01043.510047 91020.150008 1 99990000185000",
            pix_copia_cola: "00020126580014br.gov.bcb.pix0136exemplo-mdc-portal",
            vencimento: dia(x.venc),
            valor: x.valor,
            situacao: "registrada",
          }
        : null,
    })),
  portal_rotinas: () => [
    {
      tarefa_id: "r1",
      titulo: "DCTFWeb — 09/2026",
      setor: "Fiscal",
      prazo: dia(5),
      situacao: "a_fazer",
      concluida_em: null,
      pendencia: null,
      arquivos: [],
    },
  ],
  portal_processos: () => [],
  prever_rotina: () => 2,
  portal_licenca_situacao: () => ({ bloqueado: true, modulos: [{ slug: "financeiro", nome: "Financeiro" }] }),
  // Vencimentos › Certificados digitais (044): cofre do HUB (o Ledgra Link responde desligado nas telas)
  cert_painel: () => [
    {
      origem: "notas",
      cliente_id: C1,
      titular: "GREENCORE INDUSTRIA LTDA",
      documento: "12345678000195",
      emissor: "AC SOLUTI Multipla v5",
      icp_brasil: true,
      valido_de: momento(-340),
      valido_ate: momento(5),
      enviado_em: momento(-340),
    },
    {
      origem: "demonstrativos",
      cliente_id: null,
      titular: "MDC ASSESSORIA LTDA",
      documento: "48140121000165",
      emissor: "AC Certisign RFB G5",
      icp_brasil: true,
      valido_de: momento(-300),
      valido_ate: momento(65),
      enviado_em: momento(-300),
    },
  ],
};

// ---------------------------------------------------------------- Societário (02/11/2026)
// Mais processos em andamento, em fases diferentes, para o quadro, a lista e o painel terem o que mostrar
// (um com exigência, um parado, um com previsão vencida, um de empresa fora do cadastro e um concluído).
(() => {
  const FASES_ALTERACAO = [
    ["documentos", "Documentos", 3],
    ["elaboracao", "Elaboração", 3],
    ["aprovacao", "Aprovação do cliente", 5],
    ["assinaturas", "Assinaturas", 5],
    ["protocolo", "Protocolo", 2],
    ["exigencias", "Exigências", 5],
    ["deferimento", "Deferimento", 10],
    ["entrega", "Entrega", 2],
  ];
  TABELAS.soc_tipos.push({
    id: "t2",
    org_id: ORG,
    codigo: "abertura",
    nome: "Abertura de empresa",
    ordem: 2,
    ativo: true,
    fases: FASES_ALTERACAO.map(([codigo, nome, prazo_dias]) => ({ codigo, nome, prazo_dias })),
  });
  const SOC = (k) => `77777777-7777-4777-8777-77777777780${k}`;
  // [k, número, tipo, cliente, futuro, fase atual (ordem), status da fase, dias na fase, prazo da fase, previsão, exigências, situação]
  const exemplos = [
    [1, 21, "t2", null, "Padaria Pão Quente Ltda", 1, "aguardando_cliente", 2, 1, 30, 0, "aberto"],
    [2, 20, "t1", C2, null, 2, "em_andamento", 1, 2, 15, 0, "aberto"],
    [3, 19, "t1", C1, null, 4, "aguardando_cliente", 12, -4, 8, 0, "aberto"],
    [4, 18, "t1", C2, null, 6, "em_andamento", 3, 2, -3, 2, "aberto"],
    [5, 17, "t1", null, "Comercial Bragança Ltda", 7, "aguardando_orgao", 6, -1, 20, 1, "aberto"],
    [6, 15, "t1", C1, null, 8, "concluida", 0, null, -10, 0, "concluido"],
  ];
  for (const [k, numero, tipo_id, cliente_id, futuro, atual, status, naFase, prazo, previsao, exigencias, situacao] of exemplos) {
    TABELAS.soc_processos.push({
      id: SOC(k),
      org_id: ORG,
      numero,
      tipo_id,
      cliente_id,
      futuro_cliente: futuro,
      cnpj: cliente_id ? "12.345.678/0001-95" : null,
      uf: k === 5 ? "MG" : "SP",
      descricao: tipo_id === "t2" ? "Abertura de padaria, Simples Nacional" : "Entrada de sócio e aumento de capital",
      status: situacao,
      fase_atual: atual,
      exigencias,
      responsavel_id: k % 2 ? EU : OUTRO,
      pedido_em: dia(-20 - k * 3),
      previsao_em: dia(previsao),
      concluido_em: situacao === "concluido" ? momento(-2) : null,
      visivel_cliente: !!cliente_id,
      criado_em: momento(-20 - k * 3),
      criado_por: EU,
      atualizado_em: momento(-naFase),
    });
    FASES_ALTERACAO.forEach(([codigo, nome, prazo_dias], i) => {
      const ordem = i + 1;
      const antes = ordem < atual || situacao === "concluido";
      TABELAS.soc_fases.push({
        id: `${SOC(k)}-f${ordem}`,
        org_id: ORG,
        processo_id: SOC(k),
        codigo,
        nome,
        ordem,
        status: antes ? (codigo === "exigencias" && !exigencias ? "dispensada" : "concluida") : ordem === atual ? status : "a_fazer",
        responsavel_id: ordem === atual ? (k % 2 ? EU : OUTRO) : null,
        inicio_em: antes || ordem === atual ? dia(-20 - k * 3 + ordem) : null,
        fim_em: antes ? dia(-20 - k * 3 + ordem + 1) : null,
        prazo_dias,
        prazo_em: ordem === atual && prazo !== null ? dia(prazo) : null,
        mudou_em: momento(ordem === atual ? -naFase : -30),
        tarefa_id: ordem === atual ? "t-soc" : null,
      });
    });
  }
  const P4 = SOC(4);
  TABELAS.soc_protocolos.push({
    id: "sp1",
    org_id: ORG,
    processo_id: P4,
    orgao: "JUCESP",
    numero: "2.345.678/26-1",
    data: dia(-6),
    link: "https://exemplo.com",
  });
  TABELAS.soc_exigencias.push(
    {
      id: "se1",
      org_id: ORG,
      processo_id: P4,
      data: dia(-3),
      orgao: "JUCESP",
      texto: "Corrigir a cláusula de administração.",
      resposta: null,
      reprotocolo_em: null,
    },
    {
      id: "se2",
      org_id: ORG,
      processo_id: P4,
      data: dia(-5),
      orgao: "JUCESP",
      texto: "Falta assinatura do sócio entrante.",
      resposta: "Assinatura colhida pelo gov.br",
      reprotocolo_em: dia(-4),
    },
  );
  TABELAS.soc_taxas.push(
    {
      id: "st1",
      org_id: ORG,
      processo_id: P4,
      descricao: "DARE Junta Comercial",
      valor: 189.07,
      vencimento: dia(-8),
      pago_por: "cliente",
      pago_em: dia(-8),
    },
    {
      id: "st2",
      org_id: ORG,
      processo_id: P4,
      descricao: "Taxa municipal",
      valor: 92.5,
      vencimento: dia(-1),
      pago_por: "mdc",
      pago_em: null,
    },
  );
  TABELAS.soc_eventos.push(
    {
      id: 901,
      org_id: ORG,
      processo_id: P4,
      user_id: EU,
      tipo: "exigencias",
      texto: "Exigência registrada (JUCESP)",
      visivel_cliente: true,
      em: momento(-3),
    },
    {
      id: 902,
      org_id: ORG,
      processo_id: P4,
      user_id: OUTRO,
      tipo: "comentario",
      texto: "Cliente avisado por WhatsApp.",
      visivel_cliente: false,
      em: momento(-2),
    },
  );
})();
// ---------------------------------------------------------------- CRM Comercial: mais exemplos (02/11/2026)
// Oportunidades em várias etapas (quadro por etapa no computador e no celular), um lead do Simulador com retorno
// atrasado, uma ganha, uma perdida e uma arquivada; contratos enviado e assinado para a lista de Contratos.
const crmOp = (n, campos = {}) => ({
  ...oportunidade,
  id: `55555555-5555-4555-8555-5555555556${String(n).padStart(2, "0")}`,
  cnpj: null,
  email: null,
  observacoes: null,
  ...campos,
});
TABELAS.crm_oportunidades.push(
  crmOp(1, {
    empresa: "Oficina Mecânica Bom Pistão",
    contato_nome: "Carlos",
    cidade: "Bragança Paulista",
    etapa: "novo",
    etapa_desde: momento(-1),
    origem: "simulador",
    regime_atual: "presumido",
    valor_mensal: null,
    proximo_contato: dia(-2),
    dados_origem: { melhor_regime: "simples", economia_estimada: 18400, cnae_descricao: "Manutenção de veículos" },
    criado_em: momento(-1),
  }),
  crmOp(2, {
    empresa: "Clínica Sorriso Feliz",
    contato_nome: "Dra. Ana",
    etapa: "contato",
    etapa_desde: momento(-9),
    valor_mensal: 1200,
    origem: "site",
    proximo_contato: dia(1),
  }),
  crmOp(3, {
    empresa: "Mercadinho Central",
    contato_nome: "João",
    etapa: "reuniao",
    etapa_desde: momento(-2),
    valor_mensal: 750,
    origem: "whatsapp",
    responsavel_id: null,
  }),
  crmOp(4, {
    empresa: "Transportadora Serra Azul",
    contato_nome: "Paulo",
    etapa: "negociacao",
    etapa_desde: momento(-4),
    valor_mensal: 2400,
    origem: "evento",
  }),
  crmOp(5, {
    empresa: "Pet Shop Amigo Fiel",
    etapa: "ganho",
    etapa_desde: momento(-6),
    valor_mensal: 680,
    origem: "instagram",
    cliente_id: C1,
  }),
  crmOp(6, {
    empresa: "Loja de Roupas Estilo",
    etapa: "perdido",
    etapa_desde: momento(-12),
    valor_mensal: 900,
    motivo_perda: "Escolheu outro escritório (preço)",
  }),
  crmOp(7, {
    empresa: "Construtora Alicerce",
    etapa: "contato",
    etapa_desde: momento(-40),
    origem: "simulador",
    arquivado_em: momento(-3),
    motivo_arquivo: "Sem retorno",
    dados_origem: { melhor_regime: "presumido", economia_estimada: 5200 },
  }),
);
TABELAS.crm_contratos.push(
  {
    ...TABELAS.crm_contratos[0],
    id: "k2",
    oportunidade_id: crmOp(4).id,
    numero: "2026/002",
    status: "enviado",
    valores: { ...TABELAS.crm_contratos[0].valores, razao_social: "TRANSPORTADORA SERRA AZUL LTDA", honorario_mensal: 2400 },
    enviado_em: momento(-1),
    crm_oportunidades: { empresa: "Transportadora Serra Azul" },
  },
  {
    ...TABELAS.crm_contratos[0],
    id: "k3",
    oportunidade_id: crmOp(5).id,
    numero: "2026/003",
    status: "assinado",
    valores: { ...TABELAS.crm_contratos[0].valores, razao_social: "PET SHOP AMIGO FIEL LTDA", honorario_mensal: 680 },
    enviado_em: momento(-8),
    assinado_em: momento(0),
    crm_oportunidades: { empresa: "Pet Shop Amigo Fiel" },
  },
);

// ---------------------------------------------------------------- XML guardado das notas (janela "Ver a nota" em /entradas)
// Conteúdo do Storage "fiscal" por caminho (fis_notas.xml_caminho): a NF-e 1188 e a NFS-e 52 de fis_notas (fictícias).
const CHAVE_NFE_1188 = "35261011222333000181550010000011881123456781";
const CHAVE_NFSE_52 = "35034012112223330001810000000000000526100000000001";
export const XML_EXEMPLO = {
  [`${ORG}/${CM}/nfe/2026/10/1188.xml`]: `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CHAVE_NFE_1188}" versao="4.00">
<ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>1188</nNF><dhEmi>${momento(-12).slice(0, 19)}-03:00</dhEmi>
<dhSaiEnt>${momento(-12).slice(0, 19)}-03:00</dhSaiEnt><tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>Distribuidora Exemplo Ltda</xNome><enderEmit><xLgr>Rua das Indústrias</xLgr><nro>1500</nro>
<xBairro>Distrito Industrial</xBairro><xMun>Atibaia</xMun><UF>SP</UF><CEP>12940000</CEP><fone>1144112233</fone></enderEmit><IE>111111111111</IE></emit>
<dest><CNPJ>48140121000165</CNPJ><xNome>MDC Assessoria Ltda</xNome><enderDest><xLgr>Avenida Central</xLgr><nro>200</nro><xBairro>Centro</xBairro>
<xMun>Bragança Paulista</xMun><UF>SP</UF><CEP>12900000</CEP></enderDest><IE>333333333333</IE></dest>
<det nItem="1"><prod><cProd>ABC-1</cProd><xProd>Parafuso sextavado (cx 100)</xProd><NCM>73181500</NCM><CFOP>5102</CFOP><uCom>CX</uCom>
<qCom>10.0000</qCom><vUnCom>50.00</vUnCom><vProd>500.00</vProd></prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>510.00</vBC>
<pICMS>18.00</pICMS><vICMS>91.80</vICMS></ICMS00></ICMS><IPI><IPITrib><CST>50</CST><pIPI>5.00</pIPI><vIPI>25.00</vIPI></IPITrib></IPI>
<PIS><PISAliq><CST>01</CST><vPIS>8.25</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vCOFINS>38.00</vCOFINS></COFINSAliq></COFINS></imposto>
<infAdProd>Lote 2026-10</infAdProd></det>
<det nItem="2"><prod><cProd>XYZ-9</cProd><xProd>Óleo lubrificante 1L</xProd><NCM>27101932</NCM><CFOP>5405</CFOP><uCom>UN</uCom><qCom>4.0000</qCom>
<vUnCom>25.00</vUnCom><vProd>100.00</vProd></prod><imposto><ICMS><ICMS60><orig>0</orig><CST>60</CST></ICMS60></ICMS></imposto></det>
<total><ICMSTot><vBC>510.00</vBC><vICMS>91.80</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>600.00</vProd><vFrete>20.00</vFrete><vSeg>0.00</vSeg>
<vDesc>10.00</vDesc><vIPI>25.00</vIPI><vPIS>8.25</vPIS><vCOFINS>38.00</vCOFINS><vOutro>0.00</vOutro><vNF>635.00</vNF></ICMSTot></total>
<transp><modFrete>0</modFrete><transporta><CNPJ>99888777000166</CNPJ><xNome>Transportadora Exemplo Ltda</xNome><xMun>Atibaia</xMun><UF>SP</UF></transporta>
<vol><qVol>2</qVol><esp>CAIXA</esp><pesoL>40.000</pesoL><pesoB>42.000</pesoB></vol></transp>
<cobr><dup><nDup>001</nDup><dVenc>${dia(18)}</dVenc><vDup>317.50</vDup></dup><dup><nDup>002</nDup><dVenc>${dia(48)}</dVenc><vDup>317.50</vDup></dup></cobr>
<infAdic><infCpl>Pedido de compra 4521. Entrega no galpão 2.</infCpl></infAdic></infNFe></NFe>
<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${CHAVE_NFE_1188}</chNFe><dhRecbto>${momento(-12).slice(0, 19)}-03:00</dhRecbto>
<nProt>135260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`,
  [`${ORG}/${CM}/nfe/2026/10/52.xml`]: `<?xml version="1.0" encoding="utf-8"?>
<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE_NFSE_52}">
<xLocEmi>Atibaia</xLocEmi><xLocPrestacao>Bragança Paulista</xLocPrestacao><nNFSe>52</nNFSe><xLocIncid>Bragança Paulista</xLocIncid>
<xTribNac>Assessoria ou consultoria de qualquer natureza</xTribNac><cStat>100</cStat><dhProc>${momento(-20).slice(0, 19)}-03:00</dhProc><nDFSe>998877</nDFSe>
<emit><CNPJ>11222333000181</CNPJ><IM>12345</IM><xNome>Consultoria Exemplo Ltda</xNome><enderNac><xLgr>Rua do Comércio</xLgr><nro>45</nro>
<xBairro>Centro</xBairro><UF>SP</UF><CEP>12940100</CEP></enderNac><email>contato@consultoria.exemplo</email></emit>
<valores><vBC>2000.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>40.00</vISSQN><vTotalRet>143.00</vTotalRet><vLiq>1857.00</vLiq></valores>
<DPS versao="1.00"><infDPS Id="DPS350340121122233300018100001000000000000052"><tpAmb>1</tpAmb><dhEmi>${momento(-20).slice(0, 19)}-03:00</dhEmi>
<serie>1</serie><nDPS>52</nDPS><dCompet>${dia(-20)}</dCompet><prest><CNPJ>11222333000181</CNPJ></prest>
<toma><CNPJ>48140121000165</CNPJ><xNome>MDC Assessoria Ltda</xNome><end><endNac><cMun>3507605</cMun><CEP>12900000</CEP></endNac>
<xLgr>Avenida Central</xLgr><nro>200</nro><xBairro>Centro</xBairro></end></toma>
<serv><locPrest><cLocPrestacao>3507605</cLocPrestacao></locPrest><cServ><cTribNac>170101</cTribNac><xDescServ>Assessoria em gestão financeira do mês:
- revisão do fluxo de caixa;
- reunião com a diretoria.</xDescServ><cNBS>113011000</cNBS></cServ></serv>
<valores><vServPrest><vServ>2000.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>
<tribFed><piscofins><CST>01</CST><vPis>13.00</vPis><vCofins>60.00</vCofins><tpRetPisCofins>1</tpRetPisCofins></piscofins>
<vRetIRRF>30.00</vRetIRRF><vRetCSLL>40.00</vRetCSLL></tribFed></trib></valores></infDPS></DPS></infNFSe></NFSe>`,
};
// ---------------------------------------------------------------- Contratos (041, 02/11/2026)
// Contratos fixos da MDC (CM): honorários a receber, aluguel (com reajuste de IGP-M pendente neste mês e contrato
// anexado), sistema com vigência terminando em 20 dias (renova sozinho), limpeza suspensa e um encerrado. Algumas contas
// do Financeiro passam a vir de contrato (selo "Contrato fixo"). Só acréscimos.
(() => {
  APPS.push({
    slug: "contratos",
    nome: "Contratos",
    descricao: "Contratos fixos: cadastro, vigência, anexos e reajuste",
    icone: "documento",
    rota: "/contratos",
    status: "ativo",
    externo: false,
    ordem: 42,
    papel: "gerir",
  });
  const mes = dia(0).slice(0, 7) + "-01";
  const mesesAtras = (n) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const mmaaaa = (d) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const K = (n) => `fc000000-0000-4000-8000-00000000000${n}`;
  const contrato = (n, extra) => ({
    id: K(n),
    org_id: ORG,
    cliente_id: CM,
    numero: null,
    objeto: null,
    centro_id: null,
    conta_prevista_id: "f2000000-0000-4000-8000-000000000001",
    vigencia_fim: null,
    renovacao_automatica: false,
    aviso_dias: 30,
    gera_contas: true,
    fim: null,
    percentual_fixo: null,
    situacao: "ativo",
    situacao_motivo: null,
    situacao_em: null,
    encerrado_em: null,
    ultima_competencia: mes,
    mes_cadastro: mesesAtras(14),
    observacao: null,
    criado_em: momento(-420),
    ...extra,
  });
  const mesAtualNum = Number(mes.slice(5, 7));
  TABELAS.fin_recorrentes = [
    contrato(1, {
      tipo: "receber",
      pessoa_id: "f5000000-0000-4000-8000-000000000002",
      descricao: "Honorários contábeis mensais",
      numero: "2025/031",
      objeto: "Escrituração contábil e fiscal, folha de pagamento e obrigações acessórias",
      valor: 2400,
      dia_vencimento: 10,
      categoria_id: "f7000000-0000-4000-8000-000000000003",
      vigencia_inicio: mesesAtras(20),
      inicio: mesesAtras(20),
      gerar_desde: mesesAtras(14),
      indice: "IPCA",
      mes_reajuste: Number(mesesAtras(8).slice(5, 7)),
    }),
    contrato(2, {
      tipo: "pagar",
      pessoa_id: "f5000000-0000-4000-8000-000000000001",
      descricao: "Aluguel da sala",
      objeto: "Locação da sala 12 do Edifício Central",
      valor: 2500,
      dia_vencimento: 5,
      categoria_id: "f7000000-0000-4000-8000-000000000002",
      vigencia_inicio: mesesAtras(24),
      vigencia_fim: dia(400),
      inicio: mesesAtras(24),
      gerar_desde: mesesAtras(14),
      indice: "IGP-M",
      mes_reajuste: mesAtualNum,
    }),
    contrato(3, {
      tipo: "pagar",
      pessoa_id: "f5000000-0000-4000-8000-000000000001",
      descricao: "Sistema contábil (licença)",
      numero: "CT-889",
      valor: 890,
      dia_vencimento: 31,
      categoria_id: "f7000000-0000-4000-8000-000000000001",
      vigencia_inicio: mesesAtras(11),
      vigencia_fim: dia(20),
      renovacao_automatica: true,
      inicio: mesesAtras(11),
      gerar_desde: mesesAtras(11),
      mes_cadastro: mesesAtras(11),
      indice: "fixo",
      percentual_fixo: 5,
      mes_reajuste: (mesAtualNum % 12) + 1,
    }),
    contrato(4, {
      tipo: "pagar",
      pessoa_id: "f5000000-0000-4000-8000-000000000003",
      descricao: "Limpeza do escritório",
      valor: 450,
      dia_vencimento: 15,
      categoria_id: "f7000000-0000-4000-8000-000000000002",
      vigencia_inicio: mesesAtras(6),
      inicio: mesesAtras(6),
      gerar_desde: mesesAtras(6),
      indice: "nenhum",
      mes_reajuste: null,
      situacao: "suspenso",
      situacao_motivo: "Prestadora de férias",
      situacao_em: momento(-20),
    }),
    contrato(5, {
      tipo: "pagar",
      pessoa_id: "f5000000-0000-4000-8000-000000000001",
      descricao: "Internet antiga",
      valor: 199.9,
      dia_vencimento: 20,
      categoria_id: "f7000000-0000-4000-8000-000000000001",
      vigencia_inicio: mesesAtras(18),
      inicio: mesesAtras(18),
      gerar_desde: mesesAtras(14),
      fim: mesesAtras(3),
      ultima_competencia: mesesAtras(3),
      indice: "nenhum",
      mes_reajuste: null,
      situacao: "encerrado",
      situacao_motivo: "Troca de operadora",
      situacao_em: momento(-80),
      encerrado_em: dia(-80),
    }),
  ];
  TABELAS.fin_recorrente_reajustes = [
    {
      id: 1,
      org_id: ORG,
      cliente_id: CM,
      recorrente_id: K(1),
      origem: "reajuste",
      referencia: mesesAtras(8),
      indice: "IPCA",
      percentual: 4.6812,
      percentual_proposto: 4.6812,
      valor_antes: 2292.7,
      valor_depois: 2400,
      titulos_atualizados: 0,
      observacao: null,
      em: momento(-270),
    },
  ];
  TABELAS.fin_recorrente_eventos = [
    [1, K(2), "criado", `Contrato cadastrado: R$ 2.500,00 por mês, primeira conta em ${mmaaaa(mesesAtras(14))}`, -420],
    [2, K(2), "anexo", "Arquivo anexado: contrato-locacao-assinado.pdf", -269],
    [3, K(2), "conta", `Conta de ${mmaaaa(mes)} lançada em Contas a pagar (R$ 2.500,00)`, -1],
    [4, K(2), "aviso", `Aviso no sino: reajuste de ${mmaaaa(mes)} pendente`, -1],
  ].map(([id, recorrente_id, tipo, texto, d]) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    recorrente_id,
    tipo,
    texto,
    dados: null,
    por: d < -2 ? EU : null,
    em: momento(d),
  }));
  TABELAS.hub_arquivos.push({
    id: "fc100000-0000-4000-8000-000000000001",
    org_id: ORG,
    app: "contratos",
    ref_id: K(2),
    cliente_id: CM,
    nome: "contrato-locacao-assinado.pdf",
    caminho: `${ORG}/contratos/${K(2)}/contrato-locacao-assinado.pdf`,
    tamanho: 284_000,
    tipo: "application/pdf",
    visivel_cliente: false,
    enviado_por: EU,
    enviado_em: momento(-269),
  });
  TABELAS.fin_indices = [];
  // contas do Financeiro que vieram de contrato (selo "Contrato fixo")
  for (const t of TABELAS.fin_titulos) {
    if (t.descricao === "Condomínio") Object.assign(t, { recorrente_id: K(2), competencia: mes });
    if (t.descricao === "Venda NF 1301") Object.assign(t, { recorrente_id: K(1), competencia: mes });
  }
  RPCS.fin_recorrente_proposta = ({ p_contrato }) => {
    const k = TABELAS.fin_recorrentes.find((x) => x.id === p_contrato) ?? TABELAS.fin_recorrentes[1];
    const percentual = k.indice === "fixo" ? 5 : 3.9187;
    return {
      contrato: k.id,
      referencia: `${mes.slice(0, 4)}-${String(k.mes_reajuste ?? 1).padStart(2, "0")}-01`,
      pendente: k.id === K(2),
      tipo: k.indice,
      indice: k.indice,
      de: mesesAtras(12),
      ate: mesesAtras(1),
      meses: 12,
      faltam: [],
      percentual,
      valor_atual: k.valor,
      valor_novo: Math.round(k.valor * (1 + percentual / 100) * 100) / 100,
      contas_em_aberto: k.id === K(2) ? [{ id: "f8200000-0000-4000-8000-000000000092", competencia: mes, valor: 2500 }] : [],
      indices_atualizados_em: momento(0),
    };
  };
})();

// "Ver caminho" (árvore do documento): o pedido de compra nº 1 cita a NF-e 1188 do mesmo fornecedor (CNPJ do emitente =
// cadastro da Imobiliária Centro), gerou 2 parcelas (a 1ª paga, com um pagamento estornado antes) e a entrada da tinta no
// estoque. A venda nº 1 já tem a conta a receber f8…04 com recebimento parcial. Só acréscimos e o documento do pedido.
(() => {
  const PC1 = "fc000000-0000-4000-8000-000000000003";
  const pedido = TABELAS.est_pedidos.find((p) => p.id === PC1);
  Object.assign(pedido, {
    documento: "NF 1188",
    condicao: "30 e 60 dias",
    parcelas: [
      { numero: 1, vencimento: dia(-4 + 30), valor: 70 },
      { numero: 2, vencimento: dia(-4 + 60), valor: 70 },
    ],
  });
  const parcela = (n, d, pago) => ({
    id: `f8000000-0000-4000-8000-00000000001${n}`,
    org_id: ORG,
    cliente_id: CM,
    tipo: "pagar",
    pessoa_id: "f5000000-0000-4000-8000-000000000001",
    categoria_id: "f7000000-0000-4000-8000-000000000002",
    centro_id: null,
    conta_prevista_id: "f2000000-0000-4000-8000-000000000001",
    descricao: `Pedido de compra nº 1 · Imobiliária Centro Ltda (${n}/2)`,
    documento: "NF 1188",
    emissao: dia(-4),
    vencimento: dia(d),
    valor: 70,
    valor_pago: pago ? 70 : 0,
    parcela: n,
    parcelas: 2,
    grupo: null,
    situacao: pago ? "quitado" : "aberto",
    quitado_em: pago ? dia(-2) : null,
    cancelado_motivo: null,
    observacao: null,
  });
  TABELAS.fin_titulos.push(parcela(1, -3, true), parcela(2, 26, false));
  TABELAS.est_pedido_titulos.push(
    { titulo_id: "f8000000-0000-4000-8000-000000000011", pedido_id: PC1, org_id: ORG, cliente_id: CM },
    { titulo_id: "f8000000-0000-4000-8000-000000000012", pedido_id: PC1, org_id: ORG, cliente_id: CM },
  );
  const baixa = (id, d, estornada) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    titulo_id: "f8000000-0000-4000-8000-000000000011",
    conta_id: estornada ? "f2000000-0000-4000-8000-000000000002" : "f2000000-0000-4000-8000-000000000001",
    data: dia(d),
    valor: 70,
    juros: 0,
    multa: 0,
    desconto: 0,
    total: 70,
    forma: estornada ? "Boleto" : "Pix",
    observacao: null,
    extrato_linha_id: null,
    estornada,
    estornada_em: estornada ? momento(d + 1) : null,
    estorno_motivo: estornada ? "Pago pela conta errada" : null,
  });
  TABELAS.fin_baixas.push(baixa(40, -3, true), baixa(41, -2, false));
  TABELAS.est_movimentos.push({
    id: 4,
    org_id: ORG,
    cliente_id: CM,
    item_id: "f9000000-0000-4000-8000-000000000002",
    local_id: "fa000000-0000-4000-8000-000000000001",
    data: dia(-4),
    tipo: "entrada",
    quantidade: 1,
    custo_unitario: 140,
    origem: "pedido_compra",
    origem_id: PC1,
    grupo: null,
    observacao: null,
    estornado: false,
    estorno_motivo: null,
    saldo_apos: 4,
    custo_medio_apos: 170,
  });
})();

// ---------------------------------------------------------------- Faturas dos contratos a receber (043, 03/11/2026)
// Honorários (contrato 1) com NFS-e + fatura + boleto, gera dia 25 e vence dia 5, por e-mail e Portal; uma consultoria
// só com fatura (sem canal) e uma mensalidade publicada no Portal. Faturas em cada situação, inclusive cancelada.
(() => {
  const K = (n) => `fc000000-0000-4000-8000-00000000000${n}`;
  const mes = dia(0).slice(0, 7) + "-01";
  const mesesAtras = (n) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const diaDoMes = (m, d) => `${m.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const semFatura = {
    documento: "fatura",
    envio: "fatura",
    dia_geracao: 1,
    canais: [],
    email_envio: null,
    whatsapp_envio: null,
    cliente_carteira_id: null,
    servico_descricao: null,
    servico_codigo: null,
    iss_aliquota: null,
    boleto_banco: null,
    renovacao_meses: 12,
  };
  for (const k of TABELAS.fin_recorrentes) Object.assign(k, { ...semFatura, ...k });
  Object.assign(TABELAS.fin_recorrentes[0], {
    documento: "nfse",
    envio: "nf_fatura_boleto",
    boleto_banco: "itau",
    dia_geracao: 1,
    dia_vencimento: 5,
    canais: ["email", "portal"],
    email_envio: "financeiro@clienteabc.com.br",
    cliente_carteira_id: C1,
    servico_descricao: "Serviços de contabilidade, escrituração fiscal e folha de pagamento",
    servico_codigo: "17.01.01",
    iss_aliquota: 2,
  });
  TABELAS.fin_recorrentes.push(
    {
      ...TABELAS.fin_recorrentes[0],
      ...semFatura,
      id: K(6),
      descricao: "Consultoria tributária mensal",
      numero: "2026/044",
      objeto: null,
      valor: 1800,
      dia_vencimento: 15,
      dia_geracao: 1,
      indice: "nenhum",
      mes_reajuste: null,
      pessoa_id: "f5000000-0000-4000-8000-000000000003",
    },
    {
      ...TABELAS.fin_recorrentes[0],
      ...semFatura,
      id: K(7),
      descricao: "Mensalidade do portal",
      numero: null,
      objeto: null,
      valor: 99.9,
      dia_vencimento: 12,
      dia_geracao: 2,
      canais: ["portal"],
      cliente_carteira_id: C1,
      indice: "nenhum",
      mes_reajuste: null,
    },
  );
  const F = (n) => `fd000000-0000-4000-8000-00000000000${n}`;
  const fatura = (n, seq, extra) => ({
    id: F(n),
    org_id: ORG,
    cliente_id: CM,
    titulo_id: `fd100000-0000-4000-8000-00000000000${n}`,
    pessoa_id: "f5000000-0000-4000-8000-000000000002",
    cliente_carteira_id: null,
    ano: Number(dia(0).slice(0, 4)),
    sequencia: seq,
    numero: `${dia(0).slice(0, 4)}/${String(seq).padStart(5, "0")}`,
    servico_codigo: null,
    iss_aliquota: null,
    nfse_numero: null,
    origem: "rotina",
    motivo_manual: null,
    cancelada_em: null,
    cancelada_por: null,
    cancelamento_motivo: null,
    por: null,
    criado_em: momento(-1),
    atualizado_em: momento(-1),
    ...extra,
  });
  const nf = {
    recorrente_id: K(1),
    cliente_carteira_id: C1,
    valor: 2400,
    documento: "nfse",
    envio: "nf_fatura_boleto",
    boleto_situacao: "a_definir",
    servico_codigo: "17.01.01",
    iss_aliquota: 2,
  };
  TABELAS.fin_faturas = [
    fatura(1, 1, {
      ...nf,
      competencia: mesesAtras(1),
      emissao: diaDoMes(mesesAtras(1), 25),
      vencimento: diaDoMes(mes, 5),
      descricao: `Serviços de contabilidade, escrituração fiscal e folha de pagamento · ${mesesAtras(1).slice(5, 7)}/${mesesAtras(1).slice(0, 4)}`,
      situacao: "pronta",
      nfse_situacao: "emitida",
      nfse_numero: "1287",
      boleto_situacao: "gerado",
    }),
    fatura(2, 2, {
      recorrente_id: K(6),
      pessoa_id: "f5000000-0000-4000-8000-000000000003",
      competencia: mes,
      emissao: diaDoMes(mes, 1),
      vencimento: diaDoMes(mes, 15),
      valor: 1800,
      descricao: `Consultoria tributária mensal · ${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
      documento: "fatura",
      envio: "fatura",
      situacao: "cancelada",
      nfse_situacao: "nao_se_aplica",
      boleto_situacao: "nao_se_aplica",
      cancelada_em: momento(-1),
      cancelamento_motivo: "Valor combinado errado",
    }),
    fatura(3, 3, {
      recorrente_id: K(6),
      pessoa_id: "f5000000-0000-4000-8000-000000000003",
      competencia: mes,
      emissao: dia(0),
      vencimento: diaDoMes(mes, 15),
      valor: 1850,
      descricao: `Consultoria tributária mensal · ${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
      documento: "fatura",
      envio: "fatura",
      situacao: "gerada",
      nfse_situacao: "nao_se_aplica",
      boleto_situacao: "nao_se_aplica",
      origem: "manual",
      motivo_manual: "Refeita com o valor certo",
    }),
    fatura(4, 4, {
      recorrente_id: K(7),
      cliente_carteira_id: C1,
      competencia: mes,
      emissao: diaDoMes(mes, 2),
      vencimento: diaDoMes(mes, 12),
      valor: 99.9,
      descricao: `Mensalidade do portal · ${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
      documento: "fatura",
      envio: "fatura",
      situacao: "enviada",
      nfse_situacao: "nao_se_aplica",
      boleto_situacao: "nao_se_aplica",
    }),
    fatura(5, 5, {
      ...nf,
      competencia: mes,
      emissao: dia(0),
      vencimento: diaDoMes(mesesAtras(-1), 5),
      descricao: `Serviços de contabilidade, escrituração fiscal e folha de pagamento · ${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
      situacao: "aguardando_nf",
      nfse_situacao: "a_emitir",
    }),
  ];
  const envio = (id, f, canal, destino, conteudo, situacao, enviado) => ({
    id,
    org_id: ORG,
    cliente_id: CM,
    fatura_id: F(f),
    canal,
    destino,
    conteudo,
    situacao,
    tentativas: enviado ? 1 : 0,
    ultimo_erro: null,
    enviado_em: enviado ? momento(-1) : null,
    criado_em: momento(-1),
    atualizado_em: momento(-1),
  });
  const tudo = ["nfse", "fatura", "boleto"];
  TABELAS.fin_envios = [
    envio(1, 1, "email", "financeiro@clienteabc.com.br", tudo, "aguardando_configuracao", false),
    envio(2, 1, "portal", C1, tudo, "enviado", true),
    envio(3, 4, "portal", C1, ["fatura"], "enviado", true),
    envio(4, 5, "email", "financeiro@clienteabc.com.br", tudo, "aguardando_configuracao", false),
    envio(5, 5, "portal", C1, tudo, "pendente", false),
    // 053: o WhatsApp da fatura 1 falhou (número sem WhatsApp) e parou de tentar: aparece o motivo e "Reenviar"
    {
      ...envio(6, 1, "whatsapp", "13988887777", tudo, "erro", false),
      tentativas: 1,
      falhas: 1,
      ultimo_erro: "Não foi possível entregar no WhatsApp deste número (número sem WhatsApp ou inválido): confira o cadastro.",
      proxima_tentativa_em: null,
      etapa: "principal",
    },
  ];
  // Contratos › Envio (053): e-mail ligado pelo Microsoft 365; WhatsApp sem os segredos ainda
  RPCS.fin_envio_situacao = () => ({
    canais: {
      email: {
        configurado: true,
        detalhe: "Microsoft 365 conferido: o aplicativo do HUB entrou.",
        remetente: "hub@mdcassessoria.com",
        verificado_em: momento(0),
      },
      whatsapp: {
        configurado: false,
        detalhe: "Faltam os segredos WHATSAPP_TOKEN, WHATSAPP_NUMERO_ID, WHATSAPP_MODELO em Edge Functions › Secrets do Supabase.",
        remetente: null,
        verificado_em: momento(0),
      },
    },
    fila: { "email:pendente": 1, "email:enviado": 12, "whatsapp:erro": 1, "whatsapp:aguardando_configuracao": 3 },
    problemas: [
      {
        envio: 6,
        fatura: TABELAS.fin_faturas[0].numero,
        canal: "whatsapp",
        destino: "13988887777",
        erro: "Não foi possível entregar no WhatsApp deste número (número sem WhatsApp ou inválido): confira o cadastro.",
        falhas: 1,
        proxima: null,
      },
    ],
  });
  // boleto (049): a fatura 1 tem boleto do Itaú registrado; a 5 ainda vai gerar. Itaú configurado; Santander não.
  TABELAS.fin_fatura_boletos = [
    {
      id: "fe000000-0000-4000-8000-000000000001",
      org_id: ORG,
      cliente_id: CM,
      fatura_id: F(1),
      banco: "itau",
      cobranca_link_id: "fe100000-0000-4000-8000-000000000001",
      tipo: "boleto_hibrido",
      situacao: "registrada",
      valor: 2400,
      vencimento: diaDoMes(mes, 5),
      linha_digitavel: "34191.79001 01043.510047 91020.150008 1 00000000150000",
      pix_copia_cola: "00020101021226850014br.gov.bcb.pix2563qrpix.exemplo.com.br/v2/cobv/9d36b84f",
      nosso_numero: "10435100",
      tentativa: 1,
      emitido_em: momento(-1),
      emitido_por: null,
      atualizado_em: momento(-1),
    },
  ];
  TABELAS.link_contas_banco = [
    {
      org_id: ORG,
      banco: "itau",
      codigo_compe: "341",
      cliente_id: CM,
      conta_link_id: "7d1b6f2e-1111-4a3c-9d1e-0000000000aa",
      fin_conta_id: TABELAS.fin_contas_bancarias?.find((c) => c.cliente_id === CM)?.id ?? "fb000000-0000-4000-8000-000000000001",
      tipo: "boleto_hibrido",
      ativo: true,
      atualizado_em: momento(-2),
      atualizado_por: null,
    },
  ];
})();

// ---------------------------------------------------------------- NFS-e pelo Emissor Nacional (046, 03/11/2026)
// Parâmetros no ambiente de teste; a fatura 1 tem a nota de verdade nº 1287 (XML no bucket fiscal, pasta nfse-emitidas)
// e a fatura 5 (NFS-e pronta para emitir) teve uma tentativa de teste recusada. A conferência (nfse_preparar) mostra os
// dados da DPS e a recusa anterior.
(() => {
  const F = (n) => `fd000000-0000-4000-8000-00000000000${n}`;
  const mes = dia(0).slice(0, 7);
  const CHAVE_1287 = "35076052248140121000165" + "0000000001287" + mes.slice(2, 4) + mes.slice(5, 7) + "123456789" + "3";
  const caminho = `${ORG}/${CM}/nfse-emitidas/${mes.replace("-", "/")}/${CHAVE_1287}.xml`;
  TABELAS.nfse_parametros = [
    {
      cliente_id: CM,
      org_id: ORG,
      ambiente: "producao_restrita",
      modo: "conferir",
      serie: "1",
      op_simples: "3",
      reg_ap_trib_sn: "1",
      reg_esp_trib: "0",
      inscricao_municipal: "12345",
      codigo_municipio: "3507605",
      nbs_padrao: "113021000",
      p_tot_trib_sn: 6,
      atualizado_em: momento(-2),
      atualizado_por: EU,
    },
  ];
  // Nota × pedido de compra (058): um pedido aguardando entrega do mesmo fornecedor aparece para escolher ao lançar
  RPCS.fis_pedidos_da_nota = () => [
    {
      id: "f5800000-0000-4000-8000-000000000001",
      numero: 7,
      situacao: "confirmado",
      total: 1500,
      documento: null,
      data: dia(-5),
      cita_nota: false,
      mesmo_total: false,
      sugerido: false,
    },
  ];
  // Regras fiscais por tipo de serviço (057): contabilidade sem retenção e assessoria que retém em Atibaia/SP
  TABELAS.fis_regras_servico = [
    {
      id: "f5000000-0000-4000-8000-000000000001",
      org_id: ORG,
      cliente_id: CM,
      servico_codigo: "171901",
      nome: "Honorários contábeis",
      descricao_nota: "Serviços de contabilidade, escrituração fiscal e folha de pagamento",
      nbs: "113021000",
      iss_aliquota: 2,
      iss_retencao: "nao",
      iss_retencao_municipios: [],
      cclasstrib: "000001",
      cindop: null,
      ativo: true,
      inativo_motivo: null,
      atualizado_em: momento(-1),
      atualizado_por: EU,
    },
    {
      id: "f5000000-0000-4000-8000-000000000002",
      org_id: ORG,
      cliente_id: CM,
      servico_codigo: "172001",
      nome: "Consultoria financeira",
      descricao_nota: null,
      nbs: null,
      iss_aliquota: 3,
      iss_retencao: "municipios",
      iss_retencao_municipios: ["atibaia/SP"],
      cclasstrib: null,
      cindop: null,
      ativo: true,
      inativo_motivo: null,
      atualizado_em: momento(-1),
      atualizado_por: EU,
    },
  ];
  TABELAS.nfse_numeracao = [
    { cliente_id: CM, org_id: ORG, ambiente: "producao_restrita", serie: "1", proximo: 4, atualizado_em: momento(-1) },
    { cliente_id: CM, org_id: ORG, ambiente: "producao", serie: "1", proximo: 2, atualizado_em: momento(-3) },
  ];
  const emissao = (n, extra) => ({
    id: `fe000000-0000-4000-8000-00000000000${n}`,
    org_id: ORG,
    cliente_id: CM,
    serie: "1",
    chave_acesso: null,
    numero_nfse: null,
    xml_caminho: null,
    dps_caminho: null,
    mensagem: null,
    mensagens: [],
    tentativas: 1,
    por: EU,
    respondido_em: momento(-1),
    atualizado_em: momento(-1),
    ...extra,
  });
  TABELAS.nfse_emissoes = [
    emissao(1, {
      fatura_id: F(1),
      ambiente: "producao",
      ndps: 1,
      id_dps: "DPS3507605248140121000165" + "00001" + "000000000000001",
      situacao: "emitida",
      chave_acesso: CHAVE_1287,
      numero_nfse: "1287",
      xml_caminho: caminho,
      enviado_em: momento(-6),
      criado_em: momento(-6),
    }),
    emissao(2, {
      fatura_id: F(5),
      ambiente: "producao_restrita",
      ndps: 3,
      id_dps: "DPS3507605248140121000165" + "00001" + "000000000000003",
      situacao: "rejeitada",
      mensagem: "Para ME/EPP do Simples sem retenção, a alíquota do ISS não vai na nota (o ISS está no DAS). (E0625)",
      mensagens: [
        {
          codigo: "E0625",
          descricao:
            "Não é permitido informar alíquota quando não há indicação de retenção do ISSQN (tpRetISSQN = 1) para o prestador ME/EPP",
          complemento: null,
          texto: "Para ME/EPP do Simples sem retenção, a alíquota do ISS não vai na nota (o ISS está no DAS).",
        },
      ],
      enviado_em: momento(-1),
      criado_em: momento(-1),
    }),
  ];
  RPCS.nfse_preparar = ({ p_fatura }) => {
    const f = TABELAS.fin_faturas.find((x) => x.id === p_fatura) ?? TABELAS.fin_faturas[4];
    return {
      org: ORG,
      cliente: CM,
      pronto: f.nfse_situacao !== "emitida",
      pendencias: f.nfse_situacao === "emitida" ? [`A nota fiscal desta fatura já foi emitida (nº ${f.nfse_numero})`] : [],
      pode_emitir: true,
      ambiente: "producao_restrita",
      modo: "conferir",
      hoje: dia(0),
      fatura: {
        id: f.id,
        numero: f.numero,
        competencia: f.competencia,
        emissao: f.emissao,
        vencimento: f.vencimento,
        valor: f.valor,
        situacao: f.situacao,
        nfse_situacao: f.nfse_situacao,
        nfse_numero: f.nfse_numero,
      },
      dps: {
        ambiente: "producao_restrita",
        serie: "1",
        proximo_ndps: 4,
        dCompet: f.competencia,
        cLocEmi: "3507605",
        prestador: { cnpj: "48140121000165", nome: "MDC ASSESSORIA LTDA", im: "12345", opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" },
        tomador: { documento: "44537381000118", nome: "Cliente ABC Comércio", email: "financeiro@clienteabc.com.br" },
        servico: {
          cLocPrestacao: "3507605",
          cTribNac: "171901",
          descricao: `${f.descricao} · Fatura ${f.numero} · Vencimento ${f.vencimento.split("-").reverse().join("/")}`,
          cNBS: "113021000",
        },
        valores: { vServ: f.valor, pTotTribSN: 6, tribISSQN: "1", tpRetISSQN: "1" },
      },
      iss: { aliquota_referencia: 2, valor_estimado: Math.round(f.valor * 2) / 100, retido: false },
      emissoes: TABELAS.nfse_emissoes.filter((e) => e.fatura_id === f.id),
      // nota de saída (065): sem ajustes, com o padrão de cada campo
      nota: {
        id: `fa500000-0000-4000-8000-${f.id.slice(-12)}`,
        servico_codigo: null,
        nbs: null,
        descricao: null,
        p_tot_trib_sn: null,
        atualizado_em: null,
        padrao: {
          servico_codigo: "171901",
          nbs: "113021000",
          descricao: `${f.descricao} · Fatura ${f.numero} · Vencimento ${f.vencimento.split("-").reverse().join("/")}`,
          p_tot_trib_sn: 6,
        },
      },
    };
  };
  // Notas fiscais › Saída (065): uma nota por fatura com NFS-e; situação pela fatura e pela última tentativa
  RPCS.nfse_saidas = () =>
    TABELAS.fin_faturas
      .filter((f) => f.documento === "nfse")
      .map((f) => {
        const ult = TABELAS.nfse_emissoes.filter((e) => e.fatura_id === f.id).at(-1);
        const situacao =
          f.situacao === "cancelada"
            ? "cancelada"
            : f.nfse_situacao === "emitida"
              ? "emitida"
              : ult?.situacao === "rejeitada"
                ? "recusada"
                : "para_emitir";
        const pessoa = TABELAS.fin_pessoas.find((x) => x.id === f.pessoa_id);
        return {
          id: `fa500000-0000-4000-8000-${f.id.slice(-12)}`,
          fatura: f.id,
          fatura_numero: f.numero,
          competencia: f.competencia,
          vencimento: f.vencimento,
          emissao_fatura: f.emissao,
          valor: f.valor,
          descricao: f.descricao,
          servico_codigo: "171901",
          tomador: pessoa?.nome ?? "Cliente ABC Comércio",
          tomador_documento: pessoa?.documento ?? "44537381000118",
          ajustada: false,
          situacao,
          numero_nfse: situacao === "emitida" ? (f.nfse_numero ?? ult?.numero_nfse) : null,
          chave_acesso: situacao === "emitida" ? ult?.chave_acesso : null,
          xml_caminho: situacao === "emitida" ? ult?.xml_caminho : null,
          emitida_em: situacao === "emitida" ? ult?.respondido_em : null,
          ambiente: ult?.ambiente ?? null,
          mensagem: ult?.situacao === "rejeitada" ? ult.mensagem : null,
          tentativas: ult?.tentativas ?? null,
        };
      });
  RPCS.nfse_nota_salvar = ({ p }) => ({ id: p.id, nbs: p.nbs || null });
  XML_EXEMPLO[caminho] = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE_1287}">
<xLocEmi>Bragança Paulista</xLocEmi><xLocPrestacao>Bragança Paulista</xLocPrestacao><nNFSe>1287</nNFSe><xLocIncid>Bragança Paulista</xLocIncid>
<xTribNac>Contabilidade, inclusive serviços técnicos e auxiliares</xTribNac><cStat>100</cStat><dhProc>${momento(-6).slice(0, 19)}-03:00</dhProc><nDFSe>1287</nDFSe>
<emit><CNPJ>48140121000165</CNPJ><IM>12345</IM><xNome>MDC ASSESSORIA LTDA</xNome><enderNac><xLgr>Rua Exemplo</xLgr><nro>100</nro>
<xBairro>Centro</xBairro><UF>SP</UF><CEP>12900000</CEP></enderNac></emit>
<valores><vBC>2400.00</vBC><vLiq>2400.00</vLiq></valores>
<DPS versao="1.01"><infDPS Id="DPS3507605248140121000165${"00001"}${"000000000000001"}"><tpAmb>1</tpAmb><dhEmi>${momento(-6).slice(0, 19)}-03:00</dhEmi>
<verAplic>HUB-MDC 1.0</verAplic><serie>1</serie><nDPS>1</nDPS><dCompet>${mes}-01</dCompet><tpEmit>1</tpEmit><cLocEmi>3507605</cLocEmi>
<prest><CNPJ>48140121000165</CNPJ><IM>12345</IM><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>
<toma><CNPJ>44537381000118</CNPJ><xNome>Cliente ABC Comércio</xNome><email>financeiro@clienteabc.com.br</email></toma>
<serv><locPrest><cLocPrestacao>3507605</cLocPrestacao></locPrest><cServ><cTribNac>171901</cTribNac><xDescServ>Serviços de contabilidade, escrituração fiscal e folha de pagamento</xDescServ><cNBS>113021000</cNBS></cServ></serv>
<valores><vServPrest><vServ>2400.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>
<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
})();

// 047: Contratos lê os cadastros pela função fin_recorrente_opcoes (só nomes; dados do cliente só de quem tem fatura)
(() => {
  const doCliente = (lista, c) => (lista ?? []).filter((x) => x.cliente_id === c);
  RPCS.fin_recorrente_opcoes = ({ p_cliente }) => {
    const pessoas = doCliente(TABELAS.fin_pessoas, p_cliente);
    const comFatura = new Set((TABELAS.fin_faturas ?? []).filter((f) => f.cliente_id === p_cliente).map((f) => f.pessoa_id));
    return {
      pessoas: pessoas.map(({ id, nome, tipo, ativo }) => ({ id, nome, tipo, ativo })),
      categorias: doCliente(TABELAS.fin_categorias, p_cliente).map(({ id, nome, tipo, grupo, ativo }) => ({
        id,
        nome,
        tipo,
        grupo,
        ativo,
      })),
      centros: doCliente(TABELAS.fin_centros_custo, p_cliente).map(({ id, nome, ativo }) => ({ id, nome, ativo })),
      contas: doCliente(TABELAS.fin_contas_bancarias, p_cliente).map(({ id, nome, ativo }) => ({ id, nome, ativo })),
      tomadores: pessoas
        .filter((p) => comFatura.has(p.id))
        .map(({ id, nome, documento, email, cidade, uf }) => ({ id, nome, documento, email, cidade, uf })),
    };
  };
})();

// ---------------------------------------------------------------- Receita por sistema (059, 05/11/2026)
// Ledgra e EXato cadastrados (mais um inativo sem contrato); a "Mensalidade do portal" é licença do Ledgra. O painel
// traz Ledgra, EXato e "Sem sistema" (honorários), com 12 meses de faturamento e a receita prevista.
(() => {
  const S = (n) => `f5900000-0000-4000-8000-00000000000${n}`;
  TABELAS.fin_sistemas = [
    { id: S(1), org_id: ORG, cliente_id: CM, nome: "Ledgra", descricao: "Plataforma contábil (licenças)", ativo: true, ordem: 100 },
    { id: S(2), org_id: ORG, cliente_id: CM, nome: "EXato", descricao: "Gestão de diaristas", ativo: true, ordem: 100 },
    { id: S(3), org_id: ORG, cliente_id: CM, nome: "MDC Tarefas", descricao: null, ativo: false, ordem: 100 },
  ];
  for (const k of TABELAS.fin_recorrentes) if (!("sistema_id" in k)) k.sistema_id = null;
  const portal = TABELAS.fin_recorrentes.find((k) => k.descricao === "Mensalidade do portal");
  if (portal) portal.sistema_id = S(1);
  const hoje = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const serie = (base, cresce) => meses.map((_, i) => Math.round((base + cresce * i) * 100) / 100);
  RPCS.fin_receita_sistemas = ({ p_mes }) => ({
    mes: p_mes ?? meses[11],
    hoje: meses[11],
    meses,
    linhas: [
      {
        sistema: S(1),
        nome: "Ledgra",
        descricao: "Plataforma contábil (licenças)",
        ativo: true,
        contratos: 18,
        suspensos: 1,
        clientes: 17,
        mensal: 8982,
        faturado: 8982,
        recebido: 7385,
        atraso: 499,
        novos: 9,
        encerrados: 2,
        previsto: 107784,
        por_mes: serie(4200, 430),
      },
      {
        sistema: S(2),
        nome: "EXato",
        descricao: "Gestão de diaristas",
        ativo: true,
        contratos: 3,
        suspensos: 0,
        clientes: 3,
        mensal: 4500,
        faturado: 4500,
        recebido: 4500,
        atraso: 0,
        novos: 3,
        encerrados: 0,
        previsto: 54000,
        por_mes: serie(0, 410),
      },
      {
        sistema: null,
        nome: "Sem sistema (honorários e outros)",
        descricao: null,
        ativo: true,
        contratos: 2,
        suspensos: 0,
        clientes: 2,
        mensal: 3250,
        faturado: 3250,
        recebido: 1850,
        atraso: 1400,
        novos: 0,
        encerrados: 1,
        previsto: 39000,
        por_mes: serie(3250, 0),
      },
    ],
  });
})();

// ---------------------------------------------------------------- Menu da Gestão reorganizado (060, 05/11/2026)
// Mesma ordem da produção: Financeiro, Contratos, Relatórios, (Fornecedores e clientes), Centros de custo, Plano de
// contas. Entradas, Saídas, Estoque e Cobrança Ledgra estão desligados na produção; aqui continuam ligados (no fim da
// lista) só para as fotos das telas deles continuarem sendo conferidas.
(() => {
  const ORDEM = {
    financeiro: 35,
    contratos: 36,
    entradas: 37,
    relatorios: 38,
    centros_custo: 39,
    plano_contas: 40,
    saidas: 92,
    estoque: 93,
    licencas: 94,
  };
  const notas = APPS.find((a) => a.slug === "entradas");
  if (notas)
    Object.assign(notas, {
      nome: "Notas fiscais",
      descricao: "Notas emitidas contra o CNPJ da MDC (NF-e e NFS-e) e lançamento no Financeiro",
    });
  for (const a of APPS) if (a.slug in ORDEM) a.ordem = ORDEM[a.slug];
  APPS.sort((a, b) => a.ordem - b.ordem);
})();

// ---------------------------------------------------------------- NBS pela tabela oficial (062, 05/11/2026)
// Anexo VIII v1.02.00: contabilidade (17.19) tem 3 NBS, atividade 7 (Anexo III); análise de sistemas (01.01), Fator R.
RPCS.fis_nbs_do_servico = ({ p_servico }) => {
  const d = String(p_servico ?? "").replace(/\D/g, "");
  const base = { versao: "1.02.00", publicada_em: "2026-10-26", conferida_em: "2026-11-02T10:10:00Z" };
  const a3 =
    "Prestação de serviços, cessão de direitos, de uso ou de espaço com incidência de ISS, tributados exclusivamente pelo Anexo III";
  if (d.startsWith("1719"))
    return {
      ...base,
      item: "17.19",
      item_descricao: "Contabilidade, Inclusive Serviços Técnicos E Auxiliares.",
      nbs: [
        { nbs: "113022100", descricao: "Serviços de contabilidade", ativ_sn: "7", ativ_sn_descricao: a3 },
        { nbs: "113022200", descricao: "Serviços de escrituração mercantil", ativ_sn: "7", ativ_sn_descricao: a3 },
        { nbs: "113022300", descricao: "Serviços de folha de pagamento", ativ_sn: "7", ativ_sn_descricao: a3 },
      ],
    };
  if (d.startsWith("0101"))
    return {
      ...base,
      item: "01.01",
      item_descricao: "Análise E Desenvolvimento De Sistemas.",
      nbs: [
        {
          nbs: "115021000",
          descricao: "Serviços de projeto, desenvolvimento e instalação de aplicativos e programas não personalizados (não customizados)",
          ativ_sn: "9",
          ativ_sn_descricao: "Prestação de serviços - Sujeitos ao Fator “R” – Anexo III ou V",
        },
      ],
    };
  return { ...base, item: d.length >= 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}` : null, item_descricao: null, nbs: [] };
};
