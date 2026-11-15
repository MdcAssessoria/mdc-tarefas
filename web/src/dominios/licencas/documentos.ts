// Leituras e gravações do contrato de licença (085): modelo de cláusulas da organização (com versões) e o contrato
// emitido de cada licença. Toda gravação passa pelas funções do banco (permissão, número, código de integridade e
// auditoria lá); o PDF é montado no navegador com o mesmo gerador do contrato do Comercial.
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { carregarLogo } from "@/lib/marca";
import { BASE } from "@/lib/caminho";
import { abrirArquivo, enviarArquivo } from "@/lib/arquivos/armazenamento";
import { gerarContratoPdf } from "@/dominios/comercial/contratoPdf";
import { formatarDocumento, soDigitos } from "@/lib/documento";
import { MODELO_PADRAO, textoRegistroAssinatura, type DocumentoLicenca, type ModoAssinatura, type Signatario } from "./contratoLicenca";

const rpc = async <T>(nome: string, args: Record<string, unknown>) => exigir(await supabase().rpc(nome, args)) as T;

const COLUNAS =
  "id,org_id,contrato_id,numero,modelo_versao,texto,hash,signatario,modo,situacao,emitido_em,link_expira_em,assinado_em,assinatura,cancelado_em,cancelado_motivo,arquivo_id";

export interface ModeloContrato {
  texto: string;
  versao: number;
  atualizado_em: string | null;
  padrao: boolean;
}

/** Modelo da organização; sem modelo gravado, o modelo-padrão do HUB (versão 0). */
export async function lerModelo(org: string): Promise<ModeloContrato> {
  const { data, error } = await supabase().from("lic_contrato_modelo").select("texto,versao,atualizado_em").eq("org_id", org).maybeSingle();
  if (error) throw error;
  const m = data as { texto: string; versao: number; atualizado_em: string } | null;
  return m ? { ...m, padrao: false } : { texto: MODELO_PADRAO, versao: 0, atualizado_em: null, padrao: true };
}

export async function lerVersoesModelo(org: string) {
  const { data, error } = await supabase()
    .from("lic_contrato_modelo_versoes")
    .select("versao,texto,em")
    .eq("org_id", org)
    .order("versao", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as { versao: number; texto: string; em: string }[];
}

/** Contratos emitidos de uma licença, do mais novo para o mais antigo (o ativo primeiro). */
export async function lerDocumentos(contrato: string): Promise<DocumentoLicenca[]> {
  const { data, error } = await supabase()
    .from("lic_contrato_documentos")
    .select(COLUNAS)
    .eq("contrato_id", contrato)
    .order("emitido_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DocumentoLicenca[];
}

/** Situação do contrato de cada licença da organização (para a coluna da lista). */
export async function lerSituacoesDocumentos(org: string): Promise<Map<string, Pick<DocumentoLicenca, "numero" | "situacao">>> {
  const { data, error } = await supabase()
    .from("lic_contrato_documentos")
    .select("contrato_id,numero,situacao")
    .eq("org_id", org)
    .neq("situacao", "cancelado")
    .limit(1000);
  if (error) throw error;
  return new Map(
    ((data ?? []) as { contrato_id: string; numero: string; situacao: DocumentoLicenca["situacao"] }[]).map((d) => [d.contrato_id, d]),
  );
}

export const salvarModelo = (org: string, texto: string) => rpc<number>("lic_contrato_modelo_salvar", { p_org: org, p_texto: texto });

export const emitirDocumento = (contrato: string, texto: string, modeloVersao: number, signatario: Signatario, modo: ModoAssinatura) =>
  rpc<{ id: string; numero: string }>("lic_documento_emitir", {
    p_contrato: contrato,
    p_texto: texto,
    p_modelo_versao: modeloVersao,
    p_signatario: signatario,
    p_modo: modo,
  });

export const gerarLink = (doc: string) => rpc<string>("lic_documento_link", { p_doc: doc });

export const registrarAssinatura = (doc: string, data: string, observacao: string | null, arquivo: string | null = null) =>
  rpc<null>("lic_documento_assinatura_registrar", { p_doc: doc, p_data: data, p_observacao: observacao, p_arquivo: arquivo });

/** Envia o contrato assinado (PDF ou foto) para a pasta protegida do contrato e devolve o id do arquivo. */
export async function enviarContratoAssinado(org: string, doc: string, cliente: string, arquivo: File): Promise<string> {
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("O arquivo passou de 15 MB. Escaneie em resolução menor ou envie em PDF.");
  if (!/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(arquivo.type) && !/\.(pdf|jpe?g|png|webp|heic)$/i.test(arquivo.name))
    throw new Error("Envie o contrato em PDF ou foto (JPG ou PNG).");
  const a = await enviarArquivo(arquivo, { org, app: "licencas-contrato", ref: doc, cliente });
  return a.id;
}

export const anexarAssinado = (doc: string, arquivo: string) => rpc<null>("lic_documento_anexar", { p_doc: doc, p_arquivo: arquivo });

/** Abre o contrato assinado guardado (link temporário). */
export async function abrirContratoAssinado(arquivo: string) {
  const { data, error } = await supabase().from("hub_arquivos").select("caminho,nome").eq("id", arquivo).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Não encontrei o arquivo do contrato assinado.");
  await abrirArquivo((data as { caminho: string }).caminho, (data as { nome: string }).nome);
}

export const cancelarDocumento = (doc: string, motivo: string) => rpc<null>("lic_documento_cancelar", { p_doc: doc, p_motivo: motivo });

/** Endereço público do link de assinatura (o token só existe na hora em que é gerado). */
export const enderecoAssinatura = (origem: string, token: string) => `${origem}${BASE}/assinar/${token}`;

/** Mensagem pronta para o WhatsApp com o link de assinatura. */
export function mensagemAssinatura(nome: string, numero: string, link: string, saudacao: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return `${saudacao}${primeiro ? `, ${primeiro}` : ""}! Segue o contrato de licença nº ${numero} da MDC Assessoria para assinatura. É só abrir o link, ler o contrato e confirmar com o seu CPF:\n${link}\nO link vale por 15 dias. Qualquer dúvida, estou à disposição.`;
}

/**
 * E-mail com o link de assinatura, aberto no programa de e-mail de quem está no HUB (mailto). O HUB ainda não manda
 * e-mail sozinho (faltam os segredos do Microsoft 365, docs/07 seção 7.7); assim sai da caixa da própria pessoa.
 */
export function emailAssinatura(p: {
  para: string;
  nome: string;
  numero: string;
  cliente: string;
  link: string;
  validoAte: string;
  saudacao: string;
}) {
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? "";
  const assunto = `Contrato de licença ${p.numero} para assinatura · MDC Assessoria`;
  const corpo = [
    `${p.saudacao}${primeiro ? `, ${primeiro}` : ""}!`,
    "",
    `Segue o contrato de licença nº ${p.numero} de ${p.cliente} para assinatura eletrônica.`,
    "",
    "É só abrir o link abaixo, ler o contrato e confirmar com o seu nome completo e CPF:",
    p.link,
    "",
    `O link vale até ${p.validoAte}. Depois de assinar, você pode baixar o contrato assinado em PDF na mesma página.`,
    "",
    "Qualquer dúvida, estou à disposição.",
  ].join("\n");
  return `mailto:${encodeURIComponent(p.para.trim())}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/** PDF do contrato: minuta (antes de emitir), emitido ou assinado (com o registro da assinatura no fim). */
export async function baixarContratoLicenca(p: {
  texto: string;
  numero: string;
  cliente: { razao_social: string; cnpj: string | null };
  signatario: Signatario;
  logo: string | Uint8Array | null;
  minuta?: boolean;
  documento?: Pick<DocumentoLicenca, "numero" | "hash" | "assinatura" | "assinado_em" | "situacao">;
}) {
  const registro = p.documento?.situacao === "assinado" ? textoRegistroAssinatura(p.documento) : "";
  const s = p.signatario;
  const bytes = await gerarContratoPdf({
    texto: registro ? `${p.texto}\n\n${registro}` : p.texto,
    numero: p.numero,
    cabecalho: `Contrato de licença nº ${p.numero}`,
    rotulos: { parte: "LICENCIADA", mdc: "LICENCIANTE" },
    contratante: {
      nome: p.cliente.razao_social,
      documento: p.cliente.cnpj ?? undefined,
      // nome e CPF (o cargo já está no texto): cabe na linha da assinatura
      representante: [s.nome.trim(), soDigitos(s.cpf) ? `CPF ${formatarDocumento(soDigitos(s.cpf))}` : ""].filter(Boolean).join(" · "),
    },
    logo: typeof p.logo === "string" || p.logo === null ? await carregarLogo(p.logo) : p.logo,
    rascunho: !!p.minuta,
    tituloArquivo: `Contrato de licença ${p.numero} — ${p.cliente.razao_social}`,
  });
  baixarBytes(
    bytes,
    `${nomeArquivo("Contrato de licenca", p.numero.replace("/", "-"), p.cliente.razao_social.split(" ").slice(0, 2).join(" "))}.pdf`,
  );
}

/** O que a página pública do link recebe do banco (lic_assinatura_abrir). */
export interface ContratoParaAssinar {
  situacao: "invalido" | "expirado" | "travado" | "emitido" | "enviado" | "assinado" | "cancelado";
  numero?: string;
  cliente?: string;
  texto?: string;
  hash?: string;
  signatario?: string;
  cpf_final?: string;
  assinado_em?: string | null;
  assinatura?: DocumentoLicenca["assinatura"];
}

export const abrirParaAssinar = (token: string) => rpc<ContratoParaAssinar>("lic_assinatura_abrir", { p_token: token });

export const assinarPeloLink = (token: string, nome: string, cpf: string, concordo: boolean) =>
  rpc<{ ok: boolean; erro?: string; restam?: number; numero?: string }>("lic_assinatura_aceitar", {
    p_token: token,
    p_nome: nome,
    p_cpf: cpf,
    p_concordo: concordo,
  });
