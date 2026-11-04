// Cópia de web/src/dominios/contratos/faturaPdf.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// Fatura em PDF no papel timbrado da MDC (gerada no navegador com pdf-lib, mesmo desenho do contrato em
// comercial/contratoPdf.ts): faixa verde com logo e dados da MDC, filete dourado, rodapé com o responsável técnico.
// Dados: número, emissão, vencimento, competência, cliente, serviço e valor; observação "Nota fiscal a ser emitida"
// quando o contrato sai com NFS-e. Fatura cancelada sai com a marca "CANCELADA".
import { degrees, PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { IDENTIDADE_MDC, linhaResponsavel } from "./identidade.ts";
import { brl } from "./moeda.ts";
import { fmtCompetencia, fmtData } from "./formato_datas.ts";
import { linhaDocumento, palavras } from "./contratoPdf.ts";
import { OPCOES_ENVIO } from "./faturamento.ts";
import type { Fatura } from "./tipos.ts";
const VERDE = rgb(11 / 255, 40 / 255, 32 / 255);
const DOURADO = rgb(226 / 255, 193 / 255, 126 / 255);
const DOURADO_ESC = rgb(138 / 255, 106 / 255, 42 / 255);
const CLARO = rgb(198 / 255, 211 / 255, 204 / 255);
const FUNDO = rgb(246 / 255, 244 / 255, 238 / 255);
const TEXTO = rgb(28 / 255, 36 / 255, 32 / 255);
const SUAVE = rgb(93 / 255, 102 / 255, 97 / 255);
const VERMELHO = rgb(176 / 255, 42 / 255, 42 / 255);
const W = 595.28,
  H = 841.89,
  ME = 56,
  MD = 56;

const limpar = (s: string) =>
  s
    .replace(/[−‒]/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E -ÿ—–…“”‘’•€]/g, "");

export interface DadosFaturaPdf {
  fatura: Pick<
    Fatura,
    | "numero"
    | "emissao"
    | "vencimento"
    | "competencia"
    | "valor"
    | "descricao"
    | "documento"
    | "envio"
    | "situacao"
    | "nfse_situacao"
    | "nfse_numero"
    | "boleto_situacao"
    | "servico_codigo"
    | "iss_aliquota"
    | "cancelamento_motivo"
  >;
  cliente: { nome: string; documento?: string | null; email?: string | null; cidade?: string | null };
  contrato?: string | null;
  logo?: Uint8Array | null;
}

/** Observações do rodapé da fatura (nota fiscal, boleto, cancelamento). */
export function observacoesFatura(f: DadosFaturaPdf["fatura"]): string[] {
  const obs: string[] = [];
  if (f.situacao === "cancelada") obs.push(`Fatura CANCELADA${f.cancelamento_motivo ? `: ${f.cancelamento_motivo}` : ""}. Não pague.`);
  if (f.documento === "nfse")
    obs.push(
      f.nfse_situacao === "emitida"
        ? `Nota fiscal de serviço (NFS-e)${f.nfse_numero ? ` nº ${f.nfse_numero}` : ""} emitida para este serviço.`
        : "Nota fiscal a ser emitida (NFS-e pelo Emissor Nacional).",
    );
  if (f.boleto_situacao === "gerado") obs.push("Boleto bancário enviado junto.");
  else if (f.envio === "nf_fatura") obs.push("O boleto para pagamento será enviado separadamente.");
  else if (f.boleto_situacao === "a_definir") obs.push("O boleto para pagamento segue junto ou será enviado em seguida.");
  else obs.push("Pagamento conforme combinado em contrato.");
  return obs;
}

export async function gerarFaturaPdf(d: DadosFaturaPdf): Promise<Uint8Array> {
  const f = d.fatura;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Fatura ${f.numero} — ${d.cliente.nome}`);
  pdf.setAuthor(IDENTIDADE_MDC.nomeComercial);
  pdf.setCreator("HUB-MDC");
  const fo = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (d.logo) logo = await pdf.embedPng(d.logo).catch(() => pdf.embedJpg(d.logo!).catch(() => null));
  const page: PDFPage = pdf.addPage([W, H]);
  const w = (s: string, size: number, font: PDFFont) => font.widthOfTextAtSize(limpar(s), size);
  const text = (s: string, x: number, y: number, size: number, font: PDFFont, cor = TEXTO) =>
    page.drawText(limpar(s), { x, y, size, font, color: cor });
  const direita = (s: string, xd: number, y: number, size: number, font: PDFFont, cor = TEXTO) =>
    text(s, xd - w(s, size, font), y, size, font, cor);
  /** Quebra pela largura; devolve as linhas. */
  const quebrar = (s: string, size: number, font: PDFFont, larg: number) => {
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras(s)) {
      const t = atual ? `${atual} ${p}` : p;
      if (w(t, size, font) <= larg || !atual) atual = t;
      else {
        linhas.push(atual);
        atual = p;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  };

  // cabeçalho: faixa verde com logo e dados da MDC
  const BANDA = 80;
  page.drawRectangle({ x: 0, y: H - BANDA, width: W, height: BANDA, color: VERDE });
  page.drawRectangle({ x: 0, y: H - BANDA - 3.4, width: W, height: 3.4, color: DOURADO });
  if (logo) {
    const esc = 46 / logo.height;
    page.drawImage(logo, { x: ME - 10, y: H - BANDA + 16, width: logo.width * esc, height: 46 });
  } else {
    text("MDC", ME - 10, H - BANDA + 26, 28.5, b, DOURADO);
    text("Assessoria Contábil", ME - 10 + w("MDC", 28.5, b) + 6, H - BANDA + 30, 13.8, fo, CLARO);
  }
  let yy = H - 30;
  for (const [t, sz, font, cor] of [
    ["ASSESSORIA CONTÁBIL, TRIBUTÁRIA E GESTÃO FINANCEIRA", 9.2, b, DOURADO],
    [`${IDENTIDADE_MDC.razaoSocial}  ·  CNPJ ${IDENTIDADE_MDC.cnpj}`, 8, fo, CLARO],
    [`${IDENTIDADE_MDC.cidadeUf}  ·  ${IDENTIDADE_MDC.telefone}  ·  ${IDENTIDADE_MDC.site}`, 7.4, fo, CLARO],
  ] as const) {
    direita(t, W - MD, yy, sz, font, cor);
    yy -= sz + 6;
  }

  // título e número
  let y = H - BANDA - 52;
  text("FATURA DE SERVIÇOS", ME, y, 18, b, VERDE);
  page.drawRectangle({ x: ME, y: y - 9, width: 44, height: 2, color: DOURADO });
  direita(`Nº ${f.numero}`, W - MD, y, 16, b, VERDE);
  if (d.contrato) direita(`Contrato: ${d.contrato}`, W - MD, y - 16, 8.5, fo, SUAVE);

  // três caixas: emissão, vencimento, competência
  y -= 44;
  const caixa = (x: number, larg: number, rot: string, val: string, destaque = false) => {
    page.drawRectangle({ x, y: y - 38, width: larg, height: 46, color: destaque ? VERDE : FUNDO });
    text(rot.toUpperCase(), x + 10, y - 6, 7.5, b, destaque ? DOURADO : SUAVE);
    text(val, x + 10, y - 26, 13, b, destaque ? rgb(1, 1, 1) : TEXTO);
  };
  const larg = (W - ME - MD - 20) / 3;
  caixa(ME, larg, "Emissão", fmtData(f.emissao));
  caixa(ME + larg + 10, larg, "Vencimento", fmtData(f.vencimento), true);
  caixa(ME + 2 * (larg + 10), larg, "Competência", fmtCompetencia(f.competencia));

  // cliente
  y -= 74;
  text("CLIENTE", ME, y, 8, b, DOURADO_ESC);
  y -= 16;
  for (const l of quebrar(d.cliente.nome, 12, b, W - ME - MD).slice(0, 2)) {
    text(l, ME, y, 12, b);
    y -= 15;
  }
  const sub = [linhaDocumento(d.cliente.documento), d.cliente.cidade, d.cliente.email].filter(Boolean).join("  ·  ");
  if (sub) {
    text(sub, ME, y, 9, fo, SUAVE);
    y -= 14;
  }

  // serviço
  y -= 14;
  page.drawRectangle({ x: ME, y: y - 6, width: W - ME - MD, height: 22, color: VERDE });
  text("SERVIÇO", ME + 10, y + 1, 8.5, b, DOURADO);
  direita("VALOR", W - MD - 10, y + 1, 8.5, b, DOURADO);
  y -= 24;
  const linhasServ = quebrar(f.descricao, 10.5, fo, W - ME - MD - 150);
  for (const l of linhasServ) {
    text(l, ME + 10, y, 10.5, fo);
    y -= 14;
  }
  direita(brl(Number(f.valor)), W - MD - 10, y + 14 * linhasServ.length, 10.5, b);
  if (f.documento === "nfse" && (f.servico_codigo || f.iss_aliquota != null)) {
    const det = [
      f.servico_codigo && `Código do serviço ${f.servico_codigo}`,
      f.iss_aliquota != null && `ISS ${String(f.iss_aliquota).replace(".", ",")}%`,
    ]
      .filter(Boolean)
      .join("  ·  ");
    text(det, ME + 10, y, 8.5, fo, SUAVE);
    y -= 14;
  }
  page.drawLine({ start: { x: ME, y: y + 2 }, end: { x: W - MD, y: y + 2 }, thickness: 0.6, color: CLARO });

  // total
  y -= 34;
  const tw = 230;
  page.drawRectangle({ x: W - MD - tw, y: y - 12, width: tw, height: 36, color: FUNDO });
  page.drawRectangle({ x: W - MD - tw, y: y - 12, width: 3, height: 36, color: DOURADO });
  text("VALOR A PAGAR", W - MD - tw + 14, y + 6, 8, b, SUAVE);
  direita(brl(Number(f.valor)), W - MD - 12, y - 2, 16, b, VERDE);
  const envio = OPCOES_ENVIO.find((o) => o.id === f.envio);
  if (envio) text(`Enviado ao cliente: ${envio.titulo.toLowerCase()}`, ME, y + 2, 8.5, fo, SUAVE);

  // observações
  y -= 52;
  text("OBSERVAÇÕES", ME, y, 8, b, DOURADO_ESC);
  y -= 15;
  for (const o of observacoesFatura(f)) {
    for (const l of quebrar(`•  ${o}`, 9.5, fo, W - ME - MD)) {
      text(l, ME, y, 9.5, fo, f.situacao === "cancelada" && o.startsWith("Fatura CANCELADA") ? VERMELHO : TEXTO);
      y -= 13;
    }
  }

  if (f.situacao === "cancelada") {
    const t = "CANCELADA";
    page.drawText(t, {
      x: W / 2 - w(t, 88, b) / 2 + 40,
      y: H / 2 - 140,
      size: 88,
      font: b,
      color: VERMELHO,
      opacity: 0.12,
      rotate: degrees(30),
    });
  }

  // rodapé
  page.drawLine({ start: { x: ME, y: 62 }, end: { x: W - MD, y: 62 }, thickness: 0.8, color: DOURADO });
  text(IDENTIDADE_MDC.razaoSocial, ME, 50, 7.2, b, VERDE);
  text(
    `  ·  CNPJ ${IDENTIDADE_MDC.cnpj}  ·  ${IDENTIDADE_MDC.cidadeUf}  ·  ${IDENTIDADE_MDC.site}  ·  ${IDENTIDADE_MDC.instagram}`,
    ME + w(IDENTIDADE_MDC.razaoSocial, 7.2, b),
    50,
    7.2,
    fo,
    VERDE,
  );
  text("Responsável técnico: ", ME, 39, 7.2, b, DOURADO_ESC);
  text(linhaResponsavel("  ·  "), ME + w("Responsável técnico: ", 7.2, b), 39, 7.2, fo, VERDE);
  page.drawRectangle({ x: 0, y: 0, width: W, height: 14, color: VERDE });
  page.drawRectangle({ x: 0, y: 14, width: W, height: 2, color: DOURADO });
  return pdf.save();
}
