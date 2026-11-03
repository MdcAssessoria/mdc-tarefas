// Testes do "Ver caminho" (arvore.ts): pedido com 2 parcelas e 1 paga, nota sem pedido, conta avulsa, pagamento
// estornado, contrato com 3 meses, e a ligação pedido ↔ nota pelo número do documento.
import { describe, expect, it } from "vitest";
import { brl } from "@/lib/formato/moeda";
import type { Nota } from "@/dominios/notas/tipos";
import { documentoCitaNota, linhasDaArvore, montarArvore, numerosDoDocumento, origemDoPonto, proximoMes } from "./arvore";
import type { ContratoArvore, DadosArvore, NoArvore } from "./arvore";
import { linhasCaminhoPdf } from "./arvorePdf";
import type { Baixa, MovimentoEstoque, Pedido, Titulo } from "./tipos";

const HOJE = "2026-11-03";
const FORN = "pessoa-forn";
const CLI = "pessoa-cli";
const BANCO = "conta-itau";

const vazio = (): DadosArvore => ({
  pedidos: [],
  pedidoTitulos: [],
  pedidoNotas: [],
  notas: [],
  titulos: [],
  baixas: [],
  movimentos: [],
  contratos: [],
  nomes: {
    pessoas: { [FORN]: "Distribuidora Exemplo", [CLI]: "Cliente ABC" },
    contas: { [BANCO]: "Itaú movimento" },
    itens: { "item-tinta": { nome: "Tinta acrílica 18L", unidade: "UN" } },
  },
});

const titulo = (id: string, o: Partial<Titulo> = {}): Titulo =>
  ({
    id,
    cliente_id: "mdc",
    tipo: "pagar",
    pessoa_id: FORN,
    categoria_id: "cat",
    centro_id: null,
    conta_prevista_id: null,
    descricao: "Pedido de compra nº 7 · Distribuidora Exemplo",
    documento: null,
    emissao: null,
    vencimento: "2026-12-10",
    valor: 500,
    valor_pago: 0,
    parcela: 1,
    parcelas: 1,
    grupo: null,
    situacao: "aberto",
    quitado_em: null,
    cancelado_motivo: null,
    observacao: null,
    recorrente_id: null,
    competencia: null,
    nota_id: null,
    ...o,
  }) as Titulo;

const baixa = (id: number, titulo_id: string, o: Partial<Baixa> = {}): Baixa => ({
  id,
  titulo_id,
  conta_id: BANCO,
  data: "2026-10-10",
  valor: 500,
  juros: 0,
  multa: 0,
  desconto: 0,
  total: 500,
  forma: "Pix",
  observacao: null,
  estornada: false,
  estorno_motivo: null,
  extrato_linha_id: null,
  ...o,
});

const pedido = (o: Partial<Pedido> = {}): Pedido => ({
  id: "ped-7",
  cliente_id: "mdc",
  tipo: "compra",
  numero: 7,
  pessoa_id: FORN,
  data: "2026-09-01",
  previsao: null,
  local_id: "dep",
  categoria_id: "cat",
  centro_id: null,
  total_itens: 1000,
  desconto: 0,
  frete: 0,
  total: 1000,
  condicao: "30 e 60 dias",
  forma_pagamento: "Boleto",
  parcelas: [],
  documento: null,
  observacao: null,
  situacao: "recebido",
  lancado_em: "2026-09-02T12:00:00Z",
  cancelado_em: null,
  cancelado_motivo: null,
  criado_em: "2026-09-01T12:00:00Z",
  ...o,
});

const nota = (o: Partial<Nota> = {}): Nota =>
  ({
    id: "nota-1188",
    modelo: "55",
    numero: "1188",
    serie: "1",
    emissao: "2026-10-01T10:00:00-03:00",
    situacao: "autorizada",
    emitente_nome: "DISTRIBUIDORA EXEMPLO LTDA",
    emitente_doc: "11222333000181",
    valor_total: 635,
    processada: true,
    data_entrada: "2026-10-02",
    pessoa_id: FORN,
    titulos: [],
    xml_caminho: "org/mdc/nfe/1188.xml",
    ...o,
  }) as Nota;

const movimento = (id: number, origem: string, origem_id: string, o: Partial<MovimentoEstoque> = {}): MovimentoEstoque => ({
  id,
  item_id: "item-tinta",
  local_id: "dep",
  data: "2026-09-02",
  tipo: "entrada",
  quantidade: 5,
  custo_unitario: 200,
  origem,
  grupo: null,
  observacao: null,
  estornado: false,
  estorno_motivo: null,
  origem_id,
  saldo_apos: 5,
  custo_medio_apos: 200,
  ...o,
});

/** Todos os nós da árvore em ordem (para procurar por chave). */
const todos = (raizes: NoArvore[]): NoArvore[] => raizes.flatMap((r) => [r, ...todos(r.filhos)]);

describe("pedido de compra com 2 parcelas e 1 paga", () => {
  const d = vazio();
  d.pedidos = [pedido()];
  d.titulos = [
    titulo("t1", { parcela: 1, parcelas: 2, vencimento: "2026-10-01", valor: 500, valor_pago: 500, situacao: "quitado" }),
    titulo("t2", {
      parcela: 2,
      parcelas: 2,
      vencimento: "2026-12-10",
      valor: 500,
      descricao: "Pedido de compra nº 7 · Distribuidora Exemplo (2/2)",
    }),
  ];
  d.pedidoTitulos = [
    { pedido_id: "ped-7", titulo_id: "t1" },
    { pedido_id: "ped-7", titulo_id: "t2" },
  ];
  d.baixas = [baixa(1, "t1", { data: "2026-10-01" })];
  d.movimentos = [movimento(10, "pedido_compra", "ped-7")];

  it("de qualquer ponto (pedido, parcela, pagamento) a raiz é o pedido", () => {
    for (const ponto of [
      { tipo: "pedido", id: "ped-7" },
      { tipo: "titulo", id: "t2" },
      { tipo: "baixa", id: 1 },
    ] as const)
      expect(origemDoPonto(ponto, d)).toEqual({ tipo: "pedido", id: "ped-7" });
  });

  it("monta pedido → 2 parcelas → pagamento, e a entrada no estoque", () => {
    const a = montarArvore({ tipo: "baixa", id: 1 }, d, HOJE);
    expect(a.raizes).toHaveLength(1);
    const [p] = a.raizes;
    expect(p.rotulo).toBe("Pedido de compra");
    expect(p.titulo).toBe("nº 7 · Distribuidora Exemplo");
    expect(p.situacao).toEqual({ nome: "Recebido", tom: "verde" });
    expect(p.filhos.map((f) => f.chave)).toEqual(["titulo:t1", "titulo:t2", "estoque:pedido_compra:ped-7"]);
    expect(p.filhos[1].titulo).toBe("Parcela 2/2 · Pedido de compra nº 7 · Distribuidora Exemplo");
    const [p1, p2, est] = p.filhos;
    expect(p1.situacao?.nome).toBe("Pago");
    expect(p1.filhos).toHaveLength(1);
    expect(p1.filhos[0]).toMatchObject({ rotulo: "Pagamento", titulo: "Itaú movimento", ponto: true, valor: 500 });
    expect(p2.situacao).toEqual({ nome: "A vencer", tom: "azul" });
    expect(p2.filhos).toHaveLength(0);
    expect(est.rotulo).toBe("Entrada no estoque");
    expect(est.valor).toBe(1000);
    expect(est.detalhes[0]).toContain("Tinta acrílica 18L: +5 UN");
  });

  it("mostra o que falta e o resumo das contas", () => {
    const a = montarArvore({ tipo: "pedido", id: "ped-7" }, d, HOJE);
    expect(a.pendencias).toEqual([`Parcela 2/2 a pagar em aberto, vence 10/12/2026 · falta ${brl(500)}`]);
    expect(a.resumo).toEqual({ contas: 2, total: 1000, pago: 500, falta: 500 });
    expect(a.raizes[0].ponto).toBe(true);
  });

  it("parcela vencida diz desde quando", () => {
    const d2 = { ...d, titulos: d.titulos.map((t) => (t.id === "t2" ? { ...t, vencimento: "2026-10-20" } : t)) };
    const a = montarArvore({ tipo: "pedido", id: "ped-7" }, d2, HOJE);
    expect(a.pendencias[0]).toContain("vencida desde 20/10/2026");
    expect(todos(a.raizes).find((n) => n.chave === "titulo:t2")?.situacao?.tom).toBe("vermelho");
  });

  it("linhas para o PDF seguem a ordem e o recuo", () => {
    const linhas = linhasDaArvore(montarArvore({ tipo: "pedido", id: "ped-7" }, d, HOJE));
    expect(linhas.map((l) => `${l.nivel}:${l.no.chave}`)).toEqual([
      "0:pedido:ped-7",
      "1:titulo:t1",
      "2:baixa:1",
      "1:titulo:t2",
      "1:estoque:pedido_compra:ped-7",
    ]);
  });

  it("no PDF, detalhes e o que falta ficam em linhas próprias, recuadas", () => {
    const linhas = linhasCaminhoPdf(montarArvore({ tipo: "baixa", id: 1 }, d, HOJE));
    expect(linhas[0].celulas[0]).toBe("Pedido de compra: nº 7 · Distribuidora Exemplo");
    expect(linhas[0].negrito).toBe(true);
    const pagamento = linhas.find((l) => l.celulas[0].includes("Pagamento"))!;
    expect(pagamento.celulas[0]).toBe("        - > Pagamento: Itaú movimento");
    expect(pagamento.fundo).toBe(true);
    const falta = linhas.find((l) => l.celulas[0].includes("Falta:"))!;
    expect(falta.celulas[0].trim()).toMatch(/^Falta: Parcela 2\/2 a pagar em aberto/);
    expect(falta.alerta).toEqual([true]);
  });
});

describe("nota sem pedido", () => {
  const d = vazio();
  d.notas = [nota({ titulos: ["n1", "n2"] })];
  d.titulos = [
    titulo("n1", { nota_id: "nota-1188", parcela: 1, parcelas: 2, valor: 317.5, documento: "NF 1188/1" }),
    titulo("n2", { nota_id: "nota-1188", parcela: 2, parcelas: 2, valor: 317.5, vencimento: "2027-01-10" }),
  ];
  d.movimentos = [movimento(20, "nota_entrada", "nota-1188", { quantidade: 10, custo_unitario: 50 })];

  it("a raiz é a nota, com as contas e a entrada no estoque", () => {
    const a = montarArvore({ tipo: "titulo", id: "n2" }, d, HOJE);
    const [n] = a.raizes;
    expect(n.rotulo).toBe("Nota fiscal de entrada");
    expect(n.titulo).toBe("nº 1188 (série 1) · Distribuidora Exemplo");
    expect(n.situacao).toEqual({ nome: "Lançada", tom: "verde" });
    expect(n.acao).toEqual({ tipo: "nota", id: "nota-1188" });
    expect(n.filhos.map((f) => f.chave)).toEqual(["titulo:n1", "titulo:n2", "estoque:nota_entrada:nota-1188"]);
    expect(n.filhos[1].ponto).toBe(true);
    expect(a.pendencias).toHaveLength(2);
    expect(a.resumo).toEqual({ contas: 2, total: 635, pago: 0, falta: 635 });
  });

  it("nota ainda não lançada avisa o que falta", () => {
    const d2 = { ...vazio(), notas: [nota({ processada: false, pessoa_id: null })] };
    const a = montarArvore({ tipo: "nota", id: "nota-1188" }, d2, HOJE);
    expect(a.raizes[0].situacao).toEqual({ nome: "Não lançada", tom: "ambar" });
    expect(a.raizes[0].titulo).toContain("DISTRIBUIDORA EXEMPLO LTDA");
    expect(a.pendencias).toEqual(["Nota nº 1188 ainda não lançada (estoque e contas a pagar)"]);
  });
});

describe("pedido de compra ligado à nota pelo número", () => {
  it("lê os números do documento", () => {
    expect(numerosDoDocumento("NF 555")).toEqual(["555"]);
    expect(numerosDoDocumento("NF-e 001.188/1")).toEqual(["1188", "1"]);
    expect(numerosDoDocumento(null)).toEqual([]);
    expect(documentoCitaNota("NF 001188", "1188")).toBe(true);
    expect(documentoCitaNota("NF 1188/1", "1")).toBe(false);
    expect(documentoCitaNota("", "1188")).toBe(false);
  });

  it("nota aberta sobe até o pedido e a ligação fica avisada", () => {
    const d = vazio();
    d.pedidos = [pedido({ documento: "NF 1188" })];
    d.notas = [nota({ processada: false })];
    d.pedidoNotas = [{ pedido_id: "ped-7", nota_id: "nota-1188" }];
    const a = montarArvore({ tipo: "nota", id: "nota-1188" }, d, HOJE);
    expect(a.raizes[0].chave).toBe("pedido:ped-7");
    const n = a.raizes[0].filhos[0];
    expect(n.chave).toBe("nota:nota-1188");
    expect(n.ponto).toBe(true);
    expect(n.aviso).toMatch(/número da nota/);
    expect(n.falta).toBeNull();
    expect(n.aviso).toMatch(/já lançou o estoque e as contas/);
    expect(a.pendencias).toEqual([]);
  });

  it("pedido ainda aguardando: a nota não lançada continua pendente", () => {
    const d = vazio();
    d.pedidos = [pedido({ documento: "NF 1188", situacao: "confirmado", lancado_em: null })];
    d.notas = [nota({ processada: false })];
    d.pedidoNotas = [{ pedido_id: "ped-7", nota_id: "nota-1188" }];
    const a = montarArvore({ tipo: "pedido", id: "ped-7" }, d, HOJE);
    expect(a.pendencias).toEqual([
      "A mercadoria do pedido nº 7 ainda não chegou",
      "Nota nº 1188 ainda não lançada (estoque e contas a pagar)",
    ]);
  });
});

describe("conta avulsa (sem pedido, nota ou contrato)", () => {
  it("a raiz é a própria conta, junto das outras parcelas do mesmo lançamento", () => {
    const d = vazio();
    d.titulos = [
      titulo("a1", { descricao: "Aluguel", grupo: "g", parcela: 1, parcelas: 2, situacao: "quitado", valor_pago: 500 }),
      titulo("a2", { descricao: "Aluguel", grupo: "g", parcela: 2, parcelas: 2 }),
      titulo("outra", { descricao: "Outra coisa" }),
    ];
    d.baixas = [baixa(5, "a1")];
    const a = montarArvore({ tipo: "titulo", id: "a2" }, d, HOJE);
    expect(a.raizes.map((r) => r.chave)).toEqual(["titulo:a1", "titulo:a2"]);
    expect(a.raizes[1].ponto).toBe(true);
    expect(a.raizes[0].filhos[0].rotulo).toBe("Pagamento");
    expect(a.resumo).toEqual({ contas: 2, total: 1000, pago: 500, falta: 500 });
  });

  it("conta a receber sem grupo fica sozinha", () => {
    const d = vazio();
    d.titulos = [titulo("r1", { tipo: "receber", pessoa_id: CLI, descricao: "Venda balcão" })];
    const a = montarArvore({ tipo: "titulo", id: "r1" }, d, HOJE);
    expect(a.raizes).toHaveLength(1);
    expect(a.raizes[0]).toMatchObject({ rotulo: "Conta a receber", icone: "seta-entrada" });
    expect(a.pendencias[0]).toMatch(/^Conta a receber em aberto/);
  });
});

describe("pagamento estornado", () => {
  const d = vazio();
  d.titulos = [titulo("e1", { valor_pago: 200 })];
  d.baixas = [
    baixa(7, "e1", { data: "2026-10-05", estornada: true, estorno_motivo: "Pago na conta errada" }),
    baixa(8, "e1", { data: "2026-10-06", valor: 200, total: 205, juros: 5 }),
  ];

  it("fica riscado, com o motivo, e a conta continua com o que falta", () => {
    const a = montarArvore({ tipo: "baixa", id: 7 }, d, HOJE);
    const [t] = a.raizes;
    expect(t.situacao).toEqual({ nome: "Pago em parte", tom: "violeta" });
    const [estornado, valido] = t.filhos;
    expect(estornado).toMatchObject({ rotulo: "Pagamento estornado", riscado: true, ponto: true, icone: "cancelar" });
    expect(estornado.situacao).toEqual({ nome: "Estornado", tom: "neutro" });
    expect(estornado.detalhes).toContain("Estornado: Pago na conta errada");
    expect(valido).toMatchObject({ riscado: false, valor: 205 });
    expect(valido.detalhes.some((x) => x.includes("juros"))).toBe(true);
    expect(a.pendencias[0]).toContain("paga em parte");
    expect(a.resumo.falta).toBe(300);
  });
});

describe("contrato fixo com 3 meses", () => {
  const k: ContratoArvore = {
    id: "k1",
    tipo: "receber",
    descricao: "Honorários contábeis mensais",
    numero: "2025/031",
    pessoa_id: CLI,
    valor: 2400,
    dia_vencimento: 10,
    situacao: "ativo",
    gera_contas: true,
    fim: null,
    gerar_desde: "2026-09-01",
  };
  const d = vazio();
  d.contratos = [k];
  d.titulos = [
    titulo("m11", { tipo: "receber", recorrente_id: "k1", competencia: "2026-11-01", vencimento: "2026-11-10", valor: 2400 }),
    titulo("m9", {
      tipo: "receber",
      recorrente_id: "k1",
      competencia: "2026-09-01",
      vencimento: "2026-09-10",
      valor: 2400,
      valor_pago: 2400,
      situacao: "quitado",
    }),
    titulo("m10", {
      tipo: "receber",
      recorrente_id: "k1",
      competencia: "2026-10-01",
      vencimento: "2026-10-10",
      valor: 2400,
      valor_pago: 2400,
      situacao: "quitado",
    }),
  ];
  d.baixas = [
    baixa(30, "m9", { data: "2026-09-10", valor: 2400, total: 2400 }),
    baixa(31, "m10", { data: "2026-10-09", valor: 2400, total: 2400 }),
  ];

  it("contrato → contas de cada mês (em ordem) → recebimentos", () => {
    const a = montarArvore({ tipo: "titulo", id: "m10" }, d, HOJE);
    const [c] = a.raizes;
    expect(c).toMatchObject({
      rotulo: "Contrato fixo a receber",
      titulo: "Honorários contábeis mensais",
      acao: { tipo: "contrato", id: "k1" },
    });
    expect(c.filhos.map((f) => f.titulo.split(" · ")[0])).toEqual(["Conta de 09/2026", "Conta de 10/2026", "Conta de 11/2026"]);
    expect(c.filhos[0].filhos[0]).toMatchObject({ rotulo: "Recebimento", rotuloData: "Recebido em" });
    expect(c.filhos[1].ponto).toBe(true);
    expect(c.filhos[2].filhos).toHaveLength(0);
    expect(a.resumo).toEqual({ contas: 3, total: 7200, pago: 4800, falta: 2400 });
    expect(a.pendencias).toEqual([
      "Próxima conta do contrato sai em 01/12/2026",
      `Conta de 11/2026 a receber em aberto, vence 10/11/2026 · falta ${brl(2400)}`,
    ]);
  });

  it("contrato encerrado não promete próxima conta", () => {
    const a = montarArvore({ tipo: "contrato", id: "k1" }, { ...d, contratos: [{ ...k, situacao: "encerrado" }] }, HOJE);
    expect(a.raizes[0].riscado).toBe(true);
    expect(a.pendencias.some((p) => p.startsWith("Próxima conta"))).toBe(false);
  });

  it("próximo mês vira o ano", () => {
    expect(proximoMes("2026-12-15")).toBe("2027-01-01");
    expect(proximoMes("2026-03-31")).toBe("2026-04-01");
  });
});

describe("ponto que não existe", () => {
  it("não monta nada", () => {
    expect(montarArvore({ tipo: "pedido", id: "x" }, vazio(), HOJE).raizes).toEqual([]);
    expect(montarArvore({ tipo: "baixa", id: 99 }, vazio(), HOJE).raizes).toEqual([]);
  });
});
