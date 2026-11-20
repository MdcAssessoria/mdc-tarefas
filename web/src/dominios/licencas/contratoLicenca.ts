// Contrato de licença de uso do Ledgra e do HUB-MDC (Licenças › Licenças › Contrato). Um contrato por licença:
// o modelo de cláusulas (markdown simples com variáveis {{assim}}) é preenchido com os dados da licença, do cliente
// e de quem assina, e vira o PDF no papel timbrado da MDC (comercial/contratoPdf.ts). O modelo-padrão segue a Lei
// 9.609/1998 (uso de software regulado por contrato de licença, art. 9º; prazo de validade técnica, arts. 7º e 8º),
// a LGPD (MDC como operadora, art. 39; segurança, art. 46; incidente, art. 48) e a MP 2.200-2/2001, art. 10, § 2º
// (assinatura eletrônica aceita pelas partes). A MDC pode editar o texto na tela Modelo do contrato; o banco guarda
// as versões. Testado em contratoLicenca.test.ts.
import { IDENTIDADE_MDC } from "@/lib/identidade";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { cpfValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { dataPorExtenso } from "@/dominios/contratos/termoLedgraLink";
import type { Tom } from "@/components/ui/Tons";
import type { Contrato, Plano, Produto } from "./tipos";

export type ModoAssinatura = "impresso" | "eletronico";
export type SituacaoDocumento = "emitido" | "enviado" | "assinado" | "cancelado";

export interface Signatario {
  nome: string;
  cpf: string;
  cargo: string;
  email: string;
}

/** Contrato emitido (fotografia do texto) guardado em lic_contrato_documentos. */
export interface DocumentoLicenca {
  id: string;
  org_id: string;
  contrato_id: string;
  numero: string;
  modelo_versao: number;
  texto: string;
  hash: string;
  signatario: Signatario;
  modo: ModoAssinatura;
  situacao: SituacaoDocumento;
  emitido_em: string;
  link_expira_em: string | null;
  assinado_em: string | null;
  assinatura: RegistroAssinatura | null;
  cancelado_em: string | null;
  cancelado_motivo: string | null;
  /** Arquivo do contrato assinado (escaneado), em hub_arquivos (086). */
  arquivo_id?: string | null;
}

/** O que o banco grava quando o contrato é assinado. */
export type RegistroAssinatura =
  | { tipo: "impresso"; data: string; observacao?: string | null; registrado_por?: string | null }
  /** No link público (103) o CPF chega mascarado e o IP e o navegador não chegam (ficam só no registro da MDC). */
  | { tipo: "eletronico"; nome: string; cpf: string; ip?: string | null; navegador?: string | null; em: string };

export const ROTULO_SITUACAO: Record<SituacaoDocumento, { texto: string; tom: Tom }> = {
  emitido: { texto: "Emitido, falta assinar", tom: "ambar" },
  enviado: { texto: "Link enviado ao cliente", tom: "azul" },
  assinado: { texto: "Assinado", tom: "verde" },
  cancelado: { texto: "Cancelado", tom: "vermelho" },
};

/** As variáveis que o modelo aceita, com a explicação que aparece na tela do modelo. */
export const VARIAVEIS: { chave: string; explica: string }[] = [
  { chave: "numero", explica: "Número do contrato (LIC-2026/0001)" },
  { chave: "sistema", explica: "Ledgra ou HUB-MDC (pelos módulos da licença)" },
  { chave: "contratada", explica: "Razão social, CNPJ e cidade da MDC" },
  { chave: "contratante_razao", explica: "Razão social do cliente" },
  { chave: "contratante_cnpj", explica: "CNPJ ou CPF do cliente" },
  { chave: "contratante_cidade", explica: "Cidade/UF do cliente" },
  { chave: "representante", explica: "Nome, cargo e CPF de quem assina pelo cliente" },
  { chave: "representante_email", explica: "E-mail de quem assina" },
  { chave: "modalidade", explica: "Gratuita, pacote ou completa (todos os módulos)" },
  { chave: "modulos", explica: "Lista dos módulos liberados, um por linha" },
  { chave: "valor", explica: "Frase do valor mensal (ou de licença gratuita)" },
  { chave: "dia_vencimento", explica: "Dia do vencimento da mensalidade" },
  { chave: "inicio", explica: "Data de início da licença" },
  { chave: "vigencia", explica: "Frase do prazo (indeterminado ou até a data)" },
  { chave: "reajuste", explica: "Frase do reajuste anual" },
  { chave: "proporcional", explica: "Frase do primeiro e do último mês" },
  { chave: "dias_bloqueio", explica: "Dias de atraso para suspender o acesso" },
  { chave: "assinatura", explica: "Frase de como o contrato é assinado" },
  { chave: "cidade_data", explica: "Bragança Paulista/SP, data por extenso" },
];

/** Modelo-padrão das cláusulas. Revisão jurídica recomendada antes do primeiro uso; mudanças pela tela do modelo. */
export const MODELO_PADRAO = `# Contrato de licença de uso de software · {{sistema}}

Contrato nº {{numero}}

Pelo presente instrumento particular, de um lado {{contratada}}, doravante **LICENCIANTE**, e de outro **{{contratante_razao}}**, inscrita no {{contratante_cnpj}}, com sede em {{contratante_cidade}}, neste ato representada por {{representante}}, doravante **LICENCIADA**, têm entre si justo e contratado o que segue, nos termos da Lei nº 9.609/1998 (Lei do Software), da Lei nº 9.610/1998 e do Código Civil.

## Cláusula 1ª · Objeto

A LICENCIANTE concede à LICENCIADA licença de uso, não exclusiva, intransferível e por assinatura, do sistema **{{sistema}}**, acessado pela internet (software como serviço), na modalidade {{modalidade}}, com os módulos abaixo:

{{modulos}}

A licença dá direito apenas ao uso do sistema pela internet. Não há cessão de direitos autorais, entrega de código-fonte ou transferência de tecnologia.

## Cláusula 2ª · Acesso e usuários

- O acesso é feito com usuário e senha pessoais, criados para as pessoas indicadas pela LICENCIADA, que responde pelo uso de cada acesso e pela guarda das senhas.
- É proibido ceder, sublicenciar, alugar ou permitir o uso do sistema por terceiros que não sejam empregados ou prepostos da LICENCIADA.
- É proibido copiar, descompilar, fazer engenharia reversa ou tentar acessar partes do sistema não liberadas nesta licença.

## Cláusula 3ª · Valor e pagamento

{{valor}}

- A mensalidade vence todo dia {{dia_vencimento}}. {{proporcional}}
- O pagamento é feito por boleto ou Pix emitido pela LICENCIANTE; a nota fiscal de serviço acompanha cada cobrança.
- Atraso no pagamento gera multa de 2% (dois por cento) e juros de mora de 1% (um por cento) ao mês, calculados dia a dia.

## Cláusula 4ª · Reajuste

{{reajuste}}

## Cláusula 5ª · Suspensão por falta de pagamento

Havendo mensalidade em atraso por mais de {{dias_bloqueio}} dias, a LICENCIANTE poderá suspender o acesso ao sistema após aviso à LICENCIADA, restabelecendo-o em até 1 (um) dia útil depois do pagamento. A suspensão não apaga os dados da LICENCIADA.

## Cláusula 6ª · Suporte e funcionamento (validade técnica)

- Durante toda a vigência deste contrato a LICENCIADA usa sempre a versão em vigor do sistema, que é o seu prazo de validade técnica (Lei nº 9.609/1998, arts. 7º e 8º).
- A LICENCIANTE presta suporte técnico em dias úteis, das 8h às 18h, pelos canais informados no próprio sistema, e corrige os defeitos que impeçam o uso normal dos módulos contratados.
- A LICENCIANTE pode melhorar o sistema e mudar telas ou funções, mantendo as finalidades dos módulos contratados.
- Paradas programadas para manutenção serão avisadas, sempre que possível, com antecedência e feitas em horário de menor uso.

## Cláusula 7ª · Responsabilidades

- A LICENCIADA responde pela exatidão dos dados que lança no sistema e pelas decisões que toma com base neles.
- A LICENCIANTE não responde por falhas da internet, de equipamentos da LICENCIADA ou de serviços de terceiros fora do seu controle, nem por lucros cessantes.
- A responsabilidade da LICENCIANTE, em qualquer caso, fica limitada ao valor pago pela LICENCIADA nos 12 (doze) meses anteriores ao fato.

## Cláusula 8ª · Proteção de dados pessoais (LGPD)

- Em relação aos dados pessoais que a LICENCIADA lança no sistema, a LICENCIADA é a controladora e a LICENCIANTE é a operadora, tratando-os só para prestar o serviço contratado e segundo as instruções da LICENCIADA (Lei nº 13.709/2018, art. 39).
- A LICENCIANTE mantém medidas de segurança técnicas e administrativas aptas a proteger os dados (art. 46), com acesso restrito, cópias de segurança e registro das operações.
- A LICENCIANTE comunicará à LICENCIADA, em até 2 (dois) dias úteis da ciência, qualquer incidente de segurança que envolva os dados dela, para que a LICENCIADA, como controladora, cumpra o art. 48 da LGPD.
- Os dados ficam guardados em servidores de provedor de nuvem contratado pela LICENCIANTE, que pode estar fora do Brasil, com as garantias da LGPD.

## Cláusula 9ª · Sigilo e propriedade dos dados

Os dados lançados pela LICENCIADA pertencem a ela. As partes mantêm em sigilo as informações a que tiverem acesso por este contrato, mesmo depois do seu fim. O sistema, sua marca, telas e código pertencem à LICENCIANTE.

## Cláusula 10ª · Vigência e encerramento

- Este contrato começa em {{inicio}} e vale {{vigencia}}
- Qualquer das partes pode encerrá-lo por aviso escrito com 30 (trinta) dias de antecedência, sem multa, pagando-se as mensalidades até o fim do aviso.
- Encerrado o contrato, a LICENCIADA terá 30 (trinta) dias para exportar os seus dados em planilha ou PDF pelas próprias telas do sistema. Depois desse prazo a LICENCIANTE poderá excluí-los, guardando apenas o que a lei obrigar.

## Cláusula 11ª · Assinatura

{{assinatura}}

## Cláusula 12ª · Foro

Fica eleito o foro da Comarca de Bragança Paulista/SP para resolver qualquer questão deste contrato.

E, por estarem de acordo, as partes assinam este contrato.

{{cidade_data}}`;

const MODALIDADE: Record<Contrato["modalidade"], string> = {
  gratuita: "gratuita",
  pacote: "pacote (módulos escolhidos)",
  full: "completa (todos os módulos do sistema)",
};

const INDICE: Record<Contrato["reajuste_indice"], string> = {
  IPCA: "IPCA/IBGE",
  "IGP-M": "IGP-M/FGV",
  INPC: "INPC/IBGE",
  fixo: "",
  nenhum: "",
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface DadosContratoLicenca {
  numero: string;
  contrato: Pick<
    Contrato,
    | "modalidade"
    | "plano_id"
    | "produtos"
    | "valor_mensal"
    | "valor_tabela"
    | "dia_vencimento"
    | "inicio"
    | "fim"
    | "proporcional"
    | "reajuste_indice"
    | "reajuste_mes"
  >;
  cliente: { razao_social: string; cnpj: string | null; cidade: string | null; uf: string | null };
  produtos: Map<string, Pick<Produto, "nome" | "descricao" | "sistema">>;
  plano?: Pick<Plano, "nome"> | null;
  signatario: Signatario;
  modo: ModoAssinatura;
  diasBloqueio: number;
  /** Data da emissão (AAAA-MM-DD). */
  hoje: string;
}

/** Ledgra, HUB-MDC ou os dois, pelos módulos da licença. */
export function sistemaDaLicenca(ids: string[], produtos: DadosContratoLicenca["produtos"]): string {
  const sis = new Set(ids.map((id) => produtos.get(id)?.sistema ?? "hub"));
  if (sis.has("ledgra") && sis.has("hub")) return "Ledgra e HUB-MDC";
  return sis.has("ledgra") ? "Ledgra" : "HUB-MDC";
}

const doc = (d: string | null | undefined) => {
  const n = soDigitos(d);
  if (!n) return "CNPJ ______________________";
  return `${n.length === 11 ? "CPF" : "CNPJ"} ${formatarDocumento(n)}`;
};

/** Valores de cada variável do modelo para uma licença. */
export function valoresDoContrato(d: DadosContratoLicenca): Record<string, string> {
  const k = d.contrato;
  const mdc = IDENTIDADE_MDC;
  const s = d.signatario;
  const modulos = k.produtos
    .map((id) => d.produtos.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => `- **${p.nome}**${p.descricao.trim() ? `: ${p.descricao.trim().replace(/\.$/, "")}` : ""}.`);
  const gratuita = k.modalidade === "gratuita" || k.valor_mensal <= 0;
  const desconto =
    !gratuita && k.valor_tabela > k.valor_mensal
      ? ` O valor de tabela é ${brl(k.valor_tabela)}; o desconto concedido vale enquanto este contrato estiver em vigor.`
      : "";
  const valor = gratuita
    ? "A licença é concedida sem custo mensal. A LICENCIANTE poderá passar a cobrá-la mediante aviso escrito com 30 (trinta) dias de antecedência, cabendo à LICENCIADA aceitar o novo valor ou encerrar o contrato sem multa."
    : `Pela licença, a LICENCIADA pagará à LICENCIANTE **${brl(k.valor_mensal)}** por mês${d.plano ? ` (plano ${d.plano.nome})` : ""}.${desconto}`;
  const reajuste =
    gratuita || k.reajuste_indice === "nenhum"
      ? "O valor não tem reajuste automático; eventual mudança será combinada por escrito entre as partes."
      : k.reajuste_indice === "fixo"
        ? `O valor será revisto uma vez por ano${k.reajuste_mes ? `, em ${MESES[k.reajuste_mes - 1]}` : ""}, no percentual combinado entre as partes e informado por escrito com 30 (trinta) dias de antecedência.`
        : `O valor será reajustado uma vez por ano${k.reajuste_mes ? `, em ${MESES[k.reajuste_mes - 1]}` : ", no aniversário do contrato"}, pela variação acumulada do ${INDICE[k.reajuste_indice]} dos 12 (doze) meses anteriores. Se o índice deixar de existir, usa-se o que o substituir oficialmente.`;
  const assinatura =
    d.modo === "eletronico"
      ? "As partes aceitam a assinatura deste contrato em meio eletrônico, pelo link enviado pela LICENCIANTE, com identificação do signatário por nome e CPF e registro de data, hora, endereço IP e código de integridade do documento, como meio válido de comprovação da autoria e da integridade (Medida Provisória nº 2.200-2/2001, art. 10, § 2º)."
      : "Este contrato é assinado em 2 (duas) vias de igual teor. As partes aceitam também a sua assinatura digital ou eletrônica, por qualquer meio que comprove a autoria e a integridade do documento (Medida Provisória nº 2.200-2/2001, art. 10, § 2º).";
  return {
    numero: d.numero || "____________",
    sistema: sistemaDaLicenca(k.produtos, d.produtos),
    contratada: `**${mdc.razaoSocial.toUpperCase()}**, inscrita no CNPJ ${mdc.cnpj}, com sede em ${mdc.cidadeUf}`,
    contratante_razao: d.cliente.razao_social.trim().toUpperCase() || "______________________",
    contratante_cnpj: doc(d.cliente.cnpj),
    contratante_cidade: [d.cliente.cidade?.trim(), d.cliente.uf?.trim()].filter(Boolean).join("/") || "______________________",
    representante: [
      s.cargo.trim() ? `seu(sua) ${s.cargo.trim()}` : "",
      `**${s.nome.trim() || "______________________"}**`,
      soDigitos(s.cpf) ? `CPF ${formatarDocumento(soDigitos(s.cpf))}` : "CPF ______________",
    ]
      .filter(Boolean)
      .join(", "),
    representante_email: s.email.trim() || "______________________",
    modalidade: MODALIDADE[k.modalidade] ?? k.modalidade,
    modulos: modulos.length ? modulos.join("\n") : "- ______________________",
    valor,
    dia_vencimento: String(k.dia_vencimento),
    inicio: fmtData(k.inicio),
    vigencia: k.fim ? `até ${fmtData(k.fim)}, podendo ser renovado por escrito.` : "por prazo indeterminado.",
    reajuste,
    proporcional: k.proporcional
      ? "O primeiro e o último mês são cobrados proporcionalmente aos dias de uso."
      : "O primeiro e o último mês são cobrados inteiros.",
    dias_bloqueio: String(d.diasBloqueio),
    assinatura,
    cidade_data: `${mdc.cidadeUf}, ${dataPorExtenso(d.hoje)}.`,
  };
}

const RE_VAR = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Troca as variáveis do modelo pelos valores; variável desconhecida fica como está (a tela avisa). */
export function preencher(modelo: string, valores: Record<string, string>): string {
  return modelo.replace(RE_VAR, (todo, chave: string) => (chave in valores ? valores[chave] : todo));
}

/** Variáveis escritas no modelo que o HUB não conhece (erro de digitação, por exemplo). */
export function variaveisDesconhecidas(modelo: string): string[] {
  const conhecidas = new Set(VARIAVEIS.map((v) => v.chave));
  const achadas = [...modelo.matchAll(RE_VAR)].map((m) => m[1]);
  return [...new Set(achadas.filter((c) => !conhecidas.has(c)))];
}

/** Confere o modelo antes de gravar; devolve o problema ou null. */
export function conferirModelo(modelo: string): string | null {
  if (modelo.trim().length < 200) return "O modelo está curto demais. Confira se o texto inteiro foi colado.";
  const erradas = variaveisDesconhecidas(modelo);
  if (erradas.length) return `Variável que o HUB não conhece: ${erradas.map((c) => `{{${c}}}`).join(", ")}. Confira a escrita.`;
  if (!/\{\{\s*contratante_razao\s*\}\}/.test(modelo)) return "O modelo precisa ter {{contratante_razao}} (o nome do cliente).";
  return null;
}

/** Confere quem assina antes de emitir; devolve o problema ou null. */
export function conferirSignatario(s: Signatario, modo: ModoAssinatura): string | null {
  if (s.nome.trim().split(/\s+/).length < 2) return "Preencha o nome completo de quem vai assinar pelo cliente.";
  if (!cpfValido(s.cpf)) return "Preencha o CPF de quem vai assinar (CPF válido).";
  if (modo === "eletronico" && s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()))
    return "O e-mail de quem assina está incompleto.";
  return null;
}

/**
 * Texto do registro da assinatura eletrônica que vai no fim do PDF assinado: quem, quando, de onde e o código de
 * integridade do texto (SHA-256), para qualquer pessoa conferir que o contrato não mudou.
 */
export function textoRegistroAssinatura(doc: Pick<DocumentoLicenca, "numero" | "hash" | "assinatura" | "assinado_em">): string {
  const a = doc.assinatura;
  if (!a) return "";
  if (a.tipo === "impresso")
    return [
      "## Registro da assinatura",
      `Contrato assinado em papel (ou por outro meio) em ${fmtData(a.data)}, conforme registrado no HUB-MDC.${a.observacao?.trim() ? ` Observação: ${a.observacao.trim()}` : ""}`,
      "Código de integridade do texto (SHA-256):",
      doc.hash,
    ].join("\n");
  const quando = new Date(a.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    "## Registro da assinatura eletrônica",
    `- Contrato: ${doc.numero}`,
    `- Assinado por: ${a.nome}, CPF ${a.cpf.includes("*") ? a.cpf : formatarDocumento(soDigitos(a.cpf))}`,
    `- Data e hora (Brasília): ${quando}`,
    ...(a.ip === undefined && a.navegador === undefined
      ? ["- Endereço IP e navegador: guardados no registro da LICENCIANTE"]
      : [`- Endereço IP: ${a.ip || "não informado"}`, `- Navegador: ${(a.navegador || "não informado").slice(0, 160)}`]),
    "Código de integridade do texto (SHA-256):",
    doc.hash,
    "Assinatura feita pelo link enviado pela LICENCIANTE, após a leitura do contrato e a marcação de concordância, nos termos da Cláusula 11ª.",
  ].join("\n");
}

/** Filtro da lista de licenças pela situação do contrato escrito. */
export type FiltroContrato = "todos" | "sem" | "falta" | "assinado";

export const FILTROS_CONTRATO: { id: FiltroContrato; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "sem", nome: "Sem contrato" },
  { id: "falta", nome: "Falta assinar" },
  { id: "assinado", nome: "Assinado" },
];

/** A licença entra no filtro? `doc` é o contrato ativo da licença (sem cancelado), ou nada. */
export function noFiltroContrato(doc: Pick<DocumentoLicenca, "situacao"> | undefined, f: FiltroContrato): boolean {
  if (f === "todos") return true;
  if (f === "sem") return !doc;
  if (f === "assinado") return doc?.situacao === "assinado";
  return doc?.situacao === "emitido" || doc?.situacao === "enviado";
}

/** Texto do contrato para o Excel/PDF da lista: "LIC-2026/0001 · Assinado" ou "Sem contrato". */
export const textoContratoLista = (doc: Pick<DocumentoLicenca, "numero" | "situacao"> | undefined) =>
  doc ? `${doc.numero} · ${ROTULO_SITUACAO[doc.situacao].texto}` : "Sem contrato";
