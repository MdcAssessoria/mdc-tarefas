// Edge Function: gera o PDF das demonstrações de um balancete no padrão MDC e,
// quando o balancete está publicado e há certificado A1 cadastrado, assina digitalmente.
// O acesso ao balancete segue as regras do banco (RLS) do usuário que pediu.
import { createClient } from "@supabase/supabase-js";
import { gerarPdf } from "./pdf.ts";
import { assinar } from "./assinatura.ts";
import { somarDfc, somarDre } from "./demonstracoes.ts";
import type { Demonstracoes, Dfc } from "./demonstracoes.ts";
import type { Linha, Resumo } from "./balancete.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition, x-assinado",
};


// logo da organização (enviada no Hub e guardada no Storage); cache por caminho
const cacheLogo = new Map<string, Uint8Array | null>();

async function baixar(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login para baixar o PDF." });
  let id = "";
  try {
    id = String((await req.json()).balancete_id ?? "");
  } catch {
    /* corpo inválido */
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { erro: "Balancete inválido." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1. o próprio usuário precisa conseguir ler o balancete (equipe com acesso ou cliente com o mês publicado)
  const { data: b } = await usuario.from("portal_balancetes").select("*").eq("id", id).maybeSingle();
  if (!b) return json(404, { erro: "Balancete não encontrado ou sem permissão." });
  if (!b.demonstracoes) return json(409, { erro: "As demonstrações deste mês ainda não foram geradas. Peça à MDC para reprocessar o balancete." });

  const ano = String(b.competencia).slice(0, 4);
  const [linhas, hist, cli, par] = await Promise.all([
    usuario.from("portal_balancete_linhas").select("classificacao,codigo,descricao,nivel,analitica,saldo_anterior,debitos,creditos,saldo_atual,grupo").eq("balancete_id", id).order("classificacao").limit(20000),
    usuario.from("portal_balancetes").select("competencia,resumo,demonstracoes").eq("cliente_id", b.cliente_id).gte("competencia", `${ano}-01-01`).lte("competencia", b.competencia).order("competencia"),
    servico.from("clientes").select("razao_social,cnpj").eq("id", b.cliente_id).single(),
    usuario.from("portal_pareceres").select("texto,status,contador_nome,contador_crc,versao").eq("balancete_id", id).order("versao", { ascending: false }),
  ]);
  const pareceres = (par.data ?? []) as { texto: string; status: string; contador_nome: string | null; contador_crc: string | null }[];
  const parecer = pareceres.find((p) => p.status === "publicado") ?? (b.status !== "publicado" ? pareceres[0] : undefined) ?? null;

  // acumulado do ano somando os meses (quando todos os meses do ano estão disponíveis)
  const demo = b.demonstracoes as Demonstracoes;
  const meses = (hist.data ?? []) as { competencia: string; resumo: Resumo; demonstracoes: Demonstracoes | null }[];
  const completo = demo.periodo.dias <= 31 && meses.length === Number(String(b.competencia).slice(5, 7)) && meses.length > 1;
  const acumulado = completo
    ? {
        titulo: `Acumulado ${ano}`,
        dre: somarDre(meses.map((m) => m.resumo.mes)),
        dfc: somarDfc(meses.map((m) => m.demonstracoes?.dfc).filter((x): x is Dfc => !!x)),
      }
    : null;

  // 2. certificado: só assina o que está publicado
  type Cert = { pfx: string; senha: string; titular: string; emissor: string; valido_ate: string };
  let cert: Cert | null = null;
  if (b.status === "publicado") {
    const { data } = await servico.rpc("cert_obter", { p_org: b.org_id });
    const c = (data as Cert[] | null)?.[0] ?? null;
    if (c && new Date(c.valido_ate) > new Date()) cert = c;
  }

  const { data: orgRow } = await servico.from("organizacoes").select("logo_url").eq("id", b.org_id).single();
  const logoUrl = (orgRow as { logo_url: string | null } | null)?.logo_url ?? "";
  // só a logo da própria organização (Storage) ou do site da MDC
  const permitida =
    (logoUrl.startsWith("storage:") && logoUrl.slice(8).startsWith(`${b.org_id}/`) && !logoUrl.includes("..")) ||
    /^https:\/\/(www\.)?mdcassessoria\.com\//.test(logoUrl);
  if (logoUrl && permitida && !cacheLogo.has(logoUrl)) {
    if (logoUrl.startsWith("storage:")) {
      const { data: arq } = await servico.storage.from("hub-arquivos").download(logoUrl.slice(8));
      cacheLogo.set(logoUrl, arq ? new Uint8Array(await arq.arrayBuffer()) : null);
    } else cacheLogo.set(logoUrl, await baixar(logoUrl));
  }
  const logo = cacheLogo.get(logoUrl) ?? null;

  const cliente = (cli.data ?? { razao_social: "Empresa", cnpj: null }) as { razao_social: string; cnpj: string | null };
  const num = (x: Record<string, unknown>) => ({
    ...x,
    saldo_anterior: Number(x.saldo_anterior),
    debitos: Number(x.debitos),
    creditos: Number(x.creditos),
    saldo_atual: Number(x.saldo_atual),
  });
  const pdf = await gerarPdf({
    empresa: cliente.razao_social,
    cnpj: cliente.cnpj,
    competencia: b.competencia,
    status: b.status,
    resumo: b.resumo,
    indices: b.indices,
    alertas: b.alertas ?? [],
    demonstracoes: demo,
    acumulado,
    linhas: ((linhas.data ?? []) as Record<string, unknown>[]).map(num) as unknown as Linha[],
    comentario: b.comentario,
    parecer,
    assinatura: cert ? { titular: cert.titular, emissor: cert.emissor, validade: cert.valido_ate.slice(0, 10).split("-").reverse().join("/") } : null,
    logo,
  });

  let bytes: Uint8Array;
  let assinado = false;
  if (cert) {
    try {
      const pfx = Uint8Array.from(atob(cert.pfx), (c) => c.charCodeAt(0));
      bytes = await assinar(pdf, pfx, cert.senha, {
        nome: cert.titular,
        motivo: "Responsável técnico pelas demonstrações contábeis",
        local: "Bragança Paulista/SP",
        contato: "MDC Assessoria Contábil",
      });
      assinado = true;
    } catch (e) {
      console.error("falha ao assinar", e);
      bytes = await pdf.save();
    }
  } else bytes = await pdf.save();

  const nome = `MDC-${cliente.razao_social.split(" ").slice(0, 2).join("-")}-${String(b.competencia).slice(0, 7)}${assinado ? "-assinado" : ""}.pdf`
    .normalize("NFD")
    .replace(/[^\w.-]/g, "");
  return new Response(bytes as unknown as BodyInit, {
    headers: { ...CORS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"`, "x-assinado": assinado ? "1" : "0" },
  });
});
