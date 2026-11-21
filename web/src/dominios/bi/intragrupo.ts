// BI de Gestão: operações entre as empresas do grupo (bi_intragrupo, migração 109). Cada saída de uma empresa para outra
// do grupo deveria ter a entrada correspondente na outra (mesmo valor, sinal contrário, até 7 dias). Junta as duas pontas
// (primeiro com a contraparte certa, depois com qualquer empresa do grupo, quando o Omie registrou a outra parte errada) e
// devolve o que ficou sem par, com um possível par lançado sem a empresa. O que fica sem par explica a diferença entre o
// fluxo do grupo e a variação dos bancos. Testado em intragrupo.test.ts.

export interface MovIntragrupo {
  tipo: "intra" | "sem_doc";
  empresa_id: string;
  empresa: string;
  ref: string;
  data: string;
  valor: number;
  origem: string | null;
  categoria: string | null;
  documento: string | null;
  pessoa: string | null;
  contraparte_id: string | null;
  contraparte: string | null;
}

export interface SemPar {
  mov: MovIntragrupo;
  /** Movimento da outra empresa, sem CNPJ/CPF informado, que parece ser a outra ponta. */
  candidato: MovIntragrupo | null;
}

export interface ResumoIntragrupo {
  pares: number;
  /** Soma das saídas que encontraram a entrada correspondente (valor positivo). */
  valorPareado: number;
  /** Pares em que a outra ponta registrou outra empresa do grupo como contraparte. */
  contraparteTrocada: number;
  semPar: SemPar[];
  /** Soma (com sinal) do que ficou sem par: é o que fica fora do fluxo do grupo sem ter ido a lugar nenhum. */
  diferenca: number;
}

export const DIAS_PAR = 7;

const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const centavos = (v: number) => Math.round(v * 100);

export function parearIntragrupo(lista: MovIntragrupo[]): ResumoIntragrupo {
  const intra = lista.filter((m) => m.tipo === "intra").sort((a, b) => a.data.localeCompare(b.data) || a.ref.localeCompare(b.ref));
  const semDoc = lista.filter((m) => m.tipo === "sem_doc");
  const usado = new Set<string>();
  let pares = 0;
  let valorPareado = 0;
  let trocada = 0;

  // a outra ponta: na empresa da contraparte, valor oposto, até DIAS_PAR; prefere a contraparte certa e a data mais perto
  const achar = (m: MovIntragrupo, exigirContraparte: boolean) => {
    let melhor: MovIntragrupo | null = null;
    for (const o of intra) {
      if (usado.has(o.ref) || o.ref === m.ref) continue;
      if (o.empresa_id !== m.contraparte_id || centavos(o.valor) !== -centavos(m.valor)) continue;
      if (exigirContraparte && o.contraparte_id !== m.empresa_id) continue;
      const d = dias(o.data, m.data);
      if (d > DIAS_PAR) continue;
      if (!melhor || d < dias(melhor.data, m.data)) melhor = o;
    }
    return melhor;
  };

  for (const passo of [true, false]) {
    for (const m of intra) {
      if (usado.has(m.ref)) continue;
      const o = achar(m, passo);
      if (!o) continue;
      usado.add(m.ref);
      usado.add(o.ref);
      pares += 1;
      valorPareado += Math.abs(m.valor);
      if (!passo) trocada += 1;
    }
  }

  const usadoCand = new Set<string>();
  const semPar: SemPar[] = intra
    .filter((m) => !usado.has(m.ref))
    .map((m) => {
      const candidato =
        semDoc
          .filter(
            (s) =>
              !usadoCand.has(s.ref) &&
              s.empresa_id === m.contraparte_id &&
              centavos(s.valor) === -centavos(m.valor) &&
              dias(s.data, m.data) <= DIAS_PAR,
          )
          .sort((a, b) => dias(a.data, m.data) - dias(b.data, m.data))[0] ?? null;
      if (candidato) usadoCand.add(candidato.ref);
      return { mov: m, candidato };
    });
  return {
    pares,
    valorPareado: Math.round(valorPareado * 100) / 100,
    contraparteTrocada: trocada,
    semPar,
    diferenca: Math.round(semPar.reduce((a, s) => a + s.mov.valor, 0) * 100) / 100,
  };
}
