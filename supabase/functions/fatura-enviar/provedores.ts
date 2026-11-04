// Conversa com os provedores: Microsoft Graph (token do aplicativo + sendMail pela caixa do HUB) e WhatsApp Cloud API
// (subir o PDF + mandar o modelo aprovado). O fetch entra por parâmetro para os testes (envio_test.ts) não usarem rede.
// Nenhum segredo é registrado em log nem devolvido: os erros viram as frases de mensagens.ts.
import { type ConfigEmail, type ConfigWhatsapp, type Falha, falhaGraph, falhaWhatsapp } from "./mensagens.ts";

export type Buscar = typeof fetch;
export type Resultado = { ok: true; id: string } | ({ ok: false } & Falha);

const TEMPO_MS = 30_000;

async function json(r: Response): Promise<unknown> {
  const t = await r.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return { error: { message: t.slice(0, 200) } };
  }
}

const semRede = (quem: string, e: unknown): Resultado => ({
  ok: false,
  erro: `Não foi possível falar com ${quem} agora (${(e as Error)?.name === "TimeoutError" ? "demorou demais" : "sem conexão"}); o HUB tenta de novo mais tarde.`,
  definitivo: false,
  configuracao: false,
});

/** Base64 de bytes (anexo do Graph), em pedaços para não estourar a pilha. */
export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ------------------------------------------------------------------------------------------------ Microsoft Graph
const tokens = new Map<string, { valor: string; ate: number }>();

/** Token do aplicativo (client credentials), guardado até 5 min antes de vencer. */
export async function tokenGraph(cfg: ConfigEmail, buscar: Buscar = fetch): Promise<{ ok: true; token: string } | ({ ok: false } & Falha)> {
  const chave = `${cfg.tenant}|${cfg.cliente}`;
  const guardado = tokens.get(chave);
  if (guardado && guardado.ate > Date.now()) return { ok: true, token: guardado.valor };
  let r: Response;
  try {
    r = await buscar(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: cfg.cliente,
        client_secret: cfg.segredo,
        scope: "https://graph.microsoft.com/.default",
      }),
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (e) {
    return semRede("o Microsoft 365", e) as { ok: false } & Falha;
  }
  const c = (await json(r)) as { access_token?: string; expires_in?: number } | null;
  if (!r.ok || !c?.access_token) {
    if (r.status >= 500 || r.status === 429) return { ok: false, ...falhaGraph(r.status, c) };
    return { ok: false, ...falhaGraph(r.status, c, true) };
  }
  tokens.set(chave, { valor: c.access_token, ate: Date.now() + Math.max(60, (c.expires_in ?? 3600) - 300) * 1000 });
  return { ok: true, token: c.access_token };
}

export const esquecerTokens = () => tokens.clear();

export interface Anexo {
  nome: string;
  tipo: string;
  bytes: Uint8Array;
}
export interface Email {
  para: string;
  assunto: string;
  html: string;
  anexos: Anexo[];
  /** Identificação nossa da mensagem (vai no cabeçalho X-HUB-Envio e volta como mensagem_id). */
  marca: string;
}

/** Limite de anexo do sendMail simples (o pedido todo tem até 4 MB). */
export const LIMITE_ANEXOS = 3 * 1024 * 1024;

export async function enviarEmail(cfg: ConfigEmail, m: Email, buscar: Buscar = fetch): Promise<Resultado> {
  const total = m.anexos.reduce((s, a) => s + a.bytes.length, 0);
  if (total > LIMITE_ANEXOS) return { ok: false, erro: "Os anexos passam de 3 MB, o limite do envio de e-mail do HUB.", definitivo: true, configuracao: false };
  const t = await tokenGraph(cfg, buscar);
  if (!t.ok) return t;
  let r: Response;
  try {
    r = await buscar(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.remetente)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: m.assunto,
          body: { contentType: "HTML", content: m.html },
          toRecipients: [{ emailAddress: { address: m.para.trim() } }],
          internetMessageHeaders: [{ name: "X-HUB-Envio", value: m.marca }],
          attachments: m.anexos.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.nome,
            contentType: a.tipo,
            contentBytes: base64(a.bytes),
          })),
        },
        saveToSentItems: true,
      }),
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (e) {
    return semRede("o Microsoft 365", e);
  }
  if (r.status === 202 || r.ok) {
    await r.body?.cancel();
    return { ok: true, id: m.marca };
  }
  if (r.status === 401) tokens.clear();
  return { ok: false, ...falhaGraph(r.status, await json(r)) };
}

// ------------------------------------------------------------------------------------------------ WhatsApp (Meta)
const urlMeta = (cfg: ConfigWhatsapp, caminho: string) => `https://graph.facebook.com/${cfg.versao}/${caminho}`;

/** Confere o número da MDC na conta (token e WHATSAPP_NUMERO_ID valem). */
export async function conferirWhatsapp(cfg: ConfigWhatsapp, buscar: Buscar = fetch): Promise<{ ok: true; numero: string } | ({ ok: false } & Falha)> {
  let r: Response;
  try {
    r = await buscar(urlMeta(cfg, `${encodeURIComponent(cfg.numeroId)}?fields=display_phone_number,verified_name`), {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (e) {
    return semRede("o WhatsApp", e) as { ok: false } & Falha;
  }
  const c = (await json(r)) as { display_phone_number?: string; verified_name?: string } | null;
  if (!r.ok) {
    const f = falhaWhatsapp(r.status, c);
    return { ok: false, ...f, configuracao: f.configuracao || r.status === 400 || r.status === 404 };
  }
  return { ok: true, numero: [c?.display_phone_number, c?.verified_name].filter(Boolean).join(" · ") };
}

export interface Whatsapp {
  para: string;
  pdf: Uint8Array;
  arquivo: string;
  parametros: string[];
}

/** Sobe o PDF (mídia da conta, guardada pela Meta por 30 dias) e manda o modelo com o PDF no cabeçalho. */
export async function enviarWhatsapp(cfg: ConfigWhatsapp, m: Whatsapp, buscar: Buscar = fetch): Promise<Resultado> {
  const auth = { Authorization: `Bearer ${cfg.token}` };
  let r: Response;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", new Blob([m.pdf as BlobPart], { type: "application/pdf" }), m.arquivo);
    r = await buscar(urlMeta(cfg, `${encodeURIComponent(cfg.numeroId)}/media`), {
      method: "POST",
      headers: auth,
      body: form,
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (e) {
    return semRede("o WhatsApp", e);
  }
  const midia = (await json(r)) as { id?: string } | null;
  if (!r.ok || !midia?.id) return { ok: false, ...falhaWhatsapp(r.status, midia) };
  try {
    r = await buscar(urlMeta(cfg, `${encodeURIComponent(cfg.numeroId)}/messages`), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: m.para,
        type: "template",
        template: {
          name: cfg.modelo,
          language: { code: cfg.idioma },
          components: [
            { type: "header", parameters: [{ type: "document", document: { id: midia.id, filename: m.arquivo } }] },
            { type: "body", parameters: m.parametros.map((text) => ({ type: "text", text })) },
          ],
        },
      }),
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (e) {
    return semRede("o WhatsApp", e);
  }
  const c = (await json(r)) as { messages?: { id?: string }[] } | null;
  const id = c?.messages?.[0]?.id;
  if (!r.ok || !id) return { ok: false, ...falhaWhatsapp(r.status, c) };
  return { ok: true, id };
}
