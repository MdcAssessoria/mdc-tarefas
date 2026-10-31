// Utilitários de texto usados em buscas e comparações (sem acento, sem diferença de maiúsculas).

/** Tira os acentos: "Patrimônio Líquido" → "Patrimonio Liquido". Não muda maiúsculas nem pontuação. */
export function semAcento(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
