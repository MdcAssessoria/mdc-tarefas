// Consultas públicas da ficha de abertura, feitas pelo navegador e sem chave: lista oficial de CNAE (CNAE-Subclasses
// do IBGE/CONCLA, a mesma usada pela Receita), CEP (ViaCEP, que traz o código IBGE do município; BrasilAPI como
// reserva) e municípios por UF (IBGE). Só se envia o CEP ou a UF. Os conversores são puros e testados.
import { soDigitos } from "@/lib/documento";
import { ErroApp } from "@/lib/erros";

export interface CnaeLista {
  codigo: string; // 7 dígitos
  descricao: string;
  /** Atividades da subclasse (ajudam a achar por palavra: "padaria", "software"…). */
  atividades: string[];
}

export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  ibge: string | null;
}

const IBGE = "https://servicodados.ibge.gov.br/api";
const tirarAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function buscarJson(url: string, ms = 12000): Promise<unknown> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: c.signal });
    if (!r.ok) throw new ErroApp(`A consulta respondeu ${r.status}. Tente de novo em instantes.`);
    return await r.json();
  } catch (e) {
    if (e instanceof ErroApp) throw e;
    throw new ErroApp("Não foi possível consultar agora (sem internet ou serviço fora do ar). Tente de novo.");
  } finally {
    clearTimeout(t);
  }
}

/** Converte a resposta de /v2/cnae/subclasses do IBGE. */
export function lerListaCnae(bruto: unknown): CnaeLista[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((x: Record<string, unknown>) => ({
      codigo: soDigitos(x.id),
      descricao: String(x.descricao ?? "").trim(),
      atividades: Array.isArray(x.atividades) ? x.atividades.map((a) => String(a)) : [],
    }))
    .filter((x) => x.codigo.length === 7 && x.descricao);
}

let listaCnae: Promise<CnaeLista[]> | null = null;
/** Lista completa (≈1.300 subclasses), baixada uma vez por sessão. */
export function carregarCnaes(): Promise<CnaeLista[]> {
  listaCnae ??= buscarJson(`${IBGE}/v2/cnae/subclasses`, 25000)
    .then(lerListaCnae)
    .catch((e) => {
      listaCnae = null;
      throw e;
    });
  return listaCnae;
}

/** Procura por código (com ou sem pontuação) ou por palavras da descrição e das atividades. Pura. */
export function filtrarCnaes(lista: CnaeLista[], busca: string, max = 30): CnaeLista[] {
  const dig = soDigitos(busca);
  const termos = tirarAcento(busca.replace(/[\d./-]+/g, " ")).split(/\s+/).filter((t) => t.length >= 2);
  if (!dig && !termos.length) return [];
  const pontos = (c: CnaeLista) => {
    if (dig && !c.codigo.startsWith(dig)) return 0;
    if (!termos.length) return 1;
    const desc = tirarAcento(c.descricao);
    const ativ = tirarAcento(c.atividades.join(" "));
    let p = 0;
    for (const t of termos) {
      if (desc.includes(t)) p += 3;
      else if (ativ.includes(t)) p += 1;
      else return 0;
    }
    return p;
  };
  return lista
    .map((c) => ({ c, p: pontos(c) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.c.codigo.localeCompare(b.c.codigo))
    .slice(0, max)
    .map((x) => x.c);
}

/** Converte a resposta do ViaCEP (com IBGE) ou da BrasilAPI (sem IBGE). */
export function lerCep(bruto: Record<string, unknown>): EnderecoCep | null {
  if (!bruto || bruto.erro) return null;
  const cep = soDigitos(bruto.cep);
  const municipio = String(bruto.localidade ?? bruto.city ?? "").trim();
  const uf = String(bruto.uf ?? bruto.state ?? "").trim().toUpperCase();
  if (cep.length !== 8 || !municipio || uf.length !== 2) return null;
  const ibge = soDigitos(bruto.ibge);
  return {
    cep,
    logradouro: String(bruto.logradouro ?? bruto.street ?? "").trim(),
    bairro: String(bruto.bairro ?? bruto.neighborhood ?? "").trim(),
    municipio,
    uf,
    ibge: ibge.length === 7 ? ibge : null,
  };
}

export interface Municipio {
  ibge: string;
  nome: string;
}

/** Converte /v1/localidades/estados/{UF}/municipios do IBGE. */
export function lerMunicipios(bruto: unknown): Municipio[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((m: Record<string, unknown>) => ({ ibge: soDigitos(m.id), nome: String(m.nome ?? "").trim() }))
    .filter((m) => m.ibge.length === 7 && m.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const municipiosPorUf = new Map<string, Promise<Municipio[]>>();
export function carregarMunicipios(uf: string): Promise<Municipio[]> {
  const u = uf.toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) return Promise.resolve([]);
  let p = municipiosPorUf.get(u);
  if (!p) {
    p = buscarJson(`${IBGE}/v1/localidades/estados/${u}/municipios`).then(lerMunicipios);
    p.catch(() => municipiosPorUf.delete(u));
    municipiosPorUf.set(u, p);
  }
  return p;
}

/** Acha o código IBGE pelo nome do município (sem acento e sem diferença de maiúsculas). */
export function ibgeDoMunicipio(lista: Municipio[], nome: string): string | null {
  const n = tirarAcento(nome.trim());
  return lista.find((m) => tirarAcento(m.nome) === n)?.ibge ?? null;
}

/** CEP → endereço. ViaCEP primeiro (traz o IBGE); se falhar, BrasilAPI e o IBGE pelo nome do município. */
export async function buscarCep(cepDigitado: string): Promise<EnderecoCep> {
  const cep = soDigitos(cepDigitado);
  if (cep.length !== 8) throw new ErroApp("O CEP tem 8 números.");
  let e: EnderecoCep | null = null;
  try {
    e = lerCep((await buscarJson(`https://viacep.com.br/ws/${cep}/json/`)) as Record<string, unknown>);
  } catch {
    e = null;
  }
  if (!e) {
    try {
      e = lerCep((await buscarJson(`https://brasilapi.com.br/api/cep/v1/${cep}`)) as Record<string, unknown>);
    } catch {
      e = null;
    }
  }
  if (!e) throw new ErroApp("CEP não encontrado. Confira o número ou preencha o endereço à mão.");
  if (!e.ibge) e.ibge = ibgeDoMunicipio(await carregarMunicipios(e.uf).catch(() => []), e.municipio);
  return e;
}

export const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
