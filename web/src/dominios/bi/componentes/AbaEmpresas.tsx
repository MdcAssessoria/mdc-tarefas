// Empresa × empresa: o total do período de cada empresa, a soma, as eliminações entre elas e o consolidado do grupo.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { matrizPorEmpresas } from "../comparar";
import type { LinhaEmpresas } from "../comparar";
import { lerRelatorio } from "../dados";
import type { TipoRelatorio } from "../relatorio";
import { classeDaLinha, QuadroDemonstrativo, TdValor } from "./Demonstrativo";
import { GraficoParticipacao } from "./GraficoBarras";
import { SeletorRelatorio } from "./SeletorRelatorio";
import type { ContextoBi } from "./contexto";

export function AbaEmpresas({ c }: { c: ContextoBi }) {
  const [rel, setRel] = useState<TipoRelatorio>("dre");
  const varias = c.ids.length > 1;
  const dados = useConsulta(
    useCallback(async () => {
      if (!varias) return null;
      const [cons, ...cada] = await Promise.all([
        lerRelatorio(rel, c.ids, c.de, c.ate, c.elimina),
        ...c.ids.map((id) => lerRelatorio(rel, [id], c.de, c.ate, false)),
      ]);
      return matrizPorEmpresas(cada, cons);
    }, [rel, varias, c.ids, c.de, c.ate, c.elimina]),
  );

  if (!varias)
    return (
      <EstadoVazio icone="grade" titulo="Escolha mais de uma empresa">
        A comparação entre empresas aparece quando há duas ou mais empresas marcadas no filtro.
      </EstadoVazio>
    );
  const nomes = c.empresas.map((e) => e.nome);
  const titulo = `${rel === "dre" ? "DRE" : "Fluxo de caixa"} por empresa`;
  const colunas: ColunaLista<LinhaEmpresas>[] = [
    { titulo: "Conta", valor: (l) => l.nome, peso: 3, largura: 44 },
    ...nomes.map((n, i) => ({
      titulo: n,
      valor: (l: LinhaEmpresas) => l.valores[i],
      formato: "moeda" as const,
      alerta: (l: LinhaEmpresas) => l.valores[i] < 0,
    })),
    { titulo: "Soma", valor: (l) => l.soma, formato: "moeda" },
    { titulo: "Eliminações", valor: (l) => l.eliminacoes, formato: "moeda" },
    { titulo: "Consolidado", valor: (l) => l.consolidado, formato: "moeda", alerta: (l) => l.consolidado < 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SeletorRelatorio valor={rel} aoMudar={setRel} />
        <p className="flex-1 text-sm text-[var(--texto-suave)]">{c.rotuloPeriodo}</p>
        <BotoesExportar
          vazio={!dados.dados?.length}
          avisar={c.avisar}
          montar={() => ({
            titulo: `${titulo} · ${c.grupo}`,
            subtitulo: c.rotuloPeriodo,
            arquivo: nomeArquivo("BI-por-empresa", c.grupo, c.hoje),
            logoUrl: c.logoUrl,
            paisagem: true,
            linhas: dados.dados ?? [],
            colunas,
          })}
        />
      </div>
      {dados.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {dados.erro}
        </p>
      )}
      {!dados.dados ? (
        !dados.erro && <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {(rel === "dre" ? ["receita_liquida", "resultado_liquido"] : ["fluxo_operacional", "variacao_caixa"]).map((cod) => {
              const l = dados.dados?.find((x) => x.codigo === cod);
              if (!l) return null;
              return (
                <GraficoParticipacao
                  key={cod}
                  titulo={`${l.nome} por empresa`}
                  itens={[
                    ...nomes.map((n, i) => ({ nome: n, valor: l.valores[i] })),
                    ...(Math.abs(l.eliminacoes) > 0.005 ? [{ nome: "Eliminações entre as empresas", valor: l.eliminacoes }] : []),
                  ]}
                />
              );
            })}
          </div>
          <QuadroDemonstrativo rotulo={titulo}>
            <thead>
              <tr>
                <th>Conta</th>
                {nomes.map((n) => (
                  <th key={n}>{n}</th>
                ))}
                <th>Soma</th>
                <th title="O que sai ao tirar as vendas e pagamentos entre as empresas do grupo">Eliminações</th>
                <th className="demo-total">Consolidado</th>
              </tr>
            </thead>
            <tbody>
              {dados.dados.map((l) => (
                <tr key={l.codigo} className={classeDaLinha(l.codigo, l.subtotal)}>
                  <td className="demo-conta">{l.nome}</td>
                  {l.valores.map((v, i) => (
                    <TdValor key={nomes[i]} v={v} />
                  ))}
                  <TdValor v={l.soma} />
                  <TdValor v={l.eliminacoes} className="!text-[var(--texto-suave)]" />
                  <TdValor v={l.consolidado} className="demo-total" />
                </tr>
              ))}
            </tbody>
          </QuadroDemonstrativo>
        </>
      )}
      <p className="text-xs text-[var(--texto-suave)]">
        Cada empresa aparece com todas as operações dela. Eliminações = o consolidado menos a soma: são as vendas e pagamentos entre as
        empresas do grupo{c.elimina ? "" : " (zero, porque a opção de tirar essas operações está desligada)"}.
      </p>
    </div>
  );
}
