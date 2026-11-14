// MDC · Pessoal: entende uma frase falada (ou escrita) e monta os lançamentos. Ex.: "paguei a luz 230 ontem e recebi
// o salário de 5 mil" vira um gasto de R$ 230,00 em Contas da casa (pago ontem) e uma entrada de R$ 5.000,00 em
// Salário. Regra pura, sem IA e sem custo: o que ela não entender (sem valor ou sem tipo) vai para a IA, se ligada,
// ou a pessoa completa no cartão "Entendi assim". Nada é gravado sem a pessoa conferir.
import { somarDias } from "@/lib/datas";

export interface CategoriaFala {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
}

export interface LancamentoFalado {
  tipo: "pagar" | "receber";
  valor: number;
  /** id da categoria; null = a pessoa escolhe. */
  categoria: string | null;
  descricao: string;
  /** AAAA-MM-DD */
  data: string;
  /** Já pago (ou já recebido)? */
  pago: boolean;
}

/** Tira acento e põe em minúsculas, para comparar palavras. */
export function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const VERBOS_ENTRADA = /\b(recebi|receber|recebo|ganhei|ganho|entrou|entrar|entra|caiu|cai|vendi|me pagaram|me pagou|pingou)\b/;
const VERBOS_SAIDA = /\b(gastei|gasto|paguei|pagar|pago|comprei|compra|saiu|sair|tenho que pagar|vou pagar|debitou|transferi)\b/;
const FUTURO = /\b(vou pagar|vou receber|tenho que pagar|preciso pagar|vai vencer|vence|vencer|a pagar|a receber|amanha|semana que vem|mes que vem|proximo mes|vai entrar|vai cair)\b/;

/** Palavras do dia a dia que apontam para cada tipo do plano simples (nome da categoria sem acento). */
const PISTAS: { categoria: string; tipo: "receita" | "despesa"; palavras: RegExp }[] = [
  { categoria: "contas da casa", tipo: "despesa", palavras: /\b(luz|energia|enel|cpfl|elektro|agua|sabesp|gas|internet|wi-?fi|telefone|celular|conta de)\b/ },
  { categoria: "mercado", tipo: "despesa", palavras: /\b(mercado|supermercado|feira|padaria|acougue|hortifruti|sacolao|atacadao|assai)\b/ },
  { categoria: "restaurante e delivery", tipo: "despesa", palavras: /\b(restaurante|lanche|lanchonete|ifood|delivery|pizza|almoco|jantar|hamburguer|sorvete|cafe)\b/ },
  { categoria: "moradia", tipo: "despesa", palavras: /\b(aluguel|condominio|iptu|financiamento da casa|prestacao da casa|reforma|pedreiro|encanador|diarista|faxina)\b/ },
  { categoria: "transporte", tipo: "despesa", palavras: /\b(gasolina|combustivel|etanol|alcool|diesel|posto|uber|99|onibus|metro|estacionamento|pedagio|mecanico|oficina|ipva|seguro do carro|carro|moto)\b/ },
  { categoria: "saude", tipo: "despesa", palavras: /\b(farmacia|remedio|medico|consulta|dentista|exame|plano de saude|hospital|psicologo|terapia)\b/ },
  { categoria: "educacao", tipo: "despesa", palavras: /\b(escola|faculdade|curso|mensalidade|livro|material escolar|apostila|ingles)\b/ },
  { categoria: "lazer", tipo: "despesa", palavras: /\b(cinema|viagem|passeio|show|bar|netflix|spotify|streaming|parque|hotel|praia|festa)\b/ },
  { categoria: "compras pessoais", tipo: "despesa", palavras: /\b(roupa|sapato|tenis|salao|cabelo|barbeiro|manicure|perfume|presente|maquiagem|loja)\b/ },
  { categoria: "cartao e emprestimos", tipo: "despesa", palavras: /\b(cartao|fatura|emprestimo|juros|parcela do banco|consignado|cheque especial)\b/ },
  { categoria: "impostos e taxas", tipo: "despesa", palavras: /\b(imposto|irpf|imposto de renda|taxa|multa|darf|licenciamento)\b/ },
  { categoria: "salario", tipo: "receita", palavras: /\b(salario|pagamento do trabalho|holerite|pro-?labore|adiantamento|decimo terceiro|ferias)\b/ },
  { categoria: "aluguel recebido", tipo: "receita", palavras: /\b(aluguel|inquilino)\b/ },
  { categoria: "renda extra", tipo: "receita", palavras: /\b(extra|bico|freela|venda|vendi|comissao|servico|trabalho)\b/ },
];

const UNIDADES: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};

/** Valor em reais escrito com números ("1.250,50", "230", "R$ 5000", "5 mil", "2,5 mil") ou por extenso ("cinquenta"). */
export function lerValor(frase: string): number {
  // "dia 10" é data, não valor
  const t = semAcento(frase).replace(/\bdia\s+\d{1,2}\b/g, " ");
  const m = t.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil\b)?/);
  if (m) {
    const inteiro = Number(m[1].replace(/\./g, ""));
    const centavos = m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0;
    const v = (inteiro + centavos) * (m[3] ? 1000 : 1);
    // "5 mil e 500"
    const resto = m[3] ? t.slice((m.index ?? 0) + m[0].length).match(/^\s*e\s+(\d{1,3})\b/) : null;
    return Math.round((v + (resto ? Number(resto[1]) : 0)) * 100) / 100;
  }
  // por extenso: o maior número dito ("uma pizza de cinquenta" = 50; "mil e duzentos" = 1200)
  let maior = 0;
  let total = 0;
  let parcial = 0;
  const fechar = () => {
    maior = Math.max(maior, total + parcial);
    total = 0;
    parcial = 0;
  };
  for (const p of t.split(/[^a-z]+/).filter(Boolean)) {
    if (p in UNIDADES) parcial += UNIDADES[p];
    else if (p === "mil") {
      total += (parcial || 1) * 1000;
      parcial = 0;
    } else if (p !== "e") fechar();
  }
  fechar();
  // "um"/"uma" sozinhos são artigo, não valor
  return maior > 1 ? maior : 0;
}

/** Data dita na frase: hoje, ontem, anteontem, amanhã, "dia 10" (no mês certo), "semana que vem". */
export function lerData(frase: string, hoje: string, futuro: boolean): string {
  const t = semAcento(frase);
  if (/\banteontem\b/.test(t)) return somarDias(hoje, -2);
  if (/\bontem\b/.test(t)) return somarDias(hoje, -1);
  if (/\bdepois de amanha\b/.test(t)) return somarDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somarDias(hoje, 1);
  if (/\bsemana que vem\b/.test(t)) return somarDias(hoje, 7);
  const dia = t.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const d = Number(dia[1]);
    if (d >= 1 && d <= 31) {
      const [a, m] = hoje.split("-").map(Number);
      const hojeDia = Number(hoje.slice(8, 10));
      // "dia 5" já passou neste mês: se a frase fala do futuro, é o mês que vem; se do passado, é este mês
      let ano = a;
      let mes = m;
      if (/\bmes que vem|proximo mes\b/.test(t) || (futuro && d < hojeDia)) mes += 1;
      else if (!futuro && d > hojeDia) mes -= 1;
      if (mes === 13) [ano, mes] = [ano + 1, 1];
      if (mes === 0) [ano, mes] = [ano - 1, 12];
      const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
    }
  }
  return hoje;
}

/** Quebra a fala em frases, uma por lançamento: "paguei a luz 230 e recebi o salário" vira duas. */
export function quebrarFrases(texto: string): string[] {
  return texto
    .split(/[.;\n]+|,?\s+e\s+(?=(?:tambem\s+)?(?:gastei|paguei|comprei|recebi|ganhei|entrou|caiu|vendi|vou pagar|tenho que pagar|vou receber)\b)/i)
    .map((f) => f.trim())
    .filter((f) => f.length > 1);
}

function acharCategoria(frase: string, tipo: "pagar" | "receber", categorias: CategoriaFala[]): CategoriaFala | null {
  const t = semAcento(frase);
  const doTipo = categorias.filter((c) => c.tipo === (tipo === "pagar" ? "despesa" : "receita"));
  // 1º o nome da própria categoria dito na frase (inclui as que a família criou: "Pet", "Academia")
  const pelonome = doTipo
    .filter((c) => !/^outr/i.test(c.nome))
    .sort((a, b) => b.nome.length - a.nome.length)
    .find((c) => new RegExp(`\\b${semAcento(c.nome).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
  if (pelonome) return pelonome;
  // 2º as pistas do dia a dia
  for (const p of PISTAS) {
    if (p.tipo !== (tipo === "pagar" ? "despesa" : "receita") || !p.palavras.test(t)) continue;
    const c = doTipo.find((x) => semAcento(x.nome) === p.categoria);
    if (c) return c;
  }
  return null;
}

/** Texto curto para a descrição: a frase sem o verbo, o valor e a data. "paguei a luz 230 ontem" vira "Luz". */
export function descricaoDaFrase(frase: string): string {
  const limpa = frase
    .replace(/(?:r\$\s*)?\d[\d.,]*\s*(?:mil\b)?(?:\s*e\s+\d{1,3}\b)?/gi, " ")
    .replace(/\b(reais|real|conto|contos|pila)\b/gi, " ")
    .replace(/\b(hoje|ontem|anteontem|amanhã|amanha|depois de amanhã|semana que vem|mês que vem|mes que vem|próximo mês|dia\s*\d*)\b/gi, " ")
    .replace(/^\s*(eu\s+)?(também\s+|tambem\s+)?(gastei|paguei|comprei|recebi|ganhei|entrou|caiu|vendi|vou pagar|tenho que pagar|preciso pagar|vou receber|me pagaram|me pagou)\b/i, " ")
    .replace(/^\s*(com|no|na|nos|nas|de|do|da|dos|das|o|a|os|as|um|uma|em|pelo|pela|pra|para)\s+/i, " ")
    .replace(/^\s*(com|no|na|nos|nas|de|do|da|dos|das|o|a|os|as|um|uma|em|pelo|pela|pra|para)\s+/i, " ")
    .replace(/\s+(de|do|da|no|na|em|e|com|por|pra|para)\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpa) return "";
  return (limpa.charAt(0).toUpperCase() + limpa.slice(1)).slice(0, 60);
}

/** Uma frase vira um lançamento (tipo, valor, tipo de gasto, data e se já foi pago). */
export function interpretarFrase(frase: string, categorias: CategoriaFala[], hoje: string): LancamentoFalado {
  const t = semAcento(frase);
  const entrada = VERBOS_ENTRADA.test(t) && !VERBOS_SAIDA.test(t.replace(/\bme pag(aram|ou)\b/, ""));
  let tipo: "pagar" | "receber" = entrada ? "receber" : "pagar";
  // sem verbo: o tipo vem da pista ("salário 5 mil" é entrada)
  if (!VERBOS_ENTRADA.test(t) && !VERBOS_SAIDA.test(t)) {
    const soEntrada = PISTAS.some((p) => p.tipo === "receita" && p.categoria !== "renda extra" && p.categoria !== "aluguel recebido" && p.palavras.test(t));
    if (soEntrada) tipo = "receber";
  }
  const futuro = FUTURO.test(t);
  const data = lerData(frase, hoje, futuro);
  const cat = acharCategoria(frase, tipo, categorias);
  return {
    tipo,
    valor: lerValor(frase),
    categoria: cat?.id ?? null,
    descricao: descricaoDaFrase(frase) || cat?.nome || "",
    data,
    pago: !futuro && data <= hoje,
  };
}

/** A fala inteira vira um ou mais lançamentos (no máximo 10). */
export function interpretarFala(texto: string, categorias: CategoriaFala[], hoje: string): LancamentoFalado[] {
  return quebrarFrases(texto.slice(0, 600))
    .map((f) => interpretarFrase(f, categorias, hoje))
    .filter((l) => l.valor > 0 || l.categoria)
    .slice(0, 10);
}

/** Falta algo para salvar? (valor e tipo de gasto). */
export function faltaNoFalado(l: LancamentoFalado): string | null {
  if (!(l.valor > 0)) return "Falta o valor";
  if (!l.categoria) return l.tipo === "pagar" ? "Escolha o tipo de gasto" : "Escolha o tipo de entrada";
  return null;
}
