// Estoque › Posição: quanto tem de cada item, em cada estoque, e quanto vale (saldo × custo médio). Filtros por
// estoque, grupo e situação (abaixo do mínimo, sem estoque); clicar no item abre a ficha. PDF e Excel.
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { combinaBusca, custoBase, qtdBr, situacaoSaldo, SITUACOES_SALDO } from "../estoqueRegras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { Item } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import type { PropsAba } from "./Comuns";
import { useBaseEstoque } from "./estoqueBase";
import { FichaItem } from "./FichaItem";

type Filtro = "" | "com_saldo" | "baixo" | "zerado";

export function EstoquePosicao({ cliente, avisar }: PropsAba) {
  const { org } = useOrg();
  const hoje = hojeISO(org.fuso);
  const base = useBaseEstoque(cliente.id);
  const [local, setLocal] = useState("");
  const [grupo, setGrupo] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("");
  const [busca, setBusca] = useState("");
  const [ficha, setFicha] = useState<Item | null>(null);
  const d = base.dados;

  const linhas = useMemo(() => {
    if (!d) return [];
    const nomeGrupo = new Map(d.grupos.map((g) => [g.id, g.nome]));
    const nomeLocal = new Map(d.locais.map((l) => [l.id, l.nome]));
    return d.itens
      .filter((i) => i.controla_estoque || d.porItem.has(i.id))
      .map((i) => {
        const porLocal = d.saldos.filter((s) => s.item_id === i.id && Number(s.saldo) !== 0);
        const saldo = local ? Number(porLocal.find((s) => s.local_id === local)?.saldo ?? 0) : (d.porItem.get(i.id) ?? 0);
        const custo = custoBase(i);
        return {
          i,
          saldo,
          custo,
          valor: Math.round(Math.max(0, saldo) * (custo ?? 0) * 100) / 100,
          situacao: situacaoSaldo(saldo, local ? 0 : Number(i.estoque_minimo), true),
          grupo: i.grupo_id ? (nomeGrupo.get(i.grupo_id) ?? "") : "",
          detalhe: local ? "" : porLocal.map((s) => `${nomeLocal.get(s.local_id) ?? "?"}: ${qtdBr(s.saldo)}`).join(" · "),
        };
      });
  }, [d, local]);
  const lista = linhas.filter(
    (x) =>
      (x.i.ativo || x.saldo !== 0) &&
      (!grupo || x.i.grupo_id === grupo) &&
      (!filtro ||
        (filtro === "com_saldo" && x.saldo !== 0) ||
        (filtro === "baixo" && x.situacao === "baixo") ||
        (filtro === "zerado" && (x.situacao === "zerado" || x.situacao === "negativo"))) &&
      combinaBusca([x.i.nome, x.i.codigo, x.i.codigo_barras, x.i.marca, x.grupo], busca),
  );
  const total = lista.reduce((a, x) => a + x.valor, 0);
  const todos = linhas.filter((x) => x.i.ativo);
  const nomeLocal = local ? (d?.locais.find((l) => l.id === local)?.nome ?? "") : "todos os estoques";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador
          icone="moeda"
          titulo={`Valor em estoque (${nomeLocal})`}
          valor={brl(todos.reduce((a, x) => a + x.valor, 0))}
          detalhe="saldo × custo médio"
          tom="verde"
        />
        <Indicador
          icone="caixa"
          titulo="Itens com saldo"
          valor={String(todos.filter((x) => x.saldo > 0).length)}
          ativo={filtro === "com_saldo"}
          aoClicar={() => setFiltro(filtro === "com_saldo" ? "" : "com_saldo")}
        />
        <Indicador
          icone="alerta"
          titulo="Abaixo do mínimo"
          valor={String(todos.filter((x) => x.situacao === "baixo").length)}
          tom="ambar"
          ativo={filtro === "baixo"}
          aoClicar={() => setFiltro(filtro === "baixo" ? "" : "baixo")}
        />
        <Indicador
          icone="cancelar"
          titulo="Sem estoque"
          valor={String(todos.filter((x) => x.situacao === "zerado" || x.situacao === "negativo").length)}
          tom="vermelho"
          ativo={filtro === "zerado"}
          aoClicar={() => setFiltro(filtro === "zerado" ? "" : "zerado")}
        />
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou grupo" />
        </label>
        <label className="campo">
          <span>Estoque</span>
          <select value={local} onChange={(e) => setLocal(e.target.value)}>
            <option value="">Todos (soma)</option>
            {(d?.locais ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Grupo</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {(d?.grupos ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        {(busca || local || grupo || filtro) && (
          <button
            className="btn-link pb-2 text-sm"
            onClick={() => {
              setBusca("");
              setLocal("");
              setGrupo("");
              setFiltro("");
            }}
          >
            Limpar
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: "Posição do estoque",
              subtitulo: `${nomeCliente(cliente)} · ${nomeLocal} · posição em ${fmtData(hoje)} · ${lista.length} item(ns) · valor ${brl(total)}`,
              arquivo: nomeArquivo("Posicao-estoque", nomeCliente(cliente), hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              totais: { Valor: total },
              colunas: [
                { titulo: "Código", valor: (x) => x.i.codigo ?? "", peso: 0.9, largura: 12 },
                { titulo: "Item", valor: (x) => x.i.nome, peso: 3, largura: 40 },
                { titulo: "Grupo", valor: (x) => x.grupo, peso: 1.2, largura: 16 },
                { titulo: "Un.", valor: (x) => x.i.unidade, peso: 0.5, largura: 6 },
                { titulo: "Saldo", valor: (x) => x.saldo, formato: "numero", peso: 0.9, alerta: (x) => x.situacao !== "ok" },
                { titulo: "Mínimo", valor: (x) => Number(x.i.estoque_minimo), formato: "numero", peso: 0.8 },
                { titulo: "Custo médio", valor: (x) => x.custo, formato: "moeda", peso: 1 },
                { titulo: "Valor", valor: (x) => x.valor, formato: "moeda", peso: 1.1 },
                { titulo: "Situação", valor: (x) => SITUACOES_SALDO[x.situacao].nome, peso: 1.1, largura: 16 },
              ],
            })}
          />
        </div>
      </div>
      {base.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{base.erro}</p>}
      {base.carregando && !d ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio>
          {linhas.length ? "Nenhum item com estes filtros." : "Nenhum item controla estoque ainda. Cadastre em Estoque › Itens."}
        </EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Situação</th>
                <th className="text-right">Saldo</th>
                <th className="text-right">Custo médio</th>
                <th className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.i.id} className="hover:bg-[var(--fundo)]">
                  <td className="min-w-56">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setFicha(x.i)}>
                      {x.i.nome}
                    </button>
                    <span className="block text-xs text-neutral-500">
                      {[x.i.codigo && `cód. ${x.i.codigo}`, x.grupo, x.detalhe].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${SITUACOES_SALDO[x.situacao].tom}`}>{SITUACOES_SALDO[x.situacao].nome}</span>
                    {x.situacao === "baixo" && <span className="block text-xs text-neutral-500">mínimo {qtdBr(x.i.estoque_minimo)}</span>}
                  </td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">
                    {qtdBr(x.saldo)} {x.i.unidade}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{x.custo != null ? brl(x.custo) : "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{brl(x.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4}>Total ({lista.length} itens)</td>
                <td className="text-right tabular-nums">{brl(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {d && ficha && (
        <Modal titulo={`Ficha de estoque · ${ficha.nome}`} aoFechar={() => setFicha(null)} largura="4xl">
          <FichaItem cliente={cliente} avisar={avisar} base={d} itemInicial={ficha.id} />
        </Modal>
      )}
    </div>
  );
}
