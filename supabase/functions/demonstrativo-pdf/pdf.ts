// PDF das demonstrações no padrão visual MDC (pdf-lib, sem dependência de navegador).
// Usado pela Edge Function demonstrativo-pdf; testável em Node.
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { INDICES_INFO, brl, fmtIndice } from "./balancete.ts";
import type { Alerta, Dre, Indices, Linha, Resumo } from "./balancete.ts";
import { linhasDre } from "./demonstracoes.ts";
import type { Demonstracoes, Dfc } from "./demonstracoes.ts";

export interface DadosPdf {
  empresa: string;
  cnpj: string | null;
  competencia: string;
  status: "rascunho" | "publicado";
  resumo: Resumo;
  indices: Indices;
  alertas: Alerta[];
  demonstracoes: Demonstracoes;
  acumulado?: { titulo: string; dre: Dre; dfc: Dfc | null } | null;
  linhas: Linha[];
  comentario?: string | null;
  parecer?: { texto: string; contador_nome: string | null; contador_crc: string | null } | null;
  assinatura?: { titular: string; emissor: string; validade: string } | null;
  logo?: Uint8Array | null; // PNG branco com fundo transparente
  /** PDF de um período escolhido na tela (trimestre, semestre, ano): "1º trimestre de 2024". */
  rotulo?: string | null;
  /** Quantos meses entraram no período, em linguagem simples ("3 de 3 meses publicados"). */
  completude?: string | null;
  /** Período ainda em andamento (faltam os últimos meses): sai sem assinatura e marcado como parcial. */
  parcial?: boolean;
  /** Dados do escritório lidos do cadastro (empresa da Gestão da organização); sem eles, os da MDC (D-11). */
  escritorio?: Partial<Escritorio> | null;
}

/** Quem assina o papel timbrado: razão social, CNPJ e cidade vêm do cadastro; contatos e responsável técnico, da MDC. */
export interface Escritorio {
  razao: string;
  cnpj: string;
  cidadeUf: string;
  telefone: string;
  site: string;
  instagram: string;
  email: string;
  responsavel: string;
  crc: string;
}

export const ESCRITORIO_MDC: Escritorio = {
  razao: "MDC Assessoria Ltda",
  cnpj: "48.140.121/0001-65",
  cidadeUf: "Bragança Paulista/SP",
  telefone: "(11) 98859-8041",
  site: "mdcassessoria.com",
  instagram: "@mdcassessoria_",
  email: "edvaldo@mdcassessoria.com",
  responsavel: "Edvaldo Ribeiro de Carvalho",
  crc: "1SP346098-O/0",
};

/** Junta o que veio do cadastro com o padrão da MDC (campo vazio fica com o padrão). */
export function escritorioDe(e?: Partial<Escritorio> | null): Escritorio {
  const r = { ...ESCRITORIO_MDC };
  for (const [k, v] of Object.entries(e ?? {})) if (typeof v === "string" && v.trim()) (r as Record<string, string>)[k] = v.trim();
  return r;
}

const VERDE = rgb(11 / 255, 40 / 255, 32 / 255);
const DOURADO = rgb(226 / 255, 193 / 255, 126 / 255);
const DOURADO_ESC = rgb(138 / 255, 106 / 255, 42 / 255);
const CLARO = rgb(198 / 255, 211 / 255, 204 / 255);
const FUNDO = rgb(246 / 255, 244 / 255, 238 / 255);
const BORDA = rgb(228 / 255, 224 / 255, 212 / 255);
const TEXTO = rgb(28 / 255, 36 / 255, 32 / 255);
const SUAVE = rgb(93 / 255, 102 / 255, 97 / 255);
const PERIGO = rgb(180 / 255, 35 / 255, 24 / 255);
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const STATUS = { bom: hex("#067647"), atencao: hex("#B54708"), critico: hex("#B42318") };

const W = 595.28, H = 841.89, M = 40, BANDA = 80, RODAPE = 84;
const dataBr = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const num = (v: number) =>
  Math.abs(v) < 0.5 ? "-" : (v < 0 ? "(" : "") + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (v < 0 ? ")" : "");
const mesExtenso = (c: string) =>
  new Date(c.slice(0, 7) + "-15T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

class Doc {
  pdf!: PDFDocument;
  f!: PDFFont;
  b!: PDFFont;
  logo: PDFImage | null = null;
  page!: PDFPage;
  y = 0;
  cabecalho = "";
  esc: Escritorio = ESCRITORIO_MDC;

  static async criar(d: DadosPdf) {
    const o = new Doc();
    o.esc = escritorioDe(d.escritorio);
    o.pdf = await PDFDocument.create();
    o.pdf.setTitle(`Demonstrações contábeis — ${d.empresa} — ${d.rotulo ?? mesExtenso(d.competencia)}`);
    o.pdf.setAuthor("MDC Assessoria Contábil");
    o.pdf.setCreator("HUB-MDC");
    o.pdf.setProducer("HUB-MDC");
    o.pdf.setLanguage("pt-BR");
    // Helvetica: fontes TTF estouram o limite de processamento da Edge Function
    o.f = await o.pdf.embedFont(StandardFonts.Helvetica);
    o.b = await o.pdf.embedFont(StandardFonts.HelveticaBold);
    if (d.logo) o.logo = await o.pdf.embedPng(d.logo).catch(() => null);
    return o;
  }

  t(s: string) {
    return s
      .replace(/[−‒]/g, "-")
      .replace(/✔/g, "OK")
      .replace(/✖/g, "X")
      .replace(/▲/g, "+")
      .replace(/▼/g, "-")
      .replace(/→/g, "->")
      .replace(/≥/g, ">=")
      .replace(/≤/g, "<=")
      .replace(/×/g, "x")
      .replace(/[^\x20-\x7E\u00A0-\u00FF—–…“”‘’•€]/g, "");
  }
  // largura por caractere em cache: medir com a fonte TTF a cada chamada custa muito processamento
  private larguras = [new Map<string, number>(), new Map<string, number>()];
  w(s: string, size: number, bold = false) {
    const fonte = bold ? this.b : this.f;
    const cache = this.larguras[bold ? 1 : 0];
    let total = 0;
    for (const ch of this.t(s)) {
      let lw = cache.get(ch);
      if (lw === undefined) {
        try {
          lw = fonte.widthOfTextAtSize(ch, 1000);
        } catch {
          lw = 500;
        }
        cache.set(ch, lw);
      }
      total += lw;
    }
    return (total * size) / 1000;
  }
  text(s: string, x: number, y: number, size = 9, o: { bold?: boolean; cor?: ReturnType<typeof rgb>; alinhar?: "esq" | "dir" | "centro" } = {}) {
    const tx = this.t(s);
    const larg = this.w(s, size, o.bold);
    const xx = o.alinhar === "dir" ? x - larg : o.alinhar === "centro" ? x - larg / 2 : x;
    this.page.drawText(tx, { x: xx, y, size, font: o.bold ? this.b : this.f, color: o.cor ?? TEXTO });
  }
  /** Quebra um texto com trechos **negrito** em linhas que cabem na largura. */
  linhasRicas(s: string, size: number, largura: number, boldBase = false) {
    const pal: { t: string; b: boolean }[] = [];
    let neg = boldBase;
    for (const parte of s.split("**")) {
      // só espaço comum: o espaço não separável do brl() mantém "R$" junto do valor na quebra de linha
      for (const w of parte.split(/[ \t\n]+/).filter(Boolean)) pal.push({ t: w, b: neg });
      neg = !neg;
    }
    const linhas: { t: string; b: boolean }[][] = [];
    let atual: { t: string; b: boolean }[] = [];
    let lw = 0;
    const esp = this.w(" ", size);
    for (const p of pal) {
      const pw = this.w(p.t, size, p.b);
      if (atual.length && lw + esp + pw > largura) {
        linhas.push(atual);
        atual = [];
        lw = 0;
      }
      lw += (atual.length ? esp : 0) + pw;
      atual.push(p);
    }
    if (atual.length) linhas.push(atual);
    return linhas;
  }
  paragrafo(s: string, o: { size?: number; x?: number; largura?: number; bold?: boolean; cor?: ReturnType<typeof rgb>; entre?: number } = {}) {
    const size = o.size ?? 9.5, x = o.x ?? M, largura = o.largura ?? W - 2 * M - (x - M);
    const lh = size * 1.42;
    for (const linha of this.linhasRicas(s, size, largura, o.bold)) {
      this.garantir(lh);
      let cx = x;
      for (const p of linha) {
        this.text(p.t, cx, this.y - size, size, { bold: p.b, cor: o.cor });
        cx += this.w(p.t, size, p.b) + this.w(" ", size);
      }
      this.y -= lh;
    }
    this.y -= o.entre ?? 4;
  }
  novaPagina() {
    this.page = this.pdf.addPage([W, H]);
    // papel timbrado MDC: faixa verde com logo e dados da empresa, filete dourado
    this.page.drawRectangle({ x: 0, y: H - BANDA, width: W, height: BANDA, color: VERDE });
    this.page.drawRectangle({ x: 0, y: H - BANDA - 3.4, width: W, height: 3.4, color: DOURADO });
    this.marca(M - 6, H - BANDA + 16, 46);
    let yy = H - 30;
    for (const [t, sz, bold, cor] of [
      ["ASSESSORIA CONTÁBIL, TRIBUTÁRIA E GESTÃO FINANCEIRA", 9.2, true, DOURADO],
      [`${this.esc.razao}  ·  CNPJ ${this.esc.cnpj}`, 8, false, CLARO],
      [`${this.esc.cidadeUf}  ·  ${this.esc.telefone}  ·  ${this.esc.site}`, 7.4, false, CLARO],
    ] as [string, number, boolean, ReturnType<typeof rgb>][]) {
      this.text(t, W - M, yy, sz, { bold, cor, alinhar: "dir" });
      yy -= sz + 6;
    }
    // cabeçalho inteiro: diminui a letra até caber (sem cortar com "…", D-10)
    let tam = 7.5;
    while (tam > 5.5 && this.w(this.cabecalho, tam) > W - 2 * M) tam -= 0.25;
    this.text(this.cabecalho, W - M, H - BANDA - 16, tam, { cor: SUAVE, alinhar: "dir" });
    this.y = H - BANDA - 30;
  }
  marca(x: number, y: number, alt: number) {
    if (this.logo) {
      const esc = alt / this.logo.height;
      this.page.drawImage(this.logo, { x, y, width: this.logo.width * esc, height: alt });
      return this.logo.width * esc;
    }
    this.text("MDC", x, y + alt * 0.25, alt * 0.62, { bold: true, cor: DOURADO });
    this.text("Assessoria Contábil", x + this.w("MDC", alt * 0.62, true) + 6, y + alt * 0.3, alt * 0.32, { cor: CLARO });
    return this.w("MDC", alt * 0.62, true) + 6 + this.w("Assessoria Contábil", alt * 0.32);
  }
  garantir(h: number) {
    if (this.y - h < RODAPE) this.novaPagina();
  }
  titulo(s: string, sub?: string) {
    this.garantir(60);
    this.text(s, M, this.y - 14, 14, { bold: true, cor: VERDE });
    this.page.drawRectangle({ x: M, y: this.y - 21, width: 36, height: 2, color: DOURADO });
    this.y -= 28;
    if (sub) this.paragrafo(sub, { size: 8.5, cor: SUAVE, entre: 6 });
  }
  subtitulo(s: string) {
    this.garantir(36);
    this.y -= 4;
    this.text(s, M, this.y - 11, 11, { bold: true, cor: VERDE });
    this.y -= 18;
  }
  /** Quebra um texto simples em linhas que cabem na largura (palavra longa demais é partida). */
  quebrar(s: string, size: number, largura: number, bold = false): string[] {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of s.split(/\s+/).filter(Boolean)) {
      let p = palavra;
      while (this.w(p, size, bold) > largura && p.length > 1) {
        let n = p.length - 1;
        while (n > 1 && this.w(p.slice(0, n), size, bold) > largura) n--;
        if (atual) {
          linhas.push(atual);
          atual = "";
        }
        linhas.push(p.slice(0, n));
        p = p.slice(n);
      }
      const tent = atual ? `${atual} ${p}` : p;
      if (atual && this.w(tent, size, bold) > largura) {
        linhas.push(atual);
        atual = p;
      } else atual = tent;
    }
    if (atual || !linhas.length) linhas.push(atual);
    return linhas;
  }
  /**
   * Tabela com quebra de página e cabeçalho repetido. Texto que não cabe na coluna quebra em mais linhas
   * (nada de "…" em documento contábil, D-10); números ficam numa linha só, alinhados à direita.
   */
  tabela(
    cols: { titulo: string; largura: number; dir?: boolean }[],
    linhas: { celulas: string[]; bold?: boolean; fundo?: boolean; recuo?: number; negativo?: boolean[]; total?: boolean }[],
    size = 8.5,
  ) {
    const lh = size + 6.5;
    const entre = size + 2.4;
    const cab = () => {
      this.garantir(lh * 2);
      this.page.drawRectangle({ x: M, y: this.y - lh, width: W - 2 * M, height: lh, color: VERDE });
      let x = M;
      for (const c of cols) {
        this.text(c.titulo, c.dir ? x + c.largura - 4 : x + 4, this.y - lh + 4.6, size - 0.5, { bold: true, cor: rgb(1, 1, 1), alinhar: c.dir ? "dir" : "esq" });
        x += c.largura;
      }
      this.y -= lh;
    };
    cab();
    for (const l of linhas) {
      const partes = cols.map((c, k) => {
        const s = l.celulas[k] ?? "";
        const rec = k === 0 ? (l.recuo ?? 0) : 0;
        return c.dir ? [s] : this.quebrar(s, size, c.largura - 8 - rec, l.bold);
      });
      const n = Math.max(1, ...partes.map((p) => p.length));
      const rh = lh + (n - 1) * entre;
      if (this.y - rh < RODAPE) {
        this.novaPagina();
        cab();
      }
      if (l.fundo) this.page.drawRectangle({ x: M, y: this.y - rh, width: W - 2 * M, height: rh, color: FUNDO });
      if (l.total) this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 1, color: VERDE });
      let x = M;
      cols.forEach((c, k) => {
        const rec = k === 0 ? (l.recuo ?? 0) : 0;
        partes[k].forEach((t, j) => {
          this.text(t, c.dir ? x + c.largura - 4 : x + 4 + rec, this.y - lh + 4.6 - j * entre, size, {
            bold: l.bold,
            cor: l.negativo?.[k] ? PERIGO : TEXTO,
            alinhar: c.dir ? "dir" : "esq",
          });
        });
        x += c.largura;
      });
      this.page.drawLine({ start: { x: M, y: this.y - rh }, end: { x: W - M, y: this.y - rh }, thickness: 0.4, color: BORDA });
      this.y -= rh;
    }
    this.y -= 8;
  }
}

/** Soma de débitos e créditos só das contas analíticas (as sintéticas repetem os valores das filhas) (DES-05). */
export function totaisBalancete(linhas: Linha[]): { debitos: number; creditos: number } {
  let debitos = 0,
    creditos = 0;
  for (const l of linhas) {
    if (!l.analitica) continue;
    debitos += Number(l.debitos) || 0;
    creditos += Number(l.creditos) || 0;
  }
  return { debitos: Math.round(debitos * 100) / 100, creditos: Math.round(creditos * 100) / 100 };
}

export async function gerarPdf(d: DadosPdf): Promise<PDFDocument> {
  const o = await Doc.criar(d);
  const demo = d.demonstracoes;
  const multi = demo.periodo.dias > 31;
  const datas = `${dataBr(demo.periodo.inicio)} a ${dataBr(demo.periodo.fim)}`;
  const periodo = d.rotulo ? `${d.rotulo} (${datas})` : multi ? datas : mesExtenso(d.competencia);
  // coluna principal das tabelas e coluna de comparação (acumulado do ano no mês; mesmo período do ano anterior no período)
  const tituloCol = d.rotulo ?? (multi ? "Período" : mesExtenso(d.competencia));
  const comparar = !!d.acumulado && (!multi || !!d.rotulo);
  o.cabecalho = `${d.empresa} · ${periodo}`;
  const r = d.resumo, i = d.indices, m = r.mes, f = demo.dfc;

  // ---------------- capa + resumo
  o.page = o.pdf.addPage([W, H]);
  o.page.drawRectangle({ x: 0, y: H - 170, width: W, height: 170, color: VERDE });
  o.page.drawRectangle({ x: 0, y: H - 173, width: W, height: 3, color: DOURADO });
  o.marca(M, H - 78, 44);
  o.text("Assessoria Contábil, Tributária e Gestão Financeira", M, H - 96, 9, { cor: CLARO });
  o.text("Demonstrações contábeis e análise gerencial", M, H - 128, 18, { bold: true, cor: rgb(1, 1, 1) });
  // nome da empresa inteiro: diminui a letra até caber numa linha (sem cortar com "…", D-10)
  let tamEmp = 10;
  while (tamEmp > 6.5 && o.w(d.empresa, tamEmp, true) > W - 2 * M) tamEmp -= 0.5;
  o.text(d.empresa, M, H - 147, tamEmp, { bold: true, cor: DOURADO });
  o.text(`${d.cnpj ? `CNPJ ${d.cnpj} · ` : ""}${multi || d.rotulo ? `Período: ${periodo}` : `Competência: ${periodo}`}`, M, H - 161, 9, { cor: CLARO });
  if (d.status !== "publicado" || d.parcial) {
    o.page.drawRectangle({ x: W - M - 170, y: H - 70, width: 170, height: 22, color: PERIGO });
    const selo = d.parcial ? "PERÍODO PARCIAL · SEM ASSINATURA" : "RASCUNHO · NÃO PUBLICADO";
    o.text(selo, W - M - 85, H - 63, 8.5, { bold: true, cor: rgb(1, 1, 1), alinhar: "centro" });
  }
  o.y = H - 196;
  if (d.completude) {
    o.text(d.completude, M, o.y + 4, 8.5, { cor: SUAVE });
    o.y -= 12;
  }

  // termômetro + pilares
  const s = demo.saude;
  const corNota = s.nota >= 75 ? STATUS.bom : s.nota >= 50 ? STATUS.atencao : STATUS.critico;
  o.page.drawRectangle({ x: M, y: o.y - 118, width: W - 2 * M, height: 118, color: FUNDO, borderColor: BORDA, borderWidth: 0.6 });
  const cx = M + 70, cy = o.y - 84, R = 46;
  const arco = (de: number, ate: number) => {
    const a1 = Math.PI * (1 - de / 100), a2 = Math.PI * (1 - ate / 100);
    // drawSvgPath usa y para baixo, com origem no ponto informado
    return `M ${R * Math.cos(a1)} ${-R * Math.sin(a1)} A ${R} ${R} 0 0 1 ${R * Math.cos(a2)} ${-R * Math.sin(a2)}`;
  };
  o.page.drawSvgPath(arco(0, 100), { x: cx, y: cy, borderColor: BORDA, borderWidth: 10 });
  o.page.drawSvgPath(arco(0, Math.max(1, s.nota)), { x: cx, y: cy, borderColor: corNota, borderWidth: 10 });
  o.text(String(s.nota), cx, cy + 6, 22, { bold: true, alinhar: "centro" });
  o.text(s.faixa.toUpperCase(), cx, cy - 12, 8.5, { bold: true, cor: corNota, alinhar: "centro" });
  o.text("Termômetro de saúde financeira", cx, o.y - 16, 8, { bold: true, cor: VERDE, alinhar: "centro" });
  let py = o.y - 14;
  for (const p of s.pilares) {
    const c = STATUS[p.status];
    o.page.drawCircle({ x: M + 158, y: py - 3.5, size: 4, color: c });
    o.text(p.nome, M + 168, py - 6.5, 8.5, { bold: true });
    const fl = o.linhasRicas(p.frase, 7.6, W - M - 8 - (M + 270)).slice(0, 2);
    fl.forEach((ln, k) => o.text(ln.map((x) => x.t).join(" "), M + 270, py - 6.5 - k * 9, 7.6, { cor: SUAVE }));
    py -= 20.5;
  }
  o.y -= 132;

  // KPIs
  const dre = m;
  const kpis = [
    { r: "Receita bruta", v: brl(dre.receita_bruta), neg: false },
    { r: dre.lucro_liquido >= 0 ? "Lucro líquido" : "Prejuízo", v: brl(dre.lucro_liquido), neg: dre.lucro_liquido < 0 },
    { r: "Caixa e aplicações", v: brl(r.disponivel), neg: r.disponivel < 0 },
    { r: "Caixa da operação", v: brl(f.fco), neg: f.fco < 0 },
  ];
  const kw = (W - 2 * M - 3 * 8) / 4;
  kpis.forEach((k, n) => {
    const x = M + n * (kw + 8);
    o.page.drawRectangle({ x, y: o.y - 48, width: kw, height: 48, borderColor: BORDA, borderWidth: 0.8, color: rgb(1, 1, 1) });
    o.page.drawRectangle({ x, y: o.y - 48, width: 3, height: 48, color: DOURADO });
    o.text(k.r, x + 10, o.y - 15, 8, { cor: SUAVE });
    o.text(k.v, x + 10, o.y - 35, 13, { bold: true, cor: k.neg ? PERIGO : VERDE });
  });
  o.y -= 62;

  // para onde vai cada R$ 100
  if (dre.receita_bruta > 0) {
    o.subtitulo("Para onde foi cada R$ 100 vendidos");
    const fin = dre.despesas_financeiras - dre.receitas_financeiras - dre.outras;
    const partes = [
      { r: "Impostos", v: dre.deducoes + dre.ir_csll, c: hex("#6250d6") },
      { r: "Custos", v: dre.custos, c: hex("#C0892A") },
      { r: "Despesas", v: dre.despesas_operacionais, c: hex("#D55181") },
      { r: "Juros e outros", v: Math.max(0, fin), c: hex("#2a78d6") },
      { r: "Lucro", v: Math.max(0, dre.lucro_liquido), c: hex("#1B8263") },
    ].filter((p) => p.v > 0);
    const tot = partes.reduce((a, p) => a + p.v, 0);
    let x = M;
    const larg = W - 2 * M;
    for (const p of partes) {
      const w = (p.v / tot) * larg;
      o.page.drawRectangle({ x, y: o.y - 20, width: Math.max(0.5, w - 1.5), height: 20, color: p.c });
      if (w > 34) o.text(`R$ ${Math.round((p.v / tot) * 100)}`, x + w / 2, o.y - 13.5, 8, { bold: true, cor: rgb(1, 1, 1), alinhar: "centro" });
      x += w;
    }
    o.y -= 32;
    x = M;
    for (const p of partes) {
      o.page.drawRectangle({ x, y: o.y - 1, width: 7, height: 7, color: p.c });
      const rot = `${p.r} R$ ${((p.v / tot) * 100).toFixed(1).replace(".", ",")}`;
      o.text(rot, x + 10, o.y, 8, { cor: SUAVE });
      x += o.w(rot, 8) + 22;
    }
    o.y -= 12;
    if (dre.lucro_liquido < 0)
      o.paragrafo(`Os gastos superaram a receita em ${brl(-dre.lucro_liquido)}.`, { size: 8.5, cor: PERIGO });
  }

  if (d.comentario) {
    o.subtitulo("Comentário do contador");
    o.paragrafo(d.comentario, { size: 9.5 });
  }

  o.subtitulo("Lucro × caixa: o que explica a diferença");
  for (const c of demo.cruzamento.comentarios) o.paragrafo(`**${c.titulo}.** ${c.texto}`, { size: 9, entre: 3 });

  // ---------------- balanço
  o.novaPagina();
  o.titulo("Balanço Patrimonial", `Período de ${dataBr(demo.periodo.inicio)} a ${dataBr(demo.periodo.fim)}: saldo inicial (abertura do período) e saldo final. Lei nº 6.404/1976, arts. 178 a 182; NBC TG 26.`);
  const cBp = [{ titulo: "", largura: 275 }, { titulo: `Saldo inicial ${dataBr(demo.periodo.inicio)}`, largura: 120, dir: true }, { titulo: `Saldo final ${dataBr(demo.periodo.fim)}`, largura: 120, dir: true }];
  const bpLinhas = (xs: typeof demo.balanco.ativo) =>
    xs.map((l) => ({ celulas: [l.rotulo, num(l.anterior), num(l.atual)], bold: l.nivel <= 2, fundo: l.nivel === 1, recuo: (l.nivel - 1) * 10 }));
  o.tabela([{ ...cBp[0], titulo: "ATIVO" }, cBp[1], cBp[2]], [
    ...bpLinhas(demo.balanco.ativo),
    { celulas: ["TOTAL DO ATIVO", num(demo.balanco.total_ativo.anterior), num(demo.balanco.total_ativo.atual)], bold: true, total: true },
  ]);
  o.tabela([{ ...cBp[0], titulo: "PASSIVO E PATRIMÔNIO LÍQUIDO" }, cBp[1], cBp[2]], [
    ...bpLinhas(demo.balanco.passivo),
    { celulas: ["TOTAL DO PASSIVO E PATRIMÔNIO LÍQUIDO", num(demo.balanco.total_passivo.anterior), num(demo.balanco.total_passivo.atual)], bold: true, total: true },
  ]);

  // ---------------- DRE
  o.novaPagina();
  o.titulo("Demonstração do Resultado (DRE)", "Regime de competência (Lei nº 6.404/1976, arts. 177 e 187; NBC TG 26). Entre parênteses, valores que reduzem o resultado.");
  const colsDre = [{ d: m, t: tituloCol }, ...(comparar && d.acumulado ? [{ d: d.acumulado.dre, t: d.acumulado.titulo }] : [])];
  const ld = colsDre.map((c) => linhasDre(c.d));
  const largDre = colsDre.length === 1 ? [355, 110, 50] : [235, 100, 45, 100, 35];
  const cabDre = [{ titulo: "", largura: largDre[0] }];
  colsDre.forEach((c, k) => cabDre.push({ titulo: c.t, largura: largDre[1 + k * 2], dir: true } as never, { titulo: "%", largura: largDre[2 + k * 2], dir: true } as never));
  o.tabela(
    cabDre,
    ld[0].map((l, k) => ({
      celulas: [l.rotulo, ...colsDre.flatMap((c, j) => [num(ld[j][k].valor), c.d.receita_bruta && Math.abs(ld[j][k].valor / c.d.receita_bruta) >= 0.0005 ? fmtIndice(ld[j][k].valor / c.d.receita_bruta, "%") : "-"])],
      bold: l.total,
      fundo: l.total,
      recuo: l.total ? 0 : 10,
    })),
  );

  // ---------------- DFC
  o.titulo("Demonstração dos Fluxos de Caixa (DFC)", "Método indireto (NBC TG 03): parte do lucro e ajusta o que não movimentou o caixa e as variações das contas do balanço.");
  const colsDfc = [{ f, t: tituloCol }, ...(comparar && d.acumulado?.dfc ? [{ f: d.acumulado.dfc, t: d.acumulado.titulo }] : [])];
  const largDfc = colsDfc.length === 1 ? [395, 120] : [295, 110, 110];
  const linhasDfc: Parameters<Doc["tabela"]>[1] = [];
  const secs = [["operacional", "fco", "Atividades operacionais"], ["investimento", "fci", "Atividades de investimento"], ["financiamento", "fcf", "Atividades de financiamento"]] as const;
  for (const [sec, tot, nome] of secs) {
    linhasDfc.push({ celulas: [nome.toUpperCase()], bold: true, fundo: true });
    const chaves: { chave: string; rotulo: string }[] = [];
    for (const c of colsDfc) for (const x of c.f[sec]) if (!chaves.some((k) => k.chave === x.chave)) chaves.push(x);
    for (const k of chaves) linhasDfc.push({ celulas: [k.rotulo, ...colsDfc.map((c) => num(c.f[sec].find((x) => x.chave === k.chave)?.valor ?? 0))], recuo: 10 });
    linhasDfc.push({ celulas: [`Caixa líquido das ${nome.toLowerCase()}`, ...colsDfc.map((c) => num(c.f[tot]))], bold: true, negativo: [false, ...colsDfc.map((c) => c.f[tot] < 0)] });
  }
  linhasDfc.push({ celulas: ["AUMENTO (REDUÇÃO) DO CAIXA E EQUIVALENTES", ...colsDfc.map((c) => num(c.f.variacao))], bold: true, total: true });
  linhasDfc.push({ celulas: ["Caixa e equivalentes no início", ...colsDfc.map((c) => num(c.f.caixa_inicial))], recuo: 10 });
  linhasDfc.push({ celulas: ["Caixa e equivalentes no fim", ...colsDfc.map((c) => num(c.f.caixa_final))], recuo: 10 });
  o.tabela([{ titulo: "", largura: largDfc[0] }, ...colsDfc.map((c, k) => ({ titulo: c.t, largura: largDfc[k + 1], dir: true }))], linhasDfc);

  // ---------------- índices
  o.novaPagina();
  o.titulo("Indicadores econômico-financeiros", "Calculados sobre as demonstrações do período. Prazos em dias, com saldos médios entre a abertura e o encerramento.");
  o.tabela(
    [{ titulo: "Indicador", largura: 170 }, { titulo: "Valor", largura: 80, dir: true }, { titulo: "O que significa", largura: 265 }],
    INDICES_INFO.map((x) => {
      const v = i[x.id] as number | null | undefined;
      const ruim = v != null && x.alerta?.(v);
      return { celulas: [x.nome, fmtIndice(v ?? null, x.formato), x.leitura], negativo: [false, !!ruim, false] };
    }),
    8,
  );
  if (d.alertas.length) {
    o.subtitulo(d.rotulo ? `Pontos de atenção (fechamento de ${mesExtenso(d.competencia)})` : "Pontos de atenção");
    for (const a of d.alertas)
      o.paragrafo(`**${a.nivel === "alto" ? "Risco alto" : "Atenção"} — ${a.texto}.** ${a.evidencia}. ${a.recomendacao}`, { size: 8.8, entre: 3 });
  }

  // ---------------- parecer
  if (d.parecer?.texto) {
    o.novaPagina();
    for (const linha of d.parecer.texto.split("\n")) {
      const l = linha.trimEnd();
      if (!l) {
        o.y -= 3;
        continue;
      }
      if (l.startsWith("# ")) o.titulo(l.slice(2));
      else if (l.startsWith("## ")) o.subtitulo(l.slice(3));
      else if (l.startsWith("> ")) {
        const linhas = o.linhasRicas(l.slice(2), 8.8, W - 2 * M - 20);
        const alt = linhas.length * 12.5 + 10;
        o.garantir(alt + 4);
        o.page.drawRectangle({ x: M, y: o.y - alt, width: W - 2 * M, height: alt, color: FUNDO });
        o.page.drawRectangle({ x: M, y: o.y - alt, width: 3, height: alt, color: DOURADO });
        o.y -= 5;
        o.paragrafo(l.slice(2), { size: 8.8, x: M + 12, largura: W - 2 * M - 20, entre: 0 });
        o.y -= 9;
      } else if (l.startsWith("- ")) {
        o.garantir(14);
        o.text("•", M + 4, o.y - 9.5, 9.5, { cor: DOURADO_ESC });
        o.paragrafo(l.slice(2), { x: M + 14, size: 9.5, entre: 2 });
      } else if (/^_.*_$/.test(l)) o.paragrafo(l.slice(1, -1), { size: 8.5, cor: SUAVE });
      else o.paragrafo(l);
    }
  }

  // ---------------- balancete
  o.novaPagina();
  o.titulo("Balancete de verificação", `Período de ${dataBr(demo.periodo.inicio)} a ${dataBr(demo.periodo.fim)}. Saldos com D (devedor) ou C (credor).`);
  const sd = (v: number) => (Math.abs(v) < 0.005 ? "-" : `${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${v > 0 ? "D" : "C"}`);
  const mov = (v: number) => (Math.abs(v) < 0.005 ? "-" : Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const tot = totaisBalancete(d.linhas);
  o.tabela(
    [
      { titulo: "Classificação", largura: 72 },
      { titulo: "Conta", largura: 167 },
      { titulo: "Saldo anterior", largura: 72, dir: true },
      { titulo: "Débitos", largura: 66, dir: true },
      { titulo: "Créditos", largura: 66, dir: true },
      { titulo: "Saldo atual", largura: 72, dir: true },
    ],
    [
      ...d.linhas
        .filter((l) => l.saldo_anterior || l.debitos || l.creditos || l.saldo_atual)
        .map((l) => ({
          celulas: [l.classificacao, l.descricao, sd(l.saldo_anterior), mov(l.debitos), mov(l.creditos), sd(l.saldo_atual)],
          bold: !l.analitica,
          fundo: l.nivel === 1,
          recuo: 0,
        })),
      { celulas: ["", "TOTAL (contas analíticas)", "", mov(tot.debitos), mov(tot.creditos), ""], bold: true, total: true },
    ],
    6.8,
  );
  if (Math.abs(tot.debitos - tot.creditos) >= 0.01)
    o.paragrafo(`Atenção: os débitos e os créditos do balancete não fecham (diferença de ${num(tot.debitos - tot.creditos)}). Confira a importação.`, { size: 8.5, cor: PERIGO });
  else o.paragrafo("Débitos e créditos fecham: o balancete está equilibrado.", { size: 8, cor: SUAVE });

  // ---------------- responsabilidade técnica e assinatura
  o.garantir(120);
  o.y -= 10;
  o.subtitulo("Responsabilidade técnica");
  const nome = d.parecer?.contador_nome || o.esc.responsavel;
  const crc = d.parecer?.contador_crc || o.esc.crc;
  o.paragrafo(`${nome} — Contador, CRC ${crc}`, { bold: true, size: 9.5, entre: 1 });
  o.paragrafo(`${o.esc.razao} · CNPJ ${o.esc.cnpj} · ${o.esc.cidadeUf}`, { size: 9, cor: SUAVE });
  if (d.assinatura) {
    const alt = 46;
    o.garantir(alt + 6);
    o.page.drawRectangle({ x: M, y: o.y - alt, width: W - 2 * M, height: alt, borderColor: DOURADO_ESC, borderWidth: 1, color: FUNDO });
    o.text("Documento assinado digitalmente com certificado ICP-Brasil", M + 10, o.y - 14, 9, { bold: true, cor: VERDE });
    o.text(`Titular: ${d.assinatura.titular} · Emissor: ${d.assinatura.emissor}`, M + 10, o.y - 27, 8, { cor: SUAVE });
    o.text(`Assinado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · certificado válido até ${d.assinatura.validade} · confira em validar.iti.gov.br`, M + 10, o.y - 38, 8, { cor: SUAVE });
    o.y -= alt + 6;
  } else if (d.parcial) {
    o.paragrafo("Período parcial: este PDF reúne só os meses já publicados e não leva assinatura digital.", { size: 8.5, cor: PERIGO });
  } else if (d.status !== "publicado") {
    o.paragrafo("Rascunho para revisão interna: este documento ainda não foi publicado nem assinado.", { size: 8.5, cor: PERIGO });
  }

  // rodapé do papel timbrado: empresa e responsável técnico em todas as páginas
  const paginas = o.pdf.getPages();
  const e = o.esc;
  // rascunho e período parcial: marca d'água em TODAS as páginas (D-03), para nenhuma folha solta passar por definitiva
  const marcaDagua = d.parcial ? "PERÍODO PARCIAL" : d.status !== "publicado" ? "RASCUNHO" : null;
  paginas.forEach((p, k) => {
    o.page = p;
    if (marcaDagua) {
      const tam = marcaDagua.length > 10 ? 64 : 92;
      const larg = o.w(marcaDagua, tam, true);
      const ang = Math.PI / 4;
      p.drawText(o.t(marcaDagua), {
        x: W / 2 - (larg / 2) * Math.cos(ang) + (tam * 0.35) * Math.sin(ang),
        y: H / 2 - (larg / 2) * Math.sin(ang) - (tam * 0.35) * Math.cos(ang),
        size: tam,
        font: o.b,
        color: PERIGO,
        opacity: 0.1,
        rotate: degrees(45),
      });
      if (k > 0) {
        const selo = d.parcial ? "PERÍODO PARCIAL · SEM ASSINATURA" : "RASCUNHO · NÃO PUBLICADO";
        const ls = o.w(selo, 6.8, true) + 12;
        p.drawRectangle({ x: M - 6, y: H - BANDA + 3, width: ls, height: 11, color: PERIGO });
        o.text(selo, M, H - BANDA + 6.2, 6.8, { bold: true, cor: rgb(1, 1, 1) });
      }
    }
    p.drawLine({ start: { x: M, y: 62 }, end: { x: W - M, y: 62 }, thickness: 0.8, color: DOURADO });
    o.text(e.razao, M, 50, 7.2, { bold: true, cor: VERDE });
    o.text(`  ·  CNPJ ${e.cnpj}  ·  ${e.cidadeUf}  ·  ${e.site}  ·  ${e.instagram}`, M + o.w(e.razao, 7.2, true), 50, 7.2, { cor: VERDE });
    o.text("Responsável técnico: ", M, 39, 7.2, { bold: true, cor: DOURADO_ESC });
    o.text(`${e.responsavel}  ·  Contador CRC ${e.crc}  ·  ${e.email}  ·  ${e.telefone}`, M + o.w("Responsável técnico: ", 7.2, true), 39, 7.2, { cor: VERDE });
    o.text(`Página ${k + 1} de ${paginas.length}`, W - M, 50, 7.2, { cor: SUAVE, alinhar: "dir" });
    p.drawRectangle({ x: 0, y: 0, width: W, height: 14, color: VERDE });
    p.drawRectangle({ x: 0, y: 14, width: W, height: 2, color: DOURADO });
  });
  return o.pdf;
}
