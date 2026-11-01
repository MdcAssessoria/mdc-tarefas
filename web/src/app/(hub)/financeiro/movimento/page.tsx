// Financeiro › Entradas e saídas: o dinheiro que entrou e saiu de verdade (pagamentos e recebimentos registrados),
// por período, com filtros de conta, tipo e categoria, totais, "para onde foi o dinheiro" por categoria e,
// opcionalmente, o que ainda está previsto (contas em aberto que vencem no período). Botões para lançar uma
// entrada ou saída à vista (cria a conta já paga). PDF e Excel do que está filtrado.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { BotoesExportar, FiltroPeriodo, Indicador } from "@/dominios/financeiro/componentes/Comuns";
import { LancarTitulo } from "@/dominios/financeiro/componentes/LancarTitulo";
import { lerBaixas, lerCategorias, lerCentros, lerContas, lerPessoas, lerTitulos, lerTitulosPorId } from "@/dominios/financeiro/leituras";
import { intervaloDoPeriodo, saldoDoTitulo } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/dominios/financeiro/exportar";
import type { TipoTitulo } from "@/dominios/financeiro/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
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
}
const MOSTRAR = 500;

export default function PaginaEntradasSaidas() {
  const { org, pode } = useOrg();
  const financeiro = useClienteFinanceiro();
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
      return { baixas, titulos, abertos };
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
    return [...reais, ...prev].sort((a, b) => a.data.localeCompare(b.data) || a.chave.localeCompare(b.chave));
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

  const real = useMemo(() => lista.filter((l) => !l.previsto), [lista]);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Entradas e saídas</h1>
          <p className="text-sm text-neutral-600">O dinheiro que entrou e saiu da empresa, e para onde ele foi.</p>
        </div>
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
              { titulo: "Situação", valor: (l: Linha) => (l.previsto ? "Previsto" : "Realizado"), peso: 1, largura: 12 },
            ],
            totais: { Entrada: entrou + prevEntra, Saída: saiu + prevSai },
          })}
        />
        {podeOperar && cliente && (
          <>
            <button className="btn" onClick={() => setNovo("receber")} disabled={!cad.dados}>
              + Entrada
            </button>
            <button className="btn-primario" onClick={() => setNovo("pagar")} disabled={!cad.dados}>
              + Saída
            </button>
          </>
        )}
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
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
        <details className="w-full sm:w-auto">
          <summary className="cursor-pointer py-2 text-sm text-neutral-700">Mais filtros</summary>
          <div className="mt-2 flex flex-wrap gap-3">
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
          </div>
        </details>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição, fornecedor/cliente ou valor" />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm" title="Mostra também as contas em aberto que vencem no período">
          <input type="checkbox" checked={previsto} onChange={(e) => setPrevisto(e.target.checked)} />
          Incluir o previsto
        </label>
      </div>

      {aviso}
      {(consulta.erro || cad.erro) && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro ?? cad.erro}</p>}

      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima para ver as entradas e saídas dela.</EstadoVazio>
      ) : (consulta.carregando && !consulta.dados) || !cad.dados ? (
        <Carregando />
      ) : (
        <>
          {resumo && <p className="text-sm text-neutral-700">{resumo}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              titulo="Entrou"
              valor={brl(entrou)}
              detalhe={previsto ? `+ ${brl(prevEntra)} previsto` : undefined}
              tom="verde"
              ativo={tipo === "entradas"}
              aoClicar={() => setTipo(tipo === "entradas" ? "" : "entradas")}
            />
            <Indicador
              titulo="Saiu"
              valor={brl(saiu)}
              detalhe={previsto ? `+ ${brl(prevSai)} previsto` : undefined}
              tom="vermelho"
              ativo={tipo === "saidas"}
              aoClicar={() => setTipo(tipo === "saidas" ? "" : "saidas")}
            />
            <Indicador
              titulo="Resultado"
              valor={brl(resultado)}
              detalhe={previsto ? `Com o previsto: ${brl(resultado + prevEntra - prevSai)}` : "Entradas menos saídas"}
              tom={resultado < 0 ? "vermelho" : "neutro"}
            />
          </div>

          {porCategoria.length > 0 && (
            <div className="cartao space-y-2 p-4">
              <h2 className="text-sm font-semibold text-[var(--marca)]">Para onde foi o dinheiro</h2>
              <p className="text-xs text-neutral-500">Clique numa categoria para ver só os lançamentos dela.</p>
              {porCategoria.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(categoria === c.id ? "" : c.id)}
                  className={`grid w-full grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3 rounded px-1 text-left text-sm hover:bg-neutral-50 ${categoria === c.id ? "bg-amber-50" : ""}`}
                >
                  <span className="truncate">{c.nome}</span>
                  <span className="h-3 rounded bg-neutral-100">
                    <span
                      className="block h-3 rounded bg-[var(--destaque-escuro)]"
                      style={{ width: `${Math.max(2, (c.total / maior) * 100)}%` }}
                    />
                  </span>
                  <span className="tabular-nums">{brl(c.total)}</span>
                </button>
              ))}
            </div>
          )}

          {!lista.length ? (
            <EstadoVazio>
              {linhas.length
                ? "Nada neste filtro."
                : "Nenhum pagamento ou recebimento neste período. Dê baixa em Contas a pagar/receber ou lance uma entrada ou saída à vista."}
            </EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
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
                    <tr key={l.chave} className={l.previsto ? "text-neutral-500" : ""}>
                      <td className="whitespace-nowrap tabular-nums">{fmtData(l.data)}</td>
                      <td className="min-w-56">
                        {l.descricao}
                        {l.previsto && <span className="chip ml-2 bg-sky-50 text-sky-900">Previsto</span>}
                        <span className="block text-xs text-neutral-500">{[l.categoria, l.pessoa].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="whitespace-nowrap">{l.conta || "—"}</td>
                      <td className={`whitespace-nowrap text-right tabular-nums ${l.valor < 0 ? "text-red-700" : "text-emerald-800"}`}>
                        {brl(l.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
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

      {novo && cliente && cad.dados && (
        <LancarTitulo
          tipo={novo}
          cliente={cliente}
          cad={cad.dados}
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
