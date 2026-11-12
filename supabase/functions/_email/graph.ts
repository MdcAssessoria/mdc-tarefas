// E-mail de acesso do HUB (convite e "esqueci a senha") pelo Microsoft Graph, como hub@mdcassessoria.com.
// Substitui o SMTP do Supabase, que a Microsoft deixava sem resposta (12/11/2026) e que ela desliga por padrão no fim de
// 12/2026. Usa os mesmos segredos do envio das faturas (GRAPH_*). Sem os segredos, quem chama volta ao caminho antigo.
export interface ConfigGraph {
  tenant: string;
  cliente: string;
  segredo: string;
  remetente: string;
}

export const SEGREDOS_GRAPH = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_REMETENTE"] as const;

/** Configuração do Graph, ou null se faltar algum segredo (nunca mostra valores). */
export function lerGraph(env: (nome: string) => string | undefined): ConfigGraph | null {
  const v = (n: string) => (env(n) ?? "").trim();
  if (SEGREDOS_GRAPH.some((n) => !v(n))) return null;
  return { tenant: v("GRAPH_TENANT_ID"), cliente: v("GRAPH_CLIENT_ID"), segredo: v("GRAPH_CLIENT_SECRET"), remetente: v("GRAPH_REMETENTE") };
}

type Buscar = typeof fetch;
const TEMPO_MS = 15_000;
let guardado: { chave: string; valor: string; ate: number } | null = null;

/** Frase simples para o erro do Microsoft (sem dados da pessoa). */
export function erroGraph(status: number, corpo: unknown): string {
  // deno-lint-ignore no-explicit-any
  const c = corpo as any;
  const codigo = String(c?.error?.code ?? c?.error ?? "");
  const msg = String(c?.error?.message ?? c?.error_description ?? "");
  if (/invalid_client|unauthorized_client|AADSTS/i.test(`${codigo} ${msg}`))
    return "o Microsoft 365 recusou o aplicativo do HUB (confira os segredos GRAPH_* e se a senha do aplicativo venceu)";
  if (status === 401 || status === 403 || /AccessDenied|Authorization_RequestDenied/i.test(codigo))
    return "o Microsoft 365 não deixou o aplicativo enviar pela caixa do HUB (permissão Mail.Send)";
  if (/MailboxNotEnabledForRESTAPI|ErrorInvalidUser|ResourceNotFound/i.test(codigo) || status === 404)
    return "a caixa de envio (GRAPH_REMETENTE) não foi encontrada no Microsoft 365";
  if (/recipient/i.test(`${codigo} ${msg}`)) return "o endereço de e-mail foi recusado";
  if (status === 429 || status >= 500) return "o Microsoft 365 está ocupado agora; tente de novo em alguns minutos";
  return `o Microsoft 365 respondeu ${status}`;
}

async function lerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function token(cfg: ConfigGraph, buscar: Buscar): Promise<string> {
  const chave = `${cfg.tenant}|${cfg.cliente}`;
  if (guardado && guardado.chave === chave && guardado.ate > Date.now()) return guardado.valor;
  const r = await buscar(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.cliente,
      client_secret: cfg.segredo,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
    signal: AbortSignal.timeout(TEMPO_MS),
  });
  const c = (await lerJson(r)) as { access_token?: string; expires_in?: number } | null;
  if (!r.ok || !c?.access_token) throw new Error(erroGraph(r.status, c ?? {}));
  guardado = { chave, valor: c.access_token, ate: Date.now() + Math.max(60, (c.expires_in ?? 3600) - 300) * 1000 };
  return c.access_token;
}

/** Manda um e-mail HTML pela caixa do HUB. Lança Error com frase simples se falhar. */
export async function enviarPeloGraph(
  cfg: ConfigGraph,
  m: { para: string; assunto: string; html: string },
  buscar: Buscar = fetch,
): Promise<void> {
  const t = await token(cfg, buscar);
  let r: Response;
  try {
    r = await buscar(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.remetente)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: m.assunto,
          body: { contentType: "HTML", content: m.html },
          toRecipients: [{ emailAddress: { address: m.para.trim() } }],
        },
        saveToSentItems: false,
      }),
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (e) {
    throw new Error(`sem resposta do Microsoft 365 (${(e as Error).name})`);
  }
  if (r.status === 202 || r.ok) {
    await r.body?.cancel();
    return;
  }
  if (r.status === 401) guardado = null;
  throw new Error(erroGraph(r.status, await lerJson(r)));
}

/** Só para os testes: esquece o token guardado. */
export const esquecerToken = () => {
  guardado = null;
};
