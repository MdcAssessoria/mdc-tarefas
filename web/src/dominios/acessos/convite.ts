import { SUPABASE_URL, SUPABASE_KEY, supabase } from "@/lib/supabase";

export interface RespostaConvite {
  enviado: boolean;
  link?: string;
  erro?: string;
}

/**
 * Dispara o e-mail de convite (a pessoa cria a própria senha pelo link).
 * O convite precisa ter sido registrado antes (hub_convidar ou portal_convidar).
 * Quando o e-mail não sai (SMTP), volta o link para o administrador repassar.
 */
export async function enviarConvite(email: string, nome?: string): Promise<RespostaConvite> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { enviado: false, erro: "Sessão expirada. Entre de novo." };
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/convite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, nome, origem: window.location.origin }),
    });
    const corpo = (await r.json().catch(() => ({}))) as RespostaConvite;
    if (!r.ok) return { enviado: false, erro: corpo.erro ?? "Não foi possível enviar o convite." };
    return corpo;
  } catch {
    return { enviado: false, erro: "Sem conexão com o servidor." };
  }
}
