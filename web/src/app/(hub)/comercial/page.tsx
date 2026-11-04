// Comercial › Funil: oportunidades por etapa (quadro), em lista ou arquivadas, com filtros, indicadores clicáveis,
// PDF/Excel do que está filtrado e "Limpar funil". Nada se apaga: oportunidade sai do funil arquivando, com motivo.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { Abas } from "@/components/ui/Abas";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { ETAPAS, ORIGENS } from "@/dominios/comercial/crm";
import type { Oportunidade } from "@/dominios/comercial/crm";
import { lerOportunidades } from "@/dominios/comercial/leituras";
import { arquivarOportunidades } from "@/dominios/comercial/repositorio";
import { TOM_ETAPA, diasDesde, estaAberta, nomeEtapa, nomeOrigem, retornoAtrasado, rotuloDias } from "@/dominios/comercial/rotulos";
import { LimparFunil, NovaOportunidade } from "@/dominios/comercial/componentes/JanelasFunil";
import { QuadroFunil } from "@/dominios/comercial/componentes/QuadroFunil";
import { useAcoesOportunidade } from "@/dominios/comercial/componentes/useAcoesOportunidade";
import { plural } from "@/lib/formato/numero";

export default function PaginaFunil() {
  return <Funil />;
}

type Visao = "quadro" | "lista" | "arquivados";
type Situacao = "andamento" | "ganho" | "perdido" | "todas";
const SITUACOES: { id: Situacao; nome: string }[] = [
  { id: "andamento", nome: "Em andamento" },
  { id: "ganho", nome: "Ganhas (viraram cliente)" },
  { id: "perdido", nome: "Perdidas" },
  { id: "todas", nome: "Todas" },
];
const passaSituacao = (o: Pick<Oportunidade, "etapa">, s: Situacao) =>
  s === "todas" ? true : s === "andamento" ? estaAberta(o) : o.etapa === s;

function Funil() {
  const { org, membros, pode, eu } = useOrg();
  const router = useRouter();
  const podeOperar = pode("comercial", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [visao, setVisao] = useState<Visao>("quadro");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("andamento");
  const [resp, setResp] = useState("");
  const [origem, setOrigem] = useState("");
  const [atrasados, setAtrasados] = useState(false);
  const [janela, setJanela] = useState<"novo" | "limpar" | null>(null);

  const consulta = useConsulta(useCallback(() => lerOportunidades(org.id), [org.id]));
  const { recarregar } = consulta;
  const acoes = useAcoesOportunidade(recarregar, mostrar);

  // tempo real: outra pessoa mexeu no funil → recarrega
  useEffect(() => {
    const canal = supabase()
      .channel("crm-funil")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_oportunidades", filter: `org_id=eq.${org.id}` }, () =>
        recarregar(),
      )
      .subscribe();
    return () => {
      void supabase().removeChannel(canal);
    };
  }, [recarregar, org.id]);

  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);
  const todas = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const nArquivadas = todas.filter((o) => o.arquivado_em).length;

  // filtros "de recorte" (busca, período, responsável, origem): valem para os indicadores e para a lista
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter((o) => {
      const dia = o.criado_em.slice(0, 10);
      return (
        (!intervalo.de || dia >= intervalo.de) &&
        (!intervalo.ate || dia <= intervalo.ate) &&
        (!origem || o.origem === origem) &&
        (!resp || (resp === "sem" ? !o.responsavel_id : o.responsavel_id === resp)) &&
        (!q || `${o.empresa} ${o.razao_social ?? ""} ${o.contato_nome ?? ""} ${o.cnpj ?? ""} ${o.cidade ?? ""}`.toLowerCase().includes(q))
      );
    });
  }, [todas, busca, intervalo, origem, resp]);

  const noFunil = useMemo(() => base.filter((o) => !o.arquivado_em), [base]);
  const lista = useMemo(
    () =>
      visao === "arquivados"
        ? base.filter((o) => o.arquivado_em)
        : noFunil.filter((o) => passaSituacao(o, situacao) && (!atrasados || retornoAtrasado(o, hoje))),
    [visao, base, noFunil, situacao, atrasados, hoje],
  );

  const kpi = useMemo(() => {
    const abertas = noFunil.filter(estaAberta);
    const ganhas = base.filter((o) => o.etapa === "ganho");
    const perdidas = base.filter((o) => o.etapa === "perdido");
    const fechadas = ganhas.length + perdidas.length;
    return {
      abertas: abertas.length,
      pipeline: abertas.reduce((a, o) => a + (o.valor_mensal ?? 0), 0),
      ganhas: ganhas.length,
      perdidas: perdidas.length,
      conversao: fechadas ? Math.round((ganhas.length / fechadas) * 100) : null,
      ticket: ganhas.length ? ganhas.reduce((a, o) => a + (o.valor_mensal ?? 0), 0) / ganhas.length : null,
      atrasados: abertas.filter((o) => retornoAtrasado(o, hoje)).length,
    };
  }, [noFunil, base, hoje]);

  const nomeMembro = useCallback(
    (id: string | null) => (id ? (membros.find((m) => m.user_id === id)?.nome?.split(" ")[0] ?? "—") : "Sem responsável"),
    [membros],
  );
  const nomeResp =
    resp === "sem" ? "Sem responsável" : resp === eu.user_id ? "Meus" : (membros.find((m) => m.user_id === resp)?.nome ?? "—");
  const rotuloPeriodo =
    periodo === "escolher"
      ? `${fmtData(de) === "—" ? "início" : fmtData(de)} a ${fmtData(ate) === "—" ? "hoje" : fmtData(ate)}`
      : PERIODOS.find((p) => p.id === periodo)?.nome;

  function limparFiltros() {
    setBusca("");
    setPeriodo("tudo");
    setSituacao("andamento");
    setResp("");
    setOrigem("");
    setAtrasados(false);
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "tudo" && { id: "periodo", rotulo: `Entrou no funil: ${rotuloPeriodo}`, aoTirar: () => setPeriodo("tudo") },
    visao !== "arquivados" &&
      situacao !== "andamento" && {
        id: "situacao",
        rotulo: `Situação: ${SITUACOES.find((s) => s.id === situacao)?.nome}`,
        aoTirar: () => setSituacao("andamento"),
      },
    visao !== "arquivados" && atrasados && { id: "atrasados", rotulo: "Só retornos atrasados", aoTirar: () => setAtrasados(false) },
    resp && { id: "resp", rotulo: `Responsável: ${nomeResp}`, aoTirar: () => setResp("") },
    origem && { id: "origem", rotulo: `Origem: ${nomeOrigem(origem)}`, aoTirar: () => setOrigem("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const colunasExportar: ColunaLista<Oportunidade>[] = [
    { titulo: "Empresa", valor: (o) => o.empresa, peso: 2.4, largura: 34 },
    { titulo: "Contato", valor: (o) => o.contato_nome ?? "", peso: 1.4, largura: 22 },
    { titulo: "Cidade", valor: (o) => [o.cidade, o.uf].filter(Boolean).join("/"), peso: 1.3, largura: 20 },
    { titulo: "Origem", valor: (o) => nomeOrigem(o.origem), peso: 1.2, largura: 18 },
    { titulo: "Etapa", valor: (o) => nomeEtapa(o.etapa), peso: 1.1, largura: 14 },
    { titulo: "Honorário/mês", valor: (o) => o.valor_mensal ?? null, formato: "moeda", peso: 1.2 },
    { titulo: "Responsável", valor: (o) => nomeMembro(o.responsavel_id), peso: 1.1, largura: 18 },
    ...(visao === "arquivados"
      ? [
          { titulo: "Motivo", valor: (o: Oportunidade) => o.motivo_arquivo || o.motivo_perda || "", peso: 2, largura: 30 },
          { titulo: "Arquivada em", valor: (o: Oportunidade) => fmtDataLocal(o.arquivado_em), peso: 1, largura: 13 },
        ]
      : [
          {
            titulo: "Próximo retorno",
            valor: (o: Oportunidade) => (o.proximo_contato ? fmtData(o.proximo_contato) : ""),
            peso: 1.1,
            largura: 14,
            alerta: (o: Oportunidade) => retornoAtrasado(o, hoje),
          },
          { titulo: "Dias na etapa", valor: (o: Oportunidade) => diasDesde(o.etapa_desde), formato: "numero" as const, peso: 0.9 },
        ]),
  ];

  const carregando = consulta.carregando && !consulta.dados;
  const semNada = !carregando && todas.length === 0;
  const colunasQuadro = ETAPAS.filter((e) => passaSituacao({ etapa: e.id }, situacao));

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Funil comercial"
        descricao="Acompanhe cada empresa interessada, da primeira conversa ao contrato assinado."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: visao === "arquivados" ? "Oportunidades arquivadas" : "Funil comercial",
                subtitulo: `${org.nome} · ${visao === "arquivados" ? "arquivadas" : SITUACOES.find((s) => s.id === situacao)?.nome}${periodo !== "tudo" ? ` · entrou no funil: ${rotuloPeriodo}` : ""} · ${plural(lista.length, "oportunidade")}`,
                arquivo: nomeArquivo(visao === "arquivados" ? "Oportunidades-arquivadas" : "Funil-comercial", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: colunasExportar,
                totais: { "Honorário/mês": lista.reduce((a, o) => a + (o.valor_mensal ?? 0), 0) },
              })}
            />
            {podeOperar && (
              <button className="btn" onClick={() => setJanela("limpar")} title="Arquivar de uma vez as perdidas e as paradas">
                <Icone nome="caixa" className="h-4 w-4" />
                Limpar funil
              </button>
            )}
            {podeOperar && (
              <button className="btn-primario" onClick={() => setJanela("novo")}>
                <Icone nome="mais" className="h-4 w-4" />
                Nova oportunidade
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Empresa, contato, CNPJ ou cidade" />
        </label>
        <FiltroPeriodo
          rotulo="Entrou no funil"
          periodo={periodo}
          de={de}
          ate={ate}
          aoMudar={(v) => {
            if (v.periodo) setPeriodo(v.periodo);
            if (v.de !== undefined) setDe(v.de);
            if (v.ate !== undefined) setAte(v.ate);
          }}
        />
        {visao !== "arquivados" && (
          <label className="campo">
            <span>Situação</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
              {SITUACOES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <MaisFiltros emUso={(resp ? 1 : 0) + (origem ? 1 : 0) + (atrasados ? 1 : 0)}>
          <label className="campo">
            <span>Responsável</span>
            <select value={resp} onChange={(e) => setResp(e.target.value)}>
              <option value="">Todos</option>
              <option value={eu.user_id}>Meus</option>
              <option value="sem">Sem responsável</option>
              {membros
                .filter((m) => m.ativo)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo">
            <span>Como chegou</span>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="">Todas as origens</option>
              {ORIGENS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          {visao !== "arquivados" && (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--marca)]"
                checked={atrasados}
                onChange={(e) => setAtrasados(e.target.checked)}
              />
              Só retornos atrasados
            </label>
          )}
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {acoes.janela}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {carregando ? (
        <Esqueleto indicadores={4} />
      ) : semNada ? (
        <EstadoVazio
          icone="funil"
          titulo="O funil ainda está vazio"
          acao={
            podeOperar && (
              <button className="btn-primario" onClick={() => setJanela("novo")}>
                <Icone nome="mais" className="h-4 w-4" />
                Cadastrar a primeira oportunidade
              </button>
            )
          }
        >
          Cadastre aqui cada empresa que demonstrar interesse. Quem preenche o Simulador de Regime entra sozinho como “Novo lead”.
        </EstadoVazio>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Em andamento"
              icone="funil"
              tom="azul"
              valor={String(kpi.abertas)}
              detalhe={`${brl(kpi.pipeline)}/mês em negociação`}
            />
            <Indicador
              titulo="Retornos atrasados"
              icone="alerta"
              tom={kpi.atrasados ? "vermelho" : "neutro"}
              valor={String(kpi.atrasados)}
              detalhe={kpi.atrasados ? "Combinou de retornar e a data passou" : "Nenhum retorno atrasado"}
              ativo={visao !== "arquivados" && atrasados}
              aoClicar={() => {
                setVisao((v) => (v === "arquivados" ? "lista" : v));
                setSituacao("andamento");
                setAtrasados((x) => !x);
              }}
            />
            <Indicador
              titulo="Viraram cliente"
              icone="check"
              tom="verde"
              valor={String(kpi.ganhas)}
              detalhe={
                kpi.conversao === null
                  ? "Nenhuma negociação fechada ainda"
                  : `${kpi.conversao}% das fechadas${kpi.ticket ? ` · média ${brl(kpi.ticket)}/mês` : ""}`
              }
              ativo={visao !== "arquivados" && situacao === "ganho"}
              aoClicar={() => {
                setVisao((v) => (v === "arquivados" ? "lista" : v));
                setAtrasados(false);
                setSituacao(situacao === "ganho" ? "andamento" : "ganho");
              }}
            />
            <Indicador
              titulo="Perdidas"
              icone="cancelar"
              tom="neutro"
              valor={String(kpi.perdidas)}
              detalhe="Não avançaram (motivo na ficha)"
              ativo={visao !== "arquivados" && situacao === "perdido"}
              aoClicar={() => {
                setVisao((v) => (v === "arquivados" ? "lista" : v));
                setAtrasados(false);
                setSituacao(situacao === "perdido" ? "andamento" : "perdido");
              }}
            />
          </div>

          <Abas<Visao>
            rotulo="Como ver o funil"
            valor={visao}
            aoMudar={setVisao}
            itens={[
              { id: "quadro", nome: "Quadro por etapa" },
              { id: "lista", nome: "Lista" },
              { id: "arquivados", nome: `Arquivadas (${nArquivadas})` },
            ]}
          />

          {!lista.length ? (
            <EstadoVazio
              icone={visao === "arquivados" && !nArquivadas ? "caixa" : "filtro"}
              titulo={visao === "arquivados" && !nArquivadas ? "Nada arquivado" : "Nada neste filtro"}
              acao={
                filtrosAtivos.length > 0 && (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                )
              }
            >
              {visao === "arquivados" && !nArquivadas
                ? "Quando uma oportunidade não for para frente, arquive pelo menu “⋯” do cartão ou pelo botão “Limpar funil”. Ela vem para cá e pode voltar ao funil."
                : "Troque a situação ou o período, ou limpe os filtros para ver tudo."}
            </EstadoVazio>
          ) : visao === "quadro" ? (
            <QuadroFunil
              colunas={colunasQuadro}
              itens={lista}
              hoje={hoje}
              podeOperar={podeOperar}
              nomeMembro={nomeMembro}
              aoMover={acoes.mover}
              aoArquivar={(o) => acoes.arquivar([o])}
            />
          ) : visao === "lista" ? (
            <QuadroTabela rotulo="Oportunidades do funil">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Etapa</th>
                  <th>Origem</th>
                  <th className="text-right">Honorário/mês</th>
                  <th>Responsável</th>
                  <th>Próximo retorno</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => {
                  const atrasado = retornoAtrasado(o, hoje);
                  return (
                    <tr key={o.id}>
                      <td className="celula-titulo min-w-56">
                        <Link href={`/comercial/${o.id}`} className="hover:underline">
                          {o.empresa}
                        </Link>
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {[o.contato_nome, o.cidade && `${o.cidade}${o.uf ? `/${o.uf}` : ""}`].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </td>
                      <td data-rotulo="Etapa" className="whitespace-nowrap">
                        <span className="block">
                          <Chip tom={TOM_ETAPA[o.etapa]}>{nomeEtapa(o.etapa)}</Chip>
                          <span className="block text-[11px] text-[var(--texto-suave)]">há {rotuloDias(diasDesde(o.etapa_desde))}</span>
                        </span>
                      </td>
                      <td data-rotulo="Origem">{nomeOrigem(o.origem)}</td>
                      <td data-rotulo="Honorário/mês" className="text-right">
                        {o.valor_mensal ? <Valor v={o.valor_mensal} /> : "—"}
                      </td>
                      <td data-rotulo="Responsável">{nomeMembro(o.responsavel_id)}</td>
                      <td data-rotulo="Próximo retorno" className={`num whitespace-nowrap ${atrasado ? "font-medium text-red-700" : ""}`}>
                        {o.proximo_contato ? fmtData(o.proximo_contato) : "—"}
                      </td>
                      <td className="celula-acoes whitespace-nowrap text-right">
                        <Link href={`/comercial/${o.id}`} className="btn !min-h-8 !px-3">
                          <Icone nome="olho" className="h-4 w-4" />
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={3} className="celula-titulo">
                    Total ({lista.length})
                  </td>
                  <td data-rotulo="Honorário/mês" className="text-right">
                    <Valor v={lista.reduce((a, o) => a + (o.valor_mensal ?? 0), 0)} />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </QuadroTabela>
          ) : (
            <QuadroTabela rotulo="Oportunidades arquivadas">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Etapa em que parou</th>
                  <th>Motivo</th>
                  <th>Arquivada em</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id}>
                    <td className="celula-titulo min-w-56">
                      <Link href={`/comercial/${o.id}`} className="hover:underline">
                        {o.empresa}
                      </Link>
                      <span className="block text-xs font-normal text-[var(--texto-suave)]">
                        {[o.contato_nome, nomeOrigem(o.origem)].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td data-rotulo="Parou em">
                      <Chip tom={TOM_ETAPA[o.etapa]}>{nomeEtapa(o.etapa)}</Chip>
                    </td>
                    <td data-rotulo="Motivo" className="text-sm">
                      {o.motivo_arquivo || o.motivo_perda || "—"}
                    </td>
                    <td data-rotulo="Arquivada em" className="num whitespace-nowrap">
                      {fmtDataLocal(o.arquivado_em)}
                    </td>
                    <td className="celula-acoes whitespace-nowrap text-right">
                      {podeOperar && (
                        <button className="btn !min-h-8 !px-3" onClick={() => acoes.restaurar([o])}>
                          <Icone nome="atualizar" className="h-4 w-4" />
                          Voltar ao funil
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}

      {janela === "limpar" && (
        <LimparFunil
          lista={todas.filter((o) => !o.arquivado_em)}
          aoFechar={() => setJanela(null)}
          aoConfirmar={async (ids, motivo) => {
            const n = await arquivarOportunidades(ids, motivo, true);
            setJanela(null);
            mostrar(`${n} oportunidade(s) arquivada(s). Ficam em “Arquivadas” e podem voltar ao funil.`);
            recarregar();
          }}
        />
      )}
      {janela === "novo" && <NovaOportunidade aoFechar={() => setJanela(null)} aoCriar={(id) => router.push(`/comercial/${id}`)} />}
    </div>
  );
}
