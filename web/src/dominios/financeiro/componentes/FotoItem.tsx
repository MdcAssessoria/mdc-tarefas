// Foto do item (opcional): miniatura com endereço temporário do Storage; sem foto, as iniciais do nome num quadrado.
// reduzirImagem diminui a foto do celular (até 800 px, JPEG) antes de enviar.
"use client";

import { useEffect, useState } from "react";
import { enderecoFoto } from "../repositorio";

const cache = new Map<string, string | null>();

export function FotoItem({ caminho, nome, tamanho = 48 }: { caminho: string | null | undefined; nome: string; tamanho?: number }) {
  const [url, setUrl] = useState<string | null>(caminho ? (cache.get(caminho) ?? null) : null);
  useEffect(() => {
    if (!caminho || cache.has(caminho)) return;
    let ativo = true;
    enderecoFoto(caminho).then(
      (u) => {
        cache.set(caminho, u);
        if (ativo) setUrl(u);
      },
      () => undefined, // sem foto: fica a miniatura com as iniciais
    );
    return () => {
      ativo = false;
    };
  }, [caminho]);
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const estilo = { width: tamanho, height: tamanho };
  return caminho && url ? (
    <img src={url} alt={nome} style={estilo} className="shrink-0 rounded-lg border border-[var(--borda)] object-cover" />
  ) : (
    <span
      style={estilo}
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-lg bg-[var(--fundo)] text-sm font-semibold text-[var(--marca)] ring-1 ring-[var(--borda)]"
    >
      {iniciais || "?"}
    </span>
  );
}

/** Reduz a foto para no máximo `lado` px (mantendo a proporção) e devolve um JPEG. */
export async function reduzirImagem(arquivo: File, lado = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui ler a foto"))), "image/jpeg", 0.85));
}
