// Consulta pública de CNPJ (dados da Receita Federal pela BrasilAPI, gratuita e sem chave), feita pelo navegador.
// Usada para preencher razão social, UF, endereço e sócios no Societário e no cadastro de clientes.
// Só leitura de dado público; nada é enviado além do número do CNPJ.
import { cnpjValido, formatarDocumento, soDigitos } from "./documento";

export interface SocioCnpj {
  nome: string;
  qualificacao: string | null;
  entrada: string | null;
}

export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  abertura: string | null;
  naturezaJuridica: string | null;
  porte: string | null;
  cnae: string | null;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  capitalSocial: number | null;
  simples: boolean | null;
  mei: boolean | null;
  socios: SocioCnpj[];
}

type Bruto = Record<string, unknown>;
const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** Converte a resposta da BrasilAPI no formato do HUB (função pura, testada). */
export function lerRespostaCnpj(r: Bruto): DadosCnpj {
  const cep = soDigitos(r.cep);
  const logradouro = [txt(r.descricao_tipo_logradouro), txt(r.logradouro)].filter(Boolean).join(" ");
  const endereco = [logradouro, txt(r.numero), txt(r.complemento), txt(r.bairro)].filter(Boolean).join(", ");
  const tel = soDigitos(r.ddd_telefone_1);
  const cnae = r.cnae_fiscal ? `${r.cnae_fiscal}${txt(r.cnae_fiscal_descricao) ? ` · ${txt(r.cnae_fiscal_descricao)}` : ""}` : null;
  const capital = Number(r.capital_social);
  const qsa = Array.isArray(r.qsa) ? (r.qsa as Bruto[]) : [];
  return {
    cnpj: formatarDocumento(String(r.cnpj ?? "")),
    razaoSocial: txt(r.razao_social) ?? "",
    nomeFantasia: txt(r.nome_fantasia),
    situacao: txt(r.descricao_situacao_cadastral),
    abertura: txt(r.data_inicio_atividade),
    naturezaJuridica: txt(r.natureza_juridica),
    porte: txt(r.porte) ?? txt(r.descricao_porte),
    cnae,
    endereco: endereco || null,
    municipio: txt(r.municipio),
    uf: txt(r.uf)?.toUpperCase() ?? null,
    cep: cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : null,
    telefone: tel.length >= 10 ? `(${tel.slice(0, 2)}) ${tel.slice(2, -4)}-${tel.slice(-4)}` : null,
    email: txt(r.email)?.toLowerCase() ?? null,
    capitalSocial: Number.isFinite(capital) && capital > 0 ? capital : null,
    simples: typeof r.opcao_pelo_simples === "boolean" ? r.opcao_pelo_simples : null,
    mei: typeof r.opcao_pelo_mei === "boolean" ? r.opcao_pelo_mei : null,
    socios: qsa
      .map((s) => ({ nome: txt(s.nome_socio) ?? "", qualificacao: txt(s.qualificacao_socio), entrada: txt(s.data_entrada_sociedade) }))
      .filter((s) => s.nome),
  };
}

/** Texto curto para guardar nas observações (endereço, CNAE, capital e sócios). */
export function resumoCnpj(d: DadosCnpj, hojeBr: string): string {
  const linhas = [
    `Dados da Receita (consulta em ${hojeBr}):`,
    d.situacao && `Situação: ${d.situacao}`,
    d.endereco && `Endereço: ${d.endereco}${d.municipio ? ` – ${d.municipio}/${d.uf ?? ""}` : ""}${d.cep ? ` – CEP ${d.cep}` : ""}`,
    d.cnae && `CNAE principal: ${d.cnae}`,
    d.capitalSocial !== null && `Capital social: ${d.capitalSocial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    d.socios.length > 0 && `Sócios: ${d.socios.map((s) => (s.qualificacao ? `${s.nome} (${s.qualificacao})` : s.nome)).join("; ")}`,
  ];
  return linhas.filter(Boolean).join("\n");
}

/** Busca o CNPJ na BrasilAPI. Erros saem em português, prontos para a tela. */
export async function consultarCnpj(doc: string): Promise<DadosCnpj> {
  const d = soDigitos(doc);
  if (!cnpjValido(d)) throw new Error("CNPJ inválido: confira os 14 números.");
  let r: Response;
  try {
    r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Não foi possível consultar a Receita agora (sem conexão com o serviço). Preencha à mão ou tente de novo.");
  }
  if (r.status === 404) throw new Error("CNPJ não encontrado na Receita. Confira o número.");
  if (r.status === 429) throw new Error("Muitas consultas seguidas. Espere um minuto e tente de novo.");
  if (!r.ok) throw new Error("O serviço de consulta de CNPJ não respondeu agora. Preencha à mão ou tente de novo em instantes.");
  return lerRespostaCnpj((await r.json()) as Bruto);
}
