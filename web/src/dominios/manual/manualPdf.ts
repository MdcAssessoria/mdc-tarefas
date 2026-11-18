// PDF do Manual do HUB-MDC (inteiro ou de uma área), gerado no navegador com pdf-lib: capa com sumário e número das
// páginas, uma área por página nova, telas com imagem, listas e tabelas, e rodapé com versão e página.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { partesDoTexto, type AreaManual, type Bloco } from "./manual";

const MARCA = rgb(11 / 255, 40 / 255, 32 / 255);
const VERMELHO = rgb(226 / 255, 193 / 255, 126 / 255); // dourado da MDC
const TEXTO = rgb(24 / 255, 33 / 255, 29 / 255);
const SUAVE = rgb(93 / 255, 102 / 255, 97 / 255);
const BORDA = rgb(220 / 255, 227 / 255, 222 / 255);
const FUNDO = rgb(238 / 255, 242 / 255, 239 / 255);
const BRANCO = rgb(1, 1, 1);

/** Troca o que a fonte padrão do PDF não desenha (setas) e tira o resto. */
export const textoPdf = (s: string) =>
  s
    .replace(/→/g, "›")
    .replace(/←/g, "‹")
    .replace(/[−‒]/g, "-")
    .replace(/[^\x20-\x7E -ÿ—–…“”‘’•›‹€]/g, "");

export interface OpcoesManualPdf {
  areas: AreaManual[];
  titulo: string;
  subtitulo: string;
  rodape: string;
  /** logo em PNG (versão clara, para a faixa verde) */
  logo?: Uint8Array | null;
  /** JPEG de cada imagem do manual (null = pula a imagem) */
  imagem?: (src: string) => Promise<Uint8Array | null>;
  aoAvancar?: (feito: number, total: number) => void;
}

export async function gerarManualPdf(o: OpcoesManualPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(o.titulo);
  pdf.setAuthor("MDC Assessoria Contábil");
  pdf.setCreator("HUB-MDC");
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (o.logo) logo = await pdf.embedPng(o.logo).catch(() => null);

  const W = 595.28,
    H = 841.89,
    M = 48,
    TOPO = 46,
    BASE = 52,
    LARG = W - 2 * M;
  let page!: PDFPage;
  let y = 0;
  let areaAtual = "";

  const w = (s: string, size: number, font: PDFFont) => font.widthOfTextAtSize(textoPdf(s), size);
  const escrever = (s: string, x: number, yy: number, size: number, font: PDFFont, cor = TEXTO) =>
    page.drawText(textoPdf(s), { x, y: yy, size, font, color: cor });

  const novaPagina = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: MARCA });
    page.drawRectangle({ x: 0, y: H - 28, width: W, height: 2, color: VERMELHO });
    escrever(o.titulo, M, H - 17, 8.5, b, BRANCO);
    if (areaAtual) escrever(areaAtual, W - M - w(areaAtual, 8.5, f), H - 17, 8.5, f, BRANCO);
    y = H - TOPO - 14;
  };
  const garantir = (h: number) => {
    if (y - h < BASE) novaPagina();
  };

  /** Escreve um texto com **negrito**, quebrando linhas; devolve a altura usada. */
  const texto = (s: string, x: number, larg: number, size: number, cor = TEXTO, desenhar = true, fonteBase = f) => {
    const palavras: { t: string; font: PDFFont }[] = [];
    for (const p of partesDoTexto(s)) {
      const font = p.negrito ? b : fonteBase;
      p.texto.split(/(\s+)/).forEach((t) => t && palavras.push({ t: /\s/.test(t) ? " " : t, font }));
    }
    const lh = size * 1.38;
    const linhas: { t: string; font: PDFFont }[][] = [[]];
    let largAtual = 0;
    for (const p of palavras) {
      const lp = w(p.t, size, p.font);
      if (p.t !== " " && largAtual + lp > larg && linhas[linhas.length - 1].length) {
        linhas.push([]);
        largAtual = 0;
      }
      if (p.t === " " && !linhas[linhas.length - 1].length) continue;
      linhas[linhas.length - 1].push(p);
      largAtual += lp;
    }
    if (desenhar)
      for (const linha of linhas) {
        garantir(lh);
        let xx = x;
        for (const p of linha) {
          if (p.t !== " ") escrever(p.t, xx, y - size, size, p.font, cor);
          xx += w(p.t, size, p.font);
        }
        y -= lh;
      }
    return linhas.length * lh;
  };

  const tabela = (cab: string[], linhas: string[][]) => {
    const n = cab.length;
    const pesos = cab.map((_, i) => Math.max(8, Math.min(60, ...[cab, ...linhas].map((l) => (l[i] ?? "").length))));
    const soma = pesos.reduce((a, p) => a + p, 0);
    const larg = pesos.map((p) => (p / soma) * LARG);
    const size = 8.4,
      pad = 5;
    const alturaLinha = (l: string[], negrito: boolean) =>
      Math.max(...l.map((c, i) => texto(negrito ? `**${c}**` : c, 0, larg[i] - 2 * pad, size, TEXTO, false))) + 2 * pad - 2;
    const desenharLinha = (l: string[], cabecalho: boolean, zebra: boolean) => {
      const h = alturaLinha(l, cabecalho);
      garantir(h);
      if (cabecalho || zebra) page.drawRectangle({ x: M, y: y - h, width: LARG, height: h, color: cabecalho ? MARCA : FUNDO });
      const topo = y;
      let x = M;
      for (let i = 0; i < n; i++) {
        y = topo - pad + 2;
        texto(cabecalho ? `**${l[i] ?? ""}**` : (l[i] ?? ""), x + pad, larg[i] - 2 * pad, size, cabecalho ? BRANCO : TEXTO);
        x += larg[i];
      }
      y = topo - h;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: BORDA });
    };
    garantir(60);
    desenharLinha(cab, true, false);
    linhas.forEach((l, k) => {
      if (y - alturaLinha(l, false) < BASE) {
        novaPagina();
        desenharLinha(cab, true, false);
      }
      desenharLinha(l, false, k % 2 === 1);
    });
    y -= 8;
  };

  const blocos = async (lista: Bloco[]) => {
    for (const bl of lista) {
      if (bl.tipo === "paragrafo") {
        // rótulo ("Atenção:", "Passo a passo:") não fica sozinho no pé da página
        if (bl.texto.trim().endsWith(":")) garantir(70);
        texto(bl.texto, M, LARG, 9.6);
        y -= 5;
      } else if (bl.tipo === "lista") {
        bl.itens.forEach((it, k) => {
          const marca = bl.ordenada ? `${bl.inicio + k}.` : "•";
          garantir(14);
          escrever(marca, M + 4, y - 9.6, 9.6, bl.ordenada ? b : f, MARCA);
          texto(it, M + 20, LARG - 20, 9.6);
          y -= 2;
        });
        y -= 5;
      } else if (bl.tipo === "tabela") {
        tabela(bl.cabecalho, bl.linhas);
      } else if (bl.tipo === "imagem" && o.imagem) {
        const bytes = await o.imagem(bl.src).catch(() => null);
        const img = bytes ? await pdf.embedJpg(bytes).catch(() => null) : null;
        if (!img) continue;
        let larg = LARG,
          alt = (img.height * larg) / img.width;
        const maxAlt = 330;
        if (alt > maxAlt) {
          alt = maxAlt;
          larg = (img.width * alt) / img.height;
        }
        garantir(alt + 12);
        page.drawRectangle({ x: M + (LARG - larg) / 2 - 1, y: y - alt - 1, width: larg + 2, height: alt + 2, color: BORDA });
        page.drawImage(img, { x: M + (LARG - larg) / 2, y: y - alt, width: larg, height: alt });
        y -= alt + 12;
      }
    }
  };

  // capa com sumário (o número das páginas é escrito no fim)
  page = pdf.addPage([W, H]);
  const capa = page;
  page.drawRectangle({ x: 0, y: H - 230, width: W, height: 230, color: MARCA });
  page.drawRectangle({ x: 0, y: H - 234, width: W, height: 4, color: VERMELHO });
  if (logo) {
    const alt = 56;
    page.drawImage(logo, { x: M, y: H - 100, width: (logo.width * alt) / logo.height, height: alt });
  } else escrever("MDC Assessoria", M, H - 90, 30, b, BRANCO);
  escrever(o.titulo, M, H - 160, 28, b, BRANCO);
  y = H - 176;
  texto(o.subtitulo, M, LARG, 11, BRANCO);
  y = H - 270;
  escrever("Sumário", M, y, 15, b, MARCA);
  page.drawRectangle({ x: M, y: y - 8, width: 36, height: 2, color: VERMELHO });
  y -= 30;
  const linhasSumario: { area: AreaManual; y: number }[] = [];
  for (const a of o.areas) {
    linhasSumario.push({ area: a, y });
    y -= 20;
  }

  const inicioDaArea = new Map<string, number>();
  let feito = 0;
  const total = o.areas.reduce((s, a) => s + 1 + a.telas.length, 0);
  for (const a of o.areas) {
    areaAtual = a.titulo;
    novaPagina();
    inicioDaArea.set(a.id, pdf.getPageCount());
    escrever(a.titulo, M, y - 20, 20, b, MARCA);
    page.drawRectangle({ x: M, y: y - 30, width: 44, height: 2.5, color: VERMELHO });
    y -= 46;
    await blocos(a.blocos);
    o.aoAvancar?.(++feito, total);
    for (const t of a.telas) {
      // o título da tela não fica sozinho no pé da página (a imagem vem logo abaixo dele)
      garantir(t.blocos[0]?.tipo === "imagem" && o.imagem ? 370 : 140);
      y -= 6;
      texto(`**${t.titulo}**`, M, LARG, 13, MARCA, true, b);
      y -= 4;
      await blocos(t.blocos);
      o.aoAvancar?.(++feito, total);
    }
  }

  // sumário com páginas e rodapé de todas as páginas
  const paginas = pdf.getPages();
  for (const s of linhasSumario) {
    const num = String(inicioDaArea.get(s.area.id) ?? "");
    capa.drawText(textoPdf(s.area.titulo), { x: M, y: s.y, size: 11, font: f, color: TEXTO });
    capa.drawText(num, { x: W - M - b.widthOfTextAtSize(num, 11), y: s.y, size: 11, font: b, color: MARCA });
    capa.drawLine({ start: { x: M, y: s.y - 6 }, end: { x: W - M, y: s.y - 6 }, thickness: 0.4, color: BORDA });
  }
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: BORDA });
    p.drawText(textoPdf(o.rodape), { x: M, y: 22, size: 7.8, font: f, color: SUAVE });
    const n = `${i + 1} de ${paginas.length}`;
    p.drawText(n, { x: W - M - f.widthOfTextAtSize(n, 7.8), y: 22, size: 7.8, font: f, color: SUAVE });
  });
  return pdf.save();
}

/** Converte uma imagem do manual (webp) em JPEG menor, no navegador, para entrar no PDF. */
export async function imagemDoManualEmJpg(src: string, larguraMax = 1100): Promise<Uint8Array | null> {
  const resp = await fetch(src);
  if (!resp.ok) return null;
  const bmp = await createImageBitmap(await resp.blob());
  const escala = Math.min(1, larguraMax / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
