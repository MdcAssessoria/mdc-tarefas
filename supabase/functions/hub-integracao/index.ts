// Edge Function hub-integracao (migração 092, auditoria 19/11/2026 SEG-01): porta única de outros sistemas da MDC
// (hoje o Ledgra) para o HUB, no lugar da chave de serviço do HUB guardada no servidor deles.
//
// Quem chama: só o servidor do sistema, com dois cabeçalhos:
//   x-hub-sistema:    nome do sistema (ex.: "ledgra")
//   x-hub-integracao: código do sistema, gerado pelo banco no Vault ('integracao_token_<sistema>')
// Sem login (verify_jwt = false): a conferência é o código. Não há CORS: o navegador nunca chama esta Função.
//
// Ações (corpo JSON { acao, ... }), cada uma chama uma função do banco que já tem a regra:
//   vincular_cnpj   { cnpj }  → lic_ledgra_vincular_cnpj        → { chave }
//   buscar_clientes { busca } → integracao_clientes_buscar      → { clientes: [...] }
//   raiox_conferir  { p }     → crm_raiox_conferir              → { conferencia }
// Cada sistema só usa as ações liberadas para ele (ACOES). Toda chamada fica em app.integracao_chamadas.
// Recusa de regra do negócio (mensagem em português do banco) volta com status 422 e { erro }, para o sistema mostrar.
import { createClient } from "@supabase/supabase-js";

const ACOES: Record<string, string[]> = {
  ledgra: ["vincular_cnpj", "buscar_clientes", "raiox_conferir"],
};

type Erro = { message?: string; code?: string } | null;

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Mensagem do banco que pode ir ao usuário: as recusas escritas em português (raise exception → P0001). */
function mensagemDeNegocio(e: Erro): string | null {
  const m = (e?.message ?? "").trim();
  if (!m) return null;
  return e?.code === "P0001" ? m.slice(0, 300) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  const sistema = (req.headers.get("x-hub-sistema") ?? "").trim().toLowerCase();
  const token = (req.headers.get("x-hub-integracao") ?? "").trim();
  if (!sistema || !token || !(sistema in ACOES)) return json(401, { erro: "Chamada não autorizada." });

  const servico = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const registrar = (acao: string, ok: boolean, detalhe: string | null) =>
    servico.rpc("integracao_registrar", { p_sistema: sistema, p_acao: acao, p_ok: ok, p_detalhe: detalhe });

  const conf = await servico.rpc("integracao_token_confere", { p_sistema: sistema, p_token: token });
  if (conf.data !== true) {
    await registrar("autorizacao", false, "código recusado");
    return json(401, { erro: "Chamada não autorizada." });
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { erro: "Corpo inválido." });
  }
  const acao = typeof corpo.acao === "string" ? corpo.acao : "";
  if (!ACOES[sistema].includes(acao)) {
    await registrar(acao || "vazia", false, "ação não liberada");
    return json(403, { erro: "Ação não liberada para este sistema." });
  }

  // cada ação devolve { data, error } da função do banco
  let r: { data: unknown; error: Erro };
  if (acao === "vincular_cnpj") {
    const cnpj = String(corpo.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) return json(422, { erro: "CNPJ inválido" });
    r = await servico.rpc("lic_ledgra_vincular_cnpj", { p_cnpj: cnpj });
  } else if (acao === "buscar_clientes") {
    r = await servico.rpc("integracao_clientes_buscar", { p_busca: String(corpo.busca ?? "").slice(0, 120) });
  } else {
    const p = corpo.p;
    if (!p || typeof p !== "object" || Array.isArray(p)) return json(422, { erro: "Dados do Raio-X inválidos." });
    r = await servico.rpc("crm_raiox_conferir", { p });
  }

  if (r.error) {
    const m = mensagemDeNegocio(r.error);
    await registrar(acao, false, m ?? `erro técnico ${r.error.code ?? ""}`.trim());
    if (m) return json(422, { erro: m });
    console.error("hub-integracao", sistema, acao, r.error);
    return json(500, { erro: "O HUB MDC não respondeu agora. Tente de novo em instantes." });
  }
  await registrar(acao, true, null);

  if (acao === "vincular_cnpj") {
    const chave = (r.data as { chave?: string } | null)?.chave;
    return chave ? json(200, { chave }) : json(500, { erro: "O HUB MDC não devolveu a licença." });
  }
  if (acao === "buscar_clientes") return json(200, { clientes: r.data ?? [] });
  return json(200, { conferencia: r.data });
});
