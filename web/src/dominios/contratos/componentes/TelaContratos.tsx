// Módulo Contratos › Contratos: lista dos contratos fixos da empresa (a receber e a pagar) no molde 8.3.1 — filtros
// (empresa, tipo, situação, busca), indicadores com ícone (recebe por mês, paga por mês, reajustes pendentes, vigência
// terminando em 30 dias), quadro que vira cartão no celular, PDF/Excel e tela vazia que ensina. Cada contrato abre a
// ficha (dados, contas lançadas, anexos, histórico); editar, reajustar, suspender/reativar e encerrar com motivo.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Valor } from "@/components/ui/Valor";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { lerCategorias, lerCentros, lerContas, lerPessoas } from "@/dominios/financeiro/leituras";
import { lerContratos, lerReajustes } from "../leituras";
import { encerrarContrato, reativarContrato, suspenderContrato } from "../repositorio";
import { proximoReajuste, reajustePendente, SITUACOES_RECORRENTE, terminaEm, textoReajuste, textoVigencia } from "../regras";
import type { Recorrente, SituacaoRecorrente } from "../tipos";
import { ContratoFixo } from "./ContratoFixo";
import { FichaContrato } from "./FichaContrato";
import { JanelaReajuste } from "./JanelaReajuste";

type FiltroTipo = "" | "receber" | "pagar";
type FiltroSituacao = SituacaoRecorrente | "todos" | "vigentes";
type Destaque = "" | "reajuste" | "termina";
const FILTROS_SITUACAO: { id: FiltroSituacao; nome: string }[] = [
  { id: "vigentes", nome: "Ativos e suspensos" },
  { id: "ativo", nome: "Só ativos" },
  { id: "suspenso", nome: "Suspensos" },
  { id: "encerrado", nome: "Encerrados" },
  { id: "todos", nome: "Todos" },
];

type Janela =
  | { tipo: "novo" }
  | { tipo: "editar"; k: Recorrente }
  | { tipo: "ficha"; k: Recorrente }
  | { tipo: "reajuste"; k: Recorrente }
  | { tipo: "suspender"; k: Recorrente }
  | { tipo: "reativar"; k: Recorrente }
  | { tipo: "encerrar"; k: Recorrente };

const ITEM_MENU = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--fundo)]";

export function TelaContratos() {
  const { org, pode } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const podeOperar = pode("contratos", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [tipo, setTipo] = useState<FiltroTipo>("");
  const [situacao, setSituacao] = useState<FiltroSituacao>("vigentes");
  const [destaque, setDestaque] = useState<Destaque>("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);

  const cad = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [pessoas, categorias, centros, contas] = await Promise.all([
        lerPessoas(cliente.id),
        lerCategorias(cliente.id),
        lerCentros(cliente.id),
        lerContas(cliente.id),
      ]);
      return { pessoas, categorias, centros, contas };
    }, [cliente]),
  );
  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [contratos, reajustes] = await Promise.all([lerContratos(cliente.id), lerReajustes(cliente.id)]);
      return { contratos, reajustes };
    }, [cliente]),
  );

  const nomes = useMemo(
    () => ({
      pessoa: new Map((cad.dados?.pessoas ?? []).map((p) => [p.id, p.nome])),
      categoria: new Map((cad.dados?.categorias ?? []).map((c) => [c.id, c.nome])),
    }),
    [cad.dados],
  );

  const linhas = useMemo(
    () =>
      (consulta.dados?.contratos ?? []).map((k) => ({
        k,
        pendente: reajustePendente(k, consulta.dados!.reajustes, hoje),
        proximo: proximoReajuste(k, consulta.dados!.reajustes, hoje),
        termina: terminaEm(k, hoje),
      })),
    [consulta.dados, hoje],
  );
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      ({ k, pendente, termina }) =>
        (!tipo || k.tipo === tipo) &&
        (situacao === "todos" || (situacao === "vigentes" ? k.situacao !== "encerrado" : k.situacao === situacao)) &&
        (destaque !== "reajuste" || !!pendente) &&
        (destaque !== "termina" || termina) &&
        (!q ||
          k.descricao.toLowerCase().includes(q) ||
          (k.numero ?? "").toLowerCase().includes(q) ||
          (nomes.pessoa.get(k.pessoa_id) ?? "").toLowerCase().includes(q)),
    );
  }, [linhas, tipo, situacao, destaque, busca, nomes]);

  const ativos = linhas.filter((x) => x.k.situacao === "ativo");
  const somaTipo = (t: "pagar" | "receber") => ativos.filter((x) => x.k.tipo === t).reduce((a, x) => a + Number(x.k.valor), 0);
  const recebe = somaTipo("receber");
  const paga = somaTipo("pagar");
  const qtdPendentes = linhas.filter((x) => x.pendente).length;
  const qtdTermina = linhas.filter((x) => x.termina).length;
  const totalLista = filtrados
    .filter((x) => x.k.situacao === "ativo")
    .reduce((a, x) => a + (x.k.tipo === "receber" ? 1 : -1) * Number(x.k.valor), 0);

  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      consulta.recarregar();
      cad.recarregar();
    }
  }
  function menu(e: React.MouseEvent<HTMLElement>, j: Janela) {
    e.currentTarget.closest("details")?.removeAttribute("open");
    setJanela(j);
  }
  function limparFiltros() {
    setTipo("");
    setSituacao("vigentes");
    setDestaque("");
    setBusca("");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    tipo && { id: "tipo", rotulo: tipo === "pagar" ? "Tipo: a pagar" : "Tipo: a receber", aoTirar: () => setTipo("") },
    situacao !== "vigentes" && {
      id: "situacao",
      rotulo: `Situação: ${FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome}`,
      aoTirar: () => setSituacao("vigentes"),
    },
    destaque && {
      id: "destaque",
      rotulo: destaque === "reajuste" ? "Só reajustes pendentes" : "Só vigência terminando em 30 dias",
      aoTirar: () => setDestaque(""),
    },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const nomePessoa = (k: Recorrente) => nomes.pessoa.get(k.pessoa_id) ?? "—";

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Contratos"
        descricao="O que se repete todo mês: honorários dos clientes, aluguel, sistemas e serviços. O HUB lança a conta no dia 1 e lembra do reajuste e do fim da vigência."
        acoes={
          <>
            <BotoesExportar
              vazio={!filtrados.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Contratos",
                subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome} · ${filtrados.length} contrato(s)`,
                arquivo: nomeArquivo("Contratos", cliente ? nomeCliente(cliente) : "", hoje),
                logoUrl: org.logo_url,
                linhas: filtrados,
                colunas: [
                  { titulo: "Contrato", valor: (x) => x.k.descricao + (x.k.numero ? ` (nº ${x.k.numero})` : ""), peso: 2.4, largura: 34 },
                  { titulo: "Tipo", valor: (x) => (x.k.tipo === "pagar" ? "A pagar" : "A receber"), peso: 1, largura: 11 },
                  { titulo: "Cliente/fornecedor", valor: (x) => nomePessoa(x.k), peso: 2, largura: 30 },
                  { titulo: "Valor mensal", valor: (x) => Number(x.k.valor), formato: "moeda", peso: 1.2 },
                  { titulo: "Vence dia", valor: (x) => x.k.dia_vencimento, peso: 0.7, largura: 9 },
                  { titulo: "Vigência", valor: (x) => textoVigencia(x.k), peso: 2, largura: 30 },
                  { titulo: "Reajuste", valor: (x) => textoReajuste(x.k), peso: 1.4, largura: 20 },
                  {
                    titulo: "Próximo reajuste",
                    valor: (x) => (x.proximo ? fmtCompetencia(x.proximo) : ""),
                    peso: 1,
                    largura: 14,
                    alerta: (x) => !!x.pendente,
                  },
                  { titulo: "Situação", valor: (x) => SITUACOES_RECORRENTE[x.k.situacao].nome, peso: 1, largura: 12 },
                ],
              })}
            />
            {podeOperar && cliente && (
              <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })} disabled={!cad.dados}>
                <Icone nome="mais" className="h-4 w-4" />
                Novo contrato
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)}>
            <option value="">A receber e a pagar</option>
            <option value="receber">Só a receber</option>
            <option value="pagar">Só a pagar</option>
          </select>
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
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, número, cliente ou fornecedor" />
        </label>
      </CartaoFiltros>

      {aviso}
      {(consulta.erro || cad.erro) && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro ?? cad.erro}
        </p>
      )}

      {!cliente ? (
        <SemEmpresaGestao icone="documento" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Recebe por mês"
              icone="seta-entrada"
              valor={brl(recebe)}
              detalhe={`${ativos.filter((x) => x.k.tipo === "receber").length} contrato(s) ativo(s)`}
              tom="verde"
              ativo={tipo === "receber"}
              aoClicar={() => setTipo(tipo === "receber" ? "" : "receber")}
            />
            <Indicador
              titulo="Paga por mês"
              icone="seta-saida"
              valor={brl(paga)}
              detalhe={`${ativos.filter((x) => x.k.tipo === "pagar").length} contrato(s) ativo(s)`}
              tom="violeta"
              ativo={tipo === "pagar"}
              aoClicar={() => setTipo(tipo === "pagar" ? "" : "pagar")}
            />
            <Indicador
              titulo="Reajustes pendentes"
              icone="tendencia"
              valor={String(qtdPendentes)}
              detalhe={qtdPendentes ? "Confira e confirme" : "Nada para confirmar"}
              tom={qtdPendentes ? "ambar" : "neutro"}
              ativo={destaque === "reajuste"}
              aoClicar={() => setDestaque(destaque === "reajuste" ? "" : "reajuste")}
            />
            <Indicador
              titulo="Vigência termina em 30 dias"
              icone="calendario"
              valor={String(qtdTermina)}
              detalhe="Terminam ou renovam"
              tom={qtdTermina ? "azul" : "neutro"}
              ativo={destaque === "termina"}
              aoClicar={() => setDestaque(destaque === "termina" ? "" : "termina")}
            />
          </div>

          {!filtrados.length ? (
            <EstadoVazio
              icone={linhas.length ? "filtro" : "documento"}
              titulo={linhas.length ? "Nada neste filtro" : "Nenhum contrato cadastrado ainda"}
              acao={
                linhas.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : (
                  podeOperar && (
                    <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })} disabled={!cad.dados}>
                      <Icone nome="mais" className="h-4 w-4" />
                      Cadastrar o primeiro
                    </button>
                  )
                )
              }
            >
              {linhas.length
                ? "Troque o tipo ou a situação, ou limpe os filtros para ver tudo."
                : "Cadastre aqui o que se repete todo mês: honorários dos clientes, aluguel, sistemas. O HUB lança a conta no Financeiro no dia 1 de cada mês, propõe o reajuste anual pelo índice do Banco Central e avisa antes do fim da vigência."}
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Contratos">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Cliente / fornecedor</th>
                  <th className="text-right">Valor mensal</th>
                  <th>Vigência</th>
                  <th>Reajuste</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(({ k, pendente, proximo, termina }) => {
                  const s = SITUACOES_RECORRENTE[k.situacao];
                  return (
                    <tr key={k.id} className={k.situacao === "encerrado" ? "opacity-60" : ""}>
                      <td className="celula-titulo min-w-56">
                        <button className="text-left font-medium hover:underline" onClick={() => setJanela({ tipo: "ficha", k })}>
                          {k.descricao}
                        </button>
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {k.tipo === "pagar" ? "A pagar" : "A receber"} · {nomes.categoria.get(k.categoria_id)}
                          {k.numero && ` · nº ${k.numero}`}
                        </span>
                      </td>
                      <td data-rotulo="Cliente / fornecedor" className="min-w-32">
                        {nomePessoa(k)}
                      </td>
                      <td data-rotulo="Valor mensal" className="whitespace-nowrap text-right">
                        <Valor v={Number(k.valor)} />
                        <span className="block text-xs text-[var(--texto-suave)]">
                          {k.gera_contas ? `vence dia ${k.dia_vencimento}` : "não lança contas"}
                        </span>
                      </td>
                      <td data-rotulo="Vigência" className="min-w-40">
                        <span className={termina ? "font-medium text-blue-800" : ""}>
                          {k.vigencia_fim ? `até ${fmtData(k.vigencia_fim)}` : "Prazo indeterminado"}
                        </span>
                        {k.vigencia_fim && (
                          <span className="block text-xs text-[var(--texto-suave)]">
                            {k.renovacao_automatica ? "renova sozinho" : "não renova"}
                          </span>
                        )}
                      </td>
                      <td data-rotulo="Reajuste">
                        {pendente ? (
                          <Chip tom="ambar">Pendente · {fmtCompetencia(pendente)}</Chip>
                        ) : (
                          <>
                            {textoReajuste(k)}
                            {proximo && <span className="block text-xs text-[var(--texto-suave)]">próximo: {fmtCompetencia(proximo)}</span>}
                          </>
                        )}
                      </td>
                      <td data-rotulo="Situação">
                        <Chip tom={s.tom}>{s.nome}</Chip>
                      </td>
                      <td className="celula-acoes whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          {pendente && podeOperar ? (
                            <button className="btn !min-h-8 !px-3" onClick={() => setJanela({ tipo: "reajuste", k })}>
                              <Icone nome="tendencia" className="h-4 w-4" />
                              Reajustar
                            </button>
                          ) : (
                            <button className="btn !min-h-8 !px-3" onClick={() => setJanela({ tipo: "ficha", k })}>
                              <Icone nome="olho" className="h-4 w-4" />
                              Ficha
                            </button>
                          )}
                          <details className="relative">
                            <summary
                              className="btn !min-h-8 list-none !px-2.5 [&::-webkit-details-marker]:hidden"
                              aria-label="Mais ações"
                              title="Mais ações"
                            >
                              ⋯
                            </summary>
                            <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-[var(--borda)] bg-white p-1 text-left text-sm shadow-lg">
                              <button className={ITEM_MENU} onClick={(e) => menu(e, { tipo: "ficha", k })}>
                                <Icone nome="olho" className="h-4 w-4 text-[var(--texto-suave)]" />
                                Ficha, contas e anexos
                              </button>
                              {k.indice !== "nenhum" && (
                                <button className={ITEM_MENU} onClick={(e) => menu(e, { tipo: "reajuste", k })}>
                                  <Icone nome="tendencia" className="h-4 w-4 text-[var(--texto-suave)]" />
                                  Ver reajuste
                                </button>
                              )}
                              {podeOperar && k.situacao !== "encerrado" && (
                                <button className={ITEM_MENU} onClick={(e) => menu(e, { tipo: "editar", k })}>
                                  <Icone nome="editar" className="h-4 w-4 text-[var(--texto-suave)]" />
                                  Editar
                                </button>
                              )}
                              {podeOperar && k.situacao === "ativo" && (
                                <button className={ITEM_MENU} onClick={(e) => menu(e, { tipo: "suspender", k })}>
                                  <Icone nome="cancelar" className="h-4 w-4 text-[var(--texto-suave)]" />
                                  Suspender
                                </button>
                              )}
                              {podeOperar && k.situacao === "suspenso" && (
                                <button className={ITEM_MENU} onClick={(e) => menu(e, { tipo: "reativar", k })}>
                                  <Icone nome="atualizar" className="h-4 w-4 text-[var(--texto-suave)]" />
                                  Reativar
                                </button>
                              )}
                              {podeOperar && k.situacao !== "encerrado" && (
                                <button
                                  className={`${ITEM_MENU} text-[var(--perigo)] hover:bg-red-50`}
                                  onClick={(e) => menu(e, { tipo: "encerrar", k })}
                                >
                                  <Icone nome="fechar" className="h-4 w-4" />
                                  Encerrar contrato
                                </button>
                              )}
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={2} className="celula-titulo">
                    Saldo mensal dos ativos ({filtrados.length})
                  </td>
                  <td data-rotulo="Recebe − paga" className="text-right">
                    <Valor v={totalLista} />
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}

      {janela && cliente && cad.dados && (janela.tipo === "novo" || janela.tipo === "editar") && (
        <ContratoFixo
          cliente={cliente}
          cad={cad.dados}
          hoje={hoje}
          editar={janela.tipo === "editar" ? janela.k : undefined}
          tipoInicial={tipo || "receber"}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
          aoRecarregarCadastros={cad.recarregar}
        />
      )}
      {janela?.tipo === "ficha" && (
        <FichaContrato
          contrato={janela.k}
          pessoa={nomePessoa(janela.k)}
          categoria={nomes.categoria.get(janela.k.categoria_id) ?? "—"}
          podeOperar={podeOperar}
          aoFechar={() => fechar()}
          aoMudar={(m) => {
            mostrar(m);
            consulta.recarregar();
          }}
        />
      )}
      {janela?.tipo === "reajuste" && (
        <JanelaReajuste contrato={janela.k} podeOperar={podeOperar} aoFechar={() => fechar()} aoSalvar={fechar} />
      )}
      {janela?.tipo === "suspender" && (
        <JanelaMotivo
          titulo="Suspender contrato"
          descricao={`${janela.k.descricao} · ${brl(Number(janela.k.valor))} por mês. Enquanto suspenso, o HUB não lança as contas do mês (os meses suspensos não voltam).`}
          botao="Suspender"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await suspenderContrato(janela.k.id, motivo);
            fechar("Contrato suspenso.");
          }}
        />
      )}
      {janela?.tipo === "reativar" && (
        <JanelaMotivo
          titulo="Reativar contrato"
          descricao={`${janela.k.descricao}: volta a lançar a partir deste mês (${fmtCompetencia(hoje)}).`}
          botao="Reativar"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            const r = await reativarContrato(janela.k.id, motivo);
            fechar(r.geradas ? "Contrato reativado e a conta deste mês foi lançada." : "Contrato reativado.");
          }}
        />
      )}
      {janela?.tipo === "encerrar" && (
        <JanelaMotivo
          titulo="Encerrar contrato"
          descricao={`${janela.k.descricao}: o HUB não lança mais nenhuma conta. A conta deste mês, se já lançada, continua (cancele no Financeiro se não for devida). O contrato fica guardado com o histórico e os anexos.`}
          botao="Encerrar contrato"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await encerrarContrato(janela.k.id, motivo);
            fechar("Contrato encerrado.");
          }}
        />
      )}
    </div>
  );
}
