// Edge Function fiscal-manifestar: manifestação do destinatário pedida pela tela "Notas recebidas" (uma nota ou em lote).
//   POST { cliente, notas: [ids], tipo: ciencia | confirmada | desconhecida | nao_realizada, justificativa? }
// Confere o acesso (Financeiro/operar, com o login de quem chamou), se cada nota aceita aquela manifestação (prazo,
// situação, no máximo dois eventos de cada tipo — regras.ts), assina cada evento com o certificado A1 da empresa e envia
// ao Ambiente Nacional (cOrgao 91) em lotes de até 20. Cada resultado (aceito ou recusado) vai para fis_eventos com o
// cStat, o protocolo e o XML; o aceito muda a situação da nota.
import { bancoServico, bancoUsuario, cabecalhos, conexaoComCertificado, enviarSoapCom, resposta } from "../_fiscal/http.ts";
import { abrirCertificado, deBase64 } from "../_fiscal/certificado.ts";
import { eventoParaBanco, manifestar } from "../_fiscal/manifestacao.ts";
import type { PedidoManifestacao } from "../_fiscal/manifestacao.ts";
import { EVENTOS, justificativaValida, manifestacaoDoTipo } from "../_fiscal/nucleo/sefaz.ts";
import type { Ambiente, CodigoManifestacao } from "../_fiscal/nucleo/sefaz.ts";
import { manifestacoesPermitidas, proximaSequencia } from "../_fiscal/nucleo/regras.ts";

const MAX_NOTAS = 100;

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const corpo = (await req.json().catch(() => ({}))) as { cliente?: string; notas?: string[]; tipo?: string; justificativa?: string };
  const cliente = String(corpo.cliente ?? "");
  const tipo = corpo.tipo as CodigoManifestacao;
  const ids = [...new Set((corpo.notas ?? []).map(String))];
  if (!/^[0-9a-f-]{36}$/i.test(cliente)) return json(400, { erro: "Escolha a empresa." });
  if (!EVENTOS[tipo]) return json(400, { erro: "Escolha a resposta: ciência, confirmação, desconhecimento ou operação não realizada." });
  if (!ids.length || ids.length > MAX_NOTAS) return json(400, { erro: `Escolha de 1 a ${MAX_NOTAS} notas.` });
  if (tipo === "nao_realizada" && !justificativaValida(corpo.justificativa))
    return json(400, { erro: "Explique por que a operação não foi realizada (de 15 a 255 letras)." });

  const usuario = bancoUsuario(auth);
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });
  const pode = await usuario.rpc("fis_pode", { p_cliente: cliente, p_nivel: "operar" });
  if (pode.data !== true) return json(403, { erro: "Sem permissão para responder às notas desta empresa." });

  const sb = bancoServico();
  const [{ data: notas }, { data: eventos }, { data: emp }, { data: par }, { data: certs }] = await Promise.all([
    sb.from("fis_notas").select("id,chave,numero,emitente_nome,modelo,direcao,situacao,manifestacao,autorizacao,emissao,destinatario_doc")
      .eq("cliente_id", cliente).in("id", ids),
    sb.from("fis_eventos").select("nota_id,tp_evento,cstat").eq("cliente_id", cliente).in("nota_id", ids),
    sb.from("clientes").select("cnpj").eq("id", cliente).maybeSingle(),
    sb.from("fis_parametros").select("ambiente").eq("cliente_id", cliente).maybeSingle(),
    sb.rpc("fis_cert_obter", { p_cliente: cliente }),
  ]);
  const cert = (certs as { pfx: string; senha: string; valido_ate: string }[] | null)?.[0];
  if (!cert) return json(400, { erro: "Cadastre o certificado digital A1 da empresa antes de responder às notas." });
  if (new Date(cert.valido_ate) < new Date()) return json(400, { erro: "O certificado digital da empresa venceu. Envie o novo." });
  const ambiente = ((par?.ambiente as Ambiente) ?? "producao") as Ambiente;
  const cnpjEmpresa = String(emp?.cnpj ?? "").replace(/\D/g, "");
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

  const recusadas: { nota: string; motivo: string }[] = [];
  const pedidos: (PedidoManifestacao & { cnpj: string })[] = [];
  for (const id of ids) {
    const n = (notas ?? []).find((x) => x.id === id);
    if (!n) {
      recusadas.push({ nota: id, motivo: "Nota não encontrada nesta empresa." });
      continue;
    }
    const aceitos = (eventos ?? [])
      .filter((e) => e.nota_id === id && ["135", "136", "155"].includes(String(e.cstat)))
      .map((e) => ({ tipo: manifestacaoDoTipo(String(e.tp_evento)) }))
      .filter((e): e is { tipo: CodigoManifestacao } => !!e.tipo);
    const permitidas = manifestacoesPermitidas({ ...n, eventos: aceitos }, hoje);
    if (!permitidas.some((p) => p.tipo === tipo)) {
      recusadas.push({ nota: id, motivo: `NF ${n.numero ?? ""} (${n.emitente_nome ?? ""}): esta resposta não é mais possível (prazo, situação ou limite de eventos).` });
      continue;
    }
    const cnpj = String(n.destinatario_doc ?? "").replace(/\D/g, "").length === 14 ? String(n.destinatario_doc) : cnpjEmpresa;
    pedidos.push({ nota_id: id, chave: n.chave, tipo, sequencia: proximaSequencia(aceitos, tipo), justificativa: corpo.justificativa ?? null, cnpj });
  }
  if (!pedidos.length) return json(400, { erro: recusadas.map((r) => r.motivo).join(" "), recusadas });

  const aberto = abrirCertificado(deBase64(cert.pfx), cert.senha);
  const client = conexaoComCertificado(aberto.certPem, aberto.chavePem);
  const resultados: { nota: string; aceito: boolean; cStat: string; motivo: string; protocolo: string | null }[] = [];
  try {
    // o CNPJ do autor vai em cada evento: agrupa por CNPJ (matriz e filiais do mesmo certificado)
    const porCnpj = new Map<string, typeof pedidos>();
    for (const p of pedidos) porCnpj.set(p.cnpj, [...(porCnpj.get(p.cnpj) ?? []), p]);
    for (const [cnpj, lista] of porCnpj) {
      const res = await manifestar(lista, { ambiente, cnpj, enviar: enviarSoapCom(client) }, { chave: aberto.chave, certBase64: aberto.certBase64 });
      for (const r of res) {
        const { error } = await sb.rpc("fis_registrar_evento", { p_cliente: cliente, p_evento: eventoParaBanco(r), p_xml: r.xml || null, p_por: u.user.id });
        if (error) console.error(error);
        resultados.push({ nota: r.pedido.nota_id, aceito: r.aceito, cStat: r.cStat, motivo: r.xMotivo, protocolo: r.protocolo });
      }
    }
  } finally {
    client.close();
  }
  return json(200, { resultados, recusadas });
});
