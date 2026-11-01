// Leitura de planilhas no navegador (SheetJS 0.20.3, carregado na primeira vez que alguém importa um arquivo).
// O arquivo fica no próprio site (public/vendor/xlsx-0.20.3.full.min.js), sem depender de CDN de terceiro.
// 0.20.3 corrige as falhas publicadas da 0.18.5 (CVE-2023-30533 e CVE-2024-22363); o npm oficial só tem a 0.18.5.
// O arquivo é idêntico ao de https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js (mesmo hash abaixo,
// conferido em 01/11/2026). O "integrity" faz o navegador recusar qualquer arquivo diferente deste.
// Para atualizar: baixe a versão nova do CDN oficial, troque o arquivo, o nome e recalcule o hash
// (openssl dgst -sha384 -binary arquivo | base64).
import { caminho } from "@/lib/caminho";
import { lerPlanilhaBytes } from "./planilhaBytes";
import type { SheetJS } from "./planilhaBytes";

export { corrigirXlsDominio, lerPlanilhaBytes } from "./planilhaBytes";
export type { SheetJS } from "./planilhaBytes";

const SHEETJS = caminho("/vendor/xlsx-0.20.3.full.min.js");
const SHEETJS_INTEGRIDADE = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";

let carregando: Promise<SheetJS> | null = null;
export function carregarSheetJS(): Promise<SheetJS> {
  const w = window as unknown as { XLSX?: SheetJS };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (!carregando)
    carregando = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = SHEETJS;
      s.integrity = SHEETJS_INTEGRIDADE;
      s.crossOrigin = "anonymous";
      s.onload = () => (w.XLSX ? ok(w.XLSX) : falha(new Error("Leitor de planilhas não carregou")));
      s.onerror = () => {
        carregando = null;
        falha(new Error("Sem conexão para carregar o leitor de planilhas"));
      };
      document.head.appendChild(s);
    });
  return carregando;
}

/** Primeira aba (ou todas) como matriz. raw=true mantém números como números. */
export async function lerPlanilha(arq: File, raw = true): Promise<{ abas: string[]; dados: Record<string, unknown[][]> }> {
  const XLSX = await carregarSheetJS();
  return lerPlanilhaBytes(XLSX, arq.name, new Uint8Array(await arq.arrayBuffer()), raw);
}
