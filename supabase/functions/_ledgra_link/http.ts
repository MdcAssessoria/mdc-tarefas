// Peças comuns das Funções Edge do Ledgra Link (ledgra-link e ledgra-link-webhook): CORS restrito às origens do HUB,
// resposta JSON e os dois clientes do Supabase. Cópia enxuta de _fiscal/http.ts, sem a parte de SEFAZ/certificado,
// para estas funções não carregarem o módulo fiscal inteiro na publicação. Se mudar as origens lá, mude aqui também.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
