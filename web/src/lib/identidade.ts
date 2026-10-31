// Dados institucionais da MDC Assessoria (rodapés de PDF, Excel, parecer, login e portal). Fonte única: mude aqui.
// Próximo passo previsto: ler estes dados da organização no banco (organizacoes), já que o HUB atende várias.

export const IDENTIDADE_MDC = {
  razaoSocial: "MDC Assessoria Ltda",
  nomeComercial: "MDC Assessoria Contábil",
  areas: "Assessoria Contábil, Tributária e Gestão Financeira",
  cnpj: "48.140.121/0001-65",
  cidadeUf: "Bragança Paulista/SP",
  telefone: "(11) 98859-8041",
  site: "mdcassessoria.com",
  instagram: "@mdcassessoria_",
  email: "edvaldo@mdcassessoria.com",
  responsavelTecnico: {
    nome: "Edvaldo Ribeiro de Carvalho",
    cargo: "Contador",
    crc: "1SP346098-O/0",
  },
} as const;

const I = IDENTIDADE_MDC;
const R = I.responsavelTecnico;

/** "MDC Assessoria Ltda · CNPJ 48.140.121/0001-65 · Bragança Paulista/SP" (rodapé curto). */
export const LINHA_EMPRESA = `${I.razaoSocial} · CNPJ ${I.cnpj} · ${I.cidadeUf}`;

/** "Edvaldo Ribeiro de Carvalho · Contador CRC 1SP346098-O/0 · edvaldo@… · (11) …" com o separador escolhido. */
export function linhaResponsavel(sep = " · "): string {
  return [R.nome, `${R.cargo} CRC ${R.crc}`, I.email, I.telefone].join(sep);
}
