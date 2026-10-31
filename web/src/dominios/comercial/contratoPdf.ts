// Contrato em PDF no layout MDC (gerado no navegador com pdf-lib).
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { IDENTIDADE_MDC, linhaResponsavel } from "@/lib/identidade";

const VERDE = rgb(11 / 255, 40 / 255, 32 / 255);
const DOURADO = rgb(226 / 255, 193 / 255, 126 / 255);
const DOURADO_ESC = rgb(138 / 255, 106 / 255, 42 / 255);
const CLARO = rgb(198 / 255, 211 / 255, 204 / 255);
const TEXTO = rgb(28 / 255, 36 / 255, 32 / 255);
const SUAVE = rgb(93 / 255, 102 / 255, 97 / 255);
const W = 595.28,
  H = 841.89,
  ME = 62,
  MD = 56;

const limpar = (s: string) =>
  s
    .replace(/[−‒]/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E -ÿ—–…“”‘’•€]/g, "");

export interface DadosContratoPdf {
  texto: string; // markdown simples: # título, ## cláusula, - item, **negrito**
  numero: string;
  contratante: { nome: string; representante: string; documento?: string };
  logo?: Uint8Array | null; // PNG ou JPG
  rascunho?: boolean;
}

export async function gerarContratoPdf(d: DadosContratoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Contrato ${d.numero} — ${d.contratante.nome}`);
  pdf.setAuthor(IDENTIDADE_MDC.nomeComercial);
  pdf.setCreator("HUB-MDC");
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (d.logo) logo = await pdf.embedPng(d.logo).catch(() => pdf.embedJpg(d.logo!).catch(() => null));

  let page!: PDFPage;
  let y = 0;
  const largura = W - ME - MD;
  // largura caractere a caractere: o pdf-lib desconta kerning na medida, mas não o aplica ao desenhar
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
  const text = (s: string, x: number, yy: number, size: number, font: PDFFont, cor = TEXTO) =>
    page.drawText(limpar(s), { x, y: yy, size, font, color: cor });

  const marca = (x: number, yy: number, alt: number) => {
    if (logo) {
      const esc = alt / logo.height;
      page.drawImage(logo, { x, y: yy, width: logo.width * esc, height: alt });
      return;
    }
    text("MDC", x, yy + alt * 0.22, alt * 0.62, b, DOURADO);
    text("Assessoria Contábil", x + w("MDC", alt * 0.62, b) + 6, yy + alt * 0.3, alt * 0.3, f, CLARO);
  };

  // papel timbrado MDC: faixa verde com logo e dados, filete dourado; rodapé com empresa e responsável técnico
  const BANDA = 80;
  const novaPagina = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - BANDA, width: W, height: BANDA, color: VERDE });
    page.drawRectangle({ x: 0, y: H - BANDA - 3.4, width: W, height: 3.4, color: DOURADO });
    marca(ME - 10, H - BANDA + 16, 46);
    const linhasCab: [string, number, PDFFont, ReturnType<typeof rgb>][] = [
      ["ASSESSORIA CONTÁBIL, TRIBUTÁRIA E GESTÃO FINANCEIRA", 9.2, b, DOURADO],
      [`${IDENTIDADE_MDC.razaoSocial}  ·  CNPJ ${IDENTIDADE_MDC.cnpj}`, 8, f, CLARO],
      [`${IDENTIDADE_MDC.cidadeUf}  ·  ${IDENTIDADE_MDC.telefone}  ·  ${IDENTIDADE_MDC.site}`, 7.4, f, CLARO],
    ];
    let yy = H - 30;
    for (const [t, sz, fo, cor] of linhasCab) {
      text(t, W - MD - w(t, sz, fo), yy, sz, fo, cor);
      yy -= sz + 6;
    }
    const num = `Contrato nº ${d.numero}${d.rascunho ? "  ·  MINUTA PARA CONFERÊNCIA" : ""}`;
    text(num, W - MD - w(num, 7.5, d.rascunho ? b : f), H - BANDA - 16, 7.5, d.rascunho ? b : f, d.rascunho ? DOURADO_ESC : SUAVE);
    y = H - BANDA - 34;
  };
  const garantir = (h: number) => {
    if (y - h < 84) novaPagina();
  };

  // parágrafo justificado com trechos em **negrito**
  const paragrafo = (
    s: string,
    o: { size?: number; x?: number; larg?: number; bold?: boolean; centro?: boolean; antes?: number; depois?: number } = {},
  ) => {
    const size = o.size ?? 10.2,
      x = o.x ?? ME,
      larg = o.larg ?? largura,
      lh = size * 1.5;
    y -= o.antes ?? 0;
    const pal: { t: string; bold: boolean }[] = [];
    let neg = !!o.bold;
    for (const parte of s.split("**")) {
      for (const p of parte.split(/\s+/).filter(Boolean)) pal.push({ t: p, bold: neg });
      neg = !neg;
    }
    const linhas: { t: string; bold: boolean }[][] = [];
    let atual: typeof pal = [];
    let lw = 0;
    const esp = w(" ", size, f);
    for (const p of pal) {
      const pw = w(p.t, size, p.bold ? b : f);
      if (atual.length && lw + esp + pw > larg) {
        linhas.push(atual);
        atual = [];
        lw = 0;
      }
      lw += (atual.length ? esp : 0) + pw;
      atual.push(p);
    }
    if (atual.length) linhas.push(atual);
    linhas.forEach((ln, k) => {
      garantir(lh);
      const tam = ln.reduce((a, p) => a + w(p.t, size, p.bold ? b : f), 0);
      const ultima = k === linhas.length - 1;
      const gap = !ultima && !o.centro && ln.length > 1 ? (larg - tam) / (ln.length - 1) : esp;
      let cx = o.centro ? x + (larg - (tam + esp * (ln.length - 1))) / 2 : x;
      for (const p of ln) {
        text(p.t, cx, y - size, size, p.bold ? b : f);
        cx += w(p.t, size, p.bold ? b : f) + gap;
      }
      y -= lh;
    });
    y -= o.depois ?? 6;
  };

  novaPagina();
  for (const bruta of d.texto.split("\n")) {
    const l = bruta.trimEnd();
    if (!l.trim()) continue;
    if (l.startsWith("# ")) {
      garantir(50);
      paragrafo(l.slice(2).toUpperCase(), { size: 13, bold: true, centro: true, depois: 2 });
      page.drawRectangle({ x: W / 2 - 22, y: y + 2, width: 44, height: 2, color: DOURADO });
      y -= 12;
    } else if (l.startsWith("## ")) {
      garantir(40);
      y -= 6;
      text(l.slice(3), ME, y - 11, 10.8, b, VERDE);
      y -= 20;
    } else if (/^- /.test(l)) {
      garantir(16);
      text("•", ME + 6, y - 10.2, 10.2, b, DOURADO_ESC);
      paragrafo(l.slice(2), { x: ME + 18, larg: largura - 18, depois: 2 });
    } else paragrafo(l);
  }

  // assinaturas
  const assinatura = (rot: string, nome: string, sub: string, x: number, larg: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + larg, y }, thickness: 0.8, color: TEXTO });
    text(rot, x, y - 12, 8, b, SUAVE);
    text(nome, x, y - 24, 9, b);
    if (sub) text(sub, x, y - 35, 8.5, f, SUAVE);
  };
  garantir(210);
  y -= 46;
  const meia = (largura - 30) / 2;
  assinatura("CONTRATANTE", d.contratante.nome.slice(0, 48), d.contratante.representante, ME, meia);
  assinatura(
    "CONTRATADA",
    IDENTIDADE_MDC.razaoSocial.toUpperCase(),
    `${IDENTIDADE_MDC.responsavelTecnico.nome} · CRC ${IDENTIDADE_MDC.responsavelTecnico.crc}`,
    ME + meia + 30,
    meia,
  );
  y -= 82;
  assinatura("TESTEMUNHA 1", "Nome:", "CPF:", ME, meia);
  assinatura("TESTEMUNHA 2", "Nome:", "CPF:", ME + meia + 30, meia);

  const paginas = pdf.getPages();
  paginas.forEach((p, k) => {
    page = p;
    p.drawLine({ start: { x: ME, y: 62 }, end: { x: W - MD, y: 62 }, thickness: 0.8, color: DOURADO });
    text(IDENTIDADE_MDC.razaoSocial, ME, 50, 7.2, b, VERDE);
    text(
      `  ·  CNPJ ${IDENTIDADE_MDC.cnpj}  ·  ${IDENTIDADE_MDC.cidadeUf}  ·  ${IDENTIDADE_MDC.site}  ·  ${IDENTIDADE_MDC.instagram}`,
      ME + w(IDENTIDADE_MDC.razaoSocial, 7.2, b),
      50,
      7.2,
      f,
      VERDE,
    );
    text("Responsável técnico: ", ME, 39, 7.2, b, DOURADO_ESC);
    text(linhaResponsavel("  ·  "), ME + w("Responsável técnico: ", 7.2, b), 39, 7.2, f, VERDE);
    const pg = `Página ${k + 1} de ${paginas.length}`;
    text(pg, W - MD - w(pg, 7.2, f), 50, 7.2, f, SUAVE);
    if (k < paginas.length - 1) {
      const rub = "Rubricas: ________  ________";
      text(rub, W - MD - w(rub, 7.2, f), 72, 7.2, f, SUAVE);
    }
    p.drawRectangle({ x: 0, y: 0, width: W, height: 14, color: VERDE });
    p.drawRectangle({ x: 0, y: 14, width: W, height: 2, color: DOURADO });
  });
  return pdf.save();
}
