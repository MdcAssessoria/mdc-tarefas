// Leitura da planilha de itens (Excel ou CSV) para a importação: acha a linha de cabeçalho pelos nomes das colunas
// (aceita variações como "Descrição", "Produto", "Preço", "EAN", "Saldo"), confere cada linha e devolve a prévia com
// os erros em português. A gravação é feita pelo banco (est_importar_itens), tudo ou nada.
import { semAcento } from "@/lib/texto";
import { valorBr } from "./extratoPlanilha";

export interface ItemPlanilha {
  codigo?: string;
  nome?: string;
  tipo?: "produto" | "servico";
  unidade?: string;
  grupo_nome?: string;
  marca?: string;
  preco_venda?: number;
  custo?: number;
  estoque_minimo?: number;
  saldo_inicial?: number;
  codigo_barras?: string;
  ncm?: string;
  controla_estoque?: boolean;
  unidade_compra?: string;
  fator_compra?: number;
}

export interface LinhaPlanilhaItens {
  /** Número da linha na planilha (como o Excel mostra). */
  linha: number;
  dados: ItemPlanilha;
  erros: string[];
}

export interface LeituraPlanilhaItens {
  linhas: LinhaPlanilhaItens[];
  /** Colunas reconhecidas (para mostrar à pessoa o que foi entendido). */
  colunas: string[];
  avisos: string[];
}

const norm = (v: unknown) =>
  semAcento(String(v ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Campo = keyof ItemPlanilha;
/** Nome amigável de cada coluna e os cabeçalhos aceitos (já sem acento e em maiúsculas). */
const COLUNAS: { campo: Campo; nome: string; re: RegExp }[] = [
  { campo: "codigo_barras", nome: "Código de barras", re: /^(CODIGO DE BARRAS|COD BARRAS|CODIGO BARRAS|EAN|GTIN|EAN 13|BARRAS)$/ },
  { campo: "codigo", nome: "Código", re: /^(CODIGO|COD|CODIGO DO PRODUTO|CODIGO DO ITEM|SKU|REFERENCIA|REF)$/ },
  { campo: "nome", nome: "Nome", re: /^(NOME|DESCRICAO|DESCRICAO DO PRODUTO|PRODUTO|ITEM|NOME DO PRODUTO|NOME DO ITEM|SERVICO)$/ },
  { campo: "tipo", nome: "Tipo", re: /^(TIPO|TIPO DO ITEM|PRODUTO OU SERVICO)$/ },
  { campo: "unidade_compra", nome: "Unidade de compra", re: /^(UNIDADE DE COMPRA|UN COMPRA|UNID COMPRA)$/ },
  { campo: "fator_compra", nome: "Fator de compra", re: /^(FATOR|FATOR DE COMPRA|QTD POR CAIXA|QUANTIDADE POR CAIXA|CONVERSAO)$/ },
  { campo: "unidade", nome: "Unidade", re: /^(UNIDADE|UN|UND|UNID|UNIDADE DE VENDA|MEDIDA)$/ },
  { campo: "grupo_nome", nome: "Grupo", re: /^(GRUPO|CATEGORIA|FAMILIA|GRUPO DO PRODUTO|DEPARTAMENTO|SECAO)$/ },
  { campo: "marca", nome: "Marca", re: /^(MARCA|FABRICANTE)$/ },
  {
    campo: "preco_venda",
    nome: "Preço de venda",
    re: /^(PRECO DE VENDA|PRECO VENDA|PRECO|VALOR DE VENDA|VALOR VENDA|VENDA|VALOR UNITARIO)$/,
  },
  { campo: "custo", nome: "Custo", re: /^(CUSTO|PRECO DE CUSTO|PRECO CUSTO|VALOR DE CUSTO|CUSTO UNITARIO)$/ },
  { campo: "estoque_minimo", nome: "Estoque mínimo", re: /^(ESTOQUE MINIMO|MINIMO|EST MINIMO|QTD MINIMA)$/ },
  {
    campo: "saldo_inicial",
    nome: "Saldo inicial",
    re: /^(SALDO INICIAL|SALDO|ESTOQUE|ESTOQUE ATUAL|QUANTIDADE|QTD|QTDE|ESTOQUE INICIAL)$/,
  },
  { campo: "ncm", nome: "NCM", re: /^(NCM|CLASSIFICACAO FISCAL)$/ },
  {
    campo: "controla_estoque",
    nome: "Controla estoque",
    re: /^(CONTROLA ESTOQUE|CONTROLAR ESTOQUE|ESTOQUE CONTROLADO|MOVIMENTA ESTOQUE)$/,
  },
];

/** Colunas do modelo para baixar (na ordem em que aparecem). */
export const COLUNAS_MODELO = [
  "Código",
  "Nome",
  "Tipo",
  "Unidade",
  "Grupo",
  "Marca",
  "Preço de venda",
  "Custo",
  "Estoque mínimo",
  "Saldo inicial",
  "Código de barras",
  "NCM",
  "Controla estoque",
  "Unidade de compra",
  "Fator de compra",
];
export const EXEMPLO_MODELO: (string | number)[][] = [
  ["P0001", "Parafuso sextavado 10mm", "Produto", "UN", "Ferragens", "Ciser", 0.9, 0.35, 50, 400, "", "73181500", "Sim", "CX", 100],
  ["S0001", "Instalação", "Serviço", "H", "Serviços", "", 120, "", "", "", "", "", "Não", "", ""],
];

const texto = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
};

/** "Sim", "S", "X", "1", "true" → true; "Não", "N", "0" → false; vazio → indefinido. */
export function simNao(v: unknown): boolean | undefined {
  const s = norm(v);
  if (!s) return undefined;
  if (/^(SIM|S|X|1|TRUE|VERDADEIRO|YES|Y)$/.test(s)) return true;
  if (/^(NAO|N|0|FALSE|FALSO|NO)$/.test(s)) return false;
  return undefined;
}

/** Número de célula: número do Excel ou texto "1.234,56"; vazio → indefinido; inválido → NaN. */
function numero(v: unknown): number | undefined {
  if (v == null || String(v).trim() === "") return undefined;
  const n = valorBr(v);
  return n === null ? NaN : n;
}

export function lerPlanilhaItens(matriz: unknown[][]): LeituraPlanilhaItens {
  let cab = -1;
  let idx: Partial<Record<Campo, number>> = {};
  for (let i = 0; i < Math.min(matriz.length, 40); i++) {
    const cels = (matriz[i] ?? []).map(norm);
    const achados: Partial<Record<Campo, number>> = {};
    cels.forEach((c, k) => {
      const col = COLUNAS.find((x) => x.re.test(c) && achados[x.campo] === undefined);
      if (col) achados[col.campo] = k;
    });
    if (achados.nome !== undefined || (achados.codigo !== undefined && Object.keys(achados).length >= 2)) {
      cab = i;
      idx = achados;
      break;
    }
  }
  if (cab < 0)
    throw new Error('Não encontrei a linha de títulos da planilha. Ela precisa ter pelo menos a coluna "Nome" (ou "Descrição"/"Produto").');

  const linhas: LinhaPlanilhaItens[] = [];
  const vistos = new Map<string, number>();
  for (let i = cab + 1; i < matriz.length; i++) {
    const lin = matriz[i] ?? [];
    const cel = (c: Campo) => (idx[c] === undefined ? undefined : lin[idx[c]!]);
    if (!lin.some((v) => String(v ?? "").trim())) continue; // linha em branco
    const erros: string[] = [];
    const d: ItemPlanilha = {};
    d.codigo = texto(cel("codigo"));
    d.nome = texto(cel("nome"));
    if (!d.nome && !d.codigo) {
      erros.push("Sem nome e sem código");
    }
    const tipo = norm(cel("tipo"));
    if (tipo) {
      if (/^SERV/.test(tipo)) d.tipo = "servico";
      else if (/^(PROD|MERC|MAT|REVENDA|P$)/.test(tipo)) d.tipo = "produto";
      else erros.push(`Tipo "${String(cel("tipo"))}" não reconhecido (use Produto ou Serviço)`);
    }
    const un = texto(cel("unidade"))?.toUpperCase();
    if (un) {
      if (un.length > 6) erros.push(`Unidade "${un}" tem mais de 6 letras`);
      else d.unidade = un;
    }
    const unc = texto(cel("unidade_compra"))?.toUpperCase();
    if (unc) {
      if (unc.length > 6) erros.push(`Unidade de compra "${unc}" tem mais de 6 letras`);
      else d.unidade_compra = unc;
    }
    d.grupo_nome = texto(cel("grupo_nome"));
    d.marca = texto(cel("marca"));
    d.codigo_barras = texto(cel("codigo_barras"))?.replace(/\.0+$/, "");
    const ncm = String(cel("ncm") ?? "").replace(/\D/g, "");
    if (ncm) {
      if (ncm.length !== 8) erros.push(`NCM "${String(cel("ncm"))}" precisa ter 8 números`);
      else d.ncm = ncm;
    }
    const ctl = cel("controla_estoque");
    if (String(ctl ?? "").trim()) {
      const b = simNao(ctl);
      if (b === undefined) erros.push(`"Controla estoque" deve ser Sim ou Não`);
      else d.controla_estoque = b;
    }
    const numeros: [Campo, string][] = [
      ["preco_venda", "Preço de venda"],
      ["custo", "Custo"],
      ["estoque_minimo", "Estoque mínimo"],
      ["saldo_inicial", "Saldo inicial"],
      ["fator_compra", "Fator de compra"],
    ];
    for (const [c, nome] of numeros) {
      const n = numero(cel(c));
      if (n === undefined) continue;
      if (Number.isNaN(n)) erros.push(`${nome} "${String(cel(c))}" não é um número`);
      else if (n < 0) erros.push(`${nome} não pode ser negativo`);
      else if (c === "fator_compra" && n === 0) erros.push("Fator de compra precisa ser maior que zero");
      else (d as Record<string, unknown>)[c] = n;
    }
    if (d.tipo === "servico") {
      if (d.saldo_inicial) erros.push("Serviço não tem saldo de estoque");
      d.controla_estoque = false;
    } else if (d.controla_estoque === false && d.saldo_inicial) {
      erros.push('Item com "Controla estoque = Não" não pode ter saldo inicial');
    }
    const chave = d.codigo ? `c:${d.codigo}` : d.nome ? `n:${norm(d.nome)}` : "";
    if (chave) {
      if (vistos.has(chave)) erros.push(`Repetido na planilha (igual à linha ${vistos.get(chave)})`);
      else vistos.set(chave, i + 1);
    }
    linhas.push({ linha: i + 1, dados: d, erros });
  }
  const avisos: string[] = [];
  if (!linhas.length) avisos.push("Não encontrei itens abaixo da linha de títulos.");
  if (idx.saldo_inicial !== undefined)
    avisos.push("O saldo inicial entra só para itens novos que controlam estoque, no estoque padrão, com o custo da planilha.");
  const colunas = COLUNAS.filter((c) => idx[c.campo] !== undefined).map((c) => c.nome);
  return { linhas, colunas, avisos };
}
