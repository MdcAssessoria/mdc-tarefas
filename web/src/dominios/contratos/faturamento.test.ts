import { describe, expect, it } from "vitest";
import { numeroBr } from "@/dominios/financeiro/regras";
import {
  codigoServicoValido,
  conferirFaturamento,
  dataGeracao,
  documentoDoEnvio,
  fmtWhatsapp,
  OPCOES_ENVIO,
  proximaGeracao,
  textoConteudo,
  vencimentoDoMes,
  geraDepoisDoVencimento,
} from "./faturamento";
import type { FaturamentoForm } from "./faturamento";

describe("dia de gerar e vencimento (igual a app.fin_recorrente_vencimento, 048)", () => {
  it("vence sempre no mesmo mês da geração (decisão do Edvaldo)", () => {
    expect(vencimentoDoMes("2028-01-01", "receber", 1, 5)).toBe("2028-01-05");
    expect(vencimentoDoMes("2028-01-01", "receber", 10, 10)).toBe("2028-01-10");
    expect(vencimentoDoMes("2028-12-01", "receber", 1, 5)).toBe("2028-12-05");
  });
  it("gerar depois do dia de vencer é recusado (a fatura nasceria vencida)", () => {
    expect(geraDepoisDoVencimento("receber", 25, 5)).toBe(true);
    expect(geraDepoisDoVencimento("receber", 5, 5)).toBe(false);
    expect(geraDepoisDoVencimento("pagar", 25, 5)).toBe(false);
  });
  it("dia que o mês não tem vira o último", () => {
    expect(vencimentoDoMes("2028-01-01", "receber", 1, 10)).toBe("2028-01-10");
    expect(vencimentoDoMes("2028-01-01", "receber", 28, 31)).toBe("2028-01-31");
    expect(vencimentoDoMes("2028-02-01", "receber", 28, 30)).toBe("2028-02-29");
  });
  it("a pagar continua no mesmo mês e nasce no dia 1", () => {
    expect(vencimentoDoMes("2028-01-01", "pagar", 25, 1)).toBe("2028-01-01");
    expect(dataGeracao("2028-01-01", "pagar", 25)).toBe("2028-01-01");
    expect(dataGeracao("2028-01", "receber", 25)).toBe("2028-01-25");
  });
  it("próxima geração: este mês se o dia ainda vem, senão o próximo", () => {
    expect(proximaGeracao("2028-01-10", "receber", 25)).toBe("2028-01");
    expect(proximaGeracao("2028-01-25", "receber", 25)).toBe("2028-01");
    expect(proximaGeracao("2028-01-26", "receber", 25)).toBe("2028-02");
  });
});

describe("o que enviar", () => {
  it("as quatro opções na ordem do pedido, com o documento certo", () => {
    expect(OPCOES_ENVIO.map((o) => o.id)).toEqual(["nf_fatura_boleto", "nf_fatura", "fatura_boleto", "fatura"]);
    expect(OPCOES_ENVIO.every((o) => documentoDoEnvio(o.id) === o.documento)).toBe(true);
    expect(OPCOES_ENVIO.every((o) => o.icones.length > 0)).toBe(true);
  });
  it("texto do conteúdo de um envio", () => {
    expect(textoConteudo(["nfse", "fatura", "boleto"])).toBe("Nota fiscal + fatura + boleto");
    expect(textoConteudo(["fatura", "boleto"])).toBe("Fatura + boleto");
    expect(textoConteudo(["fatura"])).toBe("Fatura");
  });
});

describe("conferir antes de salvar (mesmas regras do banco)", () => {
  const ok: FaturamentoForm = {
    envio: "fatura",
    diaGeracao: "25",
    canais: [],
    email: "",
    whatsapp: "",
    carteira: "",
    servicoDescricao: "",
    servicoCodigo: "",
    iss: "",
    boletoBanco: "",
  };
  it("aceita o mínimo e recusa o que o banco recusa", () => {
    expect(conferirFaturamento(ok, numeroBr)).toBe("");
    expect(conferirFaturamento({ ...ok, diaGeracao: "29" }, numeroBr)).toMatch(/1 a 28/);
    expect(conferirFaturamento({ ...ok, canais: ["email"], email: "sem-arroba" }, numeroBr)).toMatch(/e-mail/);
    expect(conferirFaturamento({ ...ok, canais: ["whatsapp"], whatsapp: "98888" }, numeroBr)).toMatch(/DDD/);
    expect(conferirFaturamento({ ...ok, canais: ["portal"] }, numeroBr)).toMatch(/Portal/);
  });
  it("dia de gerar até o dia de vencer e banco do boleto (048)", () => {
    expect(conferirFaturamento(ok, numeroBr, 25)).toBe("");
    expect(conferirFaturamento(ok, numeroBr, 5)).toMatch(/mesmo mês/);
    expect(conferirFaturamento({ ...ok, envio: "fatura_boleto" }, numeroBr)).toMatch(/banco do boleto/);
    expect(conferirFaturamento({ ...ok, envio: "fatura_boleto", boletoBanco: "itau" }, numeroBr)).toBe("");
  });
  it("nota fiscal pede serviço, código e ISS de 0 a 5%", () => {
    const nf = { ...ok, envio: "nf_fatura" as const, boletoBanco: "santander" as const, servicoDescricao: "Contabilidade", servicoCodigo: "17.01.01", iss: "2" };
    expect(conferirFaturamento(nf, numeroBr)).toBe("");
    expect(conferirFaturamento({ ...nf, servicoCodigo: "abc" }, numeroBr)).toMatch(/código/);
    expect(conferirFaturamento({ ...nf, iss: "7" }, numeroBr)).toMatch(/ISS/);
    expect(conferirFaturamento({ ...nf, iss: "2,5" }, numeroBr)).toBe("");
  });
  it("código do serviço e WhatsApp", () => {
    expect(["17.01.01", "170101", "17.01", "1701"].every(codigoServicoValido)).toBe(true);
    expect(codigoServicoValido("17.1")).toBe(false);
    expect(fmtWhatsapp("11988887777")).toBe("(11) 98888-7777");
    expect(fmtWhatsapp("5511988887777")).toBe("(11) 98888-7777");
    expect(fmtWhatsapp("1133334444")).toBe("(11) 3333-4444");
  });
});
