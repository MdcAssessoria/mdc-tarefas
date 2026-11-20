// Aba Classificação do BI (só a equipe MDC, gestor do BI): categorias do Omie das empresas escolhidas com a conta do plano,
// de onde ela veio (código na descrição, escolha da equipe, transferência) e o valor no período. Pendentes primeiro;
// Classificar/Alterar, Conferir e Voltar ao código do Omie gravam por função com histórico (migração 105).
"use client";

import { useCallback, useMemo, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { FILTROS_CLASSIFICACAO, filtrar, mesmaCategoriaEmOutras, resumir, situacao } from "../classificacao";
import type { FiltroClassificacao } from "../classificacao";
import { conferirClassificacao, excluirClassificacao, lerClassificacao, lerLinhas, lerPlano } from "../dados";
import type { CategoriaClassificacao } from "../dados";
import { JanelaClassificar } from "./JanelaClassificar";
import type { ContextoBi } from "./contexto";

export function AbaClassificacao({ c }: { c: ContextoBi }) {
  const [filtro, setFiltro] = useState<FiltroClassificacao>("pendentes");
  const [busca, setBusca] = useState("");
  const [editar, setEditar] = useState<CategoriaClassificacao | null>(null);
  const [voltar, setVoltar] = useState<CategoriaClassificacao | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const lista = useConsulta(useCallback(() => lerClassificacao(c.ids, c.de, c.ate), [c.ids, c.de, c.ate]));
  const apoio = useConsulta(
    useCallback(async () => {
      const [plano, linhas] = await Promise.all([lerPlano(), lerLinhas()]);
      return { plano, nomes: new Map(linhas.map((l) => [`${l.relatorio}:${l.codigo}`, l.nome])) };
    }, []),
  );
  const todas = useMemo(() => lista.dados ?? [], [lista.dados]);
  const visiveis = useMemo(() => filtrar(todas, filtro, busca), [todas, filtro, busca]);
  const r = resumir(todas);
  const varias = c.ids.length > 1;

  async function conferir(x: CategoriaClassificacao) {
    if (!x.excecao_id) return;
    setOcupado(x.excecao_id);
    try {
      await conferirClassificacao(c.ids, x.excecao_id);
      c.avisar("Classificação conferida.", "sucesso");
      lista.recarregar();
    } catch (e) {
      c.avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  const colunas: ColunaLista<CategoriaClassificacao>[] = [
    ...(varias ? [{ titulo: "Empresa", valor: (x: CategoriaClassificacao) => x.empresa, peso: 1.3 }] : []),
    { titulo: "Categoria do Omie", valor: (x) => `${x.categoria_codigo} · ${x.descricao ?? ""}`, peso: 2.6, largura: 44 },
    { titulo: "Conta do plano", valor: (x) => (x.conta ? `${x.conta} · ${x.conta_nome ?? ""}` : "Sem conta"), peso: 2.4, largura: 40 },
    { titulo: "Situação", valor: (x) => situacao(x).nome, peso: 1.3 },
    { titulo: "Lançamentos", valor: (x) => x.lancamentos, formato: "numero", peso: 0.8 },
    { titulo: "Valor no período", valor: (x) => Number(x.valor), formato: "moeda", alerta: (x) => x.valor < 0 },
    { titulo: "Observação", valor: (x) => x.observacao ?? "", peso: 1.6 },
  ];

  if (lista.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {lista.erro}
      </p>
    );
  if (!lista.dados) return <Esqueleto />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-[var(--marca)]">Classificação das categorias do Omie</h2>
        <p className="text-sm text-[var(--texto-suave)]">
          {c.quem} · valores de {c.rotuloPeriodo}. Categoria com o código do plano na frente do nome (&quot;6.1.01 - Salários&quot;) entra
          sozinha; as outras a equipe MDC classifica aqui.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Sem conta do plano"
          valor={String(r.semConta)}
          detalhe={r.semConta ? `${brl(r.valorSemConta)} no período` : "Tudo classificado"}
          tom={r.semConta ? "vermelho" : "verde"}
          icone="alerta"
          ativo={filtro === "sem"}
          aoClicar={() => setFiltro("sem")}
        />
        <Indicador
          titulo="A conferir"
          valor={String(r.aConferir)}
          detalhe="Recuperadas do de-para antigo"
          tom={r.aConferir ? "ambar" : "verde"}
          icone="relogio"
          ativo={filtro === "conferir"}
          aoClicar={() => setFiltro("conferir")}
        />
        <Indicador
          titulo="Categorias usadas"
          valor={String(r.total)}
          icone="lista"
          ativo={filtro === "todas"}
          aoClicar={() => setFiltro("todas")}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
        {FILTROS_CLASSIFICACAO.map((f) => {
          const on = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFiltro(f.id)}
              className={`chip flex items-center gap-1.5 border ${on ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-[var(--texto)]"}`}
            >
              {on && <Icone nome="check" className="h-3.5 w-3.5" />}
              {f.nome}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="campo min-w-0 flex-1">
          <span>Procurar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, nome da categoria ou conta" />
        </label>
        <BotoesExportar
          vazio={!visiveis.length}
          avisar={c.avisar}
          montar={() => ({
            titulo: `Classificação das categorias · ${c.quem}`,
            subtitulo: `Valores de ${c.rotuloPeriodo} · ${FILTROS_CLASSIFICACAO.find((f) => f.id === filtro)?.nome}`,
            arquivo: nomeArquivo("BI-classificacao", c.quem, c.hoje),
            logoUrl: c.logoUrl,
            paisagem: true,
            linhas: visiveis,
            colunas,
          })}
        />
      </div>

      {!visiveis.length ? (
        <EstadoVazio icone="check" titulo={filtro === "pendentes" ? "Nada pendente" : "Nenhuma categoria neste filtro"}>
          {filtro === "pendentes"
            ? "Todas as categorias usadas pelas empresas escolhidas têm conta do plano. Veja as outras em Todas."
            : "Troque o filtro ou a busca."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Categorias do Omie" acoesFixas>
          <thead>
            <tr>
              {varias && <th>Empresa</th>}
              <th>Categoria do Omie</th>
              <th>Conta do plano</th>
              <th>Situação</th>
              <th className="text-right">Valor no período</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((x) => {
              const s = situacao(x);
              return (
                <tr key={`${x.cliente_id}-${x.categoria_codigo}`}>
                  {varias && <td data-rotulo="Empresa">{x.empresa}</td>}
                  <td className="celula-titulo">
                    <span className="num text-[var(--texto-suave)]">{x.categoria_codigo}</span> {x.descricao}
                    {x.observacao && <span className="block text-xs text-[var(--texto-suave)]">{x.observacao}</span>}
                  </td>
                  <td data-rotulo="Conta do plano">
                    {x.conta ? (
                      <span>
                        <span className="num">{x.conta}</span> · {x.conta_nome}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-rotulo="Situação">
                    <Chip tom={s.tom}>{s.nome}</Chip>
                  </td>
                  <td data-rotulo="Valor no período" className="text-right">
                    <Valor v={Number(x.valor)} />
                    <span className="block text-xs text-[var(--texto-suave)]">{x.lancamentos} lançamento(s)</span>
                  </td>
                  <td className="celula-acoes whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {x.origem !== "transferencia" && (
                        <button type="button" className="btn !min-h-8 !px-3" onClick={() => setEditar(x)} disabled={!apoio.dados}>
                          <Icone nome={x.conta && x.conta !== "9.9.02" ? "editar" : "etiqueta"} className="h-4 w-4" />
                          {x.conta && x.conta !== "9.9.02" ? "Alterar" : "Classificar"}
                        </button>
                      )}
                      {x.a_conferir && x.excecao_id && (
                        <button
                          type="button"
                          className="btn !min-h-8 !px-3"
                          onClick={() => conferir(x)}
                          disabled={ocupado === x.excecao_id}
                        >
                          <Icone nome="check" className="h-4 w-4" />
                          {ocupado === x.excecao_id ? "Gravando…" : "Conferir"}
                        </button>
                      )}
                      {x.origem === "excecao" && x.excecao_id && (
                        <button type="button" className="btn !min-h-8 !px-3" onClick={() => setVoltar(x)}>
                          <Icone nome="atualizar" className="h-4 w-4" />
                          Desfazer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </QuadroTabela>
      )}
      {apoio.erro && <p className="text-sm text-red-700">{apoio.erro}</p>}

      {editar && apoio.dados && (
        <JanelaClassificar
          cat={editar}
          outras={mesmaCategoriaEmOutras(todas, editar)}
          plano={apoio.dados.plano}
          nomes={apoio.dados.nomes}
          clientes={c.ids}
          aoFechar={() => setEditar(null)}
          aoGravar={(n) => {
            setEditar(null);
            c.avisar(
              n > 1
                ? `Classificação gravada em ${n} empresas. Os relatórios já usam a nova conta.`
                : "Classificação gravada. Os relatórios já usam a nova conta.",
              "sucesso",
            );
            lista.recarregar();
          }}
        />
      )}
      {voltar && voltar.excecao_id && (
        <JanelaMotivo
          titulo="Desfazer a classificação da equipe"
          descricao={`${voltar.empresa} · ${voltar.categoria_codigo} ${voltar.descricao ?? ""}. A categoria volta a seguir o código do Omie (ou fica sem conta). O motivo fica no histórico.`}
          botao="Desfazer classificação"
          aoFechar={() => setVoltar(null)}
          aoConfirmar={async (motivo) => {
            await excluirClassificacao(c.ids, voltar.excecao_id!, motivo);
            setVoltar(null);
            c.avisar("Classificação desfeita.", "sucesso");
            lista.recarregar();
          }}
        />
      )}
    </div>
  );
}
