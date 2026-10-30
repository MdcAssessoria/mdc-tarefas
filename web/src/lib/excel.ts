// Exportação para Excel no padrão MDC (cabeçalho verde e dourado, rodapé com o responsável técnico).
// exceljs é carregado só quando alguém exporta.
import { baixarBytes } from "./contratoPdf";

export interface ColunaExcel {
  titulo: string;
  chave: string;
  largura?: number;
  formato?: "texto" | "numero" | "moeda" | "data" | "percentual";
}
export interface AbaExcel {
  nome: string;
  colunas: ColunaExcel[];
  linhas: Record<string, unknown>[];
  totais?: Record<string, unknown>;
}

const VERDE = "FF0B2820", OURO = "FFE2C17E", OURO_ESC = "FF8A6A2A", FUNDO = "FFF3F6F4";

export async function exportarExcel(arquivo: string, titulo: string, subtitulo: string, abas: AbaExcel[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "HUB-MDC · MDC Assessoria";
  wb.created = new Date();

  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });
    const n = aba.colunas.length;
    ws.columns = aba.colunas.map((c) => ({ key: c.chave, width: c.largura ?? 18 }));

    ws.mergeCells(1, 1, 1, n);
    const t = ws.getCell(1, 1);
    t.value = `MDC Assessoria  ·  ${titulo}`;
    t.font = { name: "Calibri", size: 14, bold: true, color: { argb: OURO } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, n);
    const st = ws.getCell(2, 1);
    st.value = subtitulo;
    st.font = { name: "Calibri", size: 10, color: { argb: "FF5D6661" } };
    st.alignment = { indent: 1 };
    ws.getRow(3).height = 4;

    const cab = ws.getRow(4);
    aba.colunas.forEach((c, i) => {
      const cel = cab.getCell(i + 1);
      cel.value = c.titulo;
      cel.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      cel.alignment = { vertical: "middle", horizontal: c.formato && c.formato !== "texto" ? "right" : "left", wrapText: true };
      cel.border = { bottom: { style: "medium", color: { argb: OURO } } };
    });
    cab.height = 22;

    const fmt = (c: ColunaExcel) =>
      c.formato === "moeda" ? '"R$" #,##0.00' : c.formato === "numero" ? "#,##0" : c.formato === "percentual" ? "0.0%" : c.formato === "data" ? "dd/mm/yyyy" : undefined;

    aba.linhas.forEach((l, k) => {
      const row = ws.addRow(
        Object.fromEntries(
          aba.colunas.map((c) => {
            const v = l[c.chave];
            if (c.formato === "data" && typeof v === "string" && v) return [c.chave, new Date(v.length === 10 ? v + "T12:00:00" : v)];
            return [c.chave, v ?? ""];
          }),
        ),
      );
      row.font = { name: "Calibri", size: 10 };
      aba.colunas.forEach((c, i) => {
        const cel = row.getCell(i + 1);
        const f = fmt(c);
        if (f) cel.numFmt = f;
        if (k % 2 === 1) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
      });
    });

    if (aba.totais) {
      const row = ws.addRow(aba.totais);
      row.font = { name: "Calibri", size: 10, bold: true };
      aba.colunas.forEach((c, i) => {
        const cel = row.getCell(i + 1);
        const f = fmt(c);
        if (f) cel.numFmt = f;
        cel.border = { top: { style: "thin", color: { argb: VERDE } } };
      });
    }
    if (aba.linhas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + aba.linhas.length, column: n } };

    ws.addRow([]);
    const r1 = ws.addRow(["MDC Assessoria Ltda · CNPJ 48.140.121/0001-65 · Bragança Paulista/SP · mdcassessoria.com"]);
    r1.font = { name: "Calibri", size: 9, color: { argb: "FF0B2820" } };
    const r2 = ws.addRow(["Responsável técnico: Edvaldo Ribeiro de Carvalho · Contador CRC 1SP346098-O/0 · edvaldo@mdcassessoria.com · (11) 98859-8041"]);
    r2.font = { name: "Calibri", size: 9, color: { argb: OURO_ESC } };
    ws.pageSetup = { orientation: n > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  const buf = await wb.xlsx.writeBuffer();
  baixarBytes(new Uint8Array(buf as ArrayBuffer), arquivo, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
