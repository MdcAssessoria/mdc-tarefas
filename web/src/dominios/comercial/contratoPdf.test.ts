// Testes do contrato em PDF: bloco de assinaturas (nome longo, CNPJ sob a linha), fecho junto das assinaturas
// e "R$" sempre junto do valor. O texto é lido do próprio conteúdo das páginas (operadores Tm/Tj do pdf-lib).
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import { gerarContratoPdf, linhaDocumento, palavras, quebrarNome, separarFecho } from "./contratoPdf";
import { brl } from "@/lib/formato/moeda";

interface TextoNaPagina {
  t: string;
  x: number;
  y: number;
  size: number;
  fonte: string;
}

/** Textos desenhados numa página, com posição, tamanho e fonte. */
function textosDaPagina(doc: PDFDocument, p: PDFPage): TextoNaPagina[] {
  const c = p.node.Contents();
  const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
  let conteudo = "";
  for (const r of refs) {
    const s = doc.context.lookup(r);
    if (!(s instanceof PDFRawStream)) continue;
    const bruto = Buffer.from(s.contents);
    try {
      conteudo += inflateSync(bruto).toString("latin1");
    } catch {
      conteudo += bruto.toString("latin1");
    }
    conteudo += "\n";
  }
  const out: TextoNaPagina[] = [];
  const re = /\/(\S+) ([\d.]+) Tf[\s\S]*?1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s*<([0-9A-Fa-f]*)> Tj/g;
  for (const m of conteudo.matchAll(re))
    out.push({ fonte: m[1], size: Number(m[2]), x: Number(m[3]), y: Number(m[4]), t: Buffer.from(m[5], "hex").toString("latin1") });
  return out;
}

async function paginas(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => textosDaPagina(doc, p));
}

const NOME_LONGO = "GREENCORE INDÚSTRIA E COMÉRCIO DE PRODUTOS SUSTENTÁVEIS LTDA";
const FECHO = "E, por estarem de acordo, as partes assinam o presente instrumento em duas vias de igual teor.";
const LOCAL = "Bragança Paulista/SP, 3 de novembro de 2026.";
const ENCHIMENTO =
  "A CONTRATADA executará os serviços com zelo e diligência, observando as Normas Brasileiras de Contabilidade e o Código de Ética Profissional do Contador, mantendo sigilo sobre as informações recebidas.";

function texto(paragrafos: number) {
  const corpo = Array.from({ length: paragrafos }, (_, k) => (k % 5 === 0 ? `## Cláusula ${k + 1}ª — Teste\n\n${ENCHIMENTO}` : ENCHIMENTO));
  return ["# Contrato de prestação de serviços contábeis", "", ...corpo, "", FECHO, "", LOCAL].join("\n\n");
}

const contrato = (paragrafos: number, nome = NOME_LONGO) =>
  gerarContratoPdf({
    texto: texto(paragrafos),
    numero: "2026/042",
    contratante: { nome, representante: "Maria Aparecida de Souza Albuquerque", documento: "11222333000181" },
  });

describe("palavras e fecho", () => {
  it('quebra só em espaço comum: "R$" fica junto do valor', () => {
    const valor = brl(3500); // "R$ 3.500,00" com espaço não separável
    expect(palavras(`honorários de ${valor} por mês`)).toEqual(["honorários", "de", valor, "por", "mês"]);
  });

  it("separa o fecho e o local/data do corpo", () => {
    const linhas = ["# Título", "", "## Cláusula 7ª — Do foro", "", "Fica eleito o foro.", "", FECHO, "", LOCAL, ""];
    expect(separarFecho(linhas)).toEqual({ corpo: linhas.slice(0, 6), fecho: [FECHO, LOCAL] });
  });

  it("sem a frase de fecho leva ao menos o último parágrafo; lista ou cláusula no fim não vão", () => {
    expect(separarFecho(["## Cláusula", "Texto.", "Cidade, data."]).fecho).toEqual(["Cidade, data."]);
    expect(separarFecho(["## Cláusula", "- item"]).fecho).toEqual([]);
  });

  it("CNPJ ou CPF formatado para a linha de assinatura", () => {
    expect(linhaDocumento("11222333000181")).toBe("CNPJ 11.222.333/0001-81");
    expect(linhaDocumento("123.456.789-01")).toBe("CPF 123.456.789-01");
    expect(linhaDocumento("")).toBe("");
  });
});

describe("nome na assinatura", () => {
  it("quebra pela largura real em até duas linhas, com reticências quando sobra", async () => {
    const doc = await PDFDocument.create();
    const b = await doc.embedFont(StandardFonts.HelveticaBold);
    const medir = (s: string) => b.widthOfTextAtSize(s, 9);
    const larg = 223;
    const duas = quebrarNome(NOME_LONGO, larg, medir);
    expect(duas).toHaveLength(2);
    expect(duas.join(" ")).toBe(NOME_LONGO);
    for (const l of duas) expect(medir(l)).toBeLessThanOrEqual(larg);

    const enorme = quebrarNome(`${NOME_LONGO} ${NOME_LONGO} ${NOME_LONGO}`, larg, medir);
    expect(enorme).toHaveLength(2);
    expect(enorme[1].endsWith("…")).toBe(true);
    for (const l of enorme) expect(medir(l)).toBeLessThanOrEqual(larg);

    expect(quebrarNome("MDC ASSESSORIA LTDA", larg, medir)).toEqual(["MDC ASSESSORIA LTDA"]);
  });
});

describe("contrato em PDF", () => {
  it("razão social longa não invade a coluna da contratada e o CNPJ das duas partes sai sob a assinatura", async () => {
    const pgs = await paginas(await contrato(8));
    const ultima = pgs[pgs.length - 1];
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    // o rótulo da assinatura (tamanho 8); a palavra também aparece no texto das cláusulas
    const contratada = ultima.find((t) => t.t === "CONTRATADA" && t.size === 8)!;
    const contratante = ultima.find((t) => t.t === "CONTRATANTE" && t.size === 8)!;
    expect(contratada).toBeDefined();
    // nome inteiro, em duas linhas, sem corte por número de letras
    const linhasNome = ultima.filter((t) => t.x === contratante.x && t.y < contratante.y && t.y > contratante.y - 30 && t.size === 9);
    expect(linhasNome.map((t) => t.t).join(" ")).toBe(NOME_LONGO);
    for (const l of linhasNome) expect(l.x + bold.widthOfTextAtSize(l.t, l.size)).toBeLessThan(contratada.x);
    // documento de cada parte logo abaixo do nome
    const cnpjContratante = ultima.find((t) => t.t === "CNPJ 11.222.333/0001-81")!;
    const cnpjContratada = ultima.find((t) => t.t === "CNPJ 48.140.121/0001-65")!;
    expect(cnpjContratante.x).toBe(contratante.x);
    expect(cnpjContratada.x).toBe(contratada.x);
    expect(cnpjContratante.y).toBeLessThan(Math.min(...linhasNome.map((t) => t.y)));
  });

  it("o fecho e a linha de local e data sempre vão para a página das assinaturas", async () => {
    for (let n = 1; n <= 30; n++) {
      const pgs = await paginas(await contrato(n));
      const pagina = pgs.find((p) => p.some((t) => t.t === "CONTRATANTE"))!;
      const frases = pagina.map((t) => t.t).join(" ");
      expect(frases, `contrato com ${n} parágrafos`).toContain("E, por estarem de acordo");
      expect(frases, `contrato com ${n} parágrafos`).toContain("3 de novembro de 2026.");
      // assinaturas e testemunhas na mesma página
      expect(pagina.some((t) => t.t === "TESTEMUNHA 2")).toBe(true);
    }
  });

  it("a última cláusula vai junto do fecho: nunca uma página só com o \"E, por estarem de acordo\" (DES-02)", async () => {
    for (let n = 1; n <= 30; n++) {
      const pgs = await paginas(await contrato(n));
      const pagina = pgs.find((p) => p.some((t) => t.t === "CONTRATANTE" && t.size === 8))!;
      const ultimaClausula = `Cláusula ${Math.floor((n - 1) / 5) * 5 + 1}ª — Teste`;
      const textos = pagina.map((t) => t.t);
      // ou a cláusula inteira (título) ou pelo menos o último parágrafo dela está na página das assinaturas
      const antesDoFecho = pagina.filter((t) => t.y > pagina.find((x) => x.t === "E,")!.y && t.size >= 10);
      expect(textos.includes(ultimaClausula) || antesDoFecho.length > 0, `contrato com ${n} parágrafos`).toBe(true);
    }
  });

  it('"R$" nunca fica sozinho no fim da linha', async () => {
    const valor = brl(3500);
    const longo = `Pelos serviços contratados, a CONTRATANTE pagará à CONTRATADA honorários mensais de **${valor}** (três mil e quinhentos reais).`;
    for (let k = 0; k < 40; k++) {
      const bytes = await gerarContratoPdf({
        texto: `${"x ".repeat(k)}${longo}`,
        numero: "1",
        contratante: { nome: "Cliente", representante: "Fulano" },
      });
      const textos = (await paginas(bytes)).flat().map((t) => t.t);
      expect(textos).not.toContain("R$");
      expect(textos).toContain(valor);
    }
  });
});

/** Conteúdo bruto (descompactado) de cada página. */
async function conteudoDasPaginas(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => {
    const c = p.node.Contents();
    const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
    return refs
      .map((r) => {
        const s = doc.context.lookup(r);
        if (!(s instanceof PDFRawStream)) return "";
        const bruto = Buffer.from(s.contents);
        try {
          return inflateSync(bruto).toString("latin1");
        } catch {
          return bruto.toString("latin1");
        }
      })
      .join("\n");
  });
}

describe("minuta (DES-01)", () => {
  const MINUTA_HEX = Buffer.from("MINUTA", "latin1").toString("hex").toUpperCase();
  const temMarca = (c: string) => c.toUpperCase().includes(`<${MINUTA_HEX}>`);

  it("contrato em rascunho tem a marca d'água MINUTA em todas as páginas", async () => {
    const bytes = await gerarContratoPdf({
      texto: texto(30),
      numero: "2026/042",
      rascunho: true,
      contratante: { nome: "Cliente", representante: "Fulano" },
    });
    const paginas = await conteudoDasPaginas(bytes);
    expect(paginas.length).toBeGreaterThan(1);
    for (const c of paginas) expect(temMarca(c)).toBe(true);
  });

  it("contrato definitivo não tem a marca", async () => {
    const paginas = await conteudoDasPaginas(await contrato(30));
    for (const c of paginas) expect(temMarca(c)).toBe(false);
  });
});
