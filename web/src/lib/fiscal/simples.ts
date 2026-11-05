// Simples Nacional: alíquota efetiva pela regra da LC 123/2006 (art. 18, §1º e §1º-A, redação da LC 155/2016), usada
// como "tributos aproximados" na NFS-e (pTotTribSN). A Lei 12.741/2012 (art. 1º, §6º) permite ao optante do Simples
// informar só a alíquota a que está sujeito no regime; o Emissor Nacional pede esse percentual com 2 casas.
//
//   alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12
//
// RBT12 = receita bruta dos 12 meses anteriores ao mês da apuração. Fator R (art. 18, §5º-J e §5º-M): folha de
// salários dos 12 meses (com encargos e pró-labore) ÷ RBT12; de 28% para cima vai para o Anexo III, abaixo para o V.
// O enquadramento de cada serviço vem do Anexo VIII da NFS-e Nacional (coluna "COD_ATIV_SN").

export type AnexoSimples = "III" | "IV" | "V";

interface Faixa {
  ate: number;
  nominal: number;
  deduzir: number;
}

/** Tabelas da LC 123/2006 (Anexos III, IV e V, vigentes desde 01/2018). Alíquota nominal em %; parcela em R$. */
export const ANEXOS: Record<AnexoSimples, Faixa[]> = {
  III: [
    { ate: 180_000, nominal: 6, deduzir: 0 },
    { ate: 360_000, nominal: 11.2, deduzir: 9_360 },
    { ate: 720_000, nominal: 13.5, deduzir: 17_640 },
    { ate: 1_800_000, nominal: 16, deduzir: 35_640 },
    { ate: 3_600_000, nominal: 21, deduzir: 125_640 },
    { ate: 4_800_000, nominal: 33, deduzir: 648_000 },
  ],
  IV: [
    { ate: 180_000, nominal: 4.5, deduzir: 0 },
    { ate: 360_000, nominal: 9, deduzir: 8_100 },
    { ate: 720_000, nominal: 10.2, deduzir: 12_420 },
    { ate: 1_800_000, nominal: 14, deduzir: 39_780 },
    { ate: 3_600_000, nominal: 22, deduzir: 183_780 },
    { ate: 4_800_000, nominal: 33, deduzir: 828_000 },
  ],
  V: [
    { ate: 180_000, nominal: 15.5, deduzir: 0 },
    { ate: 360_000, nominal: 18, deduzir: 4_500 },
    { ate: 720_000, nominal: 19.5, deduzir: 9_900 },
    { ate: 1_800_000, nominal: 20.5, deduzir: 17_100 },
    { ate: 3_600_000, nominal: 23, deduzir: 62_100 },
    { ate: 4_800_000, nominal: 30.5, deduzir: 540_000 },
  ],
};

/** Limite do Simples para empresa de pequeno porte (LC 123, art. 3º, II). */
export const LIMITE_SIMPLES = 4_800_000;
/** Fator R mínimo para o Anexo III (LC 123, art. 18, §5º-J). */
export const FATOR_R_MINIMO = 0.28;

export interface CalculoSimples {
  anexo: AnexoSimples;
  faixa: number;
  nominal: number;
  deduzir: number;
  /** Alíquota efetiva em %, com 2 casas (o formato do pTotTribSN). */
  efetiva: number;
  /** Fator R usado (quando a atividade é do Fator R). */
  fatorR?: number;
  aviso?: string;
}

/** Arredonda para 2 casas (meio para cima), como o Emissor espera no pTotTribSN. */
const duas = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Anexo do serviço pelo código de atividade do Simples do Anexo VIII (COD_ATIV_SN). "fator_r" = III ou V. */
export function anexoDaAtividade(codAtivSn: string | null | undefined): AnexoSimples | "fator_r" | "impeditiva" | null {
  switch ((codAtivSn ?? "").trim().toUpperCase()) {
    case "7":
    case "10":
    case "11":
    case "12":
      return "III";
    case "9":
      return "fator_r";
    case "13":
    case "14":
      return "IV";
    case "IMP":
      return "impeditiva";
    default:
      return null;
  }
}

/** Fator R = folha dos 12 meses ÷ RBT12; com 28% ou mais vai para o Anexo III, abaixo para o V. */
export function anexoPeloFatorR(folha12: number, rbt12: number): { anexo: AnexoSimples; fatorR: number } {
  const fatorR = rbt12 > 0 ? folha12 / rbt12 : 0;
  return { anexo: fatorR >= FATOR_R_MINIMO ? "III" : "V", fatorR };
}

/**
 * Alíquota efetiva do Simples. Empresa no 1º ano (RBT12 zero) usa a alíquota nominal da 1ª faixa (LC 123, art. 18,
 * §2º: proporcionaliza a receita; sem receita, fica na 1ª faixa). Acima do limite, calcula na última faixa e avisa.
 */
export function aliquotaEfetiva(anexo: AnexoSimples, rbt12: number): CalculoSimples {
  const tabela = ANEXOS[anexo];
  if (!(rbt12 > 0)) {
    const f = tabela[0];
    return {
      anexo,
      faixa: 1,
      nominal: f.nominal,
      deduzir: f.deduzir,
      efetiva: duas(f.nominal),
      aviso: "Sem receita nos 12 meses: vale a 1ª faixa.",
    };
  }
  let i = tabela.findIndex((f) => rbt12 <= f.ate);
  let aviso: string | undefined;
  if (i < 0) {
    i = tabela.length - 1;
    aviso = "Receita dos 12 meses acima do limite do Simples (R$ 4,8 milhões): confira o desenquadramento.";
  }
  const f = tabela[i];
  return {
    anexo,
    faixa: i + 1,
    nominal: f.nominal,
    deduzir: f.deduzir,
    efetiva: duas((((rbt12 * f.nominal) / 100 - f.deduzir) / rbt12) * 100),
    aviso,
  };
}

/**
 * Parte do ISS dentro da alíquota efetiva do Anexo III, por faixa (repartição dos tributos, Anexo III da LC 123).
 * Na 5ª faixa o ISS fica limitado a 5% (o excedente vai para os tributos federais); na 6ª o ISS é pago por fora.
 */
export const ISS_ANEXO_III = [33.5, 32, 32.5, 32.5, 33.5, 0];

/**
 * Escritório de contabilidade (LC 123, art. 18, §5º-B, XIV e §22-A): paga o ISS em valor fixo ao município, fora do DAS.
 * O percentual do DAS (e o dos tributos aproximados) fica sem a parte do ISS.
 */
export function semIssAnexoIII(c: CalculoSimples): number {
  if (c.anexo !== "III") return c.efetiva;
  const parte = ISS_ANEXO_III[c.faixa - 1] ?? 0;
  const iss = Math.min((c.efetiva * parte) / 100, 5);
  return duas(c.efetiva - iss);
}
