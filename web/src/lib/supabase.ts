import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Projeto Supabase oficial do MDC Tarefas (mdc-tarefas · São Paulo).
// A chave publishable é pública por natureza (vai para o navegador); a segurança está nas regras RLS do banco.
// Fixado no código porque a integração Supabase–Vercel do projeto ainda aponta para um projeto antigo desativado.
const PROJETO_URL = "https://bulqqdgfrrpqquqvjjfa.supabase.co";
const PROJETO_KEY = "sb_publishable_PZ8K_Udj-1cbUEAaTnkgYA_AmtuSLqU";

// NEXT_PUBLIC_MDC_SUPABASE_* permite trocar de projeto sem mexer no código.
const url = process.env.NEXT_PUBLIC_MDC_SUPABASE_URL || PROJETO_URL;
const key = process.env.NEXT_PUBLIC_MDC_SUPABASE_KEY || PROJETO_KEY;

export const supabaseConfigurado = Boolean(url && key);
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}
