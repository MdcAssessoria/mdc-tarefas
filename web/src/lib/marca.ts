import { useEffect, useState } from "react";
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

/** Endereço exibível da logo (Storage vira blob local; URL externa passa direto). */
export function useLogo(logoUrl: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUrl) return setSrc(null);
    if (!logoUrl.startsWith("storage:")) return setSrc(logoUrl);
    let url: string | null = null;
    let vivo = true;
    void carregarLogo(logoUrl).then((b) => {
      if (!vivo || !b) return;
      url = URL.createObjectURL(new Blob([b as BlobPart]));
      setSrc(url);
    });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [logoUrl]);
  return src;
}
