// Download de um arquivo gerado no navegador (PDF, Excel) a partir dos bytes.

/** Baixa um arquivo de bytes no navegador. */
export function baixarBytes(bytes: Uint8Array, nome: string, tipo = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
