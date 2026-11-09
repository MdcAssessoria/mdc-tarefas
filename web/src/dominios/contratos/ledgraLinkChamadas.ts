// Contratos › Ledgra Link (064): chamadas à Função Edge ledgra-link para cadastrar empresas, termos, contas,
// certificados e credenciais no Ledgra Link. A função confere Contratos › gerir com o login de quem pediu; senhas,
// Client Secret e o arquivo do certificado vão direto para o cofre do Ledgra Link e não ficam no HUB.
import { chamarFuncao } from "@/lib/funcoesEdge";
import { soDigitos } from "@/lib/documento";
import type {
  CadastrosLink,
  NovaConta,
  NovaCredencial,
  NovoCertificado,
  NovoTermo,
  NovoTitular,
} from "./ledgraLinkCadastro";

const FUNCAO = "ledgra-link";

export interface Resposta {
  id: string;
  mensagem?: string;
}

export const lerCadastrosLink = (org: string) =>
  chamarFuncao<CadastrosLink>(FUNCAO, { corpo: { acao: "cadastros", org } });

export const cadastrarTitular = (org: string, t: NovoTitular) =>
  chamarFuncao<Resposta & { novo: boolean; liberado: boolean }>(FUNCAO, {
    corpo: {
      acao: "titular",
      org,
      documento: soDigitos(t.documento),
      razao_social: t.razao_social.trim(),
      email_contato: t.email_contato.trim() || undefined,
    },
  });

export function registrarTermo(org: string, titular: string, t: NovoTermo) {
  const f = new FormData();
  f.set("acao", "autorizacao");
  f.set("org", org);
  f.set("titular_id", titular);
  f.set("escopos", t.escopos.join(","));
  f.set("assinado_por_nome", t.assinado_por_nome.trim());
  f.set("assinado_por_cpf", soDigitos(t.assinado_por_cpf));
  f.set("assinado_em", t.assinado_em);
  if (t.vigente_ate) f.set("vigente_ate", t.vigente_ate);
  if (t.arquivo) f.set("termo", t.arquivo);
  return chamarFuncao<Resposta & { hash: string }>(FUNCAO, { form: f });
}

export const cadastrarConta = (org: string, titular: string, c: NovaConta) =>
  chamarFuncao<Resposta>(FUNCAO, {
    corpo: {
      acao: "conta",
      org,
      titular_id: titular,
      codigo_compe: c.codigo_compe,
      agencia: c.agencia.trim(),
      conta: c.conta.trim(),
      conta_dv: c.conta_dv.trim() || undefined,
      apelido: c.apelido.trim(),
      convenio: c.convenio.trim() || undefined,
      carteira: c.carteira.trim() || undefined,
      chave_pix: c.chave_pix.trim() || undefined,
      ambiente: c.ambiente,
    },
  });

export function enviarCertificado(org: string, titular: string, c: NovoCertificado) {
  const f = new FormData();
  f.set("acao", "certificado");
  f.set("org", org);
  f.set("titular_id", titular);
  f.set("tipo", c.tipo);
  f.set("apelido", c.apelido.trim());
  f.set("senha", c.senha);
  if (c.arquivo) f.set("arquivo", c.arquivo);
  return chamarFuncao<Resposta & { valido_ate: string }>(FUNCAO, { form: f });
}

export const cadastrarCredencial = (org: string, k: NovaCredencial) =>
  chamarFuncao<Resposta>(FUNCAO, {
    corpo: {
      acao: "credencial",
      org,
      conta_id: k.conta_id,
      produto: k.produto,
      client_id: k.client_id.trim(),
      client_secret: k.client_secret,
      certificado_id: k.certificado_id || undefined,
    },
  });
