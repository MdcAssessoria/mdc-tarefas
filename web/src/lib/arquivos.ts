import { supabase } from "./supabase";

export interface Arquivo {
  id: string;
  org_id: string;
  app: string;
  ref_id: string | null;
  cliente_id: string | null;
  nome: string;
  caminho: string;
  tamanho: number | null;
  tipo: string | null;
  visivel_cliente: boolean;
  enviado_por: string | null;
  enviado_em: string;
}

const BUCKET = "hub-arquivos";

function nomeSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120);
}

/**
 * Envia um arquivo para o Storage e registra em hub_arquivos.
 * Caminho: <org>/<app>/<ref ou cliente>/<data>-<nome>. Para o cliente: <org>/portal/<cliente>/…
 */
export async function enviarArquivo(
  arquivo: File,
  o: { org: string; app: string; ref?: string | null; cliente?: string | null; visivelCliente?: boolean },
): Promise<Arquivo> {
  const sb = supabase();
  const pasta = o.app === "portal" ? o.cliente : (o.ref ?? o.cliente ?? "geral");
  const caminho = `${o.org}/${o.app}/${pasta}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
  const up = await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (up.error) throw up.error;
  const { data, error } = await sb
    .from("hub_arquivos")
    .insert({
      org_id: o.org,
      app: o.app,
      ref_id: o.ref ?? null,
      cliente_id: o.cliente ?? null,
      nome: arquivo.name,
      caminho,
      tamanho: arquivo.size,
      tipo: arquivo.type || null,
      visivel_cliente: o.visivelCliente ?? false,
    })
    .select("*")
    .single();
  if (error) {
    await sb.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
  return data as Arquivo;
}

/** Abre o arquivo com um link temporário (5 minutos). */
export async function abrirArquivo(caminho: string, nome?: string) {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrl(caminho, 300, { download: nome ?? true });
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export function fmtTamanho(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
