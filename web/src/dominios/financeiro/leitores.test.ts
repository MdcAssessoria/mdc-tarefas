import { describe, expect, it } from "vitest";
import { chavesDoArquivo, lerOfx } from "./ofx";
import { dataBr, lerExtratoPlanilha, valorBr } from "./extratoPlanilha";
import { lerPlanoDominio } from "./planoDominio";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0001<BRANCHID>1234-5<ACCTID>98765-4<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260101<DTEND>20260131
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260105120000[-3:BRT]<TRNAMT>1500,00<FITID>A1<NAME>PIX RECEBIDO CLIENTE X
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110<TRNAMT>-230.45<FITID>A2<CHECKNUM>778<MEMO>PAGTO BOLETO ENERGIA
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>12.345,67<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("lerOfx", () => {
  it("lê conta, período, saldo e lançamentos do OFX SGML (vírgula ou ponto decimal)", () => {
    const e = lerOfx(OFX_SGML);
    expect(e).toMatchObject({
      banco: "0001",
      agencia: "1234-5",
      conta: "98765-4",
      inicio: "2026-01-01",
      fim: "2026-01-31",
      saldoFinal: 12345.67,
    });
    expect(e.lancamentos).toEqual([
      { data: "2026-01-05", valor: 1500, descricao: "PIX RECEBIDO CLIENTE X", documento: null, fitid: "A1" },
      { data: "2026-01-10", valor: -230.45, descricao: "PAGTO BOLETO ENERGIA", documento: "778", fitid: "A2" },
    ]);
  });

  it("lê OFX XML com tags fechadas", () => {
    const xml = `<?xml version="1.0"?><OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260201</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>X9</FITID><NAME>TARIFA</NAME></STMTTRN></BANKTRANLIST></OFX>`;
    expect(lerOfx(xml).lancamentos[0]).toMatchObject({ data: "2026-02-01", valor: -10, fitid: "X9", descricao: "TARIFA" });
  });

  it("recusa arquivo que não é OFX", () => {
    expect(() => lerOfx("data;valor")).toThrow(/OFX/);
  });

  it("chave sem FITID diferencia lançamentos iguais no mesmo arquivo", () => {
    const l = { data: "2026-01-01", valor: -5, descricao: "TARIFA", documento: null, fitid: null };
    const [a, b] = chavesDoArquivo([l, { ...l }]);
    expect(a).not.toBe(b);
  });
});

describe("extrato em planilha", () => {
  it("converte valores e datas brasileiros", () => {
    expect(valorBr("1.234,56")).toBe(1234.56);
    expect(valorBr("150,00 D")).toBe(-150);
    expect(valorBr("(80,00)")).toBe(-80);
    expect(valorBr("80,00-")).toBe(-80);
    expect(dataBr("05/01/26")).toBe("2026-01-05");
    expect(dataBr(46027)).toBe("2026-01-05");
  });

  it("acha o cabeçalho com débito e crédito, ignora saldo", () => {
    const m = [
      ["Banco X - Extrato"],
      ["Data", "Histórico", "Documento", "Crédito", "Débito"],
      ["01/01/2026", "SALDO ANTERIOR", "", "", ""],
      ["02/01/2026", "PIX RECEBIDO", "1", "500,00", ""],
      ["03/01/2026", "TARIFA", "", "", "12,90"],
    ];
    const e = lerExtratoPlanilha(m);
    expect(e.lancamentos).toEqual([
      { data: "2026-01-02", valor: 500, descricao: "PIX RECEBIDO", documento: "1", fitid: null },
      { data: "2026-01-03", valor: -12.9, descricao: "TARIFA", documento: null, fitid: null },
    ]);
    expect(e).toMatchObject({ inicio: "2026-01-02", fim: "2026-01-03" });
  });

  it("explica quando não acha as colunas", () => {
    expect(() => lerExtratoPlanilha([["a", "b"]])).toThrow(/Data e Valor/);
  });
});

describe("lerPlanoDominio", () => {
  it("usa a coluna Tipo quando existe", () => {
    const m = [
      ["Plano de contas"],
      ["Código", "Classificação", "Descrição", "Tipo"],
      [1, "1", "ATIVO", "S"],
      [5, "1.1.1.02", "BANCOS", "S"],
      [6, "1.1.1.02.001", "BANCO DO BRASIL", "A"],
    ];
    const { contas } = lerPlanoDominio(m);
    expect(contas.map((c) => [c.classificacao, c.codigo, c.analitica, c.nivel])).toEqual([
      ["1", "1", false, 1],
      ["1.1.1.02", "5", false, 4],
      ["1.1.1.02.001", "6", true, 5],
    ]);
  });

  it("sem coluna Tipo, analítica é a conta sem filhas", () => {
    const m = [
      ["Classificação", "Nome"],
      ["3", "RECEITAS"],
      ["3.1.1", "VENDAS"],
    ];
    const r = lerPlanoDominio(m);
    expect(r.contas.map((c) => c.analitica)).toEqual([false, true]);
    expect(r.avisos.join(" ")).toMatch(/código reduzido/);
  });
});
