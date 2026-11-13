// Acervo de documentos societários do cliente (073): tipos de documento, o que é "base" de uma alteração e as regras
// puras da tela (vigentes primeiro, sugestão do documento substituído, busca). Gravação só pelas funções
// soc_documento_guardar / soc_documento_editar / soc_documento_retirar.
import type { Arquivo } from "@/lib/arquivos/armazenamento";

export const CATEGORIAS = [
  { id: "contrato_social", nome: "Contrato social", base: true },
  { id: "alteracao_contratual", nome: "Alteração contratual", base: true },
  { id: "consolidacao", nome: "Contrato consolidado", base: true },
  { id: "cartao_cnpj", nome: "Cartão CNPJ", base: true },
  { id: "documento_socio", nome: "Documento de sócio", base: true },
  { id: "procuracao", nome: "Procuração", base: false },
  { id: "ata", nome: "Ata", base: false },
  { id: "certidao", nome: "Certidão", base: false },
  { id: "inscricao", nome: "Inscrição estadual ou municipal", base: false },
  { id: "alvara", nome: "Alvará", base: false },
  { id: "outro", nome: "Outro documento", base: false },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["id"];

/** Documentos do contrato: o vigente de um substitui o do outro (a alteração registrada vira a base da próxima). */
const CONTRATO: Categoria[] = ["contrato_social", "alteracao_contratual", "consolidacao"];

export interface DocumentoAcervo {
  id: string;
  org_id: string;
  cliente_id: string;
  arquivo_id: string;
  categoria: Categoria;
  descricao: string | null;
  data_documento: string | null;
  registro: string | null;
  processo_id: string | null;
  vigente: boolean;
  substituido_por: string | null;
  substituido_em: string | null;
  criado_em: string;
  arquivo: Pick<Arquivo, "id" | "nome" | "caminho" | "tamanho" | "tipo"> | null;
  /** Processo de onde veio (número), quando veio de um. */
  processo?: { numero: number } | null;
}

export function nomeCategoria(c: string): string {
  return CATEGORIAS.find((x) => x.id === c)?.nome ?? "Outro documento";
}

/** Vigentes primeiro, depois pela ordem dos tipos e pela data do documento (mais recente antes). */
export function ordenarAcervo(docs: DocumentoAcervo[]): DocumentoAcervo[] {
  const ordem = (c: string) => CATEGORIAS.findIndex((x) => x.id === c);
  return [...docs].sort(
    (a, b) =>
      Number(b.vigente) - Number(a.vigente) ||
      ordem(a.categoria) - ordem(b.categoria) ||
      (b.data_documento ?? b.criado_em).localeCompare(a.data_documento ?? a.criado_em),
  );
}

/** O que serve de base para um processo do cliente: os vigentes dos tipos de contrato, CNPJ e sócios. */
export function documentosBase(docs: DocumentoAcervo[]): DocumentoAcervo[] {
  const base = new Set<string>(CATEGORIAS.filter((c) => c.base).map((c) => c.id));
  return ordenarAcervo(docs.filter((d) => d.vigente && base.has(d.categoria)));
}

/**
 * Documento vigente que o novo provavelmente substitui: para contrato, alteração ou consolidação, o último vigente
 * desse grupo; para os outros tipos, o último vigente do mesmo tipo. Documento de sócio e "outro" não sugerem (cada
 * sócio tem o seu). A pessoa pode trocar ou deixar em branco.
 */
export function sugerirSubstituido(docs: DocumentoAcervo[], categoria: string): string {
  if (categoria === "documento_socio" || categoria === "outro" || !categoria) return "";
  const grupo = CONTRATO.includes(categoria as Categoria) ? CONTRATO : [categoria];
  const candidatos = ordenarAcervo(docs.filter((d) => d.vigente && grupo.includes(d.categoria)));
  return candidatos[0]?.id ?? "";
}

/** Busca simples: tipo, descrição, registro e nome do arquivo, sem acento nem maiúscula. */
export function casaBusca(d: DocumentoAcervo, busca: string, cliente = ""): boolean {
  const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const alvo = limpo([nomeCategoria(d.categoria), d.descricao, d.registro, d.arquivo?.nome, cliente].filter(Boolean).join(" "));
  return limpo(busca.trim())
    .split(/\s+/)
    .every((p) => alvo.includes(p));
}
