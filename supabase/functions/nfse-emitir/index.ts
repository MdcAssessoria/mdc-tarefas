// Edge Function nfse-emitir: emite a NFS-e de uma fatura de contrato pelo Emissor Nacional (API da Sefin Nacional),
// pedida pela tela Contratos › Faturas ("Emitir nota fiscal").
//   POST { fatura }   (com o login de quem usa a tela; publicada com verify_jwt = true)
// 1) Confere o login e a permissão NO BANCO: nfse_preparar com o login de quem chamou (pode_emitir = Contratos operar;
//    pronto = sem pendência: parâmetros, certificado, código do serviço, CNPJ do cliente…).
// 2) Reserva o nDPS (nfse_reservar, service_role): trava a fatura e a numeração, nunca repete; resultado incerto da
//    tentativa anterior volta como reenvio da MESMA DPS (a função confere no Emissor antes de mandar de novo).
// 3) Abre o certificado A1 da empresa no cofre (fis_cert_obter), monta e assina a DPS (_fiscal/emissao.ts) e envia com
//    mTLS para o ambiente configurado (produção restrita = teste sem valor fiscal, ou produção).
// 4) Guarda a DPS e o XML da NFS-e no bucket fiscal (<org>/<cliente>/nfse-emitidas/AAAA/MM/…) e grava o resultado
//    (nfse_registrar_resultado): emitida em produção → fatura emitida e Portal liberado; recusa → mensagens em português.
// Nunca escreve certificado, senha, chave privada nem o XML em log.
import { bancoServico, bancoUsuario, cabecalhos, conexaoComCertificado, resposta, transporteCom } from "../_fiscal/http.ts";
import type { Banco } from "../_fiscal/http.ts";
import { abrirCertificado, conferirParaEmpresa, deBase64 } from "../_fiscal/certificado.ts";
import type { CertificadoAberto } from "../_fiscal/certificado.ts";
import { emitirNfse } from "../_fiscal/emissao.ts";
import type { ResultadoEmissao } from "../_fiscal/emissao.ts";
import { caminhoNfseEmitida, dataHoraBrasilia, NOMES_AMBIENTE } from "../_fiscal/nucleo/dps.ts";
import type { AmbienteNfse, DadosDps, MensagemSefin } from "../_fiscal/nucleo/dps.ts";

interface DadosBanco {
  org: string;
  cliente: string;
  pronto: boolean;
  pendencias: string[];
  pode_emitir?: boolean;
  dps: {
    dCompet: string;
    cLocEmi: string;
    prestador: { cnpj: string; im: string | null; opSimpNac: "1" | "2" | "3"; regApTribSN: "1" | "2" | "3" | null; regEspTrib: string };
    tomador: { documento: string; nome: string; email: string | null };
    servico: { cLocPrestacao: string; cTribNac: string; descricao: string; cNBS: string };
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
async function guardar(sb: Banco, caminho: string, xml: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const up = await sb.storage.from("fiscal").upload(caminho, new Blob([xml], { type: "application/xml" }), {
      contentType: "application/xml",
      upsert: true,
    });
    if (!up.error) return true;
    console.error(`Storage (${caminho.split("/").slice(2).join("/")}): ${up.error.message}`);
  }
  return false;
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const corpo = (await req.json().catch(() => ({}))) as { fatura?: string };
  const fatura = String(corpo.fatura ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(fatura)) return json(400, { erro: "Escolha a fatura." });

  // 1) login e permissão conferidos no banco, com o login de quem chamou
  const usuario = bancoUsuario(auth);
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });
  const prep = await usuario.rpc("nfse_preparar", { p_fatura: fatura });
  if (prep.error) return json(400, { erro: prep.error.message });
  const p = prep.data as DadosBanco;
  if (!p.pode_emitir) return json(403, { erro: "Sem permissão para emitir nota fiscal (módulo Contratos, nível operar)." });
  if (!p.pronto) return json(400, { erro: `Falta ajustar antes de emitir: ${p.pendencias.join("; ")}.`, pendencias: p.pendencias });

  // 2) reserva do nDPS (sem repetir)
  const sb = bancoServico();
  const res = await sb.rpc("nfse_reservar", { p_fatura: fatura, p_por: u.user.id });
  if (res.error) return json(409, { erro: res.error.message });
  const r = res.data as Reserva;
  const teste = r.ambiente !== "producao";
  const responder = async (resultado: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const g = await sb.rpc("nfse_registrar_resultado", { p_emissao: r.emissao, p: resultado });
    if (g.error) console.error(`nfse_registrar_resultado (emissão ${r.emissao}): ${g.error.message}`);
    return json(200, { situacao: resultado.situacao, ambiente: r.ambiente, ambiente_nome: NOMES_AMBIENTE[r.ambiente], teste, ndps: r.ndps, ...extra,
      mensagem: resultado.mensagem ?? null, mensagens: resultado.mensagens ?? [] });
  };
  /** Falha antes de enviar: nada saiu (recusa); num reenvio a tentativa anterior continua incerta ("erro"). */
  const falhaLocal = (msg: string) =>
    responder({ situacao: r.reenvio ? "erro" : "rejeitada", mensagem: msg, mensagens: [{ codigo: "HUB", descricao: msg, complemento: null, texto: msg } satisfies MensagemSefin] });

  // 3) certificado A1 do cofre
  const { data: certs } = await sb.rpc("fis_cert_obter", { p_cliente: r.cliente });
  const cert = (certs as { pfx: string; senha: string; valido_ate: string }[] | null)?.[0];
  if (!cert) return falhaLocal("Cadastre o certificado digital A1 da empresa em Entradas › Certificado digital.");
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
    valores: { vServ: Number(r.dps.valores.vServ), pTotTribSN: r.dps.valores.pTotTribSN == null ? null : Number(r.dps.valores.pTotTribSN) },
  };

  // envio com mTLS
  const client = conexaoComCertificado(aberto.certPem, aberto.chavePem);
  let resultado: ResultadoEmissao;
  try {
    resultado = await emitirNfse(dados, { reenvio: r.reenvio, transporte: transporteCom(client) }, { chave: aberto.chave, certBase64: aberto.certBase64 });
  } catch (e) {
    return falhaLocal((e as Error).message);
  } finally {
    client.close();
  }

  // 4) guarda os XML e grava o resultado
  const hoje = dataHoraBrasilia(new Date()).slice(0, 10);
  let dpsCaminho: string | null = null;
  if (resultado.dpsAssinada) {
    const c = caminhoNfseEmitida(r.org, r.cliente, hoje, `dps/${r.id_dps}-${r.tentativa}.xml`);
    if (await guardar(sb, c, resultado.dpsAssinada)) dpsCaminho = c;
  }
  if (resultado.situacao === "emitida") {
    const xmlCaminho = caminhoNfseEmitida(r.org, r.cliente, hoje, `${resultado.chave}.xml`);
    const guardou = await guardar(sb, xmlCaminho, resultado.xmlNfse);
    return responder(
      {
        situacao: "emitida",
        chave: resultado.chave,
        numero: resultado.numero,
        xml_caminho: xmlCaminho,
        dps_caminho: dpsCaminho,
        mensagem: guardou ? null : "A nota saiu, mas o XML não foi guardado no HUB agora; baixe no Emissor Nacional pela chave.",
        mensagens: resultado.alertas,
      },
      { numero: resultado.numero, chave: resultado.chave, xml_caminho: xmlCaminho, recuperada: resultado.recuperada },
    );
  }
  if (resultado.situacao === "rejeitada")
    return responder({ situacao: "rejeitada", mensagem: resultado.mensagem, mensagens: resultado.mensagens, dps_caminho: dpsCaminho });
  return responder({ situacao: "erro", mensagem: resultado.mensagem, dps_caminho: dpsCaminho });
});
