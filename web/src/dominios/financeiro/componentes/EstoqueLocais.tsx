// Itens e estoque › aba Estoques: locais (um padrão) e a regra de estoque negativo (só a equipe com gerir muda).
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { lerPermiteNegativo } from "../leituras";
import { definirEstoqueNegativo } from "../repositorio";
import type { PropsAba } from "./Comuns";
import { useBaseEstoque } from "./estoqueBase";

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
      avisar(permite ? "Estoque negativo liberado." : "Estoque negativo bloqueado.");
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
            ? "Liberado: a MDC pode dar saída mesmo sem saldo (o saldo fica negativo até a entrada ser lançada)."
            : "Bloqueado: não deixa sair mais do que tem no estoque. É o recomendado."}
        </p>
        {pode("financeiro", "gerir") ? (
          <button className="btn !min-h-8 mt-1" onClick={() => mudarNegativo(!negativo.dados)} disabled={negativo.dados === undefined}>
            {negativo.dados ? "Bloquear estoque negativo" : "Liberar estoque negativo"}
          </button>
        ) : (
          <p className="text-xs text-neutral-500">Só quem gerencia o Financeiro muda esta regra. Se precisar, peça ao administrador.</p>
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
          <table className="tabela tabela-acoes-fixas">
            <thead>
              <tr>
                <th>Estoque</th>
                <th className="text-right">Itens com saldo</th>
                {podeOperar && <th />}
              </tr>
            </thead>
            <tbody>
              {locais.map((l) => (
                <tr key={l.id} className={l.ativo ? "" : "linha-apagada"}>
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
