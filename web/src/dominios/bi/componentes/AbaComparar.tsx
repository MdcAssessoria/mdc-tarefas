// Comparar: o período escolhido contra o período anterior, o mesmo período do ano passado ou o orçamento, linha a
// linha (diferença em R$ e %) e mês a mês no gráfico.
"use client";

import { useCallback, useState } from "react";
import { fmtData } from "@/lib/formato/datas";
import { useConsulta } from "@/lib/useConsulta";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { MODOS_COMPARAR, compararMatrizes, fmtVariacao, periodoComparado, serie } from "../comparar";
import type { LinhaComparada, ModoComparar } from "../comparar";
import { lerOrcado, lerRelatorio } from "../dados";
import { temMovimento } from "../relatorio";
import type { TipoRelatorio } from "../relatorio";
import { classeDaLinha, QuadroDemonstrativo, TdValor } from "./Demonstrativo";
import { GraficoBarras } from "./GraficoBarras";
import { SeletorRelatorio } from "./SeletorRelatorio";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";

const CONTA_GRAFICO: Record<TipoRelatorio, { codigo: string; nome: string }> = {
  dre: { codigo: "resultado_liquido", nome: "Resultado líquido" },
  dfc: { codigo: "fluxo_operacional", nome: "Caixa das operações" },
};

export function AbaComparar({ c }: { c: ContextoBi }) {
  const [rel, setRel] = useState<TipoRelatorio>("dre");
  const [modo, setModo] = useState<ModoComparar>("ano_passado");
  const base = periodoComparado(c.de, c.ate, modo);
  const rotuloBase = modo === "orcado" ? "Orçado" : `${fmtData(base.de)} a ${fmtData(base.ate)}`;

  const dados = useConsulta(
    useCallback(async () => {
      const [atual, outro] = await Promise.all([
        lerRelatorio(rel, c.ids, c.de, c.ate, c.elimina),
        modo === "orcado" ? lerOrcado(rel, c.ids, c.de, c.ate) : lerRelatorio(rel, c.ids, base.de, base.ate, c.elimina),
      ]);
      return { atual, outro, linhas: compararMatrizes(atual, outro) };
    }, [rel, modo, c.ids, c.de, c.ate, c.elimina, base.de, base.ate]),
  );
  const d = dados.dados;
  const titulo = `${rel === "dre" ? "DRE" : "Fluxo de caixa"}: ${c.rotuloPeriodo} × ${rotuloBase}`;
  const conta = CONTA_GRAFICO[rel];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <SeletorRelatorio valor={rel} aoMudar={setRel} />
        <label className="campo md:w-80">
          <span>Comparar com</span>
          <select value={modo} onChange={(e) => setModo(e.target.value as ModoComparar)}>
            {MODOS_COMPARAR.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="md:ml-auto">
          <BotoesExportar
            vazio={!d?.linhas.length}
            avisar={c.avisar}
            montar={() => ({
              titulo: `${titulo} · ${c.quem}`,
              subtitulo: `Comparação${textoEliminacao(c)}`,
              arquivo: nomeArquivo("BI-comparacao", c.quem, c.hoje),
              logoUrl: c.logoUrl,
              paisagem: true,
              linhas: d?.linhas ?? [],
              colunas: [
                { titulo: "Conta", valor: (l: LinhaComparada) => l.nome, peso: 3, largura: 44 },
                { titulo: c.rotuloPeriodo, valor: (l) => l.atual, formato: "moeda", alerta: (l) => l.atual < 0 },
                { titulo: rotuloBase, valor: (l) => l.base, formato: "moeda", alerta: (l) => l.base < 0 },
                { titulo: "Diferença", valor: (l) => l.diferenca, formato: "moeda", alerta: (l) => l.diferenca < 0 },
                { titulo: "Variação", valor: (l) => fmtVariacao(l.variacao), peso: 0.8 },
              ],
            })}
          />
        </div>
      </div>

      {modo === "orcado" && (
        <p className="text-sm text-[var(--texto-suave)]">
          O orçamento é lançado na aba Lançamentos. Com mais de uma empresa, o orçado é a soma das metas de cada uma.
        </p>
      )}
      {dados.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {dados.erro}
        </p>
      )}
      {!d ? (
        !dados.erro && <Esqueleto />
      ) : (
        <>
          {modo === "orcado" && !temMovimento(d.outro) && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Ainda não há orçamento lançado para estas empresas neste período.
            </p>
          )}
          <GraficoBarras
            titulo={`${conta.nome}: ${modo === "orcado" ? "realizado × orçado" : "este período × comparado"}`}
            meses={d.atual.meses}
            series={[
              { nome: modo === "orcado" ? "Realizado" : "Este período", cor: "#0B2820", valores: serie(d.atual, conta.codigo) },
              {
                nome: modo === "orcado" ? "Orçado" : "Comparado",
                cor: "#C9A24D",
                valores: d.atual.meses.map((_, i) => serie(d.outro, conta.codigo)[i] ?? 0),
              },
            ]}
          />
          <QuadroDemonstrativo rotulo={titulo}>
            <thead>
              <tr>
                <th>Conta</th>
                <th>{modo === "orcado" ? "Realizado" : c.rotuloPeriodo}</th>
                <th>{rotuloBase}</th>
                <th className="demo-total">Diferença</th>
                <th>Variação</th>
              </tr>
            </thead>
            <tbody>
              {d.linhas.map((l) => {
                const cor = l.diferenca > 0 ? "melhor" : l.diferenca < 0 ? "pior" : null;
                return (
                  <tr key={l.codigo} className={classeDaLinha(l.codigo, l.subtotal)}>
                    <td className="demo-conta">{l.nome}</td>
                    <TdValor v={l.atual} />
                    <TdValor v={l.base} />
                    <TdValor v={l.diferenca} cor={cor} className="demo-total" />
                    <td
                      className={`demo-pct ${cor === "melhor" ? "!text-[var(--sucesso)]" : cor === "pior" ? "!text-[var(--perigo)]" : ""}`}
                    >
                      {fmtVariacao(l.variacao)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </QuadroDemonstrativo>
          <p className="text-xs text-[var(--texto-suave)]">
            Diferença verde = melhor para o resultado (mais receita ou menos despesa); vermelha = pior. Variação sobre o valor comparado.
          </p>
        </>
      )}
    </div>
  );
}
