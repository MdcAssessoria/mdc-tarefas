// Relatórios (módulo próprio): painel de relatórios gerenciais da empresa escolhida, a partir do que já está no
// Financeiro. Resultado de caixa (DRE gerencial por grupo e categoria), fluxo realizado x previsto, contas pagas e
// recebidas e despesas por centro de custo. Todos com período em um clique, PDF e Excel (contas em relatorios.ts).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { FiltroPeriodo } from "@/dominios/financeiro/componentes/Comuns";
import { VisaoCentros, VisaoFluxo, VisaoPagos, VisaoResultado } from "@/dominios/financeiro/componentes/RelatoriosVisoes";
import type { BaseVisao } from "@/dominios/financeiro/componentes/RelatoriosVisoes";
import {
  lerBaixas,
  lerCategorias,
  lerCentros,
  lerContas,
  lerPessoas,
  lerTitulos,
  lerTitulosPorId,
} from "@/dominios/financeiro/leituras";
import { fluxoPorMes, linhasDoResultado, pagosERecebidos, porCentroDeCusto, resultadoDeCaixa } from "@/dominios/financeiro/relatorios";
import { intervaloDoPeriodo, PERIODOS } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/dominios/financeiro/exportar";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";

type Rel = "resultado" | "fluxo" | "pagos" | "centros";
const RELATORIOS: { id: Rel; nome: string; texto: string; icone: string }[] = [
  { id: "resultado", nome: "Resultado de caixa", texto: "Receitas e despesas por grupo e categoria (DRE gerencial)", icone: "grafico" },
  { id: "fluxo", nome: "Realizado x previsto", texto: "O que era para entrar e sair e o que entrou e saiu, mês a mês", icone: "tendencia" },
  { id: "pagos", nome: "Pagas e recebidas", texto: "Cada pagamento e recebimento do período", icone: "check" },
  { id: "centros", nome: "Centros de custo", texto: "Quanto cada área, loja ou obra gastou e trouxe", icone: "etiqueta" },
];

export default function PaginaRelatorios() {
  const { org } = useOrg();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [rel, setRel] = useState<Rel>("resultado");
  const [periodo, setPeriodo] = useState<Periodo>("ano");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const id = cliente.id;
      const [categorias, centros, pessoas, contas, baixas, pagar, receber] = await Promise.all([
        lerCategorias(id),
        lerCentros(id),
        lerPessoas(id),
        lerContas(id),
        lerBaixas(id, intervalo),
        lerTitulos(id, "pagar", intervalo),
        lerTitulos(id, "receber", intervalo),
      ]);
      const titulos = await lerTitulosPorId(baixas.map((b) => b.titulo_id));
      return { categorias, centros, pessoas, contas, baixas, titulos, doPeriodo: [...pagar, ...receber] };
    }, [cliente, intervalo]),
  );
  const d = consulta.dados;

  const calc = useMemo(() => {
    if (!d) return null;
    const titulos = new Map(d.titulos.map((t) => [t.id, t]));
    const categorias = new Map(d.categorias.map((c) => [c.id, c]));
    const resultado = resultadoDeCaixa(d.baixas, titulos, categorias);
    return {
      resultado,
      linhasResultado: linhasDoResultado(resultado),
      fluxo: fluxoPorMes(d.baixas, titulos, d.doPeriodo, intervalo),
      pagos: pagosERecebidos(d.baixas, titulos),
      centros: porCentroDeCusto(d.baixas, titulos),
    };
  }, [d, intervalo]);

  const nomes = useMemo(() => {
    const p = new Map((d?.pessoas ?? []).map((x) => [x.id, x.nome]));
    const c = new Map((d?.categorias ?? []).map((x) => [x.id, x.nome]));
    const b = new Map((d?.contas ?? []).map((x) => [x.id, x.nome]));
    const cc = new Map((d?.centros ?? []).map((x) => [x.id, x.codigo ? `${x.codigo} · ${x.nome}` : x.nome]));
    return {
      pessoa: (id: string | null) => (id ? (p.get(id) ?? "") : ""),
      categoria: (id: string) => c.get(id) ?? "Sem categoria",
      conta: (id: string) => b.get(id) ?? "—",
      centro: (id: string) => (id ? (cc.get(id) ?? "Centro removido") : "Sem centro de custo"),
    };
  }, [d]);

  const rotuloPeriodo =
    intervalo.de || intervalo.ate ? `${fmtData(intervalo.de ?? "") || "início"} a ${fmtData(intervalo.ate ?? "") || "hoje"}` : "Todo o período";
  const base: BaseVisao = {
    subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${rotuloPeriodo}`,
    arquivo: (nome) => nomeArquivo(nome, cliente ? nomeCliente(cliente) : "", hoje),
    logoUrl: org.logo_url,
    avisar: mostrar,
  };
  const filtrosAtivos: FiltroAtivo[] =
    periodo !== "ano"
      ? [
          {
            id: "periodo",
            rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
            aoTirar: () => setPeriodo("ano"),
          },
        ]
      : [];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Relatórios gerenciais da empresa a partir das contas pagas, recebidas e em aberto. Escolha o relatório e o período."
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={() => setPeriodo("ano")}>
        <EscolhaCliente financeiro={financeiro} />
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
      </CartaoFiltros>

      <nav aria-label="Relatórios disponíveis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {RELATORIOS.map((r) => {
          const ativo = rel === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRel(r.id)}
              aria-pressed={ativo}
              className={`cartao flex items-start gap-3 p-3.5 text-left transition-colors sm:p-4 ${
                ativo ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "hover:border-[var(--destaque-escuro)]"
              }`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ativo ? "bg-white/10 text-[var(--destaque)]" : "bg-[var(--fundo)] text-[var(--marca)]"}`}
                aria-hidden="true"
              >
                <Icone nome={r.icone} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className={`block text-[14px] font-semibold leading-tight ${ativo ? "text-white" : "text-[var(--marca)]"}`}>{r.nome}</span>
                <span className={`mt-0.5 hidden text-xs sm:block ${ativo ? "text-[var(--nevoa)]" : "text-[var(--texto-suave)]"}`}>{r.texto}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {!cliente ? (
        <EstadoVazio icone="grafico" titulo="Escolha a empresa">
          Escolha a empresa nos filtros acima para ver os relatórios dela.
        </EstadoVazio>
      ) : !calc ? (
        <Esqueleto />
      ) : rel === "resultado" ? (
        <VisaoResultado r={calc.resultado} linhas={calc.linhasResultado} base={base} />
      ) : rel === "fluxo" ? (
        <VisaoFluxo meses={calc.fluxo} base={base} />
      ) : rel === "pagos" ? (
        <VisaoPagos linhas={calc.pagos} nomes={nomes} base={base} />
      ) : (
        <VisaoCentros linhas={calc.centros} nomeCentro={nomes.centro} base={base} />
      )}
    </div>
  );
}
