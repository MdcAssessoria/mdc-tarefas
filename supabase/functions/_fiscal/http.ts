// Peças comuns das Funções Edge fiscais: CORS restrito às origens do HUB, resposta JSON, clientes do Supabase e a
// conexão com certificado de cliente (mTLS) para SEFAZ/ADN.
//
// mTLS: Deno.createHttpClient({ cert, key, http2: false }) apresenta o certificado da empresa na conexão (sondagem de
// 01/11/2026, docs/futuro/hub-gestao-desenho.md). A SEFAZ exige HTTP/1.1 (com HTTP/2 responde "endpoint requires HTTP/1.1").
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequisicaoSoap } from "./nucleo/sefaz.ts";

export const ORIGENS = ["https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://hub.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];

export function cabecalhos(req: Request, metodos = "POST, OPTIONS") {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": metodos,
    Vary: "Origin",
  };
}

export const resposta = (h: Record<string, string>) => (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...h, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
export type Banco = SupabaseClient<any>;

/** Cliente com a chave de serviço (só no servidor; vem das variáveis de ambiente da função). */
export const bancoServico = (): Banco =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** Cliente com o login de quem chamou (as regras de acesso do banco valem para ele). */
export const bancoUsuario = (auth: string): Banco =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

/** Conexão HTTP/1.1 que apresenta o certificado A1 da empresa. */
export function conexaoComCertificado(certPem: string, chavePem: string): Deno.HttpClient {
  // deno-lint-ignore no-explicit-any
  return Deno.createHttpClient({ cert: certPem, key: chavePem, http2: false, http1: true } as any);
}

/** Função que envia um SOAP e devolve o XML da resposta (trocável nos testes). */
export type EnviarSoap = (r: RequisicaoSoap) => Promise<string>;

export function enviarSoapCom(client: Deno.HttpClient, tempoMs = 60_000): EnviarSoap {
  return async (r) => {
    let resp: Response;
    try {
      resp = await fetch(r.url, {
        method: "POST",
        headers: { "Content-Type": r.contentType },
        body: r.corpo,
        client,
        signal: AbortSignal.timeout(tempoMs),
      } as RequestInit);
    } catch (e) {
      throw new Error(`Não foi possível falar com a SEFAZ (${(e as Error).message}). Confira se o certificado é ICP-Brasil e válido.`);
    }
    const texto = await resp.text();
    // SOAP Fault vem com 500 e corpo XML: devolve para o leitor explicar o motivo
    if (!resp.ok && !texto.includes("Envelope")) throw new Error(`A SEFAZ respondeu ${resp.status}: ${texto.slice(0, 200)}`);
    return texto;
  };
}

/** Lê o corpo como JSON; texto que não é JSON vira { Erros: [{ Descricao }] } (para o leitor explicar). */
async function corpoJson(resp: Response): Promise<{ status: number; corpo: unknown }> {
  const texto = await resp.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { Erros: [{ Descricao: texto.slice(0, 200) }] };
  }
  return { status: resp.status, corpo };
}

/** GET com certificado (ADN e Sefin da NFS-e): devolve status e corpo JSON (ou null). */
export async function obterJson(client: Deno.HttpClient, url: string, tempoMs = 60_000): Promise<{ status: number; corpo: unknown }> {
  const resp = await fetch(url, { headers: { Accept: "application/json" }, client, signal: AbortSignal.timeout(tempoMs) } as RequestInit);
  return corpoJson(resp);
}

/** POST JSON com certificado (emissão da NFS-e na Sefin Nacional). */
export async function postarJson(client: Deno.HttpClient, url: string, corpo: unknown, tempoMs = 60_000): Promise<{ status: number; corpo: unknown }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corpo),
    client,
    signal: AbortSignal.timeout(tempoMs),
  } as RequestInit);
  return corpoJson(resp);
}

/** Chamadas JSON da API da NFS-e (trocável nos testes, que não usam rede). */
export interface TransporteJson {
  postarJson(url: string, corpo: unknown): Promise<{ status: number; corpo: unknown }>;
  obterJson(url: string): Promise<{ status: number; corpo: unknown }>;
}

export const transporteCom = (client: Deno.HttpClient, tempoMs = 60_000): TransporteJson => ({
  postarJson: (url, corpo) => postarJson(client, url, corpo, tempoMs),
  obterJson: (url) => obterJson(client, url, tempoMs),
});
