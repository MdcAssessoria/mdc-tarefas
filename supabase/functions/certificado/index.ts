// Edge Function: cadastro do certificado digital A1 da organização (só administradores).
// O arquivo .pfx e a senha ficam criptografados no Supabase Vault; nunca voltam para o navegador.
import { createClient } from "@supabase/supabase-js";
import { lerCertificado } from "./cert.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });

  const ehAdmin = async (org: string) => {
    const { data } = await servico.from("membros").select("papel,ativo").eq("org_id", org).eq("user_id", u.user!.id).maybeSingle();
    return !!data && data.ativo && data.papel === "admin";
  };

  if (req.method === "DELETE") {
    const org = new URL(req.url).searchParams.get("org") ?? "";
    if (!(await ehAdmin(org))) return json(403, { erro: "Só administradores podem remover o certificado." });
    const { error } = await servico.rpc("cert_remover", { p_org: org, p_user: u.user.id });
    if (error) return json(500, { erro: "Não foi possível remover o certificado." });
    return json(200, { ok: true });
  }
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });

  const form = await req.formData().catch(() => null);
  const org = String(form?.get("org") ?? "");
  const senha = String(form?.get("senha") ?? "");
  const arq = form?.get("arquivo");
  if (!(await ehAdmin(org))) return json(403, { erro: "Só administradores podem cadastrar o certificado." });
  if (!(arq instanceof File) || arq.size === 0) return json(400, { erro: "Selecione o arquivo .pfx ou .p12 do certificado A1." });
  if (arq.size > 50_000) return json(400, { erro: "Arquivo grande demais para um certificado A1." });
  const pfx = new Uint8Array(await arq.arrayBuffer());

  let info;
  try {
    info = lerCertificado(pfx, senha);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return json(400, { erro: /password|mac|decrypt|Invalid/i.test(msg) ? "Senha incorreta ou arquivo inválido." : msg });
  }
  if (new Date(info.valido_ate) < new Date()) return json(400, { erro: `Este certificado venceu em ${info.valido_ate.slice(0, 10).split("-").reverse().join("/")}.` });

  let b64 = "";
  for (let i = 0; i < pfx.length; i += 0x8000) b64 += String.fromCharCode(...pfx.subarray(i, i + 0x8000));
  const { error } = await servico.rpc("cert_salvar", { p_org: org, p_user: u.user.id, p_pfx: btoa(b64), p_senha: senha, p_info: info });
  if (error) {
    console.error(error);
    return json(500, { erro: "Não foi possível guardar o certificado." });
  }
  return json(200, { ok: true, certificado: info });
});
