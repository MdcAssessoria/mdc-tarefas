// Edge Function fiscal-captura: baixa os XML das notas de cada empresa com certificado A1 ativo.
//
// Quem chama:
//   - o agendador do banco (pg_cron, a cada 15 min) com o cabeçalho x-agente-token  → { acao: "rodar" }
//   - a tela "Notas recebidas" (botão "Buscar agora", login de quem tem Financeiro/operar) → { cliente }
// Para cada empresa e fonte liberada agora (public.fis_captura_reservar respeita as travas):
//   NF-e  → Distribuição DF-e do Ambiente Nacional por ultNSU, lote a lote, até cStat 137 ou ultNSU = maxNSU
//           (NT 2014.002: 137/fim = esperar 1 hora; 656 = bloqueio de 1 hora; nunca consultar fora de sequência).
//           Depois, se a ciência automática estiver ligada, dá Ciência da operação nos resumos (resNFe) para a SEFAZ
//           liberar o XML completo, que chega numa próxima consulta.
//   NFS-e → ADN da NFS-e Nacional (GET /DFe/{NSU}, lote com até 50 documentos em gzip + base64).
// Cada XML vai para o Storage (bucket privado "fiscal") e para fis_notas/fis_eventos (public.fis_gravar_documento).
// Se gravar algum documento falhar, o NSU não passa dele: a próxima rodada tenta de novo.
import { bancoServico, bancoUsuario, cabecalhos, conexaoComCertificado, enviarSoapCom, obterJson, resposta } from "../_fiscal/http.ts";
import type { Banco } from "../_fiscal/http.ts";
import { abrirCertificado, deBase64 } from "../_fiscal/certificado.ts";
import type { CertificadoAberto } from "../_fiscal/certificado.ts";
import { prepararAdn, prepararDfe } from "../_fiscal/captura.ts";
import type { Gravacao } from "../_fiscal/captura.ts";
import { eventoParaBanco, manifestar } from "../_fiscal/manifestacao.ts";
import { lerRetornoAdn, lerRetornoDistDFe, montarDistDFe, urlAdn } from "../_fiscal/nucleo/sefaz.ts";
import type { Ambiente } from "../_fiscal/nucleo/sefaz.ts";
import { decidirAdn, decidirDistDFe, ESPERA_FALHA_MS, prazosDaNota } from "../_fiscal/nucleo/regras.ts";

const MAX_LOTES = 10; // por fonte e rodada (até 500 documentos); o resto fica para a próxima rodada
const ORCAMENTO_MS = 100_000; // não começa lote novo depois disso (a função tem ~150 s)

interface Reserva {
  cliente_id: string;
  org_id: string;
  fonte: "nfe" | "nfse";
  ult_nsu: number;
  cnpj: string;
  uf: string;
  ambiente: Ambiente;
  ciencia_automatica: boolean;
}

interface Resultado {
  cliente: string;
  fonte: string;
  documentos: number;
  ciencias?: number;
  erro?: string | null;
  avisos?: string[];
}

async function gravar(sb: Banco, g: Gravacao): Promise<string | null> {
  const up = await sb.storage.from("fiscal").upload(g.caminho, new Blob([g.xml], { type: "application/xml" }), {
    contentType: "application/xml",
    upsert: false,
  });
  if (up.error && !/exist|duplicate/i.test(up.error.message)) return `Storage: ${up.error.message}`;
  const { error } = await sb.rpc("fis_gravar_documento", { p: g.payload });
  return error ? error.message : null;
}

/** Grava em ordem de NSU; devolve até qual NSU tudo foi gravado (para não pular documento com falha). */
async function gravarTodos(sb: Banco, gravacoes: Gravacao[], ultNSU: number) {
  let ate = ultNSU;
  let feitos = 0;
  for (const g of gravacoes) {
    const erro = await gravar(sb, g);
    if (erro) return { ate, feitos, erro: `NSU ${g.nsu}: ${erro}` };
    ate = Math.max(ate, g.nsu);
    feitos++;
  }
  return { ate, feitos, erro: null as string | null };
}

async function capturarNfe(sb: Banco, r: Reserva, cert: CertificadoAberto, client: Deno.HttpClient, inicio: number): Promise<Resultado> {
  const enviar = enviarSoapCom(client);
  let ult = Number(r.ult_nsu);
  let max: number | null = null;
  let docs = 0;
  const avisos: string[] = [];
  let decisao = { continuar: false, proximaConsulta: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), bloqueadoAte: null as string | null, erro: null as string | null };
  let cstat = "";
  try {
    for (let k = 0; k < MAX_LOTES; k++) {
      const ret = lerRetornoDistDFe(await enviar(montarDistDFe({ ambiente: r.ambiente, uf: r.uf, cnpj: r.cnpj, ultNSU: ult })));
      cstat = ret.cStat;
      decisao = decidirDistDFe(ret, new Date());
      if (ret.cStat === "138") {
        const prep = await prepararDfe(ret.documentos, { org: r.org_id, cliente: r.cliente_id, ultNSU: ult });
        avisos.push(...prep.ignorados);
        const g = await gravarTodos(sb, prep.gravacoes, ult);
        docs += g.feitos;
        if (g.erro) {
          ult = g.ate;
          decisao = { continuar: false, proximaConsulta: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), bloqueadoAte: null, erro: g.erro };
          break;
        }
      }
      if (ret.cStat === "137" || ret.cStat === "138") {
        ult = Math.max(ult, ret.ultNSU);
        max = ret.maxNSU;
      }
      if (!decisao.continuar) break;
      if (Date.now() - inicio > ORCAMENTO_MS) break; // continua na próxima rodada (proximaConsulta = agora)
    }
  } catch (e) {
    decisao = { continuar: false, proximaConsulta: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), bloqueadoAte: null, erro: (e as Error).message };
  }
  await sb.rpc("fis_captura_concluir", {
    p_cliente: r.cliente_id,
    p_fonte: "nfe",
    p: { ult_nsu: ult, max_nsu: max, cstat, documentos: docs, proxima_consulta_em: decisao.proximaConsulta, bloqueado_ate: decisao.bloqueadoAte, erro: decisao.erro },
  });

  // ciência automática nos resumos dentro do prazo de 10 dias: libera o XML completo na próxima consulta
  let ciencias = 0;
  if (r.ciencia_automatica && !decisao.bloqueadoAte) {
    const { data: pendentes } = await sb
      .from("fis_notas")
      .select("id,chave,autorizacao,emissao")
      .eq("cliente_id", r.cliente_id)
      .eq("modelo", "55")
      .eq("direcao", "entrada")
      .eq("conteudo", "resumo")
      .eq("situacao", "autorizada")
      .is("manifestacao", null)
      .order("autorizacao", { ascending: false })
      .limit(40);
    const hoje = new Date().toISOString().slice(0, 10);
    const pedidos = (pendentes ?? [])
      .filter((n) => {
        const p = prazosDaNota(n.autorizacao ?? n.emissao);
        return !p || hoje <= p.ciencia;
      })
      .slice(0, 20)
      .map((n) => ({ nota_id: n.id as string, chave: n.chave as string, tipo: "ciencia" as const, sequencia: 1 }));
    if (pedidos.length) {
      const res = await manifestar(pedidos, { ambiente: r.ambiente, cnpj: r.cnpj, enviar }, { chave: cert.chave, certBase64: cert.certBase64 });
      for (const x of res) {
        await sb.rpc("fis_registrar_evento", { p_cliente: r.cliente_id, p_evento: eventoParaBanco(x), p_xml: x.xml || null, p_por: null });
        if (x.aceito) ciencias++;
      }
    }
  }
  return { cliente: r.cliente_id, fonte: "nfe", documentos: docs, ciencias, erro: decisao.erro, avisos };
}

async function capturarNfse(sb: Banco, r: Reserva, client: Deno.HttpClient, inicio: number): Promise<Resultado> {
  let ult = Number(r.ult_nsu);
  let docs = 0;
  const avisos: string[] = [];
  let decisao = { continuar: false, proximaConsulta: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), bloqueadoAte: null as string | null, erro: null as string | null };
  let status = "";
  try {
    for (let k = 0; k < MAX_LOTES; k++) {
      const { status: http, corpo } = await obterJson(client, urlAdn(r.ambiente, ult, r.cnpj));
      if (http === 404) {
        status = "NENHUM_DOCUMENTO_LOCALIZADO";
        decisao = decidirAdn({ quantidade: 0, status }, new Date());
        break;
      }
      if (http === 429) {
        status = "429";
        decisao = decidirAdn({ quantidade: 0, status, erro: "O ADN pediu para esperar (muitas consultas)." }, new Date());
        break;
      }
      const ret = lerRetornoAdn(corpo);
      status = ret.status;
      if (http >= 400 || ret.erros.length) {
        decisao = decidirAdn({ quantidade: 0, status, erro: `ADN respondeu ${http}: ${ret.erros.join("; ") || status}` }, new Date());
        break;
      }
      const prep = await prepararAdn(ret.documentos, { org: r.org_id, cliente: r.cliente_id, ultNSU: ult });
      avisos.push(...prep.ignorados);
      const g = await gravarTodos(sb, prep.gravacoes, ult);
      docs += g.feitos;
      if (g.erro) {
        ult = g.ate;
        decisao = { continuar: false, proximaConsulta: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), bloqueadoAte: null, erro: g.erro };
        break;
      }
      // documentos ignorados (eventos ainda não tratados) também avançam o NSU
      ult = Math.max(ult, ...ret.documentos.map((d) => d.nsu));
      decisao = decidirAdn({ quantidade: ret.documentos.length, status }, new Date());
      if (!decisao.continuar || Date.now() - inicio > ORCAMENTO_MS) break;
    }
  } catch (e) {
    decisao = { continuar: false, proximaConsulta: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), bloqueadoAte: null, erro: (e as Error).message };
  }
  await sb.rpc("fis_captura_concluir", {
    p_cliente: r.cliente_id,
    p_fonte: "nfse",
    p: { ult_nsu: ult, cstat: status, documentos: docs, proxima_consulta_em: decisao.proximaConsulta, bloqueado_ate: null, erro: decisao.erro },
  });
  return { cliente: r.cliente_id, fonte: "nfse", documentos: docs, erro: decisao.erro, avisos };
}

async function rodar(sb: Banco, reservas: Reserva[]): Promise<Resultado[]> {
  const inicio = Date.now();
  const saida: Resultado[] = [];
  const porCliente = new Map<string, Reserva[]>();
  for (const r of reservas) porCliente.set(r.cliente_id, [...(porCliente.get(r.cliente_id) ?? []), r]);
  for (const [cliente, lista] of porCliente) {
    let client: Deno.HttpClient | null = null;
    try {
      const { data, error } = await sb.rpc("fis_cert_obter", { p_cliente: cliente });
      const c = (data as { pfx: string; senha: string }[] | null)?.[0];
      if (error || !c) throw new Error("Certificado não encontrado.");
      const cert = abrirCertificado(deBase64(c.pfx), c.senha);
      client = conexaoComCertificado(cert.certPem, cert.chavePem);
      for (const r of lista) {
        if (Date.now() - inicio > ORCAMENTO_MS) {
          await sb.rpc("fis_captura_concluir", { p_cliente: r.cliente_id, p_fonte: r.fonte, p: { proxima_consulta_em: new Date().toISOString(), cstat: null } });
          continue;
        }
        saida.push(r.fonte === "nfe" ? await capturarNfe(sb, r, cert, client, inicio) : await capturarNfse(sb, r, client, inicio));
      }
    } catch (e) {
      const erro = (e as Error).message;
      for (const r of lista) {
        await sb.rpc("fis_captura_concluir", {
          p_cliente: r.cliente_id,
          p_fonte: r.fonte,
          p: { proxima_consulta_em: new Date(Date.now() + ESPERA_FALHA_MS).toISOString(), erro, cstat: null },
        });
        saida.push({ cliente: r.cliente_id, fonte: r.fonte, documentos: 0, erro });
      }
    } finally {
      client?.close();
    }
  }
  return saida;
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const sb = bancoServico();
  let corpo: { acao?: string; cliente?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    /* corpo vazio */
  }

  // 1) agendador do banco
  const token = req.headers.get("x-agente-token");
  if (token) {
    const ok = await sb.rpc("fis_token_confere", { p_token: token });
    if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });
    const { data, error } = await sb.rpc("fis_captura_reservar", { p_limite: 5 });
    if (error) return json(500, { erro: error.message });
    return json(200, { resultados: await rodar(sb, (data ?? []) as Reserva[]) });
  }

  // 2) botão "Buscar agora" na tela: mesmas travas (só consulta se a hora permitida já chegou)
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const cliente = String(corpo.cliente ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(cliente)) return json(400, { erro: "Escolha a empresa." });
  const usuario = bancoUsuario(auth);
  const pode = await usuario.rpc("fis_pode", { p_cliente: cliente, p_nivel: "operar" });
  if (pode.data !== true) return json(403, { erro: "Sem permissão para buscar as notas desta empresa." });
  const { data, error } = await sb.rpc("fis_captura_reservar", { p_limite: 1, p_cliente: cliente });
  if (error) return json(500, { erro: error.message });
  if (!data?.length) {
    const { data: ctl } = await sb.from("fis_dfe_controle").select("fonte,proxima_consulta_em,bloqueado_ate").eq("cliente_id", cliente);
    return json(200, {
      resultados: [],
      mensagem: "Ainda não é hora de consultar de novo: a SEFAZ só permite uma nova busca 1 hora depois da última sem notas novas.",
      controle: ctl ?? [],
    });
  }
  return json(200, { resultados: await rodar(sb, data as Reserva[]) });
});
