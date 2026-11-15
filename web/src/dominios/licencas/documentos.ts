// Leituras e gravações do contrato de licença (085): modelo de cláusulas da organização (com versões) e o contrato
// emitido de cada licença. Toda gravação passa pelas funções do banco (permissão, número, código de integridade e
// auditoria lá); o PDF é montado no navegador com o mesmo gerador do contrato do Comercial.
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { carregarLogo } from "@/lib/marca";
import { BASE } from "@/lib/caminho";
import { gerarContratoPdf } from "@/dominios/comercial/contratoPdf";
import { formatarDocumento, soDigitos } from "@/lib/documento";
import { MODELO_PADRAO, textoRegistroAssinatura, type DocumentoLicenca, type ModoAssinatura, type Signatario } from "./contratoLicenca";

const rpc = async <T>(nome: string, args: Record<string, unknown>) => exigir(await supabase().rpc(nome, args)) as T;

const COLUNAS =
  "id,org_id,contrato_id,numero,modelo_versao,texto,hash,signatario,modo,situacao,emitido_em,link_expira_em,assinado_em,assinatura,cancelado_em,cancelado_motivo";

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

export const registrarAssinatura = (doc: string, data: string, observacao: string | null) =>
  rpc<null>("lic_documento_assinatura_registrar", { p_doc: doc, p_data: data, p_observacao: observacao });

export const cancelarDocumento = (doc: string, motivo: string) => rpc<null>("lic_documento_cancelar", { p_doc: doc, p_motivo: motivo });

/** Endereço público do link de assinatura (o token só existe na hora em que é gerado). */
export const enderecoAssinatura = (origem: string, token: string) => `${origem}${BASE}/assinar/${token}`;

/** Mensagem pronta para o WhatsApp com o link de assinatura. */
export function mensagemAssinatura(nome: string, numero: string, link: string, saudacao: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return `${saudacao}${primeiro ? `, ${primeiro}` : ""}! Segue o contrato de licença nº ${numero} da MDC Assessoria para assinatura. É só abrir o link, ler o contrato e confirmar com o seu CPF:\n${link}\nO link vale por 15 dias. Qualquer dúvida, estou à disposição.`;
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
