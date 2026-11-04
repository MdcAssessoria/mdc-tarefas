// Edge Function fatura-enviar: manda as faturas da fila (fin_envios) por e-mail (Microsoft 365, pelo Graph, como a
// caixa do HUB) e por WhatsApp (API oficial da Meta, modelo aprovado com o PDF da fatura). Migração 053; docs/07 7.12.
//
// Quem chama:
//   - o agendador do banco (pg_cron, a cada 10 min) com o cabeçalho x-agente-token          → { acao: "rodar" }
//   - Contratos › Envio, botão "Conferir agora" (login com Contratos: ver)                 → { acao: "situacao", org }
//   - Contratos › Envio, botão "Enviar teste" (login com Contratos: gerir; 5 por hora)       → { acao: "teste", org, canal, destino }
// Sem os segredos de um canal (Edge Functions › Secrets), os envios dele ficam "aguardando configuração" — sem erro.
// Erro de configuração (senha vencida, permissão, modelo) desliga o canal e não gasta tentativa do envio; erro do
// cliente (e-mail ou número que não existe) para de tentar; o resto tenta de novo com espera crescente (banco).
import { bancoServico, bancoUsuario, cabecalhos, resposta } from "../_fiscal/http.ts";
import type { Banco } from "../_fiscal/http.ts";
import { gerarFaturaPdf } from "./nucleo/faturaPdf.ts";
import {
  arquivoFatura,
  assuntoEmail,
  type Canal,
  type Configuracao,
  corpoEmail,
  emailValido,
  type Envio,
  lerConfiguracao,
  numeroWhatsapp,
  parametrosWhatsapp,
  textoFaltam,
} from "./mensagens.ts";
import { type Anexo, conferirWhatsapp, enviarEmail, enviarWhatsapp, type Resultado, tokenGraph } from "./provedores.ts";

const ORCAMENTO_MS = 100_000; // não começa envio novo depois disso (a função tem ~150 s)
const LOTE = 20;

interface EstadoCanal {
  configurado: boolean;
  detalhe: string;
  faltam: string[];
}

/** Confere cada canal (sem mostrar segredos) e grava o estado no banco (liga/desliga a fila do canal). */
async function conferirCanais(sb: Banco, cfg: Configuracao): Promise<Record<Canal, EstadoCanal>> {
  const estado = {} as Record<Canal, EstadoCanal>;
  for (const canal of ["email", "whatsapp"] as Canal[]) {
    const faltam = cfg.faltam[canal];
    let configurado = false;
    let detalhe = textoFaltam(faltam);
    let remetente: string | null = null;
    let gravar = true;
    if (!faltam.length && canal === "email" && cfg.email) {
      const t = await tokenGraph(cfg.email);
      if (t.ok) [configurado, detalhe, remetente] = [true, "Microsoft 365 conferido: o aplicativo do HUB entrou.", cfg.email.remetente];
      else if (t.configuracao) detalhe = t.erro;
      else [gravar, detalhe] = [false, t.erro];
    }
    if (!faltam.length && canal === "whatsapp" && cfg.whatsapp) {
      const c = await conferirWhatsapp(cfg.whatsapp);
      if (c.ok) [configurado, detalhe, remetente] = [true, `WhatsApp conferido: número ${c.numero || cfg.whatsapp.numeroId}.`, c.numero || null];
      else if (c.configuracao) detalhe = c.erro;
      else [gravar, detalhe] = [false, c.erro];
    }
    // falha de rede não muda o estado gravado (a próxima rodada confere de novo)
    if (gravar) {
      const { error } = await sb.rpc("fin_envio_canal_estado", { p_canal: canal, p_configurado: configurado, p_detalhe: detalhe, p_remetente: remetente });
      if (error) console.error("fatura-enviar: estado do canal não gravou", canal, error.code);
    }
    estado[canal] = { configurado, detalhe, faltam }; // sem rede: não manda nesta rodada
  }
  return estado;
}

// ------------------------------------------------------------------------------------------------ montar a mensagem
const logos = new Map<string, Uint8Array | null>();

/** Logo da organização para o PDF: só do Storage da própria organização ou do site da MDC (como o demonstrativo-pdf). */
async function logoDa(sb: Banco, org: string, url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  const permitida =
    (url.startsWith("storage:") && url.slice(8).startsWith(`${org}/`) && !url.includes("..")) || /^https:\/\/(www\.)?mdcassessoria\.com\//.test(url);
  if (!permitida) return null;
  if (!logos.has(url)) {
    try {
      if (url.startsWith("storage:")) {
        const { data } = await sb.storage.from("hub-arquivos").download(url.slice(8));
        logos.set(url, data ? new Uint8Array(await data.arrayBuffer()) : null);
      } else {
        const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        logos.set(url, r.ok ? new Uint8Array(await r.arrayBuffer()) : null);
      }
    } catch {
      logos.set(url, null);
    }
  }
  return logos.get(url) ?? null;
}

async function pdfDa(sb: Banco, e: Envio): Promise<Uint8Array> {
  const t = e.tomador;
  return await gerarFaturaPdf({
    // deno-lint-ignore no-explicit-any
    fatura: e.fatura as any,
    cliente: { nome: t.nome ?? "Cliente", documento: t.documento, email: t.email, cidade: [t.cidade, t.uf].filter(Boolean).join("/") || null },
    contrato: e.contrato,
    logo: await logoDa(sb, e.org, e.logo_url),
  });
}

/** XML da NFS-e emitida (bucket fiscal, pasta da própria organização). */
async function xmlNfse(sb: Banco, e: Envio): Promise<Anexo | null | "faltou"> {
  const caminho = e.nfse?.xml_caminho;
  if (!e.conteudo.includes("nfse") || !caminho) return null;
  if (!caminho.startsWith(`${e.org}/`) || caminho.includes("..")) return "faltou";
  const { data } = await sb.storage.from("fiscal").download(caminho);
  if (!data) return "faltou";
  return { nome: `NFS-e-${e.nfse?.numero ?? "nota"}.xml`, tipo: "application/xml", bytes: new Uint8Array(await data.arrayBuffer()) };
}

async function enviarUm(sb: Banco, cfg: Configuracao, e: Envio): Promise<Resultado> {
  if (e.canal === "email") {
    if (!emailValido(e.destino)) return { ok: false, erro: "O e-mail de envio do cliente está em branco ou incompleto: corrija no contrato.", definitivo: true, configuracao: false };
    const xml = await xmlNfse(sb, e);
    if (xml === "faltou") return { ok: false, erro: "O arquivo XML da NFS-e não foi encontrado; o HUB tenta de novo mais tarde.", definitivo: false, configuracao: false };
    const anexos: Anexo[] = [{ nome: arquivoFatura(e.fatura.numero), tipo: "application/pdf", bytes: await pdfDa(sb, e) }];
    if (xml) anexos.push(xml);
    return await enviarEmail(cfg.email!, { para: e.destino, assunto: assuntoEmail(e), html: corpoEmail(e), anexos, marca: `hub-envio-${e.envio}-${e.tentativa}` });
  }
  const para = numeroWhatsapp(e.destino);
  if (!para) return { ok: false, erro: "O WhatsApp de envio do cliente está incompleto (precisa do DDD): corrija no contrato.", definitivo: true, configuracao: false };
  return await enviarWhatsapp(cfg.whatsapp!, { para, pdf: await pdfDa(sb, e), arquivo: arquivoFatura(e.fatura.numero), parametros: parametrosWhatsapp(e) });
}

/** Rodada do agendador: confere os canais e manda a fila pronta, lote a lote, até o tempo acabar. */
async function rodar(sb: Banco) {
  const inicio = Date.now();
  const cfg = lerConfiguracao((n) => Deno.env.get(n));
  const estado = await conferirCanais(sb, cfg);
  const ligado: Record<Canal, boolean> = { email: estado.email.configurado && !!cfg.email, whatsapp: estado.whatsapp.configurado && !!cfg.whatsapp };
  const total = { enviados: 0, falhas: 0, adiados: 0 };
  if (!ligado.email && !ligado.whatsapp) return { canais: estado, ...total };
  for (let rodada = 0; rodada < 5 && Date.now() - inicio < ORCAMENTO_MS; rodada++) {
    const { data, error } = await sb.rpc("fin_envio_reservar", { p_limite: LOTE });
    if (error) {
      console.error("fatura-enviar: reservar falhou", error.code);
      break;
    }
    const lote = (data ?? []) as Envio[];
    if (!lote.length) break;
    for (const e of lote) {
      // canal desligado nesta rodada ou tempo acabando: a reserva vence em 5 min e o envio volta para a fila
      if (!ligado[e.canal] || Date.now() - inicio > ORCAMENTO_MS) {
        total.adiados++;
        continue;
      }
      let r: Resultado;
      try {
        r = await enviarUm(sb, cfg, e);
      } catch (x) {
        console.error("fatura-enviar: erro ao montar o envio", e.envio, (x as Error)?.name);
        r = { ok: false, erro: "O HUB não conseguiu montar a mensagem desta fatura; tenta de novo mais tarde.", definitivo: false, configuracao: false };
      }
      if (!r.ok && r.configuracao) {
        ligado[e.canal] = false;
        estado[e.canal] = { configurado: false, detalhe: r.erro, faltam: [] };
        await sb.rpc("fin_envio_canal_estado", { p_canal: e.canal, p_configurado: false, p_detalhe: r.erro, p_remetente: null });
        total.adiados++;
        continue;
      }
      const { error: eRes } = await sb.rpc("fin_envio_resultado", {
        p_envio: e.envio,
        p: r.ok ? { ok: true, mensagem_id: r.id } : { ok: false, erro: r.erro, definitivo: r.definitivo },
      });
      if (eRes) console.error("fatura-enviar: resultado não gravou", e.envio, eRes.code);
      if (r.ok) total.enviados++;
      else total.falhas++;
    }
    if (lote.length < LOTE) break;
  }
  return { canais: estado, ...total };
}

// ------------------------------------------------------------------------------------------------ teste
/** Fatura de exemplo do teste: sai com a marca CANCELADA ("não pague") para ninguém confundir com cobrança. */
function envioDeTeste(canal: Canal, destino: string, org: string): Envio {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return {
    envio: 0,
    canal,
    destino,
    conteudo: ["fatura"],
    etapa: "principal",
    tentativa: 1,
    org,
    cliente: "",
    logo_url: null,
    fatura: {
      id: "",
      numero: "TESTE",
      emissao: hoje,
      vencimento: hoje,
      competencia: hoje.slice(0, 8) + "01",
      valor: 0,
      descricao: "Mensagem de teste do envio de faturas do HUB",
      documento: "fatura",
      envio: "fatura",
      situacao: "cancelada",
      nfse_situacao: "nao_se_aplica",
      nfse_numero: null,
      boleto_situacao: "nao_se_aplica",
      servico_codigo: null,
      iss_aliquota: null,
      cancelamento_motivo: "Teste do HUB",
    },
    contrato: null,
    tomador: { nome: "Teste do HUB", documento: null, email: null, cidade: null, uf: null },
    nfse: null,
    boleto: null,
  };
}

async function testar(sb: Banco, canal: Canal, destino: string, org: string) {
  const cfg = lerConfiguracao((n) => Deno.env.get(n));
  if (!cfg[canal]) return { ok: false, erro: textoFaltam(cfg.faltam[canal]) };
  const { data: logoUrl } = await sb.from("organizacoes").select("logo_url").eq("id", org).single();
  const e = { ...envioDeTeste(canal, destino, org), logo_url: (logoUrl as { logo_url: string | null } | null)?.logo_url ?? null };
  const r =
    canal === "email"
      ? await enviarEmail(cfg.email!, {
          para: destino,
          assunto: "Teste do envio de faturas · HUB da MDC",
          html:
            '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px">' +
            "<p>Este é um teste do envio automático de faturas do HUB da MDC.</p>" +
            "<p>Se chegou, o e-mail está configurado. O PDF em anexo é só um exemplo (marcado como cancelado): não pague.</p></div>",
          anexos: [{ nome: "Fatura-TESTE.pdf", tipo: "application/pdf", bytes: await pdfDa(sb, e) }],
          marca: `hub-teste-${Date.now()}`,
        })
      : await enviarUm(sb, cfg, e);
  if (!r.ok && r.configuracao) await sb.rpc("fin_envio_canal_estado", { p_canal: canal, p_configurado: false, p_detalhe: r.erro, p_remetente: null });
  return r.ok ? { ok: true, mensagem: canal === "email" ? `E-mail de teste enviado para ${destino}.` : `WhatsApp de teste enviado para ${destino}.` } : { ok: false, erro: r.erro };
}

// ------------------------------------------------------------------------------------------------ entrada
Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const sb = bancoServico();
  let corpo: { acao?: string; org?: string; canal?: string; destino?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    /* corpo vazio */
  }
  try {
    // 1) agendador do banco
    const token = req.headers.get("x-agente-token");
    if (token) {
      const ok = await sb.rpc("fin_envio_token_confere", { p_token: token });
      if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });
      return json(200, await rodar(sb));
    }

    // 2) telas de Contratos (login de quem chamou; o banco confere a permissão)
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { erro: "Faça login." });
    const org = String(corpo.org ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(org)) return json(400, { erro: "Organização inválida." });
    const usuario = bancoUsuario(auth);
    if (corpo.acao === "situacao") {
      const { error } = await usuario.rpc("fin_envio_situacao", { p_org: org });
      if (error) return json(403, { erro: "Sem permissão para ver os envios (módulo Contratos)." });
      return json(200, { canais: await conferirCanais(sb, lerConfiguracao((n) => Deno.env.get(n))) });
    }
    if (corpo.acao === "teste") {
      const canal = corpo.canal === "whatsapp" ? "whatsapp" : corpo.canal === "email" ? "email" : null;
      if (!canal) return json(400, { erro: "Escolha e-mail ou WhatsApp." });
      // o banco confere quem gere Contratos, valida o destino, limita a 5 por hora e registra na auditoria
      const { data, error } = await usuario.rpc("fin_envio_teste_registrar", { p_org: org, p_canal: canal, p_destino: String(corpo.destino ?? "") });
      if (error) return json(400, { erro: error.message });
      const destino = String((data as { destino?: string } | null)?.destino ?? "");
      const r = await testar(sb, canal, destino, org);
      return json(r.ok ? 200 : 502, r);
    }
    return json(400, { erro: "Ação desconhecida." });
  } catch (x) {
    console.error("fatura-enviar: erro inesperado", (x as Error)?.name);
    return json(500, { erro: "Não foi possível concluir agora. Tente de novo em alguns minutos." });
  }
});
