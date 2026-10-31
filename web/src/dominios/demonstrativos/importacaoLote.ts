// Regras da importação em lote de balancetes do Domínio (vários arquivos, várias empresas e meses de uma vez):
// reconhece a empresa pelo CNPJ ou código do Domínio do cabeçalho, tira a competência e o período do arquivo,
// decide a situação de cada arquivo (pronto, empresa não encontrada, já existe, já publicado, ilegível…) e monta
// o resumo final por empresa. Só regras puras; a gravação usa salvarBalancete de repositorio.ts, igual ao import de um.
import type { Cabecalho } from "./balancete/tipos";
import type { Leitura } from "./balancete/leitura";

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface ClienteLote {
  id: string;
  cnpj: string | null;
  codigo_dominio?: string | null;
}

/** Empresa do arquivo: primeiro pelo CNPJ do cabeçalho, senão pelo código da empresa no Domínio. */
export function identificarEmpresa<C extends ClienteLote>(cab: Cabecalho, clientes: C[]): C | undefined {
  const porCnpj = cab.cnpj ? clientes.find((c) => so(c.cnpj) && so(c.cnpj) === so(cab.cnpj)) : undefined;
  const porCodigo = cab.codigoEmpresa ? clientes.find((c) => c.codigo_dominio && c.codigo_dominio === cab.codigoEmpresa) : undefined;
  return porCnpj ?? porCodigo;
}

/** Competência (YYYY-MM) do arquivo: o mês do fim do período do cabeçalho. */
export function competenciaDoArquivo(cab: Cabecalho): string {
  return cab.fim ? cab.fim.slice(0, 7) : "";
}

/** "mês" ou "acumulado jan a dez/2025" (quando o arquivo cobre mais de um mês). */
export function descreverPeriodo(cab: Cabecalho): string {
  if (!cab.inicio || !cab.fim || cab.inicio.slice(0, 7) === cab.fim.slice(0, 7)) return "mês";
  const mi = Number(cab.inicio.slice(5, 7)),
    mf = Number(cab.fim.slice(5, 7));
  const mesmoAno = cab.inicio.slice(0, 4) === cab.fim.slice(0, 4);
  return `acumulado ${MESES[mi - 1]}${mesmoAno ? "" : "/" + cab.inicio.slice(0, 4)} a ${MESES[mf - 1]}/${cab.fim.slice(0, 4)}`;
}

/** Um arquivo do lote, como fica na lista da tela. */
export interface ItemLote {
  chave: string;
  arquivo: string;
  leitura: Leitura | null;
  erroLeitura: string | null; // arquivo ilegível: o motivo
  clienteId: string; // "" = não escolhida
  reconhecida: boolean; // empresa achada sozinha pelo cabeçalho
  competencia: string; // YYYY-MM ou ""
  substituir: boolean; // substitui o rascunho já gravado
}

/** Balancete já gravado no Hub (para saber se o arquivo repete um mês). */
export interface Existente {
  cliente_id: string;
  competencia: string; // YYYY-MM-01
  status: "rascunho" | "publicado";
}

export type Situacao = "pronto" | "substitui" | "ilegivel" | "sem_empresa" | "sem_competencia" | "ja_existe" | "publicado" | "repetido";

export const SITUACOES: Record<Situacao, { nome: string; tom: "ok" | "atencao" | "erro" }> = {
  pronto: { nome: "Pronto", tom: "ok" },
  substitui: { nome: "Pronto · substitui o rascunho", tom: "ok" },
  ilegivel: { nome: "Arquivo ilegível", tom: "erro" },
  sem_empresa: { nome: "Empresa não encontrada", tom: "atencao" },
  sem_competencia: { nome: "Falta a competência", tom: "atencao" },
  ja_existe: { nome: "Já existe (rascunho)", tom: "atencao" },
  publicado: { nome: "Já publicado", tom: "erro" },
  repetido: { nome: "Repetido neste lote", tom: "atencao" },
};

export interface Avaliacao {
  situacao: Situacao;
  motivo: string; // o que fazer, em linguagem simples
}

/** Situação de cada arquivo do lote, na mesma ordem. Só "pronto" e "substitui" são gravados. */
export function avaliarLote(itens: ItemLote[], existentes: Existente[]): Avaliacao[] {
  const vistos = new Set<string>();
  return itens.map((it) => {
    if (!it.leitura) return { situacao: "ilegivel", motivo: it.erroLeitura ?? "Não consegui ler este arquivo." };
    if (!it.clienteId) return { situacao: "sem_empresa", motivo: "Escolha a empresa na lista." };
    if (!/^\d{4}-\d{2}$/.test(it.competencia)) return { situacao: "sem_competencia", motivo: "Informe o mês do balancete." };
    const chave = `${it.clienteId}|${it.competencia}`;
    if (vistos.has(chave)) return { situacao: "repetido", motivo: "Outro arquivo deste lote já traz a mesma empresa e o mesmo mês." };
    vistos.add(chave);
    const ex = existentes.find((e) => e.cliente_id === it.clienteId && e.competencia.slice(0, 7) === it.competencia);
    if (ex?.status === "publicado")
      return {
        situacao: "publicado",
        motivo: "Este mês já foi publicado para o cliente. Para trocar, despublique na tela do balancete e importe de novo.",
      };
    if (ex)
      return it.substituir
        ? { situacao: "substitui", motivo: "" }
        : { situacao: "ja_existe", motivo: "Marque “Substituir” para trocar o rascunho." };
    return { situacao: "pronto", motivo: "" };
  });
}

export const vaiGravar = (a: Avaliacao) => a.situacao === "pronto" || a.situacao === "substitui";

/** Resultado de um arquivo depois de "Importar todos". */
export interface ResultadoLote {
  empresa: string; // nome para mostrar ("—" quando não reconhecida)
  arquivo: string;
  competencia: string; // YYYY-MM ou ""
  entrou: boolean;
  motivo: string; // por que ficou de fora (vazio quando entrou)
  balanceteId?: string;
}

/** Resumo por empresa (ordem alfabética): quantos entraram, quantos ficaram de fora e os arquivos. */
export function resumoPorEmpresa(resultados: ResultadoLote[]) {
  const mapa = new Map<string, ResultadoLote[]>();
  for (const r of resultados) mapa.set(r.empresa, [...(mapa.get(r.empresa) ?? []), r]);
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([empresa, itens]) => ({
      empresa,
      entraram: itens.filter((i) => i.entrou).length,
      ficaramFora: itens.filter((i) => !i.entrou).length,
      itens: [...itens].sort((a, b) => a.competencia.localeCompare(b.competencia)),
    }));
}
