// Envio da manifestação do destinatário ao Ambiente Nacional (NFeRecepcaoEvento4): monta cada evento, assina,
// junta em lotes de até 20 e lê o retorno de cada um. Usado pela tela (fiscal-manifestar) e pela ciência automática
// (fiscal-captura). O envio em si é uma função recebida (EnviarSoap), para os testes não precisarem de rede.
import type forge from "node-forge";
import { assinarElemento } from "./assinatura.ts";
import type { EnviarSoap } from "./http.ts";
import {
  dataHoraEvento,
  eventoAceito,
  EVENTOS,
  idEvento,
  lerRetornoEvento,
  montarEnvioEventos,
  montarEvento,
  montarInfEvento,
  montarProcEvento,
} from "./nucleo/sefaz.ts";
import type { Ambiente, CodigoManifestacao } from "./nucleo/sefaz.ts";

export interface PedidoManifestacao {
  nota_id: string;
  chave: string;
  tipo: CodigoManifestacao;
  sequencia: number;
  justificativa?: string | null;
}

export interface ResultadoManifestacao {
  pedido: PedidoManifestacao;
  aceito: boolean;
  cStat: string;
  xMotivo: string;
  protocolo: string | null;
  registrado_em: string | null;
  /** procEventoNFe (aceito) ou o retEvento (recusado), para guardar como comprovante. */
  xml: string;
}

export interface Assinante {
  chave: forge.pki.rsa.PrivateKey;
  certBase64: string;
}

/** Evento assinado de um pedido (o <evento> completo). */
export function eventoAssinado(p: PedidoManifestacao, o: { ambiente: Ambiente; cnpj: string; dhEvento: string }, a: Assinante): string {
  const dados = { ambiente: o.ambiente, cnpj: o.cnpj, chave: p.chave, tipo: p.tipo, sequencia: p.sequencia, dhEvento: o.dhEvento, justificativa: p.justificativa };
  const id = idEvento(EVENTOS[p.tipo].tp, p.chave, p.sequencia);
  const assinatura = assinarElemento(montarInfEvento(dados, true), id, a.chave, a.certBase64);
  return montarEvento(montarInfEvento(dados, false), assinatura);
}

/** Envia os pedidos em lotes de 20 e devolve o resultado de cada um (na mesma ordem). */
export async function manifestar(
  pedidos: PedidoManifestacao[],
  o: { ambiente: Ambiente; cnpj: string; agora?: Date; enviar: EnviarSoap },
  a: Assinante,
): Promise<ResultadoManifestacao[]> {
  const saida: ResultadoManifestacao[] = [];
  const dhEvento = dataHoraEvento(o.agora ?? new Date());
  for (let i = 0; i < pedidos.length; i += 20) {
    const lote = pedidos.slice(i, i + 20);
    const eventos = lote.map((p) => eventoAssinado(p, { ambiente: o.ambiente, cnpj: o.cnpj, dhEvento }, a));
    const idLote = `${Date.now()}`.slice(-13) + String(i / 20).padStart(2, "0");
    let ret: ReturnType<typeof lerRetornoEvento>;
    try {
      ret = lerRetornoEvento(await o.enviar(montarEnvioEventos(o.ambiente, idLote, eventos)));
    } catch (e) {
      for (const p of lote)
        saida.push({ pedido: p, aceito: false, cStat: "", xMotivo: (e as Error).message, protocolo: null, registrado_em: null, xml: "" });
      continue;
    }
    lote.forEach((p, k) => {
      const r = ret.eventos.find((x) => x.chave === p.chave && x.tpEvento === EVENTOS[p.tipo].tp);
      if (!r) {
        saida.push({
          pedido: p,
          aceito: false,
          cStat: ret.cStat,
          xMotivo: ret.xMotivo || "A SEFAZ não devolveu o resultado deste evento",
          protocolo: null,
          registrado_em: null,
          xml: "",
        });
        return;
      }
      const aceito = eventoAceito(r.cStat);
      saida.push({
        pedido: p,
        aceito,
        cStat: r.cStat,
        xMotivo: r.xMotivo,
        protocolo: r.protocolo,
        registrado_em: r.dhRegEvento,
        xml: aceito ? montarProcEvento(eventos[k], r.xml) : r.xml,
      });
    });
  }
  return saida;
}

/** JSON para public.fis_registrar_evento. */
export const eventoParaBanco = (r: ResultadoManifestacao) => ({
  chave: r.pedido.chave,
  tpEvento: EVENTOS[r.pedido.tipo].tp,
  descricao: EVENTOS[r.pedido.tipo].nome,
  sequencia: r.pedido.sequencia,
  justificativa: r.pedido.justificativa ?? null,
  cStat: r.cStat || null,
  motivo: r.xMotivo,
  protocolo: r.protocolo,
  registrado_em: r.registrado_em,
});
