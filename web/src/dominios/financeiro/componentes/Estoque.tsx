// Itens e estoque: cadastro de itens (produto/serviço, "controla estoque?"), estoques (locais) com a regra de estoque
// negativo, e movimentações (entrada, saída, inventário, transferência, estorno). Saldos vêm da visão est_saldos.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { lerCategorias, lerItens, lerLocais, lerMovimentos, lerPermiteNegativo, lerSaldos } from "../leituras";
import { definirEstoqueNegativo, estornarMovimento, movimentarEstoque } from "../repositorio";
import { intervaloDoPeriodo, numeroBr, valorParaCampo } from "../regras";
import type { Periodo } from "../regras";
import { nomeArquivo } from "../exportar";
import type { Item, LocalEstoque, MovimentoEstoque, TipoMovimento } from "../tipos";
import { BotoesExportar, FiltroPeriodo, Indicador, JanelaMotivo } from "./Comuns";
import type { PropsAba } from "./Comuns";

const qtd = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
export const TIPOS_MOV: Record<TipoMovimento, { nome: string; tom: string }> = {
  entrada: { nome: "Entrada", tom: "bg-emerald-50 text-emerald-800" },
  saida: { nome: "Saída", tom: "bg-red-50 text-red-800" },
  ajuste: { nome: "Inventário", tom: "bg-amber-50 text-amber-900" },
  transferencia: { nome: "Transferência", tom: "bg-sky-50 text-sky-900" },
};
const ORIGENS: Record<string, string> = {
  manual: "Manual",
  pedido_compra: "Pedido de compra",
  pedido_venda: "Pedido de venda",
  nota_entrada: "Nota de entrada",
  nota_saida: "Nota de saída",
};

/** Dados comuns às três abas (itens, locais, saldos). */
function useBaseEstoque(cliente: string) {
  return useConsulta(
    useCallback(async () => {
      const [itens, locais, saldos, categorias] = await Promise.all([
        lerItens(cliente),
        lerLocais(cliente),
        lerSaldos(cliente),
        lerCategorias(cliente),
      ]);
      const porItem = new Map<string, number>();
      for (const s of saldos) porItem.set(s.item_id, (porItem.get(s.item_id) ?? 0) + Number(s.saldo));
      return { itens, locais, saldos, categorias, porItem };
    }, [cliente]),
  );
}

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

// ------------------------------------------------------------------ estoques (locais)

export function AbaLocais({ cliente, podeOperar, avisar }: PropsAba) {
  const { pode } = useOrg();
  const base = useBaseEstoque(cliente.id);
  const negativo = useConsulta(useCallback(() => lerPermiteNegativo(cliente.id), [cliente.id]));
  const [form, setForm] = useState<{ id?: string; nome: string; padrao: boolean; ativo: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const locais = base.dados?.locais ?? [];
  const saldoLocal = (id: string) => (base.dados?.saldos ?? []).filter((s) => s.local_id === id && Number(s.saldo) !== 0).length;

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return avisar("Dê um nome ao estoque (ex.: Depósito principal).", "erro");
    setSalvando(true);
    try {
      const sb = supabase();
      // só um padrão por empresa: desmarca o atual antes
      if (form.padrao) {
        const atual = locais.find((l) => l.padrao && l.id !== form.id);
        if (atual) {
          const { error } = await sb.from("est_locais").update({ padrao: false }).eq("id", atual.id);
          if (error) throw error;
        }
      }
      const dados = { nome: form.nome.trim(), padrao: form.padrao, ativo: form.ativo };
      const { error } = form.id
        ? await sb.from("est_locais").update(dados).eq("id", form.id)
        : await sb.from("est_locais").insert({ ...dados, org_id: cliente.org_id, cliente_id: cliente.id });
      if (error) throw error;
      avisar(form.id ? "Estoque atualizado." : "Estoque cadastrado.");
      setForm(null);
      base.recarregar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarNegativo(permite: boolean) {
    try {
      await definirEstoqueNegativo(cliente.id, permite);
      avisar(permite ? "Estoque negativo liberado para esta empresa." : "Estoque negativo bloqueado.");
      negativo.recarregar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    }
  }

  return (
    <div className="space-y-3">
      <div className="cartao flex flex-wrap items-center gap-3 p-4">
        <p className="mr-auto max-w-xl text-sm text-neutral-600">
          Estoques são os lugares onde os produtos ficam (depósito, loja, veículo). Quem tem um só lugar usa um estoque só.
        </p>
        {podeOperar && (
          <button className="btn-primario" onClick={() => setForm({ nome: "", padrao: !locais.length, ativo: true })}>
            Novo estoque
          </button>
        )}
      </div>
      <div className="cartao space-y-1 p-4">
        <p className="text-sm font-medium">Estoque negativo</p>
        <p className="text-sm text-neutral-600">
          {negativo.dados
            ? "Liberado: a empresa pode dar saída mesmo sem saldo (o saldo fica negativo até a entrada ser lançada)."
            : "Bloqueado: não deixa sair mais do que tem no estoque. É o recomendado."}
        </p>
        {pode("financeiro", "gerir") ? (
          <button className="btn !min-h-8 mt-1" onClick={() => mudarNegativo(!negativo.dados)} disabled={negativo.dados === undefined}>
            {negativo.dados ? "Bloquear estoque negativo" : "Liberar estoque negativo"}
          </button>
        ) : (
          <p className="text-xs text-neutral-500">Só a equipe MDC muda esta regra.</p>
        )}
      </div>
      {base.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{base.erro}</p>}
      {base.carregando && !base.dados ? (
        <Carregando />
      ) : !locais.length ? (
        <EstadoVazio
          acao={
            podeOperar && (
              <button className="btn-primario" onClick={() => setForm({ nome: "Depósito principal", padrao: true, ativo: true })}>
                Criar &quot;Depósito principal&quot;
              </button>
            )
          }
        >
          Nenhum estoque cadastrado. Crie pelo menos um para poder lançar entradas e saídas de produtos.
        </EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Estoque</th>
                <th className="text-right">Itens com saldo</th>
                {podeOperar && <th />}
              </tr>
            </thead>
            <tbody>
              {locais.map((l) => (
                <tr key={l.id} className={l.ativo ? "" : "opacity-60"}>
                  <td className="font-medium">
                    {l.nome}
                    {l.padrao && <span className="chip ml-2 bg-amber-50 text-amber-900">Padrão</span>}
                    {!l.ativo && <span className="chip ml-2 bg-neutral-100 text-neutral-600">Inativo</span>}
                  </td>
                  <td className="text-right tabular-nums">{saldoLocal(l.id)}</td>
                  {podeOperar && (
                    <td className="text-right">
                      <button
                        className="btn !min-h-8"
                        onClick={() => setForm({ id: l.id, nome: l.nome, padrao: l.padrao, ativo: l.ativo })}
                      >
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
        <Modal titulo={form.id ? "Editar estoque" : "Novo estoque"} aoFechar={() => setForm(null)}>
          <label className="campo">
            <span>Nome</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Depósito principal" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.padrao} onChange={(e) => setForm({ ...form, padrao: e.target.checked })} />
            Estoque padrão (usado quando o lançamento não escolher outro)
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

// ------------------------------------------------------------------ movimentações

type FormMov = {
  tipo: TipoMovimento;
  item: string;
  local: string;
  destino: string;
  data: string;
  quantidade: string;
  custo: string;
  observacao: string;
};

export function AbaMovimentos({ cliente, podeOperar, avisar }: PropsAba) {
  const { org } = useOrg();
  const hoje = hojeISO(org.fuso);
  const base = useBaseEstoque(cliente.id);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [item, setItem] = useState("");
  const [tipo, setTipo] = useState("");
  const [form, setForm] = useState<FormMov | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [estornar, setEstornar] = useState<MovimentoEstoque | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);
  const movs = useConsulta(
    useCallback(() => lerMovimentos(cliente.id, { ...intervalo, item: item || undefined }), [cliente.id, intervalo, item]),
  );

  const itens = useMemo(() => new Map((base.dados?.itens ?? []).map((i) => [i.id, i])), [base.dados]);
  const locais = useMemo(() => new Map((base.dados?.locais ?? []).map((l) => [l.id, l])), [base.dados]);
  const estocaveis = (base.dados?.itens ?? []).filter((i) => i.controla_estoque && i.ativo);
  const locaisAtivos: LocalEstoque[] = (base.dados?.locais ?? []).filter((l) => l.ativo);
  const lista = (movs.dados ?? []).filter((m) => !tipo || m.tipo === tipo);
  const saldoNoLocal = (i: string, l: string) => Number(base.dados?.saldos.find((s) => s.item_id === i && s.local_id === l)?.saldo ?? 0);

  function novo(t: TipoMovimento = "entrada") {
    const padrao = locaisAtivos.find((l) => l.padrao) ?? locaisAtivos[0];
    setForm({ tipo: t, item: item || "", local: padrao?.id ?? "", destino: "", data: hoje, quantidade: "", custo: "", observacao: "" });
  }

  async function salvar() {
    if (!form) return;
    const q = numeroBr(form.quantidade);
    if (!form.item) return avisar("Escolha o item.", "erro");
    if (!form.local) return avisar("Escolha o estoque.", "erro");
    if (Number.isNaN(q) || q < 0 || (q === 0 && form.tipo !== "ajuste")) return avisar("Informe a quantidade.", "erro");
    setSalvando(true);
    try {
      await movimentarEstoque({
        item: form.item,
        local: form.local,
        destino: form.tipo === "transferencia" ? form.destino : null,
        data: form.data,
        tipo: form.tipo,
        quantidade: q,
        custo_unitario: form.tipo === "entrada" && form.custo.trim() ? numeroBr(form.custo) : null,
        observacao: form.observacao.trim() || null,
      });
      avisar("Movimento lançado.");
      setForm(null);
      movs.recarregar();
      base.recarregar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  const sel = form ? itens.get(form.item) : undefined;
  return (
    <div className="space-y-3">
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
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
        <label className="campo min-w-48">
          <span>Item</span>
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">Todos</option>
            {(base.dados?.itens ?? [])
              .filter((i) => i.controla_estoque)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
          </select>
        </label>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_MOV).map(([id, t]) => (
              <option key={id} value={id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: "Movimentações de estoque",
              subtitulo: `${nomeCliente(cliente)} · ${intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? "")}` : "todo o período"} · ${lista.length} movimento(s)`,
              arquivo: nomeArquivo("Movimentacoes-estoque", nomeCliente(cliente), hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Data", valor: (m) => fmtData(m.data), peso: 1, largura: 12 },
                { titulo: "Item", valor: (m) => itens.get(m.item_id)?.nome ?? "", peso: 3, largura: 36 },
                { titulo: "Estoque", valor: (m) => locais.get(m.local_id)?.nome ?? "", peso: 1.5, largura: 20 },
                { titulo: "Tipo", valor: (m) => TIPOS_MOV[m.tipo].nome, peso: 1.1, largura: 14 },
                { titulo: "Quantidade", valor: (m) => Number(m.quantidade), formato: "numero", peso: 1, alerta: (m) => m.quantidade < 0 },
                { titulo: "Custo unit.", valor: (m) => m.custo_unitario, formato: "moeda", peso: 1 },
                { titulo: "Origem", valor: (m) => ORIGENS[m.origem] ?? m.origem, peso: 1.2, largura: 16 },
                {
                  titulo: "Observação",
                  valor: (m) => (m.estornado ? `ESTORNADO: ${m.estorno_motivo ?? ""}` : (m.observacao ?? "")),
                  peso: 2.4,
                  largura: 36,
                },
              ],
            })}
          />
          {podeOperar && (
            <button className="btn-primario" onClick={() => novo()} disabled={!estocaveis.length || !locaisAtivos.length}>
              Lançar movimento
            </button>
          )}
        </div>
      </div>
      {base.dados && (!estocaveis.length || !locaisAtivos.length) && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Para lançar movimentos, cadastre {!locaisAtivos.length ? "um estoque (aba Estoques)" : ""}
          {!locaisAtivos.length && !estocaveis.length ? " e " : ""}
          {!estocaveis.length ? "um item que controla estoque (aba Itens)" : ""}.
        </p>
      )}
      {(movs.erro || base.erro) && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{movs.erro ?? base.erro}</p>}
      {(movs.carregando && !movs.dados) || !base.dados ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio>Nenhum movimento neste filtro.</EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Item</th>
                <th>Tipo</th>
                <th className="text-right">Quantidade</th>
                <th>Estoque</th>
                {podeOperar && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const i = itens.get(m.item_id);
                return (
                  <tr key={m.id} className={m.estornado ? "text-neutral-400" : ""}>
                    <td className="whitespace-nowrap tabular-nums">{fmtData(m.data)}</td>
                    <td className="min-w-48">
                      {i?.nome ?? "—"}
                      <span className="block text-xs text-neutral-500">
                        {ORIGENS[m.origem] ?? m.origem}
                        {m.observacao && ` · ${m.observacao}`}
                        {m.estornado && ` · estornado: ${m.estorno_motivo ?? ""}`}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${m.estornado ? "bg-neutral-100 text-neutral-500" : TIPOS_MOV[m.tipo].tom}`}>
                        {m.estornado ? "Estornado" : TIPOS_MOV[m.tipo].nome}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap text-right tabular-nums ${m.quantidade < 0 ? "text-red-700" : "text-emerald-800"} ${m.estornado ? "line-through" : ""}`}
                    >
                      {m.quantidade > 0 ? "+" : ""}
                      {qtd(m.quantidade)} {i?.unidade}
                    </td>
                    <td className="whitespace-nowrap">{locais.get(m.local_id)?.nome ?? "—"}</td>
                    {podeOperar && (
                      <td className="text-right">
                        {!m.estornado && m.origem === "manual" && (
                          <button className="btn !min-h-8" onClick={() => setEstornar(m)}>
                            Estornar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal titulo="Lançar movimento de estoque" aoFechar={() => setForm(null)} largura="lg">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de movimento">
            {(Object.keys(TIPOS_MOV) as TipoMovimento[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.tipo === t}
                onClick={() => setForm({ ...form, tipo: t })}
                className={`rounded-md border px-2 py-2 text-sm ${form.tipo === t ? "border-[var(--destaque-escuro)] bg-amber-50 font-medium" : "border-[var(--borda)]"}`}
              >
                {TIPOS_MOV[t].nome}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            {
              {
                entrada: "Produto que chegou (compra, produção, devolução de cliente).",
                saida: "Produto que saiu (venda avulsa, perda, uso interno).",
                ajuste: "Contagem física: informe quanto TEM no estoque; o HUB lança a diferença.",
                transferencia: "Muda o produto de um estoque para outro.",
              }[form.tipo]
            }
          </p>
          <label className="campo">
            <span>Item</span>
            <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>
              <option value="">Escolha…</option>
              {estocaveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                  {i.codigo ? ` (${i.codigo})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>{form.tipo === "transferencia" ? "De (estoque)" : "Estoque"}</span>
              <select value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })}>
                {locaisAtivos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
              {sel && form.local && (
                <small className="text-xs text-neutral-500">
                  Saldo agora: {qtd(saldoNoLocal(sel.id, form.local))} {sel.unidade}
                </small>
              )}
            </label>
            {form.tipo === "transferencia" ? (
              <label className="campo">
                <span>Para (estoque)</span>
                <select value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}>
                  <option value="">Escolha…</option>
                  {locaisAtivos
                    .filter((l) => l.id !== form.local)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label className="campo">
                <span>Data</span>
                <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>{form.tipo === "ajuste" ? "Quantidade contada" : "Quantidade"}</span>
              <input value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} inputMode="decimal" />
            </label>
            {form.tipo === "entrada" && (
              <label className="campo">
                <span>Custo unitário (R$, opcional)</span>
                <input value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} inputMode="decimal" />
              </label>
            )}
          </div>
          <label className="campo">
            <span>Observação</span>
            <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Lançar"}
            </button>
          </div>
        </Modal>
      )}
      {estornar && (
        <JanelaMotivo
          titulo="Estornar movimento"
          descricao={`${TIPOS_MOV[estornar.tipo].nome} de ${qtd(Math.abs(estornar.quantidade))} ${itens.get(estornar.item_id)?.unidade ?? ""} de ${itens.get(estornar.item_id)?.nome ?? ""} em ${fmtData(estornar.data)}. O registro não é apagado.`}
          botao="Estornar"
          aoFechar={() => setEstornar(null)}
          aoConfirmar={async (motivo) => {
            await estornarMovimento(estornar.id, motivo);
            setEstornar(null);
            avisar("Movimento estornado.");
            movs.recarregar();
            base.recarregar();
          }}
        />
      )}
    </div>
  );
}
