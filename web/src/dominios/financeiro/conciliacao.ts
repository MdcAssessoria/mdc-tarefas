// Regras puras da conciliação do extrato (Financeiro › Conciliação): tipos dos dados que o banco devolve
// (fin_conciliacao_dados, migração 051) e a sugestão automática de com o que cada linha do extrato combina.
//
// Como a sugestão pontua cada candidato (pagamento já lançado, conta em aberto ou transferência do mesmo sentido):
//   valor igual ............ 50 pontos (valor perto, até 3%, vale 15: provável juros ou desconto)
//   data perto ............. até 30 pontos (mesmo dia = 30; cai até 0 no limite de dias)
//   nome parecido .......... até 20 pontos (palavras do fornecedor/cliente ou da descrição que aparecem no histórico)
//   mesmo documento ........ 15 pontos
//   boleto do Ledgra Link .. 10 pontos (pagamento já baixado pelo aviso do banco)
// Também procura duas a quatro contas do mesmo sentido cuja soma dá exatamente o valor (pagamento agrupado).
// Só aparece sugestão com 55 pontos ou mais (valor igual sozinho não basta); 75 ou mais é "Combina muito".

export type SituacaoLinha = "pendente" | "conciliado" | "ignorado";

export interface ItemConciliado {
  valor: number;
  criado_aqui: boolean;
  descricao: string | null;
  pessoa: string | null;
  baixa: number | null;
  transferencia: number | null;
}

export interface LinhaConciliacao {
  id: number;
  data: string;
  /** Positivo = entrou dinheiro; negativo = saiu. */
  valor: number;
  descricao: string;
  documento: string | null;
  situacao: SituacaoLinha;
  conciliacao: {
    id: number;
    tipo: "lancamentos" | "transferencia" | "ignorado";
    observacao: string | null;
    em: string;
    itens: ItemConciliado[];
  } | null;
}

/** Pagamento ou recebimento já lançado no HUB e ainda sem linha do extrato (valor com sinal). */
export interface BaixaSemExtrato {
  id: number;
  data: string;
  valor: number;
  tipo: "pagar" | "receber";
  descricao: string;
  documento: string | null;
  pessoa: string | null;
  forma: string | null;
}

/** Conta a pagar ou a receber em aberto (saldo sempre positivo; o sentido vem do tipo). */
export interface TituloAberto {
  id: string;
  tipo: "pagar" | "receber";
  vencimento: string;
  saldo: number;
  descricao: string;
  documento: string | null;
  pessoa: string | null;
}

/** Transferência entre contas ainda não conciliada nesta conta (valor com sinal para esta conta). */
export interface TransferenciaSemExtrato {
  id: number;
  data: string;
  valor: number;
  outra_conta: string;
  observacao: string | null;
}

export interface DadosConciliacao {
  conta: string;
  de: string | null;
  ate: string | null;
  pode_operar: boolean;
  saldos: { extrato: number; hub: number; diferenca: number };
  linhas: LinhaConciliacao[];
  baixas: BaixaSemExtrato[];
  titulos: TituloAberto[];
  transferencias: TransferenciaSemExtrato[];
}

export type Candidato =
  | { tipo: "baixa"; item: BaixaSemExtrato }
  | { tipo: "titulo"; item: TituloAberto }
  | { tipo: "transferencia"; item: TransferenciaSemExtrato };

export interface Sugestao {
  candidatos: Candidato[];
  pontos: number;
  /** Frases curtas para a tela ("valor igual", "2 dias de diferença"…). */
  motivos: string[];
}

export const PONTOS_MINIMOS = 55;
export const PONTOS_ALTOS = 75;
const CENTAVO = 0.005;

/** Valor de um candidato com o sinal do extrato (+ entrou, − saiu). */
export function valorComSinal(c: Candidato): number {
  if (c.tipo === "titulo") return c.item.tipo === "receber" ? Number(c.item.saldo) : -Number(c.item.saldo);
  return Number(c.item.valor);
}

/** Data usada para comparar: a do pagamento/transferência ou o vencimento da conta em aberto. */
export const dataDoCandidato = (c: Candidato) => (c.tipo === "titulo" ? c.item.vencimento : c.item.data);

/** Chave única do candidato (para seleção na tela). */
export const chaveCandidato = (c: Candidato) => `${c.tipo}:${c.item.id}`;

export function diasEntre(a: string, b: string): number {
  const ms = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.abs(Math.round(ms / 864e5));
}

// palavras que todo histórico de banco tem e não dizem quem é
const COMUNS = new Set(
  (
    "PIX TED DOC TEF RECEBIDO RECEBIDA RECEBIMENTO ENVIADO ENVIADA PAGAMENTO PAGTO PAG PGTO BOLETO BOLETOS TRANSF TRANSFERENCIA " +
    "LTDA EIRELI EPP MEI CIA COMERCIO SERVICOS SERVICO DEBITO CREDITO CONTA TITULO DEP DEPOSITO SAQUE COMPRA " +
    "DOS DAS COM PARA POR SEM "
  )
    .split(" ")
    .filter(Boolean),
);

/** Palavras que identificam (maiúsculas, sem acento, 3 letras ou mais, sem as comuns de extrato). */
export function palavras(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p.length >= 3 && !COMUNS.has(p) && !/^\d+$/.test(p));
}

/** De 0 a 1: quanto das palavras de `nome` aparece no histórico do extrato. */
export function semelhanca(historico: string, nome: string | null | undefined): number {
  const h = new Set(palavras(historico));
  const n = [...new Set(palavras(nome))];
  if (!n.length || !h.size) return 0;
  return (
    n.filter((p) => h.has(p) || [...h].some((x) => x.length >= 5 && p.length >= 5 && (x.startsWith(p) || p.startsWith(x)))).length /
    n.length
  );
}

function pontuar(linha: LinhaConciliacao, c: Candidato, dias: number): Sugestao | null {
  const v = valorComSinal(c);
  const alvo = Number(linha.valor);
  if (Math.sign(v) !== Math.sign(alvo)) return null;
  const motivos: string[] = [];
  let pontos = 0;

  const dif = Math.abs(Math.abs(alvo) - Math.abs(v));
  if (dif < CENTAVO) {
    pontos += 50;
    motivos.push("valor igual");
  } else if (dif <= Math.abs(alvo) * 0.03 && c.tipo === "titulo") {
    pontos += 15;
    motivos.push(Math.abs(alvo) > Math.abs(v) ? "valor perto (provável juros)" : "valor perto (provável desconto)");
  } else return null;

  // conta em aberto pode ser paga alguns dias antes ou depois do vencimento: dobra a janela
  const janela = c.tipo === "titulo" ? dias * 2 : dias;
  const d = diasEntre(linha.data, dataDoCandidato(c));
  if (d <= janela) {
    pontos += Math.round(30 * (1 - d / (janela + 1)));
    motivos.push(d === 0 ? (c.tipo === "titulo" ? "vence no mesmo dia" : "mesma data") : `${d} dia${d > 1 ? "s" : ""} de diferença`);
  }

  const nome = c.tipo === "transferencia" ? c.item.outra_conta : c.item.pessoa;
  const descricao = c.tipo === "transferencia" ? c.item.observacao : c.item.descricao;
  const s = Math.max(semelhanca(linha.descricao, nome), semelhanca(linha.descricao, descricao) * 0.75);
  if (s > 0) {
    pontos += Math.round(20 * s);
    motivos.push(nome && semelhanca(linha.descricao, nome) >= s ? `nome parecido (${nome})` : "descrição parecida");
  }

  const doc = c.tipo === "transferencia" ? null : c.item.documento;
  if (doc && linha.documento && doc.replace(/\D/g, "") && doc.replace(/\D/g, "") === linha.documento.replace(/\D/g, "")) {
    pontos += 15;
    motivos.push("mesmo documento");
  }
  if (c.tipo === "baixa" && /ledgra/i.test(c.item.forma ?? "")) {
    pontos += 10;
    motivos.push("boleto já pago pelo Ledgra Link");
  }
  return { candidatos: [c], pontos: Math.min(pontos, 100), motivos };
}

/** Todos os candidatos do mesmo sentido da linha (entrada com receber, saída com pagar). */
export function candidatosDaLinha(
  linha: LinhaConciliacao,
  dados: Pick<DadosConciliacao, "baixas" | "titulos" | "transferencias">,
): Candidato[] {
  const todos: Candidato[] = [
    ...dados.baixas.map((item) => ({ tipo: "baixa" as const, item })),
    ...dados.transferencias.map((item) => ({ tipo: "transferencia" as const, item })),
    ...dados.titulos.map((item) => ({ tipo: "titulo" as const, item })),
  ];
  return todos.filter((c) => Math.sign(valorComSinal(c)) === Math.sign(Number(linha.valor)));
}

/** Combinações de 2 a 4 contas (pagamentos ou contas em aberto) cuja soma dá exatamente o valor da linha. */
function agrupadas(linha: LinhaConciliacao, cands: Candidato[], dias: number): Sugestao[] {
  const alvo = Math.round(Math.abs(Number(linha.valor)) * 100);
  const perto = cands
    .filter((c) => c.tipo !== "transferencia" && diasEntre(linha.data, dataDoCandidato(c)) <= dias * 2)
    .filter((c) => Math.round(Math.abs(valorComSinal(c)) * 100) < alvo)
    .sort((a, b) => diasEntre(linha.data, dataDoCandidato(a)) - diasEntre(linha.data, dataDoCandidato(b)))
    .slice(0, 14);
  const saida: Sugestao[] = [];
  const escolha: Candidato[] = [];
  const andar = (inicio: number, resto: number) => {
    if (saida.length >= 5) return;
    if (resto === 0 && escolha.length >= 2) {
      const pessoas = new Set(escolha.map((c) => (c.tipo === "transferencia" ? c.item.outra_conta : c.item.pessoa)));
      const unica = pessoas.size === 1 ? [...pessoas][0] : null;
      const nome = unica ? semelhanca(linha.descricao, unica) : 0;
      const motivos = [`a soma de ${escolha.length} contas dá o valor exato`];
      if (unica) motivos.push(`todas de ${unica}`);
      if (nome > 0) motivos.push("nome parecido");
      saida.push({ candidatos: [...escolha], pontos: Math.min(95, 55 + (unica ? 10 : 0) + Math.round(20 * nome)), motivos });
      return;
    }
    if (escolha.length >= 4 || resto <= 0) return;
    for (let k = inicio; k < perto.length; k++) {
      const v = Math.round(Math.abs(valorComSinal(perto[k])) * 100);
      if (v > resto) continue;
      escolha.push(perto[k]);
      andar(k + 1, resto - v);
      escolha.pop();
    }
  };
  andar(0, alvo);
  return saida;
}

/** As melhores sugestões para uma linha do extrato (no máximo `limite`), da que mais combina para a que menos. */
export function sugerir(
  linha: LinhaConciliacao,
  dados: Pick<DadosConciliacao, "baixas" | "titulos" | "transferencias">,
  opcoes: { dias?: number; limite?: number } = {},
): Sugestao[] {
  const dias = opcoes.dias ?? 5;
  const cands = candidatosDaLinha(linha, dados);
  const simples = cands.map((c) => pontuar(linha, c, dias)).filter((s): s is Sugestao => !!s);
  // só procura soma quando nenhuma conta sozinha bate o valor
  const temIgual = simples.some((s) => s.motivos.includes("valor igual"));
  const todas = [...simples, ...(temIgual ? [] : agrupadas(linha, cands, dias))];
  return todas
    .filter((s) => s.pontos >= PONTOS_MINIMOS)
    .sort((a, b) => b.pontos - a.pontos || prioridade(a) - prioridade(b))
    .slice(0, opcoes.limite ?? 3);
}

// em empate, o que já está lançado (pagamento, transferência) vem antes da conta em aberto
const prioridade = (s: Sugestao) => (s.candidatos[0].tipo === "titulo" ? 1 : 0);

export const rotuloPontos = (p: number) => (p >= PONTOS_ALTOS ? "Combina muito" : "Pode ser");

// ------------------------------------------------------------------ seleção na janela "Conciliar"

/** Conta em aberto escolhida na janela: quanto baixar e o acerto de juros/desconto. */
export interface AjusteTitulo {
  valor: number;
  juros: number;
  desconto: number;
}

/** Quanto a seleção soma, com o sinal do extrato. */
export function somaSelecao(cands: Candidato[], ajustes: Record<string, AjusteTitulo>): number {
  const s = cands.reduce((a, c) => {
    if (c.tipo !== "titulo") return a + Number(c.item.valor);
    const aj = ajustes[c.item.id] ?? { valor: Number(c.item.saldo), juros: 0, desconto: 0 };
    const total = aj.valor + aj.juros - aj.desconto;
    return a + (c.item.tipo === "receber" ? total : -total);
  }, 0);
  return Math.round(s * 100) / 100;
}

/**
 * Leva a diferença (valor do extrato − soma) para os juros ou o desconto da última conta em aberto escolhida.
 * Banco maior que a soma = juros; menor = desconto. Sem conta em aberto na seleção, não há o que ajustar (null).
 */
export function ajustarDiferenca(
  linhaValor: number,
  cands: Candidato[],
  ajustes: Record<string, AjusteTitulo>,
): Record<string, AjusteTitulo> | null {
  const ultimo = [...cands].reverse().find((c) => c.tipo === "titulo");
  if (!ultimo || ultimo.tipo !== "titulo") return null;
  const atual = ajustes[ultimo.item.id] ?? { valor: Number(ultimo.item.saldo), juros: 0, desconto: 0 };
  const semEle = somaSelecao(
    cands.filter((c) => c !== ultimo),
    ajustes,
  );
  // quanto falta, em módulo, para esta conta fechar a linha
  const falta = Math.round((Math.abs(Number(linhaValor)) - Math.abs(semEle)) * 100) / 100;
  const dif = Math.round((falta - atual.valor) * 100) / 100;
  return { ...ajustes, [ultimo.item.id]: { valor: atual.valor, juros: dif > 0 ? dif : 0, desconto: dif < 0 ? -dif : 0 } };
}

// ------------------------------------------------------------------ "Criar lançamento": sugestões de cadastro

/** O cadastro (fornecedor/cliente, categoria) cujo nome mais aparece no histórico; nada se nenhum combinar. */
export function maisParecido<T extends { id: string; nome: string }>(historico: string, opcoes: T[], minimo = 0.5): T | null {
  let melhor: T | null = null;
  let nota = 0;
  for (const o of opcoes) {
    const s = semelhanca(historico, o.nome);
    if (s >= minimo && s > nota) {
      melhor = o;
      nota = s;
    }
  }
  return melhor;
}

/** Histórico do banco mais legível para virar descrição ("PIX RECEBIDO CLIENTE ALFA" → "Pix recebido cliente alfa"). */
export function descricaoDoHistorico(h: string): string {
  const t = h.trim().replace(/\s+/g, " ").toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** Texto curto do que a linha conciliada ficou ligada (para a lista e a exportação). */
export function textoLigacao(l: LinhaConciliacao): string {
  const k = l.conciliacao;
  if (!k) return "";
  if (k.tipo === "ignorado") return `Ignorado: ${k.observacao ?? ""}`.trim();
  return k.itens.map((i) => [i.descricao, i.pessoa].filter(Boolean).join(" · ")).join("; ");
}
