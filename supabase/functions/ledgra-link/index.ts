// Edge Function ledgra-link: a Cobrança Ledgra pede ao Ledgra Link (add-on bancário da MDC) o boleto híbrido ou o Pix
// de uma mensalidade. A chave do Ledgra Link fica só aqui (Edge Functions › Secrets); o navegador nunca a vê.
//
//   POST { acao: "emitir", cobranca }  → confere com o login de quem pediu (link_pode_emitir), monta a cobrança com os
//                                        dados do cliente e chama o Ledgra Link. A referência é "LIC-<id da mensalidade>":
//                                        repetir o pedido (clique duplo, internet caiu) nunca gera dois boletos.
//   POST { acao: "emitir_fatura", fatura } → boleto da fatura de um contrato (049): confere com o login de quem pediu
//                                        (fatura_boleto_preparar, Contratos operar), emite no banco do contrato (Itaú ou
//                                        Santander) com a referência "FAT-<id da fatura>" (outra tentativa: "-2", "-3"…)
//                                        e grava pelo servidor (fatura_boleto_registrar).
//   POST { acao: "situacao" }          → se o Ledgra Link está configurado neste servidor e respondendo.
//   POST { acao: "certificados", org } → certificados bancários guardados no cofre do Ledgra Link (só dados públicos),
//                                        para o painel Vencimentos › Certificados digitais. Confere Vencimentos › ver.
//
// Segredos (Edge Functions › Secrets): LEDGRA_LINK_URL, LEDGRA_LINK_CHAVE.
import { bancoServico, bancoUsuario, cabecalhos, resposta } from "../_ledgra_link/http.ts";
import { ErroLedgraLink, LedgraLink } from "../_ledgra_link/ledgra-link-cliente.ts";

const DESLIGADO = "O Ledgra Link ainda não está ligado neste servidor. Fale com o administrador do HUB.";

function cliente(email?: string): LedgraLink | null {
  const url = Deno.env.get("LEDGRA_LINK_URL");
  const chave = Deno.env.get("LEDGRA_LINK_CHAVE");
  if (!url || !chave) return null;
  return new LedgraLink({ url, chave, usuario: email, timeoutMs: 40_000 });
}

/** Soma dias a uma data AAAA-MM-DD sem depender do fuso do servidor. */
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const usuario = bancoUsuario(auth);
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });

  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; cobranca?: string; org?: string; fatura?: string };

  if (corpo.acao === "situacao") {
    const link = cliente(u.user.email);
    if (!link) return json(200, { ligado: false, mensagem: DESLIGADO });
    try {
      await link.saude();
      return json(200, { ligado: true, mensagem: "Ledgra Link respondendo." });
    } catch (e) {
      return json(200, { ligado: false, mensagem: e instanceof ErroLedgraLink ? e.message : "O Ledgra Link não respondeu." });
    }
  }

  if (corpo.acao === "certificados") {
    const org = String(corpo.org ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(org)) return json(400, { erro: "Organização inválida." });
    const { data: podeVer } = await usuario.rpc("link_pode_ver_certificados", { p_org: org });
    if (podeVer !== true) return json(403, { erro: "Sem permissão para ver os certificados digitais." });
    const link = cliente(u.user.email);
    if (!link) return json(200, { ligado: false, mensagem: DESLIGADO, certificados: [] });
    try {
      const r = await link.certificados.vencimentos();
      return json(200, { ligado: true, mensagem: null, certificados: r.certificados });
    } catch (e) {
      return json(200, {
        ligado: false,
        mensagem: e instanceof ErroLedgraLink ? e.message : "O Ledgra Link não respondeu.",
        certificados: [],
      });
    }
  }

  if (corpo.acao === "emitir_fatura") {
    const fatura = String(corpo.fatura ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(fatura)) return json(400, { erro: "Escolha a fatura." });
    // 1) permissão e dados conferidos no banco com o login de quem pediu (recusa vem em português)
    const { data: d, error: erroPreparo } = await usuario.rpc("fatura_boleto_preparar", { p_fatura: fatura });
    if (erroPreparo || !d) return json(400, { erro: erroPreparo?.message ?? "Não foi possível preparar o boleto." });
    const link = cliente(u.user.email);
    if (!link) return json(503, { erro: DESLIGADO });
    const p = d as {
      numero: string; valor: number; vencimento: string; mensagem: string; pagador: { documento: string; nome: string };
      banco: string; conta_link_id: string; tipo: "boleto" | "boleto_hibrido"; tentativa: number; ref_externa: string;
      multa_percentual: number; juros_mensal_percentual: number; dias_apos_vencimento: number; hoje: string;
    };
    // 2) fatura já vencida: o banco não registra boleto com vencimento no passado → vence em 3 dias
    const vencida = p.vencimento < p.hoje;
    const vencimento = vencida ? somarDias(p.hoje, 3) : p.vencimento;
    try {
      const r = await link.cobrancas.emitir({
        conta_id: p.conta_link_id,
        ref_externa: p.ref_externa,
        tipo: p.tipo,
        valor: Number(p.valor),
        vencimento,
        dias_apos_vencimento: p.dias_apos_vencimento,
        multa_percentual: Number(p.multa_percentual) || undefined,
        juros_mensal_percentual: Number(p.juros_mensal_percentual) || undefined,
        mensagem: String(p.mensagem).slice(0, 140),
        pagador: p.pagador,
      });
      const { error } = await bancoServico().rpc("fatura_boleto_registrar", {
        p_fatura: fatura,
        p_user: u.user.id,
        p: { cobranca_link_id: r.id, tipo: p.tipo, banco: p.banco, valor: Number(p.valor), vencimento, tentativa: p.tentativa,
             linha_digitavel: r.linha_digitavel, pix_copia_cola: r.pix_copia_cola, nosso_numero: r.nosso_numero },
      });
      if (error) return json(409, { erro: error.message });
      return json(200, {
        linha_digitavel: r.linha_digitavel,
        pix_copia_cola: r.pix_copia_cola,
        vencimento,
        aviso: vencida ? `A fatura estava vencida: o boleto vence em ${vencimento.split("-").reverse().join("/")}.` : null,
      });
    } catch (e) {
      if (e instanceof ErroLedgraLink) return json(e.temporario ? 503 : 422, { erro: e.message });
      return json(500, { erro: "Não foi possível gerar o boleto agora. Tente de novo em instantes." });
    }
  }

  if (corpo.acao !== "emitir") return json(400, { erro: "Ação desconhecida." });
  const id = String(corpo.cobranca ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { erro: "Escolha a mensalidade." });

  // 1) permissão conferida no banco com o login de quem pediu
  const { data: pode } = await usuario.rpc("link_pode_emitir", { p_cobranca: id });
  if (pode !== true) {
    return json(403, { erro: "Não é possível emitir: a mensalidade não está em aberto, o Ledgra Link está desligado ou você não tem permissão." });
  }
  const link = cliente(u.user.email);
  if (!link) return json(503, { erro: DESLIGADO });

  // 2) dados da mensalidade, do cliente e da configuração (com a chave de serviço, só no servidor)
  const servico = bancoServico();
  const { data: c } = await servico.from("lic_cobrancas")
    .select("id,org_id,cliente_id,valor,vencimento,descricao,situacao").eq("id", id).maybeSingle();
  if (!c) return json(404, { erro: "Mensalidade não encontrada." });
  const [{ data: cli }, { data: cfg }, { data: org }] = await Promise.all([
    servico.from("clientes").select("razao_social,cnpj").eq("id", c.cliente_id).maybeSingle(),
    servico.from("link_config").select("*").eq("org_id", c.org_id).maybeSingle(),
    servico.from("organizacoes").select("fuso").eq("id", c.org_id).maybeSingle(),
  ]);
  const documento = String(cli?.cnpj ?? "").replace(/\D/g, "");
  if (documento.length !== 14 && documento.length !== 11) {
    return json(400, { erro: "Cadastre o CNPJ (ou CPF) do cliente em Configurações › Clientes antes de emitir." });
  }
  if (!cfg?.ativo || !cfg.conta_link_id) return json(409, { erro: DESLIGADO });

  // 3) mensalidade já vencida: o banco não registra boleto com vencimento no passado → vence em 3 dias
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: org?.fuso ?? "America/Sao_Paulo" });
  const vencida = c.vencimento < hoje;
  const vencimento = vencida ? somarDias(hoje, 3) : c.vencimento;

  try {
    const r = await link.cobrancas.emitir({
      conta_id: cfg.conta_link_id,
      ref_externa: `LIC-${c.id}`,
      tipo: cfg.tipo_padrao,
      valor: Number(c.valor),
      vencimento,
      dias_apos_vencimento: cfg.dias_apos_vencimento,
      multa_percentual: Number(cfg.multa_percentual) || undefined,
      juros_mensal_percentual: Number(cfg.juros_mensal_percentual) || undefined,
      mensagem: String(c.descricao).slice(0, 140),
      pagador: { documento, nome: String(cli?.razao_social ?? "").slice(0, 100) },
    });
    const { error } = await servico.rpc("link_registrar_emissao", {
      p_cobranca: c.id,
      p_user: u.user.id,
      p: { cobranca_link_id: r.id, tipo: cfg.tipo_padrao, linha_digitavel: r.linha_digitavel, pix_copia_cola: r.pix_copia_cola,
           nosso_numero: r.nosso_numero },
    });
    if (error) return json(409, { erro: error.message });
    return json(200, {
      linha_digitavel: r.linha_digitavel,
      pix_copia_cola: r.pix_copia_cola,
      vencimento,
      aviso: vencida ? `A mensalidade estava vencida: o boleto/Pix vence em ${vencimento.split("-").reverse().join("/")}.` : null,
    });
  } catch (e) {
    if (e instanceof ErroLedgraLink) return json(e.temporario ? 503 : 422, { erro: e.message });
    return json(500, { erro: "Não foi possível emitir agora. Tente de novo em instantes." });
  }
});
