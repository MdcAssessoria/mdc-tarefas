// Gravações das notas fiscais. O que fala com a SEFAZ/ADN (certificado, captura, manifestação) vai pelas Funções Edge;
// o resto por funções do banco (tudo ou nada, permissão conferida lá).
import { supabase } from "@/lib/supabase";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { exigir } from "@/lib/exigir";
import type { Json } from "@/lib/database.types";
import { lerVariasNotas } from "./documentos";
import type { NotaLida } from "./documentos";
import type { CodigoManifestacao } from "./sefaz";

export async function enviarCertificado(cliente: string, arquivo: File, senha: string) {
  const fd = new FormData();
  fd.append("cliente", cliente);
  fd.append("arquivo", arquivo);
  fd.append("senha", senha);
  return chamarFuncao<{ ok: boolean; aviso: string | null }>("fiscal-certificado", { form: fd });
}

export const removerCertificado = (cliente: string) =>
  chamarFuncao<{ ok: boolean }>("fiscal-certificado", { metodo: "DELETE", busca: { cliente } });

export interface ResultadoBusca {
  resultados: { fonte: string; documentos: number; ciencias?: number; erro?: string | null }[];
  mensagem?: string;
}
export const buscarAgora = (cliente: string) => chamarFuncao<ResultadoBusca>("fiscal-captura", { corpo: { cliente } });

export interface ResultadoManifestar {
  resultados: { nota: string; aceito: boolean; cStat: string; motivo: string; protocolo: string | null }[];
  recusadas: { nota: string; motivo: string }[];
}
export const manifestar = (cliente: string, notas: string[], tipo: CodigoManifestacao, justificativa?: string) =>
  chamarFuncao<ResultadoManifestar>("fiscal-manifestar", { corpo: { cliente, notas, tipo, justificativa } });

/**
 * XML avulso: lê no navegador (mesmo leitor da captura), guarda o arquivo no Storage em <org>/<cliente>/upload/AAAA/MM/
 * e registra a nota. Um arquivo pode trazer várias NFS-e (lote da prefeitura).
 */
export async function enviarXml(org: string, cliente: string, arquivo: File): Promise<{ enviadas: number; erros: string[] }> {
  const texto = await arquivo.text();
  const notas = lerVariasNotas(texto);
  const erros: string[] = [];
  let enviadas = 0;
  const mes = new Date().toISOString().slice(0, 7).replace("-", "/");
  for (const n of notas) {
    const caminho = `${org}/${cliente}/upload/${mes}/${n.chave}-${Date.now()}.xml`;
    const up = await supabase()
      .storage.from("fiscal")
      .upload(caminho, new Blob([texto], { type: "application/xml" }), { contentType: "application/xml" });
    if (up.error) {
      erros.push(`${n.numero ?? n.chave}: não foi possível guardar o arquivo (${up.error.message}).`);
      continue;
    }
    const { error } = await supabase().rpc("fis_registrar_upload", { p: { cliente, caminho, nota: n as unknown as Json } });
    if (error) erros.push(`Nota ${n.numero ?? ""}: ${error.message}`);
    else enviadas++;
  }
  return { enviadas, erros };
}

/** Prévia do XML antes de enviar (para mostrar na tela o que foi lido). */
export async function lerXmlDoArquivo(arquivo: File): Promise<NotaLida[]> {
  return lerVariasNotas(await arquivo.text());
}

export interface LancamentoNota {
  nota: string;
  tipo_entrada: string;
  pessoa?: string | null;
  categoria?: string | null;
  centro?: string | null;
  conta_prevista?: string | null;
  local?: string | null;
  data_entrada?: string | null;
  observacao?: string | null;
  itens: {
    id: number;
    item?: string | null;
    novo?: { nome: string; unidade?: string; ncm?: string | null; codigo?: string | null; controla_estoque?: boolean } | null;
    fator?: number;
    lembrar?: boolean;
  }[];
  parcelas: { vencimento: string; valor: number }[];
}

export async function lancarNota(l: LancamentoNota) {
  return exigir(await supabase().rpc("fis_processar_nota", { p: l as unknown as Json })) as { titulos: string[]; movimentos: number[] };
}

export async function desfazerLancamento(nota: string, motivo: string) {
  exigir(await supabase().rpc("fis_desfazer_lancamento", { p_nota: nota, p_motivo: motivo }));
}

export async function salvarParametros(cliente: string, p: Record<string, unknown>) {
  exigir(await supabase().rpc("fis_salvar_parametros", { p_cliente: cliente, p: p as Json }));
}

export async function salvarTipoEntrada(p: {
  cliente?: string;
  org?: string;
  codigo: string;
  movimenta_estoque?: boolean;
  gera_pagar?: boolean;
  categoria?: string | null;
}) {
  return exigir(await supabase().rpc("fis_salvar_tipo_entrada", { p: p as unknown as Json })) as string;
}
