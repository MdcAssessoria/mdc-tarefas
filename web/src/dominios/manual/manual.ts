// Manual do HUB-MDC dentro do sistema: lê o texto do manual (markdown simples: ## área, ### tela, parágrafos, listas,
// tabelas e imagens) em áreas e telas, e pesquisa por palavras (sem acento, todas as palavras precisam aparecer).
// O texto fica em conteudo.ts; a tela é /manual e o PDF sai de manualPdf.ts.

export type Bloco =
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; ordenada: boolean; inicio: number; itens: string[] }
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] }
  | { tipo: "imagem"; alt: string; src: string };

export interface TelaManual {
  id: string;
  titulo: string;
  blocos: Bloco[];
}

export interface AreaManual {
  id: string;
  titulo: string;
  /** texto antes da primeira tela (para que serve a área, quem usa) */
  blocos: Bloco[];
  telas: TelaManual[];
}

export interface ResultadoBusca {
  area: AreaManual;
  tela: TelaManual | null;
  /** trecho do texto onde a busca aparece */
  trecho: string;
  pontos: number;
  /** não tem todas as palavras da busca (resultado aproximado) */
  parcial?: boolean;
}

/** Texto sem acento e em minúsculas, para comparar. */
export const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Identificador legível para usar no endereço (?area=contratos). */
export function slug(t: string): string {
  return semAcento(t)
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Pedaços de uma linha com **negrito**. */
export function partesDoTexto(texto: string): { texto: string; negrito: boolean }[] {
  const partes: { texto: string; negrito: boolean }[] = [];
  texto.split(/(\*\*(?:[^*]|\*(?!\*))+\*\*)/).forEach((p) => {
    if (!p) return;
    const negrito = p.startsWith("**") && p.endsWith("**") && p.length > 4;
    partes.push({ texto: negrito ? p.slice(2, -2) : p, negrito });
  });
  return partes;
}

/** Texto sem marcação (para busca e PDF). */
export const textoLimpo = (t: string) => t.replace(/\*\*/g, "");

const celulas = (linha: string) =>
  linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Lê os blocos de um trecho de markdown. */
export function lerBlocos(linhas: string[]): Bloco[] {
  const blocos: Bloco[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i].trim();
    if (!l) {
      i++;
      continue;
    }
    const img = /^!\[(.*?)\]\((.*?)\)$/.exec(l);
    if (img) {
      blocos.push({ tipo: "imagem", alt: img[1], src: img[2] });
      i++;
      continue;
    }
    if (l.startsWith("|")) {
      const tab: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith("|")) tab.push(linhas[i++].trim());
      const [cab, ...resto] = tab;
      const corpo = resto.filter((r) => !/^\|[\s|:-]+\|$/.test(r));
      blocos.push({ tipo: "tabela", cabecalho: celulas(cab), linhas: corpo.map(celulas) });
      continue;
    }
    const marcador = /^(-|\d+\.)\s+/;
    if (marcador.test(l)) {
      const ordenada = /^\d+\./.test(l);
      const inicio = ordenada ? Number(l.split(".")[0]) : 1;
      const itens: string[] = [];
      while (i < linhas.length && marcador.test(linhas[i].trim()) && /^\d+\./.test(linhas[i].trim()) === ordenada) {
        itens.push(linhas[i++].trim().replace(marcador, ""));
      }
      blocos.push({ tipo: "lista", ordenada, inicio, itens });
      continue;
    }
    const par: string[] = [];
    while (i < linhas.length) {
      const t = linhas[i].trim();
      if (!t || t.startsWith("|") || t.startsWith("![") || marcador.test(t) || t.startsWith("#")) break;
      par.push(t);
      i++;
    }
    if (par.length) blocos.push({ tipo: "paragrafo", texto: par.join(" ") });
    else i++;
  }
  return blocos;
}

/** O manual inteiro em áreas (##) e telas (###). */
export function lerManual(md: string): AreaManual[] {
  const areas: AreaManual[] = [];
  let area: AreaManual | null = null;
  let tela: TelaManual | null = null;
  let buffer: string[] = [];
  const fechar = () => {
    if (!area) return;
    const blocos = lerBlocos(buffer);
    if (tela) tela.blocos = blocos;
    else area.blocos = blocos;
    buffer = [];
  };
  for (const linha of md.split(/\r?\n/)) {
    const h2 = /^##\s+(.*)$/.exec(linha);
    const h3 = /^###\s+(.*)$/.exec(linha);
    if (h2) {
      fechar();
      area = { id: slug(h2[1]), titulo: h2[1].trim(), blocos: [], telas: [] };
      areas.push(area);
      tela = null;
    } else if (h3 && area) {
      fechar();
      const titulo = h3[1].trim();
      let id = `${area.id}--${slug(titulo)}`;
      while (area.telas.some((t) => t.id === id)) id += "-2";
      tela = { id, titulo, blocos: [] };
      area.telas.push(tela);
    } else buffer.push(linha);
  }
  fechar();
  return areas;
}

/** Nome curto da tela: "Contratos (Contratos → Contratos)" vira "Contratos". */
export const nomeCurto = (titulo: string) => titulo.replace(/\s*\(.*\)\s*$/, "").trim() || titulo;

/** Caminho no menu escrito no título: "Pessoas e acessos (Administração → Pessoas e acessos)" → "Administração → Pessoas e acessos". */
export const caminhoNoMenu = (titulo: string) => /\(([^()]*→[^()]*)\)\s*$/.exec(titulo)?.[1] ?? null;

/** Todo o texto dos blocos, uma frase por linha (para busca e trecho). */
export function textoDosBlocos(blocos: Bloco[]): string[] {
  return blocos.flatMap((b) => {
    if (b.tipo === "paragrafo") return [textoLimpo(b.texto)];
    if (b.tipo === "lista") return b.itens.map(textoLimpo);
    if (b.tipo === "tabela") return [b.cabecalho, ...b.linhas].map((l) => textoLimpo(l.join(" · ")));
    return [b.alt];
  });
}

/** Palavras que não ajudam a achar nada ("como faço para…", "onde fica o…"). */
const PALAVRAS_VAZIAS = new Set(
  (
    "a o e as os um uma uns umas de da do das dos no na nos nas em ao aos para pra pro por pelo pela com sem que " +
    "como onde quando qual quais quem porque eu meu minha me se ja nao sim faco fazer faz posso pode consigo " +
    "preciso quero gostaria devo tem ter esta estou isso isto essa esse sistema hub tela dou dar novo nova novos novas " +
    "fica ficam vejo acho achar uso usar algum alguma tudo todo toda"
  ).split(" "),
);

/**
 * Palavras do dia a dia → como o manual escreve. A palavra da busca vale se QUALQUER uma das formas aparecer.
 * Ao ver alguém procurar um termo e não achar, acrescente aqui.
 */
export const SINONIMOS: Record<string, string[]> = {
  apagar: ["excluir", "cancelar"],
  deletar: ["excluir"],
  remover: ["excluir", "retirar"],
  desfazer: ["voltar", "estornar", "desfazer"],
  corrigir: ["voltar", "editar", "corrigir", "estornar"],
  login: ["acesso", "senha", "entrada"],
  entrar: ["acesso", "senha", "entrada"],
  usuario: ["pessoa", "acesso"],
  funcionario: ["pessoa", "funcionario"],
  colaborador: ["pessoa", "funcionario"],
  boleto: ["codigo de barras", "linha digitavel", "titulo"],
  imprimir: ["pdf", "imprimir"],
  planilha: ["excel", "planilha"],
  exportar: ["excel", "pdf"],
  salvar: ["salvar", "gravar"],
  totvs: ["rm", "totvs"],
  erro: ["erro", "deu errado", "mensagem"],
  nf: ["nota"],
  nfe: ["nota", "xml"],
  nfse: ["nfs-e", "nota"],
  assinar: ["assinatura", "assinar"],
  vigente: ["vigente", "vigencia"],
  aprovacao: ["aprovar", "aprovacao", "aprova"],
  juridico: ["juridico", "gerente do juridico"],
  processo: ["processo", "acao"],
  audiencia: ["audiencia"],
  vaga: ["vaga", "recrutamento"],
  candidato: ["candidato", "talento"],
  dominio: ["dominio", "reduzid"],
  ligo: ["ligar", "ligad", "ligac"],
  volto: ["voltar", "volta"],
  acesso: ["acesso", "pessoas e acessos"],
  crio: ["criar", "cria", "nova"],
  crie: ["criar", "cria", "nova"],
  criar: ["criar", "cria", "nova"],
  lote: ["varios", "lote"],
  todos: ["varios", "todos"],
  prazo: ["prazo", "vencimento"],
};

/** Forma de comparar sem plural nem terminação de verbo: "contas" → "conta", "aprovar" → "aprov". */
export function raiz(p: string): string {
  if (p.length <= 4 || /\d/.test(p)) return p;
  let r = p.replace(/coes$/, "ca").replace(/oes$/, "o").replace(/aes$/, "a").replace(/ns$/, "m");
  if (r === p) r = p.replace(/(es|s)$/, "");
  if (r.length >= 6 && /(ar|er|ir)$/.test(r)) r = r.slice(0, -2);
  return r.length >= 3 ? r : p;
}

/** Palavras úteis da busca, sem acento, sem palavras vazias (se a busca for só delas, fica com as originais). */
const palavrasDaBusca = (busca: string) => {
  const todas = semAcento(busca)
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9-]/g, ""))
    .filter((p) => p.length >= 2);
  const uteis = todas.filter((p) => !PALAVRAS_VAZIAS.has(p));
  return uteis.length ? uteis : todas.filter((p) => p.length >= 3);
};

/** Para cada palavra da busca, as formas que valem (ela mesma pela raiz + os sinônimos). */
export function formasDaBusca(busca: string): string[][] {
  return palavrasDaBusca(busca).map((p) => {
    const r = raiz(p);
    // "volto", "pessoa": a forma sem a última vogal também vale (voltar, pessoas)
    const semVogal = r.length >= 5 && /[aeo]$/.test(r) ? [r.slice(0, -1)] : [];
    return [...new Set([r, ...semVogal, ...(SINONIMOS[p] ?? SINONIMOS[r] ?? []).map(semAcento)])];
  });
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A forma aparece no começo de uma palavra do texto ("dou" não acha "produto"). */
function achaEm(texto: string, forma: string): number {
  return (texto.match(new RegExp(`(^|[^a-z0-9])${escapar(forma)}`, "g")) ?? []).length;
}

/** Trecho curto em volta da primeira palavra encontrada. */
export function trechoCom(linhas: string[], palavras: string[], tamanho = 180): string {
  const linha = linhas.find((l) => palavras.some((p) => semAcento(l).includes(p))) ?? linhas[0] ?? "";
  const pos = Math.max(0, Math.min(...palavras.map((p) => semAcento(linha).indexOf(p)).filter((n) => n >= 0)));
  if (linha.length <= tamanho) return linha;
  const ini = Math.max(0, pos - Math.floor(tamanho / 3));
  const fim = Math.min(linha.length, ini + tamanho);
  return `${ini > 0 ? "…" : ""}${linha.slice(ini, fim).trim()}${fim < linha.length ? "…" : ""}`;
}

/**
 * Pesquisa o manual: devolve as telas (e a abertura de cada área) que têm TODAS as palavras úteis da busca — cada
 * palavra vale pela raiz ou por um sinônimo —, as mais relevantes primeiro (palavra no título vale mais). Se nada tiver
 * todas, devolve as que têm a maior parte, marcadas como `parcial`. `areaId` limita a uma área.
 */
export function buscarNoManual(areas: AreaManual[], busca: string, areaId?: string | null): ResultadoBusca[] {
  const formas = formasDaBusca(busca);
  if (!formas.length) return [];
  const completos: ResultadoBusca[] = [];
  const parciais: (ResultadoBusca & { achadas: number })[] = [];
  const avaliar = (area: AreaManual, tela: TelaManual | null, titulo: string, blocos: Bloco[]) => {
    const linhas = textoDosBlocos(blocos);
    const tituloTela = semAcento(titulo);
    const tituloSem = semAcento(`${area.titulo} ${titulo}`);
    const corpo = semAcento(linhas.join("\n"));
    let pontos = 0;
    let achadas = 0;
    const usadas: string[] = [];
    for (const fs of formas) {
      const naTela = fs.find((f) => achaEm(tituloTela, f));
      const noTitulo = naTela ?? fs.find((f) => achaEm(tituloSem, f));
      const noCorpo = fs.find((f) => achaEm(corpo, f));
      if (!noTitulo && !noCorpo) continue;
      achadas++;
      if (naTela) pontos += 10;
      else if (noTitulo) pontos += 4;
      if (noCorpo) {
        pontos += Math.min(5, achaEm(corpo, noCorpo));
        usadas.push(noCorpo);
      } else if (noTitulo) usadas.push(noTitulo);
    }
    if (!achadas) return;
    const r = { area, tela, trecho: trechoCom(linhas, usadas), pontos };
    if (achadas === formas.length) completos.push(r);
    else parciais.push({ ...r, achadas, parcial: true });
  };
  for (const area of areas) {
    if (areaId && area.id !== areaId) continue;
    if (area.blocos.length) avaliar(area, null, area.titulo, area.blocos);
    for (const tela of area.telas) avaliar(area, tela, tela.titulo, tela.blocos);
  }
  if (completos.length) return completos.sort((a, b) => b.pontos - a.pontos);
  // nada com todas: as que têm mais palavras (pelo menos metade, ou 1 quando a busca tem 1 ou 2 palavras)
  const minimo = Math.max(1, Math.ceil(formas.length / 2));
  return parciais
    .filter((r) => r.achadas >= minimo)
    .sort((a, b) => b.achadas - a.achadas || b.pontos - a.pontos)
    .map(({ achadas: _a, ...r }) => r);
}

/** Pedaços de um texto com as palavras da busca marcadas (para destacar no resultado). */
export function marcarPalavras(texto: string, busca: string): { texto: string; marcado: boolean }[] {
  const palavras = formasDaBusca(busca).flat();
  if (!palavras.length) return [{ texto, marcado: false }];
  const sem = semAcento(texto);
  const marcas = new Array<boolean>(texto.length).fill(false);
  const letra = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);
  for (const p of palavras) {
    let i = sem.indexOf(p);
    while (i >= 0) {
      // só no começo de uma palavra, e marca a palavra inteira ("contrato" destaca "Contratos")
      if (!letra(sem[i - 1])) {
        let fim = i + p.length;
        while (letra(sem[fim])) fim++;
        for (let k = i; k < fim; k++) marcas[k] = true;
      }
      i = sem.indexOf(p, i + p.length);
    }
  }
  const partes: { texto: string; marcado: boolean }[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = partes[partes.length - 1];
    if (ultimo && ultimo.marcado === marcas[i]) ultimo.texto += texto[i];
    else partes.push({ texto: texto[i], marcado: marcas[i] });
  }
  return partes;
}

/**
 * Endereço da tela no sistema a partir do caminho escrito no manual ("Administração → Integração TOTVS RM"),
 * procurando a seção e a tela pelo nome no menu (sem acento e sem o que vem entre parênteses).
 */
export function rotaDoCaminho(
  caminho: string | null,
  secoes: { titulo: string; links: { href: string; nome: string }[] }[],
): string | null {
  if (!caminho) return null;
  const [secao, tela] = caminho.split("→").map((p) => slug(p));
  if (!secao || !tela) return null;
  if (tela === "hoje") return "/";
  const s = secoes.find((x) => slug(x.titulo) === secao || slug(x.titulo).startsWith(`${secao}-`));
  return s?.links.find((l) => slug(l.nome) === tela)?.href ?? null;
}
