// Testes do pareamento das operações entre as empresas do grupo (intragrupo.ts).
import { describe, expect, it } from "vitest";
import { parearIntragrupo } from "./intragrupo";
import type { MovIntragrupo } from "./intragrupo";

let n = 0;
const mov = (
  empresa: string,
  contraparte: string | null,
  data: string,
  valor: number,
  tipo: MovIntragrupo["tipo"] = "intra",
): MovIntragrupo => ({
  tipo,
  empresa_id: empresa,
  empresa: empresa.toUpperCase(),
  ref: `r${++n}`,
  data,
  valor,
  origem: valor < 0 ? "Conta Paga" : "Conta Recebida",
  categoria: null,
  documento: null,
  pessoa: null,
  contraparte_id: contraparte,
  contraparte: contraparte?.toUpperCase() ?? null,
});

describe("parearIntragrupo", () => {
  it("junta saída e entrada de mesmo valor até 7 dias", () => {
    const r = parearIntragrupo([mov("a", "b", "2026-10-01", -1000), mov("b", "a", "2026-10-03", 1000)]);
    expect(r.pares).toBe(1);
    expect(r.valorPareado).toBe(1000);
    expect(r.semPar).toHaveLength(0);
    expect(r.diferenca).toBe(0);
  });

  it("não junta com mais de 7 dias nem com valor diferente", () => {
    const r = parearIntragrupo([mov("a", "b", "2026-10-01", -1000), mov("b", "a", "2026-10-20", 1000), mov("b", "a", "2026-10-02", 999)]);
    expect(r.pares).toBe(0);
    expect(r.semPar).toHaveLength(3);
    expect(r.diferenca).toBe(999);
  });

  it("aceita a outra ponta com a contraparte trocada, mas conta à parte", () => {
    const r = parearIntragrupo([mov("c", "b", "2026-10-09", -400), mov("b", "a", "2026-10-09", 400)]);
    expect(r.pares).toBe(1);
    expect(r.contraparteTrocada).toBe(1);
  });

  it("cada movimento entra num par só (lançamento em dobro fica sem par)", () => {
    const r = parearIntragrupo([mov("a", "b", "2026-11-03", -1400), mov("b", "a", "2026-11-03", 1400), mov("b", "a", "2026-11-03", 1400)]);
    expect(r.pares).toBe(1);
    expect(r.semPar).toHaveLength(1);
    expect(r.diferenca).toBe(1400);
  });

  it("aponta o possível par lançado sem a empresa", () => {
    const r = parearIntragrupo([mov("a", "b", "2026-10-01", -5000), mov("b", null, "2026-10-02", 5000, "sem_doc")]);
    expect(r.semPar[0].candidato?.empresa_id).toBe("b");
  });
});
