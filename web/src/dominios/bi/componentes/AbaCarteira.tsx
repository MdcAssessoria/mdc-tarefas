// BI › Pedidos em carteira (117): pedidos de venda do Omie. Cartões do período (quanto entrou, quanto já foi atendido,
// o que está em carteira e atrasado), previsão de entrega da carteira, volume por cliente e a lista dos pedidos, com
// pesquisa, filtro por situação e Excel/PDF. Regras em ../carteira.ts.
"use client";

import { useCallback, useMemo, useState } from "react";
import { fmtData } from "@/lib/formato/datas";
import { brl } from "@/lib/formato/moeda";
import { useConsulta } from "@/lib/useConsulta";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { Abas } from "@/components/ui/Abas";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import {
  carteiraPorMes,
  faixasPrevisao,
  filtrarPedidos,
  NOME_SITUACAO,
  nomeCliente,
  resumirCarteira,
  situacao,
  volumePorCliente,
} from "../carteira";
import type { PedidoCarteira, SituacaoPedido, VolumeCliente } from "../carteira";
import { lerCarteira } from "../dados";
import { GraficoBarras } from "./GraficoBarras";
import type { ContextoBi } from "./contexto";

type Sub = "resumo" | "clientes" | "pedidos";
const TOM: Record<SituacaoPedido, "verde" | "vermelho" | "azul"> = { atendido: "verde", atrasado: "vermelho", carteira: "azul" };
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Cartao({ titulo, valor, linha, tom = "" }: { titulo: string; valor: string; linha: string; tom?: string }) {
  return (
    <div className="rounded-xl border border-[var(--borda)] bg-white p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{titulo}</p>
      <p className={`num mt-1 text-2xl font-semibold tracking-tight ${tom}`}>{valor}</p>
      <p className="mt-1 text-xs text-[var(--texto-suave)]">{linha}</p>
    </div>
  );
}

export function AbaCarteira({ c }: { c: ContextoBi }) {
  const [sub, setSub] = useState<Sub>("resumo");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<SituacaoPedido | "todos">("todos");
  const dados = useConsulta(useCallback(async () => (await lerCarteira(c.ids, c.de, c.ate)) ?? [], [c.ids, c.de, c.ate]));
  const ps = useMemo(() => dados.dados ?? [], [dados.dados]);
  const resumo = useMemo(() => resumirCarteira(ps, c.de, c.ate, c.hoje), [ps, c.de, c.ate, c.hoje]);
  const faixas = useMemo(() => faixasPrevisao(ps, c.hoje), [ps, c.hoje]);
  const porMes = useMemo(() => carteiraPorMes(ps), [ps]);
  const clientes = useMemo(() => volumePorCliente(ps, c.de, c.ate, c.hoje), [ps, c.de, c.ate, c.hoje]);
  const clientesVisiveis = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    return t ? clientes.filter((x) => x.cliente.toLowerCase().includes(t) || (x.doc ?? "").includes(t.replace(/\D/g, "") || "§")) : clientes;
  }, [clientes, buscaCliente]);
  const lista = useMemo(
    () =>
      filtrarPedidos(ps, busca)
        .filter((p) => filtro === "todos" || situacao(p, c.hoje) === filtro)
        .sort((a, b) => (a.previsao ?? "9999").localeCompare(b.previsao ?? "9999") || Number(b.valor) - Number(a.valor)),
    [ps, busca, filtro, c.hoje],
  );
  const varias = c.ids.length > 1;

  const colunasPedidos: ColunaLista<PedidoCarteira>[] = [
    ...(varias ? [{ titulo: "Empresa", valor: (p: PedidoCarteira) => p.empresa, largura: 22 }] : []),
    { titulo: "Pedido", valor: (p) => p.numero ?? p.codigo_pedido, largura: 12 },
    { titulo: "Pedido do cliente", valor: (p) => p.numero_cliente ?? "", largura: 16 },
    { titulo: "Cliente", valor: (p) => nomeCliente(p), peso: 3, largura: 38 },
    { titulo: "Inclusão", valor: (p) => (p.inclusao ? fmtData(p.inclusao) : ""), largura: 12 },
    { titulo: "Previsão de entrega", valor: (p) => (p.previsao ? fmtData(p.previsao) : "Sem previsão"), largura: 14 },
    { titulo: "Etapa", valor: (p) => p.etapa_nome ?? (p.etapa ? `Etapa ${p.etapa}` : ""), largura: 18 },
    { titulo: "Situação", valor: (p) => NOME_SITUACAO[situacao(p, c.hoje)], largura: 12 },
    { titulo: "Faturado em", valor: (p) => (p.faturamento ? fmtData(p.faturamento) : ""), largura: 12 },
    { titulo: "Valor", valor: (p) => Number(p.valor) || 0, formato: "moeda" },
  ];
  const colunasClientes: ColunaLista<VolumeCliente>[] = [
    { titulo: "Cliente", valor: (x) => x.cliente, peso: 3, largura: 40 },
    { titulo: "Pedidos no período", valor: (x) => x.pedidosPeriodo, formato: "numero", largura: 12 },
    { titulo: "Valor no período", valor: (x) => x.valorPeriodo, formato: "moeda" },
    { titulo: "Atendido", valor: (x) => x.atendidoPeriodo, formato: "moeda" },
    { titulo: "% atendido", valor: (x) => pct(x.pctAtendido), largura: 10 },
    { titulo: "Em carteira", valor: (x) => x.carteira, formato: "moeda" },
    { titulo: "Atrasado", valor: (x) => x.atrasado, formato: "moeda", alerta: (x) => x.atrasado > 0 },
    { titulo: "Próxima entrega", valor: (x) => (x.proximaPrevisao ? fmtData(x.proximaPrevisao) : ""), largura: 14 },
  ];

  if (dados.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {dados.erro}
      </p>
    );
  if (!dados.dados) return <Esqueleto />;
  if (!ps.length)
    return (
      <EstadoVazio icone="carrinho" titulo="Nenhum pedido de venda">
        Não há pedidos em carteira nem pedidos que entraram ou foram faturados entre {c.rotuloPeriodo}. Os pedidos vêm do Omie
        (Vendas › Pedidos de venda) e chegam na atualização automática; se a empresa acabou de ser ligada, aguarde a carga terminar.
      </EstadoVazio>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao titulo="Pedidos no período" valor={brl(resumo.periodo.valor)} linha={`${resumo.periodo.qtd} pedido(s) que entraram em ${c.rotuloPeriodo}`} />
        <Cartao
          titulo="Já atendido"
          valor={pct(resumo.pctAtendido)}
          linha={`${brl(resumo.atendidos.valor)} faturados de ${resumo.atendidos.qtd} pedido(s) do período`}
          tom="text-[var(--sucesso)]"
        />
        <Cartao titulo="Em carteira hoje" valor={brl(resumo.carteira.valor)} linha={`${resumo.carteira.qtd} pedido(s) sem faturar, de qualquer data`} />
        <Cartao
          titulo="Atrasados"
          valor={brl(resumo.atrasados.valor)}
          linha={`${resumo.atrasados.qtd} pedido(s) com a previsão de entrega vencida`}
          tom={resumo.atrasados.qtd ? "text-[var(--perigo)]" : ""}
        />
      </div>

      <Abas
        rotulo="Visão da carteira"
        valor={sub}
        aoMudar={setSub}
        itens={[
          { id: "resumo", nome: "Previsão de entrega" },
          { id: "clientes", nome: "Volume por cliente" },
          { id: "pedidos", nome: "Pedidos" },
        ]}
      />

      {sub === "resumo" && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {faixas.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={!f.qtd}
                onClick={() => {
                  setFiltro(f.id === "atrasado" ? "atrasado" : "todos");
                  setBusca("");
                  setSub("pedidos");
                }}
                className={`rounded-xl border bg-white p-3 text-left enabled:hover:border-[var(--marca)] disabled:opacity-60 ${f.id === "atrasado" && f.qtd ? "border-red-200" : "border-[var(--borda)]"}`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{f.nome}</span>
                <span className={`num mt-1 block text-lg font-semibold ${f.id === "atrasado" && f.qtd ? "text-[var(--perigo)]" : ""}`}>{brl(f.valor)}</span>
                <span className="text-xs text-[var(--texto-suave)]">{f.qtd} pedido(s)</span>
              </button>
            ))}
          </div>
          {porMes.length > 0 && (
            <GraficoBarras
              titulo="Carteira por mês da previsão de entrega"
              meses={porMes.map((m) => m.mes)}
              series={[{ nome: "Em carteira", cor: "#0B2820", valores: porMes.map((m) => m.valor) }]}
            />
          )}
          <p className="text-xs text-[var(--texto-suave)]">
            Atendido = pedido faturado no Omie. A previsão de entrega é a data de previsão do pedido no Omie; pedido sem faturar com essa
            data já passada conta como atrasado.
          </p>
        </div>
      )}

      {sub === "clientes" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="campo flex-1 sm:max-w-sm">
              <span>Pesquisar cliente</span>
              <input type="search" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} placeholder="Nome ou CNPJ" />
            </label>
            <div className="sm:ml-auto">
              <BotoesExportar
                vazio={!clientesVisiveis.length}
                avisar={c.avisar}
                montar={() => ({
                  titulo: `Pedidos por cliente · ${c.quem}`,
                  subtitulo: `Período: ${c.rotuloPeriodo} · carteira na data de hoje`,
                  arquivo: nomeArquivo("BI-pedidos-por-cliente", c.quem, c.hoje),
                  logoUrl: c.logoUrl,
                  paisagem: true,
                  linhas: clientesVisiveis,
                  colunas: colunasClientes,
                })}
              />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[var(--borda)]">
            <table className="tabela w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Cliente</th>
                  <th className="text-right">Pedidos</th>
                  <th className="text-right">Valor no período</th>
                  <th className="text-right">Atendido</th>
                  <th className="text-right">Em carteira</th>
                  <th className="text-right">Atrasado</th>
                  <th className="text-left">Próxima entrega</th>
                </tr>
              </thead>
              <tbody>
                {clientesVisiveis.map((x) => (
                  <tr key={x.chave}>
                    <td>
                      <button
                        type="button"
                        className="text-left font-medium text-[var(--marca)] hover:underline"
                        onClick={() => {
                          setBusca(x.cliente);
                          setFiltro("todos");
                          setSub("pedidos");
                        }}
                      >
                        {x.cliente}
                      </button>
                    </td>
                    <td className="num text-right">{x.pedidosPeriodo}</td>
                    <td className="num text-right">{brl(x.valorPeriodo)}</td>
                    <td className="num text-right">
                      {brl(x.atendidoPeriodo)} <span className="text-xs text-[var(--texto-suave)]">{pct(x.pctAtendido)}</span>
                    </td>
                    <td className="num text-right">{brl(x.carteira)}</td>
                    <td className={`num text-right ${x.atrasado ? "text-[var(--perigo)]" : ""}`}>{brl(x.atrasado)}</td>
                    <td>{x.proximaPrevisao ? fmtData(x.proximaPrevisao) : "—"}</td>
                  </tr>
                ))}
                {!clientesVisiveis.length && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-[var(--texto-suave)]">
                      Nenhum cliente com &quot;{buscaCliente}&quot;. Troque a pesquisa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sub === "pedidos" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <label className="campo flex-1 lg:max-w-sm">
              <span>Pesquisar pedido</span>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, cliente, CNPJ ou etapa" />
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Situação do pedido">
              {(["todos", "carteira", "atrasado", "atendido"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={`chip flex items-center gap-1.5 border ${filtro === f ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white"}`}
                >
                  {filtro === f && <Icone nome="check" className="h-3.5 w-3.5" />}
                  {f === "todos" ? "Todos" : NOME_SITUACAO[f]}
                </button>
              ))}
            </div>
            <div className="lg:ml-auto">
              <BotoesExportar
                vazio={!lista.length}
                avisar={c.avisar}
                montar={() => ({
                  titulo: `Pedidos de venda · ${c.quem}`,
                  subtitulo: `${filtro === "todos" ? "Todos" : NOME_SITUACAO[filtro]} · período ${c.rotuloPeriodo}`,
                  arquivo: nomeArquivo("BI-pedidos", c.quem, c.hoje),
                  logoUrl: c.logoUrl,
                  paisagem: true,
                  linhas: lista,
                  colunas: colunasPedidos,
                })}
              />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[var(--borda)]">
            <table className="tabela w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Pedido</th>
                  <th className="text-left">Cliente</th>
                  <th className="text-left">Previsão</th>
                  <th className="text-left">Etapa</th>
                  <th className="text-left">Situação</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, 500).map((p) => {
                  const s = situacao(p, c.hoje);
                  return (
                    <tr key={`${p.cliente_id}:${p.codigo_pedido}`}>
                      <td>
                        <span className="font-medium">{p.numero ?? p.codigo_pedido}</span>
                        {p.numero_cliente && <span className="block text-xs text-[var(--texto-suave)]">Cliente: {p.numero_cliente}</span>}
                        {varias && <span className="block text-xs text-[var(--texto-suave)]">{p.empresa}</span>}
                      </td>
                      <td>{nomeCliente(p)}</td>
                      <td>
                        {p.previsao ? fmtData(p.previsao) : "Sem previsão"}
                        {p.faturamento && <span className="block text-xs text-[var(--texto-suave)]">Faturado em {fmtData(p.faturamento)}</span>}
                      </td>
                      <td>{p.etapa_nome ?? (p.etapa ? `Etapa ${p.etapa}` : "—")}</td>
                      <td>
                        <Chip tom={TOM[s]}>{NOME_SITUACAO[s]}</Chip>
                      </td>
                      <td className="num text-right">{brl(Number(p.valor) || 0)}</td>
                    </tr>
                  );
                })}
                {!lista.length && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-[var(--texto-suave)]">
                      Nenhum pedido com essa pesquisa ou situação. Troque a pesquisa ou toque em Todos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {lista.length > 500 && (
            <p className="text-xs text-[var(--texto-suave)]">Mostrando 500 de {lista.length} pedidos na tela; o Excel e o PDF levam todos.</p>
          )}
        </div>
      )}
    </div>
  );
}
