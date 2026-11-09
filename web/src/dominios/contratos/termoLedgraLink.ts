// Modelo do termo de autorização do Ledgra Link (Contratos › Ledgra Link, passo 1): o texto que a empresa titular
// assina autorizando a MDC a usar as contas bancárias dela pela API do banco. Montado com os dados já preenchidos
// (empresa, CNPJ, representante, contas e o que foi marcado); o que faltar sai em branco ("____") para preencher à mão.
// O PDF sai no papel timbrado da MDC pelo mesmo gerador do contrato (comercial/contratoPdf.ts). Testado em
// termoLedgraLink.test.ts. Texto revisável pelo jurídico: mude só aqui.
import { IDENTIDADE_MDC } from "@/lib/identidade";
import { cpfValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { ESCOPOS, nomeBanco, type ContaLink, type Escopo } from "./ledgraLinkCadastro";

const BRANCO = "______________________________";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "9 de novembro de 2026" a partir de AAAA-MM-DD; vazio vira linha para preencher. */
export function dataPorExtenso(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return "____ de ______________ de ______";
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/** "CNPJ 33.509.782/0001-48" ou "CPF …"; sem documento, a linha em branco. */
const documento = (doc: string | null | undefined, rotulo = "CNPJ") => {
  const d = soDigitos(doc);
  if (!d) return `${rotulo} ${BRANCO}`;
  return `${d.length === 11 ? "CPF" : "CNPJ"} ${formatarDocumento(d)}`;
};

export interface DadosTermo {
  empresa: { razao_social: string; documento: string };
  representante: { nome: string; cpf: string; cargo?: string };
  escopos: Escopo[];
  contas: Pick<ContaLink, "codigo_compe" | "agencia" | "conta" | "conta_dv">[];
  /** Data da assinatura (AAAA-MM-DD); vazia sai em branco. */
  data: string;
  /** Validade (AAAA-MM-DD); vazia = prazo indeterminado. */
  vigente_ate: string;
}

const PALAVRA_ESCOPO: Record<Escopo, string> = {
  cobranca: "emitir, consultar, alterar e baixar boletos e demais cobranças em nome da AUTORIZANTE",
  pix: "gerar cobranças Pix (imediatas e com vencimento) e consultar os Pix recebidos",
  extrato: "consultar saldos e extratos, inclusive para a conciliação e a baixa automática dos recebimentos",
  pagamento:
    "preparar pagamentos (boletos, tributos, transferências e Pix), que só serão enviados ao banco depois da aprovação expressa da AUTORIZANTE para cada pagamento ou lote",
};

/** Baixa o termo em PDF no papel timbrado da MDC, pronto para assinar (gerador do contrato, com AUTORIZANTE/AUTORIZADA). */
export async function baixarTermoPdf(d: DadosTermo, logoUrl: string | null | undefined) {
  const [{ gerarContratoPdf }, { carregarLogo }, { baixarBytes }, { nomeArquivo }] = await Promise.all([
    import("@/dominios/comercial/contratoPdf"),
    import("@/lib/marca"),
    import("@/lib/arquivos/baixar"),
    import("@/lib/arquivos/exportarLista"),
  ]);
  const empresa = d.empresa.razao_social.trim().toUpperCase();
  const bytes = await gerarContratoPdf({
    texto: textoTermo(d),
    numero: "",
    cabecalho: "Termo de autorização · Ledgra Link",
    tituloArquivo: `Termo de autorização Ledgra Link — ${empresa}`,
    rotulos: { parte: "AUTORIZANTE", mdc: "AUTORIZADA" },
    contratante: {
      nome: empresa,
      documento: d.empresa.documento,
      representante:
        [d.representante.nome.trim(), d.representante.cargo?.trim()].filter(Boolean).join(" · ") ||
        "Representante: ______________________",
    },
    logo: await carregarLogo(logoUrl),
  });
  baixarBytes(bytes, `${nomeArquivo("Termo de autorizacao Ledgra Link", empresa.split(" ").slice(0, 3).join(" "))}.pdf`);
}

/** Confere se o termo vai sair todo preenchido (nada de linha em branco); devolve o que falta ou null. */
export function conferirModeloTermo(d: DadosTermo): string | null {
  if (d.representante.nome.trim().length < 3) return "Preencha o nome de quem vai assinar pela empresa.";
  if (!cpfValido(d.representante.cpf)) return "Preencha o CPF de quem vai assinar (CPF válido).";
  if (!d.escopos.length) return "Marque pelo menos uma coisa que a MDC pode fazer nas contas.";
  if (!d.contas.length) return "Informe pelo menos uma conta (banco, agência e conta).";
  for (const [k, c] of d.contas.entries()) {
    const n = d.contas.length > 1 ? ` da ${k + 1}ª conta` : " da conta";
    if (!/^\d{3}$/.test(c.codigo_compe)) return `Escolha o banco${n}.`;
    if (!/^\d{1,5}$/.test(c.agencia.trim())) return `Agência${n}: só números, até 5 dígitos, sem o dígito.`;
    if (!/^\d{1,13}$/.test(c.conta.trim())) return `Número${n}: só números, sem o dígito (o dígito vai no campo ao lado).`;
  }
  return null;
}

/** Texto do termo em markdown simples (# título, ## cláusula, - item, **negrito**), pronto para o gerador de PDF. */
export function textoTermo(d: DadosTermo): string {
  const empresa = d.empresa.razao_social.trim().toUpperCase() || BRANCO;
  const rep = d.representante.nome.trim() || BRANCO;
  const cargo = d.representante.cargo?.trim();
  const cpfRep = documento(d.representante.cpf, "CPF");
  const mdc = IDENTIDADE_MDC;

  const contas = d.contas.length
    ? d.contas.map(
        (c) =>
          `- Banco ${c.codigo_compe} (${nomeBanco(c.codigo_compe)}) · Agência ${c.agencia} · Conta ${c.conta}${c.conta_dv ? `-${c.conta_dv}` : ""}`,
      )
    : [1, 2].map(() => "- Banco ______________________ · Agência __________ · Conta ____________________");

  const escopos = ESCOPOS.map((e) => `- ( ${d.escopos.includes(e.id) ? "X" : "  "} ) **${e.nome}:** ${PALAVRA_ESCOPO[e.id]}.`);

  const vigencia = d.vigente_ate
    ? `Este termo vale da data da assinatura até ${dataPorExtenso(d.vigente_ate)}, podendo ser renovado por novo termo.`
    : "Este termo vale da data da assinatura por prazo indeterminado.";

  return [
    "# Termo de autorização de acesso a contas bancárias",
    `Pelo presente termo, **${empresa}**, inscrita no ${documento(d.empresa.documento)}, neste ato representada por ${cargo ? `seu(sua) ${cargo}, ` : ""}**${rep}**, ${cpfRep}, doravante **AUTORIZANTE**, autoriza a **${mdc.razaoSocial.toUpperCase()}**, inscrita no CNPJ ${mdc.cnpj}, com sede em ${mdc.cidadeUf}, doravante **AUTORIZADA**, a acessar as contas bancárias abaixo pela interface oficial de programação (API) dos bancos, por meio da plataforma Ledgra Link, nas condições a seguir.`,
    "## Cláusula 1ª · Contas abrangidas",
    ...contas,
    "Ficam abrangidas também outras contas de titularidade da AUTORIZANTE que ela vier a informar por escrito à AUTORIZADA.",
    "## Cláusula 2ª · O que fica autorizado",
    "A AUTORIZADA poderá, somente nos itens marcados com X:",
    ...escopos,
    "Qualquer operação fora dos itens marcados depende de novo termo.",
    "## Cláusula 3ª · Forma de acesso",
    "O acesso se dá exclusivamente pela API oficial de cada banco, com as credenciais (Client ID e Client Secret) que a própria AUTORIZANTE gera no portal do banco e com o certificado digital dela, entregues à AUTORIZADA somente para as finalidades deste termo. As credenciais, o certificado e a senha ficam guardados cifrados no cofre do Ledgra Link, não são repassados a terceiros e não dão à AUTORIZADA acesso ao internet banking nem às senhas pessoais da AUTORIZANTE.",
    "## Cláusula 4ª · Proteção de dados e sigilo",
    "O tratamento de dados pessoais (de pagadores, recebedores e extratos) se limita ao necessário para os serviços contratados, com base na execução de contrato (art. 7º, V, da Lei 13.709/2018 · LGPD), atuando a AUTORIZADA como operadora dos dados da AUTORIZANTE. A AUTORIZADA mantém o sigilo das operações bancárias, nos termos da Lei Complementar 105/2001.",
    "## Cláusula 5ª · Obrigações da AUTORIZADA",
    "- Executar somente as operações autorizadas na Cláusula 2ª.",
    "- Registrar cada operação em trilha de auditoria (quem fez, o quê e quando) e apresentá-la à AUTORIZANTE quando solicitado.",
    "- Comunicar à AUTORIZANTE, em até 3 (três) dias úteis da ciência, qualquer incidente de segurança que envolva as contas ou os dados dela.",
    "- Bloquear o acesso assim que receber a revogação deste termo.",
    "## Cláusula 6ª · Obrigações da AUTORIZANTE",
    "- Manter válidos o certificado digital e as credenciais do banco, informando a AUTORIZADA quando forem trocados.",
    "- Comunicar por escrito a troca do representante legal, o encerramento de conta ou qualquer suspeita de uso indevido.",
    "## Cláusula 7ª · Vigência e revogação",
    `${vigencia} A AUTORIZANTE pode revogá-lo a qualquer momento, por escrito; a partir da revogação a AUTORIZADA não fará novas operações, permanecendo válidas as já realizadas dentro do escopo autorizado.`,
    "## Cláusula 8ª · Foro",
    `Fica eleito o foro da comarca de ${mdc.cidadeUf} para dirimir questões deste termo.`,
    "E, por estarem de acordo, as partes assinam este termo, preferencialmente com certificado digital ICP-Brasil.",
    `${mdc.cidadeUf.split("/")[0]}, ${dataPorExtenso(d.data)}.`,
  ].join("\n");
}
