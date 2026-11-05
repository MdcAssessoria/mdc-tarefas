import { describe, expect, it } from "vitest";
import { municipiosDoTexto, nomeMunicipio, regraDoCodigo, resumoRegra } from "./regrasFiscais";
import type { RegraServico } from "./tipos";

const base: RegraServico = {
  id: "r1",
  cliente_id: "c",
  servico_codigo: "171901",
  nome: "Honorários contábeis",
  descricao_nota: null,
  nbs: "113021000",
  iss_aliquota: 2,
  iss_retencao: "nao",
  iss_retencao_municipios: [],
  cclasstrib: null,
  cindop: null,
  ativo: true,
  inativo_motivo: null,
  atualizado_em: "2026-11-04T00:00:00Z",
};

describe("regras fiscais", () => {
  it("lê a lista de municípios do texto", () => {
    expect(municipiosDoTexto("Atibaia / SP; Bragança Paulista-SP\nJundiaí/SP")).toEqual(["Atibaia/SP", "Bragança Paulista/SP", "Jundiaí/SP"]);
    expect(municipiosDoTexto(" ; ")).toEqual([]);
  });
  it("mostra o município guardado sem acento com letra maiúscula", () => {
    expect(nomeMunicipio("braganca paulista/SP")).toBe("Braganca Paulista/SP");
    expect(nomeMunicipio("sao jose dos campos/SP")).toBe("Sao Jose dos Campos/SP");
  });
  it("resume a regra numa frase", () => {
    expect(resumoRegra(base)).toBe("NBS 1.1302.10.00 · ISS 2% · não retém ISS");
    expect(resumoRegra({ ...base, nbs: null, iss_aliquota: 2.5, iss_retencao: "municipios", iss_retencao_municipios: ["atibaia/SP"] })).toBe(
      "NBS padrão · ISS 2,5% · ISS retido em Atibaia/SP",
    );
  });
  it("acha a regra ativa do código em qualquer formato", () => {
    expect(regraDoCodigo([base], "17.19.01")?.id).toBe("r1");
    expect(regraDoCodigo([{ ...base, ativo: false }], "171901")).toBeNull();
    expect(regraDoCodigo([base], "17.19")).toBeNull();
  });
});
