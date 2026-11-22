// Ficha de abertura de empresa (112): tipos, listas de escolha e as regras puras que a tela mostra antes de gravar.
// O banco repete os bloqueios (app.soc_abertura_conferir): CNAE do Anexo VI no Simples, atividade obrigada ao Lucro
// Real no Presumido, porte "demais" no Simples, sócio PJ ou no exterior no Simples. Os avisos (Anexo VII, percentuais,
// administrador, documentos que faltam) são só da tela: o contador decide.
import { cpfValido, cnpjValido, soDigitos } from "@/lib/documento";
import { mascaraTelefone } from "@/dominios/pessoal/contatoEmpresa";

export type Regime = "simples" | "presumido" | "real";
export type Natureza = "ltda" | "slu" | "ss" | "ei";
export type Porte = "me" | "epp" | "demais";

export interface CnaeEscolhido {
  codigo: string; // 7 dígitos
  descricao: string;
}

export interface FichaAbertura {
  processo_id: string;
  org_id: string;
  regime: Regime | null;
  natureza: Natureza | null;
  porte: Porte | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnae_principal: string | null;
  cnae_principal_descricao: string | null;
  cnaes_secundarios: CnaeEscolhido[];
  objeto_social: string | null;
  capital_social: number | null;
  valor_quota: number | null;
  integralizacao: "no_ato" | "a_prazo" | null;
  integralizacao_prazo: string | null;
  integralizacao_forma: "moeda" | "bens" | "moeda_e_bens" | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  municipio_ibge: string | null;
  uf: string | null;
  uso_endereco: "estabelecimento" | "fiscal" | null;
  imovel_situacao: "proprio" | "alugado" | "cedido" | "comodato" | null;
  inscricao_imobiliaria: string | null;
  area_m2: number | null;
  email: string | null;
  telefone: string | null;
  contador_nome: string | null;
  contador_crc: string | null;
  observacoes: string | null;
  atualizado_em?: string;
}

export interface SocioAbertura {
  id: string;
  processo_id: string;
  ordem: number;
  tipo: "pf" | "pj";
  nome: string;
  documento: string | null;
  domiciliado_exterior: boolean;
  nacionalidade: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  regime_bens: string | null;
  profissao: string | null;
  rg: string | null;
  rg_orgao: string | null;
  email: string | null;
  celular: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  percentual: number;
  administrador: boolean;
  outras_empresas: string | null;
}

export type TipoDocAbertura =
  | "rg_cnh"
  | "cpf"
  | "comprovante_residencia"
  | "certidao_casamento"
  | "iptu"
  | "contrato_locacao"
  | "matricula_imovel"
  | "autorizacao_imovel"
  | "procuracao"
  | "outro";

export interface DocAbertura {
  arquivo_id: string;
  tipo: TipoDocAbertura;
  socio_id: string | null;
}

export interface RestricaoCnae {
  codigo: string;
  regime: "simples" | "presumido";
  nivel: "impeditivo" | "ambiguo";
  descricao: string;
  fundamento: string;
}

export const REGIMES: { id: Regime; nome: string; ajuda: string }[] = [
  { id: "simples", nome: "Simples Nacional", ajuda: "ME ou EPP, receita até R$ 4,8 milhões no ano (LC 123/2006)" },
  { id: "presumido", nome: "Lucro Presumido", ajuda: "Receita até R$ 78 milhões no ano (Lei 9.718/1998, art. 13)" },
  { id: "real", nome: "Lucro Real", ajuda: "Obrigatório acima de R$ 78 milhões e em atividades financeiras (art. 14)" },
];
export const NATUREZAS: { id: Natureza; nome: string }[] = [
  { id: "ltda", nome: "Sociedade limitada (LTDA) · 206-2" },
  { id: "slu", nome: "Sociedade limitada unipessoal (SLU) · 206-2" },
  { id: "ss", nome: "Sociedade simples limitada · 223-2" },
  { id: "ei", nome: "Empresário individual · 213-5" },
];
export const PORTES: { id: Porte; nome: string }[] = [
  { id: "me", nome: "Microempresa (ME) · até R$ 360 mil" },
  { id: "epp", nome: "Empresa de pequeno porte (EPP) · até R$ 4,8 milhões" },
  { id: "demais", nome: "Demais (sem enquadramento)" },
];
export const ESTADOS_CIVIS = [
  { id: "solteiro", nome: "Solteiro(a)" },
  { id: "casado", nome: "Casado(a)" },
  { id: "uniao_estavel", nome: "União estável" },
  { id: "divorciado", nome: "Divorciado(a)" },
  { id: "separado", nome: "Separado(a) judicialmente" },
  { id: "viuvo", nome: "Viúvo(a)" },
];
export const REGIMES_BENS = [
  { id: "comunhao_parcial", nome: "Comunhão parcial de bens" },
  { id: "comunhao_universal", nome: "Comunhão universal de bens" },
  { id: "separacao_total", nome: "Separação total (convencional)" },
  { id: "separacao_obrigatoria", nome: "Separação obrigatória" },
  { id: "participacao_final", nome: "Participação final nos aquestos" },
];
export const TIPOS_DOC: { id: TipoDocAbertura; nome: string; doSocio: boolean }[] = [
  { id: "rg_cnh", nome: "RG ou CNH", doSocio: true },
  { id: "cpf", nome: "CPF", doSocio: true },
  { id: "comprovante_residencia", nome: "Comprovante de residência", doSocio: true },
  { id: "certidao_casamento", nome: "Certidão de casamento", doSocio: true },
  { id: "iptu", nome: "IPTU (inscrição imobiliária)", doSocio: false },
  { id: "contrato_locacao", nome: "Contrato de locação", doSocio: false },
  { id: "matricula_imovel", nome: "Matrícula do imóvel", doSocio: false },
  { id: "autorizacao_imovel", nome: "Autorização do proprietário", doSocio: false },
  { id: "procuracao", nome: "Procuração", doSocio: false },
  { id: "outro", nome: "Outro", doSocio: false },
];

export const nomeDe = <T extends { id: string; nome: string }>(lista: T[], id: string | null | undefined) =>
  lista.find((x) => x.id === id)?.nome ?? "—";

/** "6201501" → "6201-5/01". */
export function formatarCnae(c: string | null | undefined): string {
  const d = soDigitos(c ?? "");
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}` : (c ?? "");
}

export const somaPercentuais = (socios: Pick<SocioAbertura, "percentual">[]) =>
  Math.round(socios.reduce((s, x) => s + Number(x.percentual || 0), 0) * 10000) / 10000;

/** Quantidade de quotas (capital ÷ valor da quota) e as de cada sócio; null quando não fecha em número inteiro. */
export function quotas(capital: number | null, valorQuota: number | null, percentual?: number): number | null {
  if (!capital || !valorQuota) return null;
  const total = capital / valorQuota;
  const q = percentual == null ? total : (total * percentual) / 100;
  return Math.abs(q - Math.round(q)) < 1e-6 ? Math.round(q) : null;
}

export interface Conferencia {
  /** O banco não grava esta combinação (o mesmo texto que a tela mostra). */
  bloqueios: string[];
  /** Precisa de atenção do contador, mas grava. */
  avisos: string[];
  /** Falta preencher para a ficha ficar completa. */
  faltas: string[];
}

/** Confere a ficha inteira: o que bloqueia, o que pede atenção e o que falta. Regra pura (testada). */
export function conferirAbertura(f: FichaAbertura | null, socios: SocioAbertura[], restricoes: RestricaoCnae[]): Conferencia {
  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const faltas: string[] = [];
  if (!f) return { bloqueios, avisos, faltas: ["Ficha ainda não preenchida"] };

  const cnaes = [f.cnae_principal, ...f.cnaes_secundarios.map((c) => c.codigo)].filter(Boolean) as string[];
  if (f.regime && f.regime !== "real") {
    for (const r of restricoes.filter((x) => x.regime === f.regime && cnaes.includes(x.codigo))) {
      const nome = `${formatarCnae(r.codigo)} (${r.descricao})`;
      if (r.nivel === "impeditivo")
        bloqueios.push(`CNAE ${nome} não é permitido no ${f.regime === "simples" ? "Simples Nacional" : "Lucro Presumido"}: ${r.fundamento}.`);
      else avisos.push(`CNAE ${nome} tem atividade permitida e impeditiva no Simples (${r.fundamento}): confirme o que a empresa fará.`);
    }
  }
  if (f.regime === "simples") {
    if (f.porte === "demais") bloqueios.push("No Simples Nacional a empresa precisa ser ME ou EPP (LC 123/2006, art. 3º).");
    for (const s of socios) {
      if (s.tipo === "pj") bloqueios.push(`Sócio pessoa jurídica (${s.nome}) impede o Simples Nacional (LC 123/2006, art. 3º, § 4º, I).`);
      if (s.domiciliado_exterior) bloqueios.push(`Sócio domiciliado no exterior (${s.nome}) impede o Simples Nacional (LC 123/2006, art. 17, II).`);
      if (s.outras_empresas)
        avisos.push(
          `${s.nome} participa de outra empresa: a receita somada não pode passar de R$ 4,8 milhões se tiver mais de 10% dela (LC 123/2006, art. 3º, § 4º, III e IV).`,
        );
    }
  }
  if (f.regime === "presumido") avisos.push("Lucro Presumido: confirme que a receita prevista fica até R$ 78 milhões no ano (Lei 9.718/1998, art. 13).");

  // quadro societário
  const soma = somaPercentuais(socios);
  if (socios.length && soma !== 100) faltas.push(`Os percentuais dos sócios somam ${String(soma).replace(".", ",")}% (precisa dar 100%).`);
  if (socios.length && !socios.some((s) => s.administrador)) faltas.push("Marque quem será o sócio administrador.");
  if ((f.natureza === "ei" || f.natureza === "slu") && socios.length > 1)
    bloqueios.push(`${f.natureza === "ei" ? "Empresário individual" : "Sociedade unipessoal"} tem um titular só: deixe um sócio.`);
  if ((f.natureza === "ltda" || f.natureza === "ss") && socios.length === 1)
    avisos.push("Com um sócio só, a natureza costuma ser a sociedade limitada unipessoal (SLU).");
  for (const s of socios) {
    const doc = soDigitos(s.documento ?? "");
    if (!doc) faltas.push(`${s.nome}: falta o ${s.tipo === "pj" ? "CNPJ" : "CPF"}.`);
    else if (s.tipo === "pf" ? !cpfValido(doc) : !cnpjValido(doc)) bloqueios.push(`${s.nome}: ${s.tipo === "pj" ? "CNPJ" : "CPF"} inválido.`);
    if (s.tipo === "pf" && !s.estado_civil) faltas.push(`${s.nome}: falta o estado civil.`);
    if (s.tipo === "pf" && (s.estado_civil === "casado" || s.estado_civil === "uniao_estavel") && !s.regime_bens)
      faltas.push(`${s.nome}: falta o regime de bens.`);
    if (!s.cep || !s.logradouro) faltas.push(`${s.nome}: falta o endereço.`);
  }
  const q = quotas(f.capital_social, f.valor_quota);
  if (f.capital_social && f.valor_quota && q == null) avisos.push("O capital dividido pelo valor da quota não dá um número inteiro de quotas.");
  if (q != null) for (const s of socios) if (quotas(f.capital_social, f.valor_quota, s.percentual) == null)
    avisos.push(`${s.nome}: ${String(s.percentual).replace(".", ",")}% do capital não fecha em quotas inteiras.`);

  const obrig: [unknown, string][] = [
    [f.regime, "regime tributário"],
    [f.natureza, "natureza jurídica"],
    [f.porte, "porte"],
    [f.razao_social, "razão social"],
    [f.cnae_principal, "CNAE principal"],
    [f.objeto_social, "objeto social"],
    [f.capital_social, "capital social"],
    [f.integralizacao, "forma de integralização"],
    [f.cep && f.logradouro && f.numero && f.municipio && f.uf, "endereço completo"],
    [f.imovel_situacao, "situação do imóvel"],
    [f.inscricao_imobiliaria, "inscrição imobiliária (IPTU)"],
  ];
  const vazios = obrig.filter(([v]) => !v).map(([, n]) => n);
  if (vazios.length) faltas.unshift(`Falta preencher: ${vazios.join(", ")}.`);
  if (!socios.length) faltas.push("Inclua os sócios no quadro societário.");
  return { bloqueios, avisos, faltas };
}

export interface DocEsperado {
  tipo: TipoDocAbertura;
  socio_id: string | null;
  rotulo: string;
  ok: boolean;
}

/** Documentos que a abertura precisa, pelo que a ficha diz, e se já foram anexados com o tipo certo. */
export function documentosEsperados(f: FichaAbertura | null, socios: SocioAbertura[], docs: DocAbertura[]): DocEsperado[] {
  const tem = (tipo: TipoDocAbertura, socio: string | null) => docs.some((d) => d.tipo === tipo && (socio == null || d.socio_id === socio));
  const lista: DocEsperado[] = [];
  for (const s of socios.filter((x) => x.tipo === "pf")) {
    lista.push({ tipo: "rg_cnh", socio_id: s.id, rotulo: `RG ou CNH · ${s.nome}`, ok: tem("rg_cnh", s.id) });
    lista.push({ tipo: "comprovante_residencia", socio_id: s.id, rotulo: `Comprovante de residência · ${s.nome}`, ok: tem("comprovante_residencia", s.id) });
    if (s.estado_civil === "casado")
      lista.push({ tipo: "certidao_casamento", socio_id: s.id, rotulo: `Certidão de casamento · ${s.nome}`, ok: tem("certidao_casamento", s.id) });
  }
  if (f) {
    lista.push({ tipo: "iptu", socio_id: null, rotulo: "IPTU do imóvel (inscrição imobiliária)", ok: tem("iptu", null) });
    if (f.imovel_situacao === "alugado")
      lista.push({ tipo: "contrato_locacao", socio_id: null, rotulo: "Contrato de locação", ok: tem("contrato_locacao", null) });
    if (f.imovel_situacao === "proprio")
      lista.push({ tipo: "matricula_imovel", socio_id: null, rotulo: "Matrícula do imóvel", ok: tem("matricula_imovel", null) });
    if (f.imovel_situacao === "cedido" || f.imovel_situacao === "comodato")
      lista.push({ tipo: "autorizacao_imovel", socio_id: null, rotulo: "Autorização do proprietário (comodato)", ok: tem("autorizacao_imovel", null) });
  }
  return lista;
}

/** Valor digitado ("10.000,50", "25") → número; vazio = null; texto que não é número = NaN (a tela avisa). */
export function numeroDigitado(t: string): number | null {
  const s = t.replace(/[R$\s%]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : NaN;
}
/** Número → texto do campo (vírgula decimal, sem milhar). */
export const numeroParaCampo = (n: number | null | undefined) => (n == null ? "" : String(Number(n)).replace(".", ","));

/** Linhas "campo → valor" da ficha (tela e PDF). */
export function resumoFicha(f: FichaAbertura): [string, string][] {
  const v = (x: string | null | undefined) => (x && String(x).trim()) || "—";
  const reais = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const endereco = [f.logradouro, f.numero, f.complemento, f.bairro].filter(Boolean).join(", ");
  const imovel = { proprio: "Próprio", alugado: "Alugado", cedido: "Cedido", comodato: "Comodato" } as const;
  return [
    ["Regime", nomeDe(REGIMES, f.regime)],
    ["Natureza jurídica", nomeDe(NATUREZAS, f.natureza)],
    ["Porte", nomeDe(PORTES, f.porte)],
    ["Razão social", v(f.razao_social)],
    ["Nome fantasia", v(f.nome_fantasia)],
    ["CNAE principal", f.cnae_principal ? `${formatarCnae(f.cnae_principal)} ${f.cnae_principal_descricao ?? ""}`.trim() : "—"],
    ["CNAE secundários", f.cnaes_secundarios.length ? f.cnaes_secundarios.map((c) => `${formatarCnae(c.codigo)} ${c.descricao}`).join("; ") : "—"],
    ["Objeto social", v(f.objeto_social)],
    ["Capital social", reais(f.capital_social) + (quotas(f.capital_social, f.valor_quota) != null ? ` em ${quotas(f.capital_social, f.valor_quota)!.toLocaleString("pt-BR")} quotas de ${reais(f.valor_quota)}` : "")],
    ["Integralização", f.integralizacao === "a_prazo" ? `A prazo, até ${f.integralizacao_prazo?.split("-").reverse().join("/") ?? "—"}` : f.integralizacao === "no_ato" ? `No ato (${{ moeda: "dinheiro", bens: "bens", moeda_e_bens: "dinheiro e bens" }[f.integralizacao_forma ?? "moeda"]})` : "—"],
    ["Endereço", endereco ? `${endereco} · ${v(f.municipio)}/${v(f.uf)} · CEP ${f.cep ? `${f.cep.slice(0, 5)}-${f.cep.slice(5)}` : "—"}${f.municipio_ibge ? ` · IBGE ${f.municipio_ibge}` : ""}` : "—"],
    ["Imóvel", `${f.imovel_situacao ? imovel[f.imovel_situacao] : "—"} · IPTU ${v(f.inscricao_imobiliaria)}${f.area_m2 ? ` · ${String(f.area_m2).replace(".", ",")} m²` : ""}${f.uso_endereco === "fiscal" ? " · só endereço fiscal" : ""}`],
    ["Contato", [f.email, f.telefone && mascaraTelefone(f.telefone)].filter(Boolean).join(" · ") || "—"],
    ["Contador", [f.contador_nome, f.contador_crc && `CRC ${f.contador_crc}`].filter(Boolean).join(" · ") || "—"],
  ];
}
