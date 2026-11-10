// Emissão da NFS-e pelo Emissor Nacional (API da Sefin Nacional): assina a DPS (XMLDSig enveloped, RSA-SHA1, C14N,
// Reference ao Id do infDPS — o mesmo assinador dos eventos da NF-e, como fazem os projetos abertos Rainzart/nfse-nacional
// e brans-nfe), manda em gzip + base64 e lê o retorno. Quando a tentativa anterior ficou sem resposta certa (reenvio),
// CONFERE primeiro no Emissor (GET /dps/{Id}): se a nota já saiu, só busca o XML; se não saiu, reenvia a MESMA DPS;
// se não der para conferir, não reenvia (evita nota em dobro). O transporte é recebido: os testes não usam rede.
import { assinarElemento } from "./assinatura.ts";
import type { TransporteJson } from "./http.ts";
import type { Assinante } from "./manifestacao.ts";
import {
  corpoEnvioDps,
  idDps,
  lerConsultaDps,
  lerConsultaNfse,
  lerNfseEmitida,
  lerRetornoEmissao,
  montarDps,
  montarInfDps,
  urlConsultarDps,
  urlConsultarNfse,
  urlEmitir,
} from "./nucleo/dps.ts";
import type { DadosDps, MensagemSefin } from "./nucleo/dps.ts";

export type ResultadoEmissao =
  | {
      situacao: "emitida";
      chave: string;
      numero: string | null;
      xmlNfse: string;
      /** DPS enviada agora (null quando a nota foi só recuperada de uma tentativa anterior). */
      dpsAssinada: string | null;
      recuperada: boolean;
      alertas: MensagemSefin[];
    }
  | { situacao: "rejeitada"; mensagem: string; mensagens: MensagemSefin[]; dpsAssinada: string }
  | { situacao: "erro"; mensagem: string; dpsAssinada: string | null };

const SEM_CONEXAO = "O Emissor Nacional não respondeu (sem conexão ou demora). O HUB confere no Emissor antes de tentar de novo.";

/** Motivo técnico da falha de conexão (10/11/2026): vai no log da Função e, curto, no fim da mensagem, para o
 *  suporte saber se foi certificado do servidor, recusa do certificado da empresa, tempo esgotado ou rede. */
export function motivoConexao(e: unknown): string {
  const m = String((e as Error)?.message ?? e ?? "").replace(/\s+/g, " ").trim();
  console.error("nfse: falha de conexão com o Emissor Nacional:", m.slice(0, 500));
  if (/UnknownIssuer|unknown issuer|certificate verify|self.signed|invalid peer certificate/i.test(m))
    return "o servidor do Emissor usa um certificado que a Função não reconhece";
  if (/bad ?certificate|certificate required|handshake|alert/i.test(m)) return "o Emissor recusou o certificado digital da empresa na conexão";
  if (/timed? ?out|TimeoutError|aborted/i.test(m)) return "o Emissor demorou mais de 60 segundos";
  if (/dns|lookup|resolve/i.test(m)) return "não achou o endereço do Emissor (rede)";
  return m.slice(0, 160) || "erro de rede";
}

/** DPS completa e assinada (o <Signature> vai logo depois do infDPS, dentro do <DPS>). */
export function dpsAssinada(d: DadosDps, a: Assinante): string {
  const id = idDps(d.cLocEmi, d.prestador.cnpj, d.serie, d.nDps);
  const assinatura = assinarElemento(montarInfDps(d, true), id, a.chave, a.certBase64);
  return montarDps(montarInfDps(d, false), assinatura);
}

/** Busca o XML de uma nota que já saiu (pela chave). */
async function recuperar(d: DadosDps, chave: string, t: TransporteJson): Promise<ResultadoEmissao> {
  try {
    const r = await t.obterJson(urlConsultarNfse(d.ambiente, chave));
    const b64 = lerConsultaNfse(r.status, r.corpo);
    if (!b64) throw new Error(`resposta ${r.status}`);
    const lido = await lerNfseEmitida(b64);
    return { situacao: "emitida", chave: lido.chave, numero: lido.numero, xmlNfse: lido.xml, dpsAssinada: null, recuperada: true, alertas: [] };
  } catch {
    return {
      situacao: "erro",
      mensagem: `A nota saiu no Emissor Nacional (chave ${chave}), mas não deu para baixar o XML agora. Tente de novo em alguns minutos.`,
      dpsAssinada: null,
    };
  }
}

export async function emitirNfse(d: DadosDps, o: { reenvio: boolean; transporte: TransporteJson }, a: Assinante): Promise<ResultadoEmissao> {
  const t = o.transporte;
  if (o.reenvio) {
    const id = idDps(d.cLocEmi, d.prestador.cnpj, d.serie, d.nDps);
    let c: ReturnType<typeof lerConsultaDps>;
    try {
      const r = await t.obterJson(urlConsultarDps(d.ambiente, id));
      c = lerConsultaDps(r.status, r.corpo);
    } catch (e) {
      return {
        situacao: "erro",
        mensagem: `Não deu para conferir no Emissor Nacional se a nota da tentativa anterior saiu (sem conexão: ${motivoConexao(e)}). Tente de novo em alguns minutos.`,
        dpsAssinada: null,
      };
    }
    if (c.tipo === "incerto") return { situacao: "erro", mensagem: c.mensagem, dpsAssinada: null };
    if (c.tipo === "existe") return recuperar(d, c.chave, t);
  }

  const xml = dpsAssinada(d, a);
  let r: { status: number; corpo: unknown };
  try {
    r = await t.postarJson(urlEmitir(d.ambiente), await corpoEnvioDps(xml));
  } catch (e) {
    return { situacao: "erro", mensagem: `${SEM_CONEXAO} Motivo técnico: ${motivoConexao(e)}.`, dpsAssinada: xml };
  }
  const ret = lerRetornoEmissao(r.status, r.corpo);
  if (ret.tipo === "rejeitada") return { situacao: "rejeitada", mensagem: ret.mensagem, mensagens: ret.mensagens, dpsAssinada: xml };
  if (ret.tipo === "erro") return { situacao: "erro", mensagem: ret.mensagem, dpsAssinada: xml };
  try {
    const lido = await lerNfseEmitida(ret.nfseXmlGZipB64);
    return { situacao: "emitida", chave: ret.chave, numero: lido.numero, xmlNfse: lido.xml, dpsAssinada: xml, recuperada: false, alertas: ret.alertas };
  } catch {
    // a nota existe (veio a chave), mas o XML não abriu: fica "sem resposta certa" e a próxima tentativa recupera pela consulta
    return {
      situacao: "erro",
      mensagem: `A nota saiu no Emissor Nacional (chave ${ret.chave}), mas o XML devolvido não abriu. Clique em Emitir de novo para o HUB buscar a nota.`,
      dpsAssinada: xml,
    };
  }
}
