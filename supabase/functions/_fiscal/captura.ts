// Preparação dos documentos capturados (sem rede, testável): descompacta cada docZip/ArquivoXml, lê com o núcleo
// (documentos.ts), descarta o que já foi guardado (NSU menor ou igual ao último) e monta o caminho no Storage e o
// JSON para public.fis_gravar_documento.
import { descompactarDocZip } from "./nucleo/sefaz.ts";
import type { DocZip, DocumentoAdn } from "./nucleo/sefaz.ts";
import { lerDocumento, lerVariasNotas } from "./nucleo/documentos.ts";

export interface Gravacao {
  nsu: number;
  caminho: string;
  xml: string;
  /** Corpo para fis_gravar_documento. */
  payload: Record<string, unknown>;
}

const anoMes = (iso: string | null | undefined, agora: Date) => {
  const s = (iso ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s.replace("-", "/") : agora.toISOString().slice(0, 7).replace("-", "/");
};

export async function prepararDfe(
  docs: DocZip[],
  o: { org: string; cliente: string; ultNSU: number; agora?: Date },
): Promise<{ gravacoes: Gravacao[]; ignorados: string[] }> {
  const agora = o.agora ?? new Date();
  const gravacoes: Gravacao[] = [];
  const ignorados: string[] = [];
  for (const d of [...docs].sort((a, b) => a.nsu - b.nsu)) {
    if (d.nsu <= o.ultNSU) continue;
    let xml: string;
    try {
      xml = await descompactarDocZip(d.conteudo);
    } catch {
      ignorados.push(`NSU ${d.nsu}: conteúdo compactado inválido`);
      continue;
    }
    let lido: ReturnType<typeof lerDocumento>;
    try {
      lido = lerDocumento(xml);
    } catch (e) {
      ignorados.push(`NSU ${d.nsu} (${d.schema}): ${(e as Error).message}`);
      continue;
    }
    const base = `${o.org}/${o.cliente}`;
    if (lido.tipo === "nota") {
      const n = lido.nota;
      const caminho = `${base}/nfe/${anoMes(n.emissao, agora)}/${n.chave}${n.conteudo === "resumo" ? "-resumo" : ""}.xml`;
      gravacoes.push({ nsu: d.nsu, caminho, xml, payload: { cliente: o.cliente, origem: "dfe", nsu: d.nsu, caminho, nota: n } });
    } else if (lido.tipo === "evento") {
      const e = lido.evento;
      const caminho = `${base}/eventos/${anoMes(e.registrado_em, agora)}/${e.chave}-${e.tpEvento}-${e.sequencia}.xml`;
      gravacoes.push({ nsu: d.nsu, caminho, xml, payload: { cliente: o.cliente, origem: "dfe", nsu: d.nsu, caminho, evento: e, xml } });
    } else {
      ignorados.push(`NSU ${d.nsu}: documento ${lido.raiz} não é tratado (${d.schema})`);
    }
  }
  return { gravacoes, ignorados };
}

export async function prepararAdn(
  docs: DocumentoAdn[],
  o: { org: string; cliente: string; ultNSU: number; agora?: Date },
): Promise<{ gravacoes: Gravacao[]; ignorados: string[] }> {
  const agora = o.agora ?? new Date();
  const gravacoes: Gravacao[] = [];
  const ignorados: string[] = [];
  for (const d of docs) {
    if (d.nsu <= o.ultNSU) continue;
    try {
      const xml = await descompactarDocZip(d.conteudo);
      if (d.tipo && !/NFSE/i.test(d.tipo)) {
        ignorados.push(`NSU ${d.nsu}: ${d.tipo} (evento da NFS-e ainda não tratado)`);
        continue;
      }
      for (const n of lerVariasNotas(xml)) {
        const caminho = `${o.org}/${o.cliente}/nfse/${anoMes(n.emissao, agora)}/${n.chave}.xml`;
        gravacoes.push({ nsu: d.nsu, caminho, xml, payload: { cliente: o.cliente, origem: "adn", nsu: d.nsu, caminho, nota: n } });
      }
    } catch (e) {
      ignorados.push(`NSU ${d.nsu}: ${(e as Error).message}`);
    }
  }
  return { gravacoes, ignorados };
}
