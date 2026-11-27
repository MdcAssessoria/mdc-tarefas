import { describe, expect, it } from "vitest";
import { arquivoAceito, filtrarAchados, regimeDoCadastro, type AchadoAuditoria } from "./auditoriaFiscal";

const a = (p: Partial<AchadoAuditoria>): AchadoAuditoria => ({
  regra: "R22",
  titulo: "CFOP × utilização",
  gravidade: "aviso",
  documento: "NF 10",
  data: "2026-10-01",
  item: "1",
  descricao: "Serviço de manutenção",
  ncm: null,
  cfop: "1949",
  mensagem: "",
  esperado: "",
  informado: "",
  diferenca: 0,
  ...p,
});

describe("auditoria fiscal (SAP)", () => {
  it("aceita só os formatos que o Ledgra lê", () => {
    expect(arquivoAceito("COUTINHO_FISCAL_2026_10.txt")).toBe(true);
    expect(arquivoAceito("relatorio.XLSX")).toBe(true);
    expect(arquivoAceito("relatorio.pdf")).toBe(false);
  });
  it("tira o regime do cadastro", () => {
    expect(regimeDoCadastro("Lucro Real")).toBe("NAO CUMULATIVO");
    expect(regimeDoCadastro("presumido")).toBe("CUMULATIVO");
    expect(regimeDoCadastro("Simples Nacional")).toBe("SIMPLES");
    expect(regimeDoCadastro(null)).toBe("");
  });
  it("filtra por regra, gravidade e busca sem acento", () => {
    const lista = [a({}), a({ regra: "R29", gravidade: "erro", descricao: "Energia elétrica" })];
    expect(filtrarAchados(lista, { regra: "R29", gravidade: "", busca: "" })).toHaveLength(1);
    expect(filtrarAchados(lista, { regra: "", gravidade: "aviso", busca: "" })[0]?.regra).toBe("R22");
    expect(filtrarAchados(lista, { regra: "", gravidade: "", busca: "eletrica" })[0]?.regra).toBe("R29");
  });
});
