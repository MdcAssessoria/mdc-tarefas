// Leitura do balancete exportado pelo Domínio, classificação gerencial, índices,
// verificações de fragilidade e rascunho do parecer técnico.
// Convenção interna: devedor = positivo, credor = negativo.

export type Grupo =
  | "ac_disponivel" | "ac_clientes" | "ac_estoques" | "ac_outros"
  | "anc_rlp" | "anc_permanente"
  | "pc_fornecedores" | "pc_emprestimos" | "pc_obrigacoes" | "pc_outros"
  | "pnc_emprestimos" | "pnc_outros"
  | "pl"
  | "receita_bruta" | "deducoes" | "custos" | "despesas_operacionais"
  | "receitas_financeiras" | "despesas_financeiras" | "outras_receitas" | "outras_despesas" | "ir_csll"
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

const sem = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
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
  const ultV = s.lastIndexOf(","), ultP = s.lastIndexOf(".");
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
    const txt = lin.map((c) => String(c ?? "")).join(" ").replace(/\s+/g, " ");
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
  if (hdr < 0) throw new Error("Não encontrei os títulos das colunas (Classificação, Descrição, Saldo atual). Exporte o Balancete do Domínio em Excel.");
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
    const prox = String(lin[mapa[k] + 1] ?? "").trim().toUpperCase();
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
  if (!temNatureza) {
    avisos.push("Saldos sem D/C: considerei a natureza normal de cada conta (ativo e despesas devedores; passivo, PL e receitas credores).");
    const credoras = new Set<string>();
    for (const l of linhas) {
      const d = sem(l.descricao);
      if (l.nivel === 1 && /PASSIVO|RECEITA/.test(d)) credoras.add(l.classificacao);
      if (l.nivel <= 2 && /PATRIMONIO LIQUIDO|RECEITA/.test(d)) credoras.add(l.classificacao);
    }
    for (const l of linhas) {
      const credora = [...credoras].some((c) => l.classificacao === c || l.classificacao.startsWith(c + "."));
      if (credora) {
        l.saldo_anterior = -l.saldo_anterior;
        l.saldo_atual = -l.saldo_atual;
      }
    }
  }

  return { cabecalho: cab, linhas, avisos };
}

// ---------------------------------------------------------------- classificação

const REGRAS: { re: RegExp; grupo: Grupo; dentro?: RegExp }[] = [
  // ativo
  { re: /DISPONI|^CAIXA|BANCOS?\b|APLICAC.*FINANC|NUMERARIO/, grupo: "ac_disponivel", dentro: /ATIVO/ },
  { re: /CLIENTES|DUPLICATAS A RECEBER|CONTAS A RECEBER|VALORES A RECEBER|CARTOES? A RECEBER/, grupo: "ac_clientes", dentro: /ATIVO CIRCULANTE|^CIRCULANTE/ },
  { re: /ESTOQUE|MERCADORIAS|MATERIA.? PRIMA|PRODUTOS ACABADOS/, grupo: "ac_estoques", dentro: /ATIVO/ },
  { re: /REALIZAVEL A LONGO PRAZO/, grupo: "anc_rlp" },
  { re: /IMOBILIZADO|INTANGIVEL|INVESTIMENTOS|DIFERIDO/, grupo: "anc_permanente", dentro: /ATIVO/ },
  { re: /MOVEIS|UTENSILIOS|VEICULOS|MAQUINAS|EQUIPAMENTOS|EDIFICACOES|IMOVEIS|TERRENOS|COMPUTADORES|INSTALACOES|BENFEITORIAS|SOFTWARE|MARCAS|DEPRECIACAO|AMORTIZACAO ACUMULADA/, grupo: "anc_permanente", dentro: /ATIVO NAO CIRCULANTE|^ATIVO$|PERMANENTE/ },
  // passivo
  { re: /FORNECEDORES/, grupo: "pc_fornecedores", dentro: /PASSIVO CIRCULANTE|^CIRCULANTE/ },
  { re: /EMPRESTIMOS|FINANCIAMENTOS/, grupo: "pc_emprestimos", dentro: /PASSIVO CIRCULANTE|^CIRCULANTE/ },
  { re: /EMPRESTIMOS|FINANCIAMENTOS/, grupo: "pnc_emprestimos", dentro: /NAO CIRCULANTE|LONGO PRAZO/ },
  { re: /OBRIGACOES (TRIBUTARIAS|FISCAIS|TRABALHISTAS|SOCIAIS|PREVIDENCIARIAS)|IMPOSTOS A RECOLHER|TRIBUTOS A RECOLHER|ENCARGOS SOCIAIS|SALARIOS A PAGAR|PROVISOES (TRABALHISTAS|DE FERIAS)|PARCELAMENTO/, grupo: "pc_obrigacoes", dentro: /PASSIVO CIRCULANTE|^CIRCULANTE/ },
  { re: /PATRIMONIO LIQUIDO/, grupo: "pl" },
  // resultado
  { re: /DEDUC|DEVOLUC|CANCELAMENTO|ABATIMENTO|IMPOSTOS (SOBRE|INCIDENTES)|IMPOSTOS E CONTRIBUICOES SOBRE|SIMPLES NACIONAL|\(-\)/, grupo: "deducoes", dentro: /RECEITA/ },
  { re: /RECEITAS? FINANCEIRAS|RENDIMENTOS DE APLICAC|JUROS ATIVOS|DESCONTOS OBTIDOS/, grupo: "receitas_financeiras" },
  { re: /DESPESAS? FINANCEIRAS|JUROS PASSIVOS|TARIFAS BANCARIAS|DESPESAS BANCARIAS|IOF/, grupo: "despesas_financeiras" },
  { re: /PROVISAO PARA (O )?(IMPOSTO DE RENDA|IR|IRPJ)|CONTRIBUICAO SOCIAL SOBRE O LUCRO|^IRPJ|^CSLL|IMPOSTO DE RENDA E CONTRIBUICAO/, grupo: "ir_csll" },
  { re: /OUTRAS RECEITAS|RECEITAS NAO OPERACIONAIS|GANHO NA (ALIENACAO|VENDA)/, grupo: "outras_receitas" },
  { re: /OUTRAS DESPESAS|DESPESAS NAO OPERACIONAIS|PERDA NA (ALIENACAO|VENDA)/, grupo: "outras_despesas" },
  { re: /CUSTO/, grupo: "custos" },
  { re: /RECEITA BRUTA|RECEITA OPERACIONAL|VENDAS?|PRESTACAO DE SERVICOS|FATURAMENTO|RECEITA DE SERVICOS|RECEITAS?$/, grupo: "receita_bruta" },
  { re: /DESPESA/, grupo: "despesas_operacionais" },
  { re: /APURACAO|ENCERRAMENTO|RESULTADO DO EXERCICIO/, grupo: "ignorar" },
];

/** Atribui grupo a cada conta: mapa salvo (prefixo mais longo) → regras pelas descrições dos ancestrais. */
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
    const anc = ancestrais(l.classificacao);
    const caminho = anc.map((a) => sem(a.descricao));
    const topo = caminho[caminho.length - 1] ?? "";
    let g: Grupo | null = null;
    for (const d of caminho) {
      const r = REGRAS.find((x) => x.re.test(d) && (!x.dentro || caminho.some((c) => x.dentro!.test(c))));
      if (r) {
        g = r.grupo;
        break;
      }
    }
    // padrão pelo bloco quando nenhuma regra específica casou
    if (!g || (g === "ac_disponivel" && !/ATIVO/.test(caminho.join("|")))) {
      const tudo = caminho.join("|");
      if (/ATIVO/.test(topo) || l.classificacao.startsWith("1")) g = /NAO CIRCULANTE|LONGO PRAZO/.test(tudo) ? "anc_rlp" : "ac_outros";
      else if (/PATRIMONIO/.test(tudo)) g = "pl";
      else if (/PASSIVO/.test(topo) || l.classificacao.startsWith("2")) g = /NAO CIRCULANTE|LONGO PRAZO|EXIGIVEL A LONGO/.test(tudo) ? "pnc_outros" : "pc_outros";
      else if (/RECEITA/.test(tudo)) g = "receita_bruta";
      else if (/CUSTO/.test(tudo)) g = "custos";
      else g = g ?? "despesas_operacionais";
    }
    l.grupo = g;
  }
  return linhas;
}

// ---------------------------------------------------------------- análise

export interface Resumo {
  // balanço (saldos atuais, valores positivos na natureza da conta)
  disponivel: number; clientes: number; estoques: number; ac_outros: number; ac: number;
  rlp: number; permanente: number; anc: number; ativo_total: number;
  fornecedores: number; pc_emprestimos: number; pc_obrigacoes: number; pc_outros: number; pc: number;
  pnc_emprestimos: number; pnc: number; pl: number; resultado_exercicio: number;
  // DRE do mês (movimento) e do ano (saldo acumulado)
  mes: Dre; ano: Dre;
  debitos: number; creditos: number;
}
export interface Dre {
  receita_bruta: number; deducoes: number; receita_liquida: number; custos: number; lucro_bruto: number;
  despesas_operacionais: number; resultado_operacional: number; receitas_financeiras: number; despesas_financeiras: number;
  outras: number; resultado_antes_ir: number; ir_csll: number; lucro_liquido: number;
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
    receita_bruta, deducoes, receita_liquida, custos, lucro_bruto, despesas_operacionais, resultado_operacional,
    receitas_financeiras, despesas_financeiras, outras, resultado_antes_ir, ir_csll,
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
  const disponivel = sa("ac_disponivel"), clientes = sa("ac_clientes"), estoques = sa("ac_estoques"), ac_outros = sa("ac_outros");
  const ac = r2(disponivel + clientes + estoques + ac_outros);
  const rlp = sa("anc_rlp"), permanente = sa("anc_permanente");
  const anc = r2(rlp + permanente);
  const fornecedores = -sa("pc_fornecedores"), pc_emprestimos = -sa("pc_emprestimos"), pc_obrigacoes = -sa("pc_obrigacoes"), pc_outros = -sa("pc_outros");
  const pc = r2(fornecedores + pc_emprestimos + pc_obrigacoes + pc_outros);
  const pnc_emprestimos = -sa("pnc_emprestimos");
  const pnc = r2(pnc_emprestimos - sa("pnc_outros"));
  const pl = -sa("pl");
  const ano = dre(linhas, (l) => l.saldo_atual);
  const mes = dre(linhas, (l) => l.debitos - l.creditos);
  return {
    disponivel, clientes, estoques, ac_outros, ac, rlp, permanente, anc, ativo_total: r2(ac + anc),
    fornecedores, pc_emprestimos, pc_obrigacoes, pc_outros, pc, pnc_emprestimos, pnc, pl,
    resultado_exercicio: ano.lucro_liquido,
    mes, ano,
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
  pmr: number | null; // dias
  carga_tributaria: number | null;
}

const div = (a: number, b: number) => (b ? a / b : null);

export function calcularIndices(r: Resumo, diasPeriodo = 30): Indices {
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
    pmr: r.mes.receita_bruta > 0 ? Math.round((r.clientes / r.mes.receita_bruta) * diasPeriodo) : null,
    carga_tributaria: div(r.ano.deducoes + r.ano.ir_csll, r.ano.receita_bruta),
  };
}

export const INDICES_INFO: { id: keyof Indices; nome: string; formato: "x" | "%" | "R$" | "dias"; leitura: string; alerta?: (v: number) => boolean }[] = [
  { id: "liquidez_corrente", nome: "Liquidez corrente", formato: "x", leitura: "quanto há em caixa e a receber para cada R$ 1 de dívida de curto prazo", alerta: (v) => v < 1 },
  { id: "liquidez_seca", nome: "Liquidez seca", formato: "x", leitura: "a mesma conta sem depender de vender o estoque", alerta: (v) => v < 0.8 },
  { id: "liquidez_imediata", nome: "Liquidez imediata", formato: "x", leitura: "quanto das dívidas de curto prazo o caixa paga hoje", alerta: (v) => v < 0.2 },
  { id: "liquidez_geral", nome: "Liquidez geral", formato: "x", leitura: "capacidade de pagar todas as dívidas", alerta: (v) => v < 1 },
  { id: "capital_giro", nome: "Capital de giro", formato: "R$", leitura: "folga (ou falta) de dinheiro para operar", alerta: (v) => v < 0 },
  { id: "endividamento_geral", nome: "Endividamento geral", formato: "%", leitura: "quanto do que a empresa tem é financiado por terceiros", alerta: (v) => v > 0.7 },
  { id: "composicao_endividamento", nome: "Dívida de curto prazo", formato: "%", leitura: "quanto da dívida vence em até 12 meses", alerta: (v) => v > 0.8 },
  { id: "margem_bruta", nome: "Margem bruta", formato: "%", leitura: "quanto sobra de cada R$ 100 vendidos depois dos custos" },
  { id: "margem_operacional", nome: "Margem operacional", formato: "%", leitura: "quanto sobra depois das despesas da operação", alerta: (v) => v < 0 },
  { id: "margem_liquida", nome: "Margem líquida", formato: "%", leitura: "lucro final de cada R$ 100 vendidos", alerta: (v) => v < 0 },
  { id: "roe", nome: "Retorno sobre o patrimônio", formato: "%", leitura: "quanto o capital dos sócios rendeu no ano" },
  { id: "pmr", nome: "Prazo médio de recebimento", formato: "dias", leitura: "em quantos dias, em média, a empresa recebe", alerta: (v) => v > 60 },
  { id: "carga_tributaria", nome: "Carga tributária efetiva", formato: "%", leitura: "quanto da receita bruta vai para impostos (vendas + IRPJ/CSLL)" },
];

export function fmtIndice(v: number | null | undefined, f: "x" | "%" | "R$" | "dias") {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (f === "x") return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (f === "%") return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  if (f === "dias") return `${Math.round(v)} dias`;
  return brl(v);
}

export const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ---------------------------------------------------------------- conferências e fragilidades

export interface Conferencia { nome: string; ok: boolean; detalhe: string }
export interface Alerta { area: string; nivel: "alto" | "medio"; texto: string; evidencia: string; recomendacao: string }

export function conferir(r: Resumo, linhas: Linha[], competencia: string | null): Conferencia[] {
  const dif = Math.abs(r.debitos - r.creditos);
  const passivoTotal = r.pc + r.pnc + r.pl + r.resultado_exercicio;
  const difBal = Math.abs(r.ativo_total - passivoTotal);
  const semGrupo = linhas.filter((l) => l.analitica && !l.grupo).length;
  return [
    { nome: "Balancete fechado (débitos = créditos)", ok: dif < 1, detalhe: dif < 1 ? "ok" : `diferença de ${brl(dif)}` },
    { nome: "Ativo = passivo + PL + resultado do ano", ok: difBal < 1, detalhe: difBal < 1 ? "ok" : `diferença de ${brl(difBal)}` },
    { nome: "Competência identificada", ok: !!competencia, detalhe: competencia ? competencia.slice(0, 7).split("-").reverse().join("/") : "informe o mês" },
    { nome: "Todas as contas com grupo gerencial", ok: semGrupo === 0, detalhe: semGrupo ? `${semGrupo} conta(s) sem grupo` : "ok" },
  ];
}

export function fragilidades(r: Resumo, i: Indices, linhas: Linha[], anterior?: Resumo | null): Alerta[] {
  const out: Alerta[] = [];
  const an = linhas.filter((l) => l.analitica);
  const d = (l: Linha) => sem(l.descricao);

  if (i.liquidez_corrente !== null && i.liquidez_corrente < 1)
    out.push({ area: "Liquidez e capital de giro", nivel: "alto", texto: "Liquidez corrente abaixo de 1", evidencia: `AC ${brl(r.ac)} × PC ${brl(r.pc)} (${fmtIndice(i.liquidez_corrente, "x")})`, recomendacao: "Rever prazos com fornecedores e bancos e avaliar alongar dívidas de curto prazo." });
  if (i.capital_giro < 0)
    out.push({ area: "Liquidez e capital de giro", nivel: "alto", texto: "Capital de giro negativo", evidencia: brl(i.capital_giro), recomendacao: "Planejar o caixa dos próximos meses e evitar novos compromissos de curto prazo." });
  for (const l of an.filter((x) => x.grupo === "ac_disponivel" && x.saldo_atual < -1))
    out.push({ area: "Caixa", nivel: "alto", texto: `Saldo credor em ${l.descricao}`, evidencia: `${l.classificacao} · ${brl(l.saldo_atual)}`, recomendacao: "Conferir a conciliação: caixa ou banco credor indica estouro ou lançamento faltando." });
  for (const l of an.filter((x) => x.grupo === "ac_disponivel" && /CAIXA/.test(d(x)) && x.debitos === 0 && x.creditos === 0 && x.saldo_atual > Math.max(20000, r.ativo_total * 0.1)))
    out.push({ area: "Caixa", nivel: "medio", texto: "Caixa alto sem movimento no mês", evidencia: `${l.descricao} · ${brl(l.saldo_atual)}`, recomendacao: "Confirmar a existência do dinheiro; saldo de caixa parado pode ser saldo fictício." });
  if (r.pl + r.resultado_exercicio < 0)
    out.push({ area: "Patrimônio líquido", nivel: "alto", texto: "Patrimônio líquido negativo (passivo a descoberto)", evidencia: brl(r.pl + r.resultado_exercicio), recomendacao: "Avaliar aporte de capital ou conversão de mútuos em capital." });
  if (r.ano.lucro_liquido < 0)
    out.push({ area: "Resultado", nivel: "medio", texto: "Prejuízo acumulado no ano", evidencia: brl(r.ano.lucro_liquido), recomendacao: "Revisar preços, custos e as despesas que mais cresceram." });
  const socios = an.filter((x) => x.grupo !== "pl" && /SOCIO|MUTUO|ADIANTAMENTO A SOCIO|CONTA CORRENTE.*SOCIO/.test(d(x)) && x.saldo_atual > 0);
  const totSocios = socios.reduce((a, x) => a + x.saldo_atual, 0);
  if (totSocios > Math.max(10000, r.ativo_total * 0.05))
    out.push({ area: "Contas com sócios", nivel: "medio", texto: "Valores a receber de sócios elevados", evidencia: `${socios.length} conta(s) · ${brl(totSocios)}`, recomendacao: "Regularizar por distribuição de lucros ou devolução; mútuo com sócio tem efeito tributário (IOF)." });
  if (i.pmr !== null && i.pmr > 60)
    out.push({ area: "Recebimento", nivel: "medio", texto: "Prazo médio de recebimento alto", evidencia: `${i.pmr} dias`, recomendacao: "Revisar a carteira de clientes vencidos e a política de crédito." });
  if (anterior && r.pc_obrigacoes > anterior.pc_obrigacoes * 1.15 && r.pc_obrigacoes - anterior.pc_obrigacoes > 5000)
    out.push({ area: "Obrigações fiscais e trabalhistas", nivel: "alto", texto: "Tributos e encargos a recolher acumulando", evidencia: `${brl(anterior.pc_obrigacoes)} → ${brl(r.pc_obrigacoes)}`, recomendacao: "Verificar guias não pagas e parcelamentos em atraso antes que virem dívida ativa." });
  const temFolha = an.some((x) => /SALARIO|ORDENADO|PRO.?LABORE/.test(d(x)) && x.grupo === "despesas_operacionais" && x.saldo_atual > 0);
  const temProvFerias = an.some((x) => /PROVIS.*(FERIAS|13)/.test(d(x)) && x.saldo_atual !== 0);
  if (temFolha && !temProvFerias)
    out.push({ area: "Provisões", nivel: "medio", texto: "Sem provisão de férias e 13º", evidencia: "há despesa de salários, mas nenhuma conta de provisão com saldo", recomendacao: "Lançar as provisões mensais de férias, 13º e encargos." });
  const temImob = r.permanente > 0;
  const temDepr = an.some((x) => /DEPRECIAC|AMORTIZAC/.test(d(x)) && (x.debitos > 0 || x.creditos > 0));
  if (temImob && !temDepr && r.permanente > 20000)
    out.push({ area: "Provisões", nivel: "medio", texto: "Imobilizado sem depreciação no mês", evidencia: `imobilizado ${brl(r.permanente)}`, recomendacao: "Conferir o cálculo e o lançamento da depreciação." });
  const transit = an.filter((x) => /A CLASSIFICAR|TRANSITORIA|A IDENTIFICAR|PENDENTE/.test(d(x)) && Math.abs(x.saldo_atual) > 100);
  if (transit.length)
    out.push({ area: "Contas transitórias", nivel: "medio", texto: "Saldo em contas a classificar", evidencia: transit.map((x) => `${x.descricao} ${brl(x.saldo_atual)}`).join("; "), recomendacao: "Identificar e reclassificar os lançamentos pendentes." });
  for (const l of an.filter((x) => x.grupo === "ac_estoques" && x.saldo_atual < -1))
    out.push({ area: "Estoques", nivel: "alto", texto: `Estoque negativo em ${l.descricao}`, evidencia: brl(l.saldo_atual), recomendacao: "Conferir notas de entrada e baixas de estoque." });
  if (anterior && anterior.estoques > 0 && r.estoques > anterior.estoques * 1.3 && r.mes.receita_bruta <= anterior.mes.receita_bruta)
    out.push({ area: "Estoques", nivel: "medio", texto: "Estoque crescendo sem crescer as vendas", evidencia: `${brl(anterior.estoques)} → ${brl(r.estoques)}`, recomendacao: "Avaliar compras e itens parados." });
  if (anterior && r.pc_emprestimos + r.pnc_emprestimos > (anterior.pc_emprestimos + anterior.pnc_emprestimos) * 1.1 && r.mes.receita_bruta <= anterior.mes.receita_bruta)
    out.push({ area: "Endividamento", nivel: "medio", texto: "Empréstimos crescendo mais que a receita", evidencia: `${brl(anterior.pc_emprestimos + anterior.pnc_emprestimos)} → ${brl(r.pc_emprestimos + r.pnc_emprestimos)}`, recomendacao: "Rever a necessidade e o custo dos financiamentos." });
  if (i.composicao_endividamento !== null && i.composicao_endividamento > 0.8 && r.pc_emprestimos > 0)
    out.push({ area: "Endividamento", nivel: "medio", texto: "Dívida concentrada no curto prazo", evidencia: fmtIndice(i.composicao_endividamento, "%"), recomendacao: "Negociar alongamento dos empréstimos." });
  if (anterior && anterior.ano.receita_liquida > 0 && r.ano.receita_liquida > 0) {
    const mAnt = anterior.ano.lucro_liquido / anterior.ano.receita_liquida;
    const mAt = r.ano.lucro_liquido / r.ano.receita_liquida;
    if (mAt < mAnt - 0.03)
      out.push({ area: "Resultado", nivel: "medio", texto: "Margem líquida em queda", evidencia: `${fmtIndice(mAnt, "%")} → ${fmtIndice(mAt, "%")}`, recomendacao: "Identificar as despesas que cresceram acima da receita." });
  }
  return out;
}

// ---------------------------------------------------------------- parecer

export function rascunhoParecer(o: {
  empresa: string;
  competencia: string; // YYYY-MM-01
  regime: string | null;
  r: Resumo;
  i: Indices;
  alertas: Alerta[];
  anterior?: Resumo | null;
  contador: string;
  crc: string;
}): string {
  const { r, i, alertas, anterior } = o;
  const mes = new Date(o.competencia + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const varPct = (a: number, b: number | undefined) => (b ? ` (${a >= b ? "+" : ""}${(((a - b) / Math.abs(b)) * 100).toFixed(1).replace(".", ",")}% sobre o mês anterior)` : "");
  const altos = alertas.filter((a) => a.nivel === "alto");
  const pontoPrincipal = altos[0]?.texto ?? alertas[0]?.texto;
  const lucroOuPrej = r.ano.lucro_liquido >= 0 ? `lucro de ${brl(r.ano.lucro_liquido)}` : `prejuízo de ${brl(-r.ano.lucro_liquido)}`;

  const L: string[] = [];
  L.push(`# Parecer técnico contábil — ${mes}`);
  L.push(`**${o.empresa}**${o.regime ? ` · regime ${o.regime}` : ""}`);
  L.push("");
  L.push("## 1. Resumo executivo");
  L.push(
    `No acumulado do ano até ${mes}, a empresa registrou receita bruta de ${brl(r.ano.receita_bruta)} e ${lucroOuPrej}` +
      (i.margem_liquida !== null ? `, margem líquida de ${fmtIndice(i.margem_liquida, "%")}` : "") +
      `. A liquidez corrente está em ${fmtIndice(i.liquidez_corrente, "x")} e o capital de giro em ${brl(i.capital_giro)}.` +
      (pontoPrincipal ? ` O ponto que mais pede atenção é: ${pontoPrincipal.toLowerCase()}.` : " Não foram identificadas fragilidades relevantes no período."),
  );
  L.push("");
  L.push("## 2. Evolução");
  L.push(`- Receita bruta do mês: ${brl(r.mes.receita_bruta)}${varPct(r.mes.receita_bruta, anterior?.mes.receita_bruta)}.`);
  L.push(`- Resultado do mês: ${brl(r.mes.lucro_liquido)}; acumulado no ano: ${brl(r.ano.lucro_liquido)}.`);
  L.push(`- Margem bruta ${fmtIndice(i.margem_bruta, "%")}, margem operacional ${fmtIndice(i.margem_operacional, "%")}.`);
  L.push(`- Disponível (caixa, bancos e aplicações): ${brl(r.disponivel)}${anterior ? ` (era ${brl(anterior.disponivel)} no mês anterior)` : ""}.`);
  if (r.mes.despesas_por_conta.length)
    L.push(`- Maiores custos e despesas do mês: ${r.mes.despesas_por_conta.slice(0, 3).map((d) => `${d.conta} (${brl(d.valor)})`).join(", ")}.`);
  L.push("");
  L.push("## 3. Liquidez e endividamento");
  L.push(`- Liquidez corrente ${fmtIndice(i.liquidez_corrente, "x")}, seca ${fmtIndice(i.liquidez_seca, "x")}, imediata ${fmtIndice(i.liquidez_imediata, "x")} e geral ${fmtIndice(i.liquidez_geral, "x")}.`);
  L.push(`- Endividamento geral de ${fmtIndice(i.endividamento_geral, "%")}, com ${fmtIndice(i.composicao_endividamento, "%")} vencendo no curto prazo.`);
  L.push(
    i.liquidez_corrente !== null && i.liquidez_corrente >= 1
      ? "- A empresa tem recursos de curto prazo suficientes para honrar as dívidas que vencem nos próximos meses."
      : "- Os recursos de curto prazo não cobrem as dívidas que vencem nos próximos meses; é preciso acompanhar o caixa de perto.",
  );
  L.push("");
  L.push("## 4. Fragilidades encontradas");
  if (!alertas.length) L.push("Nenhuma fragilidade relevante identificada nas verificações do período.");
  for (const a of alertas) L.push(`- **${a.texto}** (${a.area}). Evidência: ${a.evidencia}. Risco ${a.nivel}. Recomendação: ${a.recomendacao}`);
  L.push("");
  L.push("## 5. Aspectos tributários");
  L.push(`- Carga tributária efetiva no ano: ${fmtIndice(i.carga_tributaria, "%")} da receita bruta (tributos sobre vendas e IRPJ/CSLL).`);
  L.push("- [Revisar: regime atual × alternativas, parcelamentos e pendências fiscais.]");
  L.push("- Reforma tributária: a partir de 2027 a CBS substitui PIS e COFINS; a MDC avaliará o efeito no preço e no regime da empresa.");
  L.push("");
  L.push("## 6. Recomendações e próximos passos");
  const recs = [...new Set(alertas.map((a) => a.recomendacao))].slice(0, 5);
  if (!recs.length) L.push("- Manter a rotina atual e acompanhar os indicadores no próximo fechamento.");
  for (const rr of recs) L.push(`- ${rr}`);
  L.push("- A MDC acompanhará estes pontos no próximo fechamento.");
  L.push("");
  L.push("## 7. Assinatura técnica");
  L.push(`${o.contador} — Contador, CRC ${o.crc}`);
  L.push("MDC Assessoria Contábil · Bragança Paulista/SP");
  L.push("");
  L.push("_Este parecer se baseia nos registros contábeis do período e nas informações fornecidas pela empresa._");
  return L.join("\n");
}

/** Markdown simples (títulos, listas, negrito, itálico) → HTML para tela e impressão. */
export function mdParaHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_(.+?)_/g, "<i>$1</i>");
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
    if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l) out.push(`<p>${inline(l)}</p>`);
  }
  if (lista) out.push("</ul>");
  return out.join("\n");
}
