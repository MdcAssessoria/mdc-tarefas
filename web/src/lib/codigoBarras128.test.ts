import { describe, expect, it } from "vitest";
import { barras128C, controle128C, PADROES_128, simbolos128C } from "./codigoBarras128";

/** Lê as barras de volta (como um leitor faria): transforma as larguras em símbolos pela tabela. */
function decodificar(digitos: string): number[] {
  const { barras, modulos } = barras128C(digitos);
  // reconstrói a sequência barra/espaço a partir das posições das barras pretas
  const larguras: number[] = [];
  barras.forEach((b, i) => {
    larguras.push(b.largura);
    const prox = barras[i + 1];
    if (prox) larguras.push(prox.x - (b.x + b.largura));
  });
  expect(barras.at(-1)!.x + barras.at(-1)!.largura).toBe(modulos);
  const simbolos: number[] = [];
  let k = 0;
  while (k < larguras.length) {
    const fim = larguras.length - k === 7;
    const pedaco = larguras.slice(k, k + (fim ? 7 : 6)).join("");
    simbolos.push(PADROES_128.indexOf(pedaco as (typeof PADROES_128)[number]));
    k += fim ? 7 : 6;
  }
  return simbolos;
}

describe("CODE-128C", () => {
  it("tabela de padrões: 107 símbolos distintos de 11 módulos (o fim tem 13)", () => {
    expect(PADROES_128).toHaveLength(107);
    expect(new Set(PADROES_128).size).toBe(107);
    PADROES_128.forEach((p, i) => {
      const soma = [...p].reduce((a, c) => a + Number(c), 0);
      expect(soma, `símbolo ${i}`).toBe(i === 106 ? 13 : 11);
    });
  });

  it("exemplo clássico 123456: início C, 12, 34, 56, controle 44, fim", () => {
    // controle = (105 + 1×12 + 2×34 + 3×56) mod 103 = 353 mod 103 = 44
    expect(simbolos128C("123456")).toEqual([105, 12, 34, 56, 44, 106]);
    expect(controle128C("123456")).toBe(44);
  });

  it("chave de acesso de 44 dígitos: 22 pares + início, controle e fim; largura 11×24 + 13 módulos", () => {
    const chave = "35261011222333000181550010000012341123456780";
    const s = simbolos128C(chave);
    expect(s).toHaveLength(25);
    expect(s.slice(1, 23)).toEqual(chave.match(/\d\d/g)!.map(Number));
    const esperado = s.slice(1, 23).reduce((a, v, i) => a + v * (i + 1), 105) % 103;
    expect(s[23]).toBe(esperado);
    expect(barras128C(chave).modulos).toBe(11 * 24 + 13);
    expect(decodificar(chave)).toEqual(s);
  });

  it("par 00 vira o símbolo 0 e o código termina com a barra dupla do fim", () => {
    expect(simbolos128C("0000")).toEqual([105, 0, 0, 105 % 103, 106]);
    const { barras } = barras128C("0000");
    expect(barras.at(-1)!.largura).toBe(2);
  });

  it("recusa quantidade ímpar, vazio ou letras", () => {
    expect(() => simbolos128C("123")).toThrow(/par/);
    expect(() => simbolos128C("")).toThrow();
    expect(() => simbolos128C("12AB")).toThrow();
  });
});
