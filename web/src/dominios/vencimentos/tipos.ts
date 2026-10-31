// Vencimentos acompanhados pela MDC (certificados, procurações, alvarás, licenças, contratos): tipos e nomes.

export const TIPOS_VENC = [
  { id: "certificado_a1", nome: "Certificado digital A1" },
  { id: "certificado_a3", nome: "Certificado digital A3" },
  { id: "procuracao_ecac", nome: "Procuração e-CAC" },
  { id: "procuracao_outra", nome: "Procuração (outra)" },
  { id: "alvara", nome: "Alvará de funcionamento" },
  { id: "avcb", nome: "AVCB (Bombeiros)" },
  { id: "cetesb", nome: "Licença CETESB" },
  { id: "vigilancia", nome: "Licença da Vigilância Sanitária" },
  { id: "licenca_outra", nome: "Licença (outra)" },
  { id: "contrato", nome: "Contrato" },
  { id: "outro", nome: "Outro" },
];
export const nomeTipo = (t: string) => TIPOS_VENC.find((x) => x.id === t)?.nome ?? t;

export interface Vencimento {
  id: string;
  cliente_id: string | null;
  tipo: string;
  descricao: string | null;
  vence_em: string;
  responsavel_id: string | null;
  status: "ativo" | "renovado" | "encerrado";
  tarefa_id: string | null;
  visivel_cliente: boolean;
  observacao: string | null;
}
