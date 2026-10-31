// Classificação gerencial das contas: lista de grupos (ativo, passivo, resultado) e as regras que atribuem
// um grupo a cada conta pela descrição dela e das contas-mãe, respeitando o mapa salvo pela equipe.
// Convenção dos saldos: devedor = positivo, credor = negativo.
import { sem } from "./leitura";
import type { Grupo, Linha } from "./tipos";

export const GRUPOS: { id: Grupo; nome: string; bloco: "Ativo" | "Passivo" | "Resultado" | "—" }[] = [
  { id: "ac_disponivel", nome: "Disponível (caixa, bancos, aplicações)", bloco: "Ativo" },
  { id: "ac_clientes", nome: "Clientes / contas a receber", bloco: "Ativo" },
  { id: "ac_estoques", nome: "Estoques", bloco: "Ativo" },
  { id: "ac_outros", nome: "Outros ativos circulantes", bloco: "Ativo" },
  { id: "anc_rlp", nome: "Realizável a longo prazo", bloco: "Ativo" },
  { id: "anc_permanente", nome: "Investimentos, imobilizado e intangível", bloco: "Ativo" },
  { id: "pc_fornecedores", nome: "Fornecedores", bloco: "Passivo" },
  { id: "pc_emprestimos", nome: "Empréstimos e financiamentos (CP)", bloco: "Passivo" },
  { id: "pc_obrigacoes", nome: "Obrigações fiscais e trabalhistas", bloco: "Passivo" },
  { id: "pc_outros", nome: "Outros passivos circulantes", bloco: "Passivo" },
  { id: "pnc_emprestimos", nome: "Empréstimos e financiamentos (LP)", bloco: "Passivo" },
  { id: "pnc_outros", nome: "Outros passivos não circulantes", bloco: "Passivo" },
  { id: "pl", nome: "Patrimônio líquido", bloco: "Passivo" },
  { id: "receita_bruta", nome: "Receita bruta", bloco: "Resultado" },
  { id: "deducoes", nome: "Deduções da receita (impostos, devoluções)", bloco: "Resultado" },
  { id: "custos", nome: "Custos", bloco: "Resultado" },
  { id: "despesas_operacionais", nome: "Despesas operacionais", bloco: "Resultado" },
  { id: "receitas_financeiras", nome: "Receitas financeiras", bloco: "Resultado" },
  { id: "despesas_financeiras", nome: "Despesas financeiras", bloco: "Resultado" },
  { id: "outras_receitas", nome: "Outras receitas", bloco: "Resultado" },
  { id: "outras_despesas", nome: "Outras despesas", bloco: "Resultado" },
  { id: "ir_csll", nome: "IRPJ e CSLL", bloco: "Resultado" },
  { id: "ignorar", nome: "Não considerar", bloco: "—" },
];
export const nomeGrupo = (g: Grupo | null | undefined) => GRUPOS.find((x) => x.id === g)?.nome ?? "Sem grupo";

type Bloco = "ativo" | "passivo" | "resultado";

// Regras por bloco (ativo, passivo/PL, resultado), testadas da própria conta para as contas-mãe.
const REGRAS: { re: RegExp; grupo: Grupo; bloco: Bloco; dentro?: RegExp }[] = [
  // ativo
  { bloco: "ativo", re: /REALIZAVEL A LONGO PRAZO/, grupo: "anc_rlp" },
  { bloco: "ativo", re: /^CONTAS DE COMPENSACAO/, grupo: "ignorar" },
  { bloco: "ativo", re: /IMOBILIZADO|INTANGIVEL|DIFERIDO/, grupo: "anc_permanente" },
  { bloco: "ativo", re: /INVESTIMENTOS|PARTICIPACOES SOCIETARIAS/, grupo: "anc_permanente", dentro: /NAO CIRCULANTE|PERMANENTE/ },
  {
    bloco: "ativo",
    re: /MOVEIS|UTENSILIOS|VEICULOS|MAQUINAS|EQUIPAMENTOS|EDIFICACOES|IMOVEIS|TERRENOS|COMPUTADORES|INSTALACOES|BENFEITORIAS|SOFTWARE|MARCAS|DEPRECIAC|AMORTIZAC.*ACUMUL|IMOBILIZAC/,
    grupo: "anc_permanente",
    dentro: /NAO CIRCULANTE|PERMANENTE/,
  },
  { bloco: "ativo", re: /DISPONI|^CAIXA|BANCOS?\b|APLICAC.*(FINANC|LIQUIDEZ)|NUMERARIO|CARTOES PRE PAGOS/, grupo: "ac_disponivel" },
  { bloco: "ativo", re: /INVESTIMENTOS|APLIC/, grupo: "ac_disponivel", dentro: /^DISPONIVEL|^ATIVO CIRCULANTE/ },
  {
    bloco: "ativo",
    re: /^CLIENTES|DUPLICATAS A RECEBER|CONTAS A RECEBER DE CLIENTES|CARTOES? (DE CREDITO )?A RECEBER/,
    grupo: "ac_clientes",
  },
  { bloco: "ativo", re: /ESTOQUE|MERCADORIAS|MATERIA.? PRIMA|PRODUTOS ACABADOS|PRODUTOS EM ELABORACAO/, grupo: "ac_estoques" },
  // passivo e PL
  { bloco: "passivo", re: /^CONTAS DE COMPENSACAO/, grupo: "ignorar" },
  { bloco: "passivo", re: /PATRIMONIO LIQUIDO/, grupo: "pl" },
  {
    bloco: "passivo",
    re: /EMPRESTIMOS|FINANCIAMENTOS|JUROS A TRANSCORRER|CAPITAL DE GIRO|LEASING|ARRENDAMENTO MERCANTIL/,
    grupo: "pnc_emprestimos",
    dentro: /NAO CIRCULANTE|LONGO PRAZO/,
  },
  {
    bloco: "passivo",
    re: /EMPRESTIMOS|FINANCIAMENTOS|JUROS A TRANSCORRER|CAPITAL DE GIRO|LEASING|ARRENDAMENTO MERCANTIL/,
    grupo: "pc_emprestimos",
  },
  { bloco: "passivo", re: /FORNECEDORES/, grupo: "pc_fornecedores" },
  {
    bloco: "passivo",
    re: /OBRIGAC.*(TRIBUT|FISCA|TRABALH|SOCIA|PREVID|PESSOAL)|IMPOSTOS|TRIBUTOS|CONTRIBUICOES A RECOLHER|ENCARGOS|SALARIOS|ORDENADOS|FERIAS|13O|PROVIS|PARCELAMENTO|\b(INSS|FGTS|IRRF|PIS|COFINS|ICMS|ISS|ISSQN)\b/,
    grupo: "pc_obrigacoes",
    dentro: /^PASSIVO CIRCULANTE|^CIRCULANTE/,
  },
  // resultado
  { bloco: "resultado", re: /APURACAO|ENCERRAMENTO|RESULTADO DO EXERCICIO/, grupo: "ignorar" },
  {
    bloco: "resultado",
    re: /PROVIS.*(IMPOSTO DE RENDA|\bIR\b|IRPJ|CSLL|CONTRIBUICAO SOCIAL)|\bIRPJ\b|\bCSLL\b|CONTRIBUICAO SOCIAL SOBRE O LUCRO|IMPOSTO DE RENDA (PESSOA JURIDICA|E CONTRIBUICAO)/,
    grupo: "ir_csll",
  },
  {
    bloco: "resultado",
    re: /DEDUC|DEVOLUC|\bDEV\b|CANCELAMENTO|ABATIMENTO|IMPOSTOS (SOBRE|INCIDENTES)|IMPOSTOS E CONTRIBUICOES SOBRE|SIMPLES NACIONAL|^\(MENOS\)/,
    grupo: "deducoes",
    dentro: /RECEITA/,
  },
  {
    bloco: "resultado",
    re: /RECEITAS? FINANCEIRAS|RENDIMENTOS DE APLICAC|JUROS ATIVOS|DESCONTOS OBTIDOS|JUROS E DESCONTOS|VARIAC.*ATIVA/,
    grupo: "receitas_financeiras",
  },
  {
    bloco: "resultado",
    re: /DESPESAS? FINANCEIRAS|JUROS PASSIVOS|TARIFAS BANCARIAS|DESPESAS BANCARIAS|\bIOF\b|VARIAC.*PASSIVA/,
    grupo: "despesas_financeiras",
  },
  { bloco: "resultado", re: /OUTRAS RECEITAS|RECEITAS NAO OPERACIONAIS|GANHO NA (ALIENACAO|VENDA)/, grupo: "outras_receitas" },
  {
    bloco: "resultado",
    re: /OUTRAS DESPESAS|DESPESAS NAO OPERACIONAIS|PERDA NA (ALIENACAO|VENDA)|RESULTADOS NAO OPERACIONAIS/,
    grupo: "outras_despesas",
  },
  { bloco: "resultado", re: /CUSTO/, grupo: "custos" },
  { bloco: "resultado", re: /DESPESA/, grupo: "despesas_operacionais" },
  {
    bloco: "resultado",
    re: /RECEITA BRUTA|RECEITA OPERACIONAL|VENDAS?|PRESTACAO DE SERVICOS|FATURAMENTO|RECEITA DE SERVICOS|RECEITAS?/,
    grupo: "receita_bruta",
  },
];

export function blocoDe(topo: string, classificacao: string): Bloco {
  if (/^ATIVO/.test(topo)) return "ativo";
  if (/PASSIVO|PATRIMONIO/.test(topo)) return "passivo";
  if (/RESULTADO|RECEITA|CUSTO|DESPESA/.test(topo)) return "resultado";
  return classificacao.startsWith("1") ? "ativo" : classificacao.startsWith("2") ? "passivo" : "resultado";
}

/** Atribui grupo a cada conta: mapa salvo (prefixo mais longo) → regras do bloco pelas descrições, da conta para cima. */
export function classificar(linhas: Linha[], mapa: { classificacao: string; grupo: Grupo }[] = []) {
  const porClas = new Map(linhas.map((l) => [l.classificacao, l]));
  const ordenado = [...mapa].sort((a, b) => b.classificacao.length - a.classificacao.length);
  const ancestrais = (c: string) => {
    const partes = c.split(".");
    const out: Linha[] = [];
    for (let i = partes.length; i >= 1; i--) {
      const l = porClas.get(partes.slice(0, i).join("."));
      if (l) out.push(l);
    }
    return out; // da própria conta para cima
  };
  for (const l of linhas) {
    const salvo = ordenado.find((m) => l.classificacao === m.classificacao || l.classificacao.startsWith(m.classificacao + "."));
    if (salvo) {
      l.grupo = salvo.grupo;
      continue;
    }
    const caminho = ancestrais(l.classificacao).map((a) => sem(a.descricao));
    const tudo = caminho.join("|");
    const bloco = blocoDe(caminho[caminho.length - 1] ?? "", l.classificacao);
    let g: Grupo | null = null;
    for (const d of caminho) {
      const r = REGRAS.find((x) => x.bloco === bloco && x.re.test(d) && (!x.dentro || caminho.some((c) => x.dentro!.test(c))));
      if (r) {
        g = r.grupo;
        break;
      }
    }
    if (!g) {
      if (bloco === "ativo") g = /NAO CIRCULANTE|LONGO PRAZO/.test(tudo) ? "anc_rlp" : "ac_outros";
      else if (bloco === "passivo") g = /NAO CIRCULANTE|LONGO PRAZO|EXIGIVEL A LONGO/.test(tudo) ? "pnc_outros" : "pc_outros";
      else g = /RECEITA/.test(tudo) ? "receita_bruta" : /CUSTO/.test(tudo) ? "custos" : "despesas_operacionais";
    }
    // dívida de longo prazo que não é empréstimo
    if (g === "pc_obrigacoes" && /NAO CIRCULANTE|LONGO PRAZO/.test(tudo)) g = "pnc_outros";
    if ((g === "pc_fornecedores" || g === "pc_outros") && /NAO CIRCULANTE|LONGO PRAZO/.test(tudo)) g = "pnc_outros";
    l.grupo = g;
  }
  return linhas;
}
