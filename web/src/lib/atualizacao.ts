// Regras da atualização sem travamento (14/11/2026): reconhecer a falha de "parte da tela não carregou porque o
// sistema foi publicado de novo" e evitar recarregar em loop. Funções puras, testadas em atualizacao.test.ts.

/** Versão deste site, gravada no build (next.config.ts). Comparada com /api/versao para saber se saiu versão nova. */
export const VERSAO_ATUAL = process.env.NEXT_PUBLIC_VERSAO_HUB ?? "";

/** De quanto em quanto tempo o site pergunta se saiu versão nova (também pergunta ao voltar para a aba). */
export const INTERVALO_VERSAO_MS = 3 * 60 * 1000;

/** Depois de recarregar sozinho, não recarrega de novo antes disso (evita loop se o problema for outro). */
export const ESPERA_ENTRE_RECARGAS_MS = 60 * 1000;

/** Chave (sessionStorage) do momento da última recarga automática. */
export const CHAVE_ULTIMA_RECARGA = "hub-mdc:recarga-automatica-em";

const FALHA_CARREGAMENTO =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load (module )?script|Unable to preload CSS/i;

/** O erro é de arquivo do site que não carregou (típico de quando sai versão nova com a aba aberta). */
export function ehFalhaDeCarregamento(erro: unknown): boolean {
  if (!erro) return false;
  if (typeof erro === "string") return FALHA_CARREGAMENTO.test(erro);
  if (typeof erro === "object") {
    const e = erro as { name?: unknown; message?: unknown };
    return FALHA_CARREGAMENTO.test(`${String(e.name ?? "")} ${String(e.message ?? "")}`);
  }
  return false;
}

/** Endereço de arquivo do próprio site (scripts e estilos do Next), para reconhecer falha de <script>/<link>. */
export function ehArquivoDoSite(endereco: string | null | undefined): boolean {
  return Boolean(endereco && /\/_next\/static\//.test(endereco));
}

/** Pode recarregar sozinho agora: não houve recarga automática no último minuto. */
export function podeRecarregarSozinho(ultima: number | null, agora = Date.now()): boolean {
  return ultima === null || !Number.isFinite(ultima) || agora - ultima > ESPERA_ENTRE_RECARGAS_MS;
}

/** Saiu versão nova: as duas versões são conhecidas e diferentes. */
export function saiuVersaoNova(atual: string, publicada: string | null | undefined): boolean {
  return Boolean(atual && publicada && atual !== publicada);
}
