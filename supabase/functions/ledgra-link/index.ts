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
// Cadastro das empresas e contas bancárias (Contratos › Ledgra Link, migração 064; confere link_pode_cadastrar =
// Contratos › gerir). As senhas, o client_secret e o arquivo do certificado passam por aqui direto para o cofre do
// Ledgra Link: não ficam gravados no HUB nem voltam na resposta.
//   POST { acao: "cadastros", org }    → empresas (titulares), contas de cada uma e certificados.
//   POST { acao: "titular", org, documento, razao_social, email_contato? }
//   POST formulário acao=autorizacao   → termo de autorização assinado (PDF): guarda o PDF no HUB
//                                        (<org>/ledgra-link/termos/…), calcula o SHA-256 e registra no Ledgra Link.
//   POST { acao: "conta", org, titular_id, codigo_compe, agencia, conta, … }
//   POST formulário acao=certificado   → certificado .pfx/.p12 e a senha, direto para o cofre.
//   POST { acao: "credencial", org, conta_id, produto, client_id, client_secret, certificado_id? }
//
// Segredos (Edge Functions › Secrets): LEDGRA_LINK_URL, LEDGRA_LINK_CHAVE.
import { bancoServico, bancoUsuario, cabecalhos, resposta } from "../_ledgra_link/http.ts";
import { type CertificadoVencimento, ErroLedgraLink, LedgraLink } from "../_ledgra_link/ledgra-link-cliente.ts";

const DESLIGADO = "O Ledgra Link ainda não está ligado neste servidor. Fale com o administrador do HUB.";

function cliente(email?: string): LedgraLink | null {
  const url = Deno.env.get("LEDGRA_LINK_URL");
  const chave = Deno.env.get("LEDGRA_LINK_CHAVE");
  if (!url || !chave) return null;
  return new LedgraLink({ url, chave, usuario: email, timeoutMs: 40_000 });
}

const ACOES_CADASTRO = new Set(["cadastros", "titular", "autorizacao", "conta", "certificado", "credencial"]);
const UUID = /^[0-9a-f-]{36}$/i;
const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const opcional = (v: unknown, max = 200) => texto(v, max) || undefined;

/** SHA-256 em hexadecimal minúsculo (o Ledgra Link guarda o hash do termo para provar que o PDF não mudou). */
async function sha256(bytes: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Nome de arquivo sem acentos nem símbolos, para o caminho no armazenamento. */
const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);

/** Cadastro de empresas, termos, contas, certificados e credenciais no Ledgra Link (Contratos › gerir). */
async function cadastro(
  corpo: Record<string, unknown>,
  form: FormData | null,
  usuario: ReturnType<typeof bancoUsuario>,
  email: string | undefined,
  json: (status: number, corpo: unknown) => Response,
): Promise<Response> {
  const org = texto(corpo.org, 36);
  if (!UUID.test(org)) return json(400, { erro: "Organização inválida." });
  const { data: pode } = await usuario.rpc("link_pode_cadastrar", { p_org: org });
  if (pode !== true) return json(403, { erro: "Só quem gere Contratos pode cadastrar empresas e contas no Ledgra Link." });
  const link = cliente(email);
  if (!link) return json(503, { erro: DESLIGADO });

  try {
    switch (corpo.acao) {
      case "cadastros": {
        const [{ titulares }, certs] = await Promise.all([
          link.titulares.listar(),
          link.certificados.vencimentos().catch(() => ({ certificados: [] as CertificadoVencimento[] })),
        ]);
        const comContas = await Promise.all(
          titulares.map(async (t) => ({ ...t, contas: (await link.contas.listar(t.id)).contas })),
        );
        return json(200, { titulares: comContas, certificados: certs.certificados });
      }
      case "titular": {
        const r = await link.titulares.cadastrar({
          documento: digitos(corpo.documento),
          razao_social: texto(corpo.razao_social, 150),
          email_contato: opcional(corpo.email_contato, 150),
          ref_externa: `HUB-${org}`,
        });
        return json(200, r);
      }
      case "autorizacao": {
        const titular = texto(corpo.titular_id, 36);
        const arquivo = form?.get("termo");
        if (!UUID.test(titular)) return json(400, { erro: "Escolha a empresa." });
        if (!(arquivo instanceof File) || !arquivo.size) return json(400, { erro: "Anexe o termo de autorização assinado (PDF)." });
        if (arquivo.size > 10 * 1024 * 1024) return json(400, { erro: "O termo passa de 10 MB. Envie um PDF menor." });
        const bytes = await arquivo.arrayBuffer();
        if (new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5))) !== "%PDF-") {
          return json(400, { erro: "O termo precisa ser um arquivo PDF." });
        }
        const hash = await sha256(bytes);
        const caminho = `${org}/ledgra-link/termos/${titular}/${Date.now()}-${nomeSeguro(arquivo.name || "termo.pdf")}`;
        const { error: erroArquivo } = await bancoServico().storage.from("hub-arquivos")
          .upload(caminho, bytes, { contentType: "application/pdf" });
        if (erroArquivo) return json(500, { erro: "Não foi possível guardar o PDF do termo. Tente de novo." });
        const escopos = texto(corpo.escopos, 60).split(",").filter((e) => ["cobranca", "extrato", "pagamento", "pix"].includes(e));
        const r = await link.titulares.registrarAutorizacao(titular, {
          escopos: escopos as Array<"cobranca" | "extrato" | "pagamento" | "pix">,
          documento_termo: `hub:${caminho}`,
          hash_termo: hash,
          assinado_por_nome: texto(corpo.assinado_por_nome, 120),
          assinado_por_cpf: digitos(corpo.assinado_por_cpf),
          // data da assinatura ao meio-dia de Brasília (o dia não muda com o fuso)
          assinado_em: `${texto(corpo.assinado_em, 10)}T12:00:00-03:00`,
          vigente_ate: opcional(corpo.vigente_ate, 10),
        }, { idempotencia: `termo-${hash}` });
        return json(200, { ...r, hash });
      }
      case "conta": {
        const r = await link.contas.cadastrar({
          titular_id: texto(corpo.titular_id, 36),
          codigo_compe: texto(corpo.codigo_compe, 3),
          agencia: digitos(corpo.agencia),
          conta: digitos(corpo.conta),
          conta_dv: opcional(corpo.conta_dv, 2),
          apelido: texto(corpo.apelido, 60),
          convenio: opcional(corpo.convenio, 20),
          carteira: opcional(corpo.carteira, 10),
          workspace_id: opcional(corpo.workspace_id, 80),
          chave_pix: opcional(corpo.chave_pix, 77),
          ambiente: (["sandbox", "homologacao", "producao"].includes(String(corpo.ambiente)) ? corpo.ambiente : "producao") as
            "sandbox" | "homologacao" | "producao",
        });
        return json(200, r);
      }
      case "certificado": {
        const arquivo = form?.get("arquivo");
        if (!(arquivo instanceof File) || !arquivo.size) return json(400, { erro: "Escolha o arquivo do certificado (.pfx ou .p12)." });
        if (arquivo.size > 64 * 1024) return json(400, { erro: "O arquivo é grande demais para um certificado A1. Confira se é o .pfx." });
        const tipo = texto(corpo.tipo, 20);
        const r = await link.certificados.enviar({
          titular_id: texto(corpo.titular_id, 36),
          tipo: (["icp_a1_ecnpj", "icp_a1_ecpf", "banco_mtls", "webhook_servidor"].includes(tipo) ? tipo : "icp_a1_ecnpj") as
            "icp_a1_ecnpj",
          apelido: texto(corpo.apelido, 60),
          arquivo: new Uint8Array(await arquivo.arrayBuffer()),
          nome_arquivo: nomeSeguro(arquivo.name || "certificado.pfx"),
          senha: String(form?.get("senha") ?? ""),
        });
        return json(200, r);
      }
      case "credencial": {
        const conta = texto(corpo.conta_id, 36);
        if (!UUID.test(conta)) return json(400, { erro: "Escolha a conta." });
        const produto = texto(corpo.produto, 12);
        const segredo = String(corpo.client_secret ?? "");
        if (!segredo) return json(400, { erro: "Informe o Client Secret do portal do banco." });
        const r = await link.contas.cadastrarCredencial(conta, {
          produto: (["pix", "cobranca", "extrato", "pagamentos"].includes(produto) ? produto : "cobranca") as "cobranca",
          client_id: texto(corpo.client_id, 200),
          segredos: { client_secret: segredo },
          certificado_id: UUID.test(texto(corpo.certificado_id, 36)) ? texto(corpo.certificado_id, 36) : undefined,
        });
        return json(200, r);
      }
    }
    return json(400, { erro: "Ação desconhecida." });
  } catch (e) {
    if (e instanceof ErroLedgraLink) return json(e.temporario ? 503 : 422, { erro: traduzirLink(e) });
    console.error("ledgra-link cadastro", corpo.acao, e instanceof Error ? e.name : "erro");
    return json(500, { erro: "Não foi possível gravar agora. Tente de novo em instantes." });
  }
}

/** Nome do campo do Ledgra Link como a pessoa vê na tela. */
const CAMPOS: Record<string, string> = {
  documento: "CPF ou CNPJ", razao_social: "razão social", email_contato: "e-mail", escopos: "o que a MDC pode fazer",
  assinado_por_nome: "nome de quem assinou", assinado_por_cpf: "CPF de quem assinou", assinado_em: "data da assinatura",
  vigente_ate: "válido até", codigo_compe: "banco", agencia: "agência", conta: "conta", conta_dv: "dígito da conta",
  apelido: "apelido", convenio: "convênio", carteira: "carteira", chave_pix: "chave Pix", client_id: "Client ID",
  titular_id: "empresa",
};

/** Mensagem do Ledgra Link em português simples (erro de validação vira a lista dos campos a revisar). */
function traduzirLink(e: ErroLedgraLink): string {
  const campos = (e.detalhes as { campos?: string[] } | undefined)?.campos;
  if (e.codigo === "dados_invalidos" && campos?.length) {
    const nomes = [...new Set(campos.map((c) => CAMPOS[c.split(".")[0]!] ?? c))];
    return `Revise: ${nomes.join(", ")}.`;
  }
  return e.message;
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

  // Formulário com arquivo (termo e certificado) ou JSON (o resto).
  const ehFormulario = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  const form = ehFormulario ? await req.formData().catch(() => null) : null;
  const corpo = (form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"))
    : await req.json().catch(() => ({}))) as { acao?: string; cobranca?: string; org?: string; fatura?: string } & Record<string, unknown>;

  if (corpo.acao && ACOES_CADASTRO.has(corpo.acao)) return await cadastro(corpo, form, usuario, u.user.email, json);

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
