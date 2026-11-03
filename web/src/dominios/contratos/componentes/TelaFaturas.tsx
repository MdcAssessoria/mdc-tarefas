// Módulo Contratos › Faturas (043): as faturas que o HUB gera no dia de gerar de cada contrato a receber. Molde 8.3.1:
// filtros (período do vencimento, situação, busca), indicadores que filtram, quadro que vira cartão no celular, PDF e
// Excel e tela vazia que ensina. Ações: ver a fatura (dados e envio por canal), baixar o PDF no papel timbrado,
// cancelar com motivo e "Gerar fatura agora". Enquanto não há integração, avisa que e-mail, WhatsApp e boleto
// aguardam configuração (o Portal do Cliente já recebe).
// NFS-e (046): "Emitir nota fiscal" abre a conferência (JanelaEmitirNfse, com o ambiente em destaque) e emite pelo
// Emissor Nacional; a situação da nota aparece na lista com o motivo da recusa; "Ver a nota" abre o espelho DANFSe.
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Valor } from "@/components/ui/Valor";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { baixarFaturaPdf } from "../baixarFatura";
import { CANAIS_ENVIO, SITUACOES_ENVIO, SITUACOES_FATURA, textoConteudo } from "../faturamento";
import { lerContratos, lerEmissoesNfse, lerEnvios, lerFaturas, lerOpcoesContrato, lerParametrosNfse } from "../leituras";
import { cancelarFatura } from "../repositorio";
import { notaEmitida, podeEmitirNota, situacaoDaNota, ultimasEmissoes } from "../nfse";
import type { EmissaoNfse, EnvioDaFatura, Fatura, SituacaoFatura } from "../tipos";
import { EspelhoNota } from "@/dominios/notas/componentes/EspelhoNota";
import { DetalheFatura, JanelaGerarFatura } from "./JanelasFatura";
import { JanelaEmitirNfse } from "./JanelaEmitirNfse";

type FiltroSituacao = "abertas" | SituacaoFatura | "todas";
const FILTROS_SITUACAO: { id: FiltroSituacao; nome: string }[] = [
  { id: "abertas", nome: "Todas, menos canceladas" },
  { id: "aguardando_nf", nome: "Aguardando nota fiscal" },
  { id: "pronta", nome: "Prontas para enviar" },
  { id: "gerada", nome: "Geradas (sem envio)" },
  { id: "enviada", nome: "Enviadas" },
  { id: "cancelada", nome: "Canceladas" },
  { id: "todas", nome: "Todas" },
];

type Janela =
  | { tipo: "ver"; f: Fatura }
  | { tipo: "cancelar"; f: Fatura }
  | { tipo: "gerar" }
  | { tipo: "emitir"; f: Fatura }
  | { tipo: "nota"; caminho: string; chave: string; numero: string | null; voltar?: Fatura };

export function TelaFaturas() {
  const { org, pode, clientes } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const podeOperar = pode("contratos", "operar");
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao>("abertas");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [faturas, envios, contratos, pessoas, emissoes, parametrosNfse] = await Promise.all([
        lerFaturas(cliente.id),
        lerEnvios(cliente.id),
        lerContratos(cliente.id),
        lerOpcoesContrato(cliente.id).then((o) => o.tomadores),
        lerEmissoesNfse(cliente.id),
        lerParametrosNfse(cliente.id),
      ]);
      return { faturas, envios, contratos, pessoas, emissoes, parametrosNfse };
    }, [cliente]),
  );

  const mapas = useMemo(() => {
    const d = consulta.dados;
    const envios = new Map<string, EnvioDaFatura[]>();
    for (const e of d?.envios ?? []) envios.set(e.fatura_id, [...(envios.get(e.fatura_id) ?? []), e]);
    return {
      pessoa: new Map((d?.pessoas ?? []).map((p) => [p.id, p])),
      contrato: new Map((d?.contratos ?? []).map((k) => [k.id, k])),
      envios,
      ultima: ultimasEmissoes(d?.emissoes ?? []),
    };
  }, [consulta.dados]);
  const nomePessoa = (id: string) => mapas.pessoa.get(id)?.nome ?? "—";
  const nomeContrato = (id: string) => mapas.contrato.get(id)?.descricao ?? "—";
  const nomeCarteira = (id: string) =>
    nomeCliente(
      clientes.find((c) => c.id === id),
      "cliente da carteira",
    );

  const doPeriodo = useMemo(
    () =>
      (consulta.dados?.faturas ?? []).filter(
        (f) => (!intervalo.de || f.vencimento >= intervalo.de) && (!intervalo.ate || f.vencimento <= intervalo.ate),
      ),
    [consulta.dados, intervalo],
  );
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doPeriodo.filter(
      (f) =>
        (situacao === "todas" || (situacao === "abertas" ? f.situacao !== "cancelada" : f.situacao === situacao)) &&
        (!q ||
          f.numero.includes(q) ||
          f.descricao.toLowerCase().includes(q) ||
          nomePessoa(f.pessoa_id).toLowerCase().includes(q) ||
          nomeContrato(f.recorrente_id).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doPeriodo, situacao, busca, mapas]);

  const validas = doPeriodo.filter((f) => f.situacao !== "cancelada");
  const faturado = validas.reduce((a, f) => a + Number(f.valor), 0);
  const conta = (s: SituacaoFatura) => doPeriodo.filter((f) => f.situacao === s).length;
  const totalLista = filtradas.filter((f) => f.situacao !== "cancelada").reduce((a, f) => a + Number(f.valor), 0);
  const aguardandoConfig = (consulta.dados?.envios ?? []).some((e) => e.situacao === "aguardando_configuracao");

  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      consulta.recarregar();
    }
  }
  async function baixar(f: Fatura) {
    try {
      await baixarFaturaPdf(f, mapas.pessoa.get(f.pessoa_id), nomeContrato(f.recorrente_id), org.logo_url);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }
  function limparFiltros() {
    setPeriodo("tudo");
    setDe("");
    setAte("");
    setSituacao("abertas");
    setBusca("");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "tudo" && {
      id: "periodo",
      rotulo: `Vencimento: ${PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("tudo"),
    },
    situacao !== "abertas" && {
      id: "situacao",
      rotulo: `Situação: ${FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome}`,
      aoTirar: () => setSituacao("abertas"),
    },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((x): x is FiltroAtivo => !!x);

  const canais = (f: Fatura) => mapas.envios.get(f.id) ?? [];
  const nota = (f: Fatura) => situacaoDaNota(f, mapas.ultima.get(f.id));
  /** Nota para "Ver a nota": a de verdade (produção) ou, sem ela, a última de teste emitida. */
  const notaParaVer = (f: Fatura): EmissaoNfse | null => {
    const lista = consulta.dados?.emissoes ?? [];
    const e = notaEmitida(lista, f.id) ?? (mapas.ultima.get(f.id)?.situacao === "emitida" ? mapas.ultima.get(f.id)! : null);
    return e?.xml_caminho && e.chave_acesso ? e : null;
  };
  const parametrosNfse = consulta.dados?.parametrosNfse;
  const temNfse = (consulta.dados?.faturas ?? []).some((f) => f.documento === "nfse" && f.situacao !== "cancelada");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Faturas"
        descricao="As faturas que o HUB gera no dia de gerar de cada contrato a receber: número, vencimento, nota fiscal, boleto e o envio ao cliente."
        acoes={
          <>
            <BotoesExportar
              vazio={!filtradas.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Faturas",
                subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${PERIODOS.find((p) => p.id === periodo)?.nome} · ${FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome} · ${filtradas.length} fatura(s)`,
                arquivo: nomeArquivo("Faturas", cliente ? nomeCliente(cliente) : "", hoje),
                logoUrl: org.logo_url,
                paisagem: true,
                linhas: filtradas,
                colunas: [
                  { titulo: "Número", valor: (f) => f.numero, peso: 1, largura: 12 },
                  { titulo: "Cliente", valor: (f) => nomePessoa(f.pessoa_id), peso: 2, largura: 30 },
                  { titulo: "Contrato", valor: (f) => nomeContrato(f.recorrente_id), peso: 1.8, largura: 28 },
                  { titulo: "Mês", valor: (f) => fmtCompetencia(f.competencia), peso: 0.8, largura: 10 },
                  { titulo: "Emissão", valor: (f) => fmtData(f.emissao), peso: 0.9, largura: 12 },
                  { titulo: "Vencimento", valor: (f) => fmtData(f.vencimento), peso: 0.9, largura: 12 },
                  { titulo: "Valor", valor: (f) => Number(f.valor), formato: "moeda", peso: 1 },
                  { titulo: "Nota fiscal", valor: (f) => nota(f).texto, peso: 1.2, largura: 24 },
                  {
                    titulo: "Situação",
                    valor: (f) => SITUACOES_FATURA[f.situacao].nome,
                    peso: 1.2,
                    largura: 22,
                    alerta: (f) => f.situacao === "cancelada",
                  },
                ],
                totais: { Valor: totalLista },
              })}
            />
            {podeOperar && cliente && (
              <button className="btn-primario" onClick={() => setJanela({ tipo: "gerar" })} disabled={!consulta.dados}>
                <Icone nome="mais" className="h-4 w-4" />
                Gerar fatura agora
              </button>
            )}
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
        <Icone nome="relogio" className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <strong>Envio por e-mail/WhatsApp e boleto: aguardando configuração.</strong> As faturas já são geradas e ficam na fila; enquanto
          isso, baixe o PDF e mande ao cliente. O Portal do Cliente já recebe as faturas publicadas.
          {aguardandoConfig ? " Há envios esperando a configuração." : ""}
        </p>
      </div>
      {temNfse && !parametrosNfse && consulta.dados && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          <Icone nome="engrenagem" className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>Emissão da nota fiscal ainda não configurada.</strong>{" "}
            {podeGerir ? (
              <>
                Configure em{" "}
                <Link className="underline" href="/contratos/nota-fiscal">
                  Contratos › Nota fiscal (NFS-e)
                </Link>{" "}
                (começa no ambiente de teste, sem valor fiscal).
              </>
            ) : (
              "Peça a quem gere o módulo Contratos para configurar em Contratos › Nota fiscal (NFS-e)."
            )}
          </p>
        </div>
      )}
      {parametrosNfse?.ambiente === "producao_restrita" && temNfse && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          <Icone nome="alerta" className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>Notas fiscais no ambiente de teste (sem valor fiscal).</strong> As notas emitidas agora servem só para conferir: não mudam a
            fatura nem vão para o cliente.{podeGerir ? " Depois dos testes, mude para Produção em Contratos › Nota fiscal (NFS-e)." : ""}
          </p>
        </div>
      )}

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <FiltroPeriodo
          rotulo="Vencimento"
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
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}>
            {FILTROS_SITUACAO.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, cliente ou contrato" />
        </label>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {!cliente ? (
        <SemEmpresaGestao icone="arquivo" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Faturado no período"
              icone="moeda"
              valor={brl(faturado)}
              detalhe={`${validas.length} fatura(s), sem as canceladas`}
              tom="verde"
              ativo={situacao === "abertas" && periodo !== "tudo"}
            />
            <Indicador
              titulo="Aguardando nota fiscal"
              icone="documento"
              valor={String(conta("aguardando_nf"))}
              detalhe="Confira e clique em Emitir nota fiscal"
              tom={conta("aguardando_nf") ? "ambar" : "neutro"}
              ativo={situacao === "aguardando_nf"}
              aoClicar={() => setSituacao(situacao === "aguardando_nf" ? "abertas" : "aguardando_nf")}
            />
            <Indicador
              titulo="Prontas para enviar"
              icone="enviar"
              valor={String(conta("pronta") + conta("gerada"))}
              detalhe="Falta chegar ao cliente"
              tom={conta("pronta") + conta("gerada") ? "azul" : "neutro"}
              ativo={situacao === "pronta"}
              aoClicar={() => setSituacao(situacao === "pronta" ? "abertas" : "pronta")}
            />
            <Indicador
              titulo="Enviadas"
              icone="check"
              valor={String(conta("enviada"))}
              detalhe="Por todos os canais marcados"
              tom={conta("enviada") ? "verde" : "neutro"}
              ativo={situacao === "enviada"}
              aoClicar={() => setSituacao(situacao === "enviada" ? "abertas" : "enviada")}
            />
          </div>

          {!filtradas.length ? (
            <EstadoVazio
              icone={consulta.dados?.faturas.length ? "filtro" : "arquivo"}
              titulo={consulta.dados?.faturas.length ? "Nada neste filtro" : "Nenhuma fatura ainda"}
              acao={
                consulta.dados?.faturas.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : (
                  <Link className="btn-primario" href="/contratos">
                    <Icone nome="documento" className="h-4 w-4" />
                    Ir para os contratos
                  </Link>
                )
              }
            >
              {consulta.dados?.faturas.length
                ? "Troque o período ou a situação, ou limpe os filtros para ver tudo."
                : "As faturas nascem sozinhas no dia de gerar de cada contrato a receber. Em Contratos, cadastre ou edite um contrato a receber e escolha o que enviar ao cliente e por onde."}
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Faturas">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Cliente</th>
                  <th>Vencimento</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  <th>Envio</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f) => {
                  const s = SITUACOES_FATURA[f.situacao];
                  const env = canais(f);
                  const vencida = f.situacao !== "cancelada" && f.vencimento < hoje;
                  const n = nota(f);
                  const ver = notaParaVer(f);
                  return (
                    <tr key={f.id} className={f.situacao === "cancelada" ? "opacity-60" : ""}>
                      <td className="celula-titulo min-w-48">
                        <button className="text-left font-medium hover:underline" onClick={() => setJanela({ tipo: "ver", f })}>
                          Fatura {f.numero}
                        </button>
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {nomeContrato(f.recorrente_id)} · {fmtCompetencia(f.competencia)}
                          {f.origem === "manual" ? " · gerada à mão" : ""}
                        </span>
                      </td>
                      <td data-rotulo="Cliente" className="min-w-32">
                        {nomePessoa(f.pessoa_id)}
                      </td>
                      <td data-rotulo="Vencimento" className="whitespace-nowrap">
                        <span className={vencida ? "font-medium text-[var(--perigo)]" : ""}>{fmtData(f.vencimento)}</span>
                        <span className="block text-xs text-[var(--texto-suave)]">emitida {fmtData(f.emissao)}</span>
                      </td>
                      <td data-rotulo="Valor" className="whitespace-nowrap text-right">
                        <Valor v={Number(f.valor)} />
                      </td>
                      <td data-rotulo="Situação" className="min-w-40">
                        <Chip tom={s.tom}>{s.nome}</Chip>
                        <span
                          className={`block text-xs ${n.tom === "vermelho" ? "font-medium text-[var(--perigo)]" : "text-[var(--texto-suave)]"}`}
                        >
                          {n.texto}
                          {f.boleto_situacao === "a_definir" ? " · boleto a configurar" : ""}
                        </span>
                        {n.detalhe && n.tom === "vermelho" && (
                          <span className="block max-w-64 text-xs text-[var(--perigo)]" title={n.detalhe}>
                            {n.detalhe.length > 120 ? `${n.detalhe.slice(0, 117)}…` : n.detalhe}
                          </span>
                        )}
                      </td>
                      <td data-rotulo="Envio">
                        {env.length ? (
                          <span className="flex flex-wrap gap-1.5">
                            {env.map((e) => {
                              const c = CANAIS_ENVIO.find((x) => x.id === e.canal);
                              const se = SITUACOES_ENVIO[e.situacao];
                              return (
                                <span
                                  key={e.id}
                                  title={`${c?.nome}: ${se.nome} (${textoConteudo(e.conteudo)})`}
                                  className="inline-flex items-center gap-1 rounded-full border border-[var(--borda)] px-2 py-0.5 text-xs"
                                >
                                  <Icone nome={c?.icone ?? "enviar"} className="h-3.5 w-3.5" />
                                  <span className="sr-only">{c?.nome}:</span>
                                  {se.nome}
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--texto-suave)]">Sem canal (baixe o PDF)</span>
                        )}
                      </td>
                      <td className="celula-acoes whitespace-nowrap text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {podeOperar && podeEmitirNota(f) && (
                            <button
                              className="btn-primario !min-h-8 !px-3"
                              onClick={() => setJanela({ tipo: "emitir", f })}
                              aria-label={`Emitir nota fiscal da fatura ${f.numero}`}
                              title="Conferir e emitir a nota fiscal pelo Emissor Nacional"
                            >
                              <Icone nome="enviar" className="h-4 w-4" />
                              Emitir nota
                            </button>
                          )}
                          {ver && (
                            <button
                              className="btn !min-h-8 !px-2.5"
                              onClick={() => setJanela({ tipo: "nota", caminho: ver.xml_caminho!, chave: ver.chave_acesso!, numero: ver.numero_nfse })}
                              aria-label={`Ver a nota fiscal da fatura ${f.numero}`}
                              title={ver.ambiente === "producao" ? "Ver a nota fiscal (espelho)" : "Ver a nota de teste (sem valor fiscal)"}
                            >
                              <Icone nome="arquivo" className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="btn !min-h-8 !px-3"
                            onClick={() => void baixar(f)}
                            aria-label={`Baixar PDF da fatura ${f.numero}`}
                          >
                            <Icone nome="documento" className="h-4 w-4" />
                            PDF
                          </button>
                          <button
                            className="btn !min-h-8 !px-2.5"
                            onClick={() => setJanela({ tipo: "ver", f })}
                            aria-label={`Ver a fatura ${f.numero}`}
                            title="Ver a fatura e o envio"
                          >
                            <Icone nome="olho" className="h-4 w-4" />
                          </button>
                          {podeOperar && f.situacao !== "cancelada" && (
                            <button
                              className="btn !min-h-8 !px-2.5 text-[var(--perigo)]"
                              onClick={() => setJanela({ tipo: "cancelar", f })}
                              aria-label={`Cancelar a fatura ${f.numero}`}
                              title="Cancelar fatura"
                            >
                              <Icone nome="cancelar" className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={3} className="celula-titulo">
                    Total sem as canceladas ({filtradas.length})
                  </td>
                  <td data-rotulo="Total" className="text-right">
                    <Valor v={totalLista} />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}

      {janela?.tipo === "ver" && (
        <DetalheFatura
          fatura={janela.f}
          envios={canais(janela.f)}
          cliente={nomePessoa(janela.f.pessoa_id)}
          contrato={nomeContrato(janela.f.recorrente_id)}
          nomeCarteira={nomeCarteira}
          podeOperar={podeOperar}
          nota={nota(janela.f)}
          aoEmitir={podeOperar && podeEmitirNota(janela.f) ? () => setJanela({ tipo: "emitir", f: janela.f }) : undefined}
          aoBaixar={() => void baixar(janela.f)}
          aoCancelar={() => setJanela({ tipo: "cancelar", f: janela.f })}
          aoFechar={() => fechar()}
        />
      )}
      {janela?.tipo === "emitir" && (
        <JanelaEmitirNfse
          fatura={janela.f}
          cliente={nomePessoa(janela.f.pessoa_id)}
          podeGerir={podeGerir}
          aoVerNota={(caminho, chave, numero) => setJanela({ tipo: "nota", caminho, chave, numero, voltar: janela.f })}
          aoFechar={(mudou) => {
            setJanela(null);
            if (mudou) consulta.recarregar();
          }}
        />
      )}
      {janela?.tipo === "nota" && (
        <EspelhoNota
          nota={{
            xml_caminho: janela.caminho,
            chave: janela.chave,
            numero: janela.numero,
            emitente_doc: null,
            emitente_nome: cliente ? nomeCliente(cliente) : null,
            modelo: "nfse",
          }}
          avisar={mostrar}
          aoFechar={() => {
            const voltar = janela.voltar;
            setJanela(null);
            if (voltar) consulta.recarregar();
          }}
        />
      )}
      {janela?.tipo === "cancelar" && (
        <JanelaMotivo
          titulo={`Cancelar a fatura ${janela.f.numero}`}
          descricao={`${nomePessoa(janela.f.pessoa_id)} · ${brl(Number(janela.f.valor))} · vence em ${fmtData(janela.f.vencimento)}. A conta a receber deste mês, se ainda em aberto e sem recebimento, é cancelada junto no Financeiro. Para refazer, use "Gerar fatura agora".`}
          botao="Cancelar fatura"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            const r = await cancelarFatura(janela.f.id, motivo);
            fechar(r.conta_cancelada ? "Fatura cancelada (a conta do mês foi cancelada junto)." : "Fatura cancelada.");
          }}
        />
      )}
      {janela?.tipo === "gerar" && consulta.dados && (
        <JanelaGerarFatura
          contratos={consulta.dados.contratos}
          nomePessoa={(k) => nomePessoa(k.pessoa_id)}
          hoje={hoje}
          aoFechar={() => fechar()}
          aoGerar={fechar}
        />
      )}
    </div>
  );
}
