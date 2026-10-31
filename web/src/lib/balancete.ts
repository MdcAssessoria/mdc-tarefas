// Leitura do balancete exportado pelo Domínio, classificação gerencial, índices,
// verificações de fragilidade e rascunho do parecer técnico.
// Convenção interna: devedor = positivo, credor = negativo.
import { brl } from "./formato/moeda";
import { fmtIndice } from "./formato/numero";
import type { FormatoIndice } from "./formato/numero";
import { fmtCompetencia } from "./formato/datas";

/** Valores dos textos de análise em reais inteiros, sem centavos. */
const reais = (v: number | null | undefined) => brl(v, { centavos: false });

export type Grupo =
  | "ac_disponivel"
  | "ac_clientes"
  | "ac_estoques"
  | "ac_outros"
  | "anc_rlp"
  | "anc_permanente"
  | "pc_fornecedores"
  | "pc_emprestimos"
  | "pc_obrigacoes"
  | "pc_outros"
  | "pnc_emprestimos"
  | "pnc_outros"
  | "pl"
  | "receita_bruta"
  | "deducoes"
  | "custos"
  | "despesas_operacionais"
  | "receitas_financeiras"
  | "despesas_financeiras"
  | "outras_receitas"
  | "outras_despesas"
  | "ir_csll"
  | "ignorar";

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

export interface Linha {
  codigo: string | null;
  classificacao: string;
  descricao: string;
  nivel: number;
  analitica: boolean;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
  grupo: Grupo | null;
}

export interface Cabecalho {
  empresa: string | null;
  cnpj: string | null;
  codigoEmpresa: string | null;
  inicio: string | null; // YYYY-MM-DD
  fim: string | null;
}

// ---------------------------------------------------------------- leitura

export const sem = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\(\s*-\s*\)/g, "(MENOS)")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "1.234,56D", "(1.234,56)", "-1234.56", "1.234,56 C" → número com sinal (D positivo, C negativo). */
export function lerValor(v: unknown): { valor: number; natureza: "D" | "C" | null } {
  if (typeof v === "number") return { valor: v, natureza: null };
  let s = String(v ?? "").trim();
  if (!s) return { valor: 0, natureza: null };
  let nat: "D" | "C" | null = null;
  const m = s.match(/\s*([DC])\s*$/i);
  if (m) {
    nat = m[1].toUpperCase() as "D" | "C";
    s = s.slice(0, m.index).trim();
  }
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  s = s.replace(/[R$\s]/g, "");
  const ultV = s.lastIndexOf(","),
    ultP = s.lastIndexOf(".");
  if (ultV >= 0 && ultP >= 0) s = ultV > ultP ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (ultV >= 0) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return { valor: 0, natureza: nat };
  const abs = neg ? -n : n;
  return { valor: nat === "C" ? -Math.abs(abs) : nat === "D" ? Math.abs(abs) : abs, natureza: nat };
}

function data(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const COLS: Record<string, RegExp> = {
  codigo: /^(COD|CODIGO|CONTA|REDUZIDO|COD\.? ?REDUZIDO|CODIGO REDUZIDO)$/,
  classificacao: /CLASSIFICA/,
  descricao: /^(DESCRICAO|DESCRICAO DA CONTA|NOME DA CONTA|CONTA CONTABIL|NOME|HISTORICO)/,
  saldo_anterior: /SALDO ANTERIOR|SALDO INICIAL/,
  debitos: /^DEBITOS?$|^DEBITO NO PERIODO|^MOVIMENTO DEBITO/,
  creditos: /^CREDITOS?$|^CREDITO NO PERIODO|^MOVIMENTO CREDITO/,
  saldo_atual: /SALDO ATUAL|SALDO FINAL/,
};

export interface Leitura {
  cabecalho: Cabecalho;
  linhas: Linha[];
  avisos: string[];
}

/** Recebe a planilha como matriz de células (primeira aba) e devolve as contas. */
export function lerBalancete(matriz: unknown[][]): Leitura {
  const avisos: string[] = [];
  const cab: Cabecalho = { empresa: null, cnpj: null, codigoEmpresa: null, inicio: null, fim: null };

  // cabeçalho do relatório (primeiras 15 linhas)
  for (const lin of matriz.slice(0, 15)) {
    const txt = lin
      .map((c) => String(c ?? ""))
      .join(" ")
      .replace(/\s+/g, " ");
    const t = sem(txt);
    const cnpj = txt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (cnpj && !cab.cnpj) cab.cnpj = cnpj[0];
    const per = txt.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|à|-|até|ate)\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (per && !cab.inicio) {
      cab.inicio = data(per[1]);
      cab.fim = data(per[2]);
    }
    const emp = txt.match(/Empresa\s*:?\s*(?:(\d+)\s*[-–]\s*)?(.+?)(?:\s{2,}|C\.?N\.?P\.?J|CNPJ|Folha|P[aá]gina|$)/i);
    if (emp && !cab.empresa && /EMPRESA/.test(t)) {
      cab.codigoEmpresa = emp[1] ?? null;
      cab.empresa = emp[2].trim() || null;
    }
  }
  if (!cab.empresa) {
    const primeira = matriz.find((l) => l.some((c) => String(c ?? "").trim().length > 3));
    if (primeira) cab.empresa = String(primeira.find((c) => String(c ?? "").trim()) ?? "").trim() || null;
  }

  // linha de títulos das colunas
  let hdr = -1;
  let mapa: Record<string, number> = {};
  for (let i = 0; i < Math.min(matriz.length, 40); i++) {
    const m: Record<string, number> = {};
    matriz[i].forEach((c, j) => {
      const t = sem(c);
      for (const [k, re] of Object.entries(COLS)) if (m[k] === undefined && re.test(t)) m[k] = j;
    });
    if ((m.classificacao !== undefined || m.codigo !== undefined) && m.saldo_atual !== undefined) {
      hdr = i;
      mapa = m;
      break;
    }
  }
  if (hdr < 0)
    throw new Error(
      "Não encontrei os títulos das colunas (Classificação, Descrição, Saldo atual). Exporte o Balancete do Domínio em Excel.",
    );
  if (mapa.descricao === undefined) {
    // Domínio às vezes deixa a descrição sem título, ao lado da classificação
    const base = mapa.classificacao ?? mapa.codigo;
    mapa.descricao = base + 1;
    avisos.push("Coluna de descrição sem título: usei a coluna ao lado da classificação.");
  }

  const linhas: Linha[] = [];
  let temNatureza = false;
  const valor = (lin: unknown[], k: string) => {
    if (mapa[k] === undefined) return 0;
    // o Domínio às vezes põe a natureza (D/C) na célula seguinte
    const v = lin[mapa[k]];
    const prox = String(lin[mapa[k] + 1] ?? "")
      .trim()
      .toUpperCase();
    const r = lerValor(prox === "D" || prox === "C" ? `${v}${prox}` : v);
    if (r.natureza) temNatureza = true;
    return r.valor;
  };

  for (let i = hdr + 1; i < matriz.length; i++) {
    const lin = matriz[i];
    const clas = String(lin[mapa.classificacao ?? -1] ?? "").trim();
    const cod = mapa.codigo !== undefined ? String(lin[mapa.codigo] ?? "").trim() : "";
    const desc = String(lin[mapa.descricao] ?? "").trim();
    const chave = clas || cod;
    if (!chave || !/^\d[\d.\-]*$/.test(chave)) continue; // títulos, totais, rodapés
    if (!desc) continue;
    linhas.push({
      codigo: cod && cod !== clas ? cod : null,
      classificacao: chave.replace(/-/g, "."),
      descricao: desc,
      nivel: chave.replace(/-/g, ".").split(".").filter(Boolean).length,
      analitica: true,
      saldo_anterior: valor(lin, "saldo_anterior"),
      debitos: Math.abs(valor(lin, "debitos")),
      creditos: Math.abs(valor(lin, "creditos")),
      saldo_atual: valor(lin, "saldo_atual"),
      grupo: null,
    });
  }
  if (!linhas.length) throw new Error("Nenhuma conta encontrada no arquivo.");

  // sintética = tem filha
  const classes = linhas.map((l) => l.classificacao);
  for (const l of linhas) l.analitica = !classes.some((c) => c !== l.classificacao && c.startsWith(l.classificacao + "."));

  // sem D/C no arquivo: saldos vêm pela natureza da conta → passivo, PL e receitas viram credores
  if (!temNatureza && normalizarSinal(linhas))
    avisos.push(
      "Saldos sem D/C: considerei a natureza normal de cada conta (ativo e despesas devedores; passivo, PL e receitas credores).",
    );

  return { cabecalho: cab, linhas, avisos };
}

/**
 * Garante a convenção devedor +, credor −. O Excel do Domínio já grava assim (e só formata positivo):
 * a soma das contas de 1º nível fecha em zero e nada muda. Se os saldos vierem todos positivos
 * (relatório sem D/C), passivo, PL e receitas são invertidos. Devolve true quando inverteu.
 */
export function normalizarSinal(linhas: Linha[]): boolean {
  const topo = linhas.filter((l) => l.nivel === 1);
  const somaTopo = topo.reduce((a, l) => a + l.saldo_atual, 0);
  const maiorTopo = Math.max(1, ...topo.map((l) => Math.abs(l.saldo_atual)));
  const temCredorNegativo = topo.some((l) => /PASSIVO/.test(sem(l.descricao)) && l.saldo_atual < 0);
  if (temCredorNegativo || Math.abs(somaTopo) <= maiorTopo * 0.005) return false;
  const credoras = new Set<string>();
  for (const l of linhas) {
    const d = sem(l.descricao);
    if (l.nivel === 1 && /PASSIVO|RECEITA/.test(d)) credoras.add(l.classificacao);
    if (l.nivel <= 2 && /PATRIMONIO LIQUIDO|RECEITA/.test(d)) credoras.add(l.classificacao);
  }
  if (!credoras.size) return false;
  for (const l of linhas) {
    if ([...credoras].some((c) => l.classificacao === c || l.classificacao.startsWith(c + "."))) {
      l.saldo_anterior = -l.saldo_anterior;
      l.saldo_atual = -l.saldo_atual;
    }
  }
  return true;
}

// ---------------------------------------------------------------- classificação

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

// ---------------------------------------------------------------- análise

export interface Resumo {
  // balanço (saldos atuais, valores positivos na natureza da conta)
  disponivel: number;
  clientes: number;
  estoques: number;
  ac_outros: number;
  ac: number;
  rlp: number;
  permanente: number;
  anc: number;
  ativo_total: number;
  fornecedores: number;
  pc_emprestimos: number;
  pc_obrigacoes: number;
  pc_outros: number;
  pc: number;
  pnc_emprestimos: number;
  pnc: number;
  pl: number;
  resultado_exercicio: number;
  // DRE do mês (movimento) e do ano (saldo acumulado)
  mes: Dre;
  ano: Dre;
  debitos: number;
  creditos: number;
}
export interface Dre {
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custos: number;
  lucro_bruto: number;
  despesas_operacionais: number;
  resultado_operacional: number;
  receitas_financeiras: number;
  despesas_financeiras: number;
  outras: number;
  resultado_antes_ir: number;
  ir_csll: number;
  lucro_liquido: number;
  despesas_por_conta: { conta: string; valor: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function dre(linhas: Linha[], valor: (l: Linha) => number): Dre {
  const s = (g: Grupo) => r2(linhas.filter((l) => l.analitica && l.grupo === g).reduce((a, l) => a + valor(l), 0));
  // resultado: receitas credoras (negativas) → invertidas para positivo
  const receita_bruta = -s("receita_bruta");
  const deducoes = s("deducoes");
  const receita_liquida = r2(receita_bruta - deducoes);
  const custos = s("custos");
  const lucro_bruto = r2(receita_liquida - custos);
  const despesas_operacionais = s("despesas_operacionais");
  const resultado_operacional = r2(lucro_bruto - despesas_operacionais);
  const receitas_financeiras = -s("receitas_financeiras");
  const despesas_financeiras = s("despesas_financeiras");
  const outras = r2(-s("outras_receitas") - s("outras_despesas"));
  const resultado_antes_ir = r2(resultado_operacional + receitas_financeiras - despesas_financeiras + outras);
  const ir_csll = s("ir_csll");
  const porConta = new Map<string, number>();
  for (const l of linhas.filter((x) => x.analitica && (x.grupo === "despesas_operacionais" || x.grupo === "custos"))) {
    porConta.set(l.descricao, (porConta.get(l.descricao) ?? 0) + valor(l));
  }
  return {
    receita_bruta,
    deducoes,
    receita_liquida,
    custos,
    lucro_bruto,
    despesas_operacionais,
    resultado_operacional,
    receitas_financeiras,
    despesas_financeiras,
    outras,
    resultado_antes_ir,
    ir_csll,
    lucro_liquido: r2(resultado_antes_ir - ir_csll),
    despesas_por_conta: [...porConta.entries()]
      .map(([conta, v]) => ({ conta, valor: r2(v) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 12),
  };
}

export function resumir(linhas: Linha[]): Resumo {
  const an = linhas.filter((l) => l.analitica);
  const sa = (g: Grupo) => r2(an.filter((l) => l.grupo === g).reduce((a, l) => a + l.saldo_atual, 0));
  const disponivel = sa("ac_disponivel"),
    clientes = sa("ac_clientes"),
    estoques = sa("ac_estoques"),
    ac_outros = sa("ac_outros");
  const ac = r2(disponivel + clientes + estoques + ac_outros);
  const rlp = sa("anc_rlp"),
    permanente = sa("anc_permanente");
  const anc = r2(rlp + permanente);
  const fornecedores = -sa("pc_fornecedores"),
    pc_emprestimos = -sa("pc_emprestimos"),
    pc_obrigacoes = -sa("pc_obrigacoes"),
    pc_outros = -sa("pc_outros");
  const pc = r2(fornecedores + pc_emprestimos + pc_obrigacoes + pc_outros);
  const pnc_emprestimos = -sa("pnc_emprestimos");
  const pnc = r2(pnc_emprestimos - sa("pnc_outros"));
  const pl = -sa("pl");
  const ano = dre(linhas, (l) => l.saldo_atual);
  const mes = dre(linhas, (l) => l.debitos - l.creditos);
  return {
    disponivel,
    clientes,
    estoques,
    ac_outros,
    ac,
    rlp,
    permanente,
    anc,
    ativo_total: r2(ac + anc),
    fornecedores,
    pc_emprestimos,
    pc_obrigacoes,
    pc_outros,
    pc,
    pnc_emprestimos,
    pnc,
    pl,
    resultado_exercicio: ano.lucro_liquido,
    mes,
    ano,
    debitos: r2(an.reduce((a, l) => a + l.debitos, 0)),
    creditos: r2(an.reduce((a, l) => a + l.creditos, 0)),
  };
}

export interface Indices {
  liquidez_corrente: number | null;
  liquidez_seca: number | null;
  liquidez_imediata: number | null;
  liquidez_geral: number | null;
  capital_giro: number;
  endividamento_geral: number | null;
  composicao_endividamento: number | null;
  margem_bruta: number | null;
  margem_operacional: number | null;
  margem_liquida: number | null;
  roe: number | null;
  pmr: number | null; // dias — prazo médio de recebimento
  pmp?: number | null; // prazo médio de pagamento
  pme?: number | null; // prazo médio de estocagem (estoque total)
  pmv?: number | null; // prazo médio de venda (produto pronto/mercadoria até a venda)
  ciclo_operacional?: number | null;
  ciclo_financeiro?: number | null;
  carga_tributaria: number | null;
}

/** Saldos médios e bases para os prazos médios (calculados com o saldo anterior e o atual do balancete). */
export interface BasePrazos {
  dias: number;
  clientes_medio: number;
  estoques_medio: number;
  acabados_medio: number | null; // produtos acabados/mercadorias; null = sem separação no plano de contas
  fornecedores_medio: number;
  compras_fornecedores?: number; // créditos lançados em fornecedores no período = compras a prazo
  estoque_inicial: number;
  estoque_final: number;
}

const div = (a: number, b: number) => (b ? a / b : null);

export function calcularIndices(r: Resumo, diasPeriodo = 30, b?: BasePrazos): Indices {
  const dias = b?.dias ?? diasPeriodo;
  const d = r.mes;
  const cmv = d.custos;
  const temEstoque = !!b && b.estoques_medio > 1 && cmv > 0;
  // compras = CMV + estoque final − estoque inicial; sem estoque (serviços), a base de pagamento são custos + despesas operacionais
  const compras = !b
    ? 0
    : (b.compras_fornecedores ?? 0) > 0
      ? b.compras_fornecedores!
      : temEstoque
        ? cmv + b.estoque_final - b.estoque_inicial
        : cmv + d.despesas_operacionais;
  const dd = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v));
  const pmr = b
    ? d.receita_bruta > 0
      ? dd((b.clientes_medio / d.receita_bruta) * dias)
      : null
    : r.mes.receita_bruta > 0
      ? Math.round((r.clientes / r.mes.receita_bruta) * diasPeriodo)
      : null;
  const pme = temEstoque ? dd((b!.estoques_medio / cmv) * dias) : null;
  const pmv = temEstoque ? dd(((b!.acabados_medio ?? b!.estoques_medio) / cmv) * dias) : null;
  const pmp = b && compras > 0 && b.fornecedores_medio > 0 ? dd((b.fornecedores_medio / compras) * dias) : null;
  const ciclo_operacional = pmr === null ? null : (pme ?? 0) + pmr;
  const ciclo_financeiro = ciclo_operacional === null ? null : ciclo_operacional - (pmp ?? 0);
  const plAjustado = r.pl + r.resultado_exercicio; // PL antes do encerramento + resultado do ano
  return {
    liquidez_corrente: div(r.ac, r.pc),
    liquidez_seca: div(r.ac - r.estoques, r.pc),
    liquidez_imediata: div(r.disponivel, r.pc),
    liquidez_geral: div(r.ac + r.rlp, r.pc + r.pnc),
    capital_giro: r2(r.ac - r.pc),
    endividamento_geral: div(r.pc + r.pnc, r.ativo_total),
    composicao_endividamento: div(r.pc, r.pc + r.pnc),
    margem_bruta: div(r.ano.lucro_bruto, r.ano.receita_liquida),
    margem_operacional: div(r.ano.resultado_operacional, r.ano.receita_liquida),
    margem_liquida: div(r.ano.lucro_liquido, r.ano.receita_liquida),
    roe: plAjustado > 0 ? div(r.ano.lucro_liquido, plAjustado) : null,
    pmr,
    pmp,
    pme,
    pmv,
    ciclo_operacional,
    ciclo_financeiro,
    carga_tributaria: div(r.ano.deducoes + r.ano.ir_csll, r.ano.receita_bruta),
  };
}

export const INDICES_INFO: {
  id: keyof Indices;
  nome: string;
  formato: FormatoIndice;
  leitura: string;
  alerta?: (v: number) => boolean;
}[] = [
  {
    id: "liquidez_corrente",
    nome: "Liquidez corrente",
    formato: "x",
    leitura: "quanto há em caixa e a receber para cada R$ 1 de dívida de curto prazo",
    alerta: (v) => v < 1,
  },
  {
    id: "liquidez_seca",
    nome: "Liquidez seca",
    formato: "x",
    leitura: "a mesma conta sem depender de vender o estoque",
    alerta: (v) => v < 0.8,
  },
  {
    id: "liquidez_imediata",
    nome: "Liquidez imediata",
    formato: "x",
    leitura: "quanto das dívidas de curto prazo o caixa paga hoje",
    alerta: (v) => v < 0.2,
  },
  { id: "liquidez_geral", nome: "Liquidez geral", formato: "x", leitura: "capacidade de pagar todas as dívidas", alerta: (v) => v < 1 },
  { id: "capital_giro", nome: "Capital de giro", formato: "R$", leitura: "folga (ou falta) de dinheiro para operar", alerta: (v) => v < 0 },
  {
    id: "endividamento_geral",
    nome: "Endividamento geral",
    formato: "%",
    leitura: "quanto do que a empresa tem é financiado por terceiros",
    alerta: (v) => v > 0.7,
  },
  {
    id: "composicao_endividamento",
    nome: "Dívida de curto prazo",
    formato: "%",
    leitura: "quanto da dívida vence em até 12 meses",
    alerta: (v) => v > 0.8,
  },
  { id: "margem_bruta", nome: "Margem bruta", formato: "%", leitura: "quanto sobra de cada R$ 100 vendidos depois dos custos" },
  {
    id: "margem_operacional",
    nome: "Margem operacional",
    formato: "%",
    leitura: "quanto sobra depois das despesas da operação",
    alerta: (v) => v < 0,
  },
  { id: "margem_liquida", nome: "Margem líquida", formato: "%", leitura: "lucro final de cada R$ 100 vendidos", alerta: (v) => v < 0 },
  { id: "roe", nome: "Retorno sobre o patrimônio", formato: "%", leitura: "quanto o capital dos sócios rendeu no ano" },
  {
    id: "pmr",
    nome: "PMR · Prazo médio de recebimento",
    formato: "dias",
    leitura: "em quantos dias, em média, a empresa recebe dos clientes depois de vender",
    alerta: (v) => v > 60,
  },
  {
    id: "pmp",
    nome: "PMP · Prazo médio de pagamento",
    formato: "dias",
    leitura: "em quantos dias, em média, a empresa paga fornecedores (base: compras lançadas em fornecedores no período)",
  },
  {
    id: "pme",
    nome: "PME · Prazo médio de estocagem",
    formato: "dias",
    leitura: "quantos dias o estoque (matéria-prima a produto) fica parado até sair; vazio quando não há estoque",
    alerta: (v) => v > 120,
  },
  {
    id: "pmv",
    nome: "PMV · Prazo médio de venda",
    formato: "dias",
    leitura: "quantos dias o produto pronto ou a mercadoria espera até ser vendido; vazio quando não há estoque",
    alerta: (v) => v > 90,
  },
  { id: "ciclo_operacional", nome: "Ciclo operacional", formato: "dias", leitura: "do estoque ao dinheiro na conta: PME + PMR" },
  {
    id: "ciclo_financeiro",
    nome: "Ciclo financeiro (de caixa)",
    formato: "dias",
    leitura: "quantos dias a empresa banca a operação com dinheiro próprio ou de banco: ciclo operacional − PMP",
    alerta: (v) => v > 60,
  },
  {
    id: "carga_tributaria",
    nome: "Carga tributária efetiva",
    formato: "%",
    leitura: "quanto da receita bruta vai para impostos (vendas + IRPJ/CSLL)",
  },
];

// ---------------------------------------------------------------- conferências e fragilidades

export interface Conferencia {
  nome: string;
  ok: boolean;
  detalhe: string;
}
export interface Alerta {
  area: string;
  nivel: "alto" | "medio";
  texto: string;
  evidencia: string;
  recomendacao: string;
}

export function conferir(r: Resumo, linhas: Linha[], competencia: string | null): Conferencia[] {
  const dif = Math.abs(r.debitos - r.creditos);
  // com sinal (devedor +, credor −), a soma de todas as contas analíticas é zero quando ativo = passivo + PL + resultado
  const difBal = Math.abs(linhas.filter((l) => l.analitica).reduce((a, l) => a + l.saldo_atual, 0));
  const semGrupo = linhas.filter((l) => l.analitica && !l.grupo).length;
  return [
    { nome: "Balancete fechado (débitos = créditos)", ok: dif < 1, detalhe: dif < 1 ? "ok" : `diferença de ${reais(dif)}` },
    { nome: "Ativo = passivo + PL + resultado do ano", ok: difBal < 1, detalhe: difBal < 1 ? "ok" : `diferença de ${reais(difBal)}` },
    {
      nome: "Competência identificada",
      ok: !!competencia,
      detalhe: competencia ? fmtCompetencia(competencia) : "informe o mês",
    },
    { nome: "Todas as contas com grupo gerencial", ok: semGrupo === 0, detalhe: semGrupo ? `${semGrupo} conta(s) sem grupo` : "ok" },
  ];
}

export function fragilidades(r: Resumo, i: Indices, linhas: Linha[], anterior?: Resumo | null): Alerta[] {
  const out: Alerta[] = [];
  const an = linhas.filter((l) => l.analitica);
  const d = (l: Linha) => sem(l.descricao);

  if (i.liquidez_corrente !== null && i.liquidez_corrente < 1)
    out.push({
      area: "Liquidez e capital de giro",
      nivel: "alto",
      texto: "Liquidez corrente abaixo de 1",
      evidencia: `AC ${reais(r.ac)} × PC ${reais(r.pc)} (${fmtIndice(i.liquidez_corrente, "x")})`,
      recomendacao: "Rever prazos com fornecedores e bancos e avaliar alongar dívidas de curto prazo.",
    });
  if (i.capital_giro < 0)
    out.push({
      area: "Liquidez e capital de giro",
      nivel: "alto",
      texto: "Capital de giro negativo",
      evidencia: reais(i.capital_giro),
      recomendacao: "Planejar o caixa dos próximos meses e evitar novos compromissos de curto prazo.",
    });
  for (const l of an.filter((x) => x.grupo === "ac_disponivel" && x.saldo_atual < -1))
    out.push({
      area: "Caixa",
      nivel: "alto",
      texto: `Saldo credor em ${l.descricao}`,
      evidencia: `${l.classificacao} · ${reais(l.saldo_atual)}`,
      recomendacao: "Conferir a conciliação: caixa ou banco credor indica estouro ou lançamento faltando.",
    });
  for (const l of an.filter(
    (x) =>
      x.grupo === "ac_disponivel" &&
      /CAIXA/.test(d(x)) &&
      x.debitos === 0 &&
      x.creditos === 0 &&
      x.saldo_atual > Math.max(20000, r.ativo_total * 0.1),
  ))
    out.push({
      area: "Caixa",
      nivel: "medio",
      texto: "Caixa alto sem movimento no mês",
      evidencia: `${l.descricao} · ${reais(l.saldo_atual)}`,
      recomendacao: "Confirmar a existência do dinheiro; saldo de caixa parado pode ser saldo fictício.",
    });
  if (r.pl + r.resultado_exercicio < 0)
    out.push({
      area: "Patrimônio líquido",
      nivel: "alto",
      texto: "Patrimônio líquido negativo (passivo a descoberto)",
      evidencia: reais(r.pl + r.resultado_exercicio),
      recomendacao: "Avaliar aporte de capital ou conversão de mútuos em capital.",
    });
  if (r.ano.lucro_liquido < 0)
    out.push({
      area: "Resultado",
      nivel: "medio",
      texto: "Prejuízo acumulado no ano",
      evidencia: reais(r.ano.lucro_liquido),
      recomendacao: "Revisar preços, custos e as despesas que mais cresceram.",
    });
  const socios = an.filter(
    (x) => x.grupo !== "pl" && /SOCIO|MUTUO|ADIANTAMENTO A SOCIO|CONTA CORRENTE.*SOCIO/.test(d(x)) && x.saldo_atual > 0,
  );
  const totSocios = socios.reduce((a, x) => a + x.saldo_atual, 0);
  if (totSocios > Math.max(10000, r.ativo_total * 0.05))
    out.push({
      area: "Contas com sócios",
      nivel: "medio",
      texto: "Valores a receber de sócios elevados",
      evidencia: `${socios.length} conta(s) · ${reais(totSocios)}`,
      recomendacao: "Regularizar por distribuição de lucros ou devolução; mútuo com sócio tem efeito tributário (IOF).",
    });
  if (i.pmr !== null && i.pmr > 60)
    out.push({
      area: "Recebimento",
      nivel: "medio",
      texto: "Prazo médio de recebimento alto",
      evidencia: `${i.pmr} dias`,
      recomendacao: "Revisar a carteira de clientes vencidos e a política de crédito.",
    });
  if (i.ciclo_financeiro != null && i.ciclo_financeiro > 60 && (i.pmr ?? 0) > 0)
    out.push({
      area: "Capital de giro",
      nivel: "medio",
      texto: "Ciclo financeiro longo",
      evidencia: `${i.ciclo_financeiro} dias (PMR ${i.pmr ?? "—"}${i.pme != null ? `, PME ${i.pme}` : ""}, PMP ${i.pmp ?? "—"})`,
      recomendacao: "Encurtar o prazo de recebimento ou alongar o de pagamento reduz a necessidade de capital de giro.",
    });
  if (anterior && r.pc_obrigacoes > anterior.pc_obrigacoes * 1.15 && r.pc_obrigacoes - anterior.pc_obrigacoes > 5000)
    out.push({
      area: "Obrigações fiscais e trabalhistas",
      nivel: "alto",
      texto: "Tributos e encargos a recolher acumulando",
      evidencia: `${reais(anterior.pc_obrigacoes)} → ${reais(r.pc_obrigacoes)}`,
      recomendacao: "Verificar guias não pagas e parcelamentos em atraso antes que virem dívida ativa.",
    });
  const temFolha = an.some((x) => /SALARIO|ORDENADO|PRO.?LABORE/.test(d(x)) && x.grupo === "despesas_operacionais" && x.saldo_atual > 0);
  const temProvFerias = an.some((x) => /PROVIS.*(FERIAS|13)/.test(d(x)) && x.saldo_atual !== 0);
  if (temFolha && !temProvFerias)
    out.push({
      area: "Provisões",
      nivel: "medio",
      texto: "Sem provisão de férias e 13º",
      evidencia: "há despesa de salários, mas nenhuma conta de provisão com saldo",
      recomendacao: "Lançar as provisões mensais de férias, 13º e encargos.",
    });
  const temImob = r.permanente > 0;
  const temDepr = an.some((x) => /DEPRECIAC|AMORTIZAC/.test(d(x)) && (x.debitos > 0 || x.creditos > 0));
  if (temImob && !temDepr && r.permanente > 20000)
    out.push({
      area: "Provisões",
      nivel: "medio",
      texto: "Imobilizado sem depreciação no mês",
      evidencia: `imobilizado ${reais(r.permanente)}`,
      recomendacao: "Conferir o cálculo e o lançamento da depreciação.",
    });
  const transit = an.filter((x) => /A CLASSIFICAR|TRANSITORIA|A IDENTIFICAR|PENDENTE/.test(d(x)) && Math.abs(x.saldo_atual) > 100);
  if (transit.length)
    out.push({
      area: "Contas transitórias",
      nivel: "medio",
      texto: "Saldo em contas a classificar",
      evidencia: transit.map((x) => `${x.descricao} ${reais(x.saldo_atual)}`).join("; "),
      recomendacao: "Identificar e reclassificar os lançamentos pendentes.",
    });
  for (const l of an.filter((x) => x.grupo === "ac_estoques" && x.saldo_atual < -1))
    out.push({
      area: "Estoques",
      nivel: "alto",
      texto: `Estoque negativo em ${l.descricao}`,
      evidencia: reais(l.saldo_atual),
      recomendacao: "Conferir notas de entrada e baixas de estoque.",
    });
  if (anterior && anterior.estoques > 0 && r.estoques > anterior.estoques * 1.3 && r.mes.receita_bruta <= anterior.mes.receita_bruta)
    out.push({
      area: "Estoques",
      nivel: "medio",
      texto: "Estoque crescendo sem crescer as vendas",
      evidencia: `${reais(anterior.estoques)} → ${reais(r.estoques)}`,
      recomendacao: "Avaliar compras e itens parados.",
    });
  if (
    anterior &&
    r.pc_emprestimos + r.pnc_emprestimos > (anterior.pc_emprestimos + anterior.pnc_emprestimos) * 1.1 &&
    r.mes.receita_bruta <= anterior.mes.receita_bruta
  )
    out.push({
      area: "Endividamento",
      nivel: "medio",
      texto: "Empréstimos crescendo mais que a receita",
      evidencia: `${reais(anterior.pc_emprestimos + anterior.pnc_emprestimos)} → ${reais(r.pc_emprestimos + r.pnc_emprestimos)}`,
      recomendacao: "Rever a necessidade e o custo dos financiamentos.",
    });
  if (i.composicao_endividamento !== null && i.composicao_endividamento > 0.8 && r.pc_emprestimos > 0)
    out.push({
      area: "Endividamento",
      nivel: "medio",
      texto: "Dívida concentrada no curto prazo",
      evidencia: fmtIndice(i.composicao_endividamento, "%"),
      recomendacao: "Negociar alongamento dos empréstimos.",
    });
  if (anterior && anterior.ano.receita_liquida > 0 && r.ano.receita_liquida > 0) {
    const mAnt = anterior.ano.lucro_liquido / anterior.ano.receita_liquida;
    const mAt = r.ano.lucro_liquido / r.ano.receita_liquida;
    if (mAt < mAnt - 0.03)
      out.push({
        area: "Resultado",
        nivel: "medio",
        texto: "Margem líquida em queda",
        evidencia: `${fmtIndice(mAnt, "%")} → ${fmtIndice(mAt, "%")}`,
        recomendacao: "Identificar as despesas que cresceram acima da receita.",
      });
  }
  return out;
}

// ---------------------------------------------------------------- parecer (ver parecer.ts)

/** Markdown simples (títulos, listas, negrito, itálico) → HTML para tela e impressão. */
export function mdParaHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/_(.+?)_/g, "<i>$1</i>");
  const out: string[] = [];
  let lista = false;
  for (const linha of md.split("\n")) {
    const l = linha.trimEnd();
    if (/^- /.test(l)) {
      if (!lista) out.push("<ul>");
      lista = true;
      out.push(`<li>${inline(l.slice(2))}</li>`);
      continue;
    }
    if (lista) {
      out.push("</ul>");
      lista = false;
    }
    if (/^> /.test(l)) out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l) out.push(`<p>${inline(l)}</p>`);
  }
  if (lista) out.push("</ul>");
  return out.join("\n");
}
