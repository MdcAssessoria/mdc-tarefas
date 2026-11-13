// Testa as regras do acervo societário: ordem, documentos de base, sugestão do substituído e busca.
import { describe, expect, it } from "vitest";
import { casaBusca, documentosBase, nomeCategoria, ordenarAcervo, sugerirSubstituido } from "./acervo";
import type { DocumentoAcervo } from "./acervo";

function doc(
  id: string,
  categoria: DocumentoAcervo["categoria"],
  data: string | null,
  vigente = true,
  nome = `${id}.pdf`,
): DocumentoAcervo {
  return {
    id,
    org_id: "o",
    cliente_id: "c",
    arquivo_id: `a-${id}`,
    categoria,
    descricao: null,
    data_documento: data,
    registro: null,
    processo_id: null,
    vigente,
    substituido_por: null,
    substituido_em: null,
    criado_em: "2026-11-13T10:00:00Z",
    arquivo: { id: `a-${id}`, nome, caminho: `x/${nome}`, tamanho: 10, tipo: "application/pdf" },
  };
}

const ACERVO = [
  doc("cartao", "cartao_cnpj", "2026-01-05"),
  doc("contrato-antigo", "contrato_social", "2018-03-10", false),
  doc("alt3", "alteracao_contratual", "2026-11-10"),
  doc("socio", "documento_socio", null, true, "RG Maria.pdf"),
  doc("alvara", "alvara", "2025-06-01"),
];

describe("acervo societário", () => {
  it("nome do tipo, com 'Outro documento' para o desconhecido", () => {
    expect(nomeCategoria("consolidacao")).toBe("Contrato consolidado");
    expect(nomeCategoria("xyz")).toBe("Outro documento");
  });
  it("vigentes primeiro e, dentro deles, pela ordem dos tipos", () => {
    expect(ordenarAcervo(ACERVO).map((d) => d.id)).toEqual(["alt3", "cartao", "socio", "alvara", "contrato-antigo"]);
  });
  it("base do processo: só vigentes de contrato, CNPJ e sócios", () => {
    expect(documentosBase(ACERVO).map((d) => d.id)).toEqual(["alt3", "cartao", "socio"]);
  });
  it("sugere o vigente do grupo do contrato para alteração e consolidação", () => {
    expect(sugerirSubstituido(ACERVO, "consolidacao")).toBe("alt3");
    expect(sugerirSubstituido(ACERVO, "alteracao_contratual")).toBe("alt3");
    expect(sugerirSubstituido(ACERVO, "cartao_cnpj")).toBe("cartao");
    expect(sugerirSubstituido(ACERVO, "documento_socio")).toBe("");
    expect(sugerirSubstituido(ACERVO, "procuracao")).toBe("");
  });
  it("busca sem acento por tipo, arquivo e cliente", () => {
    expect(casaBusca(ACERVO[2], "alteracao")).toBe(true);
    expect(casaBusca(ACERVO[3], "rg maria")).toBe(true);
    expect(casaBusca(ACERVO[0], "greencore cartão", "Greencore Indústria")).toBe(true);
    expect(casaBusca(ACERVO[0], "alvará")).toBe(false);
  });
});
