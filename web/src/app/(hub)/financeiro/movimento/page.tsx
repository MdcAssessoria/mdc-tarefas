// Financeiro › Entradas e saídas: o dinheiro que entrou e saiu de verdade (pagamentos e recebimentos registrados),
// por período, com filtros de conta, tipo e categoria, totais, "para onde foi o dinheiro" por categoria e,
// opcionalmente, o que ainda está previsto (contas em aberto que vencem no período). Botões para lançar uma
// entrada ou saída à vista (cria a conta já paga). PDF e Excel do que está filtrado.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { EscolhaCliente, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { Valor } from "@/components/ui/Valor";
import { LancarTitulo } from "@/dominios/financeiro/componentes/LancarTitulo";
import {
  lerBaixas,
  lerCategorias,
  lerCentros,
  lerContas,
  lerPessoas,
  lerTitulos,
  lerTitulosPorId,
  lerTransferencias,
} from "@/dominios/financeiro/leituras";
import { NovaTransferencia } from "@/dominios/financeiro/componentes/NovaTransferencia";

import { intervaloDoPeriodo, PERIODOS, saldoDoTitulo } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { TipoTitulo } from "@/dominios/financeiro/tipos";
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

interface Linha {
  chave: string;
  data: string;
  entrada: boolean;
  previsto: boolean;
  descricao: string;
  pessoa: string;
  categoria: string;
  categoriaId: string;
  conta: string;
  contaId: string | null;
  valor: number; // positivo = entrou, negativo = saiu
  /** Transferência entre contas da empresa: aparece na lista, mas não conta como entrada nem saída. */
  transferencia?: boolean;
}
const MOSTRAR = 500;

export default function PaginaEntradasSaidas() {
  const { org, pode } = useOrg();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const podeOperar = pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [conta, setConta] = useState("");
  const [tipo, setTipo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [previsto, setPrevisto] = useState(false);
  const [novo, setNovo] = useState<TipoTitulo | null>(null);
  const [transferindo, setTransferindo] = useState(false);
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
    useCallback(async () => {
      if (!cliente) return null;
      const baixas = (await lerBaixas(cliente.id, intervalo)).filter((b) => !b.estornada);
      const titulos = await lerTitulosPorId(baixas.map((b) => b.titulo_id));
      const abertos = previsto
        ? (await Promise.all([lerTitulos(cliente.id, "pagar", intervalo), lerTitulos(cliente.id, "receber", intervalo)]))
            .flat()
            .filter((t) => t.situacao === "aberto")
        : [];
      const transferencias = (await lerTransferencias(cliente.id, intervalo)).filter((t) => !t.estornada);
      return { baixas, titulos, abertos, transferencias };
    }, [cliente, intervalo, previsto]),
  );

  const linhas = useMemo<Linha[]>(() => {
    const d = consulta.dados;
    const c = cad.dados;
    if (!d || !c) return [];
    const tit = new Map(d.titulos.map((t) => [t.id, t]));
    const pessoa = new Map(c.pessoas.map((p) => [p.id, p.nome]));
    const cat = new Map(c.categorias.map((x) => [x.id, x.nome]));
    const cta = new Map(c.contas.map((x) => [x.id, x.nome]));
    const reais = d.baixas.flatMap((b) => {
      const t = tit.get(b.titulo_id);
      if (!t) return [];
      const entrada = t.tipo === "receber";
      const sinal = entrada ? 1 : -1;
      const comum = {
        data: b.data,
        entrada,
        previsto: false,
        descricao: t.descricao,
        pessoa: pessoa.get(t.pessoa_id ?? "") ?? "",
        conta: cta.get(b.conta_id) ?? "",
        contaId: b.conta_id,
      };
      // juros/multa e desconto ficam em linhas próprias (são resultado financeiro, não a despesa/receita do título)
      const encargos = Number(b.juros) + Number(b.multa);
      const linhasBaixa: Linha[] = [
        {
          ...comum,
          chave: `b${b.id}`,
          categoria: cat.get(t.categoria_id) ?? "",
          categoriaId: t.categoria_id,
          valor: sinal * Number(b.valor),
        },
      ];
      if (encargos > 0)
        linhasBaixa.push({
          ...comum,
          chave: `b${b.id}j`,
          descricao: `${t.descricao} (juros e multa)`,
          categoria: entrada ? "Juros e multas recebidos" : "Juros e multas pagos",
          categoriaId: entrada ? "_juros_recebidos" : "_juros_pagos",
          valor: sinal * encargos,
        });
      if (Number(b.desconto) > 0)
        linhasBaixa.push({
          ...comum,
          chave: `b${b.id}d`,
          entrada: !entrada,
          descricao: `${t.descricao} (desconto)`,
          categoria: entrada ? "Descontos concedidos" : "Descontos obtidos",
          categoriaId: entrada ? "_descontos_concedidos" : "_descontos_obtidos",
          valor: -sinal * Number(b.desconto),
        });
      return linhasBaixa;
    });
    const prev = d.abertos.map((t) => ({
      chave: `t${t.id}`,
      data: t.vencimento,
      entrada: t.tipo === "receber",
      previsto: true,
      descricao: t.descricao,
      pessoa: pessoa.get(t.pessoa_id ?? "") ?? "",
      categoria: cat.get(t.categoria_id) ?? "",
      categoriaId: t.categoria_id,
      conta: cta.get(t.conta_prevista_id ?? "") ?? "",
      contaId: t.conta_prevista_id,
      valor: (t.tipo === "receber" ? 1 : -1) * saldoDoTitulo(t),
    }));
    // transferência: sai de uma conta e entra na outra (duas linhas; somadas dão zero)
    const transf = d.transferencias.flatMap((t) => {
      const comum = {
        data: t.data,
        previsto: false,
        pessoa: "",
        categoria: "Transferência entre contas",
        categoriaId: "_transferencia",
        transferencia: true,
      };
      const de = cta.get(t.origem_id) ?? "";
      const para = cta.get(t.destino_id) ?? "";
      return [
        {
          ...comum,
          chave: `x${t.id}s`,
          entrada: false,
          descricao: `Transferência para ${para}`,
          conta: de,
          contaId: t.origem_id,
          valor: -Number(t.valor),
        },
        {
          ...comum,
          chave: `x${t.id}e`,
          entrada: true,
          descricao: `Transferência de ${de}`,
          conta: para,
          contaId: t.destino_id,
          valor: Number(t.valor),
        },
      ];
    });
    return [...reais, ...prev, ...transf].sort((a, b) => a.data.localeCompare(b.data) || a.chave.localeCompare(b.chave));
  }, [consulta.dados, cad.dados]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (l) =>
        (!conta || l.contaId === conta) &&
        (!tipo || (tipo === "entradas" ? l.entrada : !l.entrada)) &&
        (!categoria || l.categoriaId === categoria) &&
        (!q || l.descricao.toLowerCase().includes(q) || l.pessoa.toLowerCase().includes(q) || brl(Math.abs(l.valor)).includes(q)),
    );
  }, [linhas, conta, tipo, categoria, busca]);

  const real = useMemo(() => lista.filter((l) => !l.previsto && !l.transferencia), [lista]);
  const entrou = real.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0);
  const saiu = real.filter((l) => l.valor < 0).reduce((a, l) => a - l.valor, 0);
  const prevEntra = lista.filter((l) => l.previsto && l.valor > 0).reduce((a, l) => a + l.valor, 0);
  const prevSai = lista.filter((l) => l.previsto && l.valor < 0).reduce((a, l) => a - l.valor, 0);

  // para onde foi o dinheiro: saídas reais por categoria (as 8 maiores)
  const porCategoria = useMemo(() => {
    const m = new Map<string, { nome: string; id: string; total: number }>();
    for (const l of real.filter((x) => x.valor < 0)) {
      const x = m.get(l.categoriaId) ?? { nome: l.categoria || "Sem categoria", id: l.categoriaId, total: 0 };
      x.total -= l.valor;
      m.set(l.categoriaId, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [real]);
  const maior = porCategoria[0]?.total ?? 0;

  const rotuloPeriodo =
    intervalo.de || intervalo.ate
      ? `${fmtData(intervalo.de ?? "") || "início"} a ${fmtData(intervalo.ate ?? "") || "hoje"}`
      : "Todo o período";
  const resultado = entrou - saiu;
  const resumo =
    real.length || previsto
      ? `No período entrou ${brl(entrou)} e saiu ${brl(saiu)}; ${resultado >= 0 ? "sobrou" : "faltou"} ${brl(Math.abs(resultado))}.` +
        (porCategoria[0] ? ` O maior gasto foi ${porCategoria[0].nome} (${brl(porCategoria[0].total)}).` : "") +
        (previsto ? ` Ainda previsto: entrar ${brl(prevEntra)} e sair ${brl(prevSai)}.` : "")
      : "";

  function limparFiltros() {
    setPeriodo("mes");
    setConta("");
    setTipo("");
    setCategoria("");
    setBusca("");
    setPrevisto(false);
  }
  const nomeCategoria = (id: string) =>
    cad.dados?.categorias.find((c) => c.id === id)?.nome ?? linhas.find((l) => l.categoriaId === id)?.categoria ?? "—";
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "mes" && {
      id: "periodo",
      rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("mes"),
    },
    tipo && { id: "tipo", rotulo: tipo === "entradas" ? "Só entradas" : "Só saídas", aoTirar: () => setTipo("") },
    conta && { id: "conta", rotulo: `Conta: ${cad.dados?.contas.find((c) => c.id === conta)?.nome ?? "—"}`, aoTirar: () => setConta("") },
    categoria && { id: "categoria", rotulo: `Categoria: ${nomeCategoria(categoria)}`, aoTirar: () => setCategoria("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
    previsto && { id: "previsto", rotulo: "Com o previsto", aoTirar: () => setPrevisto(false) },
  ].filter((f): f is FiltroAtivo => !!f);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Entradas e saídas"
        descricao="O dinheiro que entrou e saiu da empresa, e para onde ele foi."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Entradas e saídas",
                subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${rotuloPeriodo}${previsto ? " · com previstos" : ""} · ${lista.length} lançamento(s)`,
                arquivo: nomeArquivo("Entradas-e-saidas", cliente ? nomeCliente(cliente) : "", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Data", valor: (l: Linha) => fmtData(l.data), peso: 1, largura: 12 },
                  { titulo: "Descrição", valor: (l: Linha) => l.descricao, peso: 3, largura: 40 },
                  { titulo: "Fornecedor/cliente", valor: (l: Linha) => l.pessoa, peso: 2, largura: 28 },
                  { titulo: "Categoria", valor: (l: Linha) => l.categoria, peso: 1.6, largura: 24 },
                  { titulo: "Conta", valor: (l: Linha) => l.conta, peso: 1.4, largura: 20 },
                  { titulo: "Entrada", valor: (l: Linha) => (l.valor > 0 ? l.valor : null), formato: "moeda", peso: 1.2 },
                  {
                    titulo: "Saída",
                    valor: (l: Linha) => (l.valor < 0 ? -l.valor : null),
                    formato: "moeda",
                    peso: 1.2,
                    alerta: (l: Linha) => l.valor < 0,
                  },
                  {
                    titulo: "Situação",
                    valor: (l: Linha) => (l.transferencia ? "Transferência" : l.previsto ? "Previsto" : "Realizado"),
                    peso: 1,
                    largura: 14,
                  },
                ],
                // transferências entre contas não entram nos totais (não são receita nem despesa)
                totais: { Entrada: entrou + prevEntra, Saída: saiu + prevSai },
              })}
            />
            {podeOperar && cliente && (
              <>
                {(cad.dados?.contas.filter((c) => c.ativo).length ?? 0) >= 2 && (
                  <button className="btn" onClick={() => setTransferindo(true)} title="Transferir entre contas da empresa">
                    <Icone nome="transferir" className="h-4 w-4" />
                    Transferência
                  </button>
                )}
                <button className="btn" onClick={() => setNovo("receber")} disabled={!cad.dados}>
                  <Icone nome="seta-entrada" className="h-4 w-4 text-emerald-700" />
                  Entrada
                </button>
                <button className="btn-primario" onClick={() => setNovo("pagar")} disabled={!cad.dados}>
                  <Icone nome="seta-saida" className="h-4 w-4" />
                  Saída
                </button>
              </>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <EscolhaCliente gestao={financeiro} />
        <FiltroPeriodo
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
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Entradas e saídas</option>
            <option value="entradas">Só entradas</option>
            <option value="saidas">Só saídas</option>
          </select>
        </label>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Descrição, fornecedor/cliente ou valor"
          />
        </label>
        <MaisFiltros emUso={(conta ? 1 : 0) + (categoria ? 1 : 0) + (previsto ? 1 : 0)}>
          <label className="campo">
            <span>Conta bancária</span>
            <select value={conta} onChange={(e) => setConta(e.target.value)}>
              <option value="">Todas</option>
              {(cad.dados?.contas ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Categoria</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {(cad.dados?.categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tipo === "despesa" ? "Despesa" : "Receita"} › {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm" title="Mostra também as contas em aberto que vencem no período">
            <input type="checkbox" checked={previsto} onChange={(e) => setPrevisto(e.target.checked)} />
            Incluir o previsto (contas em aberto do período)
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
        <EstadoVazio icone="moeda" titulo="Escolha a empresa">
          Escolha a empresa nos filtros acima para ver as entradas e saídas dela.
        </EstadoVazio>
      ) : (consulta.carregando && !consulta.dados) || !cad.dados ? (
        <Esqueleto />
      ) : (
        <>
          {resumo && <p className="text-sm text-[var(--texto)]">{resumo}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              titulo="Entrou"
              icone="seta-entrada"
              valor={brl(entrou)}
              detalhe={previsto ? `+ ${brl(prevEntra)} previsto` : undefined}
              tom="verde"
              ativo={tipo === "entradas"}
              aoClicar={() => setTipo(tipo === "entradas" ? "" : "entradas")}
            />
            <Indicador
              titulo="Saiu"
              icone="seta-saida"
              valor={brl(saiu)}
              detalhe={previsto ? `+ ${brl(prevSai)} previsto` : undefined}
              tom="vermelho"
              ativo={tipo === "saidas"}
              aoClicar={() => setTipo(tipo === "saidas" ? "" : "saidas")}
            />
            <Indicador
              titulo="Resultado"
              icone="tendencia"
              valor={brl(resultado)}
              detalhe={previsto ? `Com o previsto: ${brl(resultado + prevEntra - prevSai)}` : "Entradas menos saídas"}
              tom={resultado < 0 ? "vermelho" : "neutro"}
            />
          </div>

          {porCategoria.length > 0 && (
            <div className="cartao space-y-3 p-4 sm:p-5">
              <div>
                <h2 className="font-semibold text-[var(--marca)]">Para onde foi o dinheiro</h2>
                <p className="text-xs text-[var(--texto-suave)]">Clique numa categoria para ver só os lançamentos dela.</p>
              </div>
              {porCategoria.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(categoria === c.id ? "" : c.id)}
                  aria-pressed={categoria === c.id}
                  className={`grid w-full grid-cols-[minmax(6rem,14rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-[var(--fundo)] ${categoria === c.id ? "bg-[#faf5ea] ring-1 ring-[var(--destaque)]" : ""}`}
                >
                  <span className="truncate">{c.nome}</span>
                  <span className="h-2.5 rounded-full bg-[var(--fundo)]">
                    <span className="block h-2.5 rounded-full bg-[#C0892A]" style={{ width: `${Math.max(2, (c.total / maior) * 100)}%` }} />
                  </span>
                  <span className="num">{brl(c.total)}</span>
                </button>
              ))}
            </div>
          )}

          {!lista.length ? (
            <EstadoVazio
              icone={linhas.length ? "filtro" : "tendencia"}
              titulo={linhas.length ? "Nada neste filtro" : "Nenhum pagamento ou recebimento neste período"}
              acao={
                linhas.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : undefined
              }
            >
              {linhas.length
                ? "Troque o período ou limpe os filtros para ver tudo."
                : "Dê baixa em Contas a pagar ou a receber, ou lance uma entrada ou saída à vista nos botões acima."}
            </EstadoVazio>
          ) : (
            <QuadroTabela
              rotulo="Entradas e saídas"
              rodape={
                lista.length > MOSTRAR ? `Mostrando ${MOSTRAR} de ${lista.length}. Os totais e a exportação consideram todos.` : undefined
              }
            >
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, MOSTRAR).map((l) => (
                  <tr key={l.chave} className={l.previsto ? "text-[var(--texto-suave)]" : ""}>
                    <td data-rotulo="Data" className="num whitespace-nowrap">
                      {fmtData(l.data)}
                    </td>
                    <td className="celula-titulo min-w-56">
                      <span className="flex items-center gap-2">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${l.valor < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
                          aria-hidden="true"
                        >
                          <Icone nome={l.valor < 0 ? "seta-saida" : "seta-entrada"} className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          {l.descricao}
                          {l.previsto && (
                            <span className="ml-2 align-middle">
                              <Chip tom="azul">Previsto</Chip>
                            </span>
                          )}
                          {l.transferencia && (
                            <span className="ml-2 align-middle">
                              <Chip tom="violeta">Transferência</Chip>
                            </span>
                          )}
                          <span className="block text-xs font-normal text-[var(--texto-suave)]">
                            {[l.categoria, l.pessoa].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td data-rotulo="Conta" className="whitespace-nowrap">
                      {l.conta || "—"}
                    </td>
                    <td data-rotulo="Valor" className="whitespace-nowrap text-right font-medium">
                      <Valor v={l.valor} sinal />
                    </td>
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}

      {transferindo && cad.dados && (
        <NovaTransferencia
          contas={cad.dados.contas}
          hoje={hoje}
          aoFechar={() => setTransferindo(false)}
          aoSalvar={(msg) => {
            setTransferindo(false);
            mostrar(msg);
            consulta.recarregar();
          }}
        />
      )}
      {novo && cliente && cad.dados && (
        <LancarTitulo
          tipo={novo}
          cliente={cliente}
          cad={cad.dados}
          aoRecarregarCadastros={cad.recarregar}
          hoje={hoje}
          jaPago
          aoFechar={() => setNovo(null)}
          aoSalvar={(msg) => {
            setNovo(null);
            mostrar(msg);
            consulta.recarregar();
            cad.recarregar();
          }}
        />
      )}
    </div>
  );
}
