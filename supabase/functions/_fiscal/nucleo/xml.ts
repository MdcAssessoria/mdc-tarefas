// Cópia de web/src/dominios/notas/xml.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// Leitor de XML pequeno e sem dependências, usado igual no navegador (upload de XML), nos testes (Node) e nas Funções
// Edge (Deno não tem DOMParser). Lê elementos, atributos, texto, CDATA e entidades; ignora comentários, declarações e
// instruções de processamento. O nome do elemento fica sem o prefixo de namespace ("nfe:infNFe" → "infNFe").
// Não valida o XML contra o schema: serve para extrair campos de documentos que já vieram da SEFAZ/ADN.

export interface NoXml {
  nome: string;
  atributos: Record<string, string>;
  filhos: NoXml[];
  /** Texto direto do elemento (sem o texto dos filhos), já com as entidades trocadas. */
  texto: string;
}

const ENTIDADES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Troca &lt; &amp; &#233; &#xE9; etc. pelo caractere. */
export function decodificarEntidades(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cod = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

/** Escapa texto para dentro de um elemento XML (o mesmo que a forma canônica C14N faz com o texto). */
export function escaparXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}

const semPrefixo = (n: string) => {
  const i = n.indexOf(":");
  return i >= 0 ? n.slice(i + 1) : n;
};

/** Lê o XML e devolve o elemento raiz. Lança erro em português se o arquivo não for um XML bem formado. */
export function lerXml(xml: string): NoXml {
  const s = xml.replace(/^﻿/, "");
  const pilha: NoXml[] = [];
  let raiz: NoXml | null = null;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) {
      if (pilha.length && s.slice(i).trim()) pilha[pilha.length - 1].texto += decodificarEntidades(s.slice(i));
      break;
    }
    if (lt > i && pilha.length) pilha[pilha.length - 1].texto += decodificarEntidades(s.slice(i, lt));
    if (s.startsWith("<!--", lt)) {
      const fim = s.indexOf("-->", lt + 4);
      if (fim < 0) throw new Error("XML inválido: comentário sem fim.");
      i = fim + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", lt)) {
      const fim = s.indexOf("]]>", lt + 9);
      if (fim < 0) throw new Error("XML inválido: bloco CDATA sem fim.");
      if (pilha.length) pilha[pilha.length - 1].texto += s.slice(lt + 9, fim);
      i = fim + 3;
      continue;
    }
    if (s[lt + 1] === "?" || s[lt + 1] === "!") {
      const fim = s.indexOf(">", lt + 2);
      if (fim < 0) throw new Error("XML inválido.");
      i = fim + 1;
      continue;
    }
    if (s[lt + 1] === "/") {
      const fim = s.indexOf(">", lt + 2);
      if (fim < 0) throw new Error("XML inválido: marca de fechamento sem fim.");
      const nome = semPrefixo(s.slice(lt + 2, fim).trim());
      const aberto = pilha.pop();
      if (!aberto || aberto.nome !== nome) throw new Error(`XML inválido: </${nome}> fecha o elemento errado.`);
      i = fim + 1;
      continue;
    }
    // elemento de abertura: lê o nome e os atributos respeitando aspas (um ">" dentro de atributo não fecha)
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(s[j])) j++;
    const no: NoXml = { nome: semPrefixo(s.slice(lt + 1, j)), atributos: {}, filhos: [], texto: "" };
    if (!no.nome) throw new Error("XML inválido: elemento sem nome.");
    let autoFechado = false;
    for (;;) {
      while (j < n && /\s/.test(s[j])) j++;
      if (j >= n) throw new Error("XML inválido: elemento sem fim.");
      if (s[j] === ">") {
        j++;
        break;
      }
      if (s[j] === "/" && s[j + 1] === ">") {
        autoFechado = true;
        j += 2;
        break;
      }
      const ini = j;
      while (j < n && !/[\s=/>]/.test(s[j])) j++;
      const nomeAttr = s.slice(ini, j);
      while (j < n && /\s/.test(s[j])) j++;
      if (s[j] !== "=") throw new Error(`XML inválido: atributo ${nomeAttr} sem valor.`);
      j++;
      while (j < n && /\s/.test(s[j])) j++;
      const aspas = s[j];
      if (aspas !== '"' && aspas !== "'") throw new Error(`XML inválido: atributo ${nomeAttr} sem aspas.`);
      const fimValor = s.indexOf(aspas, j + 1);
      if (fimValor < 0) throw new Error("XML inválido: aspas sem fim.");
      no.atributos[nomeAttr] = decodificarEntidades(s.slice(j + 1, fimValor));
      j = fimValor + 1;
    }
    if (pilha.length) pilha[pilha.length - 1].filhos.push(no);
    else if (!raiz) raiz = no;
    else throw new Error("XML inválido: mais de um elemento raiz.");
    if (!autoFechado) pilha.push(no);
    i = j;
  }
  if (pilha.length) throw new Error(`XML inválido: <${pilha[pilha.length - 1].nome}> não foi fechado.`);
  if (!raiz) throw new Error("O arquivo não tem conteúdo XML.");
  return raiz;
}

/** Primeiro filho direto com esse nome. */
export const filho = (no: NoXml | undefined, nome: string) => no?.filhos.find((f) => f.nome === nome);

/** Todos os filhos diretos com esse nome. */
export const filhos = (no: NoXml | undefined, nome: string) => (no ? no.filhos.filter((f) => f.nome === nome) : []);

/** Caminho de filhos diretos: achar(nfe, "infNFe/ide/nNF"). */
export function achar(no: NoXml | undefined, caminho: string): NoXml | undefined {
  let atual = no;
  for (const parte of caminho.split("/")) {
    if (!parte) continue;
    atual = filho(atual, parte);
    if (!atual) return undefined;
  }
  return atual;
}

/** Primeiro descendente (em qualquer nível) com esse nome, incluindo o próprio nó. */
export function descendente(no: NoXml | undefined, nome: string): NoXml | undefined {
  if (!no) return undefined;
  if (no.nome === nome) return no;
  for (const f of no.filhos) {
    const r = descendente(f, nome);
    if (r) return r;
  }
  return undefined;
}

/** Todos os descendentes com esse nome (sem entrar dentro de um que já casou). */
export function descendentes(no: NoXml | undefined, nome: string): NoXml[] {
  if (!no) return [];
  if (no.nome === nome) return [no];
  return no.filhos.flatMap((f) => descendentes(f, nome));
}

/** Texto do caminho (aparado) ou null quando não existe ou está vazio. */
export function txt(no: NoXml | undefined, caminho?: string): string | null {
  const alvo = caminho ? achar(no, caminho) : no;
  const t = alvo?.texto.trim();
  return t ? t : null;
}

/** Número do caminho (formato do XML fiscal: ponto decimal); 0 quando não existe. */
export function num(no: NoXml | undefined, caminho?: string): number {
  const t = txt(no, caminho);
  const v = t == null ? 0 : Number(t);
  return Number.isFinite(v) ? v : 0;
}

/** Texto do primeiro descendente com esse nome. */
export const txtDesc = (no: NoXml | undefined, nome: string) => txt(descendente(no, nome));
/** Número do primeiro descendente com esse nome (0 quando não existe). */
export const numDesc = (no: NoXml | undefined, nome: string) => num(descendente(no, nome));
