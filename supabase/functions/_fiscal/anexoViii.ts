// Leitura do Anexo VIII da NFS-e Nacional (correlação item da LC 116 × NBS × atividade do Simples), usada pela Função
// fiscal-tabelas (062): acha na página do portal (gov.br/nfse › RTC) o link da planilha mais nova, tira a versão do
// nome do arquivo e transforma as linhas da planilha (células mescladas: o item só aparece na 1ª linha do bloco) em
// pares item × NBS. Sem rede e sem banco aqui, para dar para testar.

export interface LinhaAnexoViii {
  item: string;
  item_descricao: string | null;
  nbs: string;
  nbs_descricao: string | null;
  ativ_sn: string | null;
  ativ_sn_descricao: string | null;
  indop: string | null;
}

export interface LinkAnexo {
  url: string;
  versao: string;
}

/** "…_v1-02-00.xlsx" → "1.02.00"; aceita também "v1.02.00" e "v1_02_00". */
export function versaoDoArquivo(nome: string): string | null {
  const m = /v(\d+)[-_.](\d{1,2})[-_.](\d{1,2})/i.exec(decodeURIComponent(nome));
  return m ? `${Number(m[1])}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}` : null;
}

/** Compara versões "1.02.00": negativo se a < b. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Links das planilhas do Anexo VIII na página do portal, do mais novo para o mais antigo (sem o "/view" do Plone). */
export function linksAnexoViii(html: string, base: string): LinkAnexo[] {
  const vistos = new Map<string, LinkAnexo>();
  for (const m of html.matchAll(/href\s*=\s*"([^"]+)"/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (!/anexo[-_ ]?viii/i.test(href) || !/\.xlsx/i.test(href)) continue;
    const limpo = href.replace(/\/(view|@@download\/file)\/?$/i, "");
    const versao = versaoDoArquivo(limpo.split("/").pop() ?? "");
    if (!versao) continue;
    const url = new URL(limpo, base).toString();
    if (!vistos.has(url)) vistos.set(url, { url, versao });
  }
  return [...vistos.values()].sort((a, b) => compararVersoes(b.versao, a.versao));
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t || null;
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * Linhas da aba "tabela geral" (a 1ª linha é o cabeçalho) → pares item × NBS. As colunas são achadas pelo nome do
 * cabeçalho (Item LC 116, Descrição Item, NBS, Descrição NBS, COD_ATIV_SN, Descrição ATIV_SN, INDOP); o item, a
 * atividade e o INDOP valem para as linhas de baixo até mudar (células mescladas).
 */
export function linhasAnexoViii(linhas: unknown[][]): LinhaAnexoViii[] {
  const iCab = linhas.findIndex((l) => l.some((c) => /^ITEM LC ?116$/.test(semAcento(String(c ?? "").trim()))));
  if (iCab < 0) throw new Error("Cabeçalho do Anexo VIII não encontrado (coluna 'Item LC 116').");
  const cab = linhas[iCab].map((c) => semAcento(String(c ?? "").trim()));
  const col = (nome: string) => cab.findIndex((c) => c === nome);
  const c = {
    item: col("ITEM LC 116"),
    itemDesc: col("DESCRICAO ITEM"),
    nbs: col("NBS"),
    nbsDesc: col("DESCRICAO NBS"),
    ativ: col("COD_ATIV_SN"),
    ativDesc: col("DESCRICAO ATIV_SN"),
    indop: col("INDOP"),
  };
  if (c.item < 0 || c.nbs < 0) throw new Error("Colunas 'Item LC 116' e 'NBS' não encontradas no Anexo VIII.");
  const saida = new Map<string, LinhaAnexoViii>();
  let atual = { item: "", desc: null as string | null, ativ: null as string | null, ativDesc: null as string | null, indop: null as string | null };
  for (const l of linhas.slice(iCab + 1)) {
    const item = texto(l[c.item]);
    if (item) {
      atual = { item, desc: texto(l[c.itemDesc]), ativ: texto(l[c.ativ]), ativDesc: texto(l[c.ativDesc]), indop: texto(l[c.indop]) };
    } else {
      if (c.ativ >= 0 && texto(l[c.ativ])) {
        atual.ativ = texto(l[c.ativ]);
        atual.ativDesc = texto(l[c.ativDesc]);
      }
      if (c.indop >= 0 && texto(l[c.indop])) atual.indop = texto(l[c.indop]);
    }
    const nbs = (texto(l[c.nbs]) ?? "").replace(/\D/g, "");
    if (!atual.item || !/^\d{2}\.\d{2}(\.\d{2})?$/.test(atual.item) || nbs.length !== 9) continue;
    const chave = `${atual.item}|${nbs}`;
    if (!saida.has(chave))
      saida.set(chave, {
        item: atual.item,
        item_descricao: atual.desc,
        nbs,
        nbs_descricao: texto(l[c.nbsDesc]),
        ativ_sn: atual.ativ,
        ativ_sn_descricao: atual.ativDesc,
        indop: atual.indop,
      });
  }
  return [...saida.values()];
}
