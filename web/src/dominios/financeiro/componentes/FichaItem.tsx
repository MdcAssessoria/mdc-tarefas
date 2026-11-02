// Ficha de estoque (kardex) de um item: saldo anterior, cada entrada e saída com o saldo e o custo médio logo depois,
// e o valor do estoque. Os números vêm do banco (app.est_recalcular), na ordem das datas. PDF e Excel.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { lerFicha, lerSaldoAnterior } from "../leituras";
import { intervaloDoPeriodo } from "../regras";
import type { Periodo } from "../regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { MovimentoEstoque } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import type { PropsAba } from "./Comuns";
import { ORIGENS, qtd, TIPOS_MOV } from "./estoqueBase";
import type { BaseEstoque } from "./estoqueBase";

export function FichaItem({
  cliente,
  avisar,
  base,
  itemInicial,
}: Omit<PropsAba, "podeOperar"> & { base: BaseEstoque; itemInicial?: string }) {
  const { org } = useOrg();
  const hoje = hojeISO(org.fuso);
  const estocaveis = useMemo(
    () =>
      base.itens
        .filter((i) => i.controla_estoque || base.porItem.has(i.id))
        .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome)),
    [base],
  );
  const [item, setItem] = useState(itemInicial ?? "");
  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [estornados, setEstornados] = useState(false);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);
  const ficha = useConsulta(
    useCallback(async () => {
      if (!item) return null;
      const [movs, anterior] = await Promise.all([
        lerFicha(item, intervalo),
        intervalo.de ? lerSaldoAnterior(item, intervalo.de) : Promise.resolve({ saldo: 0, custo: null }),
      ]);
      return { movs, anterior };
    }, [item, intervalo]),
  );
  const it = base.itens.find((i) => i.id === item);
  const locais = useMemo(() => new Map(base.locais.map((l) => [l.id, l.nome])), [base.locais]);
  const linhas = (ficha.dados?.movs ?? []).filter((m) => estornados || !m.estornado);
  const validos = (ficha.dados?.movs ?? []).filter((m) => !m.estornado);
  const entradas = validos.filter((m) => m.quantidade > 0).reduce((a, m) => a + Number(m.quantidade), 0);
  const saidas = validos.filter((m) => m.quantidade < 0).reduce((a, m) => a - Number(m.quantidade), 0);
  const ultimo = validos.at(-1);
  const saldoFinal = ultimo ? Number(ultimo.saldo_apos ?? 0) : (ficha.dados?.anterior.saldo ?? 0);
  const cmFinal = ultimo ? ultimo.custo_medio_apos : (ficha.dados?.anterior.custo ?? null);
  const historico = (m: MovimentoEstoque) =>
    [TIPOS_MOV[m.tipo].nome, m.origem !== "manual" ? ORIGENS[m.origem] : null, m.observacao].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo min-w-64 flex-1">
          <span>Item</span>
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">Escolha o item…</option>
            {estocaveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo ? `${i.codigo} · ` : ""}
                {i.nome}
                {i.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
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
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={estornados} onChange={(e) => setEstornados(e.target.checked)} />
          Mostrar estornados
        </label>
        <div className="ml-auto flex gap-2">
          <BotoesExportar
            vazio={!it || !linhas.length}
            avisar={avisar}
            montar={() => ({
              titulo: `Ficha de estoque · ${it?.nome ?? ""}`,
              subtitulo: `${nomeCliente(cliente)} · ${it?.codigo ? `cód. ${it.codigo} · ` : ""}${it?.unidade ?? ""} · ${
                intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? hoje)}` : "todo o período"
              } · saldo anterior ${qtd(ficha.dados?.anterior.saldo)}`,
              arquivo: nomeArquivo("Ficha-estoque", it?.nome ?? "", hoje),
              logoUrl: org.logo_url,
              linhas,
              colunas: [
                { titulo: "Data", valor: (m) => fmtData(m.data), peso: 0.9, largura: 12 },
                { titulo: "Histórico", valor: (m) => (m.estornado ? `ESTORNADO · ${historico(m)}` : historico(m)), peso: 3, largura: 40 },
                { titulo: "Estoque", valor: (m) => locais.get(m.local_id) ?? "", peso: 1.2, largura: 18 },
                { titulo: "Entrada", valor: (m) => (m.quantidade > 0 ? Number(m.quantidade) : null), formato: "numero", peso: 0.9 },
                { titulo: "Saída", valor: (m) => (m.quantidade < 0 ? -Number(m.quantidade) : null), formato: "numero", peso: 0.9 },
                { titulo: "Custo unit.", valor: (m) => m.custo_unitario, formato: "moeda", peso: 1 },
                { titulo: "Saldo", valor: (m) => (m.estornado ? null : Number(m.saldo_apos ?? 0)), formato: "numero", peso: 0.9 },
                { titulo: "Custo médio", valor: (m) => (m.estornado ? null : m.custo_medio_apos), formato: "moeda", peso: 1 },
                {
                  titulo: "Valor do saldo",
                  valor: (m) => (m.estornado ? null : Math.round(Number(m.saldo_apos ?? 0) * Number(m.custo_medio_apos ?? 0) * 100) / 100),
                  formato: "moeda",
                  peso: 1.1,
                },
              ],
            })}
          />
        </div>
      </div>
      {!item ? (
        <EstadoVazio>Escolha um item para ver a ficha: cada entrada e saída, com o saldo e o custo médio depois de cada uma.</EstadoVazio>
      ) : ficha.erro ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{ficha.erro}</p>
      ) : ficha.carregando && !ficha.dados ? (
        <Carregando />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Indicador icone="calendario" titulo="Saldo anterior" valor={`${qtd(ficha.dados?.anterior.saldo)} ${it?.unidade ?? ""}`} />
            <Indicador icone="seta-entrada" titulo="Entradas no período" valor={qtd(entradas)} tom="verde" />
            <Indicador icone="seta-saida" titulo="Saídas no período" valor={qtd(saidas)} tom={saidas ? "vermelho" : "neutro"} />
            <Indicador
              icone="caixa"
              titulo="Saldo final e valor"
              valor={`${qtd(saldoFinal)} ${it?.unidade ?? ""}`}
              detalhe={
                cmFinal != null ? `custo médio ${brl(Number(cmFinal))} · ${brl(saldoFinal * Number(cmFinal))}` : "sem custo informado"
              }
            />
          </div>
          {!linhas.length ? (
            <EstadoVazio>Nenhum movimento deste item no período.</EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Histórico</th>
                    <th className="text-right">Entrada</th>
                    <th className="text-right">Saída</th>
                    <th className="text-right">Saldo</th>
                    <th className="text-right" title="Custo médio ponderado depois do movimento">
                      Custo médio
                    </th>
                    <th className="text-right">Valor do saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((m) => (
                    <tr key={m.id} className={m.estornado ? "text-neutral-400 line-through" : ""}>
                      <td className="whitespace-nowrap tabular-nums">{fmtData(m.data)}</td>
                      <td className="min-w-56">
                        {historico(m)}
                        <span className="block text-xs text-neutral-500">
                          {locais.get(m.local_id)}
                          {m.custo_unitario != null && ` · custo ${brl(Number(m.custo_unitario))}`}
                          {m.estornado && ` · estornado: ${m.estorno_motivo ?? ""}`}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums text-emerald-800">
                        {m.quantidade > 0 ? qtd(m.quantidade) : ""}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums text-red-700">
                        {m.quantidade < 0 ? qtd(-m.quantidade) : ""}
                      </td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">{m.estornado ? "" : qtd(m.saldo_apos)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {m.estornado || m.custo_medio_apos == null ? "" : brl(Number(m.custo_medio_apos))}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {m.estornado || m.custo_medio_apos == null ? "" : brl(Number(m.saldo_apos ?? 0) * Number(m.custo_medio_apos))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
