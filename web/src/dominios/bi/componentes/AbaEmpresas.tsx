// Empresa × empresa: o total do período de cada empresa, a soma, as eliminações entre elas e o consolidado do grupo.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { matrizPorEmpresas } from "../comparar";
import type { LinhaEmpresas } from "../comparar";
import { lerRelatorio } from "../dados";
import type { TipoRelatorio } from "../relatorio";
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
        <QuadroTabela rotulo={titulo} cartoes={false}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[14rem] bg-[var(--fundo)]">Conta</th>
              {nomes.map((n) => (
                <th key={n} className="text-right">
                  {n}
                </th>
              ))}
              <th className="text-right">Soma</th>
              <th className="text-right" title="O que sai ao tirar as vendas e pagamentos entre as empresas do grupo">
                Eliminações
              </th>
              <th className="text-right">Consolidado</th>
            </tr>
          </thead>
          <tbody>
            {dados.dados.map((l) => (
              <tr key={l.codigo} className={l.subtotal ? "bg-[var(--fundo)]" : ""}>
                <td
                  className={`celula-titulo sticky left-0 z-[1] ${l.subtotal ? "bg-[var(--fundo)] font-semibold text-[var(--marca)]" : "bg-white !font-normal"}`}
                >
                  {l.nome}
                </td>
                {l.valores.map((v, i) => (
                  <td key={nomes[i]} className="text-right">
                    <Valor v={v} />
                  </td>
                ))}
                <td className="text-right">
                  <Valor v={l.soma} />
                </td>
                <td className="text-right text-[var(--texto-suave)]">
                  <Valor v={l.eliminacoes} />
                </td>
                <td className="text-right font-semibold">
                  <Valor v={l.consolidado} />
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}
      <p className="text-xs text-[var(--texto-suave)]">
        Cada empresa aparece com todas as operações dela. Eliminações = o consolidado menos a soma: são as vendas e pagamentos entre as
        empresas do grupo{c.elimina ? "" : " (zero, porque a opção de tirar essas operações está desligada)"}.
      </p>
    </div>
  );
}
