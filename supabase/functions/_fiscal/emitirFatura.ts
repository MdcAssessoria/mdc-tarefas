// Miolo da emissão da NFS-e de uma fatura (passos 2 a 4), usado pela tela (nfse-emitir, depois de conferir o login e a
// permissão) e pela emissão automática (nfse-automatica, chamada pelo agendador do banco):
// 2) reserva o nDPS (nfse_reservar, service_role; nunca repete; resultado incerto anterior volta como reenvio da mesma DPS);
// 3) abre o certificado A1 do cofre, monta e assina a DPS e envia com mTLS para o ambiente configurado;
// 4) guarda a DPS e o XML no bucket fiscal e grava o resultado (nfse_registrar_resultado).
// Devolve { status, corpo } para quem chamou montar a resposta. Nunca escreve certificado, senha nem XML em log.
import { transporteRetransmissor } from "./http.ts";
import type { Banco } from "./http.ts";
import {
  abrirCertificado,
  conferirParaEmpresa,
  deBase64,
} from "./certificado.ts";
import type { CertificadoAberto } from "./certificado.ts";
import { emitirNfse } from "./emissao.ts";
import type { ResultadoEmissao } from "./emissao.ts";
import {
  caminhoNfseEmitida,
  dataHoraBrasilia,
  NOMES_AMBIENTE,
} from "./nucleo/dps.ts";
import type { AmbienteNfse, DadosDps, MensagemSefin } from "./nucleo/dps.ts";

export interface RespostaEmissao {
  status: number;
  corpo: Record<string, unknown>;
}

export interface DadosBanco {
  org: string;
  cliente: string;
  pronto: boolean;
  pendencias: string[];
  pode_emitir?: boolean;
  dps: {
    dCompet: string;
    cLocEmi: string;
    prestador: {
      cnpj: string;
      im: string | null;
      opSimpNac: "1" | "2" | "3";
      regApTribSN: "1" | "2" | "3" | null;
      regEspTrib: string;
    };
    tomador: { documento: string; nome: string; email: string | null };
    servico: {
      cLocPrestacao: string;
      cTribNac: string;
      descricao: string;
      cNBS: string;
    };
    valores: { vServ: number | string; pTotTribSN: number | string | null };
  };
}
interface Reserva extends DadosBanco {
  emissao: string;
  ndps: number;
  id_dps: string;
  serie: string;
  ambiente: AmbienteNfse;
  reenvio: boolean;
  tentativa: number;
}

/** Grava um XML no bucket fiscal (tenta duas vezes). Devolve se deu certo. */
async function guardar(
  sb: Banco,
  caminho: string,
  xml: string,
): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const up = await sb.storage
      .from("fiscal")
      .upload(caminho, new Blob([xml], { type: "application/xml" }), {
        contentType: "application/xml",
        upsert: true,
      });
    if (!up.error) return true;
    console.error(
      `Storage (${caminho.split("/").slice(2).join("/")}): ${up.error.message}`,
    );
  }
  return false;
}

/** Emite a nota da fatura (passos 2 a 4). `por` = quem pediu (nulo na emissão automática). */
export async function emitirFatura(
  sb: Banco,
  fatura: string,
  por: string | null,
): Promise<RespostaEmissao> {
  const json = (
    status: number,
    corpo: Record<string, unknown>,
  ): RespostaEmissao => ({ status, corpo });
  // 2) reserva do nDPS (sem repetir)
  const res = await sb.rpc("nfse_reservar", { p_fatura: fatura, p_por: por });
  if (res.error) return json(409, { erro: res.error.message });
  const r = res.data as Reserva;
  const teste = r.ambiente !== "producao";
  const responder = async (
    resultado: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => {
    const g = await sb.rpc("nfse_registrar_resultado", {
      p_emissao: r.emissao,
      p: resultado,
    });
    if (g.error)
      console.error(
        `nfse_registrar_resultado (emissão ${r.emissao}): ${g.error.message}`,
      );
    return json(200, {
      situacao: resultado.situacao,
      ambiente: r.ambiente,
      ambiente_nome: NOMES_AMBIENTE[r.ambiente],
      teste,
      ndps: r.ndps,
      ...extra,
      mensagem: resultado.mensagem ?? null,
      mensagens: resultado.mensagens ?? [],
    });
  };
  /** Falha antes de enviar: nada saiu (recusa); num reenvio a tentativa anterior continua incerta ("erro"). */
  const falhaLocal = (msg: string) =>
    responder({
      situacao: r.reenvio ? "erro" : "rejeitada",
      mensagem: msg,
      mensagens: [
        {
          codigo: "HUB",
          descricao: msg,
          complemento: null,
          texto: msg,
        } satisfies MensagemSefin,
      ],
    });

  // 3) certificado A1 do cofre
  const { data: certs } = await sb.rpc("fis_cert_obter", {
    p_cliente: r.cliente,
  });
  const cert = (
    certs as { pfx: string; senha: string; valido_ate: string }[] | null
  )?.[0];
  if (!cert)
    return falhaLocal(
      "Cadastre o certificado digital A1 da empresa em Entradas › Certificado digital.",
    );
  let aberto: CertificadoAberto;
  try {
    aberto = abrirCertificado(deBase64(cert.pfx), cert.senha);
  } catch (e) {
    return falhaLocal(`Certificado digital: ${(e as Error).message}`);
  }
  const problema = conferirParaEmpresa(aberto.info, r.dps.prestador.cnpj);
  if (problema) return falhaLocal(`Certificado digital: ${problema}`);

  const dados: DadosDps = {
    ambiente: r.ambiente,
    // 20 s de folga para o relógio do Emissor (a emissão não pode estar "no futuro")
    dhEmi: dataHoraBrasilia(new Date(Date.now() - 20_000)),
    serie: r.serie,
    nDps: r.ndps,
    dCompet: r.dps.dCompet,
    cLocEmi: r.dps.cLocEmi,
    prestador: r.dps.prestador,
    tomador: r.dps.tomador,
    servico: r.dps.servico,
    valores: {
      vServ: Number(r.dps.valores.vServ),
      pTotTribSN:
        r.dps.valores.pTotTribSN == null
          ? null
          : Number(r.dps.valores.pTotTribSN),
    },
  };

  // envio com mTLS pelo retransmissor do site (066): a Sefin pede o certificado por renegociação TLS, que o Deno não faz
  const tk = await sb.rpc("nfse_relay_token");
  if (tk.error || !tk.data)
    return falhaLocal(
      "Não achei o código interno do retransmissor da nota (migração 066).",
    );
  let resultado: ResultadoEmissao;
  try {
    resultado = await emitirNfse(
      dados,
      {
        reenvio: r.reenvio,
        transporte: transporteRetransmissor({
          token: String(tk.data),
          certPem: aberto.certPem,
          chavePem: aberto.chavePem,
        }),
      },
      { chave: aberto.chave, certBase64: aberto.certBase64 },
    );
  } catch (e) {
    return falhaLocal((e as Error).message);
  }

  // 4) guarda os XML e grava o resultado
  const hoje = dataHoraBrasilia(new Date()).slice(0, 10);
  let dpsCaminho: string | null = null;
  if (resultado.dpsAssinada) {
    const c = caminhoNfseEmitida(
      r.org,
      r.cliente,
      hoje,
      `dps/${r.id_dps}-${r.tentativa}.xml`,
    );
    if (await guardar(sb, c, resultado.dpsAssinada)) dpsCaminho = c;
  }
  if (resultado.situacao === "emitida") {
    const xmlCaminho = caminhoNfseEmitida(
      r.org,
      r.cliente,
      hoje,
      `${resultado.chave}.xml`,
    );
    const guardou = await guardar(sb, xmlCaminho, resultado.xmlNfse);
    return responder(
      {
        situacao: "emitida",
        chave: resultado.chave,
        numero: resultado.numero,
        xml_caminho: xmlCaminho,
        dps_caminho: dpsCaminho,
        mensagem: guardou
          ? null
          : "A nota saiu, mas o XML não foi guardado no HUB agora; baixe no Emissor Nacional pela chave.",
        mensagens: resultado.alertas,
      },
      {
        numero: resultado.numero,
        chave: resultado.chave,
        xml_caminho: xmlCaminho,
        recuperada: resultado.recuperada,
      },
    );
  }
  if (resultado.situacao === "rejeitada")
    return responder({
      situacao: "rejeitada",
      mensagem: resultado.mensagem,
      mensagens: resultado.mensagens,
      dps_caminho: dpsCaminho,
    });
  return responder({
    situacao: "erro",
    mensagem: resultado.mensagem,
    dps_caminho: dpsCaminho,
  });
}
