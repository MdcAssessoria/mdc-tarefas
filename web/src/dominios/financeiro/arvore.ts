// "Ver caminho": monta a árvore de um documento (pedido → nota → contas → pagamentos, e as entradas/saídas do estoque;
// contrato fixo → contas do mês → recebimentos) a partir dos dados já lidos do banco (arvoreLeituras.ts). Funções puras,
// testadas em arvore.test.ts. A tela (componentes/ArvoreDocumento.tsx) e o PDF (arvorePdf.ts) só desenham o resultado.
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import type { NomeIcone } from "@/components/ui/Icone";
import type { Tom } from "@/components/ui/Tons";
import type { Nota } from "@/dominios/notas/tipos";
import type { Recorrente } from "@/dominios/contratos/tipos";
import { saldoDoTitulo, SITUACOES, situacaoDoTitulo } from "./regras";
import { situacaoPedido } from "./pedidosRegras";
import type { Baixa, MovimentoEstoque, Pedido, Titulo } from "./tipos";

/** De onde a pessoa abriu o "Ver caminho". */
export type PontoArvore =
  | { tipo: "pedido"; id: string }
  | { tipo: "nota"; id: string }
  | { tipo: "titulo"; id: string }
  | { tipo: "baixa"; id: number }
  | { tipo: "contrato"; id: string };

export type ContratoArvore = Pick<
  Recorrente,
  "id" | "tipo" | "descricao" | "numero" | "pessoa_id" | "valor" | "dia_vencimento" | "situacao" | "gera_contas" | "fim" | "gerar_desde"
>;

export interface DadosArvore {
  pedidos: Pedido[];
  pedidoTitulos: { pedido_id: string; titulo_id: string }[];
  /** Pedido de compra ↔ nota achados pelo número do documento e pelo fornecedor (o banco não grava essa ligação). */
  pedidoNotas: { pedido_id: string; nota_id: string }[];
  notas: Nota[];
  titulos: Titulo[];
  baixas: Baixa[];
  movimentos: MovimentoEstoque[];
  contratos: ContratoArvore[];
  nomes: { pessoas: Record<string, string>; contas: Record<string, string>; itens: Record<string, { nome: string; unidade: string }> };
}

/** O que o botão do nó abre: o documento em si (espelho da nota, pedido, histórico da conta) ou a tela do contrato. */
export type AcaoNo = { tipo: "nota" | "pedido" | "titulo" | "contrato"; id: string };

export interface NoArvore {
  chave: string;
  icone: NomeIcone;
  /** Tipo do documento em linguagem simples ("Pedido de compra", "Pagamento"). */
  rotulo: string;
  /** "nº 12 · Distribuidora Exemplo" */
  titulo: string;
  rotuloData: string;
  data: string | null;
  valor: number | null;
  situacao: { nome: string; tom: Tom } | null;
  detalhes: string[];
  /** O que ainda falta neste passo ("Parcela 2/3 em aberto, vence 10/12/2026 · falta R$ 2.500,00"). */
  falta: string | null;
  /** Observação sobre a ligação (ex.: achada pelo número da nota). */
  aviso: string | null;
  acao: AcaoNo | null;
  /** É o documento de onde a pessoa abriu. */
  ponto: boolean;
  /** Estornado ou cancelado: aparece riscado. */
  riscado: boolean;
  filhos: NoArvore[];
}

export interface Arvore {
  raizes: NoArvore[];
  /** Tudo o que falta, na ordem do caminho. */
  pendencias: string[];
  /** Contas a pagar/receber do caminho (sem as canceladas). */
  resumo: { contas: number; total: number; pago: number; falta: number };
}

const arred = (v: number) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ pedido ↔ nota pelo número

/** Números que aparecem no documento do pedido ("NF 555", "NF-e 001.188/1" → ["555"], ["1188", "1"]), sem zeros à esquerda. */
export function numerosDoDocumento(doc: string | null | undefined): string[] {
  if (!doc) return [];
  const limpo = doc.replace(/(\d)\.(\d{3})/g, "$1$2");
  return [...new Set((limpo.match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, "")))];
}

/** O documento do pedido cita o número da nota? (o primeiro número do documento, para "NF 123/1" não casar com a nota 1). */
export function documentoCitaNota(doc: string | null | undefined, numeroNota: string | null | undefined): boolean {
  const n = (numeroNota ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return !!n && numerosDoDocumento(doc)[0] === n;
}

// ------------------------------------------------------------------ origem do ponto

type Raiz = { tipo: "pedido" | "nota" | "titulo" | "contrato"; id: string };

/** Sobe do ponto até a origem: baixa → conta → (contrato | nota → pedido | pedido) ou a própria conta avulsa. */
export function origemDoPonto(ponto: PontoArvore, d: DadosArvore): Raiz | null {
  let tituloId: string | null = null;
  if (ponto.tipo === "baixa") tituloId = d.baixas.find((b) => b.id === ponto.id)?.titulo_id ?? null;
  else if (ponto.tipo === "titulo") tituloId = ponto.id;
  else if (ponto.tipo === "nota") return d.notas.some((n) => n.id === ponto.id) ? origemDaNota(ponto.id, d) : null;
  else
    return d[ponto.tipo === "pedido" ? "pedidos" : "contratos"].some((x) => x.id === ponto.id) ? { tipo: ponto.tipo, id: ponto.id } : null;

  const t = d.titulos.find((x) => x.id === tituloId);
  if (!t) return null;
  if (t.recorrente_id && d.contratos.some((k) => k.id === t.recorrente_id)) return { tipo: "contrato", id: t.recorrente_id };
  const nota = d.notas.find((n) => n.id === t.nota_id || (n.titulos ?? []).includes(t.id));
  if (nota) return origemDaNota(nota.id, d);
  const pt = d.pedidoTitulos.find((x) => x.titulo_id === t.id);
  if (pt && d.pedidos.some((p) => p.id === pt.pedido_id)) return { tipo: "pedido", id: pt.pedido_id };
  return { tipo: "titulo", id: t.id };
}

function origemDaNota(id: string, d: DadosArvore): Raiz {
  const ligado = d.pedidoNotas.find((x) => x.nota_id === id && d.pedidos.some((p) => p.id === x.pedido_id));
  return ligado ? { tipo: "pedido", id: ligado.pedido_id } : { tipo: "nota", id };
}

// ------------------------------------------------------------------ nós

function ehPonto(ponto: PontoArvore, tipo: PontoArvore["tipo"], id: string | number) {
  return ponto.tipo === tipo && String(ponto.id) === String(id);
}

function base(chave: string, icone: NomeIcone, rotulo: string, titulo: string): NoArvore {
  return {
    chave,
    icone,
    rotulo,
    titulo,
    rotuloData: "",
    data: null,
    valor: null,
    situacao: null,
    detalhes: [],
    falta: null,
    aviso: null,
    acao: null,
    ponto: false,
    riscado: false,
    filhos: [],
  };
}

const TOM_PEDIDO: Record<Pedido["situacao"], Tom> = {
  rascunho: "neutro",
  confirmado: "ambar",
  faturado: "verde",
  recebido: "verde",
  cancelado: "neutro",
};

function faltaDoPedido(p: Pedido): string | null {
  if (p.situacao === "cancelado") return null;
  if (p.situacao === "rascunho") return `Pedido nº ${p.numero} em rascunho: ainda não mexeu no estoque nem no financeiro`;
  if (p.tipo === "compra" && p.situacao === "confirmado")
    return `A mercadoria do pedido nº ${p.numero} ainda não chegou${p.previsao ? ` (previsão ${fmtData(p.previsao)})` : ""}`;
  if (p.tipo === "venda" && p.situacao === "confirmado") return `Falta faturar o pedido nº ${p.numero} (emitir a nota)`;
  return null;
}

function noPedido(p: Pedido, d: DadosArvore, c: Contexto): NoArvore {
  const venda = p.tipo === "venda";
  const pessoa = d.nomes.pessoas[p.pessoa_id ?? ""] ?? (venda ? "Sem cliente" : "Sem fornecedor");
  const no = base(
    `pedido:${p.id}`,
    venda ? "seta-saida" : "carteira",
    venda ? "Pedido de venda" : "Pedido de compra",
    `nº ${p.numero} · ${pessoa}`,
  );
  const s = situacaoPedido(p.tipo, p.situacao);
  Object.assign(no, {
    rotuloData: "Data do pedido",
    data: p.data,
    valor: Number(p.total),
    situacao: { nome: s.nome, tom: venda && p.situacao === "confirmado" ? "azul" : TOM_PEDIDO[p.situacao] },
    falta: faltaDoPedido(p),
    acao: { tipo: "pedido", id: p.id },
    ponto: ehPonto(c.ponto, "pedido", p.id),
    riscado: p.situacao === "cancelado",
  });
  if (p.documento) no.detalhes.push(`Documento: ${p.documento}`);
  if (p.condicao) no.detalhes.push(`Condição: ${p.condicao}`);
  if (p.cancelado_motivo) no.detalhes.push(`Motivo do cancelamento: ${p.cancelado_motivo}`);
  const titulos = d.pedidoTitulos.filter((x) => x.pedido_id === p.id).map((x) => x.titulo_id);
  if (!p.lancado_em && p.situacao !== "cancelado" && (p.parcelas ?? []).length)
    no.detalhes.push(
      `Contas ainda não lançadas: ${p.parcelas.map((x) => `${x.numero}ª ${fmtData(x.vencimento)} ${brl(Number(x.valor))}`).join(" · ")}`,
    );
  for (const ligacao of d.pedidoNotas.filter((x) => x.pedido_id === p.id)) {
    const n = d.notas.find((x) => x.id === ligacao.nota_id);
    if (n) {
      const filho = noNota(n, d, c);
      filho.aviso = "Ligada pelo número da nota no pedido e pelo fornecedor";
      // o pedido já lançou estoque e contas: lançar a nota de novo repetiria os valores, então não é pendência
      if (!n.processada && p.lancado_em && filho.falta) {
        filho.falta = null;
        filho.aviso += `. Atenção: o pedido nº ${p.numero} já lançou o estoque e as contas; lançar esta nota com estoque e contas a pagar repetiria os valores`;
      }
      no.filhos.push(filho);
    }
  }
  no.filhos.push(
    ...nosTitulos(
      d.titulos.filter((t) => titulos.includes(t.id)),
      d,
      c,
    ),
  );
  const estoque = noEstoque(`pedido_${p.tipo}`, p.id, d);
  if (estoque) no.filhos.push(estoque);
  return no;
}

function noNota(n: Nota, d: DadosArvore, c: Contexto): NoArvore {
  const servico = n.modelo === "nfse";
  const fornecedor = d.nomes.pessoas[n.pessoa_id ?? ""] ?? n.emitente_nome ?? "Fornecedor não identificado";
  const no = base(
    `nota:${n.id}`,
    "documento",
    servico ? "Nota de serviço recebida" : "Nota fiscal de entrada",
    `nº ${n.numero ?? "—"}${n.serie && !servico ? ` (série ${n.serie})` : ""} · ${fornecedor}`,
  );
  const cancelada = n.situacao !== "autorizada";
  Object.assign(no, {
    rotuloData: "Emissão",
    data: n.emissao,
    valor: Number(n.valor_total),
    situacao: cancelada
      ? { nome: n.situacao === "cancelada" ? "Cancelada pelo fornecedor" : "Denegada", tom: "vermelho" }
      : n.processada
        ? { nome: "Lançada", tom: "verde" }
        : { nome: "Não lançada", tom: "ambar" },
    falta: !cancelada && !n.processada ? `Nota nº ${n.numero ?? "—"} ainda não lançada (estoque e contas a pagar)` : null,
    acao: n.xml_caminho ? { tipo: "nota", id: n.id } : null,
    ponto: ehPonto(c.ponto, "nota", n.id),
    riscado: cancelada,
  });
  if (n.processada && n.data_entrada) no.detalhes.push(`Lançada com entrada em ${fmtData(n.data_entrada)}`);
  const titulos = d.titulos.filter((t) => t.nota_id === n.id || (n.titulos ?? []).includes(t.id));
  no.filhos.push(...nosTitulos(titulos, d, c));
  const estoque = noEstoque("nota_entrada", n.id, d);
  if (estoque) no.filhos.push(estoque);
  return no;
}

function noContrato(k: ContratoArvore, d: DadosArvore, c: Contexto): NoArvore {
  const pagar = k.tipo === "pagar";
  const no = base(`contrato:${k.id}`, "atualizar", pagar ? "Contrato fixo a pagar" : "Contrato fixo a receber", k.descricao);
  const tom: Tom = k.situacao === "ativo" ? "verde" : k.situacao === "suspenso" ? "ambar" : "neutro";
  const nomeSit = { ativo: "Ativo", suspenso: "Suspenso", encerrado: "Encerrado" }[k.situacao];
  Object.assign(no, {
    rotuloData: "Vence todo dia",
    data: null,
    valor: Number(k.valor),
    situacao: { nome: nomeSit, tom },
    acao: { tipo: "contrato", id: k.id },
    ponto: ehPonto(c.ponto, "contrato", k.id),
    riscado: k.situacao === "encerrado",
  });
  no.detalhes.push(
    `${pagar ? "A pagar a" : "A receber de"} ${d.nomes.pessoas[k.pessoa_id] ?? "—"}${k.numero ? ` · contrato nº ${k.numero}` : ""}`,
    `${brl(Number(k.valor))} por mês, vence todo dia ${k.dia_vencimento}`,
  );
  if (k.situacao === "ativo" && k.gera_contas) {
    const proximo = proximoMes(c.hoje);
    if (!k.fim || proximo <= k.fim) no.falta = `Próxima conta do contrato sai em ${fmtData(proximo)}`;
  }
  const contas = d.titulos
    .filter((t) => t.recorrente_id === k.id)
    .sort((a, b) => (a.competencia ?? a.vencimento).localeCompare(b.competencia ?? b.vencimento) || a.id.localeCompare(b.id));
  no.filhos.push(...nosTitulos(contas, d, c));
  return no;
}

/** Dia 1 do mês seguinte a `hoje` (AAAA-MM-01). */
export function proximoMes(hoje: string): string {
  const [a, m] = hoje.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

function nosTitulos(titulos: Titulo[], d: DadosArvore, c: Contexto): NoArvore[] {
  return [...titulos]
    .sort((a, b) => a.parcela - b.parcela || a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id))
    .map((t) => noTitulo(t, d, c));
}

function nomeParcela(t: Titulo): string {
  if (t.recorrente_id && t.competencia) return `Conta de ${fmtCompetencia(t.competencia)}`;
  return t.parcelas > 1 ? `Parcela ${t.parcela}/${t.parcelas}` : "Conta";
}

function noTitulo(t: Titulo, d: DadosArvore, c: Contexto): NoArvore {
  c.titulos.add(t.id);
  const pagar = t.tipo === "pagar";
  const s = situacaoDoTitulo(t, c.hoje);
  const saldo = saldoDoTitulo(t);
  const no = base(
    `titulo:${t.id}`,
    pagar ? "seta-saida" : "seta-entrada",
    pagar ? "Conta a pagar" : "Conta a receber",
    `${nomeParcela(t)} · ${t.descricao.replace(/\s*\(\d+\/\d+\)$/, "")}`,
  );
  Object.assign(no, {
    rotuloData: "Vence",
    data: t.vencimento,
    valor: Number(t.valor),
    situacao: { nome: SITUACOES[s].nome, tom: SITUACOES[s].tom },
    acao: { tipo: "titulo", id: t.id },
    ponto: ehPonto(c.ponto, "titulo", t.id),
    riscado: t.situacao === "cancelado",
  });
  if (t.documento) no.detalhes.push(`Documento: ${t.documento}`);
  if (t.cancelado_motivo) no.detalhes.push(`Motivo do cancelamento: ${t.cancelado_motivo}`);
  if (t.situacao === "aberto" && saldo > 0) {
    const quando = s === "vencido" ? `vencida desde ${fmtData(t.vencimento)}` : `vence ${fmtData(t.vencimento)}`;
    const como = Number(t.valor_pago) > 0 ? "paga em parte" : "em aberto";
    no.falta = `${nomeParcela(t)} ${pagar ? "a pagar" : "a receber"} ${como}, ${quando} · falta ${brl(saldo)}`;
  }
  const baixas = d.baixas.filter((b) => b.titulo_id === t.id).sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  no.filhos.push(...baixas.map((b) => noBaixa(b, t, d, c)));
  return no;
}

function noBaixa(b: Baixa, t: Titulo, d: DadosArvore, c: Contexto): NoArvore {
  const pagar = t.tipo === "pagar";
  const nome = pagar ? "Pagamento" : "Recebimento";
  const no = base(
    `baixa:${b.id}`,
    b.estornada ? "cancelar" : "check",
    b.estornada ? `${nome} estornado` : nome,
    d.nomes.contas[b.conta_id] ?? "Conta bancária",
  );
  Object.assign(no, {
    rotuloData: pagar ? "Pago em" : "Recebido em",
    data: b.data,
    valor: Number(b.total ?? b.valor),
    situacao: b.estornada ? { nome: "Estornado", tom: "neutro" } : { nome: pagar ? "Pago" : "Recebido", tom: "verde" },
    ponto: ehPonto(c.ponto, "baixa", b.id),
    riscado: b.estornada,
  });
  if (b.forma) no.detalhes.push(`Forma: ${b.forma}`);
  const extras = [
    Number(b.juros) && `juros ${brl(Number(b.juros))}`,
    Number(b.multa) && `multa ${brl(Number(b.multa))}`,
    Number(b.desconto) && `desconto ${brl(Number(b.desconto))}`,
  ].filter(Boolean);
  if (extras.length) no.detalhes.push(`Da conta: ${brl(Number(b.valor))} (${extras.join(", ")})`);
  if (b.estornada) no.detalhes.push(`Estornado${b.estorno_motivo ? `: ${b.estorno_motivo}` : ""}`);
  return no;
}

/** Um nó com os movimentos de estoque gerados pelo documento (entrada ou saída), cada item numa linha. */
function noEstoque(origem: string, origemId: string, d: DadosArvore): NoArvore | null {
  const movs = d.movimentos.filter((m) => m.origem === origem && m.origem_id === origemId).sort((a, b) => a.id - b.id);
  if (!movs.length) return null;
  const saida = movs.every((m) => Number(m.quantidade) < 0);
  const validos = movs.filter((m) => !m.estornado);
  const no = base(
    `estoque:${origem}:${origemId}`,
    "caixa",
    saida ? "Saída do estoque" : "Entrada no estoque",
    `${movs.length} movimento(s) de item`,
  );
  const valor = validos.reduce((a, m) => a + Math.abs(Number(m.quantidade)) * Number(m.custo_unitario ?? 0), 0);
  Object.assign(no, {
    rotuloData: "Data",
    data: movs[0].data,
    valor: valor > 0 ? arred(valor) : null,
    situacao: validos.length ? { nome: saida ? "Saiu do estoque" : "No estoque", tom: "verde" } : { nome: "Estornado", tom: "neutro" },
    riscado: !validos.length,
  });
  for (const m of movs) {
    const item = d.nomes.itens[m.item_id];
    const qtd = Math.abs(Number(m.quantidade)).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    no.detalhes.push(
      `${item?.nome ?? "Item"}: ${Number(m.quantidade) < 0 ? "−" : "+"}${qtd} ${item?.unidade ?? ""}`.trim() +
        (m.custo_unitario != null ? ` · custo ${brl(Number(m.custo_unitario))}` : "") +
        (m.estornado ? " · estornado" : ""),
    );
  }
  return no;
}

// ------------------------------------------------------------------ montar

interface Contexto {
  ponto: PontoArvore;
  hoje: string;
  titulos: Set<string>;
}

/** Monta a árvore inteira do documento: da origem até os pagamentos, com o que falta e o resumo das contas. */
export function montarArvore(ponto: PontoArvore, d: DadosArvore, hoje: string): Arvore {
  const c: Contexto = { ponto, hoje, titulos: new Set() };
  const raiz = origemDoPonto(ponto, d);
  const raizes: NoArvore[] = [];
  if (raiz?.tipo === "pedido") raizes.push(noPedido(d.pedidos.find((p) => p.id === raiz.id)!, d, c));
  else if (raiz?.tipo === "nota") {
    const n = d.notas.find((x) => x.id === raiz.id);
    if (n) raizes.push(noNota(n, d, c));
  } else if (raiz?.tipo === "contrato") raizes.push(noContrato(d.contratos.find((k) => k.id === raiz.id)!, d, c));
  else if (raiz?.tipo === "titulo") {
    // conta avulsa: mostra junto as outras parcelas do mesmo lançamento
    const t = d.titulos.find((x) => x.id === raiz.id)!;
    const irmas = t.grupo ? d.titulos.filter((x) => x.grupo === t.grupo && !x.nota_id && !x.recorrente_id) : [t];
    raizes.push(...nosTitulos(irmas, d, c));
  }
  const pendencias: string[] = [];
  const andar = (n: NoArvore) => {
    if (n.falta) pendencias.push(n.falta);
    n.filhos.forEach(andar);
  };
  raizes.forEach(andar);
  const contas = d.titulos.filter((t) => c.titulos.has(t.id) && t.situacao !== "cancelado");
  const total = arred(contas.reduce((a, t) => a + Number(t.valor), 0));
  const falta = arred(contas.reduce((a, t) => a + saldoDoTitulo(t), 0));
  return { raizes, pendencias, resumo: { contas: contas.length, total, pago: arred(total - falta), falta } };
}

/** A árvore em linhas (para o PDF e o Excel): nível de recuo, texto e colunas. */
export function linhasDaArvore(a: Arvore): { nivel: number; no: NoArvore }[] {
  const saida: { nivel: number; no: NoArvore }[] = [];
  const andar = (no: NoArvore, nivel: number) => {
    saida.push({ nivel, no });
    no.filhos.forEach((f) => andar(f, nivel + 1));
  };
  a.raizes.forEach((r) => andar(r, 0));
  return saida;
}
