// Leitura do plano de contas exportado do Domínio em Excel (Relatórios › Plano de contas): acha o cabeçalho
// (Código, Classificação, Descrição/Nome, Tipo) e devolve as contas. Quando o arquivo não traz o Tipo, a conta é
// analítica se nenhuma outra começa com a classificação dela.
import { semAcento } from "@/lib/texto";

export interface ContaPlano {
  codigo: string | null; // código reduzido do Domínio (usado no leiaute de importação de lançamentos)
  classificacao: string; // 1.1.1.01.001
  descricao: string;
  analitica: boolean; // só conta analítica recebe lançamento
  nivel: number;
}

const norm = (v: unknown) =>
  semAcento(String(v ?? ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
const CLASSIF = /^\d+(\.\d+)*$/;

export function lerPlanoDominio(matriz: unknown[][]): { contas: ContaPlano[]; avisos: string[] } {
  const avisos: string[] = [];
  let cab = -1;
  let c = { codigo: -1, classificacao: -1, descricao: -1, tipo: -1 };
  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const cels = matriz[i].map(norm);
    const classificacao = cels.findIndex((x) => /CLASSIFICA/.test(x));
    const descricao = cels.findIndex((x) => /^(DESCRICAO|NOME|NOME DA CONTA|DESCRICAO DA CONTA|CONTA)$/.test(x));
    if (classificacao >= 0 && descricao >= 0) {
      cab = i;
      c = {
        classificacao,
        descricao,
        codigo: cels.findIndex((x, k) => k !== descricao && /^(CODIGO|COD|REDUZIDO|COD\.? REDUZIDO|CODIGO REDUZIDO)$/.test(x)),
        tipo: cels.findIndex((x) => /^(TIPO|T|S\/A|SINT\/ANAL)$/.test(x)),
      };
      break;
    }
  }
  if (cab < 0) throw new Error("Não encontrei as colunas Classificação e Descrição (ou Nome) no plano de contas.");

  const contas: ContaPlano[] = [];
  const vistos = new Set<string>();
  for (const lin of matriz.slice(cab + 1)) {
    const classificacao = String(lin[c.classificacao] ?? "").trim();
    if (!CLASSIF.test(classificacao)) continue;
    if (vistos.has(classificacao)) {
      avisos.push(`A classificação ${classificacao} aparece mais de uma vez; ficou a primeira.`);
      continue;
    }
    vistos.add(classificacao);
    const tipo = c.tipo >= 0 ? norm(lin[c.tipo]) : "";
    const codigo = c.codigo >= 0 ? String(lin[c.codigo] ?? "").trim() || null : null;
    contas.push({
      codigo,
      classificacao,
      descricao: String(lin[c.descricao] ?? "").trim() || "(sem nome)",
      analitica: tipo ? tipo.startsWith("A") : true, // sem coluna Tipo: decide abaixo
      nivel: classificacao.split(".").length,
    });
  }
  if (c.tipo < 0) for (const conta of contas) conta.analitica = !contas.some((o) => o.classificacao.startsWith(conta.classificacao + "."));
  if (!contas.length) avisos.push("Nenhuma conta com classificação encontrada abaixo do cabeçalho.");
  if (contas.some((x) => x.analitica && !x.codigo))
    avisos.push("Algumas contas analíticas estão sem código reduzido: a exportação para o Domínio usa esse código.");
  return { contas, avisos };
}
