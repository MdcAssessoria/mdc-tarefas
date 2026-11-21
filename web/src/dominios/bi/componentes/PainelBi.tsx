// Painel do BI depois de escolher a empresa (ou o grupo): filtros de período, empresas e operações entre elas, e as
// abas Visão geral, DRE, Fluxo de caixa, Resultado × caixa, Comparar, Empresas, Indicadores, Lançamentos e (equipe MDC)
// Parecer e Classificação. Cada aba busca só o que mostra.
"use client";

import { useCallback, useMemo, useState } from "react";
import { fmtData } from "@/lib/formato/datas";
import { PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { useConsulta } from "@/lib/useConsulta";
import { Abas } from "@/components/ui/Abas";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { lerContas, lerRelatorio, lerSaldos } from "../dados";
import { mesesDoPeriodo, resumirSaldos } from "../saldos";
import { montarContas } from "../detalhe";
import type { EmpresaBi } from "../dados";
import { periodoDoBi, periodoLongo, temMovimento, totalDe } from "../relatorio";
import type { TipoRelatorio } from "../relatorio";
import { AbaClassificacao } from "./AbaClassificacao";
import { AbaComparar } from "./AbaComparar";
import { AbaConciliacao } from "./AbaConciliacao";
import { AbaEmpresas } from "./AbaEmpresas";
import { AbaIndicadores } from "./AbaIndicadores";
import { AbaLancamentos } from "./AbaLancamentos";
import { AbaParecer } from "./AbaParecer";
import { AbaVisaoGeral } from "./AbaVisaoGeral";
import { CartaoSaldos } from "./CartaoSaldos";
import { CartoesMargem } from "./CartoesMargem";
import { JanelaOrigem } from "./JanelaOrigem";
import type { PedidoOrigem } from "./JanelaOrigem";
import { TabelaMatriz } from "./TabelaMatriz";
import type { ContextoBi } from "./contexto";

type AbaBi =
  | "geral"
  | "dre"
  | "dfc"
  | "conciliacao"
  | "comparar"
  | "empresas"
  | "indicadores"
  | "lancamentos"
  | "classificacao"
  | "parecer";
const PERIODO_PADRAO: Periodo = "ano";

function AbaRelatorio({ rel, c, aoClassificar }: { rel: TipoRelatorio; c: ContextoBi; aoClassificar: () => void }) {
  const [origem, setOrigem] = useState<PedidoOrigem | null>(null);
  const m = useConsulta(
    useCallback(async () => {
      const [matriz, contas, saldos] = await Promise.all([
        lerRelatorio(rel, c.ids, c.de, c.ate, c.elimina),
        lerContas(rel, c.ids, c.de, c.ate, c.elimina),
        rel === "dfc" ? lerSaldos(c.ids, c.de, c.ate) : Promise.resolve([]),
      ]);
      return {
        matriz,
        contas: montarContas(contas ?? [], matriz.meses),
        saldos:
          rel === "dfc"
            ? resumirSaldos(saldos ?? [], mesesDoPeriodo(c.de, c.ate < c.hoje ? c.ate : c.hoje), totalDe(matriz, "variacao_caixa"))
            : null,
      };
    }, [rel, c.ids, c.de, c.ate, c.elimina]),
  );
  if (m.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {m.erro}
      </p>
    );
  if (!m.dados) return <Esqueleto />;
  if (!temMovimento(m.dados.matriz))
    return (
      <EstadoVazio icone="grafico" titulo="Nada lançado neste período">
        Não há notas, contas ou lançamentos das empresas escolhidas entre {c.rotuloPeriodo}. Troque o período.
      </EstadoVazio>
    );
  const nc = totalDe(m.dados.matriz, "nao_classificado");
  return (
    <div className="space-y-3">
      {nc !== 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2">
            <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {Math.abs(nc).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} estão em &quot;Não classificado&quot;:
              categorias do Omie sem conta do plano ou lançadas no Omie como &quot;Contas a classificar&quot;. Clique no valor da linha para
              ver quais são{c.podeClassificar ? " e classifique-as." : " e peça à equipe MDC para classificar."}
            </span>
          </p>
          {c.podeClassificar && (
            <button type="button" className="btn shrink-0" onClick={aoClassificar}>
              <Icone nome="etiqueta" className="h-4 w-4" />
              Classificar agora
            </button>
          )}
        </div>
      )}
      {rel === "dre" && <CartoesMargem m={m.dados.matriz} />}
      <TabelaMatriz
        m={m.dados.matriz}
        rel={rel}
        titulo={rel === "dre" ? "DRE gerencial" : "Fluxo de caixa (DFC)"}
        c={c}
        contas={m.dados.contas}
        aoAbrir={setOrigem}
      />
      {rel === "dfc" && (
        <>
          <h3 className="text-[15px] font-semibold text-[var(--marca)]">Saldos dos bancos</h3>
          <CartaoSaldos r={m.dados.saldos} elimina={c.elimina} />
        </>
      )}
      {origem && <JanelaOrigem rel={rel} p={origem} c={c} aoFechar={() => setOrigem(null)} />}
    </div>
  );
}

export function PainelBi({
  grupo,
  escolhidas,
  aoTrocar,
  contextoBase,
}: {
  grupo: string;
  escolhidas: EmpresaBi[];
  aoTrocar: () => void;
  contextoBase: Pick<ContextoBi, "hoje" | "logoUrl" | "podeLancar" | "podeClassificar" | "avisar">;
}) {
  const [aba, setAba] = useState<AbaBi>("geral");
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_PADRAO);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>(escolhidas.map((e) => e.cliente_id));
  const [eliminar, setEliminar] = useState(escolhidas[0]?.eliminar_intragrupo ?? true);
  const intervalo = useMemo(() => periodoDoBi(periodo, contextoBase.hoje, de, ate), [periodo, contextoBase.hoje, de, ate]);
  const longo = periodoLongo(intervalo.de, intervalo.ate);
  const empresas = escolhidas.filter((e) => marcadas.includes(e.cliente_id));
  const ids = useMemo(() => empresas.map((e) => e.cliente_id), [empresas]);
  const quem = empresas.length === escolhidas.length && escolhidas.length > 1 ? grupo : empresas.map((e) => e.nome).join(", ");
  const rotuloPeriodo = `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate)}`;

  const c: ContextoBi = {
    ...contextoBase,
    grupo,
    empresas,
    ids,
    de: intervalo.de,
    ate: intervalo.ate,
    rotuloPeriodo,
    elimina: eliminar && ids.length > 1,
    quem,
  };

  function alternar(id: string) {
    if (marcadas.includes(id)) {
      if (marcadas.length === 1) return contextoBase.avisar("Deixe ao menos uma empresa marcada.", "atencao");
      setMarcadas(marcadas.filter((x) => x !== id));
    } else setMarcadas([...marcadas, id]);
  }

  const filtrosAtivos: FiltroAtivo[] = [
    ...(periodo !== PERIODO_PADRAO
      ? [
          {
            id: "periodo",
            rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
            aoTirar: () => setPeriodo(PERIODO_PADRAO),
          },
        ]
      : []),
    ...(empresas.length < escolhidas.length
      ? [
          {
            id: "empresas",
            rotulo: `Empresas: ${empresas.map((e) => e.nome).join(", ")}`,
            aoTirar: () => setMarcadas(escolhidas.map((e) => e.cliente_id)),
          },
        ]
      : []),
  ];

  const abas: { id: AbaBi; nome: string }[] = [
    { id: "geral", nome: "Visão geral" },
    { id: "dre", nome: "DRE" },
    { id: "dfc", nome: "Fluxo de caixa" },
    { id: "conciliacao", nome: "Resultado × caixa" },
    { id: "comparar", nome: "Comparar" },
    ...(escolhidas.length > 1 ? [{ id: "empresas" as const, nome: "Empresas" }] : []),
    { id: "indicadores", nome: "Indicadores" },
    { id: "lancamentos", nome: "Lançamentos" },
    ...(c.podeClassificar
      ? [
          { id: "parecer" as const, nome: "Parecer" },
          { id: "classificacao" as const, nome: "Classificação" },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
        <h2 className="flex-1 text-[18px] font-semibold text-[var(--marca)]">{escolhidas.length > 1 ? grupo : escolhidas[0]?.nome}</h2>
        <button type="button" className="btn" onClick={aoTrocar}>
          <Icone nome="voltar" className="h-4 w-4" />
          Trocar empresa
        </button>
      </div>

      <div className="space-y-4 print:hidden">
        <CartaoFiltros
          ativos={filtrosAtivos}
          aoLimpar={() => {
            setPeriodo(PERIODO_PADRAO);
            setMarcadas(escolhidas.map((e) => e.cliente_id));
          }}
        >
          <FiltroPeriodo
            periodo={periodo}
            de={de}
            ate={ate}
            aoMudar={(v) => {
              if (v.periodo) setPeriodo(v.periodo);
              if (v.de !== undefined) setDe(v.de);
              if (v.ate !== undefined) setAte(v.ate);
            }}
          />
          {escolhidas.length > 1 && (
            <fieldset className="campo min-w-0">
              <legend className="mb-1 text-[13px] font-medium">Empresas</legend>
              <div className="flex flex-wrap gap-2">
                {escolhidas.map((e) => {
                  const on = marcadas.includes(e.cliente_id);
                  return (
                    <button
                      key={e.cliente_id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => alternar(e.cliente_id)}
                      className={`chip flex items-center gap-1.5 border ${on ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-[var(--texto)]"}`}
                    >
                      <Icone nome={on ? "check" : "mais"} className="h-3.5 w-3.5" />
                      {e.nome}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {ids.length > 1 && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={eliminar} onChange={(e) => setEliminar(e.target.checked)} />
              Tirar vendas e pagamentos entre as empresas do grupo
            </label>
          )}
        </CartaoFiltros>

        <Abas rotulo="Partes do BI" itens={abas} valor={aba} aoMudar={setAba} />
      </div>

      {longo ? (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Escolha um período de até 3 anos.
        </p>
      ) : aba === "geral" ? (
        <AbaVisaoGeral c={c} />
      ) : aba === "dre" || aba === "dfc" ? (
        <AbaRelatorio key={aba} rel={aba} c={c} aoClassificar={() => setAba("classificacao")} />
      ) : aba === "conciliacao" ? (
        <AbaConciliacao c={c} />
      ) : aba === "parecer" ? (
        <AbaParecer c={c} />
      ) : aba === "classificacao" ? (
        <AbaClassificacao c={c} />
      ) : aba === "comparar" ? (
        <AbaComparar c={c} />
      ) : aba === "empresas" ? (
        <AbaEmpresas c={c} />
      ) : aba === "indicadores" ? (
        <AbaIndicadores c={c} />
      ) : (
        <AbaLancamentos c={c} />
      )}
    </div>
  );
}
