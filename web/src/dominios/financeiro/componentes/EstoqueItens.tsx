// Itens e estoque › aba Itens: cadastro de produtos e serviços com "controla estoque?", saldo, mínimo, custo e preço.
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { numeroBr, valorParaCampo } from "../regras";
import { nomeArquivo } from "../exportar";
import type { Item } from "../tipos";
import { BotoesExportar, Indicador } from "./Comuns";
import type { PropsAba } from "./Comuns";
import { qtd, useBaseEstoque } from "./estoqueBase";

// ------------------------------------------------------------------ itens

type FormItem = {
  id?: string;
  codigo: string;
  nome: string;
  tipo: "produto" | "servico";
  unidade: string;
  controla_estoque: boolean;
  estoque_minimo: string;
  preco_venda: string;
  custo: string;
  ncm: string;
  codigo_barras: string;
  categoria_receita_id: string;
  categoria_despesa_id: string;
  observacao: string;
  ativo: boolean;
};
const ITEM_VAZIO: FormItem = {
  codigo: "",
  nome: "",
  tipo: "produto",
  unidade: "UN",
  controla_estoque: true,
  estoque_minimo: "",
  preco_venda: "",
  custo: "",
  ncm: "",
  codigo_barras: "",
  categoria_receita_id: "",
  categoria_despesa_id: "",
  observacao: "",
  ativo: true,
};
const UNIDADES = ["UN", "KG", "G", "L", "ML", "M", "M2", "M3", "CX", "PC", "PAR", "DZ", "FD", "SC", "H"];

export function AbaItens({ cliente, podeOperar, avisar }: PropsAba) {
  const { org } = useOrg();
  const base = useBaseEstoque(cliente.id);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<FormItem | null>(null);
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(
    () =>
      (base.dados?.itens ?? []).map((i) => {
        const saldo = base.dados?.porItem.get(i.id) ?? 0;
        return {
          i,
          saldo,
          baixo: i.controla_estoque && i.ativo && saldo <= Number(i.estoque_minimo) && Number(i.estoque_minimo) > 0,
          zerado: i.controla_estoque && saldo <= 0,
        };
      }),
    [base.dados],
  );
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      ({ i, baixo }) =>
        (inativos || i.ativo) &&
        (!filtro ||
          (filtro === "estoque" && i.controla_estoque) ||
          (filtro === "sem_estoque" && !i.controla_estoque) ||
          (filtro === "baixo" && baixo) ||
          (filtro === "servico" && i.tipo === "servico")) &&
        (!q || i.nome.toLowerCase().includes(q) || (i.codigo ?? "").toLowerCase().includes(q) || (i.codigo_barras ?? "").includes(q)),
    );
  }, [linhas, busca, filtro, inativos]);
  const ativos = linhas.filter((x) => x.i.ativo);
  const valorEstoque = ativos.filter((x) => x.i.controla_estoque).reduce((a, x) => a + Math.max(0, x.saldo) * Number(x.i.custo ?? 0), 0);
  const qtdBaixo = ativos.filter((x) => x.baixo).length;

  function abrir(i?: Item) {
    setForm(
      i
        ? {
            id: i.id,
            codigo: i.codigo ?? "",
            nome: i.nome,
            tipo: i.tipo,
            unidade: i.unidade,
            controla_estoque: i.controla_estoque,
            estoque_minimo: Number(i.estoque_minimo) ? valorParaCampo(i.estoque_minimo, 0) : "",
            preco_venda: valorParaCampo(i.preco_venda),
            custo: valorParaCampo(i.custo),
            ncm: i.ncm ?? "",
            codigo_barras: i.codigo_barras ?? "",
            categoria_receita_id: i.categoria_receita_id ?? "",
            categoria_despesa_id: i.categoria_despesa_id ?? "",
            observacao: i.observacao ?? "",
            ativo: i.ativo,
          }
        : { ...ITEM_VAZIO },
    );
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return avisar("Dê um nome ao item.", "erro");
    const ncm = form.ncm.replace(/\D/g, "");
    if (ncm && ncm.length !== 8) return avisar("O NCM tem 8 números (ex.: 8471.30.12).", "erro");
    const [min, preco, custo] = [numeroBr(form.estoque_minimo), numeroBr(form.preco_venda), numeroBr(form.custo)];
    if ([min, preco, custo].some((x) => Number.isNaN(x) || x < 0))
      return avisar("Confira os números: estoque mínimo, preço e custo não podem ser negativos.", "erro");
    setSalvando(true);
    const dados = {
      codigo: form.codigo.trim() || null,
      nome: form.nome.trim(),
      tipo: form.tipo,
      unidade: form.unidade.trim().toUpperCase() || "UN",
      controla_estoque: form.tipo === "produto" && form.controla_estoque,
      estoque_minimo: min,
      preco_venda: form.preco_venda.trim() ? preco : null,
      custo: form.custo.trim() ? custo : null,
      ncm: ncm || null,
      codigo_barras: form.codigo_barras.trim() || null,
      categoria_receita_id: form.categoria_receita_id || null,
      categoria_despesa_id: form.categoria_despesa_id || null,
      observacao: form.observacao.trim() || null,
      ativo: form.ativo,
    };
    const { error } = form.id
      ? await supabase().from("est_itens").update(dados).eq("id", form.id)
      : await supabase()
          .from("est_itens")
          .insert({ ...dados, org_id: cliente.org_id, cliente_id: cliente.id });
    setSalvando(false);
    if (error) return avisar(traduzirErro(error), "erro");
    avisar(form.id ? "Item atualizado." : "Item cadastrado.");
    setForm(null);
    base.recarregar();
  }

  const cats = base.dados?.categorias ?? [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Itens ativos"
          valor={String(ativos.length)}
          detalhe={`${ativos.filter((x) => x.i.controla_estoque).length} controlam estoque`}
        />
        <Indicador titulo="Valor em estoque (pelo custo)" valor={brl(valorEstoque)} tom="verde" />
        <Indicador
          titulo="Abaixo do mínimo"
          valor={String(qtdBaixo)}
          tom={qtdBaixo ? "vermelho" : "neutro"}
          ativo={filtro === "baixo"}
          aoClicar={() => setFiltro(filtro === "baixo" ? "" : "baixo")}
        />
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou código de barras" />
        </label>
        <label className="campo">
          <span>Mostrar</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos os itens</option>
            <option value="estoque">Só os que controlam estoque</option>
            <option value="sem_estoque">Só os que não controlam estoque</option>
            <option value="baixo">Abaixo do estoque mínimo</option>
            <option value="servico">Só serviços</option>
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
        <div className="ml-auto flex gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: "Itens e estoque",
              subtitulo: `${nomeCliente(cliente)} · ${lista.length} item(ns) · saldo em ${fmtData(hojeISO(org.fuso))}`,
              arquivo: nomeArquivo("Itens-e-estoque", nomeCliente(cliente), hojeISO(org.fuso)),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Código", valor: (x) => x.i.codigo ?? "", peso: 1, largura: 12 },
                { titulo: "Item", valor: (x) => x.i.nome, peso: 3, largura: 40 },
                { titulo: "Tipo", valor: (x) => (x.i.tipo === "produto" ? "Produto" : "Serviço"), peso: 0.9, largura: 10 },
                { titulo: "Un.", valor: (x) => x.i.unidade, peso: 0.6, largura: 6 },
                { titulo: "Controla estoque", valor: (x) => (x.i.controla_estoque ? "Sim" : "Não"), peso: 1, largura: 10 },
                {
                  titulo: "Saldo",
                  valor: (x) => (x.i.controla_estoque ? x.saldo : null),
                  formato: "numero",
                  peso: 1,
                  alerta: (x) => x.baixo || x.zerado,
                },
                {
                  titulo: "Mínimo",
                  valor: (x) => (x.i.controla_estoque ? Number(x.i.estoque_minimo) : null),
                  formato: "numero",
                  peso: 0.9,
                },
                { titulo: "Custo", valor: (x) => x.i.custo, formato: "moeda", peso: 1.1 },
                { titulo: "Preço de venda", valor: (x) => x.i.preco_venda, formato: "moeda", peso: 1.1 },
                { titulo: "NCM", valor: (x) => x.i.ncm ?? "", peso: 1, largura: 12 },
              ],
            })}
          />
          {podeOperar && (
            <button className="btn-primario" onClick={() => abrir()}>
              Novo item
            </button>
          )}
        </div>
      </div>

      {base.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{base.erro}</p>}
      {base.carregando && !base.dados ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio
          acao={
            podeOperar &&
            !linhas.length && (
              <button className="btn-primario" onClick={() => abrir()}>
                Cadastrar o primeiro item
              </button>
            )
          }
        >
          {linhas.length ? "Nenhum item neste filtro." : "Nenhum produto ou serviço cadastrado ainda."}
        </EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Estoque</th>
                <th className="text-right">Saldo</th>
                <th className="text-right">Custo</th>
                <th className="text-right">Preço</th>
                {podeOperar && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map(({ i, saldo, baixo, zerado }) => (
                <tr key={i.id} className={i.ativo ? "" : "opacity-60"}>
                  <td className="min-w-56">
                    <span className="font-medium">{i.nome}</span>
                    <span className="block text-xs text-neutral-500">
                      {[i.codigo && `cód. ${i.codigo}`, i.tipo === "servico" ? "Serviço" : "Produto", i.unidade]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td>
                    {i.controla_estoque ? (
                      <span className="chip bg-emerald-50 text-emerald-800">Controla</span>
                    ) : (
                      <span className="chip bg-neutral-100 text-neutral-600">Não controla</span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap text-right tabular-nums ${baixo || zerado ? "font-medium text-red-700" : ""}`}>
                    {i.controla_estoque ? `${qtd(saldo)} ${i.unidade}` : "—"}
                    {baixo && <span className="block text-xs">abaixo do mínimo ({qtd(i.estoque_minimo)})</span>}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{i.custo != null ? brl(Number(i.custo)) : "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{i.preco_venda != null ? brl(Number(i.preco_venda)) : "—"}</td>
                  {podeOperar && (
                    <td className="text-right">
                      <button className="btn !min-h-8" onClick={() => abrir(i)}>
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal titulo={form.id ? "Editar item" : "Novo item"} aoFechar={() => setForm(null)} largura="2xl">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="campo sm:col-span-3">
              <span>Nome do item</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label className="campo">
              <span>Código (opcional)</span>
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="campo">
              <span>Tipo</span>
              <select
                value={form.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as FormItem["tipo"];
                  setForm({
                    ...form,
                    tipo,
                    controla_estoque: tipo === "produto" ? form.controla_estoque : false,
                    unidade: tipo === "servico" && form.unidade === "UN" ? "H" : form.unidade,
                  });
                }}
              >
                <option value="produto">Produto</option>
                <option value="servico">Serviço</option>
              </select>
            </label>
            <label className="campo">
              <span>Unidade</span>
              <input
                list="unidades-item"
                value={form.unidade}
                onChange={(e) => setForm({ ...form, unidade: e.target.value.slice(0, 6) })}
              />
              <datalist id="unidades-item">
                {UNIDADES.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            <label className="campo">
              <span>NCM (opcional)</span>
              <input
                value={form.ncm}
                onChange={(e) => setForm({ ...form, ncm: e.target.value })}
                inputMode="numeric"
                placeholder="0000.00.00"
              />
            </label>
          </div>
          <div
            className={`rounded-md border p-3 ${form.controla_estoque ? "border-emerald-200 bg-emerald-50/40" : "border-[var(--borda)]"}`}
          >
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.controla_estoque}
                disabled={form.tipo === "servico"}
                onChange={(e) => setForm({ ...form, controla_estoque: e.target.checked })}
              />
              Controla estoque
            </label>
            <p className="mt-1 text-xs text-neutral-600">
              {form.tipo === "servico"
                ? "Serviço não controla estoque."
                : form.controla_estoque
                  ? "O item entra no estoque nas compras e sai nas vendas. Não deixa vender mais do que tem (salvo se a empresa permitir estoque negativo)."
                  : "O item não mexe no estoque (ex.: material de uso e consumo, brinde, item vendido sob encomenda)."}
            </p>
            {form.controla_estoque && (
              <label className="campo mt-2 max-w-48">
                <span>Estoque mínimo (aviso)</span>
                <input
                  value={form.estoque_minimo}
                  onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
                  inputMode="decimal"
                />
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="campo">
              <span>Custo (R$)</span>
              <input value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} inputMode="decimal" />
            </label>
            <label className="campo">
              <span>Preço de venda (R$)</span>
              <input value={form.preco_venda} onChange={(e) => setForm({ ...form, preco_venda: e.target.value })} inputMode="decimal" />
            </label>
            <label className="campo">
              <span>Código de barras</span>
              <input value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} inputMode="numeric" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Categoria na venda (receita)</span>
              <select value={form.categoria_receita_id} onChange={(e) => setForm({ ...form, categoria_receita_id: e.target.value })}>
                <option value="">Nenhuma</option>
                {cats
                  .filter((c) => c.tipo === "receita" && (c.ativo || c.id === form.categoria_receita_id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label className="campo">
              <span>Categoria na compra (despesa)</span>
              <select value={form.categoria_despesa_id} onChange={(e) => setForm({ ...form, categoria_despesa_id: e.target.value })}>
                <option value="">Nenhuma</option>
                {cats
                  .filter((c) => c.tipo === "despesa" && (c.ativo || c.id === form.categoria_despesa_id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="campo">
            <span>Observação</span>
            <textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>
          {form.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Ativo
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
