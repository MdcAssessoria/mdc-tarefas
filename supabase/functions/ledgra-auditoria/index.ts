// Edge Function ledgra-auditoria (HUB-MDC · Demonstrativos › Auditoria fiscal (SAP), migração 122).
//
//   POST (multipart): org, cliente (opcional), cnpj (da filial), regime (opcional), arquivo (.txt/.xlsx/.xls/.csv
//                     exportado do SAP) → manda ao Ledgra Auditor e guarda o resultado em auditorias_erp.
//
// Quem pode: equipe com Demonstrativos (operar), conferido no banco por public.auditoria_erp_pode com o login de quem
// chamou. No Ledgra, a conferência roda como o usuário do Ledgra com o MESMO e-mail (precisa ter o Auditor liberado
// para a empresa). O arquivo vai compactado em gzip (o servidor do Ledgra aceita até 4,5 MB por pedido).
//
// Código de integração: o do Ledgra no Vault do HUB (092), lido por public.integracao_token_ler (só a chave de
// serviço). Endereço do Ledgra: segredo opcional LEDGRA_URL; sem ele, https://ledgra.com.br. Nada é digitado.
import { bancoServico, bancoUsuario, cabecalhos, resposta } from "../_fiscal/http.ts";

const LIMITE = 40 * 1024 * 1024;
const EXTENSOES = /\.(txt|tsv|csv|xlsx|xls)$/i;
const REGIMES = ["", "NAO CUMULATIVO", "CUMULATIVO", "SIMPLES"];

async function gzipBase64(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const comp = new Uint8Array(await new Response(fluxo).arrayBuffer());
  let s = "";
  for (let i = 0; i < comp.length; i += 0x8000) s += String.fromCharCode(...comp.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const usuario = bancoUsuario(auth);
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user?.email) return json(401, { erro: "Sessão expirada. Entre de novo." });

  const form = await req.formData().catch(() => null);
  const org = String(form?.get("org") ?? "");
  const cliente = String(form?.get("cliente") ?? "") || null;
  const cnpj = String(form?.get("cnpj") ?? "").replace(/\D/g, "");
  const regime = String(form?.get("regime") ?? "");
  const arq = form?.get("arquivo");
  if (!/^[0-9a-f-]{36}$/i.test(org)) return json(400, { erro: "Organização não informada." });
  if (cliente && !/^[0-9a-f-]{36}$/i.test(cliente)) return json(400, { erro: "Empresa inválida." });
  if (cnpj.length !== 14) return json(400, { erro: "Informe o CNPJ da filial (14 dígitos)." });
  if (!REGIMES.includes(regime)) return json(400, { erro: "Regime de PIS/COFINS desconhecido." });
  if (!(arq instanceof File) || arq.size === 0) return json(400, { erro: "Escolha o arquivo exportado do SAP." });
  if (!EXTENSOES.test(arq.name)) return json(400, { erro: "Envie o relatório em .txt, .xlsx, .xls ou .csv." });
  if (arq.size > LIMITE) return json(400, { erro: "O arquivo passa de 40 MB. Exporte um período menor." });
  const { data: pode } = await usuario.rpc("auditoria_erp_pode", { p_org: org });
  if (pode !== true) return json(403, { erro: "Você não tem permissão para auditar (Demonstrativos, operar)." });

  const servico = bancoServico();
  if (cliente) {
    const { data: c } = await servico.from("clientes").select("org_id").eq("id", cliente).maybeSingle();
    if (c?.org_id !== org) return json(400, { erro: "Empresa não encontrada nesta organização." });
  }
  const { data: token, error: eToken } = await servico.rpc("integracao_token_ler", { p_sistema: "ledgra" });
  if (eToken || !token) return json(500, { erro: "A ligação com o Ledgra não está configurada no HUB." });

  const base = (Deno.env.get("LEDGRA_URL") ?? "https://ledgra.com.br").replace(/\/+$/, "");
  let r: Response;
  try {
    r = await fetch(`${base}/api/public/hub/auditoria-erp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-sistema": "hub", "x-hub-integracao": String(token) },
      body: JSON.stringify({
        cnpj,
        solicitante_email: u.user.email,
        arquivo_nome: arq.name,
        arquivo_base64: await gzipBase64(new Uint8Array(await arq.arrayBuffer())),
        compactado: "gzip",
        regime: regime || null,
      }),
      signal: AbortSignal.timeout(140_000),
    });
  } catch {
    return json(502, { erro: "O Ledgra não respondeu agora. Tente de novo em instantes." });
  }
  // deno-lint-ignore no-explicit-any
  const corpo = (await r.json().catch(() => null)) as any;
  if (r.status === 422 && corpo?.erro) return json(422, { erro: String(corpo.erro) });
  if (!r.ok || !corpo?.id) {
    if (r.status === 401) console.error("o Ledgra recusou o código de integração do HUB");
    else console.error("ledgra-auditoria: resposta", r.status);
    return json(502, { erro: "O Ledgra não conseguiu auditar agora. Tente de novo em instantes." });
  }

  const { data: gravada, error } = await servico
    .from("auditorias_erp")
    .insert({
      org_id: org,
      cliente_id: cliente,
      cnpj,
      empresa: corpo.empresa ?? null,
      arquivo_nome: arq.name.slice(0, 200),
      regime: REGIMES.includes(corpo.regime ?? "") ? corpo.regime ?? "" : "",
      ledgra_id: String(corpo.id),
      link: String(corpo.link),
      linhas: Number(corpo.linhas) || 0,
      fora: Number(corpo.fora) || 0,
      resumo: corpo.resumo ?? {},
      por_regra: Array.isArray(corpo.porRegra) ? corpo.porRegra : [],
      achados: Array.isArray(corpo.achados) ? corpo.achados.slice(0, 1000) : [],
      solicitado_por: u.user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("ledgra-auditoria: gravar", error.message);
    return json(500, { erro: "A auditoria foi feita no Ledgra, mas não consegui guardar aqui. Abra pelo Ledgra.", link: corpo.link });
  }
  return json(200, { id: gravada.id, link: corpo.link, chavesNumericas: Number(corpo.chavesNumericas) || 0 });
});
