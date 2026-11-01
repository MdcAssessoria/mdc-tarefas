// Tipos das tabelas de notas fiscais (migração 032) como as telas leem.
import type { CodigoManifestacao } from "./sefaz";
import type { CodigoTipoEntrada } from "./tiposEntrada";

export interface Nota {
  id: string;
  org_id: string;
  cliente_id: string;
  direcao: "entrada" | "saida";
  modelo: "55" | "65" | "57" | "nfse" | "outro";
  chave: string;
  conteudo: "resumo" | "completa";
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  autorizacao: string | null;
  protocolo: string | null;
  situacao: "autorizada" | "cancelada" | "denegada";
  natureza: string | null;
  emitente_doc: string | null;
  emitente_nome: string | null;
  emitente_uf: string | null;
  destinatario_doc: string | null;
  valor_total: number;
  valor_produtos: number;
  valor_frete: number;
  valor_desconto: number;
  icms_valor: number;
  icms_st_valor: number;
  ipi_valor: number;
  pis_valor: number;
  cofins_valor: number;
  iss_valor: number;
  iss_retido: boolean;
  ibs_valor: number;
  cbs_valor: number;
  retencoes: number;
  cfop_principal: string | null;
  duplicatas: { numero: string | null; vencimento: string; valor: number }[];
  manifestacao: CodigoManifestacao | null;
  manifestacao_em: string | null;
  manifestacao_protocolo: string | null;
  xml_caminho: string | null;
  origem: "dfe" | "adn" | "upload";
  tipo_entrada: CodigoTipoEntrada | null;
  processada: boolean;
  processada_em: string | null;
  data_entrada: string | null;
  pessoa_id: string | null;
  titulos: string[];
}

export interface NotaItem {
  id: number;
  nota_id: string;
  numero: number;
  codigo: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  desconto: number;
  frete: number;
  seguro: number;
  outros: number;
  icms_cst: string | null;
  icms_valor: number;
  icms_st_valor: number;
  ipi_valor: number;
  pis_cst: string | null;
  pis_valor: number;
  cofins_cst: string | null;
  cofins_valor: number;
  ibs_valor: number;
  cbs_valor: number;
  item_id: string | null;
  fator: number;
}

export interface EventoNota {
  id: number;
  nota_id: string | null;
  chave: string;
  tp_evento: string;
  descricao: string | null;
  sequencia: number;
  justificativa: string | null;
  cstat: string | null;
  motivo: string | null;
  protocolo: string | null;
  registrado_em: string | null;
  origem: "hub" | "dfe" | "adn";
  em: string;
}

export interface ControleCaptura {
  cliente_id: string;
  fonte: "nfe" | "nfse";
  ult_nsu: number;
  proxima_consulta_em: string | null;
  bloqueado_ate: string | null;
  ultima_consulta_em: string | null;
  ultimo_cstat: string | null;
  ultimo_erro: string | null;
  documentos_recebidos: number;
}

export interface CertificadoEmpresa {
  cliente_id: string;
  titular: string;
  cnpj: string;
  emissor: string | null;
  icp_brasil: boolean;
  valido_de: string | null;
  valido_ate: string;
  enviado_em: string;
}

export interface ParametrosFiscais {
  cliente_id: string;
  ambiente: "producao" | "homologacao";
  captura_ativa: boolean;
  ciencia_automatica: boolean;
  contribuinte_icms: boolean;
  contribuinte_ipi: boolean;
}

export interface TipoEntradaRegra {
  id: string;
  org_id: string | null;
  cliente_id: string | null;
  codigo: CodigoTipoEntrada;
  nome: string;
  explicacao: string | null;
  movimenta_estoque: boolean;
  gera_pagar: boolean;
  categoria_id: string | null;
  ativo: boolean;
}

export interface DeParaItem {
  id: string;
  fornecedor_doc: string;
  codigo_fornecedor: string;
  item_id: string;
  fator: number;
}
