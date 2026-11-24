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
// Saldos dos bancos (105) e movimentos do extrato (106, omie_extrato): depois dos títulos, lê as contas correntes e grava o saldo do começo e do fim do mês em
// omie_saldos (os 2 últimos meses a cada rodada + até 4 meses que faltam desde sincronizar_desde). Falha ou falta de tempo
// nesta parte não derruba a rodada: fica anotada na contagem e continua na próxima.
//
// Centro de custo e pedidos (117, 24/11/2026): os títulos vêm com o rateio por departamento (cExibirDepartamentos; se a
// Omie recusar o parâmetro, segue sem ele e anota na contagem), os departamentos são lidos a cada rodada e os pedidos de
// venda entram em omie_pedidos (carga pela inclusão, depois pelos alterados). Falha nos pedidos não derruba a rodada.
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
  const deps = rateioDepartamentos(m);
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
    departamentos: deps,
    dados: { ...m, _tem_mov_cc: movCC }, atualizado_em: new Date().toISOString(),
  }));
}

/** rateio do título por departamento (centro de custo): [{codigo, pct}] somando 100; vazio = sem centro */
// deno-lint-ignore no-explicit-any
function rateioDepartamentos(m: any): { codigo: string; pct: number }[] {
  // deno-lint-ignore no-explicit-any
  const brutos = (Array.isArray(m.departamentos) ? m.departamentos : []).map((d: any) => ({
    codigo: String(d.cCodDepartamento ?? d.cCodDep ?? d.codigo ?? "").trim(),
    pct: num(d.nDistrPercentual ?? d.nPerDep ?? d.percentual),
    valor: num(d.nDistrValor ?? d.nValDep ?? d.valor),
  })).filter((d: { codigo: string }) => d.codigo);
  if (!brutos.length) return [];
  let soma = brutos.reduce((s: number, d: { pct: number }) => s + d.pct, 0);
  // sem percentual, reparte pelo valor; sem nada, em partes iguais
  if (!soma) {
    const somaV = brutos.reduce((s: number, d: { valor: number }) => s + d.valor, 0);
    brutos.forEach((d: { pct: number; valor: number }) => (d.pct = somaV ? (d.valor * 100) / somaV : 100 / brutos.length));
    soma = 100;
  }
  return brutos.map((d: { codigo: string; pct: number }) => ({ codigo: d.codigo, pct: Math.round((d.pct * 100 * 10000) / soma) / 10000 }));
}

// deno-lint-ignore no-explicit-any
function converterDepartamento(d: any, e: Empresa) {
  return {
    cliente_id: e.cliente_id, org_id: e.org_id, codigo: String(d.codigo ?? d.cCodigo ?? "").trim(),
    descricao: d.descricao ?? d.cDescricao ?? null, estrutura: d.estrutura ?? d.cEstrutura ?? null,
    inativo: String(d.inativo ?? d.cInativo ?? "N").toUpperCase() === "S",
    dados: d, atualizado_em: new Date().toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
function converterPedido(p: any, e: Empresa, etapas: Map<string, string>) {
  const cab = p.cabecalho ?? {}, info = p.infoCadastro ?? {}, tot = p.total_pedido ?? {}, adic = p.informacoes_adicionais ?? {};
  // deno-lint-ignore no-explicit-any
  const det: any[] = Array.isArray(p.det) ? p.det : [];
  const somaItens = det.reduce((s, d) => s + num(d.produto?.valor_total), 0);
  const quantidade = det.reduce((s, d) => s + (Number(String(d.produto?.quantidade ?? 0).replace(",", ".")) || 0), 0);
  const etapa = cab.etapa != null ? String(cab.etapa) : null;
  const sim = (v: unknown) => String(v ?? "").toUpperCase() === "S";
  return {
    cliente_id: e.cliente_id, org_id: e.org_id, codigo_pedido: String(cab.codigo_pedido),
    numero: cab.numero_pedido != null ? String(cab.numero_pedido) : null,
    numero_cliente: adic.numero_pedido_cliente || null,
    codigo_cliente: cab.codigo_cliente != null ? String(cab.codigo_cliente) : null,
    etapa, etapa_nome: etapa ? (etapas.get(etapa) ?? null) : null,
    inclusao: dataISO(info.dInc), previsao: dataISO(cab.data_previsao),
    faturado: sim(info.faturado), faturamento: dataISO(info.dFat),
    cancelado: sim(info.cancelado) || sim(cab.cancelado),
    // 119: encerrado na Omie sem faturar não é mais carteira
    encerrado: sim(cab.encerrado),
    valor: num(tot.valor_total_pedido) || num(somaItens),
    quantidade: Math.round(quantidade * 1000) / 1000,
    itens: Number(cab.quantidade_itens) || det.length,
    dados: p, atualizado_em: new Date().toISOString(),
  };
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


// ---------- saldos dos bancos (105) ----------
/** Lê um campo numérico do retorno da Omie sem depender de maiúsculas/minúsculas (nSaldoAnterior, nsaldoanterior…). */
// deno-lint-ignore no-explicit-any
function campoNum(o: any, ...nomes: string[]): number | null {
  if (!o || typeof o !== "object") return null;
  const alvo = nomes.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(o)) if (alvo.includes(k.toLowerCase()) && v !== null && v !== "") return num(v);
  return null;
}
const meses = (de: string, ate: string) => {
  const r: string[] = [];
  for (let m = de.slice(0, 7) + "-01"; m <= ate; m = somaDias(fimDoMes(m), 1)) r.push(m);
  return r;
};

async function sincronizarSaldos(db: SupabaseClient, omie: ClienteOmie, e: Empresa, hoje: string) {
  const contas = await omie.todas("geral/contacorrente/", "ListarContasCorrentes", { apenas_importado_api: "N" }, "omie", "ListarContasCorrentes");
  // inclui as contas inativas (21/11/2026): uma conta encerrada depois ainda tem o extrato dos meses em que foi usada
  // (Claratec, jul–ago/2025: R$ 218 mil recebidos numa conta hoje inativa ficavam fora do saldo e o fluxo não fechava)
  // deno-lint-ignore no-explicit-any
  const ativas = contas.filter((c: any) => c.nCodCC);
  const todos = meses(e.sincronizar_desde, hoje);
  let gravados = 0;
  let extrato = 0;
  for (const c of ativas) {
    const cc = String(c.nCodCC);
    // mês "pronto" = saldo gravado E extrato gravado (106); os meses com saldo da 105 voltam uma vez para trazer o extrato
    const { data } = await db.from("omie_saldos").select("mes, dados").eq("cliente_id", e.cliente_id).eq("conta_corrente", cc);
    const tem = new Set((data ?? []).filter((r) => r.dados?.extrato === true).map((r) => String(r.mes).slice(0, 10)));
    const faltam = todos.filter((m) => !tem.has(m)).slice(0, 4);
    const pedir = [...new Set([...todos.slice(-2), ...faltam])];
    const linhas = [];
    for (const mes of pedir) {
      const fim = fimDoMes(mes) < hoje ? fimDoMes(mes) : hoje;
      const r = await omie.chamar("financas/extrato/", "ListarExtrato", { nCodCC: Number(cc), dPeriodoInicial: dataBR(mes), dPeriodoFinal: dataBR(fim) });
      const anterior = campoNum(r, "nSaldoAnterior", "saldo_anterior");
      const atual = campoNum(r, "nSaldoAtual", "nSaldoFinal", "saldo_atual");
      if (anterior === null || atual === null) throw new ErroOmie("ListarExtrato: a Omie não devolveu os saldos (nSaldoAnterior/nSaldoAtual).");
      // movimentos do mês (106): regrava o mês inteiro desta conta
      const movs = movimentosDoExtrato(r).map((m, i) => converterExtrato(m, e, cc, mes, i));
      const apaga = await db.from("omie_extrato").delete().eq("cliente_id", e.cliente_id).eq("conta_corrente", cc).eq("mes", mes);
      if (apaga.error) throw new Error(`limpar omie_extrato: ${apaga.error.message}`);
      await gravar(db, "omie_extrato", [...new Map(movs.map((x) => [x.lancamento, x])).values()], "cliente_id,conta_corrente,lancamento");
      extrato += movs.length;
      linhas.push({
        cliente_id: e.cliente_id, org_id: e.org_id, conta_corrente: cc, descricao: c.descricao ?? null, mes,
        saldo_anterior: anterior, saldo_final: atual,
        dados: { extrato: true, nSaldoAnterior: anterior, nSaldoAtual: atual, nSaldoConciliado: campoNum(r, "nSaldoConciliado"), nSaldoDisponivel: campoNum(r, "nSaldoDisponivel") },
        atualizado_em: new Date().toISOString(),
      });
    }
    await gravar(db, "omie_saldos", linhas, "cliente_id,conta_corrente,mes");
    gravados += linhas.length;
  }
  return { contas: ativas.length, meses: gravados, extrato };
}


// ---------- movimentos do extrato (106) ----------
/** Primeiro campo do objeto, sem depender de maiúsculas/minúsculas. */
// deno-lint-ignore no-explicit-any
function campo(o: any, ...nomes: string[]): any {
  if (!o || typeof o !== "object") return null;
  const alvo = nomes.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(o)) if (alvo.includes(k.toLowerCase()) && v !== null && v !== "") return v;
  return null;
}
/** Lista de movimentos do retorno do ListarExtrato (listaMovimentos ou o primeiro array de objetos). */
// deno-lint-ignore no-explicit-any
function movimentosDoExtrato(r: any): any[] {
  if (!r || typeof r !== "object") return [];
  for (const [k, v] of Object.entries(r)) if (/movimento/i.test(k) && Array.isArray(v)) return v;
  for (const v of Object.values(r)) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  return [];
}
// deno-lint-ignore no-explicit-any
function converterExtrato(m: any, e: Empresa, cc: string, mes: string, i: number) {
  const data = dataISO(campo(m, "dDataLancamento", "dDataMovimento", "dData", "dDtLancamento"));
  const lanc = campo(m, "nCodLancamento", "nCodLanc", "nCodMovCC", "codigo_lancamento");
  return {
    cliente_id: e.cliente_id, org_id: e.org_id, conta_corrente: cc,
    lancamento: lanc !== null ? String(lanc) : `${mes}#${i}`,
    mes, data,
    valor: campoNum(m, "nValorDocumento", "nValor", "nValorLancamento"),
    natureza: campo(m, "cNatureza", "cTipo"),
    categoria_codigo: campo(m, "cCodCategoria", "cCodCateg"),
    origem: campo(m, "cOrigem", "cTipoDocumento"),
    codigo_titulo: (() => { const t = campo(m, "nCodTitulo"); return t && Number(t) > 0 ? String(t) : null; })(),
    documento: campo(m, "cNumero", "cNumDocumento", "cDocumentoFiscal"),
    pessoa: campo(m, "cRazCliente", "cDesCliente", "cNomeCliente"),
    dados: m, atualizado_em: new Date().toISOString(),
  };
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
  const contagem: Record<string, number | string> = {};

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
  // 117: pede o rateio por departamento; se a Omie não aceitar o parâmetro, segue sem ele
  // deno-lint-ignore no-explicit-any
  let movs: any[];
  try {
    movs = await omie.todas("financas/mf/", "ListarMovimentos", { ...filtroTit, cExibirDepartamentos: "S" }, "n", "movimentos");
  } catch (err) {
    if (!(err instanceof ErroOmie) || !/cexibirdepartamentos|tag|estrutura/i.test(err.message)) throw err;
    movs = await omie.todas("financas/mf/", "ListarMovimentos", filtroTit, "n", "movimentos");
    contagem.sem_departamentos = 1;
  }
  contagem.titulos = await gravarMovimentos(db, e, movs);

  // 117) centros de custo e pedidos de venda: não derrubam a rodada
  let avisoPedidos = "";
  try {
    const deps = await omie.todas("geral/departamentos/", "ListarDepartamentos", {}, "omie", "departamentos");
    const linhasDep = deps.map((d) => converterDepartamento(d, e)).filter((d) => d.codigo);
    await gravar(db, "omie_departamentos", [...new Map(linhasDep.map((d) => [d.codigo, d])).values()], "cliente_id,codigo");
    contagem.departamentos = linhasDep.length;
  } catch (err) {
    if (err instanceof TempoEsgotado) throw err;
    avisoPedidos += err instanceof ErroOmie ? ` Centros de custo: ${err.message}` : " Centros de custo: falha inesperada.";
    if (!(err instanceof ErroOmie)) console.error("omie-sincronizar departamentos", e.cliente_id, err);
  }
  try {
    contagem.pedidos = await sincronizarPedidos(db, omie, e, cargaInicial, de, ate, hoje, contagem);
  } catch (err) {
    if (err instanceof TempoEsgotado) throw err;
    avisoPedidos += err instanceof ErroOmie ? ` Pedidos: ${err.message}` : " Pedidos: falha inesperada.";
    if (!(err instanceof ErroOmie)) console.error("omie-sincronizar pedidos", e.cliente_id, err);
  }

  // 5) saldos dos bancos: não derruba a rodada (o resto já está gravado)
  let avisoSaldos = "";
  try {
    const s = await sincronizarSaldos(db, omie, e, hoje);
    contagem.contas_correntes = s.contas;
    contagem.saldos = s.meses;
    contagem.extrato = s.extrato;
  } catch (err) {
    avisoSaldos = err instanceof TempoEsgotado ? " Saldos dos bancos continuam na próxima rodada."
                : err instanceof ErroOmie ? ` Saldos dos bancos: ${err.message}` : " Saldos dos bancos: falha inesperada.";
    if (!(err instanceof ErroOmie) && !(err instanceof TempoEsgotado)) console.error("omie-sincronizar saldos", e.cliente_id, err);
  }

  // fecha a rodada
  const fim = new Date().toISOString();
  const resumo = `${cargaInicial ? "Carga" : "Atualização"} ${de} a ${ate}: ${contagem.nfe} NF-e, ${contagem.nfse} NFS-e, ${contagem.titulos} linhas de títulos, ${contagem.saldos ?? 0} saldos de banco, ${contagem.pedidos ?? 0} pedidos.${avisoPedidos}${avisoSaldos}`;
  await db.from("omie_execucoes").update({ fim, situacao: "ok", contagem }).eq("id", exec!.id);
  const upd: Record<string, unknown> = { ultima_sync: fim, ultimo_ok: fim, ultimo_resultado: resumo, pedido_em: null };
  if (cargaInicial) { upd.carga_ate = ate; if (ate >= hoje) upd.carga_completa_feita = true; }
  await db.from("omie_empresas").update(upd).eq("cliente_id", e.cliente_id);
  return resumo;
}

/** pedidos de venda (117): na carga, os incluídos na janela; depois, os alterados desde a última rodada boa */
async function sincronizarPedidos(db: SupabaseClient, omie: ClienteOmie, e: Empresa, carga: boolean, de: string, ate: string, hoje: string,
                                  contagem: Record<string, number | string>) {
  const etapas = new Map<string, string>();
  try {
    const cad = await omie.todas("produtos/pedidoetapas/", "ListarEtapasPedido", {}, "n", "cadastros");
    for (const c of cad) for (const et of c.etapas ?? []) {
      const nome = String(et.cDescricao || et.cDescrPadrao || "").trim();
      if (et.cCodigo != null && nome && !etapas.has(String(et.cCodigo))) etapas.set(String(et.cCodigo), nome);
    }
    if (!etapas.size) contagem.etapas_aviso = `ListarEtapasPedido sem etapas (${cad.length} cadastro(s))`;
  } catch (err) {
    if (err instanceof TempoEsgotado) throw err; // sem nomes de etapa a tela mostra o código
    contagem.etapas_aviso = String((err as Error).message ?? err).slice(0, 200);
  }
  const filtro = carga
    ? { filtrar_por_data_de: dataBR(de), filtrar_por_data_ate: dataBR(ate), filtrar_apenas_inclusao: "S", apenas_importado_api: "N" }
    : { filtrar_por_data_de: dataBR(somaDias((e.ultimo_ok ?? hoje).slice(0, 10), -3)), filtrar_por_data_ate: dataBR(hoje),
        filtrar_apenas_alteracao: "S", apenas_importado_api: "N" };
  const pedidos = await omie.todas("produtos/pedido/", "ListarPedidos", filtro, "omie", "pedido_venda_produto");
  const linhas = pedidos.filter((p) => p?.cabecalho?.codigo_pedido != null).map((p) => converterPedido(p, e, etapas));
  await gravar(db, "omie_pedidos", [...new Map(linhas.map((l) => [l.codigo_pedido, l])).values()], "cliente_id,codigo_pedido");
  return linhas.length;
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
