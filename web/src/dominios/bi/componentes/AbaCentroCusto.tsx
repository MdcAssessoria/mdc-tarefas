// BI › Centro de custo (117): DRE ou fluxo de caixa por centro de custo (departamento do Omie). Lista dos centros com
// pesquisa (entradas, saídas, resultado), escolha de um ou mais centros e a matriz conta × mês com pesquisa de conta.
// Os títulos e as baixas vêm repartidos pelo rateio do Omie; notas, extrato e lançamentos do BI ficam em "Sem centro".
"use client";

import { useCallback, useMemo, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { useConsulta } from "@/lib/useConsulta";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { coberturaCentros, filtrarCentros, matrizDosCentros, resumirCentros, SEM_CENTRO } from "../centros";
import type { LinhaCentro, ResumoCentro } from "../centros";
import { lerCentroCusto, lerEstrutura } from "../dados";
import type { TipoRelatorio } from "../relatorio";
import { mesesDoPeriodo } from "../saldos";
import { classeDaLinha, QuadroDemonstrativo, TdValor } from "./Demonstrativo";
import { SeletorRelatorio } from "./SeletorRelatorio";
import type { ContextoBi } from "./contexto";

export function AbaCentroCusto({ c }: { c: ContextoBi }) {
  const [rel, setRel] = useState<TipoRelatorio>("dre");
  const [buscaCentro, setBuscaCentro] = useState("");
  const [buscaConta, setBuscaConta] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const dados = useConsulta(
    useCallback(async () => {
      const [linhas, estrutura] = await Promise.all([lerCentroCusto(rel, c.ids, c.de, c.ate, c.elimina), lerEstrutura(rel)]);
      return { linhas: linhas ?? [], estrutura };
    }, [rel, c.ids, c.de, c.ate, c.elimina]),
  );
  const meses = useMemo(() => mesesDoPeriodo(c.de, c.ate), [c.de, c.ate]);
  const centros = useMemo(() => resumirCentros(dados.dados?.linhas ?? []), [dados.dados]);
  const visiveis = useMemo(() => filtrarCentros(centros, buscaCentro), [centros, buscaCentro]);
  const selecao = useMemo(() => (escolhidos.length ? new Set(escolhidos) : null), [escolhidos]);
  const matriz = useMemo(
    () => (dados.dados ? matrizDosCentros(dados.dados.linhas, dados.dados.estrutura, meses, selecao, buscaConta) : []),
    [dados.dados, meses, selecao, buscaConta],
  );
  const cobertura = coberturaCentros(centros);
  const temCentro = centros.some((x) => x.centro !== SEM_CENTRO);
  const nomeEscolha = escolhidos.length
    ? centros
        .filter((x) => escolhidos.includes(x.centro))
        .map((x) => x.nome)
        .join(", ")
    : "Todos os centros";
  const relNome = rel === "dre" ? "DRE" : "Fluxo de caixa";

  function alternar(centro: string) {
    setEscolhidos((atual) => (atual.includes(centro) ? atual.filter((x) => x !== centro) : [...atual, centro]));
  }

  const colunasMatriz: ColunaLista<LinhaCentro>[] = [
    { titulo: "Conta", valor: (l) => l.nome, peso: 3, largura: 44 },
    ...meses.map((m, i) => ({
      titulo: rotuloMes(m),
      valor: (l: LinhaCentro) => l.valores[i],
      formato: "moeda" as const,
      alerta: (l: LinhaCentro) => l.valores[i] < 0,
    })),
    { titulo: "Total", valor: (l) => l.total, formato: "moeda", alerta: (l) => l.total < 0 },
  ];
  const colunasCentros: ColunaLista<ResumoCentro>[] = [
    { titulo: "Centro de custo", valor: (x) => x.nome, peso: 3, largura: 40 },
    { titulo: "Código", valor: (x) => x.centro || "—", largura: 14 },
    { titulo: rel === "dre" ? "Receitas" : "Entradas", valor: (x) => x.entradas, formato: "moeda" },
    { titulo: rel === "dre" ? "Custos e despesas" : "Saídas", valor: (x) => x.saidas, formato: "moeda", alerta: () => true },
    { titulo: "Resultado", valor: (x) => x.resultado, formato: "moeda", alerta: (x) => x.resultado < 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SeletorRelatorio
          valor={rel}
          aoMudar={(r) => {
            setRel(r);
            setEscolhidos([]);
          }}
        />
        <p className="flex-1 text-sm text-[var(--texto-suave)]">{c.rotuloPeriodo}</p>
      </div>
      {dados.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {dados.erro}
        </p>
      )}
      {!dados.dados ? (
        !dados.erro && <Esqueleto />
      ) : !centros.length ? (
        <EstadoVazio icone="grafico" titulo="Nada lançado neste período">
          Não há notas, contas ou lançamentos das empresas escolhidas entre {c.rotuloPeriodo}. Troque o período.
        </EstadoVazio>
      ) : (
        <>
          {!temCentro ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nenhum título deste período veio do Omie com centro de custo (departamento). Se a empresa usa centro de custo no Omie, os
                títulos antigos estão sendo trazidos de novo e aparecem aqui conforme a atualização avança. Se não usa, informe o
                departamento nas contas a pagar e a receber do Omie.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
              <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {Math.round(cobertura * 100)}% do movimento do período tem centro de custo. Notas fiscais, extrato do banco e lançamentos do
                BI não têm centro no Omie e ficam em &quot;Sem centro de custo&quot;.
              </span>
            </p>
          )}

          <section className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="campo flex-1 sm:max-w-sm">
                <span>Pesquisar centro de custo</span>
                <input type="search" value={buscaCentro} onChange={(e) => setBuscaCentro(e.target.value)} placeholder="Nome ou código do centro" />
              </label>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                {escolhidos.length > 0 && (
                  <button type="button" className="btn" onClick={() => setEscolhidos([])}>
                    <Icone nome="lista" className="h-4 w-4" />
                    Ver todos os centros
                  </button>
                )}
                <BotoesExportar
                  vazio={!visiveis.length}
                  avisar={c.avisar}
                  montar={() => ({
                    titulo: `Centros de custo · ${relNome} · ${c.quem}`,
                    subtitulo: c.rotuloPeriodo,
                    arquivo: nomeArquivo("BI-centros-de-custo", c.quem, c.hoje),
                    logoUrl: c.logoUrl,
                    linhas: visiveis,
                    colunas: colunasCentros,
                  })}
                />
              </div>
            </div>
            {!visiveis.length ? (
              <p className="rounded-md border border-dashed border-[var(--borda)] p-4 text-center text-sm text-[var(--texto-suave)]">
                Nenhum centro com &quot;{buscaCentro}&quot;. Troque a pesquisa.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {visiveis.map((x) => {
                  const on = escolhidos.includes(x.centro);
                  return (
                    <button
                      key={x.centro || "sem"}
                      type="button"
                      aria-pressed={on}
                      onClick={() => alternar(x.centro)}
                      className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${on ? "border-[var(--marca)] bg-[var(--marca)]/5 ring-1 ring-[var(--marca)]" : "border-[var(--borda)] bg-white hover:border-[var(--marca)]"}`}
                    >
                      <Icone nome={on ? "check" : x.centro ? "etiqueta" : "traco"} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.nome}</span>
                        <span className="mt-1 grid grid-cols-3 gap-1 text-[12px] text-[var(--texto-suave)]">
                          <span>
                            {rel === "dre" ? "Receitas" : "Entradas"}
                            <b className="num block font-medium text-[var(--texto)]">{brl(x.entradas)}</b>
                          </span>
                          <span>
                            {rel === "dre" ? "Gastos" : "Saídas"}
                            <b className="num block font-medium text-[var(--perigo)]">{brl(x.saidas)}</b>
                          </span>
                          <span>
                            Resultado
                            <b className={`num block font-semibold ${x.resultado < 0 ? "text-[var(--perigo)]" : "text-[var(--texto)]"}`}>{brl(x.resultado)}</b>
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-[var(--marca)]">
                  {relNome} · {nomeEscolha}
                </h3>
                <p className="text-xs text-[var(--texto-suave)]">
                  {escolhidos.length ? "Toque num centro acima para juntar ou tirar." : "Toque num centro acima para ver só ele (ou junte vários)."}
                </p>
              </div>
              <label className="campo sm:w-72">
                <span>Pesquisar conta</span>
                <input type="search" value={buscaConta} onChange={(e) => setBuscaConta(e.target.value)} placeholder="Ex.: energia, salários" />
              </label>
              <BotoesExportar
                vazio={!matriz.length}
                avisar={c.avisar}
                montar={() => ({
                  titulo: `${relNome} por centro de custo · ${nomeEscolha}`,
                  subtitulo: `${c.quem} · ${c.rotuloPeriodo}${buscaConta ? ` · contas com "${buscaConta}"` : ""}`,
                  arquivo: nomeArquivo("BI-centro-de-custo", nomeEscolha, c.hoje),
                  logoUrl: c.logoUrl,
                  paisagem: true,
                  linhas: matriz,
                  colunas: colunasMatriz,
                })}
              />
            </div>
            {!matriz.length ? (
              <p className="rounded-md border border-dashed border-[var(--borda)] p-4 text-center text-sm text-[var(--texto-suave)]">
                {buscaConta ? `Nenhuma conta com "${buscaConta}" neste centro. Troque a pesquisa.` : "Sem valores neste centro no período."}
              </p>
            ) : (
              <QuadroDemonstrativo rotulo={`${relNome} por centro de custo`}>
                <thead>
                  <tr>
                    <th>Conta</th>
                    {meses.map((m) => (
                      <th key={m}>{rotuloMes(m)}</th>
                    ))}
                    <th className="demo-total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matriz.map((l) => (
                    <tr key={l.codigo} className={classeDaLinha(l.codigo, l.subtotal)}>
                      <td className="demo-conta">{l.nome}</td>
                      {l.valores.map((v, i) => (
                        <TdValor key={meses[i]} v={v} rotulo={rotuloMes(meses[i])} />
                      ))}
                      <TdValor v={l.total} className="demo-total" rotulo="Total" />
                    </tr>
                  ))}
                </tbody>
              </QuadroDemonstrativo>
            )}
          </section>
        </>
      )}
    </div>
  );
}
