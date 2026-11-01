// Tela de Contas a pagar / Contas a receber (a mesma tela para os dois, muda o tipo). Filtros simples (período do
// vencimento, situação, fornecedor/cliente, categoria, busca), indicadores clicáveis, lista com ações (pagar/receber,
// editar, histórico, cancelar), frase de resumo, PDF e Excel do que está filtrado.
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { EscolhaCliente, useClienteFinanceiro } from "./EscolhaCliente";
import { BotoesExportar, FiltroPeriodo, Indicador, JanelaMotivo } from "./Comuns";
import { LancarTitulo, TEXTOS } from "./LancarTitulo";
import { BaixarTitulo, HistoricoTitulo } from "./BaixaTitulo";
import { lerCategorias, lerCentros, lerContas, lerPessoas, lerTitulos } from "../leituras";
import { cancelarTitulo } from "../repositorio";
import { intervaloDoPeriodo, saldoDoTitulo, SITUACOES, situacaoDoTitulo } from "../regras";
import type { Periodo, SituacaoExibida } from "../regras";
import { nomeArquivo } from "../exportar";
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
  | { tipo: "cancelar"; t: Titulo };

export function TelaTitulos({ tipo }: { tipo: TipoTitulo }) {
  const { org, pode } = useOrg();
  const financeiro = useClienteFinanceiro();
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
  const [janela, setJanela] = useState<Janela | null>(null);
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
    if (msg) {
      mostrar(msg);
      consulta.recarregar();
      cad.recarregar();
    }
  }

  const semCategoria = cad.dados && !cad.dados.categorias.some((c) => c.ativo && c.tipo === (tipo === "pagar" ? "despesa" : "receita"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">{T.titulo}</h1>
          <p className="text-sm text-neutral-600">
            {tipo === "pagar"
              ? "O que a empresa tem para pagar: vencimentos, pagamentos e atrasos."
              : "O que a empresa tem para receber: vencimentos, recebimentos e atrasos."}
          </p>
        </div>
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
              { titulo: "Documento", valor: (x) => x.t.documento ?? "", peso: 1, largura: 14 },
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
            Nova {T.conta}
          </button>
        )}
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
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
        <details className="w-full sm:w-auto">
          <summary className="cursor-pointer py-2 text-sm text-neutral-700">Mais filtros</summary>
          <div className="mt-2 flex flex-wrap gap-3">
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
          </div>
        </details>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Descrição, documento, ${T.pessoa.toLowerCase()} ou valor`}
          />
        </label>
        {(pessoa || categoria || busca || situacao !== "abertos" || periodo !== "tudo") && (
          <button
            className="btn-link min-h-10 text-sm"
            onClick={() => {
              setPessoa("");
              setCategoria("");
              setBusca("");
              setSituacao("abertos");
              setPeriodo("tudo");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {aviso}
      {(consulta.erro || cad.erro) && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro ?? cad.erro}</p>}

      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima para ver as {T.titulo.toLowerCase()} dela.</EstadoVazio>
      ) : consulta.carregando && !consulta.dados ? (
        <Carregando />
      ) : (
        <>
          {semCategoria && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Antes do primeiro lançamento, cadastre as {tipo === "pagar" ? "despesas" : "receitas"} da empresa em{" "}
              <Link className="underline" href="/financeiro/cadastros">
                Cadastros
              </Link>{" "}
              (cada uma ligada a uma conta do plano do Domínio).
            </p>
          )}
          <p className="text-sm text-neutral-700">{resumo}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              titulo="Vencido"
              valor={brl(vencido)}
              detalhe={`${qtdVencido} lançamento(s)`}
              tom={vencido ? "vermelho" : "neutro"}
              ativo={situacao === "vencido"}
              aoClicar={() => setSituacao(situacao === "vencido" ? "abertos" : "vencido")}
            />
            <Indicador
              titulo="A vencer"
              valor={brl(aVencer)}
              tom="ambar"
              ativo={situacao === "a_vencer"}
              aoClicar={() => setSituacao(situacao === "a_vencer" ? "abertos" : "a_vencer")}
            />
            <Indicador
              titulo={`${T.feito} (neste filtro)`}
              valor={brl(pago)}
              tom="verde"
              ativo={situacao === "quitado"}
              aoClicar={() => setSituacao(situacao === "quitado" ? "abertos" : "quitado")}
            />
          </div>

          {!lista.length ? (
            <EstadoVazio
              acao={
                podeOperar &&
                !consulta.dados?.length &&
                !semCategoria && (
                  <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
                    Lançar a primeira
                  </button>
                )
              }
            >
              {consulta.dados?.length ? "Nada neste filtro. Troque a situação ou o período." : `Nenhuma ${T.conta} lançada ainda.`}
            </EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Descrição</th>
                    <th>{T.pessoa}</th>
                    <th className="text-right">Valor</th>
                    <th className="text-right">Falta</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, MOSTRAR).map(({ t, s, saldo }) => (
                    <tr key={t.id} className={s === "cancelado" ? "opacity-60" : ""}>
                      <td className={`whitespace-nowrap tabular-nums ${s === "vencido" ? "font-medium text-red-700" : ""}`}>
                        {fmtData(t.vencimento)}
                      </td>
                      <td className="min-w-56">
                        {t.descricao}
                        <span className="block text-xs text-neutral-500">
                          {nomes.categoria.get(t.categoria_id)}
                          {t.documento && ` · doc. ${t.documento}`}
                        </span>
                      </td>
                      <td className="min-w-32">{nomes.pessoa.get(t.pessoa_id ?? "") ?? "—"}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{brl(Number(t.valor))}</td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">{s === "cancelado" ? "—" : brl(saldo)}</td>
                      <td>
                        <span className={`chip ${SITUACOES[s].tom}`}>{SITUACOES[s].nome}</span>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          {podeOperar && t.situacao === "aberto" && (
                            <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "baixar", t })}>
                              {T.verbo}
                            </button>
                          )}
                          <details className="relative">
                            <summary className="btn !min-h-8 list-none" aria-label="Mais ações">
                              ⋯
                            </summary>
                            <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-[var(--borda)] bg-white py-1 text-left text-sm shadow-lg">
                              <button
                                className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                                onClick={(e) => menu(e, { tipo: "historico", t })}
                              >
                                Histórico de pagamentos
                              </button>
                              {podeOperar && t.situacao === "aberto" && (
                                <button
                                  className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                                  onClick={(e) => menu(e, { tipo: "editar", t })}
                                >
                                  Editar
                                </button>
                              )}
                              {podeOperar && t.situacao === "aberto" && Number(t.valor_pago) === 0 && (
                                <button
                                  className="block w-full px-3 py-1.5 text-left text-[var(--perigo)] hover:bg-red-50"
                                  onClick={(e) => menu(e, { tipo: "cancelar", t })}
                                >
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
                    <td colSpan={3}>Total ({lista.length})</td>
                    <td className="text-right tabular-nums">{brl(totalLista)}</td>
                    <td className="text-right tabular-nums">{brl(saldoLista)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              {lista.length > MOSTRAR && (
                <p className="p-3 text-xs text-neutral-500">
                  Mostrando {MOSTRAR} de {lista.length}. Os totais e a exportação consideram todos.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {janela && cliente && cad.dados && (janela.tipo === "novo" || janela.tipo === "editar") && (
        <LancarTitulo
          tipo={tipo}
          cliente={cliente}
          cad={cad.dados}
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
