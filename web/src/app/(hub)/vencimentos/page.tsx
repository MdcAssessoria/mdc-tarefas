// Vencimentos acompanhados pela MDC (certificados, procurações, alvarás, licenças, contratos), no molde 8.3.1:
// busca, prazo e tipo à vista; período do vencimento e responsável em "Mais filtros"; indicadores clicáveis; lista que
// vira cartões no celular; PDF e Excel do que está filtrado. Renovar e encerrar em janelas (nada se apaga).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { caminho } from "@/lib/caminho";
import { nomeCliente } from "@/dominios/clientes/nome";
import { nomeTipo, TIPOS_VENC } from "@/dominios/vencimentos/tipos";
import type { Vencimento } from "@/dominios/vencimentos/tipos";
import { contarVencimentos, diasParaVencer, FILTROS_PRAZO, passaPrazo, situacaoDoVencimento } from "@/dominios/vencimentos/regras";
import type { FiltroPrazo } from "@/dominios/vencimentos/regras";
import { EditorVencimento, JanelaRenovar } from "@/dominios/vencimentos/componentes/JanelasVencimento";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";

export default function PaginaVencimentos() {
  return <Vencimentos />;
}

type Janela = { tipo: "novo" } | { tipo: "editar"; i: Vencimento } | { tipo: "renovar"; i: Vencimento };

function Vencimentos() {
  const { org, clientes, clientePorId, nomeMembro, membros, pode } = useOrg();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const podeOperar = pode("vencimentos", "operar");
  const [busca, setBusca] = useState("");
  const [prazo, setPrazo] = useState<FiltroPrazo>("padrao");
  const [tipo, setTipo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(
      async () =>
        lerTudo<Vencimento>((i, f) =>
          supabase().from("venc_itens").select("*").eq("org_id", org.id).eq("status", "ativo").order("vence_em").order("id").range(i, f),
        ),
      [org.id],
    ),
  );
  const nomeCli = useCallback((id: string | null) => nomeCliente(clientePorId(id), "MDC"), [clientePorId]);

  // tudo menos o prazo: base dos indicadores (o número não muda quando se clica nele)
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (consulta.dados ?? []).filter((i) => {
      if (tipo && i.tipo !== tipo) return false;
      if (responsavel && (i.responsavel_id ?? "_sem") !== responsavel) return false;
      if (intervalo.de && i.vence_em < intervalo.de) return false;
      if (intervalo.ate && i.vence_em > intervalo.ate) return false;
      if (q) {
        const c = clientePorId(i.cliente_id);
        const alvo = `${c?.razao_social ?? "MDC"} ${c?.nome_fantasia ?? ""} ${c?.cnpj ?? ""} ${i.descricao ?? ""} ${nomeTipo(i.tipo)}`;
        if (!alvo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [consulta.dados, busca, tipo, responsavel, intervalo, clientePorId]);
  const contagem = useMemo(() => contarVencimentos(base, hoje), [base, hoje]);
  const lista = useMemo(() => base.filter((i) => passaPrazo(diasParaVencer(i.vence_em, hoje), prazo)), [base, prazo, hoje]);

  const nomePrazo = FILTROS_PRAZO.find((x) => x.id === prazo)?.nome ?? "";
  const rotuloPeriodo =
    periodo === "escolher" ? `${fmtData(de || null)} a ${fmtData(ate || null)}` : (PERIODOS.find((p) => p.id === periodo)?.nome ?? "");
  function limparFiltros() {
    setBusca("");
    setPrazo("padrao");
    setTipo("");
    setResponsavel("");
    setPeriodo("tudo");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    prazo !== "padrao" && { id: "prazo", rotulo: `Prazo: ${nomePrazo}`, aoTirar: () => setPrazo("padrao") },
    tipo && { id: "tipo", rotulo: `Tipo: ${nomeTipo(tipo)}`, aoTirar: () => setTipo("") },
    responsavel && {
      id: "resp",
      rotulo: `Responsável: ${responsavel === "_sem" ? "Sem responsável" : nomeMembro(responsavel)}`,
      aoTirar: () => setResponsavel(""),
    },
    periodo !== "tudo" && { id: "periodo", rotulo: `Vence em: ${rotuloPeriodo}`, aoTirar: () => setPeriodo("tudo") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);
  const alternar = (f: FiltroPrazo) => setPrazo(prazo === f ? "padrao" : f);

  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      consulta.recarregar();
    }
  }

  const novo = podeOperar && (
    <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
      <Icone nome="mais" className="h-4 w-4" />
      Novo vencimento
    </button>
  );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Vencimentos"
        descricao="Certificados digitais, procurações, alvarás, licenças e contratos dos clientes, com aviso antes de vencer."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Vencimentos",
                subtitulo: [
                  nomePrazo,
                  ...filtrosAtivos.filter((f) => f.id !== "prazo").map((f) => f.rotulo),
                  `${lista.length} item(ns)`,
                  `situação em ${fmtData(hoje)}`,
                ].join(" · "),
                arquivo: nomeArquivo("Vencimentos", nomePrazo, hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Vence em", valor: (i) => fmtData(i.vence_em), peso: 0.9, largura: 12 },
                  {
                    titulo: "Situação",
                    valor: (i) => situacaoDoVencimento(diasParaVencer(i.vence_em, hoje)).texto,
                    peso: 1.1,
                    largura: 18,
                    alerta: (i) => diasParaVencer(i.vence_em, hoje) < 0,
                  },
                  { titulo: "Tipo", valor: (i) => nomeTipo(i.tipo), peso: 1.4, largura: 26 },
                  { titulo: "Cliente", valor: (i) => nomeCli(i.cliente_id), peso: 2.2, largura: 36 },
                  { titulo: "Descrição", valor: (i) => i.descricao ?? "", peso: 2, largura: 32 },
                  { titulo: "Responsável", valor: (i) => nomeMembro(i.responsavel_id), peso: 1.4, largura: 24 },
                  { titulo: "No portal", valor: (i) => (i.visivel_cliente ? "Sim" : "Não"), peso: 0.7, largura: 10 },
                ],
              })}
            />
            <a className="btn" href={caminho("/vencimentos/certificados")} title="Certificados do cofre do HUB e do Ledgra Link">
              <Icone nome="escudo" className="h-4 w-4" />
              Certificados digitais
            </a>
            {novo}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" placeholder="Cliente, CNPJ ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="campo">
          <span>Prazo</span>
          <select value={prazo} onChange={(e) => setPrazo(e.target.value as FiltroPrazo)}>
            {FILTROS_PRAZO.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPOS_VENC.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <MaisFiltros emUso={(responsavel ? 1 : 0) + (periodo !== "tudo" ? 1 : 0)}>
          <FiltroPeriodo
            rotulo="Vence em"
            periodo={periodo}
            de={de}
            ate={ate}
            aoMudar={(v) => {
              if (v.periodo) setPeriodo(v.periodo);
              if (v.de !== undefined) setDe(v.de);
              if (v.ate !== undefined) setAte(v.ate);
            }}
          />
          <label className="campo">
            <span>Responsável</span>
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">Todos</option>
              {membros
                .filter((m) => m.ativo && m.papel !== "tv")
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome}
                  </option>
                ))}
              <option value="_sem">Sem responsável</option>
            </select>
          </label>
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Vencidos"
              icone="alerta"
              valor={String(contagem.vencidos)}
              detalhe="precisam de renovação"
              tom={contagem.vencidos ? "vermelho" : "neutro"}
              ativo={prazo === "vencidos"}
              aoClicar={() => alternar("vencidos")}
            />
            <Indicador
              titulo="Em até 7 dias"
              icone="relogio"
              valor={String(contagem.d7)}
              detalhe="vencem nesta semana"
              tom={contagem.d7 ? "ambar" : "neutro"}
              ativo={prazo === "7"}
              aoClicar={() => alternar("7")}
            />
            <Indicador
              titulo="Em até 30 dias"
              icone="calendario"
              valor={String(contagem.d30)}
              detalhe="já com tarefa de renovação"
              tom="azul"
              ativo={prazo === "30"}
              aoClicar={() => alternar("30")}
            />
            <Indicador
              titulo="Em até 60 dias"
              icone="calendario"
              valor={String(contagem.d60)}
              detalhe="primeiro aviso no sino"
              tom="neutro"
              ativo={prazo === "60"}
              aoClicar={() => alternar("60")}
            />
          </div>

          {!lista.length ? (
            consulta.dados?.length ? (
              <EstadoVazio
                icone="filtro"
                titulo={prazo === "vencidos" ? "Nenhum vencimento vencido" : "Nada neste filtro"}
                acao={
                  <button className="btn" onClick={limparFiltros}>
                    <Icone nome="filtro" className="h-4 w-4" />
                    Limpar filtros
                  </button>
                }
              >
                Troque o prazo ou o tipo, ou limpe os filtros para ver todos os vencimentos acompanhados.
              </EstadoVazio>
            ) : (
              <EstadoVazio
                icone="relogio"
                titulo="Nenhum vencimento cadastrado"
                acao={
                  podeOperar && (
                    <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
                      <Icone nome="mais" className="h-4 w-4" />
                      Cadastrar o primeiro
                    </button>
                  )
                }
              >
                Cadastre os certificados digitais, procurações e alvarás dos clientes. O HUB avisa antes de vencer e cria a tarefa de
                renovação.
              </EstadoVazio>
            )
          ) : (
            <QuadroTabela rotulo="Vencimentos">
              <thead>
                <tr>
                  <th>Cliente e descrição</th>
                  <th>Tipo</th>
                  <th>Vence em</th>
                  <th>Situação</th>
                  <th>Responsável</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => {
                  const s = situacaoDoVencimento(diasParaVencer(i.vence_em, hoje));
                  return (
                    <tr key={i.id}>
                      <td className="celula-titulo min-w-56">
                        {nomeCli(i.cliente_id)}
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {i.descricao || "Sem descrição"}
                          {i.tarefa_id && " · tarefa de renovação aberta"}
                        </span>
                      </td>
                      <td data-rotulo="Tipo">{nomeTipo(i.tipo)}</td>
                      <td data-rotulo="Vence em" className="num whitespace-nowrap">
                        {fmtData(i.vence_em)}
                      </td>
                      <td data-rotulo="Situação">
                        <Chip tom={s.tom}>{s.texto}</Chip>
                      </td>
                      <td data-rotulo="Responsável">{nomeMembro(i.responsavel_id)}</td>
                      <td className="celula-acoes whitespace-nowrap text-right">
                        {podeOperar && (
                          <div className="flex justify-end gap-1">
                            <button
                              className="btn !min-h-8 !px-3"
                              onClick={() => setJanela({ tipo: "renovar", i })}
                              title="Informar a nova data depois de renovar"
                            >
                              <Icone nome="check" className="h-4 w-4" />
                              Renovado
                            </button>
                            <button
                              className="btn !min-h-8 !px-3"
                              onClick={() => setJanela({ tipo: "editar", i })}
                              title="Editar ou encerrar"
                            >
                              <Icone nome="editar" className="h-4 w-4" />
                              Editar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}

      <p className="flex items-start gap-2 text-xs text-[var(--texto-suave)]">
        <Icone nome="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Avisos automáticos no sino aos 60, 30 e 7 dias e no dia do vencimento. Aos 30 dias nasce a tarefa “Renovar…” em Tarefas. Ao marcar
          como renovado, informe a nova data: o próximo vencimento é criado e a tarefa é concluída.
        </span>
      </p>

      {(janela?.tipo === "novo" || janela?.tipo === "editar") && (
        <EditorVencimento
          item={janela.tipo === "editar" ? janela.i : null}
          clientes={clientes.filter((c) => c.ativo)}
          membros={membros.filter((m) => m.ativo && m.papel !== "tv")}
          podeEncerrar={pode("vencimentos", "gerir")}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
      {janela?.tipo === "renovar" && (
        <JanelaRenovar item={janela.i} nomeDoCliente={nomeCli(janela.i.cliente_id)} aoFechar={() => fechar()} aoSalvar={fechar} />
      )}
    </div>
  );
}
