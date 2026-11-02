// Portal do Cliente › Resumo, Balanço/DRE/DFC, Balancete, Índices e Parecer: os fechamentos publicados pela MDC.
// Só lê o que está publicado (visões portal_*); o período escolhido vale para todas as abas.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { mesExtenso } from "@/lib/formato/datas";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { ArvoreBalancete } from "@/dominios/demonstrativos/componentes/ArvoreBalancete";
import { GradeIndices } from "@/dominios/demonstrativos/componentes/GradeIndices";
import { PainelResumo } from "@/dominios/demonstrativos/componentes/PainelResumo";
import { VisaoParecer } from "@/dominios/demonstrativos/componentes/VisaoParecer";
import { AbaDemonstracoes } from "@/dominios/demonstrativos/componentes/Demonstracoes";
import { BotaoPdf, estadoPdf } from "@/dominios/demonstrativos/componentes/BotaoPdf";
import { ExportarPeriodo } from "@/dominios/demonstrativos/componentes/ExportarPeriodo";
import { SeletorPeriodo, usePeriodo } from "@/dominios/demonstrativos/componentes/SeletorPeriodo";
import type { BalanceteReg, LinhaReg, ParecerReg } from "@/dominios/demonstrativos/tipos";
import type { EmpresaPortal } from "../tipos";

export type AbaDemonstrativo = "inicio" | "demonstracoes" | "balancete" | "indices" | "parecer";

/** Título e frase de cada aba (o que a pessoa vai encontrar ali, sem termo técnico). */
const TEXTOS: Record<AbaDemonstrativo, { titulo: string; descricao: string }> = {
  inicio: { titulo: "Resumo da empresa", descricao: "Como a empresa está no período escolhido, em gráficos simples." },
  demonstracoes: {
    titulo: "Balanço, DRE e fluxo de caixa",
    descricao: "As demonstrações oficiais: o que a empresa tem e deve, o resultado e o caminho do dinheiro.",
  },
  balancete: { titulo: "Balancete", descricao: "O saldo de cada conta da contabilidade. Toque numa conta para abrir os detalhes." },
  indices: { titulo: "Índices", descricao: "Números que mostram se a empresa paga as contas em dia, dá lucro e depende de bancos." },
  parecer: { titulo: "Parecer técnico", descricao: "A análise escrita e assinada pelo contador responsável da MDC." },
};

export function PortalDemonstrativos({ emp, aba }: { emp: EmpresaPortal; aba: AbaDemonstrativo }) {
  // detalhe do balancete-base escolhido (linhas e parecer), guardado junto com o id para não misturar meses
  const [linhasDe, setLinhasDe] = useState<{ base: string; linhas: LinhaReg[]; erro?: string } | null>(null);
  const [parecerDe, setParecerDe] = useState<{ base: string; parecer: ParecerReg | null; erro?: string } | null>(null);

  const consulta = useConsulta(
    useCallback(
      async () =>
        exigir(
          await supabase()
            .from("portal_balancetes")
            .select("*")
            .eq("cliente_id", emp.cliente_id)
            .eq("status", "publicado")
            .order("competencia"),
        ) as BalanceteReg[],
      [emp.cliente_id],
    ),
  );
  const historico = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const periodo = usePeriodo(historico, undefined, emp.cliente_id);
  // balancete-base do período (o do último mês): dele vêm o balancete detalhado, o parecer e o PDF assinado
  const atual = periodo.sel?.base;

  useEffect(() => {
    if (!atual) return;
    const sb = supabase();
    const base = atual.id;
    lerTudo<LinhaReg>((de, ate) =>
      sb.from("portal_balancete_linhas").select("*").eq("balancete_id", base).order("classificacao").order("id").range(de, ate),
    ).then(
      (linhas) => setLinhasDe({ base, linhas }),
      () => setLinhasDe({ base, linhas: [], erro: "Não foi possível abrir o balancete detalhado agora. Tente de novo em instantes." }),
    );
    sb.from("portal_pareceres")
      .select("*")
      .eq("balancete_id", base)
      .eq("status", "publicado")
      .order("versao", { ascending: false })
      .limit(1)
      .then(({ data, error }) =>
        setParecerDe({
          base,
          parecer: (data?.[0] as ParecerReg) ?? null,
          erro: error ? "Não foi possível abrir o parecer agora. Tente de novo em instantes." : undefined,
        }),
      );
  }, [atual]);
  const linhas = atual && linhasDe?.base === atual.id ? linhasDe.linhas : [];
  const parecer = atual && parecerDe?.base === atual.id ? parecerDe.parecer : undefined;
  const erroDetalhe = aba === "parecer" ? parecerDe?.erro : linhasDe?.erro;

  const anteriores = useMemo(() => undefined as Map<string, number> | undefined, []);
  const texto = TEXTOS[aba];
  const cabecalho = (acoes?: React.ReactNode) => <CabecalhoPagina titulo={texto.titulo} descricao={texto.descricao} acoes={acoes} />;

  if (consulta.erro && !consulta.dados)
    return (
      <div className="space-y-4">
        {cabecalho()}
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      </div>
    );
  if (!consulta.dados)
    return (
      <div className="space-y-4">
        {cabecalho()}
        <Esqueleto indicadores={aba === "inicio" ? 3 : 0} linhas={6} />
      </div>
    );
  if (!historico.length || !atual)
    return (
      <div className="space-y-4">
        {cabecalho()}
        <EstadoVazio icone="grafico" titulo="Fechamento em andamento">
          Assim que a MDC concluir e publicar o fechamento contábil, os gráficos e relatórios da sua empresa aparecem aqui. Você recebe um
          aviso no sino lá em cima.
        </EstadoVazio>
      </div>
    );

  return (
    <div className="space-y-4">
      {cabecalho()}
      <SeletorPeriodo historico={historico} periodo={periodo}>
        {periodo.sel && <ExportarPeriodo sel={periodo.sel} anterior={periodo.anterior} empresa={emp.nome_fantasia || emp.razao_social} />}
        <BotaoPdf
          balanceteId={atual.id}
          periodo={periodo.escolha}
          rotulo={periodo.sel?.rotulo}
          {...estadoPdf(historico, periodo.escolha, true)}
        />
      </SeletorPeriodo>
      {(aba === "balancete" || aba === "parecer") && periodo.sel && periodo.sel.escolha.visao !== "mensal" && (
        <p className="flex items-start gap-1.5 text-xs text-neutral-600">
          <Icone nome="info" className="mt-px h-3.5 w-3.5 shrink-0" />
          {aba === "balancete" ? "Balancete" : "Parecer"} de {mesExtenso(atual.competencia)}, o último mês de {periodo.sel.rotulo}.
        </p>
      )}
      {erroDetalhe && (aba === "balancete" || aba === "parecer") && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {erroDetalhe}
        </p>
      )}
      {aba === "inicio" && periodo.sel && <PainelResumo sel={periodo.sel} anterior={periodo.anterior} historico={historico} />}
      {aba === "demonstracoes" && periodo.sel && <AbaDemonstracoes sel={periodo.sel} anterior={periodo.anterior} />}
      {aba === "balancete" && <ArvoreBalancete linhas={linhas} anteriores={anteriores} />}
      {aba === "indices" && periodo.sel && <GradeIndices sel={periodo.sel} historico={historico} />}
      {aba === "parecer" &&
        (parecer === undefined ? (
          <Esqueleto indicadores={0} linhas={5} />
        ) : parecer ? (
          <VisaoParecer texto={parecer.texto} empresa={emp.razao_social} cnpj={emp.cnpj} />
        ) : (
          <EstadoVazio icone="escudo" titulo="Parecer em elaboração">
            O parecer técnico de {mesExtenso(atual.competencia)} ainda está sendo escrito pelo contador. Assim que for assinado, ele aparece
            aqui e você recebe um aviso.
          </EstadoVazio>
        ))}
    </div>
  );
}
