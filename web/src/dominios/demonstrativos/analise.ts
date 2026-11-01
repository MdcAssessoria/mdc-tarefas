// Cálculo completo de um balancete já classificado: resumo, índices, alertas, conferências e demonstrações.
// Só regras puras (nada de banco ou navegador): usado na tela de importação e copiado para a função do servidor
// (agente da pasta do SharePoint) por scripts/sync-funcoes.sh, para o resultado ser sempre o mesmo.
import { calcularIndices } from "./balancete/indices";
import { conferir, fragilidades } from "./balancete/fragilidades";
import { resumir } from "./balancete/resumo";
import type { Resumo } from "./balancete/resumo";
import type { Linha } from "./balancete/tipos";
import { basePrazos, montar, periodoDe } from "./calculosDemonstracoes";
import type { MapaDfc } from "./calculosDemonstracoes";
import { hojeISO } from "@/lib/datas";

export function analisar(
  linhas: Linha[],
  competencia: string | null,
  anterior: Resumo | null,
  inicio?: string | null,
  fim?: string | null,
  mapaDfc: MapaDfc = [],
) {
  const resumo = resumir(linhas);
  const periodo = periodoDe(competencia ?? hojeISO(), inicio, fim);
  const indices = calcularIndices(resumo, periodo.dias, basePrazos(linhas, periodo.dias));
  const alertas = fragilidades(resumo, indices, linhas, anterior);
  const conferencias = conferir(resumo, linhas, competencia);
  const demonstracoes = montar(linhas, resumo, indices, periodo, mapaDfc);
  if (!demonstracoes.dfc.fechado)
    conferencias.push({ nome: "DFC fecha com a variação do caixa", ok: false, detalhe: "revise os grupos das contas" });
  return { resumo, indices, alertas, conferencias, demonstracoes, periodo_inicio: periodo.inicio, periodo_fim: periodo.fim };
}
