import { describe, expect, it } from "vitest";
import { formatarChaveNfse, formatarCodigoServico, formatarNbs, notaEmitida, podeEmitirNota, situacaoDaNota, ultimasEmissoes } from "./nfse";
import type { EmissaoNfse } from "./tipos";

const emissao = (n: number, extra: Partial<EmissaoNfse>): EmissaoNfse => ({
  id: `e${n}`,
  fatura_id: "f1",
  ambiente: "producao",
  serie: "1",
  ndps: n,
  id_dps: "DPS",
  situacao: "rejeitada",
  chave_acesso: null,
  numero_nfse: null,
  xml_caminho: null,
  mensagem: null,
  mensagens: [],
  tentativas: 1,
  enviado_em: `2026-11-03T10:0${n}:00Z`,
  respondido_em: null,
  criado_em: `2026-11-03T10:0${n}:00Z`,
  ...extra,
});
const fatura = { documento: "nfse" as const, nfse_situacao: "a_emitir" as const, nfse_numero: null, situacao: "aguardando_nf" as const };

describe("NFS-e na lista de faturas", () => {
  it("formata código de tributação nacional, NBS e chave", () => {
    expect(formatarCodigoServico("171901")).toBe("17.19.01");
    expect(formatarCodigoServico("17.19")).toBe("17.19");
    expect(formatarNbs("113021000")).toBe("1.1302.10.00");
    expect(formatarChaveNfse("1234567890")).toBe("12345 67890");
  });
  it("última tentativa de cada fatura e a nota de verdade", () => {
    const lista = [emissao(1, {}), emissao(3, { situacao: "emitida", numero_nfse: "16" }), emissao(2, { ambiente: "producao_restrita", situacao: "emitida" })];
    expect(ultimasEmissoes(lista).get("f1")?.id).toBe("e3");
    expect(notaEmitida(lista, "f1")?.numero_nfse).toBe("16");
    expect(notaEmitida([emissao(2, { ambiente: "producao_restrita", situacao: "emitida" })], "f1")).toBeNull();
  });
  it("situação em linguagem simples, com o motivo da recusa", () => {
    expect(situacaoDaNota({ ...fatura, documento: "fatura", nfse_situacao: "nao_se_aplica" }).texto).toBe("Sem nota fiscal");
    expect(situacaoDaNota(fatura)).toEqual({ texto: "NFS-e pronta para emitir", tom: "ambar", detalhe: null });
    const recusa = situacaoDaNota({ ...fatura, nfse_situacao: "erro" }, emissao(1, { mensagem: "Código NBS inválido (E0312)" }));
    expect(recusa).toEqual({ texto: "Nota fiscal recusada", tom: "vermelho", detalhe: "Código NBS inválido (E0312)" });
    expect(situacaoDaNota({ ...fatura, nfse_situacao: "erro" }, emissao(1, { situacao: "erro", mensagem: "x" })).detalhe).toMatch(/confere no Emissor/);
    expect(situacaoDaNota(fatura, emissao(1, { ambiente: "producao_restrita", situacao: "emitida", numero_nfse: "3" })).texto).toBe(
      "Nota de teste nº 3 emitida",
    );
    expect(situacaoDaNota({ ...fatura, nfse_situacao: "emitida", nfse_numero: "16", situacao: "enviada" }).tom).toBe("verde");
  });
  it("emitir só com NFS-e, fatura ativa e nota ainda não emitida", () => {
    expect(podeEmitirNota(fatura)).toBe(true);
    expect(podeEmitirNota({ ...fatura, nfse_situacao: "erro" })).toBe(true);
    expect(podeEmitirNota({ ...fatura, nfse_situacao: "emitida" })).toBe(false);
    expect(podeEmitirNota({ ...fatura, situacao: "cancelada" })).toBe(false);
    expect(podeEmitirNota({ ...fatura, documento: "fatura" })).toBe(false);
  });
});
