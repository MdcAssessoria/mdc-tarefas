import { describe, expect, it } from "vitest";
import { lerTudo } from "./lerTudo";

/** Simula o Supabase: devolve no máximo `limiteServidor` linhas por pedido, como o "Max rows" da API. */
function fonte(total: number, limiteServidor = 1000) {
  const pedidos: [number, number][] = [];
  const montar = (de: number, ate: number) => {
    pedidos.push([de, ate]);
    const fim = Math.min(ate + 1, de + limiteServidor, total);
    const data = Array.from({ length: Math.max(0, fim - de) }, (_, k) => de + k);
    return Promise.resolve({ data, error: null });
  };
  return { montar, pedidos };
}

describe("lerTudo", () => {
  it("lê mais de 1.000 linhas juntando as páginas", async () => {
    const { montar } = fonte(2345);
    const linhas = await lerTudo<number>(montar);
    expect(linhas).toHaveLength(2345);
    expect(linhas[0]).toBe(0);
    expect(linhas.at(-1)).toBe(2344);
  });

  it("não perde linhas quando o servidor corta abaixo do tamanho pedido", async () => {
    const { montar } = fonte(1200, 500);
    expect(await lerTudo<number>(montar)).toHaveLength(1200);
  });

  it("lista vazia faz um só pedido", async () => {
    const { montar, pedidos } = fonte(0);
    expect(await lerTudo<number>(montar)).toEqual([]);
    expect(pedidos).toEqual([[0, 999]]);
  });

  it("repassa o erro traduzido", async () => {
    const montar = () => Promise.resolve({ data: null, error: { message: "permission denied for table x" } });
    await expect(lerTudo(montar)).rejects.toThrow();
  });

  it("para com aviso quando passa do máximo", async () => {
    const { montar } = fonte(5000);
    await expect(lerTudo<number>(montar, 1000, 2000)).rejects.toThrow(/passou de/);
  });
});
