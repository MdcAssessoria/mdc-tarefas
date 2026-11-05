// Regras dos códigos de serviço (funções puras, testadas): subitem da LC 116 (ex.: 17.19), código de tributação
// nacional da NFS-e (cTribNac, 6 números = item 2 + subitem 2 + desdobramento 2; ex.: 17.19.01 → 171901) e NBS
// (9 números; ex.: 1.1302.10.00 → 113021000). A busca aceita o número (com ou sem pontos) ou parte da descrição.
import LC116 from "./lc116";

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const digitos = (t: string | null | undefined) => String(t ?? "").replace(/\D/g, "");

/** "17.19" + "01" → "17.19.01" (o desdobramento padrão é 01). */
export function codigoNacional(subitem: string, desdobro = "01"): string {
  const [item, sub] = subitem.split(".");
  return `${item.padStart(2, "0")}.${(sub ?? "").padStart(2, "0")}.${digitos(desdobro).padStart(2, "0").slice(-2)}`;
}

/** Qualquer forma ("171901", "17.19.01", "17,19,01") → "17.19.01"; null se não tiver 6 números. */
export function formatarCodigoNacional(codigo: string | null | undefined): string | null {
  const d = digitos(codigo);
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : null;
}

/** "17.19.01" → "17.19" (o subitem da LC 116, sem zero à esquerda no item: "01.07.01" → "1.07"). */
export function subitemDoCodigo(codigo: string | null | undefined): string | null {
  const d = digitos(codigo);
  if (d.length !== 6) return null;
  return `${Number(d.slice(0, 2))}.${d.slice(2, 4)}`;
}

/** Descrição do subitem da LC 116 (ou null se o subitem não existe na lista). */
export function descricaoLc116(subitem: string | null | undefined): string | null {
  return LC116.find(([c]) => c === subitem)?.[1] ?? null;
}

/** O código nacional bate com um subitem que existe na LC 116. */
export function codigoNacionalValido(codigo: string | null | undefined): boolean {
  return !!descricaoLc116(subitemDoCodigo(codigo));
}

/** Busca na LC 116 pelo número (17.19, 1719, 17.19.01) ou por palavras da descrição; até `limite` resultados. */
export function buscarLc116(consulta: string, limite = 12): [string, string][] {
  const q = normalizar(consulta);
  if (!q) return LC116.slice(0, limite);
  const num = digitos(q);
  if (num && /^[\d.\s,]+$/.test(q)) {
    const alvo = num.length >= 4 ? num.slice(0, 4) : num;
    return LC116.filter(([c]) => {
      const d = c.replace(".", "").padStart(4, "0");
      return d.startsWith(alvo.padStart(Math.min(alvo.length, 4), "0")) || c.replace(".", "").startsWith(alvo);
    }).slice(0, limite);
  }
  const palavras = q.split(/\s+/);
  return LC116.filter(([, t]) => {
    const n = normalizar(t);
    return palavras.every((p) => n.includes(p));
  }).slice(0, limite);
}

/** "1.1302.10.00" → "113021000"; null se não tiver 9 números. */
export function nbsDigitos(codigo: string | null | undefined): string | null {
  const d = digitos(codigo);
  return d.length === 9 ? d : null;
}

/** "113021000" → "1.1302.10.00". */
export function formatarNbs(codigo: string | null | undefined): string {
  const d = digitos(codigo);
  return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : String(codigo ?? "");
}
