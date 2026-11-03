import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarFaturaPdf, observacoesFatura } from "./faturaPdf";
import type { DadosFaturaPdf } from "./faturaPdf";

const fatura: DadosFaturaPdf["fatura"] = {
  numero: "2028/00001",
  emissao: "2028-01-25",
  vencimento: "2028-02-05",
  competencia: "2028-01-01",
  valor: 1500,
  descricao: "Serviços de contabilidade · 01/2028",
  documento: "nfse",
  envio: "nf_fatura_boleto",
  situacao: "aguardando_nf",
  nfse_situacao: "a_emitir",
  nfse_numero: null,
  boleto_situacao: "a_definir",
  servico_codigo: "17.01.01",
  iss_aliquota: 2,
  cancelamento_motivo: null,
};

describe("fatura em PDF", () => {
  it("uma página no papel timbrado, com o número no título", async () => {
    const bytes = await gerarFaturaPdf({ fatura, cliente: { nome: "Gama Comércio Ltda", documento: "11222333000181" } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Fatura 2028/00001 — Gama Comércio Ltda");
  });
  it("com NFS-e avisa que a nota será emitida; emitida mostra o número", () => {
    expect(observacoesFatura(fatura)[0]).toBe("Nota fiscal a ser emitida (NFS-e pelo Emissor Nacional).");
    expect(observacoesFatura({ ...fatura, nfse_situacao: "emitida", nfse_numero: "123" })[0]).toMatch(/nº 123 emitida/);
  });
  it("boleto depois, só fatura e cancelada", () => {
    expect(observacoesFatura({ ...fatura, envio: "nf_fatura" })).toContain("O boleto para pagamento será enviado separadamente.");
    const so = {
      ...fatura,
      documento: "fatura" as const,
      envio: "fatura" as const,
      nfse_situacao: "nao_se_aplica" as const,
      boleto_situacao: "nao_se_aplica" as const,
    };
    expect(observacoesFatura(so)).toEqual(["Pagamento conforme combinado em contrato."]);
    expect(observacoesFatura({ ...so, situacao: "cancelada", cancelamento_motivo: "Valor errado" })[0]).toBe(
      "Fatura CANCELADA: Valor errado. Não pague.",
    );
  });
});
