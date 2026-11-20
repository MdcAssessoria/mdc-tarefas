// BI de Gestão: margens da DRE por faixa (decisão do Edvaldo, 20/11/2026). Cada margem tem as suas faixas (bruta,
// operacional e líquida) e um texto curto para quem não é da área. Testado em margens.test.ts.
import type { Tom } from "@/components/ui/Tons";
import { margem } from "./relatorio";
import type { Matriz } from "./relatorio";

export interface FaixaMargem {
  codigo: "lucro_bruto" | "resultado_operacional" | "resultado_liquido";
  titulo: string;
  /** Abaixo de `baixa` = vermelho; até `boa` = amarelo; acima de `boa` = verde (em fração: 0,2 = 20%). */
  baixa: number;
  boa: number;
  /** O que a margem mede, em linguagem simples. */
  explica: string;
}

export const FAIXAS_MARGEM: FaixaMargem[] = [
  {
    codigo: "lucro_bruto",
    titulo: "Margem bruta",
    baixa: 0.2,
    boa: 0.35,
    explica: "o que sobra da receita líquida depois do custo do que foi vendido (matéria-prima, mão de obra da produção, terceiros)",
  },
  {
    codigo: "resultado_operacional",
    titulo: "Margem operacional",
    baixa: 0.05,
    boa: 0.12,
    explica: "o que sobra depois também das despesas de pessoal, administrativas e comerciais, antes dos juros e do IR",
  },
  {
    codigo: "resultado_liquido",
    titulo: "Margem líquida",
    baixa: 0,
    boa: 0.08,
    explica: "o que sobra no fim, depois de juros, tarifas e IRPJ/CSLL",
  },
];

export type NivelMargem = "baixa" | "media" | "boa";

export const TOM_DO_NIVEL: Record<NivelMargem, Tom> = { baixa: "vermelho", media: "ambar", boa: "verde" };
export const NOME_DO_NIVEL: Record<NivelMargem, string> = { baixa: "Abaixo do esperado", media: "Atenção", boa: "Saudável" };

/** Faixa de um percentual (em fração). O limite de cima de cada faixa pertence a ela (20% exato ainda é atenção). */
export function nivelDaMargem(f: FaixaMargem, v: number): NivelMargem {
  if (v < f.baixa) return "baixa";
  if (v <= f.boa) return "media";
  return "boa";
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export interface MargemCalculada {
  faixa: FaixaMargem;
  valor: number;
  nivel: NivelMargem;
  /** "De cada R$ 100 de receita líquida, sobraram R$ 12 …" */
  frase: string;
  /** "Faixas: abaixo de 20% · 20% a 35% · acima de 35%" */
  regua: string;
}

/** Margens da matriz (null quando não há receita líquida no período). */
export function calcularMargens(m: Matriz): MargemCalculada[] | null {
  if (margem(m, "receita_liquida") === null) return null;
  return FAIXAS_MARGEM.map((f) => {
    const valor = margem(m, f.codigo) ?? 0;
    const sobra = valor * 100;
    return {
      faixa: f,
      valor,
      nivel: nivelDaMargem(f, valor),
      frase:
        sobra >= 0
          ? `De cada R$ 100 de receita líquida, sobraram ${reais(sobra)}: ${f.explica}.`
          : `De cada R$ 100 de receita líquida, faltaram ${reais(-sobra)}: ${f.explica}.`,
      regua: `Faixas: abaixo de ${pct(f.baixa)} · ${pct(f.baixa)} a ${pct(f.boa)} · acima de ${pct(f.boa)}`,
    };
  });
}

export const fmtMargem = pct;
