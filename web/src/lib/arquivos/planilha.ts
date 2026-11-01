// Leitura de planilhas no navegador (SheetJS 0.20.3, carregado na primeira vez que alguém importa um arquivo).
// O arquivo fica no próprio site (public/vendor/xlsx-0.20.3.full.min.js), sem depender de CDN de terceiro.
// 0.20.3 corrige as falhas publicadas da 0.18.5 (CVE-2023-30533 e CVE-2024-22363); o npm oficial só tem a 0.18.5.
// O arquivo é idêntico ao de https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js (mesmo hash abaixo,
// conferido em 01/11/2026). O "integrity" faz o navegador recusar qualquer arquivo diferente deste.
// Para atualizar: baixe a versão nova do CDN oficial, troque o arquivo, o nome e recalcule o hash
// (openssl dgst -sha384 -binary arquivo | base64).
import { caminho } from "@/lib/caminho";

const SHEETJS = caminho("/vendor/xlsx-0.20.3.full.min.js");
const SHEETJS_INTEGRIDADE = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";

export type SheetJS = {
  read: (d: unknown, o: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (s: unknown, o: Record<string, unknown>) => unknown[][] };
  CFB: {
    read: (d: unknown, o: Record<string, unknown>) => unknown;
    find: (c: unknown, nome: string) => { content: Uint8Array } | null;
    write: (c: unknown, o: Record<string, unknown>) => Uint8Array;
  };
};

/**
 * O .xls exportado pelo Domínio grava o endereço da aba (registro BOUNDSHEET) apontando para o lugar errado,
 * e nenhum leitor encontra os dados. Aqui o endereço é corrigido para o início real da aba antes da leitura.
 */
export function corrigirXlsDominio(XLSX: SheetJS, buf: Uint8Array): Uint8Array | null {
  try {
    const cfb = XLSX.CFB.read(buf, { type: "array" });
    const ent = XLSX.CFB.find(cfb, "Workbook") || XLSX.CFB.find(cfb, "Book");
    if (!ent) return null;
    const d = ent.content;
    const bofs: number[] = [];
    const bss: number[] = [];
    let i = 0;
    while (i + 4 <= d.length) {
      const tipo = d[i] | (d[i + 1] << 8);
      const tam = d[i + 2] | (d[i + 3] << 8);
      if (tipo === 0x0809 && i + 8 <= d.length && (d[i + 6] | (d[i + 7] << 8)) === 0x0010) bofs.push(i);
      if (tipo === 0x0085) bss.push(i);
      i += 4 + tam;
    }
    if (!bss.length || bss.length !== bofs.length) return null;
    let mudou = false;
    bss.forEach((p, k) => {
      const atual = (d[p + 4] | (d[p + 5] << 8) | (d[p + 6] << 16) | (d[p + 7] << 24)) >>> 0;
      if (atual !== bofs[k]) {
        const v = bofs[k];
        d[p + 4] = v & 255;
        d[p + 5] = (v >> 8) & 255;
        d[p + 6] = (v >> 16) & 255;
        d[p + 7] = (v >>> 24) & 255;
        mudou = true;
      }
    });
    return mudou ? new Uint8Array(XLSX.CFB.write(cfb, { type: "array" })) : null;
  } catch {
    return null;
  }
}

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
  const buf = await arq.arrayBuffer();
  let wb;
  if (/\.(csv|txt)$/i.test(arq.name)) {
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      texto = new TextDecoder("windows-1252").decode(buf);
    }
    const amostra = texto.split(/\r?\n/, 5).join("");
    const sep = (amostra.match(/;/g)?.length ?? 0) >= (amostra.match(/,/g)?.length ?? 0) ? ";" : ",";
    wb = XLSX.read(texto.replace(/^\uFEFF/, ""), { type: "string", FS: sep, raw: true });
  } else {
    const bytes = new Uint8Array(buf);
    const corrigido = /\.xls$/i.test(arq.name) ? corrigirXlsDominio(XLSX, bytes.slice()) : null;
    wb = XLSX.read(corrigido ?? bytes, { type: "array", cellDates: false });
  }
  const dados: Record<string, unknown[][]> = {};
  for (const nome of wb.SheetNames)
    dados[nome] = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw, defval: "", blankrows: false }) as unknown[][];
  return { abas: wb.SheetNames, dados };
}
