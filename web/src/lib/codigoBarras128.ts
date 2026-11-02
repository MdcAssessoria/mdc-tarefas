// Código de barras CODE-128 conjunto C (só dígitos, de dois em dois), o mesmo do DANFE para a chave de acesso de 44
// dígitos (MOC da NF-e, anexo II). Função pura: devolve os valores dos símbolos e as larguras das barras e espaços,
// para desenhar em SVG (tela) ou em retângulos (PDF). Sem biblioteca. Testado em codigoBarras128.test.ts.

/**
 * Larguras (em módulos) de cada símbolo do CODE-128, de 0 a 106: barra, espaço, barra, espaço, barra, espaço.
 * 103 = início A, 104 = início B, 105 = início C, 106 = fim (7 elementos, com a barra final de 2 módulos).
 * Fonte: ISO/IEC 15417, tabela 1.
 */
// prettier-ignore
export const PADROES_128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

const INICIO_C = 105;
const FIM = 106;

/**
 * Valores dos símbolos do CODE-128C para uma sequência de dígitos (quantidade par): início C, um símbolo para cada
 * par de dígitos, dígito de controle (módulo 103, peso = posição) e fim.
 */
export function simbolos128C(digitos: string): number[] {
  if (!/^\d*$/.test(digitos) || digitos.length === 0 || digitos.length % 2 !== 0)
    throw new Error("O código de barras CODE-128C precisa de uma quantidade par de dígitos.");
  const dados: number[] = [];
  for (let i = 0; i < digitos.length; i += 2) dados.push(Number(digitos.slice(i, i + 2)));
  const controle = dados.reduce((soma, v, i) => soma + v * (i + 1), INICIO_C) % 103;
  return [INICIO_C, ...dados, controle, FIM];
}

/** Dígito de controle do CODE-128C (o penúltimo símbolo). */
export const controle128C = (digitos: string) => simbolos128C(digitos).at(-2)!;

export interface Barra {
  /** Início da barra, em módulos, contando a partir do começo do código (sem a margem). */
  x: number;
  /** Largura da barra em módulos (1 a 4). */
  largura: number;
}

/** Barras do código (só as pretas), em módulos, e a largura total em módulos (sem as margens de silêncio). */
export function barras128C(digitos: string): { barras: Barra[]; modulos: number } {
  const barras: Barra[] = [];
  let x = 0;
  for (const s of simbolos128C(digitos)) {
    const padrao = PADROES_128[s];
    for (let k = 0; k < padrao.length; k++) {
      const largura = Number(padrao[k]);
      if (k % 2 === 0) barras.push({ x, largura });
      x += largura;
    }
  }
  return { barras, modulos: x };
}
