// PDF do espelho da nota (DANFE / DANFSe / DACTE / genérico), A4 retrato, gerado no navegador com pdf-lib (a mesma
// biblioteca dos relatórios e contratos). Desenha o mesmo Espelho da janela (espelho.ts): cabeçalho com emitente,
// sigla e chave (com o código de barras CODE-128C quando for NF-e/CT-e), quadros de campos, tabela de itens com quebra
// de página (o cabeçalho e os títulos das colunas se repetem em cada folha) e a faixa "Espelho gerado pelo HUB-MDC".
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { RGB } from "pdf-lib";
import { barras128C } from "@/lib/codigoBarras128";
import { FAIXA_ESPELHO } from "./espelho";
import type { BlocoEspelho, CampoEspelho, ColunaEspelho, Espelho } from "./espelho";

const W = 595.28;
const H = 841.89;
const M = 22; // margem
const CW = W - 2 * M;
const RODAPE = 24;

const PRETO = rgb(0.1, 0.1, 0.1);
const LINHA = rgb(0.35, 0.35, 0.35);
const LINHA_CLARA = rgb(0.8, 0.8, 0.8);
const ROTULO = rgb(0.38, 0.38, 0.38);
const FUNDO_CAB = rgb(0.93, 0.93, 0.93);
const DOURADO_FUNDO = rgb(250 / 255, 243 / 255, 225 / 255);
const DOURADO = rgb(192 / 255, 137 / 255, 42 / 255);
const DOURADO_ESC = rgb(138 / 255, 106 / 255, 42 / 255);
const VERMELHO = rgb(180 / 255, 35 / 255, 24 / 255);

/** Só caracteres que a Helvetica padrão (WinAnsi) desenha; o resto vira o equivalente simples. */
const limpar = (s: string) =>
  s
    .replace(/[  \t]/g, " ")
    .replace(/[−‒]/g, "-")
    .replace(/›/g, ">")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E¡-ÿ—–…“”‘’•€]/g, "");

interface Fontes {
  f: PDFFont;
  b: PDFFont;
}

export async function gerarEspelhoPdf(
  e: Espelho,
  opcoes: { geradoEm?: Date; /** Logo de quem emitiu (nota de saída da MDC, 10/11/2026): PNG ou JPG. */ logo?: Uint8Array | null } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(e.titulo);
  pdf.setSubject(FAIXA_ESPELHO);
  pdf.setAuthor("HUB-MDC");
  pdf.setCreator("HUB-MDC");
  const fontes: Fontes = { f: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const { f, b } = fontes;
  const logoImg: PDFImage | null = opcoes.logo
    ? await pdf.embedPng(opcoes.logo).catch(() => pdf.embedJpg(opcoes.logo!).catch(() => null))
    : null;

  // largura caractere a caractere (o pdf-lib mede com kerning, mas não o aplica ao desenhar)
  const cache = new Map<PDFFont, Map<string, number>>();
  const larg = (s: string, size: number, font: PDFFont) => {
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
  /** Quebra o texto em linhas que cabem na largura (respeita \n; palavra comprida é cortada). */
  const quebrar = (texto: string, largura: number, size: number, font: PDFFont): string[] => {
    const saida: string[] = [];
    for (const par of texto.replace(/\r/g, "").split("\n").map(limpar)) {
      let atual = "";
      for (let palavra of par.split(/ +/)) {
        while (larg(palavra, size, font) > largura) {
          // corta a palavra comprida (e-mail, chave, endereço sem espaço)
          let k = palavra.length;
          while (k > 1 && larg((atual ? atual + " " : "") + palavra.slice(0, k), size, font) > largura) k--;
          if (k <= 1 && atual) {
            saida.push(atual);
            atual = "";
            continue;
          }
          saida.push((atual ? atual + " " : "") + palavra.slice(0, k));
          atual = "";
          palavra = palavra.slice(k);
        }
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (atual && larg(tentativa, size, font) > largura) {
          saida.push(atual);
          atual = palavra;
        } else atual = tentativa;
      }
      saida.push(atual);
    }
    return saida;
  };

  let page!: PDFPage;
  let y = 0;
  const folhas: { page: PDFPage; x: number; y: number }[] = [];

  const texto = (s: string, x: number, yy: number, size: number, font: PDFFont = f, color: RGB = PRETO) =>
    page.drawText(limpar(s), { x, y: yy, size, font, color });
  const caixa = (x: number, yy: number, w: number, h: number, o: { fundo?: RGB; borda?: RGB; espessura?: number } = {}) =>
    page.drawRectangle({
      x,
      y: yy,
      width: w,
      height: h,
      color: o.fundo,
      borderColor: o.borda ?? LINHA,
      borderWidth: o.espessura ?? 0.6,
    });

  // ------------------------------------------------------------------ cabeçalho (repetido em cada folha)
  const cabecalho = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
    // faixa do HUB
    caixa(M, y - 14, CW, 14, { fundo: DOURADO_FUNDO, borda: DOURADO, espessura: 0.6 });
    const fx = FAIXA_ESPELHO.toUpperCase();
    texto(fx, M + (CW - larg(fx, 6.6, b)) / 2, y - 9.6, 6.6, b, DOURADO_ESC);
    y -= 18;

    const wE = CW * 0.4;
    const wM = CW * 0.19;
    const wD = CW - wE - wM;
    const xM = M + wE;
    const xD = xM + wM;
    const pad = 6;

    // logo do emitente (quando veio): à esquerda, no alto do quadro; o texto vai para o lado
    const lw = logoImg ? Math.min(wE * 0.3, (logoImg.width * 34) / logoImg.height) : 0;
    const lh = logoImg ? (lw * logoImg.height) / logoImg.width : 0;
    const xT = M + pad + (lw ? lw + 6 : 0);
    const wT = wE - 2 * pad - (lw ? lw + 6 : 0);
    const nomeL = quebrar(e.emitente.nome, wT, 9.5, b).slice(0, 3);
    const linhasE = e.emitente.linhas.flatMap((l) => quebrar(l, wT, 7, f));
    const altE = Math.max(10 + nomeL.length * 11.5 + 3 + linhasE.length * 8.8 + 6, lh + 22);

    const sigla = e.sigla;
    const tamSigla = larg(sigla, 15, b) > wM - 2 * pad ? 11 : 15;
    const descL = quebrar(e.descricao, wM - 2 * pad, 5.8, f);
    const idL = e.identificacao.flatMap((c) => quebrar(`${c.rotulo}: ${c.valor || "—"}`, wM - 2 * pad, 6.8, f));
    const altM = 8 + tamSigla + 4 + descL.length * 7 + 4 + idL.length * 8.6 + 12 + 6;

    const consultaL = e.consulta ? quebrar(e.consulta, wD - 2 * pad, 5.8, f) : [];
    const altBarras = e.codigoBarras && e.chave ? 36 : 0;
    const tamChave = e.chaveFormatada ? Math.min(8, (8 * (wD - 2 * pad - 2)) / larg(e.chaveFormatada, 8, b)) : 8;
    const chaveL = e.chaveFormatada ? quebrar(e.chaveFormatada, wD - 2 * pad, tamChave, b) : [];
    const altD = 6 + (altBarras ? altBarras + 6 : 0) + (chaveL.length ? 8 + chaveL.length * 10 : 0) + consultaL.length * 7 + 8;

    const alt = Math.max(96, altE, altM, altD);
    const topo = y;
    caixa(M, topo - alt, wE, alt);
    caixa(xM, topo - alt, wM, alt);
    caixa(xD, topo - alt, wD, alt);

    // emitente
    let yy = topo - 10 - 9.5;
    texto((e.emitente.rotulo ?? "Identificação do emitente").toUpperCase(), M + pad, topo - 8, 5.2, f, ROTULO);
    if (logoImg) page.drawImage(logoImg, { x: M + pad, y: topo - 13 - lh, width: lw, height: lh });
    yy = topo - 12 - 9;
    for (const l of nomeL) {
      texto(l, xT, yy, 9.5, b);
      yy -= 11.5;
    }
    yy -= 2;
    for (const l of linhasE) {
      texto(l, xT, yy, 7);
      yy -= 8.8;
    }

    // sigla e identificação
    yy = topo - 8 - tamSigla;
    texto(sigla, xM + (wM - larg(sigla, tamSigla, b)) / 2, yy, tamSigla, b);
    yy -= 4;
    for (const l of descL) {
      yy -= 7;
      texto(l, xM + (wM - larg(l, 5.8, f)) / 2, yy, 5.8);
    }
    yy -= 5;
    for (const l of idL) {
      yy -= 8.6;
      const [rot, ...resto] = l.split(": ");
      const val = resto.join(": ");
      if (val) {
        texto(`${rot}:`, xM + pad, yy, 6.8, f, ROTULO);
        texto(val, xM + pad + larg(`${rot}: `, 6.8, f), yy, 6.8, b);
      } else texto(l, xM + pad, yy, 6.8, l.endsWith(":") ? f : b, l.endsWith(":") ? ROTULO : PRETO);
    }
    folhas.push({ page, x: xM + pad, y: Math.max(yy - 11, topo - alt + 6) });

    // chave, código de barras e consulta
    yy = topo - 6;
    if (altBarras && e.chave) {
      const { barras, modulos } = barras128C(e.chave);
      const larguraCodigo = wD - 2 * pad - 8;
      const modulo = larguraCodigo / modulos;
      const x0 = xD + pad + 4;
      for (const bar of barras)
        page.drawRectangle({
          x: x0 + bar.x * modulo,
          y: yy - altBarras,
          width: bar.largura * modulo,
          height: altBarras,
          color: rgb(0, 0, 0),
        });
      yy -= altBarras + 6;
    }
    if (chaveL.length) {
      texto("CHAVE DE ACESSO", xD + pad, yy - 5, 5.2, f, ROTULO);
      yy -= 8;
      for (const l of chaveL) {
        yy -= 10;
        texto(l, xD + (wD - larg(l, tamChave, b)) / 2, yy + 2, tamChave, b);
      }
    }
    for (const l of consultaL) {
      yy -= 7;
      texto(l, xD + (wD - larg(l, 5.8, f)) / 2, yy, 5.8, f, ROTULO);
    }
    y = topo - alt - 4;

    if (e.aviso) {
      caixa(M, y - 16, CW, 16, { fundo: rgb(1, 0.95, 0.95), borda: VERMELHO, espessura: 1 });
      texto(e.aviso, M + (CW - larg(e.aviso, 9, b)) / 2, y - 11.5, 9, b, VERMELHO);
      y -= 20;
    }
  };

  const espacoLivre = () => y - (M + RODAPE);
  const garantir = (h: number) => {
    if (espacoLivre() < h) cabecalho();
  };
  const tituloBloco = (t: string) => {
    texto(t.toUpperCase(), M + 1, y - 7, 6.2, b);
    y -= 10;
  };

  // ------------------------------------------------------------------ quadro de campos
  const medirLinha = (linha: CampoEspelho[]) => {
    const total = linha.reduce((a, c) => a + (c.peso ?? 1), 0);
    const cel = linha.map((c) => {
      const w = (CW * (c.peso ?? 1)) / total;
      const rot = quebrar(c.rotulo.toUpperCase(), w - 6, 5, f).slice(0, 2);
      const val = quebrar(c.valor || " ", w - 6, 7.6, c.destaque ? b : f);
      return { c, w, rot, val };
    });
    const h = Math.max(...cel.map(({ rot, val }) => 4 + rot.length * 6 + 2 + val.length * 9 + 2), 21);
    return { cel, h };
  };
  const desenharCampos = (bl: Extract<BlocoEspelho, { tipo: "campos" }>) => {
    const medidas = bl.linhas.filter((l) => l.length).map(medirLinha);
    if (!medidas.length) return;
    garantir(10 + medidas[0].h + 2);
    tituloBloco(bl.titulo);
    for (const { cel, h } of medidas) {
      if (espacoLivre() < h) {
        cabecalho();
        tituloBloco(`${bl.titulo} (continuação)`);
      }
      let x = M;
      for (const { c, w, rot, val } of cel) {
        caixa(x, y - h, w, h);
        let yy = y - 2;
        for (const r of rot) {
          yy -= 6;
          texto(r, x + 3, yy + 1, 5, f, ROTULO);
        }
        yy -= 2;
        for (const v of val) {
          yy -= 9;
          const size = 7.6;
          const font = c.destaque ? b : f;
          texto(v, c.direita ? x + w - 3 - larg(v, size, font) : x + 3, yy + 1.5, size, font);
        }
        x += w;
      }
      y -= h;
    }
    y -= 5;
  };

  // ------------------------------------------------------------------ tabela (itens), com quebra de página
  const desenharTabela = (bl: Extract<BlocoEspelho, { tipo: "tabela" }>) => {
    const total = bl.colunas.reduce((a, c) => a + c.peso, 0);
    const larguras = bl.colunas.map((c) => (CW * c.peso) / total);
    const muitas = bl.colunas.length > 8;
    const tamCab = muitas ? 5 : 6;
    const tam = muitas ? 6.3 : 7.2;
    const lh = tam + 2.2;
    const cab = bl.colunas.map((c, i) => quebrar(c.titulo.toUpperCase(), larguras[i] - 4, tamCab, b));
    const hCab = Math.max(...cab.map((l) => l.length)) * (tamCab + 1.5) + 5;
    const cabecalhoTabela = (col: ColunaEspelho[]) => {
      let x = M;
      caixa(M, y - hCab, CW, hCab, { fundo: FUNDO_CAB });
      col.forEach((c, i) => {
        let yy = y - 2;
        for (const l of cab[i]) {
          yy -= tamCab + 1.5;
          texto(l, c.direita ? x + larguras[i] - 2 - larg(l, tamCab, b) : x + 2, yy, tamCab, b, ROTULO);
        }
        if (i) page.drawLine({ start: { x, y }, end: { x, y: y - hCab }, thickness: 0.4, color: LINHA_CLARA });
        x += larguras[i];
      });
      y -= hCab;
    };
    const linhas = bl.linhas.map((l) => {
      const cel = l.map((v, i) => quebrar(v ?? "", larguras[i] - 4, tam, f));
      return { cel, h: Math.max(...cel.map((c) => c.length)) * lh + 3 };
    });
    garantir(10 + hCab + (linhas[0]?.h ?? 12));
    tituloBloco(bl.titulo);
    cabecalhoTabela(bl.colunas);
    let inicioQuadro = y + hCab;
    const fecharQuadro = () => caixa(M, y, CW, inicioQuadro - y);
    if (!linhas.length) {
      texto("Nenhum item.", M + 3, y - 9, tam, f, ROTULO);
      y -= 12;
    }
    linhas.forEach(({ cel, h }, k) => {
      if (espacoLivre() < h) {
        fecharQuadro();
        cabecalho();
        tituloBloco(`${bl.titulo} (continuação)`);
        cabecalhoTabela(bl.colunas);
        inicioQuadro = y + hCab;
      }
      if (k % 2 === 1) page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(0.975, 0.975, 0.975) });
      let x = M;
      cel.forEach((ls, i) => {
        let yy = y - 1;
        for (const l of ls) {
          yy -= lh;
          texto(l, bl.colunas[i].direita ? x + larguras[i] - 2 - larg(l, tam, f) : x + 2, yy + 2, tam);
        }
        if (i) page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.3, color: LINHA_CLARA });
        x += larguras[i];
      });
      y -= h;
      page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.3, color: LINHA_CLARA });
    });
    fecharQuadro();
    y -= 6;
  };

  // ------------------------------------------------------------------ texto corrido (descrição, dados adicionais)
  const desenharTexto = (bl: Extract<BlocoEspelho, { tipo: "texto" }>) => {
    const linhas = quebrar(bl.texto, CW - 8, 7.4, f);
    const lh = 9.4;
    garantir(10 + Math.min(linhas.length, 3) * lh + 8);
    tituloBloco(bl.titulo);
    let i = 0;
    while (i < linhas.length) {
      const cabem = Math.max(1, Math.floor((espacoLivre() - 8) / lh));
      const pedaco = linhas.slice(i, i + cabem);
      const h = pedaco.length * lh + 7;
      caixa(M, y - h, CW, h);
      let yy = y - 2;
      for (const l of pedaco) {
        yy -= lh;
        texto(l, M + 4, yy + 2, 7.4);
      }
      y -= h;
      i += pedaco.length;
      if (i < linhas.length) {
        cabecalho();
        tituloBloco(`${bl.titulo} (continuação)`);
      }
    }
    y -= 5;
  };

  cabecalho();
  for (const bl of e.blocos) {
    if (bl.tipo === "campos") desenharCampos(bl);
    else if (bl.tipo === "tabela") desenharTabela(bl);
    else desenharTexto(bl);
  }

  // folha x/y e rodapé em todas as páginas
  const geradoEm = (opcoes.geradoEm ?? new Date()).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const total = folhas.length;
  folhas.forEach(({ page: p, x, y: yf }, i) => {
    page = p;
    texto(`Folha ${i + 1}/${total}`, x, yf, 7, b);
    const rod = `${FAIXA_ESPELHO}. Gerado em ${geradoEm}.`;
    page.drawLine({ start: { x: M, y: M + 12 }, end: { x: M + CW, y: M + 12 }, thickness: 0.4, color: LINHA_CLARA });
    texto(rod, M, M + 3, 6, f, ROTULO);
    const fl = `Folha ${i + 1} de ${total}`;
    texto(fl, M + CW - larg(fl, 6, b), M + 3, 6, b, ROTULO);
  });

  return pdf.save();
}
