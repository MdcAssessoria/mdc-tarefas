// Comercial › Leads: quem chegou pelo Simulador de Regime e pelos demais canais, com o que o Simulador apurou
// (regime atual, melhor regime, economia estimada). Seleção em lote para arquivar, devolver ao funil ou excluir de vez (quem gere).
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
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
import { TOM_ETAPA, linkWhatsapp, nomeEtapa, nomeOrigem, nomeRegime, numero } from "@/dominios/comercial/rotulos";
import { useAcoesOportunidade } from "@/dominios/comercial/componentes/useAcoesOportunidade";
import { plural } from "@/lib/formato/numero";

export default function PaginaLeads() {
  return <Leads />;
}

type Situacao = "ativos" | "arquivados" | "todos";
const SITUACOES: { id: Situacao; nome: string }[] = [
  { id: "ativos", nome: "No funil" },
  { id: "arquivados", nome: "Arquivados" },
  { id: "todos", nome: "Todos" },
];
/** "andamento" junta as etapas do meio (já contatados, sem desfecho). */
type FiltroEtapa = "" | "andamento" | Oportunidade["etapa"];
const passaEtapa = (o: Oportunidade, f: FiltroEtapa) =>
  !f || (f === "andamento" ? !["novo", "ganho", "perdido"].includes(o.etapa) : o.etapa === f);
const MOSTRAR = 500;

function Leads() {
  const { org, pode } = useOrg();
  const podeOperar = pode("comercial", "operar");
  const podeGerir = pode("comercial", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [origem, setOrigem] = useState("simulador");
  const [etapa, setEtapa] = useState<FiltroEtapa>("");
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const consulta = useConsulta(useCallback(() => lerOportunidades(org.id), [org.id]));
  const acoes = useAcoesOportunidade(() => {
    setSel(new Set());
    consulta.recarregar();
  }, mostrar);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  // recorte sem a etapa: base dos indicadores (que filtram por etapa ao clicar)
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...(consulta.dados ?? [])]
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .filter((o) => {
        const dia = o.criado_em.slice(0, 10);
        if (situacao === "ativos" && o.arquivado_em) return false;
        if (situacao === "arquivados" && !o.arquivado_em) return false;
        if (origem && o.origem !== origem) return false;
        if (intervalo.de && dia < intervalo.de) return false;
        if (intervalo.ate && dia > intervalo.ate) return false;
        if (q) {
          const d = o.dados_origem ?? {};
          const alvo = `${o.empresa} ${o.razao_social ?? ""} ${o.cnpj ?? ""} ${o.contato_nome ?? ""} ${o.email ?? ""} ${o.whatsapp ?? ""} ${o.cidade ?? ""} ${d.cnae_descricao ?? ""}`;
          if (!alvo.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }, [consulta.dados, busca, origem, situacao, intervalo]);
  const lista = useMemo(() => base.filter((o) => passaEtapa(o, etapa)), [base, etapa]);

  const resumo = useMemo(
    () => ({
      total: base.length,
      novos: base.filter((o) => o.etapa === "novo").length,
      andamento: base.filter((o) => passaEtapa(o, "andamento")).length,
      ganhos: base.filter((o) => o.etapa === "ganho").length,
      economia: lista.reduce((a, o) => a + (numero(o.dados_origem?.economia_estimada) ?? 0), 0),
    }),
    [base, lista],
  );

  const rotuloPeriodo =
    periodo === "escolher"
      ? `${fmtData(de) === "—" ? "início" : fmtData(de)} a ${fmtData(ate) === "—" ? "hoje" : fmtData(ate)}`
      : PERIODOS.find((p) => p.id === periodo)?.nome;
  const nomeFiltroEtapa = (f: FiltroEtapa) => (f === "andamento" ? "Em andamento" : nomeEtapa(f));

  function limparFiltros() {
    setBusca("");
    setPeriodo("tudo");
    setOrigem("simulador");
    setEtapa("");
    setSituacao("ativos");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "tudo" && { id: "periodo", rotulo: `Recebido: ${rotuloPeriodo}`, aoTirar: () => setPeriodo("tudo") },
    origem !== "simulador" && {
      id: "origem",
      rotulo: `Origem: ${origem ? nomeOrigem(origem) : "todas"}`,
      aoTirar: () => setOrigem("simulador"),
    },
    etapa && { id: "etapa", rotulo: `Etapa: ${nomeFiltroEtapa(etapa)}`, aoTirar: () => setEtapa("") },
    situacao !== "ativos" && {
      id: "situacao",
      rotulo: `Mostrando: ${SITUACOES.find((s) => s.id === situacao)?.nome}`,
      aoTirar: () => setSituacao("ativos"),
    },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const selecionados = lista.filter((o) => sel.has(o.id));
  const todosSel = lista.length > 0 && lista.every((o) => sel.has(o.id));
  const alternar = (id: string, marcar: boolean) =>
    setSel((x) => {
      const n = new Set(x);
      if (marcar) n.add(id);
      else n.delete(id);
      return n;
    });
  const filtrarEtapa = (f: FiltroEtapa) => setEtapa(etapa === f ? "" : f);
  const carregando = consulta.carregando && !consulta.dados;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Leads"
        descricao="Quem chegou pelo Simulador de Regime e pelos demais canais. Cada lead já entra no funil como “Novo lead”."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Leads do CRM",
              subtitulo: `${org.nome} · origem: ${origem ? nomeOrigem(origem) : "todas"}${periodo !== "tudo" ? ` · recebidos: ${rotuloPeriodo}` : ""} · ${plural(lista.length, "lead")}`,
              arquivo: nomeArquivo("Leads", hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Recebido em", valor: (o) => fmtDataLocal(o.criado_em), peso: 1, largura: 13 },
                { titulo: "Empresa", valor: (o) => o.empresa, peso: 2.2, largura: 34 },
                { titulo: "CNPJ", valor: (o) => o.cnpj ?? "", peso: 1.4, largura: 20 },
                { titulo: "Contato", valor: (o) => o.contato_nome ?? "", peso: 1.3, largura: 22 },
                { titulo: "WhatsApp", valor: (o) => o.whatsapp ?? "", peso: 1.2, largura: 16 },
                { titulo: "E-mail", valor: (o) => o.email ?? "", peso: 1.6, largura: 28 },
                {
                  titulo: "Atividade",
                  valor: (o) => (o.dados_origem?.cnae_descricao as string) ?? o.atividade ?? "",
                  peso: 1.8,
                  largura: 34,
                },
                { titulo: "Regime atual", valor: (o) => nomeRegime(o.regime_atual), peso: 0.9, largura: 13 },
                { titulo: "Melhor regime", valor: (o) => nomeRegime(o.dados_origem?.melhor_regime), peso: 0.9, largura: 14 },
                {
                  titulo: "Economia estimada",
                  valor: (o) => numero(o.dados_origem?.economia_estimada),
                  formato: "moeda",
                  peso: 1.1,
                  largura: 16,
                },
                { titulo: "Etapa", valor: (o) => nomeEtapa(o.etapa), peso: 0.9, largura: 13 },
                {
                  titulo: "Situação",
                  valor: (o) => (o.arquivado_em ? `Arquivado: ${o.motivo_arquivo ?? ""}` : "No funil"),
                  peso: 1.2,
                  largura: 22,
                },
              ],
              totais: { "Economia estimada": resumo.economia },
            })}
          />
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Empresa, CNPJ, contato ou atividade" />
        </label>
        <FiltroPeriodo
          rotulo="Recebido"
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
        <MaisFiltros emUso={(etapa ? 1 : 0) + (situacao !== "ativos" ? 1 : 0)}>
          <label className="campo">
            <span>Etapa</span>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value as FiltroEtapa)}>
              <option value="">Todas as etapas</option>
              <option value="andamento">Em andamento (já contatados)</option>
              {ETAPAS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Mostrar</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
              {SITUACOES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
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
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Ainda não contatados"
              icone="sino"
              tom={resumo.novos ? "violeta" : "neutro"}
              valor={String(resumo.novos)}
              detalhe={`de ${resumo.total} lead(s) neste filtro`}
              ativo={etapa === "novo"}
              aoClicar={() => filtrarEtapa("novo")}
            />
            <Indicador
              titulo="Em andamento"
              icone="funil"
              tom="azul"
              valor={String(resumo.andamento)}
              detalhe="Já contatados, sem desfecho"
              ativo={etapa === "andamento"}
              aoClicar={() => filtrarEtapa("andamento")}
            />
            <Indicador
              titulo="Viraram cliente"
              icone="check"
              tom="verde"
              valor={String(resumo.ganhos)}
              detalhe={resumo.total ? `${Math.round((resumo.ganhos / resumo.total) * 100)}% dos leads` : undefined}
              ativo={etapa === "ganho"}
              aoClicar={() => filtrarEtapa("ganho")}
            />
            <Indicador
              titulo="Economia estimada somada"
              icone="moeda"
              tom="ambar"
              valor={brl(resumo.economia)}
              detalhe="O que o Simulador mostrou de economia/ano para a lista"
            />
          </div>

          {selecionados.length > 0 && podeOperar && (
            <div className="cartao sticky top-16 z-20 flex flex-wrap items-center gap-2 border-[var(--destaque-escuro)] p-3 text-sm">
              <b className="mr-1 text-[var(--marca)]">{selecionados.length} selecionado(s)</b>
              {selecionados.some((o) => !o.arquivado_em) && (
                <button className="btn" onClick={() => acoes.arquivar(selecionados.filter((o) => !o.arquivado_em))}>
                  <Icone nome="caixa" className="h-4 w-4" />
                  Arquivar (dar baixa)
                </button>
              )}
              {selecionados.some((o) => o.arquivado_em) && (
                <button className="btn" onClick={() => acoes.restaurar(selecionados.filter((o) => o.arquivado_em))}>
                  <Icone nome="atualizar" className="h-4 w-4" />
                  Voltar ao funil
                </button>
              )}
              {podeGerir && selecionados.some((o) => !o.cliente_id) && (
                <button className="btn text-[var(--perigo)]" onClick={() => acoes.excluir(selecionados.filter((o) => !o.cliente_id))}>
                  <Icone nome="lixeira" className="h-4 w-4" />
                  Excluir de vez
                </button>
              )}
              <button className="btn-link" onClick={() => setSel(new Set())}>
                Limpar seleção
              </button>
            </div>
          )}

          {!lista.length ? (
            <EstadoVazio
              icone={consulta.dados?.length ? "filtro" : "pessoas"}
              titulo={consulta.dados?.length ? "Nenhum lead neste filtro" : "Nenhum lead ainda"}
              acao={
                consulta.dados?.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : (
                  <Link className="btn" href="/comercial">
                    <Icone nome="funil" className="h-4 w-4" />
                    Ir para o funil
                  </Link>
                )
              }
            >
              {consulta.dados?.length
                ? "O padrão mostra só quem veio do Simulador de Regime. Troque “Como chegou” para “Todas as origens” ou limpe os filtros."
                : "Quem preencher o Simulador de Regime aparece aqui sozinho. Contatos de indicação, WhatsApp ou evento você cadastra no funil."}
            </EstadoVazio>
          ) : (
            <QuadroTabela
              rotulo="Leads"
              rodape={lista.length > MOSTRAR ? `Mostrando ${MOSTRAR} de ${lista.length}. A exportação considera todos.` : undefined}
            >
              <thead>
                <tr>
                  <th className="w-8">
                    {podeOperar && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--marca)]"
                        aria-label="Selecionar todos"
                        checked={todosSel}
                        onChange={(e) => setSel(e.target.checked ? new Set(lista.map((o) => o.id)) : new Set())}
                      />
                    )}
                  </th>
                  <th>Recebido</th>
                  <th>Empresa</th>
                  <th>Contato</th>
                  <th>Regime → melhor</th>
                  <th className="text-right">Economia estimada</th>
                  <th>Etapa</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, MOSTRAR).map((o) => {
                  const d = o.dados_origem ?? {};
                  const econ = numero(d.economia_estimada);
                  const zap = linkWhatsapp(o.whatsapp);
                  return (
                    <tr key={o.id} className={o.arquivado_em ? "opacity-70" : ""}>
                      <td data-rotulo={podeOperar ? "Selecionar" : undefined}>
                        {podeOperar && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--marca)]"
                            aria-label={`Selecionar ${o.empresa}`}
                            checked={sel.has(o.id)}
                            onChange={(e) => alternar(o.id, e.target.checked)}
                          />
                        )}
                      </td>
                      <td data-rotulo="Recebido" className="num whitespace-nowrap">
                        {fmtDataLocal(o.criado_em)}
                      </td>
                      <td className="celula-titulo min-w-56">
                        <Link href={`/comercial/${o.id}`} className="hover:underline">
                          {o.empresa}
                        </Link>
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {[o.cnpj, (d.cnae_descricao as string) ?? o.atividade].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </td>
                      <td data-rotulo="Contato">
                        <span className="block">
                          <span className="block">{o.contato_nome ?? "—"}</span>
                          {(zap || o.email) && (
                            <span className="flex justify-end gap-3 text-xs sm:justify-start">
                              {zap && (
                                <a
                                  className="text-[var(--destaque-escuro)] hover:underline"
                                  href={zap}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  WhatsApp
                                </a>
                              )}
                              {o.email && (
                                <a className="text-[var(--destaque-escuro)] hover:underline" href={`mailto:${o.email}`}>
                                  E-mail
                                </a>
                              )}
                            </span>
                          )}
                        </span>
                      </td>
                      <td data-rotulo="Regime → melhor" className="whitespace-nowrap">
                        <span>
                          {nomeRegime(o.regime_atual)} → <b>{nomeRegime(d.melhor_regime)}</b>
                        </span>
                      </td>
                      <td data-rotulo="Economia estimada" className="text-right">
                        {econ ? <Valor v={econ} /> : "—"}
                      </td>
                      <td data-rotulo="Etapa">
                        <span className="block">
                          <Chip tom={TOM_ETAPA[o.etapa]}>{nomeEtapa(o.etapa)}</Chip>
                          {o.arquivado_em && (
                            <span className="block text-[11px] text-[var(--texto-suave)]">
                              arquivado{o.motivo_arquivo ? `: ${o.motivo_arquivo}` : ""}
                            </span>
                          )}
                        </span>
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
                  <td colSpan={5} className="celula-titulo">
                    Total ({lista.length})
                  </td>
                  <td data-rotulo="Economia estimada" className="text-right">
                    <Valor v={resumo.economia} />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}
    </div>
  );
}
