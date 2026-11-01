// Edge Function fiscal-certificado: cadastro do certificado digital A1 (e-CNPJ) de uma EMPRESA cliente, usado para
// baixar as notas (Distribuição DF-e e ADN), manifestar e, no futuro, assinar a emissão.
//
//   POST (multipart): cliente, arquivo (.pfx/.p12), senha → confere a senha, o CNPJ raiz (igual ao do cadastro da
//                     empresa) e a validade; guarda o arquivo e a senha no Vault (fis_cert_salvar). Nunca devolve nada
//                     além dos dados públicos (titular, CNPJ, emissor, validade).
//   DELETE ?cliente=  → remove o certificado (fis_cert_remover).
// Quem pode: equipe com a ferramenta Financeiro (gerir) ou o próprio cliente no Portal (permissão financeiro),
// conferido no banco por public.fis_pode_certificado com o login de quem chamou.
import { bancoServico, bancoUsuario, cabecalhos, resposta } from "../_fiscal/http.ts";
import { abrirCertificado, conferirParaEmpresa, paraBase64 } from "../_fiscal/certificado.ts";

Deno.serve(async (req) => {
  const h = cabecalhos(req, "POST, DELETE, OPTIONS");
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const usuario = bancoUsuario(auth);
  const servico = bancoServico();
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });
  const pode = async (cliente: string) => (await usuario.rpc("fis_pode_certificado", { p_cliente: cliente })).data === true;

  if (req.method === "DELETE") {
    const cliente = new URL(req.url).searchParams.get("cliente") ?? "";
    if (!(await pode(cliente))) return json(403, { erro: "Sem permissão para remover o certificado desta empresa." });
    const { error } = await servico.rpc("fis_cert_remover", { p_cliente: cliente, p_user: u.user.id });
    if (error) return json(500, { erro: "Não foi possível remover o certificado." });
    return json(200, { ok: true });
  }
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });

  const form = await req.formData().catch(() => null);
  const cliente = String(form?.get("cliente") ?? "");
  const senha = String(form?.get("senha") ?? "");
  const arq = form?.get("arquivo");
  if (!/^[0-9a-f-]{36}$/i.test(cliente)) return json(400, { erro: "Escolha a empresa." });
  if (!(await pode(cliente))) return json(403, { erro: "Sem permissão para cadastrar o certificado desta empresa." });
  if (!(arq instanceof File) || arq.size === 0) return json(400, { erro: "Selecione o arquivo .pfx ou .p12 do certificado A1." });
  if (arq.size > 50_000) return json(400, { erro: "Arquivo grande demais para um certificado A1." });
  if (!senha) return json(400, { erro: "Informe a senha do certificado." });
  const pfx = new Uint8Array(await arq.arrayBuffer());

  let aberto;
  try {
    aberto = abrirCertificado(pfx, senha);
  } catch (e) {
    return json(400, { erro: (e as Error).message });
  }
  const { data: emp } = await servico.from("clientes").select("cnpj").eq("id", cliente).maybeSingle();
  const problema = conferirParaEmpresa(aberto.info, emp?.cnpj);
  if (problema) return json(400, { erro: problema });

  const { error } = await servico.rpc("fis_cert_salvar", {
    p_cliente: cliente,
    p_user: u.user.id,
    p_pfx: paraBase64(pfx),
    p_senha: senha,
    p_info: aberto.info,
  });
  if (error) {
    console.error(error);
    return json(500, { erro: "Não foi possível guardar o certificado." });
  }
  return json(200, {
    ok: true,
    certificado: aberto.info,
    aviso: aberto.info.icp_brasil ? null : "Este certificado não é ICP-Brasil: a SEFAZ e o ADN vão recusar a conexão.",
  });
});
