// Edge Function: entrega a proposta comercial (PDF anexado na ficha da oportunidade do CRM) já assinada
// digitalmente com o certificado A1 da organização, como o PDF do demonstrativo (migração 115, 23/11/2026).
// - Quem pede precisa conseguir ver o anexo pelas regras do banco (RLS de hub_arquivos: Comercial › ver).
// - O PDF ganha, em todas as páginas, um rodapé dizendo quem assinou e onde conferir, e a assinatura PAdES
//   (verificável no Adobe e em validar.iti.gov.br). O arquivo guardado no HUB não muda: assina a cada download.
// - Sem certificado válido a proposta não sai (a regra é sair assinada).
// - Cada download fica no histórico da oportunidade (tipo "proposta", com o SHA-256 do PDF entregue).
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { assinar } from "../demonstrativo-pdf/assinatura.ts";
import { chaveSecreta, chavePublica } from "../_compartilhado/chaves.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition, x-assinado",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const VERDE = rgb(11 / 255, 40 / 255, 32 / 255);
const SUAVE = rgb(0.33, 0.39, 0.36);

/** "2026-11-23T..." → "23/11/2026 14:05" no horário de Brasília. */
function agoraBr(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login para baixar a proposta." });
  let id = "";
  try {
    id = String((await req.json()).arquivo_id ?? "");
  } catch {
    /* corpo inválido */
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { erro: "Proposta inválida." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, chavePublica(), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const servico = createClient(url, chaveSecreta(), { auth: { persistSession: false } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });

  // 1. o próprio usuário precisa conseguir ver o anexo (Comercial › ver)
  const { data: a } = await usuario
    .from("hub_arquivos")
    .select("id,org_id,app,ref_id,nome,caminho,retirado_em")
    .eq("id", id)
    .maybeSingle();
  if (!a || a.app !== "comercial" || !a.ref_id) return json(404, { erro: "Proposta não encontrada ou sem permissão." });
  if (a.retirado_em) return json(409, { erro: "Esta proposta foi retirada da ficha." });
  if (!/\.pdf$/i.test(a.nome)) return json(400, { erro: "Só propostas em PDF saem assinadas." });

  const { data: op } = await servico.from("crm_oportunidades").select("id,org_id,empresa").eq("id", a.ref_id).maybeSingle();
  if (!op || op.org_id !== a.org_id) return json(404, { erro: "Oportunidade da proposta não encontrada." });

  // 2. certificado da organização (Vault); sem ele a proposta não sai
  const { data: certs } = await servico.rpc("cert_obter", { p_org: a.org_id });
  const cert = (certs as { pfx: string; senha: string; titular: string; emissor: string; valido_ate: string }[] | null)?.[0];
  if (!cert) return json(409, { erro: "Cadastre o certificado digital A1 em Configurações para baixar a proposta assinada." });
  if (new Date(cert.valido_ate) <= new Date()) return json(409, { erro: "O certificado digital venceu. Cadastre o novo em Configurações." });

  // 3. o PDF guardado
  const { data: arq, error: errArq } = await servico.storage.from("hub-arquivos").download(a.caminho);
  if (errArq || !arq) return json(404, { erro: "Arquivo da proposta não encontrado no armazenamento." });
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(new Uint8Array(await arq.arrayBuffer()), { updateMetadata: false });
  } catch {
    return json(400, { erro: "Não foi possível abrir o PDF (protegido por senha ou corrompido). Gere o PDF de novo e anexe." });
  }

  // 4. rodapé da assinatura em todas as páginas
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const quando = agoraBr();
  const validade = cert.valido_ate.slice(0, 10).split("-").reverse().join("/");
  const linha1 = `Assinado digitalmente por ${cert.titular} · certificado ICP-Brasil (${cert.emissor})`;
  const linha2 = `Em ${quando} · válido até ${validade} · confira em validar.iti.gov.br`;
  for (const pg of pdf.getPages()) {
    const { width } = pg.getSize();
    const t = 6.5;
    const larg = Math.max(negrito.widthOfTextAtSize(linha1, t), fonte.widthOfTextAtSize(linha2, t));
    const x = Math.max(8, width - larg - 14);
    pg.drawRectangle({ x: x - 6, y: 4, width: larg + 12, height: 21, color: rgb(1, 1, 1), opacity: 0.92 });
    pg.drawText(linha1, { x, y: 16, size: t, font: negrito, color: VERDE });
    pg.drawText(linha2, { x, y: 8, size: t, font: fonte, color: SUAVE });
  }

  // 5. assinatura PAdES
  let bytes: Uint8Array;
  try {
    const pfx = Uint8Array.from(atob(cert.pfx), (c) => c.charCodeAt(0));
    bytes = await assinar(pdf, pfx, cert.senha, {
      nome: cert.titular,
      motivo: `Proposta comercial para ${op.empresa}`,
      local: "Bragança Paulista/SP",
      contato: "MDC Assessoria Contábil",
    });
  } catch (e) {
    console.error("falha ao assinar a proposta", e);
    return json(500, { erro: "Não foi possível assinar a proposta agora. Tente de novo em instantes." });
  }

  // 6. histórico da oportunidade
  const hash = await sha256(bytes);
  const { error: errHist } = await servico.from("crm_atividades").insert({
    org_id: a.org_id,
    oportunidade_id: op.id,
    tipo: "proposta",
    texto: `Proposta "${a.nome}" baixada assinada digitalmente por ${cert.titular} (SHA-256 ${hash.slice(0, 16)}…).`,
    quando: new Date().toISOString(),
    concluida: true,
    autor_id: u.user.id,
  });
  if (errHist) console.error("histórico da proposta", errHist);

  const nome = `${a.nome.replace(/\.pdf$/i, "")}-assinado.pdf`.normalize("NFD").replace(/[^\w.-]/g, "_");
  return new Response(bytes as unknown as BodyInit, {
    headers: { ...CORS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"`, "x-assinado": "1" },
  });
});
