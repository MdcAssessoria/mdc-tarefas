// Contratos › Ledgra Link (064): regras da tela de cadastro das empresas e contas bancárias no Ledgra Link. Funções
// puras (testadas em ledgraLinkCadastro.test.ts): os passos que faltam em cada empresa e a conferência dos campos antes
// de enviar. O envio em si fica em ledgraLinkChamadas.ts (Função Edge ledgra-link; as senhas nunca passam pelo banco).
import { cnpjValido, cpfValido, documentoValido, soDigitos } from "@/lib/documento";

export type Escopo = "cobranca" | "extrato" | "pagamento" | "pix";
export type Ambiente = "sandbox" | "homologacao" | "producao";
export type TipoCertificado = "icp_a1_ecnpj" | "icp_a1_ecpf" | "banco_mtls";
export type Produto = "cobranca" | "pix" | "extrato" | "pagamentos";

export interface ContaLink {
  id: string;
  codigo_compe: string;
  banco: string;
  agencia: string;
  conta: string;
  conta_dv: string | null;
  apelido: string;
  ambiente: Ambiente;
  status: string;
  produtos_ativos: Produto[] | null;
}

export interface TitularLink {
  id: string;
  tipo_pessoa?: "PF" | "PJ";
  documento: string;
  razao_social: string;
  status?: string;
  autoriza_cobranca: boolean;
  autoriza_extrato: boolean;
  contas: ContaLink[];
}

export interface CertificadoLink {
  id: string;
  titular_id: string;
  tipo: TipoCertificado | "webhook_servidor";
  apelido: string;
  valido_ate: string;
  dias_para_vencer: number;
  situacao: "vencido" | "critico" | "atencao" | "ok";
  status: string;
}

export interface CadastrosLink {
  titulares: TitularLink[];
  certificados: CertificadoLink[];
}

/** Bancos que o Ledgra Link aceita (código COMPE). O Santander é o que já tem cobrança pronta. */
export const BANCOS_LINK = [
  { codigo: "033", nome: "Santander", pronto: true },
  { codigo: "341", nome: "Itaú Unibanco", pronto: false },
  { codigo: "001", nome: "Banco do Brasil", pronto: false },
  { codigo: "237", nome: "Bradesco", pronto: false },
  { codigo: "756", nome: "Sicoob", pronto: false },
  { codigo: "748", nome: "Sicredi", pronto: false },
  { codigo: "077", nome: "Banco Inter", pronto: false },
  { codigo: "104", nome: "Caixa Econômica Federal", pronto: false },
] as const;

export const ESCOPOS: { id: Escopo; nome: string }[] = [
  { id: "cobranca", nome: "Emitir boletos e cobranças" },
  { id: "pix", nome: "Receber por Pix" },
  { id: "extrato", nome: "Ler o extrato da conta" },
  { id: "pagamento", nome: "Pagar contas (sempre com aprovação)" },
];

export const AMBIENTES: { id: Ambiente; nome: string; ajuda: string }[] = [
  { id: "producao", nome: "Produção (dinheiro de verdade)", ajuda: "Use quando o banco já liberou a conta para uso real." },
  { id: "homologacao", nome: "Homologação (teste do banco)", ajuda: "Fase de testes combinada com o gerente do banco." },
  { id: "sandbox", nome: "Sandbox (simulação)", ajuda: "Ambiente de simulação do portal do desenvolvedor do banco." },
];

export const TIPOS_CERTIFICADO: { id: TipoCertificado; nome: string }[] = [
  { id: "icp_a1_ecnpj", nome: "e-CNPJ A1 (da empresa)" },
  { id: "icp_a1_ecpf", nome: "e-CPF A1 (de pessoa)" },
  { id: "banco_mtls", nome: "Certificado gerado no portal do banco" },
];

export const PRODUTOS: { id: Produto; nome: string }[] = [
  { id: "cobranca", nome: "Cobrança (boleto)" },
  { id: "pix", nome: "Pix" },
  { id: "extrato", nome: "Extrato" },
  { id: "pagamentos", nome: "Pagamentos" },
];

export const nomeBanco = (codigo: string) => BANCOS_LINK.find((b) => b.codigo === codigo)?.nome ?? `Banco ${codigo}`;
export const nomeAmbiente = (a: Ambiente) => AMBIENTES.find((x) => x.id === a)?.nome.split(" (")[0] ?? a;

export type IdPasso = "termo" | "certificado" | "conta" | "credencial";
export interface Passo {
  id: IdPasso;
  numero: number;
  nome: string;
  feito: boolean;
  ajuda: string;
}

/** Os 4 passos depois de cadastrar a empresa, na ordem, com o que já foi feito. */
export function passosEmpresa(t: TitularLink, certificados: CertificadoLink[]): Passo[] {
  const certs = certificados.filter((c) => c.titular_id === t.id && c.status === "ativo" && c.situacao !== "vencido");
  const temCredencial = t.contas.some((c) => (c.produtos_ativos ?? []).length > 0);
  return [
    {
      id: "termo",
      numero: 1,
      nome: "Termo de autorização",
      feito: t.autoriza_cobranca || t.autoriza_extrato,
      ajuda: "PDF assinado pelo responsável da empresa, autorizando a MDC a usar a conta pelo Ledgra Link.",
    },
    {
      id: "certificado",
      numero: 2,
      nome: "Certificado digital",
      feito: certs.length > 0,
      ajuda: "O arquivo .pfx (A1) e a senha. Vai direto para o cofre do Ledgra Link.",
    },
    {
      id: "conta",
      numero: 3,
      nome: "Conta bancária",
      feito: t.contas.length > 0,
      ajuda: "Banco, agência e conta (e o convênio de cobrança, se tiver).",
    },
    {
      id: "credencial",
      numero: 4,
      nome: "Credencial de API do banco",
      feito: temCredencial,
      ajuda: "Client ID e Client Secret que o banco gera no portal do desenvolvedor.",
    },
  ];
}

/** Próximo passo que falta (null quando a empresa já está pronta). */
export const proximoPasso = (passos: Passo[]): Passo | null => passos.find((p) => !p.feito) ?? null;

// ---------------------------------------------------------------- conferências antes de enviar

export interface NovoTitular {
  documento: string;
  razao_social: string;
  email_contato: string;
}
export function conferirTitular(t: NovoTitular): string | null {
  if (!documentoValido(t.documento)) return "CPF ou CNPJ inválido. Confira os números.";
  if (t.razao_social.trim().length < 2) return "Informe a razão social (ou o nome).";
  if (t.email_contato.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t.email_contato.trim())) return "E-mail inválido.";
  return null;
}

export interface NovoTermo {
  escopos: Escopo[];
  assinado_por_nome: string;
  assinado_por_cpf: string;
  assinado_em: string;
  vigente_ate: string;
  arquivo: File | null;
}
/** `hoje` no formato AAAA-MM-DD (hojeISO), para não aceitar assinatura no futuro. */
export function conferirTermo(t: NovoTermo, hoje: string): string | null {
  if (!t.arquivo) return "Anexe o PDF do termo assinado.";
  if (!/\.pdf$/i.test(t.arquivo.name)) return "O termo precisa ser um arquivo PDF.";
  if (!t.escopos.length) return "Marque pelo menos uma coisa que a MDC pode fazer na conta.";
  if (t.assinado_por_nome.trim().length < 3) return "Informe o nome de quem assinou.";
  if (!cpfValido(t.assinado_por_cpf)) return "CPF de quem assinou inválido.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.assinado_em)) return "Informe a data da assinatura.";
  if (t.assinado_em > hoje) return "A data da assinatura não pode ser no futuro.";
  if (t.vigente_ate && t.vigente_ate <= t.assinado_em) return "A validade precisa ser depois da data da assinatura.";
  return null;
}

export interface NovaConta {
  codigo_compe: string;
  agencia: string;
  conta: string;
  conta_dv: string;
  apelido: string;
  convenio: string;
  carteira: string;
  chave_pix: string;
  ambiente: Ambiente;
}
export function conferirConta(c: NovaConta): string | null {
  if (!/^\d{3}$/.test(c.codigo_compe)) return "Escolha o banco.";
  if (!/^\d{1,5}$/.test(soDigitos(c.agencia)) || soDigitos(c.agencia) !== c.agencia.trim()) {
    return "Agência: só números, até 5 dígitos, sem o dígito.";
  }
  if (!/^\d{1,13}$/.test(soDigitos(c.conta)) || soDigitos(c.conta) !== c.conta.trim()) {
    return "Conta: só números, sem o dígito (o dígito vai no campo ao lado).";
  }
  if (c.conta_dv.trim().length > 2) return "Dígito da conta: até 2 caracteres.";
  if (c.apelido.trim().length < 2) return "Dê um apelido para a conta (ex.: Santander MDC).";
  return null;
}

export interface NovoCertificado {
  tipo: TipoCertificado;
  apelido: string;
  senha: string;
  arquivo: File | null;
}
export function conferirCertificado(c: NovoCertificado): string | null {
  if (!c.arquivo) return "Escolha o arquivo do certificado.";
  if (!/\.(pfx|p12)$/i.test(c.arquivo.name)) return "O certificado precisa ser um arquivo .pfx ou .p12.";
  if (!c.senha) return "Informe a senha do certificado.";
  if (c.apelido.trim().length < 2) return "Dê um apelido para o certificado (ex.: e-CNPJ MDC 2026).";
  return null;
}

export interface NovaCredencial {
  conta_id: string;
  produto: Produto;
  client_id: string;
  client_secret: string;
  certificado_id: string;
}
export function conferirCredencial(c: NovaCredencial): string | null {
  if (!c.conta_id) return "Escolha a conta.";
  if (c.client_id.trim().length < 3) return "Informe o Client ID do portal do banco.";
  if (!c.client_secret) return "Informe o Client Secret do portal do banco.";
  return null;
}

/** CNPJ ou CPF da empresa: para dizer se o certificado esperado é e-CNPJ ou e-CPF. */
export const tipoCertificadoSugerido = (documento: string): TipoCertificado =>
  cnpjValido(documento) ? "icp_a1_ecnpj" : "icp_a1_ecpf";
