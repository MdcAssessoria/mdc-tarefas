// Contrato em PDF no layout MDC (gerado no navegador com pdf-lib).
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { IDENTIDADE_MDC, linhaResponsavel } from "@/lib/identidade";
import { formatarDocumento, soDigitos } from "@/lib/documento";

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

/**
 * Palavras de um parágrafo. Quebra só em espaço comum, tabulação e fim de linha: o espaço não separável que o
 * `brl()` põe depois do "R$" segura o símbolo junto do valor ("R$ 3.500,00" nunca fica "R$" no fim da linha).
 */
export const palavras = (s: string) => s.split(/[ \t\n]+/).filter(Boolean);

/** Texto da marca d'água do contrato em rascunho (todas as páginas). */
export const MARCA_MINUTA = "MINUTA";

/** "MINUTA" grande, na diagonal e clara, no meio da página: não esconde o texto, mas não deixa dúvida. */
function marcaMinuta(p: PDFPage, fonte: PDFFont) {
  const tam = 110;
  const larg = fonte.widthOfTextAtSize(MARCA_MINUTA, tam);
  const ang = (35 * Math.PI) / 180;
  p.drawText(MARCA_MINUTA, {
    x: W / 2 - (larg / 2) * Math.cos(ang) + (tam / 3) * Math.sin(ang),
    y: H / 2 - (larg / 2) * Math.sin(ang) - (tam / 3) * Math.cos(ang),
    size: tam,
    font: fonte,
    color: DOURADO_ESC,
    opacity: 0.2,
    rotate: degrees(35),
  });
}

/** Começo do fecho do modelo ("E, por estarem de acordo, as partes assinam…"). */
const FECHO = /^e,?\s+por\s+estarem\b/i;
const linhaComum = (l: string) => !!l.trim() && !/^#{1,2} /.test(l) && !/^- /.test(l);

/**
 * Separa o fim do contrato que vai para a página das assinaturas: do "E, por estarem de acordo…" até o fim (local e
 * data). Se o modelo não tiver essa frase, leva pelo menos o último parágrafo (normalmente "Cidade, data.").
 * Só parágrafos comuns entram no fecho; título, cláusula ou item de lista ficam no corpo.
 */
export function separarFecho(linhas: string[]): { corpo: string[]; fecho: string[] } {
  const uteis = linhas.map((l) => l.trimEnd());
  let fim = uteis.length;
  while (fim > 0 && !uteis[fim - 1].trim()) fim--;
  let inicio = -1;
  for (let k = fim - 1; k >= 0; k--) {
    if (uteis[k].trim() && !linhaComum(uteis[k])) break;
    if (FECHO.test(uteis[k].trim())) {
      inicio = k;
      break;
    }
  }
  if (inicio < 0) inicio = fim > 0 && linhaComum(uteis[fim - 1]) ? fim - 1 : fim;
  return { corpo: uteis.slice(0, inicio), fecho: uteis.slice(inicio, fim).filter((l) => l.trim()) };
}

/** Onde começa a última cláusula ("## …") do corpo do contrato; -1 se não houver cláusula. */
export function indiceUltimaClausula(corpo: string[]): number {
  for (let k = corpo.length - 1; k >= 0; k--) if (/^## /.test(corpo[k].trim())) return k;
  return -1;
}

/**
 * Quebra um nome pela largura real em até `max` linhas; o que não couber termina em "…". Nenhuma linha passa de `larg`.
 */
export function quebrarNome(nome: string, larg: number, medir: (s: string) => number, max = 2): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras(nome)) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (medir(tentativa) <= larg || !atual) atual = tentativa;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  const cortar = (s: string, reticencias: boolean) => {
    let t = s;
    const fim = reticencias ? "…" : "";
    while (t && medir(t + fim) > larg) t = t.slice(0, -1).trimEnd();
    return t + fim;
  };
  if (linhas.length > max) {
    const resto = linhas.slice(max - 1).join(" ");
    return [...linhas.slice(0, max - 1).map((l) => cortar(l, false)), cortar(resto, true)];
  }
  // uma palavra sozinha maior que a coluna também é cortada com "…"
  return linhas.map((l) => (medir(l) > larg ? cortar(l, true) : l));
}

/** "CNPJ 11.222.333/0001-81" ou "CPF 123.456.789-01"; vazio quando não há documento. */
export function linhaDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (!d) return "";
  return `${d.length === 11 ? "CPF" : "CNPJ"} ${formatarDocumento(doc)}`;
}

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

  type Opcoes = { size?: number; x?: number; larg?: number; bold?: boolean; centro?: boolean; antes?: number; depois?: number };
  // linhas de um parágrafo justificado com trechos em **negrito**, quebradas pela largura real
  const quebrar = (s: string, o: Opcoes) => {
    const size = o.size ?? 10.2,
      larg = o.larg ?? largura;
    const pal: { t: string; bold: boolean }[] = [];
    let neg = !!o.bold;
    for (const parte of s.split("**")) {
      for (const p of palavras(parte)) pal.push({ t: p, bold: neg });
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
    return linhas;
  };
  /** Altura que o parágrafo ocupa (para levar blocos inteiros para a mesma página). */
  const alturaParagrafo = (s: string, o: Opcoes = {}) =>
    (o.antes ?? 0) + quebrar(s, o).length * (o.size ?? 10.2) * 1.5 + (o.depois ?? 6);

  const paragrafo = (s: string, o: Opcoes = {}) => {
    const size = o.size ?? 10.2,
      x = o.x ?? ME,
      larg = o.larg ?? largura,
      lh = size * 1.5;
    y -= o.antes ?? 0;
    const esp = w(" ", size, f);
    const linhas = quebrar(s, o);
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

  const { corpo, fecho } = separarFecho(d.texto.split("\n"));
  const desenhar = (bruta: string) => {
    const l = bruta.trimEnd();
    if (!l.trim()) return;
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
  };
  /** Altura aproximada de uma linha do modelo (mesmas regras de desenhar), para levar blocos juntos. */
  const alturaLinha = (bruta: string) => {
    const l = bruta.trimEnd();
    if (!l.trim()) return 0;
    if (l.startsWith("# ")) return 50;
    if (l.startsWith("## ")) return 26;
    if (/^- /.test(l)) return alturaParagrafo(l.slice(2), { larg: largura - 18, depois: 2 });
    return alturaParagrafo(l);
  };
  // DES-02: a última cláusula vai junto do fecho e das assinaturas. Se tudo couber numa página, a cláusula inteira
  // muda de página junto; se não couber, pelo menos o último parágrafo dela acompanha o fecho (nada de página só
  // com o "E, por estarem de acordo").
  const ultimaClausula = indiceUltimaClausula(corpo);
  const antes = ultimaClausula < 0 ? corpo : corpo.slice(0, ultimaClausula);
  const clausula = ultimaClausula < 0 ? [] : corpo.slice(ultimaClausula);
  novaPagina();
  for (const l of antes) desenhar(l);
  // assinaturas: nome quebrado pela largura da coluna (até 2 linhas) e CNPJ/CPF sob a linha de cada parte
  const meia = (largura - 30) / 2;
  const NOME = 9,
    SUB = 8.5,
    LH_NOME = 11,
    LH_SUB = 11,
    ACIMA = 40; // espaço para assinar acima da linha
  const parte = (rot: string, nome: string, linhasSub: string[]) => {
    const nomes = quebrarNome(nome, meia, (s) => w(s, NOME, b));
    const subs = linhasSub
      .filter(Boolean)
      .map((l) => quebrarNome(l, meia, (s) => w(s, SUB, f), 1)[0])
      .filter(Boolean);
    // rótulo a 12 pt da linha, primeiro nome a 24 pt, depois uma linha a cada 11 pt
    const altura = 24 + (nomes.length - 1) * LH_NOME + subs.length * LH_SUB + 6;
    const desenhar = (x: number) => {
      page.drawLine({ start: { x, y }, end: { x: x + meia, y }, thickness: 0.8, color: TEXTO });
      text(rot, x, y - 12, 8, b, SUAVE);
      let yy = y - 24;
      nomes.forEach((n, k) => text(n, x, yy - k * LH_NOME, NOME, b));
      yy -= (nomes.length - 1) * LH_NOME;
      for (const l of subs) text(l, x, (yy -= LH_SUB), SUB, f, SUAVE);
    };
    return { altura, desenhar };
  };
  const contratante = parte("CONTRATANTE", d.contratante.nome, [linhaDocumento(d.contratante.documento), d.contratante.representante]);
  const contratada = parte("CONTRATADA", IDENTIDADE_MDC.razaoSocial.toUpperCase(), [
    linhaDocumento(IDENTIDADE_MDC.cnpj),
    `${IDENTIDADE_MDC.responsavelTecnico.nome} · CRC ${IDENTIDADE_MDC.responsavelTecnico.crc}`,
  ]);
  const t1 = parte("TESTEMUNHA 1", "Nome:", ["CPF:"]);
  const t2 = parte("TESTEMUNHA 2", "Nome:", ["CPF:"]);
  const linhaPartes = Math.max(contratante.altura, contratada.altura);
  const linhaTestemunhas = Math.max(t1.altura, t2.altura);

  // o fecho ("E, por estarem de acordo…") e a linha de local e data vão para a mesma página das assinaturas
  const opFecho = (k: number): Opcoes => ({ antes: k === 0 ? 4 : 0 });
  const alturaFecho = fecho.reduce((a, l, k) => a + alturaParagrafo(l, opFecho(k)), 0);
  const blocoFinal = alturaFecho + ACIMA + linhaPartes + ACIMA + linhaTestemunhas;
  const alturaClausula = clausula.reduce((a, l) => a + alturaLinha(l), 0);
  const ALTURA_UTIL = H - BANDA - 34 - 84;
  if (clausula.length && alturaClausula + blocoFinal <= ALTURA_UTIL) {
    garantir(alturaClausula + blocoFinal);
    for (const l of clausula) desenhar(l);
  } else if (clausula.length) {
    const uteis = clausula.filter((l) => l.trim());
    const ultimo = uteis[uteis.length - 1];
    const k = clausula.lastIndexOf(ultimo);
    for (const l of clausula.slice(0, k)) desenhar(l);
    garantir(alturaLinha(ultimo) + blocoFinal);
    desenhar(ultimo);
  }
  garantir(blocoFinal);
  fecho.forEach((l, k) => paragrafo(l, opFecho(k)));
  y -= ACIMA;
  contratante.desenhar(ME);
  contratada.desenhar(ME + meia + 30);
  y -= linhaPartes + ACIMA;
  t1.desenhar(ME);
  t2.desenhar(ME + meia + 30);

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
    // DES-01: minuta impressa não pode passar por contrato definitivo — marca d'água em todas as páginas
    if (d.rascunho) marcaMinuta(p, b);
  });
  return pdf.save();
}
