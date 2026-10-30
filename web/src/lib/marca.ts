import { supabase } from "./supabase";

/** Logo da organização em bytes (PNG/JPG) para os PDFs. Guardado no Storage como "storage:<caminho>". */
export async function carregarLogo(logoUrl: string | null | undefined): Promise<Uint8Array | null> {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("storage:")) {
      const { data, error } = await supabase().storage.from("hub-arquivos").download(logoUrl.slice(8));
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    }
    const r = await fetch(logoUrl);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
