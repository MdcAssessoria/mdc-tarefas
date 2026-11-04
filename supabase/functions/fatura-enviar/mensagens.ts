// Peças puras da Função fatura-enviar (testadas em envio_test.ts, sem rede): o que falta configurar em cada canal,
// o texto do e-mail e do WhatsApp, o número de WhatsApp no formato internacional e a tradução dos erros do
// Microsoft Graph e da API do WhatsApp para uma frase simples (e se é erro definitivo, temporário ou de configuração).
import { brl } from "./nucleo/moeda.ts";
import { fmtCompetencia, fmtData } from "./nucleo/formato_datas.ts";

export type Canal = "email" | "whatsapp";

/** Segredos de cada canal (Edge Functions › Secrets no painel do Supabase). */
export const SEGREDOS: Record<Canal, string[]> = {
  email: ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_REMETENTE"],
  whatsapp: ["WHATSAPP_TOKEN", "WHATSAPP_NUMERO_ID", "WHATSAPP_MODELO"],
};

export interface ConfigEmail {
  tenant: string;
  cliente: string;
  segredo: string;
  remetente: string;
}
export interface ConfigWhatsapp {
  token: string;
  numeroId: string;
  modelo: string;
  idioma: string;
  versao: string;
}
export interface Configuracao {
  email: ConfigEmail | null;
  whatsapp: ConfigWhatsapp | null;
  faltam: Record<Canal, string[]>;
}

/** Lê os segredos do ambiente (sem mostrar valores): o canal só liga com todos preenchidos. */
export function lerConfiguracao(env: (nome: string) => string | undefined): Configuracao {
  const v = (n: string) => (env(n) ?? "").trim();
  const faltam = {
    email: SEGREDOS.email.filter((n) => !v(n)),
    whatsapp: SEGREDOS.whatsapp.filter((n) => !v(n)),
  };
  return {
    faltam,
    email: faltam.email.length
      ? null
      : { tenant: v("GRAPH_TENANT_ID"), cliente: v("GRAPH_CLIENT_ID"), segredo: v("GRAPH_CLIENT_SECRET"), remetente: v("GRAPH_REMETENTE") },
    whatsapp: faltam.whatsapp.length
      ? null
      : {
          token: v("WHATSAPP_TOKEN"),
          numeroId: v("WHATSAPP_NUMERO_ID"),
          modelo: v("WHATSAPP_MODELO"),
          idioma: v("WHATSAPP_IDIOMA") || "pt_BR",
          versao: v("WHATSAPP_VERSAO") || "v23.0",
        },
  };
}

export const textoFaltam = (faltam: string[]) =>
  `Faltam os segredos ${faltam.join(", ")} em Edge Functions › Secrets do Supabase.`;

/** O que a fila entrega para cada envio (public.fin_envio_reservar). */
export interface Envio {
  envio: number;
  canal: Canal;
  destino: string;
  conteudo: string[];
  etapa: "principal" | "boleto";
  tentativa: number;
  org: string;
  cliente: string;
  logo_url: string | null;
  fatura: {
    id: string;
    numero: string;
    emissao: string;
    vencimento: string;
    competencia: string;
    valor: number;
    descricao: string | null;
    documento: string;
    envio: string;
    situacao: string;
    nfse_situacao: string;
    nfse_numero: string | null;
    boleto_situacao: string;
    servico_codigo: string | null;
    iss_aliquota: number | null;
    cancelamento_motivo: string | null;
  };
  contrato: string | null;
  tomador: { nome: string | null; documento: string | null; email: string | null; cidade: string | null; uf: string | null };
  nfse: { numero: string | null; chave: string | null; xml_caminho: string | null } | null;
  boleto: { banco: string; linha_digitavel: string | null; pix_copia_cola: string | null; vencimento: string; valor: number } | null;
}

const NOME_MDC = "MDC Assessoria Contábil";
export const CONSULTA_NFSE = "https://www.nfse.gov.br/consultapublica";

const leva = (e: Envio, item: string) => e.conteudo.includes(item);
const primeiroNome = (nome: string | null) => (nome ?? "").trim() || "cliente";

/** Nome do arquivo da fatura (sem barra: "Fatura-2026-00012.pdf"). */
export const arquivoFatura = (numero: string) => `Fatura-${numero.replace(/[^\w-]+/g, "-")}.pdf`;

export function assuntoEmail(e: Envio): string {
  const f = e.fatura;
  if (e.etapa === "boleto") return `Boleto da fatura ${f.numero} · ${NOME_MDC} · vence em ${fmtData(e.boleto?.vencimento ?? f.vencimento)}`;
  return `Fatura ${f.numero} · ${NOME_MDC} · vence em ${fmtData(f.vencimento)}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Corpo do e-mail em HTML simples (sem imagens nem links de rastreio), em português claro. */
export function corpoEmail(e: Envio): string {
  const f = e.fatura;
  const p = (t: string) => `<p style="margin:0 0 12px">${t}</p>`;
  const linhas: string[] = [p(`Olá, ${esc(primeiroNome(e.tomador.nome))}.`)];
  linhas.push(
    p(
      e.etapa === "boleto"
        ? `Segue o boleto para pagamento da fatura <b>${esc(f.numero)}</b>, que já enviamos antes.`
        : `Segue em anexo a fatura <b>${esc(f.numero)}</b> da ${NOME_MDC}${f.descricao ? ` (${esc(f.descricao)})` : ""}.`,
    ),
  );
  const itens: [string, string][] = [
    ["Valor", brl(e.boleto?.valor ?? f.valor)],
    ["Vencimento", fmtData(e.boleto?.vencimento ?? f.vencimento)],
    ["Competência", fmtCompetencia(f.competencia)],
  ];
  if (e.contrato) itens.push(["Contrato", e.contrato]);
  linhas.push(
    `<table style="border-collapse:collapse;margin:0 0 12px">${itens
      .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#5d6661">${k}</td><td style="padding:2px 0"><b>${esc(v)}</b></td></tr>`)
      .join("")}</table>`,
  );
  if (leva(e, "boleto") && e.boleto) {
    if (e.boleto.linha_digitavel) linhas.push(p(`<b>Linha digitável do boleto:</b><br><span style="font-family:monospace">${esc(e.boleto.linha_digitavel)}</span>`));
    if (e.boleto.pix_copia_cola)
      linhas.push(p(`<b>Pix copia e cola:</b><br><span style="font-family:monospace;word-break:break-all">${esc(e.boleto.pix_copia_cola)}</span>`));
  }
  if (leva(e, "nfse") && e.nfse?.numero) {
    linhas.push(
      p(
        `Nota fiscal de serviço (NFS-e) nº <b>${esc(e.nfse.numero)}</b>${e.nfse.xml_caminho ? " em anexo (arquivo XML)" : ""}.` +
          (e.nfse.chave ? ` Chave de acesso: <span style="font-family:monospace">${esc(e.nfse.chave)}</span>. ` : " ") +
          `Para conferir, use a <a href="${CONSULTA_NFSE}">consulta pública da NFS-e</a>.`,
      ),
    );
  }
  if (!leva(e, "boleto") && f.envio === "nf_fatura" && e.etapa === "principal") linhas.push(p("O boleto para pagamento será enviado em seguida, em outro e-mail."));
  linhas.push(p("Se já pagou, desconsidere esta mensagem. Qualquer dúvida, é só responder este e-mail."));
  linhas.push(p(`Atenciosamente,<br>${NOME_MDC}`));
  linhas.push(`<p style="margin:16px 0 0;font-size:12px;color:#5d6661">Mensagem enviada automaticamente pelo HUB da MDC.</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c2420;line-height:1.45">${linhas.join("")}</div>`;
}

/** Parâmetro de modelo do WhatsApp: sem quebra de linha, tabulação nem mais de 4 espaços seguidos (regra da Meta). */
export const parametroWhatsapp = (s: string) =>
  s.replace(/\u00a0/g, " ").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900) || "-";

/**
 * Os 5 parâmetros do corpo do modelo "fatura_mdc":
 * "Olá, {{1}}! Segue em anexo a fatura {{2}} da MDC Assessoria Contábil, no valor de {{3}}, com vencimento em {{4}}.
 *  Para pagar: {{5}}. Qualquer dúvida, é só responder esta mensagem."
 */
export function parametrosWhatsapp(e: Envio): string[] {
  const f = e.fatura;
  const pagar =
    leva(e, "boleto") && e.boleto?.linha_digitavel
      ? `linha digitável ${e.boleto.linha_digitavel}`
      : leva(e, "boleto") && e.boleto?.pix_copia_cola
        ? "use o Pix copia e cola que está na fatura em anexo"
        : f.envio === "nf_fatura" && e.etapa === "principal"
          ? "o boleto chega em seguida, em outra mensagem"
          : "veja as instruções na fatura em anexo";
  return [primeiroNome(e.tomador.nome), f.numero, brl(e.boleto?.valor ?? f.valor), fmtData(e.boleto?.vencimento ?? f.vencimento), pagar].map(
    parametroWhatsapp,
  );
}

/** Número de WhatsApp no formato internacional (só dígitos, 55 + DDD + número). Nulo = inválido. */
export function numeroWhatsapp(destino: string): string | null {
  let d = (destino ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return d;
}

export const emailValido = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s ?? "").trim());

/** Resultado de uma tentativa no provedor. configuracao = o problema é do canal (segredo, permissão), não do envio. */
export interface Falha {
  erro: string;
  definitivo: boolean;
  configuracao: boolean;
}

/** Erro do Microsoft Graph (pedido do token ou sendMail) em frase simples. */
export function falhaGraph(status: number, corpo: unknown, noToken = false): Falha {
  // deno-lint-ignore no-explicit-any
  const c = corpo as any;
  const codigo: string = c?.error?.code ?? c?.error ?? "";
  const msg: string = c?.error?.message ?? c?.error_description ?? "";
  if (noToken || /invalid_client|unauthorized_client|AADSTS/i.test(`${codigo} ${msg}`))
    return {
      erro: "O Microsoft 365 recusou o aplicativo do HUB (confira GRAPH_TENANT_ID, GRAPH_CLIENT_ID e se a senha GRAPH_CLIENT_SECRET venceu).",
      definitivo: false,
      configuracao: true,
    };
  if (status === 401 || status === 403 || /AccessDenied|Authorization_RequestDenied/i.test(codigo))
    return {
      erro: "O Microsoft 365 não deixou o aplicativo enviar pela caixa do HUB (confira a permissão Mail.Send e a restrição à caixa hub@).",
      definitivo: false,
      configuracao: true,
    };
  if (/MailboxNotEnabledForRESTAPI|ErrorInvalidUser|ResourceNotFound/i.test(codigo) || (status === 404 && !/Recipient/i.test(msg)))
    return { erro: "A caixa de envio (GRAPH_REMETENTE) não foi encontrada no Microsoft 365.", definitivo: false, configuracao: true };
  if (/ErrorInvalidRecipients|InvalidRecipients|ErrorMessageSizeExceeded/i.test(codigo) || /recipient/i.test(msg))
    return {
      erro: /Size/i.test(codigo) ? "A mensagem ficou grande demais para o e-mail (anexos acima do limite)." : "O e-mail do cliente foi recusado: confira o endereço no cadastro.",
      definitivo: true,
      configuracao: false,
    };
  if (status === 429 || status >= 500)
    return { erro: "O Microsoft 365 está ocupado ou fora do ar agora; o HUB tenta de novo mais tarde.", definitivo: false, configuracao: false };
  return { erro: `O Microsoft 365 recusou o envio (${status}${codigo ? ` ${codigo}` : ""}).`, definitivo: false, configuracao: false };
}

/** Erro da API do WhatsApp (Cloud API da Meta) em frase simples. */
export function falhaWhatsapp(status: number, corpo: unknown): Falha {
  // deno-lint-ignore no-explicit-any
  const c = (corpo as any)?.error ?? {};
  const codigo = Number(c.code ?? 0);
  const sub = Number(c.error_subcode ?? 0);
  if (codigo === 190 || status === 401)
    return { erro: "A Meta recusou o token do WhatsApp (WHATSAPP_TOKEN vencido ou trocado).", definitivo: false, configuracao: true };
  if (codigo === 10 || codigo === 200 || codigo === 368 || codigo === 131031 || status === 403)
    return { erro: "A conta do WhatsApp Business está sem permissão ou bloqueada: confira no Gerenciador do WhatsApp da Meta.", definitivo: false, configuracao: true };
  if (codigo >= 132000 && codigo <= 132099)
    return {
      erro: "O modelo de mensagem do WhatsApp (WHATSAPP_MODELO) não existe, não foi aprovado ou não tem os 5 campos combinados.",
      definitivo: false,
      configuracao: true,
    };
  if (codigo === 131026 || codigo === 131021 || codigo === 131030 || codigo === 131009 || (codigo === 100 && sub === 2494010))
    return {
      erro:
        codigo === 131030
          ? "Este número não está na lista de testes da conta do WhatsApp (conta ainda em teste)."
          : "Não foi possível entregar no WhatsApp deste número (número sem WhatsApp ou inválido): confira o cadastro.",
      definitivo: true,
      configuracao: false,
    };
  if (codigo === 100 && /phone|number|id/i.test(String(c.message ?? "")) && status === 400)
    return { erro: "O número do WhatsApp da MDC (WHATSAPP_NUMERO_ID) não confere com a conta.", definitivo: false, configuracao: true };
  if (codigo === 130429 || codigo === 131048 || codigo === 131056 || codigo === 4 || codigo === 80007 || status === 429 || status >= 500)
    return { erro: "O WhatsApp limitou os envios agora; o HUB tenta de novo mais tarde.", definitivo: false, configuracao: false };
  return { erro: `O WhatsApp recusou o envio (${status}${codigo ? `, código ${codigo}` : ""}).`, definitivo: false, configuracao: false };
}
