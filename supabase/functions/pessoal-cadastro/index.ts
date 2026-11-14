// Edge Function: cadastro aberto do MDC - Pessoal (075). Qualquer pessoa cria a conta com nome, e-mail e a própria
// senha; a família é criada depois, já logada, pela função do banco pessoal_criar_familia. Sem e-mail de confirmação
// (o HUB não manda e-mail de cadastro); a trava é por endereço de rede: no máximo 5 contas por hora
// (pessoal_cadastro_tentativa, guarda só o resumo SHA-256 do endereço). Campo escondido "site" pega robôs.
// A chave de serviço fica só aqui, no servidor; o site nunca a vê.
import { createClient } from "@supabase/supabase-js";

const ORIGENS = ["https://hub.mdcassessoria.com", "https://mdcassessoria.com", "https://www.mdcassessoria.com", "https://mdc-tarefas.vercel.app"];
const CORS = {
  "Access-Control-Allow-Origin": ORIGENS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const cors = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return ORIGENS.includes(o) ? { ...CORS, "Access-Control-Allow-Origin": o } : CORS;
};

async function resumo(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mdc-pessoal:${texto}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const cabecalhos = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cabecalhos, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  let corpo: { nome?: unknown; email?: unknown; senha?: unknown; site?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    return json(400, { erro: "Pedido inválido." });
  }
  // robô preencheu o campo escondido: responde como se tivesse dado certo, sem criar nada
  if (typeof corpo.site === "string" && corpo.site.trim()) return json(200, { ok: true });

  const nome = String(corpo.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  if (nome.length < 2) return json(400, { erro: "Digite o seu nome." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return json(400, { erro: "Confira o e-mail digitado." });
  // mesma regra de web/src/lib/senhaProvisoria.ts
  if (senha.trim() !== senha || senha.length < 8 || senha.length > 72)
    return json(400, { erro: "A senha precisa ter de 8 a 72 caracteres, sem espaço no começo ou no fim." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "sem-ip";
  const { data: pode, error: eTrava } = await servico.rpc("pessoal_cadastro_tentativa", { p_ip_hash: await resumo(ip) });
  if (eTrava) {
    console.error("trava do cadastro falhou:", eTrava.message);
    return json(500, { erro: "Não foi possível criar a conta agora. Tente de novo em instantes." });
  }
  if (!pode) return json(429, { erro: "Muitas contas criadas a partir desta rede. Tente de novo daqui a uma hora." });

  const { error } = await servico.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
  if (error) {
    if (/already|registered|exists/i.test(error.message))
      return json(409, { erro: "Já existe uma conta com este e-mail. Entre com a sua senha." });
    console.error("cadastro falhou:", error.status ?? "", error.message);
    return json(500, { erro: "Não foi possível criar a conta agora. Tente de novo em instantes." });
  }
  return json(200, { ok: true });
});
