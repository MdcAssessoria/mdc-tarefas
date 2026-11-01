import { describe, expect, it } from "vitest";
import { situacaoPdf } from "./pdfPeriodo";

const tri = ["2026-01", "2026-02", "2026-03"];

describe("situacaoPdf", () => {
  it("todos os meses publicados: completo (sai assinado)", () => {
    expect(situacaoPdf(tri, ["2026-01", "2026-02", "2026-03"])).toEqual({ tipo: "completo" });
  });

  it("mês faltando no meio: lacuna (não gera, os números não fechariam)", () => {
    expect(situacaoPdf(tri, ["2026-01", "2026-03"])).toEqual({ tipo: "lacuna", faltam: ["2026-02"] });
  });

  it("faltam os primeiros meses (ex.: ano com só dezembro publicado): lacuna", () => {
    const ano = Array.from({ length: 12 }, (_, k) => `2025-${String(k + 1).padStart(2, "0")}`);
    const r = situacaoPdf(ano, ["2025-12"]);
    expect(r.tipo).toBe("lacuna");
    expect(r.tipo === "lacuna" && r.faltam).toHaveLength(11);
  });

  it("período em andamento (faltam só os últimos): parcial, sem assinatura", () => {
    expect(situacaoPdf(tri, ["2026-01", "2026-02"])).toEqual({ tipo: "parcial", ate: "2026-02", faltam: ["2026-03"] });
  });

  it("nada publicado: lacuna com todos os meses", () => {
    expect(situacaoPdf(tri, [])).toEqual({ tipo: "lacuna", faltam: tri });
  });
});
