// Itens e estoque › aba Movimentações: entrada, saída, inventário, transferência e estorno.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { lerMovimentos } from "../leituras";
import { estornarMovimento, movimentarEstoque } from "../repositorio";
import { intervaloDoPeriodo, numeroBr } from "../regras";
import type { Periodo } from "../regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { LocalEstoque, MovimentoEstoque, TipoMovimento } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import type { PropsAba } from "./Comuns";
import { ORIGENS, qtd, TIPOS_MOV, useBaseEstoque } from "./estoqueBase";
import { plural } from "@/lib/formato/numero";

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
              subtitulo: `${nomeCliente(cliente)} · ${intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? "")}` : "todo o período"} · ${plural(lista.length, "movimento")}`,
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
          <table className="tabela tabela-acoes-fixas">
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
