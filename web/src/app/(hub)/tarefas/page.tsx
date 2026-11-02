// Tarefas da equipe (molde 8.3.1): busca, situação e responsáveis à vista; setor, cliente e prazo em "Mais filtros".
// Indicadores clicáveis (atrasadas, vencem hoje, próximos 7 dias, concluídas), lista que vira cartões no celular ou
// quadro por situação, PDF e Excel do que está filtrado. A lista é viva (Supabase Realtime, useTarefas).
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { TarefaEditor } from "@/dominios/tarefas/componentes/TarefaEditor";
import { ListaTarefas, QuadroTarefas } from "@/dominios/tarefas/componentes/VisoesTarefas";
import { MultiSelecao } from "@/components/ui/MultiSelecao";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useTarefas } from "@/dominios/tarefas/useTarefas";
import { hojeISO } from "@/lib/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { nomePrioridade, nomeStatus } from "@/dominios/tarefas/tipos";
import type { Status, Tarefa } from "@/dominios/tarefas/tipos";
import { contarTarefas, estaAberta, FILTROS_SITUACAO, ordenarTarefas, passaSituacao, textoDoPrazo } from "@/dominios/tarefas/regras";
import type { FiltroSituacao } from "@/dominios/tarefas/regras";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { nomeCliente } from "@/dominios/clientes/nome";
import { CHAVES, gravarLocal, lerLocal, useEstadoLembrado } from "@/lib/armazenamentoLocal";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";

export default function PaginaTarefas() {
  return (
    <Suspense>
      <TarefasDaOrganizacao />
    </Suspense>
  );
}

/** Uma instância por organização: os filtros lembrados são lidos ao abrir (sem efeito que mexe no estado). */
function TarefasDaOrganizacao() {
  const { org } = useOrg();
  return <Tarefas key={org.id} />;
}

type Visao = "lista" | "quadro";

/** Filtros guardados neste navegador (setores e responsáveis), sem os que não existem mais. */
function filtrosLembrados(orgId: string, setoresOk: Set<string>, pessoasOk: Set<string>, padraoResp: string[]) {
  try {
    const f = JSON.parse(lerLocal(CHAVES.filtrosTarefas(orgId)) ?? "null") as { setores?: unknown; resps?: unknown } | null;
    return {
      setores: Array.isArray(f?.setores) ? (f.setores as string[]).filter((x) => setoresOk.has(x)) : [],
      resps: Array.isArray(f?.resps) ? (f.resps as string[]).filter((x) => pessoasOk.has(x)) : padraoResp,
    };
  } catch {
    return { setores: [], resps: padraoResp };
  }
}

function Tarefas() {
  const { org, eu, papel, setores, clientes, membros, setorPorId, clientePorId, nomeMembro } = useOrg();
  const { tarefas, carregando, erro, online, recarregar, atualizar } = useTarefas(org.id, org.fuso);
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const params = useSearchParams();

  const padraoResp = papel === "analista" ? [eu.user_id] : [];
  const [lembrados] = useState(() =>
    filtrosLembrados(
      org.id,
      new Set([...setores.map((x) => x.id), "_sem"]),
      new Set([...membros.filter((m) => m.ativo).map((m) => m.user_id), "_sem"]),
      padraoResp,
    ),
  );
  const clienteDaUrl = params.get("cliente");
  const [visao, setVisao] = useEstadoLembrado<Visao>(CHAVES.visaoTarefas, "lista", (v) => v === "lista" || v === "quadro");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao>(clienteDaUrl ? "todas" : "abertas");
  const [setorSel, setSetorSel] = useState<string[]>(clienteDaUrl ? [] : lembrados.setores);
  const [respSel, setRespSel] = useState<string[]>(clienteDaUrl ? [] : lembrados.resps);
  const [cliente, setCliente] = useState(clienteDaUrl ?? "");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [editando, setEditando] = useState<Tarefa | null | undefined>(params.get("nova") ? null : undefined);

  // atalhos da busca rápida com a tela já aberta (?cliente=<id> filtra, ?nova=1 abre o editor): ajuste durante a
  // renderização, o jeito recomendado pelo React para estado que depende de uma mudança de entrada
  const chaveParams = params.toString();
  const [paramsVistos, setParamsVistos] = useState(chaveParams);
  if (chaveParams !== paramsVistos) {
    setParamsVistos(chaveParams);
    aplicarAtalhos(params);
  }
  function aplicarAtalhos(p: ReadonlyURLSearchParams) {
    const cli = p.get("cliente");
    if (cli) {
      setCliente(cli);
      setSituacao("todas");
      setRespSel([]);
      setSetorSel([]);
    }
    if (p.get("nova")) setEditando(null);
  }

  useEffect(() => {
    if (papel === "tv") window.location.replace(caminho("/tv"));
  }, [papel]);

  useEffect(() => {
    gravarLocal(CHAVES.filtrosTarefas(org.id), JSON.stringify({ setores: setorSel, resps: respSel }));
  }, [org.id, setorSel, respSel]);

  const intervaloPrazo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  // tudo menos a situação: é a base dos indicadores (o número não muda quando se clica nele)
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (setorSel.length && !setorSel.includes(t.setor_id ?? "_sem")) return false;
      if (respSel.length && !respSel.includes(t.responsavel_id ?? "_sem")) return false;
      if (cliente && t.cliente_id !== cliente) return false;
      if (intervaloPrazo.de && (!t.prazo || t.prazo < intervaloPrazo.de)) return false;
      if (intervaloPrazo.ate && (!t.prazo || t.prazo > intervaloPrazo.ate)) return false;
      if (q) {
        const c = clientePorId(t.cliente_id);
        const alvo = `${t.titulo} ${t.descricao ?? ""} ${c?.razao_social ?? ""} ${c?.nome_fantasia ?? ""} ${c?.cnpj ?? ""}`;
        if (!alvo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tarefas, busca, setorSel, respSel, cliente, intervaloPrazo, clientePorId]);

  const contagem = useMemo(() => contarTarefas(base, hoje), [base, hoje]);
  const visiveis = useMemo(
    () => ordenarTarefas(base.filter((t) => passaSituacao(t, situacao, hoje, visao === "quadro"))),
    [base, situacao, hoje, visao],
  );

  async function mudarStatus(t: Tarefa, status: Status) {
    try {
      await atualizar(t.id, { status });
      if (status === "concluida") mostrar(`Tarefa concluída: ${t.titulo}`);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  const pessoas = membros.filter((m) => m.ativo && m.papel !== "tv");
  const opcoesResp = [
    { id: eu.user_id, nome: `${eu.nome} (eu)` },
    { id: "_sem", nome: "Sem responsável" },
    ...pessoas
      .filter((m) => m.user_id !== eu.user_id)
      .map((m) => ({ id: m.user_id, nome: m.nome, grupo: setorPorId(m.setor_id)?.nome ?? "Sem setor" }))
      .sort((x, y) => x.grupo.localeCompare(y.grupo) || x.nome.localeCompare(y.nome)),
  ];
  const opcoesSetor = [...setores.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor })), { id: "_sem", nome: "Sem setor" }];
  const nomes = (ids: string[], opcoes: { id: string; nome: string }[]) =>
    ids.length > 2 ? `${ids.length} selecionados` : ids.map((id) => opcoes.find((o) => o.id === id)?.nome ?? "—").join(", ");
  const nomeSituacao = FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome ?? "";
  const rotuloPrazo =
    periodo === "escolher" ? `${fmtData(de || null)} a ${fmtData(ate || null)}` : (PERIODOS.find((p) => p.id === periodo)?.nome ?? "");

  function limparFiltros() {
    setBusca("");
    setSituacao("abertas");
    setRespSel([]);
    setSetorSel([]);
    setCliente("");
    setPeriodo("tudo");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    situacao !== "abertas" && { id: "situacao", rotulo: `Situação: ${nomeSituacao}`, aoTirar: () => setSituacao("abertas") },
    respSel.length > 0 && { id: "resp", rotulo: `Responsável: ${nomes(respSel, opcoesResp)}`, aoTirar: () => setRespSel([]) },
    setorSel.length > 0 && { id: "setor", rotulo: `Setor: ${nomes(setorSel, opcoesSetor)}`, aoTirar: () => setSetorSel([]) },
    cliente && { id: "cliente", rotulo: `Cliente: ${nomeCliente(clientePorId(cliente))}`, aoTirar: () => setCliente("") },
    periodo !== "tudo" && { id: "prazo", rotulo: `Prazo: ${rotuloPrazo}`, aoTirar: () => setPeriodo("tudo") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const alternar = (f: FiltroSituacao) => setSituacao(situacao === f ? "abertas" : f);
  const resumo = contagem.atrasadas
    ? `${contagem.atrasadas} tarefa(s) atrasada(s) e ${contagem.hoje} vencendo hoje, de ${contagem.abertas} em aberto neste filtro.`
    : contagem.abertas
      ? `Nada atrasado. ${contagem.abertas} tarefa(s) em aberto neste filtro${contagem.hoje ? `, ${contagem.hoje} vencendo hoje` : ""}.`
      : "";
  const notaFechadas =
    situacao === "concluidas" || situacao === "canceladas" || situacao === "todas"
      ? "Concluídas e canceladas: só as mexidas nos últimos 45 dias. Para períodos maiores, use Tarefas › Relatórios."
      : undefined;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Tarefas
            <span title={online ? "A lista se atualiza sozinha quando alguém muda uma tarefa" : "Reconectando…"}>
              <Chip tom={online ? "verde" : "neutro"}>{online ? "Ao vivo" : "Reconectando"}</Chip>
            </span>
          </span>
        }
        descricao="Rotinas e tarefas da equipe por cliente: o que está atrasado, o que vence hoje e o que já foi feito."
        acoes={
          <>
            <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm" role="group" aria-label="Forma de ver">
              {(["lista", "quadro"] as Visao[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisao(v)}
                  aria-pressed={visao === v}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${visao === v ? "bg-[var(--marca)] text-white" : ""}`}
                >
                  <Icone nome={v === "lista" ? "lista" : "grade"} className="h-4 w-4" />
                  {v === "lista" ? "Lista" : "Quadro"}
                </button>
              ))}
            </div>
            <BotoesExportar
              vazio={!visiveis.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Tarefas",
                subtitulo: [
                  nomeSituacao,
                  ...filtrosAtivos.filter((f) => f.id !== "situacao").map((f) => f.rotulo),
                  `${visiveis.length} tarefa(s)`,
                  `situação em ${fmtData(hoje)}`,
                ].join(" · "),
                arquivo: nomeArquivo("Tarefas", nomeSituacao, hoje),
                logoUrl: org.logo_url,
                linhas: visiveis,
                colunas: [
                  { titulo: "Prazo", valor: (t) => (t.prazo ? fmtData(t.prazo) : ""), peso: 0.9, largura: 12 },
                  { titulo: "Tarefa", valor: (t) => t.titulo, peso: 3, largura: 44 },
                  { titulo: "Cliente", valor: (t) => nomeCliente(clientePorId(t.cliente_id), "Interna"), peso: 2.2, largura: 34 },
                  { titulo: "Competência", valor: (t) => (t.competencia ? fmtCompetencia(t.competencia) : ""), peso: 0.9, largura: 12 },
                  { titulo: "Setor", valor: (t) => setorPorId(t.setor_id)?.nome ?? "", peso: 1.1, largura: 16 },
                  { titulo: "Responsável", valor: (t) => nomeMembro(t.responsavel_id), peso: 1.6, largura: 24 },
                  { titulo: "Prioridade", valor: (t) => nomePrioridade(t.prioridade), peso: 0.9, largura: 11 },
                  { titulo: "Situação", valor: (t) => nomeStatus(t.status), peso: 1, largura: 14 },
                  {
                    titulo: "Prazo hoje",
                    valor: (t) => (estaAberta(t.status) ? textoDoPrazo(t.prazo, hoje) : ""),
                    peso: 1.2,
                    largura: 16,
                    alerta: (t) => estaAberta(t.status) && !!t.prazo && t.prazo < hoje,
                  },
                ],
              })}
            />
            <button className="btn-primario" onClick={() => setEditando(null)}>
              <Icone nome="mais" className="h-4 w-4" />
              Nova tarefa
            </button>
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" placeholder="Tarefa, cliente ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}>
            {FILTROS_SITUACAO.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="campo min-w-52">
          <span>Responsável</span>
          <MultiSelecao rotulo="Responsável" todos="Todos os responsáveis" valor={respSel} aoMudar={setRespSel} opcoes={opcoesResp} />
        </div>
        <MaisFiltros emUso={(setorSel.length ? 1 : 0) + (cliente ? 1 : 0) + (periodo !== "tudo" ? 1 : 0)}>
          <div className="campo min-w-48">
            <span>Setor</span>
            <MultiSelecao rotulo="Setor" todos="Todos os setores" valor={setorSel} aoMudar={setSetorSel} opcoes={opcoesSetor} />
          </div>
          <label className="campo campo-largo">
            <span>Cliente</span>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeCliente(c)}
                  {c.ativo ? "" : " (inativo)"}
                </option>
              ))}
            </select>
          </label>
          <FiltroPeriodo
            rotulo="Prazo"
            periodo={periodo}
            de={de}
            ate={ate}
            aoMudar={(v) => {
              if (v.periodo) setPeriodo(v.periodo);
              if (v.de !== undefined) setDe(v.de);
              if (v.ate !== undefined) setAte(v.ate);
            }}
          />
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {carregando ? (
        <Esqueleto indicadores={4} />
      ) : (
        <>
          {resumo && <p className="text-sm text-[var(--texto)]">{resumo}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Atrasadas"
              icone="alerta"
              valor={String(contagem.atrasadas)}
              detalhe="prazo já passou"
              tom={contagem.atrasadas ? "vermelho" : "neutro"}
              ativo={situacao === "atrasadas"}
              aoClicar={() => alternar("atrasadas")}
            />
            <Indicador
              titulo="Vencem hoje"
              icone="relogio"
              valor={String(contagem.hoje)}
              detalhe={fmtData(hoje)}
              tom={contagem.hoje ? "ambar" : "neutro"}
              ativo={situacao === "hoje"}
              aoClicar={() => alternar("hoje")}
            />
            <Indicador
              titulo="Próximos 7 dias"
              icone="calendario"
              valor={String(contagem.semana)}
              detalhe="de hoje a uma semana"
              tom="azul"
              ativo={situacao === "semana"}
              aoClicar={() => alternar("semana")}
            />
            <Indicador
              titulo="Concluídas"
              icone="check"
              valor={String(contagem.concluidas)}
              detalhe="últimos 45 dias"
              tom="verde"
              ativo={situacao === "concluidas"}
              aoClicar={() => alternar("concluidas")}
            />
          </div>

          {!visiveis.length && visao === "lista" ? (
            <Vazio
              semNenhuma={!tarefas.length}
              situacao={situacao}
              comFiltros={filtrosAtivos.length > 0}
              aoLimpar={limparFiltros}
              aoCriar={() => setEditando(null)}
            />
          ) : visao === "lista" ? (
            <ListaTarefas
              tarefas={visiveis}
              abrir={setEditando}
              mudarStatus={mudarStatus}
              fuso={org.fuso}
              setorPorId={setorPorId}
              clientePorId={clientePorId}
              nomeMembro={nomeMembro}
              rodape={notaFechadas}
            />
          ) : (
            <QuadroTarefas
              tarefas={visiveis}
              abrir={setEditando}
              mudarStatus={mudarStatus}
              fuso={org.fuso}
              setorPorId={setorPorId}
              clientePorId={clientePorId}
              nomeMembro={nomeMembro}
            />
          )}
        </>
      )}

      {editando !== undefined && <TarefaEditor tarefa={editando} aoFechar={() => setEditando(undefined)} aoSalvar={recarregar} />}
    </div>
  );
}

/** Lista vazia: ensina o próximo passo (criar a primeira, comemorar o "nada atrasado" ou limpar os filtros). */
function Vazio({
  semNenhuma,
  situacao,
  comFiltros,
  aoLimpar,
  aoCriar,
}: {
  semNenhuma: boolean;
  situacao: FiltroSituacao;
  comFiltros: boolean;
  aoLimpar: () => void;
  aoCriar: () => void;
}) {
  const criar = (
    <button className="btn-primario" onClick={aoCriar}>
      <Icone nome="mais" className="h-4 w-4" />
      Nova tarefa
    </button>
  );
  const limpar = (
    <button className="btn" onClick={aoLimpar}>
      <Icone nome="filtro" className="h-4 w-4" />
      Limpar filtros
    </button>
  );
  if (semNenhuma)
    return (
      <EstadoVazio icone="check" titulo="Nenhuma tarefa ainda" acao={criar}>
        Crie a primeira tarefa aqui. As rotinas do mês (DCTFWeb, folha, SPED…) nascem sozinhas a partir dos modelos em Tarefas ›
        Configurações.
      </EstadoVazio>
    );
  if (situacao === "atrasadas" || situacao === "hoje")
    return (
      <EstadoVazio
        icone="check"
        titulo={situacao === "atrasadas" ? "Nenhuma tarefa atrasada" : "Nada vence hoje"}
        acao={comFiltros ? limpar : undefined}
      >
        Tudo em dia neste filtro. Veja as tarefas dos próximos 7 dias ou volte para todas as abertas.
      </EstadoVazio>
    );
  return (
    <EstadoVazio icone="filtro" titulo="Nada neste filtro" acao={comFiltros ? limpar : criar}>
      {comFiltros
        ? "Troque a situação, o responsável ou o prazo, ou limpe os filtros para ver tudo."
        : "Não há tarefas em aberto. Crie uma nova quando precisar."}
    </EstadoVazio>
  );
}
