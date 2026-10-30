// Relatórios em PDF no papel timbrado MDC (tabelas com quebra de página), gerados no navegador.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";

const VERDE = rgb(11 / 255, 40 / 255, 32 / 255);
const DOURADO = rgb(226 / 255, 193 / 255, 126 / 255);
const DOURADO_ESC = rgb(138 / 255, 106 / 255, 42 / 255);
const CLARO = rgb(198 / 255, 211 / 255, 204 / 255);
const FUNDO = rgb(243 / 255, 246 / 255, 244 / 255);
const BORDA = rgb(220 / 255, 227 / 255, 222 / 255);
const TEXTO = rgb(24 / 255, 33 / 255, 29 / 255);
const SUAVE = rgb(93 / 255, 102 / 255, 97 / 255);
const PERIGO = rgb(180 / 255, 35 / 255, 24 / 255);

export interface ColunaPdf {
  titulo: string;
  peso: number; // largura relativa
  direita?: boolean;
}
export interface LinhaPdf {
  celulas: string[];
  negrito?: boolean;
  fundo?: boolean;
  alerta?: boolean[];
}
export interface SecaoPdf {
  titulo: string;
  texto?: string;
  colunas: ColunaPdf[];
  linhas: LinhaPdf[];
  barras?: { rotulo: string; partes: { valor: number; cor: "verde" | "ouro" | "perigo" }[] }[];
}

const limpar = (s: string) =>
  s.replace(/[−‒]/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7E -ÿ—–…“”‘’•€]/g, "");

export async function gerarRelatorioPdf(o: {
  titulo: string;
  subtitulo: string;
  secoes: SecaoPdf[];
  logo?: Uint8Array | null;
  paisagem?: boolean;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(o.titulo);
  pdf.setAuthor("MDC Assessoria Contábil");
  pdf.setCreator("HUB-MDC");
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (o.logo) logo = await pdf.embedPng(o.logo).catch(() => pdf.embedJpg(o.logo!).catch(() => null));

  const [W, H] = o.paisagem ? [841.89, 595.28] : [595.28, 841.89];
  const M = 40, BANDA = 74, RODAPE = 80;
  let page!: PDFPage;
  let y = 0;

  const cache = new Map<PDFFont, Map<string, number>>();
  const w = (s: string, size: number, font: PDFFont) => {
    let c = cache.get(font);
    if (!c) cache.set(font, (c = new Map()));
    let t = 0;
    for (const ch of limpar(s)) {
      let x = c.get(ch);
      if (x === undefined) c.set(ch, (x = font.widthOfTextAtSize(ch, 1000)));
      t += x;
    }
    return (t * size) / 1000;
  };
  const text = (s: string, x: number, yy: number, size: number, font: PDFFont, cor = TEXTO) => page.drawText(limpar(s), { x, y: yy, size, font, color: cor });
  const cortar = (s: string, larg: number, size: number, font: PDFFont) => {
    if (w(s, size, font) <= larg) return s;
    let t = s;
    while (t.length > 2 && w(t + "…", size, font) > larg) t = t.slice(0, -1);
    return t + "…";
  };

  const novaPagina = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - BANDA, width: W, height: BANDA, color: VERDE });
    page.drawRectangle({ x: 0, y: H - BANDA - 3, width: W, height: 3, color: DOURADO });
    if (logo) {
      const alt = 42;
      page.drawImage(logo, { x: M - 4, y: H - BANDA + 16, width: (logo.width * alt) / logo.height, height: alt });
    } else text("MDC", M, H - 46, 26, b, DOURADO);
    const linhas: [string, number, PDFFont, ReturnType<typeof rgb>][] = [
      ["ASSESSORIA CONTÁBIL, TRIBUTÁRIA E GESTÃO FINANCEIRA", 8.6, b, DOURADO],
      ["MDC Assessoria Ltda  ·  CNPJ 48.140.121/0001-65", 7.6, f, CLARO],
      ["Bragança Paulista/SP  ·  (11) 98859-8041  ·  mdcassessoria.com", 7.2, f, CLARO],
    ];
    let yy = H - 27;
    for (const [t, sz, fo, cor] of linhas) {
      text(t, W - M - w(t, sz, fo), yy, sz, fo, cor);
      yy -= sz + 6;
    }
    y = H - BANDA - 26;
  };
  const garantir = (h: number) => {
    if (y - h < RODAPE) novaPagina();
  };
  const paragrafo = (s: string, size = 9, cor = SUAVE) => {
    const pal = s.split(/\s+/);
    let linha = "";
    for (const p of pal) {
      const t = linha ? linha + " " + p : p;
      if (w(t, size, f) > W - 2 * M) {
        garantir(size + 4);
        text(linha, M, y - size, size, f, cor);
        y -= size + 4;
        linha = p;
      } else linha = t;
    }
    if (linha) {
      garantir(size + 4);
      text(linha, M, y - size, size, f, cor);
      y -= size + 4;
    }
  };

  novaPagina();
  text(o.titulo, M, y - 16, 16, b, VERDE);
  page.drawRectangle({ x: M, y: y - 24, width: 40, height: 2, color: DOURADO });
  y -= 34;
  paragrafo(o.subtitulo, 9);
  y -= 6;

  for (const sec of o.secoes) {
    garantir(70);
    y -= 6;
    text(sec.titulo, M, y - 12, 12, b, VERDE);
    y -= 20;
    if (sec.texto) paragrafo(sec.texto, 8.6);

    // barras horizontais (no prazo × com atraso), quando houver
    if (sec.barras?.length) {
      const max = Math.max(1, ...sec.barras.map((x) => x.partes.reduce((a, p) => a + p.valor, 0)));
      const rot = 150, larg = W - 2 * M - rot - 40;
      for (const br of sec.barras) {
        garantir(18);
        text(cortar(br.rotulo, rot - 8, 8.5, f), M, y - 10, 8.5, f, TEXTO);
        let x = M + rot;
        for (const p of br.partes) {
          const lw = (p.valor / max) * larg;
          if (lw > 0) page.drawRectangle({ x, y: y - 12, width: lw, height: 10, color: p.cor === "verde" ? rgb(27 / 255, 130 / 255, 99 / 255) : p.cor === "ouro" ? rgb(192 / 255, 137 / 255, 42 / 255) : PERIGO });
          x += lw;
        }
        const tot = br.partes.reduce((a, p) => a + p.valor, 0);
        text(String(tot), x + 4, y - 10, 8.5, b, TEXTO);
        y -= 16;
      }
      y -= 6;
    }

    const soma = sec.colunas.reduce((a, c) => a + c.peso, 0);
    const largs = sec.colunas.map((c) => (c.peso / soma) * (W - 2 * M));
    const lh = 15;
    const cab = () => {
      garantir(lh * 2);
      page.drawRectangle({ x: M, y: y - lh, width: W - 2 * M, height: lh, color: VERDE });
      let x = M;
      sec.colunas.forEach((c, i) => {
        const t = cortar(c.titulo, largs[i] - 8, 7.8, b);
        text(t, c.direita ? x + largs[i] - 4 - w(t, 7.8, b) : x + 4, y - lh + 4.5, 7.8, b, rgb(1, 1, 1));
        x += largs[i];
      });
      y -= lh;
    };
    cab();
    sec.linhas.forEach((l, k) => {
      if (y - lh < RODAPE) {
        novaPagina();
        cab();
      }
      if (l.fundo || k % 2 === 1) page.drawRectangle({ x: M, y: y - lh, width: W - 2 * M, height: lh, color: FUNDO });
      let x = M;
      sec.colunas.forEach((c, i) => {
        const font = l.negrito ? b : f;
        const t = cortar(l.celulas[i] ?? "", largs[i] - 8, 8, font);
        text(t, c.direita ? x + largs[i] - 4 - w(t, 8, font) : x + 4, y - lh + 4.5, 8, font, l.alerta?.[i] ? PERIGO : TEXTO);
        x += largs[i];
      });
      page.drawLine({ start: { x: M, y: y - lh }, end: { x: W - M, y: y - lh }, thickness: 0.4, color: BORDA });
      y -= lh;
    });
    if (!sec.linhas.length) paragrafo("Nada no período.", 8.6);
    y -= 10;
  }

  const paginas = pdf.getPages();
  paginas.forEach((p, k) => {
    page = p;
    p.drawLine({ start: { x: M, y: 58 }, end: { x: W - M, y: 58 }, thickness: 0.8, color: DOURADO });
    text("MDC Assessoria Ltda", M, 46, 7, b, VERDE);
    text("  ·  CNPJ 48.140.121/0001-65  ·  Bragança Paulista/SP  ·  mdcassessoria.com  ·  @mdcassessoria_", M + w("MDC Assessoria Ltda", 7, b), 46, 7, f, VERDE);
    text("Responsável técnico: ", M, 35, 7, b, DOURADO_ESC);
    text("Edvaldo Ribeiro de Carvalho  ·  Contador CRC 1SP346098-O/0  ·  edvaldo@mdcassessoria.com  ·  (11) 98859-8041", M + w("Responsável técnico: ", 7, b), 35, 7, f, VERDE);
    const pg = `Página ${k + 1} de ${paginas.length}  ·  gerado em ${new Date().toLocaleString("pt-BR")}`;
    text(pg, W - M - w(pg, 6.5, f), 20, 6.5, f, SUAVE);
    p.drawRectangle({ x: 0, y: 0, width: W, height: 10, color: VERDE });
    p.drawRectangle({ x: 0, y: 10, width: W, height: 2, color: DOURADO });
  });
  return pdf.save();
}
