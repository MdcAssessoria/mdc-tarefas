// Testes da sugestão automática da conciliação do extrato (mesmos casos do teste de banco 112).
import { describe, expect, it } from "vitest";
import {
  ajustarDiferenca,
  descricaoDoHistorico,
  diasEntre,
  maisParecido,
  palavras,
  semelhanca,
  somaSelecao,
  sugerir,
  textoLigacao,
} from "./conciliacao";
import type { BaixaSemExtrato, Candidato, LinhaConciliacao, TituloAberto, TransferenciaSemExtrato } from "./conciliacao";

const linha = (data: string, valor: number, descricao: string, documento: string | null = null): LinhaConciliacao => ({
  id: 1,
  data,
  valor,
  descricao,
  documento,
  situacao: "pendente",
  conciliacao: null,
});
const titulo = (
  id: string,
  tipo: "pagar" | "receber",
  vencimento: string,
  saldo: number,
  pessoa: string,
  descricao = "Conta",
): TituloAberto => ({
  id,
  tipo,
  vencimento,
  saldo,
  descricao,
  documento: null,
  pessoa,
});
const baixa = (id: number, data: string, valor: number, pessoa: string, forma: string | null = "Pix"): BaixaSemExtrato => ({
  id,
  data,
  valor,
  tipo: valor > 0 ? "receber" : "pagar",
  descricao: "Conta",
  documento: null,
  pessoa,
  forma,
});
const transf = (id: number, data: string, valor: number, outra: string): TransferenciaSemExtrato => ({
  id,
  data,
  valor,
  outra_conta: outra,
  observacao: null,
});
const vazio = { baixas: [] as BaixaSemExtrato[], titulos: [] as TituloAberto[], transferencias: [] as TransferenciaSemExtrato[] };

describe("palavras e semelhança", () => {
  it("tira acento, palavras comuns de extrato e números", () => {
    expect(palavras("PIX RECEBIDO Cliente Álfa Ltda 123")).toEqual(["CLIENTE", "ALFA"]);
  });
  it("mede quanto do nome aparece no histórico", () => {
    expect(semelhanca("PIX RECEBIDO CLIENTE ALFA LTDA", "Cliente Alfa Ltda")).toBe(1);
    expect(semelhanca("PIX RECEBIDO CLIENTE ALFA LTDA", "Imobiliária Centro")).toBe(0);
    expect(semelhanca("PAGAMENTO IMOBILIARIA", "Imobiliária Centro")).toBe(0.5);
  });
  it("conta dias nos dois sentidos", () => {
    expect(diasEntre("2030-10-06", "2030-10-01")).toBe(5);
    expect(diasEntre("2030-10-01", "2030-10-06")).toBe(5);
    expect(diasEntre("2030-03-01", "2030-02-28")).toBe(1);
  });
});

describe("sugerir", () => {
  it("valor igual, data perto e nome parecido ficam em primeiro e combinam muito", () => {
    const s = sugerir(linha("2030-10-06", 1500, "PIX RECEBIDO CLIENTE ALFA LTDA"), {
      ...vazio,
      titulos: [
        titulo("t-outro", "receber", "2030-10-06", 1500, "Cliente Beta"),
        titulo("t-alfa", "receber", "2030-10-05", 1500, "Cliente Alfa Ltda"),
      ],
    });
    expect(s[0].candidatos[0].item.id).toBe("t-alfa");
    expect(s[0].pontos).toBeGreaterThanOrEqual(75);
    expect(s[0].motivos).toContain("valor igual");
    expect(s[0].motivos.some((m) => m.startsWith("nome parecido"))).toBe(true);
  });

  it("nunca sugere conta do sentido contrário (saída com conta a receber)", () => {
    const s = sugerir(linha("2030-10-07", -500, "PAGAMENTO"), { ...vazio, titulos: [titulo("r", "receber", "2030-10-07", 500, "X")] });
    expect(s).toEqual([]);
  });

  it("valor diferente demais não vira sugestão; perto (até 3%) aparece como provável juros", () => {
    const dados = { ...vazio, titulos: [titulo("t", "receber", "2030-10-14", 1500, "Cliente Alfa")] };
    expect(sugerir(linha("2030-10-15", 1700, "PIX CLIENTE ALFA"), dados)).toEqual([]);
    const s = sugerir(linha("2030-10-15", 1520, "PIX CLIENTE ALFA ATRASADO"), dados);
    expect(s[0].motivos).toContain("valor perto (provável juros)");
  });

  it("acha o pagamento agrupado: duas contas que somam o débito", () => {
    const s = sugerir(linha("2030-10-07", -500, "PAGAMENTO BOLETOS IMOBILIARIA CENTRO"), {
      ...vazio,
      titulos: [
        titulo("a", "pagar", "2030-10-06", 300, "Imobiliária Centro"),
        titulo("b", "pagar", "2030-10-06", 200, "Imobiliária Centro"),
        titulo("c", "pagar", "2030-10-06", 450, "Outro"),
      ],
    });
    expect(s[0].candidatos.map((c) => c.item.id).sort()).toEqual(["a", "b"]);
    expect(s[0].motivos[0]).toBe("a soma de 2 contas dá o valor exato");
  });

  it("boleto já baixado pelo Ledgra Link ganha prioridade sobre conta parecida", () => {
    const s = sugerir(linha("2030-10-10", 900, "LIQUIDACAO COBRANCA"), {
      ...vazio,
      baixas: [baixa(7, "2030-10-10", 900, "Cliente Gama", "Boleto (Ledgra Link)")],
      titulos: [titulo("t", "receber", "2030-10-10", 900, "Cliente Gama")],
    });
    expect(s[0].candidatos[0].tipo).toBe("baixa");
    expect(s[0].motivos).toContain("boleto já pago pelo Ledgra Link");
  });

  it("sugere a transferência já lançada na outra conta", () => {
    const s = sugerir(linha("2030-10-09", 1000, "TED RECEBIDA MDC"), {
      ...vazio,
      transferencias: [transf(3, "2030-10-09", 1000, "Banco MDC")],
    });
    expect(s[0].candidatos[0].tipo).toBe("transferencia");
  });

  it("data longe e nome diferente ficam abaixo do mínimo", () => {
    const s = sugerir(linha("2030-10-01", 80, "TARIFA"), { ...vazio, baixas: [baixa(9, "2030-12-20", 80, "Fulano")] });
    expect(s).toEqual([]);
  });
});

describe("seleção da janela Conciliar", () => {
  const t: Candidato = { tipo: "titulo", item: titulo("t", "receber", "2030-10-01", 1500, "Alfa") };
  const b: Candidato = { tipo: "baixa", item: baixa(1, "2030-10-01", -250, "Condomínio") };
  it("soma com o sinal do extrato e considera juros e desconto", () => {
    expect(somaSelecao([t], {})).toBe(1500);
    expect(somaSelecao([t], { t: { valor: 1500, juros: 20, desconto: 0 } })).toBe(1520);
    expect(somaSelecao([b], {})).toBe(-250);
  });
  it("leva a diferença para juros (banco maior) ou desconto (banco menor)", () => {
    expect(ajustarDiferenca(1520, [t], {})).toEqual({ t: { valor: 1500, juros: 20, desconto: 0 } });
    expect(ajustarDiferenca(1490, [t], {})).toEqual({ t: { valor: 1500, juros: 0, desconto: 10 } });
    expect(ajustarDiferenca(-250, [b], {})).toBeNull();
  });
});

describe("criar lançamento e textos", () => {
  it("sugere o cadastro cujo nome aparece no histórico", () => {
    const pessoas = [
      { id: "1", nome: "Imobiliária Centro Ltda" },
      { id: "2", nome: "Cliente Alfa Ltda" },
    ];
    expect(maisParecido("PIX RECEBIDO CLIENTE ALFA", pessoas)?.id).toBe("2");
    expect(maisParecido("TARIFA PACOTE", pessoas)).toBeNull();
    expect(maisParecido("TARIFA PACOTE SERVICOS", [{ id: "c", nome: "Tarifas bancárias" }])?.id).toBe("c");
  });
  it("deixa o histórico legível e descreve a ligação", () => {
    expect(descricaoDoHistorico("  TARIFA   PACOTE SERVICOS ")).toBe("Tarifa pacote servicos");
    const l = linha("2030-10-12", 50, "DEPOSITO TESTE");
    expect(textoLigacao({ ...l, conciliacao: { id: 1, tipo: "ignorado", observacao: "Depósito de teste", em: "", itens: [] } })).toBe(
      "Ignorado: Depósito de teste",
    );
  });
});
