// Relatório de tarefas concluídas (molde 8.3.1): período em um clique, pessoas e setores; indicadores, barras por pessoa,
// resumo por pessoa e a lista de concluídas, com PDF e Excel iguais à tela. Os cálculos ficam em
// dominios/tarefas/relatorio.ts (testados) e a exportação em dominios/tarefas/exportarRelatorio.ts.
// O analista vê só o próprio relatório; gestor e administrador veem a equipe.
"use client";

import { useCallback, useMemo, useState } from "react";
import { MultiSelecao } from "@/components/ui/MultiSelecao";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { nomeCliente } from "@/dominios/clientes/nome";
import {
  diaDaConclusao,
  diasDeAtraso,
  filtrarPessoaSetor,
  fracaoNoPrazo,
  limitesDoPeriodo,
  resumirPorPessoa,
  SEM,
  situacaoDaConclusao,
  textoAtraso,
  textoPct,
  totalizar,
} from "@/dominios/tarefas/relatorio";
import type { Aberta, Concluida, PorPessoa } from "@/dominios/tarefas/relatorio";
import { exportarRelatorioPdf, exportarRelatorioXlsx } from "@/dominios/tarefas/exportarRelatorio";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";

export default function PaginaRelatorio() {
  return <Relatorio />;
}

const VERDE_OK = "#1B8263",
  OURO = "#C0892A";
const MOSTRAR = 500;
const ABERTAS = ["a_fazer", "em_andamento", "aguardando"];

function Relatorio() {
  const { org, eu, membros, setores, clientePorId, setorPorId, podeEditarCadastros } = useOrg();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const soEu = !podeEditarCadastros; // analista vê só o próprio relatório
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pessoasSel, setPessoasSel] = useState<string[]>([]);
  const [setorSel, setSetorSel] = useState<string[]>([]);
  const [foco, setFoco] = useState<string | null>(null);
  const [exportando, setExportando] = useState<"pdf" | "xlsx" | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  // tudo é lido por inteiro (lerTudo: o Supabase corta em 1.000 linhas sem avisar) e o período vale pelo dia da
  // organização (limitesDoPeriodo usa inicioDoDiaUtc com org.fuso)
  const consulta = useConsulta(
    useCallback(async () => {
      const sb = supabase();
      const { desde, antes } = limitesDoPeriodo(intervalo, org.fuso);
      const [feitas, abertas] = await Promise.all([
        lerTudo<Concluida>((i, f) => {
          let q = sb
            .from("tarefas")
            .select("id,titulo,cliente_id,setor_id,responsavel_id,prazo,concluida_em,competencia")
            .eq("org_id", org.id)
            .eq("status", "concluida");
          if (desde) q = q.gte("concluida_em", desde);
          if (antes) q = q.lt("concluida_em", antes);
          if (soEu) q = q.eq("responsavel_id", eu.user_id);
          return q.order("concluida_em").order("id").range(i, f);
        }),
        lerTudo<Aberta>((i, f) => {
          let q = sb.from("tarefas").select("responsavel_id,setor_id,prazo").eq("org_id", org.id).in("status", ABERTAS);
          if (soEu) q = q.eq("responsavel_id", eu.user_id);
          return q.order("id").range(i, f);
        }),
      ]);
      return { feitas: feitas.filter((t) => !!t.concluida_em), abertas };
    }, [org.id, org.fuso, intervalo, soEu, eu.user_id]),
  );

  const nomePessoa = useCallback(
    (id: string | null) => (id ? (membros.find((m) => m.user_id === id)?.nome ?? "Pessoa removida") : "Sem responsável"),
    [membros],
  );
  const pessoasFiltro = useMemo(() => (soEu ? [] : pessoasSel), [soEu, pessoasSel]);
  const feitas = useMemo(
    () => filtrarPessoaSetor(consulta.dados?.feitas ?? [], pessoasFiltro, setorSel),
    [consulta.dados, pessoasFiltro, setorSel],
  );
  const abertas = useMemo(
    () => filtrarPessoaSetor(consulta.dados?.abertas ?? [], pessoasFiltro, setorSel),
    [consulta.dados, pessoasFiltro, setorSel],
  );
  const porPessoa = useMemo(
    () => resumirPorPessoa(feitas, abertas, hoje, org.fuso, nomePessoa),
    [feitas, abertas, hoje, org.fuso, nomePessoa],
  );
  const tot = totalizar(porPessoa);
  const focoValido = foco && porPessoa.some((p) => p.id === foco) ? foco : null;
  const detalhe = focoValido ? feitas.filter((t) => (t.responsavel_id ?? SEM) === focoValido) : feitas;
  const max = Math.max(1, ...porPessoa.map((p) => p.total));
  const nomeFoco = focoValido ? nomePessoa(focoValido === SEM ? null : focoValido) : "";

  const rotuloPeriodo =
    intervalo.de || intervalo.ate ? `${fmtData(intervalo.de ?? null)} a ${fmtData(intervalo.ate ?? null)}` : "todo o histórico";
  const nomesSetores = setorSel.map((s) => (s === SEM ? "Sem setor" : (setorPorId(s)?.nome ?? "—")));
  const nomesPessoas = pessoasFiltro.map((p) => nomePessoa(p === SEM ? null : p));

  function limparFiltros() {
    setPeriodo("mes");
    setPessoasSel([]);
    setSetorSel([]);
    setFoco(null);
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "mes" && {
      id: "periodo",
      rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("mes"),
    },
    nomesPessoas.length > 0 && {
      id: "pessoas",
      rotulo: `Pessoas: ${nomesPessoas.length > 2 ? `${nomesPessoas.length} selecionadas` : nomesPessoas.join(", ")}`,
      aoTirar: () => setPessoasSel([]),
    },
    nomesSetores.length > 0 && {
      id: "setores",
      rotulo: `Setores: ${nomesSetores.length > 2 ? `${nomesSetores.length} selecionados` : nomesSetores.join(", ")}`,
      aoTirar: () => setSetorSel([]),
    },
    focoValido && { id: "foco", rotulo: `Lista de: ${nomeFoco}`, aoTirar: () => setFoco(null) },
  ].filter((f): f is FiltroAtivo => !!f);

  const titulo = soEu ? `Tarefas concluídas · ${eu.nome}` : "Tarefas concluídas por pessoa";
  const subtitulo = [
    `Período: ${rotuloPeriodo}`,
    nomesSetores.length && `setores: ${nomesSetores.join(", ")}`,
    nomesPessoas.length && `pessoas: ${nomesPessoas.join(", ")}`,
    focoValido && `lista de ${nomeFoco}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const tituloLista = focoValido ? `Tarefas concluídas por ${nomeFoco}` : "Tarefas concluídas no período";

  async function exportar(tipo: "pdf" | "xlsx") {
    setExportando(tipo);
    try {
      const dados = {
        titulo,
        subtitulo,
        arquivo: nomeArquivo("Relatorio-tarefas", intervalo.de ?? "inicio", "a", intervalo.ate ?? hoje),
        hoje,
        fuso: org.fuso,
        logoUrl: org.logo_url,
        soEu,
        porPessoa,
        totais: tot,
        tituloLista,
        lista: detalhe,
        nomeCliente: (id: string | null) => nomeCliente(clientePorId(id), "Interna"),
        nomePessoa,
        nomeSetor: (id: string | null) => setorPorId(id)?.nome ?? "",
      };
      await (tipo === "pdf" ? exportarRelatorioPdf(dados) : exportarRelatorioXlsx(dados));
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setExportando(null);
    }
  }

  const carregandoPrimeira = consulta.carregando && !consulta.dados;
  const pctTotal = fracaoNoPrazo(tot.noPrazo, tot.atrasadas);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Relatório de tarefas"
        descricao={
          soEu
            ? "Suas entregas no período: quantas, quantas no prazo e o que ainda está em aberto."
            : "Entregas de cada pessoa no período: quantas, quantas no prazo e o que ainda está em aberto."
        }
        acoes={
          <>
            <button
              className="btn"
              onClick={() => exportar("pdf")}
              disabled={!consulta.dados || !!exportando}
              title="Baixar o relatório em PDF"
            >
              <Icone nome="documento" className="h-4 w-4" />
              {exportando === "pdf" ? "Gerando…" : "PDF"}
            </button>
            <button
              className="btn"
              onClick={() => exportar("xlsx")}
              disabled={!consulta.dados || !!exportando}
              title="Baixar o relatório em Excel"
            >
              <Icone nome="planilha" className="h-4 w-4" />
              {exportando === "xlsx" ? "Gerando…" : "Excel"}
            </button>
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <FiltroPeriodo
          rotulo="Concluídas em"
          periodo={periodo}
          de={de}
          ate={ate}
          aoMudar={(v) => {
            if (v.periodo) setPeriodo(v.periodo);
            if (v.de !== undefined) setDe(v.de);
            if (v.ate !== undefined) setAte(v.ate);
          }}
        />
        {!soEu && (
          <div className="campo min-w-52">
            <span>Pessoas</span>
            <MultiSelecao
              rotulo="Pessoas"
              todos="Todas as pessoas"
              valor={pessoasSel}
              aoMudar={setPessoasSel}
              opcoes={[
                ...membros.filter((m) => m.papel !== "tv").map((m) => ({ id: m.user_id, nome: m.nome + (m.ativo ? "" : " (inativo)") })),
                { id: SEM, nome: "Sem responsável" },
              ]}
            />
          </div>
        )}
        <div className="campo min-w-48">
          <span>Setores</span>
          <MultiSelecao
            rotulo="Setores"
            todos="Todos os setores"
            valor={setorSel}
            aoMudar={setSetorSel}
            opcoes={[...setores.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor })), { id: SEM, nome: "Sem setor" }]}
          />
        </div>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {carregandoPrimeira ? (
        <Esqueleto indicadores={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador titulo="Concluídas" icone="check" tom="verde" valor={String(tot.total)} detalhe={`${tot.semPrazo} sem prazo`} />
            <Indicador
              titulo="No prazo"
              icone="alvo"
              tom="azul"
              valor={textoPct(pctTotal)}
              detalhe={`${tot.noPrazo} de ${tot.noPrazo + tot.atrasadas} com prazo`}
            />
            <Indicador
              titulo="Com atraso"
              icone="relogio"
              tom={tot.atrasadas ? "ambar" : "neutro"}
              valor={String(tot.atrasadas)}
              detalhe={tot.atrasadas ? `atraso médio ${textoAtraso(tot.diasAtrasoMedio)}` : "nenhuma"}
            />
            <Indicador
              titulo="Em aberto hoje"
              icone="lista"
              tom={tot.vencidas ? "vermelho" : "neutro"}
              valor={String(tot.abertas)}
              detalhe={`${tot.vencidas} com prazo vencido`}
            />
          </div>

          {porPessoa.length === 0 ? (
            <EstadoVazio
              icone="check"
              titulo="Nenhuma tarefa no período"
              acao={
                filtrosAtivos.length > 0 && (
                  <button className="btn" onClick={limparFiltros}>
                    <Icone nome="filtro" className="h-4 w-4" />
                    Limpar filtros
                  </button>
                )
              }
            >
              Não há tarefa concluída nem em aberto com esses filtros. Troque o período (por exemplo, Mês passado) ou tire os filtros de
              pessoa e setor.
            </EstadoVazio>
          ) : (
            <>
              <BarrasPorPessoa porPessoa={porPessoa} max={max} foco={focoValido} aoFocar={setFoco} />
              {!soEu && <ResumoPorPessoa porPessoa={porPessoa} tot={tot} aoFocar={setFoco} />}
              <ListaConcluidas
                titulo={tituloLista}
                lista={detalhe}
                soEu={soEu}
                fuso={org.fuso}
                nomeCli={(id) => nomeCliente(clientePorId(id), "Interna")}
                nomePessoa={nomePessoa}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function BarrasPorPessoa({
  porPessoa,
  max,
  foco,
  aoFocar,
}: {
  porPessoa: PorPessoa[];
  max: number;
  foco: string | null;
  aoFocar: (id: string | null) => void;
}) {
  return (
    <section className="cartao p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-[var(--marca)]">Concluídas por pessoa</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--texto-suave)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: VERDE_OK }} /> no prazo ou sem prazo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OURO }} /> com atraso
          </span>
        </div>
      </div>
      <p className="mb-2 text-xs text-[var(--texto-suave)]">Clique numa pessoa para ver só as tarefas dela na lista abaixo.</p>
      <ul className="space-y-1.5">
        {porPessoa.map((p) => {
          const ok = p.noPrazo + p.semPrazo;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => aoFocar(foco === p.id ? null : p.id)}
                aria-pressed={foco === p.id}
                className={`grid w-full grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--fundo)] sm:grid-cols-[minmax(0,180px)_1fr_auto] sm:gap-3 ${foco === p.id ? "bg-[var(--fundo)] ring-1 ring-[var(--destaque-escuro)]" : ""}`}
                title={`${p.nome}: ${p.total} concluída(s), ${p.noPrazo} no prazo, ${p.atrasadas} com atraso. Clique para ver as tarefas.`}
              >
                <span className="truncate">{p.nome}</span>
                <span className="flex h-4 overflow-hidden rounded-full bg-[var(--fundo)]">
                  <span
                    className="h-full transition-[width] duration-500"
                    style={{ width: `${(ok / max) * 100}%`, background: VERDE_OK }}
                  />
                  <span
                    className="h-full transition-[width] duration-500"
                    style={{ width: `${(p.atrasadas / max) * 100}%`, background: OURO }}
                  />
                </span>
                <span className="num text-right text-[13px] text-[var(--texto-suave)]">
                  <b className="text-[var(--marca)]">{p.total}</b>
                  <span className="hidden sm:inline"> · {textoPct(fracaoNoPrazo(p.noPrazo, p.atrasadas))} no prazo</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResumoPorPessoa({
  porPessoa,
  tot,
  aoFocar,
}: {
  porPessoa: PorPessoa[];
  tot: ReturnType<typeof totalizar>;
  aoFocar: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-[var(--marca)]">Resumo por pessoa</h2>
      <QuadroTabela rotulo="Resumo por pessoa">
        <thead>
          <tr>
            <th>Pessoa</th>
            <th className="text-right">Concluídas</th>
            <th className="text-right">No prazo</th>
            <th className="text-right">Com atraso</th>
            <th className="text-right">% no prazo</th>
            <th className="text-right">Atraso médio</th>
            <th className="text-right">Em aberto</th>
            <th className="text-right">Vencidas</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {porPessoa.map((p) => (
            <tr key={p.id}>
              <td className="celula-titulo font-medium">{p.nome}</td>
              <td data-rotulo="Concluídas" className="num text-right">
                {p.total}
              </td>
              <td data-rotulo="No prazo" className="num text-right">
                {p.noPrazo}
              </td>
              <td data-rotulo="Com atraso" className={`num text-right ${p.atrasadas ? "text-[var(--perigo)]" : ""}`}>
                {p.atrasadas}
              </td>
              <td data-rotulo="% no prazo" className="num text-right">
                {textoPct(fracaoNoPrazo(p.noPrazo, p.atrasadas))}
              </td>
              <td data-rotulo="Atraso médio" className="num text-right">
                {textoAtraso(p.diasAtrasoMedio)}
              </td>
              <td data-rotulo="Em aberto" className="num text-right">
                {p.abertas}
              </td>
              <td data-rotulo="Vencidas" className={`num text-right ${p.vencidas ? "text-[var(--perigo)]" : ""}`}>
                {p.vencidas}
              </td>
              <td className="celula-acoes text-right">
                <button
                  className="btn !min-h-8 !px-3"
                  onClick={() => aoFocar(p.id)}
                  disabled={!p.total}
                  title="Ver as concluídas desta pessoa"
                >
                  <Icone nome="olho" className="h-4 w-4" />
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="celula-titulo">Total</td>
            <td data-rotulo="Concluídas" className="num text-right">
              {tot.total}
            </td>
            <td data-rotulo="No prazo" className="num text-right">
              {tot.noPrazo}
            </td>
            <td data-rotulo="Com atraso" className="num text-right">
              {tot.atrasadas}
            </td>
            <td data-rotulo="% no prazo" className="num text-right">
              {textoPct(fracaoNoPrazo(tot.noPrazo, tot.atrasadas))}
            </td>
            <td data-rotulo="Atraso médio" className="num text-right">
              {textoAtraso(tot.diasAtrasoMedio)}
            </td>
            <td data-rotulo="Em aberto" className="num text-right">
              {tot.abertas}
            </td>
            <td data-rotulo="Vencidas" className="num text-right">
              {tot.vencidas}
            </td>
            <td />
          </tr>
        </tfoot>
      </QuadroTabela>
    </section>
  );
}

function ListaConcluidas({
  titulo,
  lista,
  soEu,
  fuso,
  nomeCli,
  nomePessoa,
}: {
  titulo: string;
  lista: Concluida[];
  soEu: boolean;
  fuso: string;
  nomeCli: (id: string | null) => string;
  nomePessoa: (id: string | null) => string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-[var(--marca)]">
        {titulo} <span className="text-sm font-normal text-[var(--texto-suave)]">({lista.length})</span>
      </h2>
      {lista.length === 0 ? (
        <EstadoVazio>Nenhuma tarefa concluída no período. Os números acima mostram o que ainda está em aberto.</EstadoVazio>
      ) : (
        <QuadroTabela
          rotulo={titulo}
          rodape={lista.length > MOSTRAR ? `Mostrando ${MOSTRAR} de ${lista.length}. O PDF e o Excel trazem todas.` : undefined}
        >
          <thead>
            <tr>
              <th>Concluída</th>
              <th>Tarefa</th>
              <th>Cliente</th>
              {!soEu && <th>Responsável</th>}
              <th>Prazo</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, MOSTRAR).map((t) => {
              const d = diasDeAtraso(t, fuso);
              return (
                <tr key={t.id}>
                  <td data-rotulo="Concluída" className="num whitespace-nowrap">
                    {fmtData(diaDaConclusao(t, fuso))}
                  </td>
                  <td className="celula-titulo min-w-56">{t.titulo}</td>
                  <td data-rotulo="Cliente" className="min-w-40 text-[var(--texto-suave)]">
                    {nomeCli(t.cliente_id)}
                  </td>
                  {!soEu && <td data-rotulo="Responsável">{nomePessoa(t.responsavel_id)}</td>}
                  <td data-rotulo="Prazo" className="num whitespace-nowrap">
                    {fmtData(t.prazo)}
                  </td>
                  <td data-rotulo="Situação">
                    <Chip tom={d === null ? "neutro" : d > 0 ? "ambar" : "verde"}>{situacaoDaConclusao(d)}</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </QuadroTabela>
      )}
    </section>
  );
}
