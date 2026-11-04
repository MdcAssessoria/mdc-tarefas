// Faturas no Portal do Cliente (050): o formato que portal_faturas_detalhe devolve e a situação mostrada ao cliente.
import type { DadosFaturaPdf } from "@/dominios/contratos/faturaPdf";

export interface FaturaPortal extends Omit<DadosFaturaPdf["fatura"], "valor" | "iss_aliquota"> {
  id: string;
  valor: number | string;
  iss_aliquota: number | string | null;
  contrato: string | null;
  paga: boolean;
  pago_em: string | null;
  tomador: { nome?: string | null; documento?: string | null; email?: string | null; cidade?: string | null; uf?: string | null } | null;
  nfse: { numero: string | null; chave: string; xml_caminho: string } | null;
  boleto: {
    banco: string;
    linha_digitavel: string | null;
    pix_copia_cola: string | null;
    vencimento: string;
    valor: number | string;
    situacao: string;
  } | null;
}

export type SituacaoPortal = "paga" | "aberta" | "vence_hoje" | "vencida";

/** Situação para o cliente: paga (Financeiro quitado ou boleto pago), vencida, vence hoje ou a vencer. */
export function situacaoFaturaPortal(f: Pick<FaturaPortal, "paga" | "vencimento" | "boleto">, hoje: string): SituacaoPortal {
  if (f.paga || f.boleto?.situacao === "paga") return "paga";
  const venc = f.boleto && f.boleto.vencimento > f.vencimento ? f.boleto.vencimento : f.vencimento;
  if (venc < hoje) return "vencida";
  if (venc === hoje) return "vence_hoje";
  return "aberta";
}
