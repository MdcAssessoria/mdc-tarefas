// Tela de Contas a pagar / Contas a receber (a mesma tela para os dois, muda o tipo). Filtros simples (período do
// vencimento, situação, fornecedor/cliente, categoria, busca), indicadores clicáveis, lista com ações (pagar/receber,
// editar, histórico, ver caminho, cancelar), frase de resumo, PDF e Excel do que está filtrado.
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Valor } from "@/components/ui/Valor";
import { LancarTitulo, TEXTOS } from "./LancarTitulo";
import { BaixarTitulo, HistoricoTitulo } from "./BaixaTitulo";
import { ArvoreDocumento } from "./ArvoreDocumento";
import { BotaoVerCaminho } from "@/components/ui/BotaoVerCaminho";
import { lerCategorias, lerCentros, lerContas, lerPessoas, lerTitulos } from "../leituras";
import { cancelarTitulo } from "../repositorio";
import { intervaloDoPeriodo, PERIODOS, saldoDoTitulo, SITUACOES, situacaoDoTitulo } from "../regras";
import type { Periodo, SituacaoExibida } from "../regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { Titulo, TipoTitulo } from "../tipos";

type FiltroSituacao = "abertos" | "vencido" | "a_vencer" | "quitado" | "cancelado" | "todos";
const FILTROS_SITUACAO: { id: FiltroSituacao; nome: string }[] = [
  { id: "abertos", nome: "Em aberto (todos)" },
  { id: "vencido", nome: "Só vencidos" },
  { id: "a_vencer", nome: "Só a vencer" },
  { id: "quitado", nome: "Pagos" },
  { id: "cancelado", nome: "Cancelados" },
  { id: "todos", nome: "Todos" },
];
const ABERTAS: SituacaoExibida[] = ["vencido", "vence_hoje", "a_vencer", "parcial"];
const MOSTRAR = 500;

function passaSituacao(s: SituacaoExibida, f: FiltroSituacao) {
  if (f === "todos") return true;
  if (f === "abertos") return ABERTAS.includes(s);
  if (f === "a_vencer") return s === "a_vencer" || s === "vence_hoje" || s === "parcial";
  return s === f;
}

type Janela =
  | { tipo: "novo" }
  | { tipo: "editar"; t: Titulo }
  | { tipo: "baixar"; t: Titulo }
  | { tipo: "historico"; t: Titulo }
  | { tipo: "cancelar"; t: Titulo }
  | { tipo: "caminho"; t: Titulo };

export function TelaTitulos({ tipo }: { tipo: TipoTitulo }) {
  const { org, pode } = useOrg();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const podeOperar = pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const T = TEXTOS[tipo];

  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao>("abertos");
  const [pessoa, setPessoa] = useState("");
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [janelaEscolhida, setJanela] = useState<Janela | null>(null);
  // atalho do painel (?nova=1): abre "Nova conta" assim que os cadastros chegam
  const [pedidoNova, setPedidoNova] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nova") === "1",
  );
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

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
    useCallback(async () => (cliente ? lerTitulos(cliente.id, tipo, intervalo) : null), [cliente, tipo, intervalo]),
  );

  const nomes = useMemo(() => {
    const d = cad.dados;
    return {
      pessoa: new Map((d?.pessoas ?? []).map((p) => [p.id, p.nome])),
      categoria: new Map((d?.categorias ?? []).map((c) => [c.id, c.nome])),
    };
  }, [cad.dados]);

  const comSituacao = useMemo(
    () => (consulta.dados ?? []).map((t) => ({ t, s: situacaoDoTitulo(t, hoje), saldo: saldoDoTitulo(t) })),
    [consulta.dados, hoje],
  );
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return comSituacao.filter(
      ({ t }) =>
        (!pessoa || t.pessoa_id === pessoa) &&
        (!categoria || t.categoria_id === categoria) &&
        (!q ||
          t.descricao.toLowerCase().includes(q) ||
          (t.documento ?? "").toLowerCase().includes(q) ||
          (nomes.pessoa.get(t.pessoa_id ?? "") ?? "").toLowerCase().includes(q) ||
          brl(Number(t.valor)).includes(q)),
    );
  }, [comSituacao, pessoa, categoria, busca, nomes]);
  const lista = useMemo(() => filtrados.filter(({ s }) => passaSituacao(s, situacao)), [filtrados, situacao]);

  const soma = (f: (x: (typeof filtrados)[number]) => boolean, v: (x: (typeof filtrados)[number]) => number) =>
    filtrados.filter(f).reduce((a, x) => a + v(x), 0);
  const vencido = soma(
    (x) => x.s === "vencido",
    (x) => x.saldo,
  );
  const qtdVencido = filtrados.filter((x) => x.s === "vencido").length;
  const aVencer = soma(
    (x) => ["a_vencer", "vence_hoje", "parcial"].includes(x.s),
    (x) => x.saldo,
  );
  const pago = soma(
    (x) => x.s !== "cancelado",
    (x) => Number(x.t.valor_pago),
  );
  const totalLista = lista.reduce((a, x) => a + (x.s === "cancelado" ? 0 : Number(x.t.valor)), 0);
  const saldoLista = lista.reduce((a, x) => a + x.saldo, 0);

  const rotuloPeriodo =
    intervalo.de || intervalo.ate
      ? `vencimento de ${fmtData(intervalo.de ?? "") || "início"} a ${fmtData(intervalo.ate ?? "") || "hoje"}`
      : "todos os vencimentos";
  const resumo = cliente
    ? qtdVencido
      ? `Há ${qtdVencido} ${tipo === "pagar" ? "conta(s) vencida(s) a pagar" : "conta(s) vencida(s) a receber"}, somando ${brl(vencido)}. Em aberto a vencer: ${brl(aVencer)}.`
      : aVencer
        ? `Nada vencido. Em aberto a vencer: ${brl(aVencer)}.`
        : "Nada em aberto neste filtro."
    : "";

  /** Item do menu "⋯": fecha o menu e abre a janela. */
  function menu(e: React.MouseEvent<HTMLElement>, j: Janela) {
    e.currentTarget.closest("details")?.removeAttribute("open");
    setJanela(j);
  }

  function fechar(msg?: string) {
    setJanela(null);
    if (pedidoNova) {
      setPedidoNova(false);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (msg) {
      mostrar(msg);
      consulta.recarregar();
      cad.recarregar();
    }
  }

  function limparFiltros() {
    setPessoa("");
    setCategoria("");
    setBusca("");
    setSituacao("abertos");
    setPeriodo("tudo");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "tudo" && {
      id: "periodo",
      rotulo: `Vencimento: ${periodo === "escolher" ? rotuloPeriodo.replace("vencimento de ", "") : PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("tudo"),
    },
    situacao !== "abertos" && {
      id: "situacao",
      rotulo: `Situação: ${FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome}`,
      aoTirar: () => setSituacao("abertos"),
    },
    pessoa && { id: "pessoa", rotulo: `${T.pessoa}: ${nomes.pessoa.get(pessoa) ?? "—"}`, aoTirar: () => setPessoa("") },
    categoria && { id: "categoria", rotulo: `Categoria: ${nomes.categoria.get(categoria) ?? "—"}`, aoTirar: () => setCategoria("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const semCategoria = cad.dados && !cad.dados.categorias.some((c) => c.ativo && c.tipo === (tipo === "pagar" ? "despesa" : "receita"));
  const janela: Janela | null =
    janelaEscolhida ?? (pedidoNova && podeOperar && cliente && cad.dados && !semCategoria ? { tipo: "novo" } : null);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={T.titulo}
        descricao={
          tipo === "pagar"
            ? "O que a MDC tem para pagar: vencimentos, pagamentos e atrasos."
            : "O que a MDC tem para receber: vencimentos, recebimentos e atrasos."
        }
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: T.titulo,
                subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${rotuloPeriodo} · ${FILTROS_SITUACAO.find((x) => x.id === situacao)?.nome} · ${lista.length} lançamento(s)`,
                arquivo: nomeArquivo(T.titulo, cliente ? nomeCliente(cliente) : "", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Vencimento", valor: (x) => fmtData(x.t.vencimento), peso: 1, largura: 12 },
                  { titulo: "Descrição", valor: (x) => x.t.descricao, peso: 3, largura: 40 },
                  { titulo: T.pessoa, valor: (x) => nomes.pessoa.get(x.t.pessoa_id ?? "") ?? "", peso: 2, largura: 30 },
                  { titulo: "Categoria", valor: (x) => nomes.categoria.get(x.t.categoria_id) ?? "", peso: 1.6, largura: 24 },
                  { titulo: "Documento", valor: (x) => x.t.documento ?? (x.t.recorrente_id ? "Contrato fixo" : ""), peso: 1, largura: 14 },
                  { titulo: "Valor", valor: (x) => Number(x.t.valor), formato: "moeda", peso: 1.2 },
                  { titulo: T.feito, valor: (x) => Number(x.t.valor_pago), formato: "moeda", peso: 1.2 },
                  { titulo: "Falta", valor: (x) => x.saldo, formato: "moeda", peso: 1.2, alerta: (x) => x.s === "vencido" },
                  { titulo: "Situação", valor: (x) => SITUACOES[x.s].nome, peso: 1.1, largura: 14, alerta: (x) => x.s === "vencido" },
                ],
                totais: { Valor: totalLista, Falta: saldoLista },
              })}
            />
            {podeOperar && cliente && (
              <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })} disabled={!cad.dados}>
                <Icone nome="mais" className="h-4 w-4" />
                Nova {T.conta}
              </button>
            )}
          </>
        }
      />

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
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Descrição, documento, ${T.pessoa.toLowerCase()} ou valor`}
          />
        </label>
        <MaisFiltros emUso={(pessoa ? 1 : 0) + (categoria ? 1 : 0)}>
          <label className="campo">
            <span>{T.pessoa}</span>
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">Todos</option>
              {(cad.dados?.pessoas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Categoria</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {(cad.dados?.categorias ?? [])
                .filter((c) => c.tipo === (tipo === "pagar" ? "despesa" : "receita"))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </label>
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {(consulta.erro || cad.erro) && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro ?? cad.erro}
        </p>
      )}

      {!cliente ? (
        <SemEmpresaGestao icone="moeda" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : (
        <>
          {semCategoria && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Antes do primeiro lançamento, cadastre as {tipo === "pagar" ? "despesas" : "receitas"} da MDC em{" "}
                <Link className="underline" href="/plano-contas/categorias">
                  Plano de contas › Despesas e receitas
                </Link>{" "}
                (cada uma ligada a uma conta do plano do Domínio).
              </span>
            </p>
          )}
          {resumo && <p className="text-sm text-[var(--texto)]">{resumo}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              titulo="Vencido"
              icone="alerta"
              valor={brl(vencido)}
              detalhe={`${qtdVencido} lançamento(s)`}
              tom={vencido ? "vermelho" : "neutro"}
              ativo={situacao === "vencido"}
              aoClicar={() => setSituacao(situacao === "vencido" ? "abertos" : "vencido")}
            />
            <Indicador
              titulo="A vencer"
              icone="calendario"
              valor={brl(aVencer)}
              tom="azul"
              ativo={situacao === "a_vencer"}
              aoClicar={() => setSituacao(situacao === "a_vencer" ? "abertos" : "a_vencer")}
            />
            <Indicador
              titulo={`${T.feito} (neste filtro)`}
              icone="check"
              valor={brl(pago)}
              tom="verde"
              ativo={situacao === "quitado"}
              aoClicar={() => setSituacao(situacao === "quitado" ? "abertos" : "quitado")}
            />
          </div>

          {!lista.length ? (
            <EstadoVazio
              icone={consulta.dados?.length ? "filtro" : tipo === "pagar" ? "seta-saida" : "seta-entrada"}
              titulo={consulta.dados?.length ? "Nada neste filtro" : `Nenhuma ${T.conta} lançada ainda`}
              acao={
                consulta.dados?.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : (
                  podeOperar &&
                  !semCategoria && (
                    <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
                      <Icone nome="mais" className="h-4 w-4" />
                      Lançar a primeira
                    </button>
                  )
                )
              }
            >
              {consulta.dados?.length
                ? "Troque a situação ou o período, ou limpe os filtros para ver tudo."
                : tipo === "pagar"
                  ? "Lance boletos, aluguel, fornecedores e impostos. O HUB avisa o que vence e o que atrasou."
                  : "Lance vendas, serviços e mensalidades. O HUB mostra o que entra e quem está atrasado."}
            </EstadoVazio>
          ) : (
            <QuadroTabela
              rotulo={T.titulo}
              rodape={
                lista.length > MOSTRAR ? `Mostrando ${MOSTRAR} de ${lista.length}. Os totais e a exportação consideram todos.` : undefined
              }
            >
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>{T.pessoa}</th>
                  <th className="text-right">Valor</th>
                  <th className="text-right">Falta</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, MOSTRAR).map(({ t, s, saldo }) => (
                  <tr key={t.id} className={s === "cancelado" ? "linha-apagada" : ""}>
                    <td data-rotulo="Vencimento" className={`num whitespace-nowrap ${s === "vencido" ? "font-medium text-red-700" : ""}`}>
                      {fmtData(t.vencimento)}
                    </td>
                    <td className="celula-titulo min-w-56">
                      {t.descricao}
                      {t.recorrente_id && (
                        <span
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-[var(--borda)] px-1.5 align-middle text-[11px] font-normal text-[var(--texto-suave)]"
                          title="Lançada no dia 1 pelo contrato fixo (módulo Contratos)"
                        >
                          <Icone nome="atualizar" className="h-3 w-3" />
                          Contrato fixo
                        </span>
                      )}
                      <span className="block text-xs font-normal text-[var(--texto-suave)]">
                        {nomes.categoria.get(t.categoria_id)}
                        {t.documento && ` · doc. ${t.documento}`}
                      </span>
                    </td>
                    <td data-rotulo={T.pessoa} className="min-w-32">
                      {nomes.pessoa.get(t.pessoa_id ?? "") ?? "—"}
                    </td>
                    <td data-rotulo="Valor" className="whitespace-nowrap text-right">
                      <Valor v={Number(t.valor)} />
                    </td>
                    <td data-rotulo="Falta" className="whitespace-nowrap text-right font-medium">
                      {s === "cancelado" ? "—" : <Valor v={saldo} />}
                    </td>
                    <td data-rotulo="Situação">
                      <Chip tom={SITUACOES[s].tom}>{SITUACOES[s].nome}</Chip>
                    </td>
                    <td className="celula-acoes whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        {podeOperar && t.situacao === "aberto" && (
                          <button className="btn !min-h-8 !px-3" onClick={() => setJanela({ tipo: "baixar", t })}>
                            <Icone nome="check" className="h-4 w-4" />
                            {T.verbo}
                          </button>
                        )}
                        <BotaoVerCaminho compacto aoClicar={() => setJanela({ tipo: "caminho", t })} />
                        <details className="relative">
                          <summary
                            className="btn !min-h-8 list-none !px-2.5 [&::-webkit-details-marker]:hidden"
                            aria-label="Mais ações"
                            title="Mais ações"
                          >
                            ⋯
                          </summary>
                          <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border border-[var(--borda)] bg-white p-1 text-left text-sm shadow-lg">
                            <button
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--fundo)]"
                              onClick={(e) => menu(e, { tipo: "historico", t })}
                            >
                              <Icone nome="relogio" className="h-4 w-4 text-[var(--texto-suave)]" />
                              Histórico de pagamentos
                            </button>
                            {podeOperar && t.situacao === "aberto" && (
                              <button
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--fundo)]"
                                onClick={(e) => menu(e, { tipo: "editar", t })}
                              >
                                <Icone nome="editar" className="h-4 w-4 text-[var(--texto-suave)]" />
                                Editar
                              </button>
                            )}
                            {podeOperar && t.situacao === "aberto" && Number(t.valor_pago) === 0 && (
                              <button
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--perigo)] hover:bg-red-50"
                                onClick={(e) => menu(e, { tipo: "cancelar", t })}
                              >
                                <Icone nome="fechar" className="h-4 w-4" />
                                Cancelar lançamento
                              </button>
                            )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={3} className="celula-titulo">
                    Total ({lista.length})
                  </td>
                  <td data-rotulo="Valor" className="text-right">
                    <Valor v={totalLista} />
                  </td>
                  <td data-rotulo="Falta" className="text-right">
                    <Valor v={saldoLista} />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}

      {janela && cliente && cad.dados && (janela.tipo === "novo" || janela.tipo === "editar") && (
        <LancarTitulo
          tipo={tipo}
          cliente={cliente}
          cad={cad.dados}
          aoRecarregarCadastros={cad.recarregar}
          hoje={hoje}
          editar={janela.tipo === "editar" ? janela.t : undefined}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
      {janela?.tipo === "baixar" && cad.dados && (
        <BaixarTitulo titulo={janela.t} contas={cad.dados.contas} hoje={hoje} aoFechar={() => fechar()} aoSalvar={fechar} />
      )}
      {janela?.tipo === "historico" && cad.dados && (
        <HistoricoTitulo titulo={janela.t} contas={cad.dados.contas} podeOperar={podeOperar} aoFechar={() => fechar()} aoMudar={fechar} />
      )}
      {janela?.tipo === "caminho" && cliente && (
        <ArvoreDocumento
          ponto={{ tipo: "titulo", id: janela.t.id }}
          clienteId={cliente.id}
          empresa={nomeCliente(cliente)}
          titulo={`${tipo === "pagar" ? "Conta a pagar" : "Conta a receber"}: ${janela.t.descricao}`}
          aoFechar={() => fechar()}
        />
      )}
      {janela?.tipo === "cancelar" && (
        <JanelaMotivo
          titulo="Cancelar lançamento"
          descricao={`${janela.t.descricao} · ${brl(Number(janela.t.valor))} · vence ${fmtData(janela.t.vencimento)}. Ele sai das contas em aberto, mas fica guardado.`}
          botao="Cancelar lançamento"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await cancelarTitulo(janela.t.id, motivo);
            fechar("Lançamento cancelado.");
          }}
        />
      )}
    </div>
  );
}
