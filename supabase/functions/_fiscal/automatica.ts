// Emissão automática da NFS-e (052): traduz a resposta do miolo da emissão (emitirFatura) no resultado que o banco guarda
// por fatura e por dia (nfse_auto_registrar): emitida, rejeitada (recusa do Emissor ou da conferência do HUB), erro
// (sem resposta certa: o HUB tenta de novo amanhã) ou pendencia (falta ajustar algo antes de emitir).

export type ResultadoAutomatico = "emitida" | "rejeitada" | "erro" | "pendencia";

export function resultadoAutomatico(status: number, corpo: Record<string, unknown>): { resultado: ResultadoAutomatico; mensagem: string | null } {
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (status === 200) {
    const s = corpo.situacao;
    if (s === "emitida") return { resultado: "emitida", mensagem: texto(corpo.mensagem) };
    if (s === "rejeitada") return { resultado: "rejeitada", mensagem: texto(corpo.mensagem) ?? "O Emissor Nacional recusou a nota." };
    return { resultado: "erro", mensagem: texto(corpo.mensagem) ?? "O Emissor Nacional não respondeu direito." };
  }
  const erro = texto(corpo.erro) ?? `falha ${status}`;
  // a reserva recusa quando falta algo (parâmetros, certificado, código do serviço, CNPJ do cliente)
  if (/^Falta ajustar antes de emitir: /.test(erro)) return { resultado: "pendencia", mensagem: erro.replace(/^Falta ajustar antes de emitir: /, "") };
  // nota já sendo enviada por alguém pela tela: fica para amanhã, sem duplicar
  if (/já está sendo enviada/.test(erro)) return { resultado: "erro", mensagem: erro };
  return { resultado: status >= 500 ? "erro" : "pendencia", mensagem: erro };
}
