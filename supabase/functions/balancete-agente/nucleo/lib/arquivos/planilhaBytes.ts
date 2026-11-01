// Cópia de web/src/lib/arquivos/planilhaBytes.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// Leitura de planilhas a partir dos bytes do arquivo (sem nada do navegador). Usada pela tela (planilha.ts, que
// carrega o SheetJS) e copiada para a função do servidor do agente da pasta do SharePoint por scripts/sync-funcoes.sh.

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

/**
 * Lê os bytes de uma planilha (.xls, .xlsx, .csv ou .txt) já com o SheetJS carregado.
 * Sem nada do navegador: a função do servidor (agente da pasta do SharePoint) usa esta mesma leitura.
 */
export function lerPlanilhaBytes(
  XLSX: SheetJS,
  nome: string,
  bytes: Uint8Array,
  raw = true,
): { abas: string[]; dados: Record<string, unknown[][]> } {
  let wb;
  if (/\.(csv|txt)$/i.test(nome)) {
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      texto = new TextDecoder("windows-1252").decode(bytes);
    }
    const amostra = texto.split(/\r?\n/, 5).join("");
    const sep = (amostra.match(/;/g)?.length ?? 0) >= (amostra.match(/,/g)?.length ?? 0) ? ";" : ",";
    wb = XLSX.read(texto.replace(/^\uFEFF/, ""), { type: "string", FS: sep, raw: true });
  } else {
    const corrigido = /\.xls$/i.test(nome) ? corrigirXlsDominio(XLSX, bytes.slice()) : null;
    wb = XLSX.read(corrigido ?? bytes, { type: "array", cellDates: false });
  }
  const dados: Record<string, unknown[][]> = {};
  for (const aba of wb.SheetNames)
    dados[aba] = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw, defval: "", blankrows: false }) as unknown[][];
  return { abas: wb.SheetNames, dados };
}
