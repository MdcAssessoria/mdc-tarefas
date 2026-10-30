// CRM Comercial: tipos, etapas do funil, valores negociados e montagem do contrato a partir do modelo.

export type Etapa = "novo" | "contato" | "reuniao" | "proposta" | "negociacao" | "ganho" | "perdido";

export const ETAPAS: { id: Etapa; nome: string; dica: string }[] = [
  { id: "novo", nome: "Novo lead", dica: "Chegou e ainda não foi contatado" },
  { id: "contato", nome: "Em contato", dica: "Primeira conversa feita" },
  { id: "reuniao", nome: "Reunião", dica: "Diagnóstico agendado ou feito" },
  { id: "proposta", nome: "Proposta", dica: "Proposta e contrato enviados" },
  { id: "negociacao", nome: "Negociação", dica: "Ajustando valores e escopo" },
  { id: "ganho", nome: "Ganho", dica: "Contrato fechado" },
  { id: "perdido", nome: "Perdido", dica: "Não avançou" },
];

export const ORIGENS: { id: string; nome: string }[] = [
  { id: "simulador", nome: "Simulador de Regime" },
  { id: "indicacao", nome: "Indicação" },
  { id: "site", nome: "Site" },
  { id: "whatsapp", nome: "WhatsApp" },
  { id: "instagram", nome: "Instagram" },
  { id: "evento", nome: "Evento" },
  { id: "outro", nome: "Outro" },
];

export const TIPOS_ATIVIDADE: { id: string; nome: string }[] = [
  { id: "nota", nome: "Anotação" },
  { id: "ligacao", nome: "Ligação" },
  { id: "whatsapp", nome: "WhatsApp" },
  { id: "email", nome: "E-mail" },
  { id: "reuniao", nome: "Reunião" },
  { id: "tarefa", nome: "Próximo passo" },
];

export interface Oportunidade {
  id: string;
  org_id: string;
  empresa: string;
  razao_social: string | null;
  cnpj: string | null;
  contato_nome: string | null;
  email: string | null;
  whatsapp: string | null;
  cidade: string | null;
  uf: string | null;
  atividade: string | null;
  regime_atual: string | null;
  faturamento: number | null;
  origem: string;
  origem_ref: string | null;
  dados_origem: Record<string, unknown> | null;
  etapa: Etapa;
  etapa_desde: string;
  motivo_perda: string | null;
  responsavel_id: string | null;
  valor_mensal: number | null;
  proximo_contato: string | null;
  observacoes: string | null;
  cliente_id: string | null;
  criado_em: string;
  atualizado_em: string;
  arquivado_em?: string | null;
  motivo_arquivo?: string | null;
}

export interface Atividade {
  id: string;
  oportunidade_id: string;
  tipo: string;
  texto: string;
  quando: string | null;
  concluida: boolean;
  autor_id: string | null;
  criado_em: string;
}

export interface Modelo {
  id: string;
  org_id: string;
  nome: string;
  texto: string;
  ativo: boolean;
  versao: number;
  atualizado_em: string;
}

export interface Contrato {
  id: string;
  org_id: string;
  oportunidade_id: string;
  modelo_id: string | null;
  modelo_versao: number | null;
  numero: string | null;
  valores: Valores;
  texto: string;
  status: "rascunho" | "enviado" | "assinado" | "cancelado";
  criado_em: string;
  enviado_em: string | null;
  assinado_em: string | null;
}

/** O que se negocia em cada contrato; o resto do texto vem do modelo. */
export interface Valores {
  razao_social: string;
  cnpj: string;
  endereco: string;
  cidade_uf: string;
  representante: string;
  representante_qualificacao: string;
  honorario_mensal: number;
  vencimento_dia: number;
  inicio: string; // AAAA-MM-DD
  funcionarios_incluidos: number;
  valor_funcionario_adicional: number;
  taxa_implantacao: number;
  parcelas_implantacao: number;
  decimo_terceiro: boolean;
  reajuste_indice: string;
  vigencia: string;
  aviso_previo: number;
  prazo_documentos: number;
  servicos: string[];
  cidade_assinatura: string;
  data_assinatura: string; // AAAA-MM-DD
}

export const SERVICOS_PADRAO = [
  "Escrituração contábil e elaboração do balancete mensal",
  "Elaboração do Balanço Patrimonial, da DRE e das demais demonstrações anuais",
  "Escrituração fiscal e apuração dos tributos federais, estaduais e municipais",
  "Entrega das obrigações acessórias (SPED Fiscal, EFD-Contribuições, ECD, ECF, DCTFWeb, Reinf e DEFIS, conforme o regime)",
  "Departamento pessoal: folha de pagamento, pró-labore, férias, 13º, rescisões e eSocial",
  "Emissão de guias de recolhimento e calendário de vencimentos",
  "Acompanhamento da situação fiscal (certidões e pendências)",
  "Portal do Cliente HUB-MDC com demonstrativos mensais e parecer técnico",
  "Consultoria tributária e planejamento do regime de tributação",
];

export function valoresIniciais(o: Oportunidade): Valores {
  const hoje = new Date().toISOString().slice(0, 10);
  const prox = new Date();
  prox.setMonth(prox.getMonth() + 1, 1);
  return {
    razao_social: o.razao_social ?? o.empresa,
    cnpj: o.cnpj ?? "",
    endereco: "",
    cidade_uf: [o.cidade, o.uf].filter(Boolean).join("/"),
    representante: o.contato_nome ?? "",
    representante_qualificacao: "sócio administrador",
    honorario_mensal: o.valor_mensal ?? 0,
    vencimento_dia: 10,
    inicio: prox.toISOString().slice(0, 10),
    funcionarios_incluidos: 0,
    valor_funcionario_adicional: 0,
    taxa_implantacao: 0,
    parcelas_implantacao: 1,
    decimo_terceiro: true,
    reajuste_indice: "IPCA (IBGE)",
    vigencia: "indeterminado",
    aviso_previo: 30,
    prazo_documentos: 5,
    servicos: SERVICOS_PADRAO.slice(0, 6),
    cidade_assinatura: "Bragança Paulista/SP",
    data_assinatura: hoje,
  };
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataExtenso = (iso: string) =>
  iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

// ---------------------------------------------------------------- valor por extenso

const UN = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]);
  if (r < 20) {
    if (r) partes.push(UN[r]);
  } else {
    const d = Math.floor(r / 10), u = r % 10;
    partes.push(u ? `${DEZ[d]} e ${UN[u]}` : DEZ[d]);
  }
  return partes.join(" e ");
}

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: [number, string, string][] = [
    [1e9, "bilhão", "bilhões"],
    [1e6, "milhão", "milhões"],
    [1e3, "mil", "mil"],
  ];
  const partes: string[] = [];
  let resto = n;
  for (const [base, sing, plur] of grupos) {
    const q = Math.floor(resto / base);
    if (q) {
      partes.push(base === 1e3 && q === 1 ? "mil" : `${ate999(q)} ${q === 1 ? sing : plur}`);
      resto %= base;
    }
  }
  if (resto) partes.push(ate999(resto));
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda
  if (partes.length > 1 && (resto < 100 || resto % 100 === 0) && resto) {
    const ult = partes.pop()!;
    return `${partes.join(" ")} e ${ult}`;
  }
  return partes.join(" ");
}

/** 1250,5 → "mil, duzentos e cinquenta reais e cinquenta centavos" */
export function valorExtenso(v: number): string {
  const reais = Math.floor(Math.round(v * 100) / 100);
  const cent = Math.round((v - reais) * 100);
  const r = reais ? `${inteiroExtenso(reais)} ${reais === 1 ? "real" : /lh(ão|ões)$/.test(inteiroExtenso(reais)) ? "de reais" : "reais"}` : "";
  const c = cent ? `${inteiroExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  return [r, c].filter(Boolean).join(" e ") || "zero real";
}

// ---------------------------------------------------------------- contrato

export const VARIAVEIS: { chave: string; descricao: string }[] = [
  { chave: "numero", descricao: "número do contrato" },
  { chave: "razao_social", descricao: "razão social do cliente" },
  { chave: "cnpj", descricao: "CNPJ do cliente" },
  { chave: "endereco", descricao: "endereço do cliente" },
  { chave: "cidade_uf", descricao: "cidade/UF do cliente" },
  { chave: "representante", descricao: "nome do representante" },
  { chave: "representante_qualificacao", descricao: "qualificação do representante" },
  { chave: "honorario_mensal", descricao: "honorário mensal (R$)" },
  { chave: "honorario_extenso", descricao: "honorário por extenso" },
  { chave: "vencimento_dia", descricao: "dia de vencimento" },
  { chave: "inicio", descricao: "data de início" },
  { chave: "servicos", descricao: "lista de serviços contratados" },
  { chave: "clausula_funcionarios", descricao: "texto sobre funcionários incluídos/adicionais" },
  { chave: "clausula_implantacao", descricao: "texto da taxa de implantação" },
  { chave: "clausula_13", descricao: "texto do 13º honorário" },
  { chave: "reajuste_indice", descricao: "índice de reajuste" },
  { chave: "vigencia", descricao: "vigência" },
  { chave: "aviso_previo", descricao: "dias de aviso prévio" },
  { chave: "prazo_documentos", descricao: "dia limite para envio de documentos" },
  { chave: "cidade_assinatura", descricao: "cidade da assinatura" },
  { chave: "data_assinatura", descricao: "data da assinatura" },
];

export function variaveis(v: Valores, numero: string): Record<string, string> {
  const pend = (s: string) => (s && s.trim() ? s : "[preencher]");
  return {
    numero,
    razao_social: pend(v.razao_social),
    cnpj: pend(v.cnpj),
    endereco: pend(v.endereco),
    cidade_uf: pend(v.cidade_uf),
    representante: pend(v.representante),
    representante_qualificacao: pend(v.representante_qualificacao),
    honorario_mensal: brl(v.honorario_mensal || 0),
    honorario_extenso: valorExtenso(v.honorario_mensal || 0),
    vencimento_dia: String(v.vencimento_dia),
    inicio: dataExtenso(v.inicio),
    servicos: v.servicos.length ? v.servicos.map((s) => `- ${s}`).join("\n") : "- [preencher os serviços]",
    clausula_funcionarios:
      v.funcionarios_incluidos > 0
        ? `O honorário mensal contempla a folha de pagamento de até ${v.funcionarios_incluidos} empregado(s); cada empregado adicional acrescerá ${brl(v.valor_funcionario_adicional || 0)} por mês.`
        : v.valor_funcionario_adicional > 0
          ? `Cada empregado registrado acrescerá ${brl(v.valor_funcionario_adicional)} por mês ao honorário.`
          : "",
    clausula_implantacao:
      v.taxa_implantacao > 0
        ? `A CONTRATANTE pagará ainda taxa única de implantação de ${brl(v.taxa_implantacao)} (${valorExtenso(v.taxa_implantacao)})${v.parcelas_implantacao > 1 ? `, em ${v.parcelas_implantacao} parcelas mensais` : ""}, referente ao levantamento inicial, à conferência de saldos e à transição da escrituração.`
        : "",
    clausula_13: v.decimo_terceiro
      ? "No mês de dezembro será devido um honorário adicional, de igual valor ao mensal, referente aos serviços de encerramento do exercício (13º honorário)."
      : "",
    reajuste_indice: pend(v.reajuste_indice),
    vigencia: pend(v.vigencia),
    aviso_previo: String(v.aviso_previo),
    prazo_documentos: String(v.prazo_documentos),
    cidade_assinatura: pend(v.cidade_assinatura),
    data_assinatura: dataExtenso(v.data_assinatura),
  };
}

/** Preenche o modelo; parágrafos que ficaram vazios (cláusulas opcionais) somem. */
export function montarContrato(modelo: string, v: Valores, numero: string): string {
  const vars = variaveis(v, numero);
  return modelo
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function numeroContrato(seq: number, data = new Date()) {
  return `${data.getFullYear()}/${String(seq).padStart(3, "0")}`;
}
