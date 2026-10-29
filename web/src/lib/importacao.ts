// Leitura e normalização de planilhas de clientes (relatório de empresas do Domínio, Excel ou CSV).

export type Campo =
  | "codigo_dominio" | "razao_social" | "nome_fantasia" | "cnpj"
  | "regime" | "cidade" | "uf" | "situacao" | "inativo_em" | "motivo_inativacao" | "cliente_desde" | "inicio_em";

export const CAMPOS: { id: Campo; nome: string; obrigatorio?: boolean; dica: string }[] = [
  { id: "codigo_dominio", nome: "Código no Domínio", dica: "Número da empresa no Domínio. Garante que a próxima importação atualize em vez de duplicar." },
  { id: "razao_social", nome: "Razão social", obrigatorio: true, dica: "Nome da empresa." },
  { id: "nome_fantasia", nome: "Nome curto / apelido", dica: "Aparece na TV e na lista de tarefas." },
  { id: "cnpj", nome: "CNPJ / CPF", dica: "Com ou sem pontuação." },
  { id: "regime", nome: "Regime de tributação", dica: "Simples, Presumido, Real, MEI, Imune/Isenta, Pessoa física." },
  { id: "cidade", nome: "Cidade", dica: "" },
  { id: "uf", nome: "UF", dica: "" },
  { id: "situacao", nome: "Situação", dica: "Ativa / Inativa / Baixada." },
  { id: "inativo_em", nome: "Inativo desde", dica: "Data em que o cliente saiu do escritório (Data da situação no Domínio)." },
  { id: "motivo_inativacao", nome: "Motivo da inativação", dica: "Transferida, Baixada, etc." },
  { id: "cliente_desde", nome: "Cliente desde", dica: "Data em que passou a ser cliente; não gera tarefas antes dela." },
  { id: "inicio_em", nome: "Início das atividades", dica: "" },
];

// Nomes de coluna aceitos para cada campo (comparados sem acento, minúsculos, sem pontuação).
const SINONIMOS: Record<Campo, string[]> = {
  codigo_dominio: ["codigo dominio", "codigo", "cod", "cod empresa", "codigo empresa", "codigo da empresa", "codi emp", "n empresa", "numero empresa", "empresa n", "nro", "id empresa"],
  razao_social: ["razao social", "razao", "nome empresarial", "nome da empresa", "nome empresa", "nome emp", "empresa", "nome", "cliente"],
  nome_fantasia: ["apelido", "apel emp", "nome curto", "nome reduzido", "abreviado", "nome fantasia", "fantasia"],
  cnpj: ["cnpj cpf", "cpf cnpj", "cnpj", "cpf", "cgc", "cgce emp", "inscricao federal", "inscricao", "documento", "cnpj cei cpf", "cnpj cpf cei"],
  regime: ["regime de tributacao", "regime tributario", "regime federal", "regime", "tributacao", "forma de tributacao", "tipo de tributacao", "enquadramento", "regime de apuracao"],
  cidade: ["cidade", "municipio", "nome municipio"],
  uf: ["uf", "estado", "sigla uf"],
  situacao: ["situacao", "status", "ativa", "ativo", "situacao empresa", "stat emp"],
  inativo_em: ["data da situacao", "inativo desde", "data inativacao", "data de inativacao", "data de saida", "data saida", "saiu em"],
  motivo_inativacao: ["motivo", "motivo da inativacao", "motivo inativacao", "motivo da situacao"],
  cliente_desde: ["cliente desde", "data cadastro", "data de cadastro", "inicio contrato", "data inicio contrato"],
  inicio_em: ["inicio atividades", "inicio das atividades", "data inicio", "data de inicio", "dt inicio"],
};

export function normalizar(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Relatório "Completo" do Domínio vem em fichas (rótulo: valor), uma empresa por bloco.
 * Converte para tabela (cabeçalho + uma linha por empresa). Devolve null se não for esse formato.
 */
export function fichasParaTabela(linhas: string[][]): string[][] | null {
  const ehRotulo = (s: string) => /^[^\d].{0,40}:$/.test(s.trim());
  const blocos = linhas.filter((l) => l.some((c) => normalizar(c) === "codigo" && String(c).trim().endsWith(":"))).length;
  if (blocos < 2) return null;
  const regs: Record<string, string>[] = [];
  const ordem: string[] = [];
  let cur: Record<string, string> | null = null;
  for (const l of linhas) {
    for (let i = 0; i < l.length; i++) {
      const cel = String(l[i] ?? "").trim();
      if (!cel || !ehRotulo(cel)) continue;
      let chave = cel.slice(0, -1).trim();
      let valor = "";
      for (let j = i + 1; j < l.length; j++) {
        const v = String(l[j] ?? "").trim();
        if (!v) continue;
        if (ehRotulo(v)) break;
        valor = v; break;
      }
      if (normalizar(chave) === "codigo") { cur = {}; regs.push(cur); }
      if (!cur) continue;
      if (normalizar(chave) === "data" && cur["Duração do contrato"] !== undefined && cur["Data do contrato"] === undefined) chave = "Data do contrato";
      if (cur[chave] !== undefined) continue;
      cur[chave] = valor;
      if (!ordem.includes(chave)) ordem.push(chave);
    }
  }
  const cab = ordem.filter((k) => !/^(empresa|c n p j|pagina|emissao|hora|data)$/.test(normalizar(k)));
  return [cab, ...regs.map((r) => cab.map((k) => r[k] ?? ""))];
}

/** Acha a linha de cabeçalho (relatórios costumam ter título antes) e sugere o mapeamento. */
export function detectarCabecalho(linhas: string[][]): { linha: number; mapa: Partial<Record<Campo, number>> } {
  let melhor = { linha: 0, mapa: {} as Partial<Record<Campo, number>>, pontos: -1 };
  const limite = Math.min(linhas.length, 25);
  for (let i = 0; i < limite; i++) {
    const mapa = mapear(linhas[i] ?? []);
    const pontos = Object.keys(mapa).length + (mapa.razao_social !== undefined ? 2 : 0);
    if (pontos > melhor.pontos) melhor = { linha: i, mapa, pontos };
  }
  return { linha: melhor.linha, mapa: melhor.mapa };
}

function mapear(cab: string[]): Partial<Record<Campo, number>> {
  const norm = cab.map(normalizar);
  const mapa: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();
  // 1º igualdade exata, 2º "contém" — sempre na ordem de prioridade dos sinônimos
  for (const modo of ["exato", "contem"] as const) {
    for (const campo of Object.keys(SINONIMOS) as Campo[]) {
      if (mapa[campo] !== undefined) continue;
      for (const s of SINONIMOS[campo]) {
        const idx = norm.findIndex((h, j) => !usadas.has(j) && h && (modo === "exato" ? h === s : h.includes(s) && s.length >= 4));
        if (idx >= 0) { mapa[campo] = idx; usadas.add(idx); break; }
      }
    }
  }
  return mapa;
}

export function mapearRegime(t: unknown, doc?: string | null): string | null {
  const s = normalizar(t);
  if (!s) return doc && doc.length === 11 ? "pf" : null;
  if (/\b(mei|simei|microempreendedor)\b/.test(s)) return "mei";
  if (s.includes("simples")) return "simples";
  if (s.includes("presumid")) return "presumido";
  if (/\breal\b/.test(s)) return "real";
  if (/imun|isent/.test(s)) return "imune_isenta";
  if (/pessoa fisica|\bpf\b|produtor rural|caepf|\bcei\b|domestic|carne leao/.test(s)) return "pf";
  if (s.includes("arbitrad")) return "outro";
  return "outro";
}

export function mapearSituacao(t: unknown): boolean | null {
  const s = normalizar(t);
  if (!s) return null;
  if (/^(a|s|sim|ativa|ativo|normal|em atividade|1)$/.test(s) || s.startsWith("ativ")) return true;
  if (/inativ|baixad|encerrad|suspens|paralisad|extint|^i$|^n$|nao|^0$/.test(s)) return false;
  return null;
}

export function soDigitos(t: unknown): string {
  return String(t ?? "").replace(/\D/g, "");
}

function cnpjValido(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Valida e formata CNPJ/CPF. Planilhas do Excel às vezes perdem zeros à esquerda: completa quando o resultado fica válido. */
export function tratarDocumento(t: unknown): { doc: string | null; valido: boolean; aviso?: string } {
  let d = soDigitos(t);
  if (!d) return { doc: null, valido: true };
  if (d.length < 11) d = d.padStart(11, "0");
  if (d.length === 12 || d.length === 13) d = d.padStart(14, "0");
  if (d.length === 11 && !cpfValido(d) && cnpjValido(d.padStart(14, "0"))) d = d.padStart(14, "0");
  if (d.length === 14) {
    const f = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    return cnpjValido(d) ? { doc: f, valido: true } : { doc: f, valido: false, aviso: "CNPJ com dígito inválido" };
  }
  if (d.length === 11) {
    const f = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    return cpfValido(d) ? { doc: f, valido: true } : { doc: f, valido: false, aviso: "CPF com dígito inválido" };
  }
  return { doc: String(t).trim(), valido: false, aviso: "Documento com tamanho inválido" };
}

export function tratarData(t: unknown): string | null {
  const s = String(t ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(s)) {
    // número de série do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export interface LinhaImport {
  n: number; // número da linha na planilha
  codigo_dominio: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  regime: string | null;
  regime_original: string;
  cidade: string | null;
  uf: string | null;
  ativo: boolean | null;
  inativo_em: string | null;
  motivo_inativacao: string | null;
  cliente_desde: string | null;
  inicio_em: string | null;
  avisos: string[];
  erro?: string;
}

export function montarLinhas(linhas: string[][], cabecalho: number, mapa: Partial<Record<Campo, number>>): LinhaImport[] {
  const pega = (l: string[], c: Campo) => (mapa[c] === undefined ? "" : String(l[mapa[c]!] ?? "").trim());
  const out: LinhaImport[] = [];
  for (let i = cabecalho + 1; i < linhas.length; i++) {
    const l = linhas[i] ?? [];
    if (!l.some((x) => String(x ?? "").trim())) continue;
    const razao = pega(l, "razao_social").replace(/\s+/g, " ");
    const codigoBruto = pega(l, "codigo_dominio");
    // linhas de total/rodapé de relatório
    // linhas de título/rodapé do relatório ("Empresa:", "Sistema licenciado…")
    if (!razao && !/^\d/.test(codigoBruto)) continue;
    if (/^(total|pagina|p[aá]gina|emitido|usu[aá]rio)/i.test(razao)) continue;
    // cabeçalho repetido a cada página do relatório do Domínio
    const cabRazao = mapa.razao_social === undefined ? "" : normalizar(linhas[cabecalho]?.[mapa.razao_social]);
    if (cabRazao && normalizar(razao) === cabRazao) continue;
    // empresas-modelo do próprio Domínio (códigos 9990–9999: padrão, escritório contábil, 3º setor, partido)
    if (/^99(9\d)$/.test(codigoBruto.replace(/\.0+$/, "")) || /^empresa padr|^empresa 3\.? setor|^empresa partido/i.test(razao)) continue;
    const doc = tratarDocumento(pega(l, "cnpj"));
    const regimeOrig = pega(l, "regime");
    const ufBruta = pega(l, "uf").toUpperCase();
    const avisos: string[] = [];
    if (doc.aviso) avisos.push(doc.aviso);
    if (regimeOrig && mapearRegime(regimeOrig) === "outro") avisos.push(`Regime "${regimeOrig}" entra como Outro`);
    const ativo = mapa.situacao === undefined ? null : mapearSituacao(pega(l, "situacao"));
    const inativoEm = ativo === false ? tratarData(pega(l, "inativo_em")) : null;
    if (ativo === false && !inativoEm) avisos.push("Inativa sem data: será usada a data de hoje");
    out.push({
      n: i + 1,
      codigo_dominio: codigoBruto ? codigoBruto.replace(/\.0+$/, "") : null,
      razao_social: razao,
      nome_fantasia: pega(l, "nome_fantasia") || null,
      cnpj: doc.doc,
      regime: mapearRegime(regimeOrig, doc.doc ? soDigitos(doc.doc) : null),
      regime_original: regimeOrig,
      cidade: pega(l, "cidade") || null,
      uf: /^[A-Z]{2}$/.test(ufBruta) ? ufBruta : null,
      ativo,
      inativo_em: inativoEm,
      motivo_inativacao: ativo === false ? pega(l, "motivo_inativacao") || null : null,
      cliente_desde: tratarData(pega(l, "cliente_desde")),
      inicio_em: tratarData(pega(l, "inicio_em")),
      avisos,
      erro: razao ? undefined : "Sem razão social",
    });
  }
  return out;
}

export const MODELO_CSV =
  "﻿Código Domínio;Razão social;Nome curto;CNPJ/CPF;Regime;Cidade;UF;Situação;Inativo desde;Motivo;Cliente desde\r\n" +
  "101;EMPRESA EXEMPLO COMERCIO LTDA;Exemplo Comércio;11.222.333/0001-81;Simples Nacional;Bragança Paulista;SP;Ativa;;;01/02/2020\r\n" +
  "102;EXEMPLO SERVICOS TECNICOS LTDA;Exemplo Serviços;;Lucro Presumido;Atibaia;SP;Inativa;30/09/2026;Saiu do escritório;15/06/2022\r\n";
