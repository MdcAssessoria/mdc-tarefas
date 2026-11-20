// Função omie-sincronizar (HUB-MDC · BI de Gestão)
// Traz da Omie, para o banco do HUB, as categorias, as NF-e, as NFS-e e os títulos (a pagar e a receber)
// de UMA empresa por chamada. Quem chama é a rotina agendada (cron) com o cabeçalho x-agente-token.
//
// Chaves da Omie: segredos da Função Edge, cadastrados pelo administrador no painel do Supabase
//   OMIE_<credencial>_KEY e OMIE_<credencial>_SECRET   (credencial = coluna omie_empresas.credencial)
// Nunca grave chave no banco nem no código.
//
// Janela de cada rodada:
//   - carga inicial: de omie_empresas.sincronizar_desde em diante, 1 mês por rodada (carga_ate guarda até onde foi);
//   - depois: notas dos últimos 90 dias + títulos alterados desde a última rodada boa (com 3 dias de folga).
//
// Trazida para o repositório em 20/11/2026 (estava só publicada, versão 9); a única mudança foi a leitura da chave de
// serviço pelo leitor compartilhado (SEG-01: chave nova com volta à antiga).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chaveSecreta } from "../_compartilhado/chaves.ts";

const OMIE = "https://app.omie.com.br/api/v1/";
const POR_PAGINA = 500;
const LIMITE_MS = 110_000; // para antes do limite da Função Edge
const INTERVALO_MIN_HORAS = 3; // de quanto em quanto tempo cada empresa é atualizada

type Empresa = {
  cliente_id: string; org_id: string; credencial: string; sincronizar_desde: string;
  carga_completa_feita: boolean; carga_ate: string | null; ultimo_ok: string | null; pedido_em: string | null;
};

class ErroOmie extends Error {}
class TempoEsgotado extends Error {}

// ---------- utilidades ----------
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
/** "dd/mm/aaaa" → "aaaa-mm-dd" (ou null) */
const dataISO = (v: unknown) => {
  const m = String(v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
/** "aaaa-mm-dd" → "dd/mm/aaaa" */
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somaDias = (iso: string, dias: number) => new Date(Date.parse(iso + "T12:00:00Z") + dias * 86400_000).toISOString().slice(0, 10);
const fimDoMes = (iso: string) => {
  const d = new Date(Date.parse(iso.slice(0, 8) + "01T12:00:00Z"));
  d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- chamada à Omie ----------
class ClienteOmie {
  constructor(private key: string, private secret: string, private inicio: number) {}

  // deno-lint-ignore no-explicit-any
  async chamar(caminho: string, call: string, param: Record<string, unknown>): Promise<any> {
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      if (Date.now() - this.inicio > LIMITE_MS) throw new TempoEsgotado("tempo da rodada esgotado");
      const resp = await fetch(OMIE + caminho, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call, app_key: this.key, app_secret: this.secret, param: [param] }),
      });
      const corpo = await resp.json().catch(() => ({}));
      const falha = String(corpo?.faultstring ?? "");
      if (resp.ok && !falha) return corpo;
      // "não existem registros" não é erro: página vazia
      if (/n[aã]o existem registros/i.test(falha)) return null;
      // consumo redundante / limite de requisições: espera e tenta de novo
      if (resp.status === 429 || /redundante|bloquead|limite/i.test(falha)) { await espera(6000 * tentativa); continue; }
      if (resp.status >= 500 && tentativa < 4) { await espera(3000 * tentativa); continue; }
      throw new ErroOmie(`${call}: ${falha || "HTTP " + resp.status}`.slice(0, 300));
    }
    throw new ErroOmie(`${call}: a Omie recusou as tentativas (limite de consumo)`);
  }

  /** percorre todas as páginas; lista = nome do array no retorno */
  async todas(caminho: string, call: string, param: Record<string, unknown>, estilo: "omie" | "n", lista: string) {
    // deno-lint-ignore no-explicit-any
    const itens: any[] = [];
    for (let pagina = 1; ; pagina++) {
      const p = estilo === "n" ? { ...param, nPagina: pagina, nRegPorPagina: POR_PAGINA }
                               : { ...param, pagina, registros_por_pagina: POR_PAGINA };
      const r = await this.chamar(caminho, call, p);
      if (!r) break;
      itens.push(...(r[lista] ?? []));
      const total = estilo === "n" ? r.nTotPaginas : r.total_de_paginas;
      if (!total || pagina >= total) break;
    }
    return itens;
  }
}

// ---------- conversão dos registros da Omie ----------
// deno-lint-ignore no-explicit-any
function converterCategoria(c: any, e: Empresa) {
  return {
    cliente_id: e.cliente_id, org_id: e.org_id, codigo: String(c.codigo),
    descricao: c.descricao ?? null, categoria_superior: c.categoria_superior || null,
    conta_receita: c.conta_receita === "S", conta_despesa: c.conta_despesa === "S",
    totalizadora: c.totalizadora === "S", inativa: c.conta_inativa === "S",
    dados: c, atualizado_em: new Date().toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
function converterNFe(n: any, e: Empresa) {
  const ide = n.ide ?? {}, tot = n.total?.ICMSTot ?? {}, iss = n.total?.ISSQNtot ?? {};
  const situacao = ide.dCan ? "cancelada" : ide.cDeneg === "S" ? "denegada" : ide.dInut ? "outra" : "autorizada";
  const id = String(n.compl?.nIdNF ?? `${ide.serie}-${ide.nNF}`);
  const cfops = new Map<string, number>();
  for (const d of n.det ?? []) {
    const p = d.prod ?? {};
    const cfop = digitos(p.CFOP).slice(0, 4);
    if (!cfop) continue;
    cfops.set(cfop, (cfops.get(cfop) ?? 0) + num(p.vProd) - num(p.vDesc));
  }
  return {
    nota: {
      cliente_id: e.cliente_id, org_id: e.org_id, modelo: "nfe", id_omie: id,
      numero: ide.nNF ?? null, serie: ide.serie ?? null, chave: n.compl?.cChaveNFe || null,
      emissao: dataISO(ide.dEmi), tipo: ide.tpNF === "0" ? "entrada" : "saida", situacao,
      cnpj_cpf_dest: digitos(n.nfDestInt?.cnpj_cpf) || null, nome_dest: n.nfDestInt?.cRazao ?? null,
      valor_total: num(tot.vNF), valor_produtos: num(tot.vProd), valor_servicos: num(iss.vServ),
      valor_desconto: num(tot.vDesc), icms: num(tot.vICMS), icms_st: num(tot.vST), ipi: num(tot.vIPI),
      pis: num(tot.vPIS) + num(iss.vPIS), cofins: num(tot.vCOFINS) + num(iss.vCOFINS), iss: num(iss.vISS),
      dados: n, atualizado_em: new Date().toISOString(),
    },
    cfops: [...cfops].map(([cfop, valor]) => ({ cliente_id: e.cliente_id, modelo: "nfe", id_omie: id, cfop, valor: num(valor) })),
  };
}

// deno-lint-ignore no-explicit-any
function converterNFSe(n: any, e: Empresa) {
  const cab = n.Cabecalho ?? {}, val = n.Valores ?? {};
  const cancelada = !!n.Cancelamento?.cDataCancelamento || cab.cStatusNFSe === "C";
  const situacao = cancelada ? "cancelada" : (!cab.nNumeroNFSe || cab.cAmbienteNFSe === "H") ? "outra" : "autorizada";
  const id = String(cab.nCodNF ?? `${cab.cSerieNFSe}-${cab.nNumeroNFSe}`);
  const total = num(val.nValorTotalServicos) || num(cab.nValorNFSe);
  return {
    nota: {
      cliente_id: e.cliente_id, org_id: e.org_id, modelo: "nfse", id_omie: id,
      numero: cab.nNumeroNFSe ?? null, serie: cab.cSerieNFSe ?? null, chave: null,
      emissao: dataISO(n.Emissao?.cDataEmissao), tipo: "saida", situacao,
      cnpj_cpf_dest: digitos(cab.cCNPJDestinatario || cab.cCPFDestinatario) || null, nome_dest: cab.cRazaoDestinatario ?? null,
      valor_total: total, valor_produtos: 0, valor_servicos: total, valor_desconto: 0,
      icms: 0, icms_st: 0, ipi: 0, pis: num(val.nValorPIS), cofins: num(val.nValorCOFINS), iss: num(val.nValorISS),
      dados: n, atualizado_em: new Date().toISOString(),
    },
    cfops: [{ cliente_id: e.cliente_id, modelo: "nfse", id_omie: id, cfop: "SERV", valor: total }],
  };
}

/** um título da Omie vira uma linha por categoria do rateio */
// deno-lint-ignore no-explicit-any
function converterMovimento(m: any, e: Empresa) {
  const d = m.detalhes ?? {}, r = m.resumo ?? {};
  if (d.cNatureza !== "R" && d.cNatureza !== "P") return [];
  const movCC = Number(d.nCodMovCC ?? 0) > 0 || Number(d.nCodBaixa ?? 0) > 0;
  const pagoTotal = movCC ? Math.abs(num(d.nValorMovCC)) : num(r.nValPago);
  const cats: { cod: string; pct: number }[] = (m.categorias ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((c: any) => c.cCodCateg)
    // deno-lint-ignore no-explicit-any
    .map((c: any) => ({ cod: String(c.cCodCateg), pct: num(c.nDistrPercentual) }));
  if (!cats.length) cats.push({ cod: d.cCodCateg ?? "", pct: 100 });
  const somaPct = cats.reduce((s, c) => s + c.pct, 0) || 100;
  return cats.map((c) => ({
    cliente_id: e.cliente_id, org_id: e.org_id,
    chave: [d.nCodTitulo, d.nCodBaixa ?? 0, d.nCodMovCC ?? 0, c.cod].join("|"),
    codigo_titulo: String(d.nCodTitulo), natureza: d.cNatureza, categoria_codigo: c.cod || null,
    documento: d.cNumDocFiscal || d.cNumTitulo || null, cnpj_cpf: digitos(d.cCPFCNPJCliente) || null, nome: null,
    conta_corrente: d.nCodCC ? String(d.nCodCC) : null, status: d.cStatus ?? null,
    emissao: dataISO(d.dDtEmissao), registro: dataISO(d.dDtRegistro), vencimento: dataISO(d.dDtVenc),
    pagamento: dataISO(d.dDtPagamento),
    valor_documento: num(num(d.nValorTitulo) * c.pct / somaPct),
    valor_pago: dataISO(d.dDtPagamento) ? num(pagoTotal * c.pct / somaPct) : 0,
    dados: { ...m, _tem_mov_cc: movCC }, atualizado_em: new Date().toISOString(),
  }));
}

// ---------- gravação ----------
// deno-lint-ignore no-explicit-any
async function gravar(db: SupabaseClient, tabela: string, linhas: any[], conflito: string) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await db.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: conflito });
    if (error) throw new Error(`gravar ${tabela}: ${error.message}`);
  }
}

// deno-lint-ignore no-explicit-any
async function gravarNotas(db: SupabaseClient, convertidas: { nota: any; cfops: any[] }[]) {
  if (!convertidas.length) return;
  await gravar(db, "omie_notas", convertidas.map((c) => c.nota), "cliente_id,modelo,id_omie");
  // CFOPs: refaz os de cada nota (a nota pode ter sido corrigida/cancelada)
  for (let i = 0; i < convertidas.length; i += 200) {
    const lote = convertidas.slice(i, i + 200);
    const { cliente_id, modelo } = lote[0].nota;
    const { error } = await db.from("omie_nota_cfops").delete()
      .eq("cliente_id", cliente_id).eq("modelo", modelo).in("id_omie", lote.map((c) => c.nota.id_omie));
    if (error) throw new Error(`limpar cfops: ${error.message}`);
  }
  await gravar(db, "omie_nota_cfops", convertidas.flatMap((c) => c.cfops), "cliente_id,modelo,id_omie,cfop");
}

// deno-lint-ignore no-explicit-any
async function gravarMovimentos(db: SupabaseClient, e: Empresa, brutos: any[]) {
  let linhas = brutos.flatMap((m) => converterMovimento(m, e));
  // se o título tem baixas próprias (movimento de conta corrente), a linha "resumo" do título não conta no caixa
  const comBaixa = new Set(linhas.filter((l) => l.dados._tem_mov_cc).map((l) => l.codigo_titulo));
  linhas = linhas.map((l) => (comBaixa.has(l.codigo_titulo) && !l.dados._tem_mov_cc ? { ...l, valor_pago: 0 } : l));
  // a mesma chave pode vir repetida entre páginas: fica a última
  const unicas = [...new Map(linhas.map((l) => [l.chave, l])).values()];
  await gravar(db, "omie_movimentos", unicas, "cliente_id,chave");
  // títulos que voltaram nesta rodada: linhas antigas que sumiram (baixa estornada, rateio trocado) ficam canceladas
  const porTitulo = new Map<string, string[]>();
  for (const l of unicas) porTitulo.set(l.codigo_titulo, [...(porTitulo.get(l.codigo_titulo) ?? []), l.chave]);
  const titulos = [...porTitulo.keys()];
  for (let i = 0; i < titulos.length; i += 200) {
    const parte = titulos.slice(i, i + 200);
    const { data, error } = await db.from("omie_movimentos").select("chave,codigo_titulo")
      .eq("cliente_id", e.cliente_id).in("codigo_titulo", parte);
    if (error) throw new Error(`conferir títulos: ${error.message}`);
    const sumiram = (data ?? []).filter((r) => !porTitulo.get(r.codigo_titulo)!.includes(r.chave)).map((r) => r.chave);
    if (sumiram.length) {
      const u = await db.from("omie_movimentos").update({ status: "cancelado (não está mais na Omie)", valor_pago: 0, atualizado_em: new Date().toISOString() })
        .eq("cliente_id", e.cliente_id).in("chave", sumiram);
      if (u.error) throw new Error(`cancelar linhas antigas: ${u.error.message}`);
    }
  }
  return unicas.length;
}

// ---------- uma rodada para uma empresa ----------
async function sincronizar(db: SupabaseClient, e: Empresa, inicio: number) {
  const key = Deno.env.get(`OMIE_${e.credencial}_KEY`), secret = Deno.env.get(`OMIE_${e.credencial}_SECRET`);
  if (!key || !secret) throw new ErroOmie(`Chaves da Omie não cadastradas (segredos OMIE_${e.credencial}_KEY e OMIE_${e.credencial}_SECRET).`);
  const omie = new ClienteOmie(key, secret, inicio);
  const hoje = hojeSP();

  // janela
  let de: string, ate: string, cargaInicial = false;
  if (!e.carga_completa_feita) {
    cargaInicial = true;
    de = e.carga_ate ? somaDias(e.carga_ate, 1) : e.sincronizar_desde;
    ate = fimDoMes(de) < hoje ? fimDoMes(de) : hoje;
  } else {
    de = somaDias(hoje, -90); ate = hoje;
  }

  const { data: exec } = await db.from("omie_execucoes")
    .insert({ org_id: e.org_id, cliente_id: e.cliente_id, janela_de: de, janela_ate: ate }).select("id").single();
  const contagem: Record<string, number> = {};

  // 1) categorias (sempre: são poucas)
  const cats = await omie.todas("geral/categorias/", "ListarCategorias", {}, "omie", "categoria_cadastro");
  await gravar(db, "omie_categorias", cats.filter((c) => c.codigo).map((c) => converterCategoria(c, e)), "cliente_id,codigo");
  contagem.categorias = cats.length;

  // 2) NF-e e 3) NFS-e pela data de emissão
  const nfe = await omie.todas("produtos/nfconsultar/", "ListarNF",
    { dEmiInicial: dataBR(de), dEmiFinal: dataBR(ate), apenas_importado_api: "N" }, "omie", "nfCadastro");
  await gravarNotas(db, nfe.map((n) => converterNFe(n, e)));
  contagem.nfe = nfe.length;

  const nfse = await omie.todas("servicos/nfse/", "ListarNFSEs",
    { dEmiInicial: dataBR(de), dEmiFinal: dataBR(ate) }, "n", "nfseEncontradas");
  await gravarNotas(db, nfse.map((n) => converterNFSe(n, e)));
  contagem.nfse = nfse.length;

  // 4) títulos: na carga inicial pela emissão; depois, pelos alterados desde a última rodada boa
  const filtroTit = cargaInicial
    ? { dDtEmisDe: dataBR(de), dDtEmisAte: dataBR(ate) }
    : { dDtAltDe: dataBR(somaDias((e.ultimo_ok ?? hoje).slice(0, 10), -3)), dDtAltAte: dataBR(hoje) };
  const movs = await omie.todas("financas/mf/", "ListarMovimentos", filtroTit, "n", "movimentos");
  contagem.titulos = await gravarMovimentos(db, e, movs);

  // fecha a rodada
  const fim = new Date().toISOString();
  const resumo = `${cargaInicial ? "Carga" : "Atualização"} ${de} a ${ate}: ${contagem.nfe} NF-e, ${contagem.nfse} NFS-e, ${contagem.titulos} linhas de títulos.`;
  await db.from("omie_execucoes").update({ fim, situacao: "ok", contagem }).eq("id", exec!.id);
  const upd: Record<string, unknown> = { ultima_sync: fim, ultimo_ok: fim, ultimo_resultado: resumo, pedido_em: null };
  if (cargaInicial) { upd.carga_ate = ate; if (ate >= hoje) upd.carga_completa_feita = true; }
  await db.from("omie_empresas").update(upd).eq("cliente_id", e.cliente_id);
  return resumo;
}

/** escolhe a empresa da vez: pedido pela tela > carga inicial pendente > a mais antiga vencida */
async function proximaEmpresa(db: SupabaseClient): Promise<Empresa | null> {
  // não roda se outra rodada começou há menos de 10 minutos
  const { data: rodando } = await db.from("omie_execucoes").select("id")
    .eq("situacao", "rodando").gt("inicio", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (rodando?.length) return null;
  // rodadas que ficaram "rodando" (queda) viram erro
  await db.from("omie_execucoes").update({ situacao: "erro", erro: "rodada interrompida", fim: new Date().toISOString() })
    .eq("situacao", "rodando");

  const { data } = await db.from("omie_empresas")
    .select("cliente_id,org_id,credencial,sincronizar_desde,carga_completa_feita,carga_ate,ultimo_ok,ultima_sync,pedido_em")
    .eq("ativo", true);
  // deno-lint-ignore no-explicit-any
  const vencida = (e: any) => !e.ultima_sync || Date.now() - Date.parse(e.ultima_sync) > INTERVALO_MIN_HORAS * 3600_000;
  // deno-lint-ignore no-explicit-any
  const lista = (data ?? []) as any[];
  return lista.filter((e) => e.pedido_em).sort((a, b) => a.pedido_em.localeCompare(b.pedido_em))[0]
    ?? lista.filter((e) => !e.carga_completa_feita).sort((a, b) => (a.ultima_sync ?? "").localeCompare(b.ultima_sync ?? ""))[0]
    ?? lista.filter(vencida).sort((a, b) => (a.ultima_sync ?? "").localeCompare(b.ultima_sync ?? ""))[0]
    ?? null;
}

Deno.serve(async (req) => {
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, chaveSecreta(), { auth: { persistSession: false } });
  const token = req.headers.get("x-agente-token") ?? "";
  const ok = await db.rpc("omie_token_confere", { p_token: token });
  if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });

  const inicio = Date.now();
  const e = await proximaEmpresa(db);
  if (!e) return json(200, { resultado: "nada a fazer" });

  try {
    const resumo = await sincronizar(db, e, inicio);
    return json(200, { cliente_id: e.cliente_id, resultado: resumo });
  } catch (err) {
    const msg = err instanceof TempoEsgotado ? "Rodada parou por tempo; continua na próxima (nada se perdeu)."
              : err instanceof ErroOmie ? err.message
              : "Falha inesperada na sincronização.";
    if (!(err instanceof ErroOmie) && !(err instanceof TempoEsgotado)) console.error("omie-sincronizar", e.cliente_id, err);
    await db.from("omie_execucoes").update({ situacao: "erro", erro: msg, fim: new Date().toISOString() })
      .eq("cliente_id", e.cliente_id).eq("situacao", "rodando");
    await db.from("omie_empresas").update({ ultima_sync: new Date().toISOString(), ultimo_resultado: msg }).eq("cliente_id", e.cliente_id);
    return json(200, { cliente_id: e.cliente_id, erro: msg });
  }
});
