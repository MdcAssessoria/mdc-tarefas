// Cadastros › Centros de custo da empresa escolhida (opcional em cada lançamento). Nada se apaga: inativa.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { lerCentros } from "../leituras";
import { nomeArquivo } from "../exportar";
import type { CentroCusto } from "../tipos";
import { BotoesExportar } from "./Comuns";
import type { PropsAba } from "./Comuns";

type FormCentro = { id?: string; codigo: string; nome: string; ativo: boolean };

export function CadCentros({ cliente, podeOperar, avisar }: PropsAba) {
  const { org } = useOrg();
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<FormCentro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const consulta = useConsulta(useCallback(() => lerCentros(cliente.id), [cliente.id]));
  const lista = (consulta.dados ?? []).filter((c) => inativos || c.ativo);

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return avisar("Dê um nome ao centro de custo (ex.: Administrativo, Loja Centro, Obra 12).", "erro");
    setSalvando(true);
    const dados = { codigo: form.codigo.trim() || null, nome: form.nome.trim(), ativo: form.ativo };
    const { error } = form.id
      ? await supabase().from("fin_centros_custo").update(dados).eq("id", form.id)
      : await supabase()
          .from("fin_centros_custo")
          .insert({ ...dados, org_id: cliente.org_id, cliente_id: cliente.id });
    setSalvando(false);
    if (error) return avisar(traduzirErro(error), "erro");
    avisar(form.id ? "Centro de custo atualizado." : "Centro de custo cadastrado.");
    setForm(null);
    consulta.recarregar();
  }

  return (
    <div className="space-y-3">
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <p className="mr-auto max-w-xl text-sm text-neutral-600">
          Centro de custo separa os gastos e ganhos por área, loja ou obra. É opcional em cada lançamento.
        </p>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
        <BotoesExportar
          vazio={!lista.length}
          avisar={avisar}
          montar={() => ({
            titulo: "Centros de custo",
            subtitulo: `${nomeCliente(cliente)} · ${lista.length} centro(s)`,
            arquivo: nomeArquivo("Centros-de-custo", nomeCliente(cliente), hojeISO(org.fuso)),
            logoUrl: org.logo_url,
            paisagem: false,
            linhas: lista,
            colunas: [
              { titulo: "Código", valor: (c: CentroCusto) => c.codigo ?? "", peso: 1, largura: 12 },
              { titulo: "Centro de custo", valor: (c: CentroCusto) => c.nome, peso: 3, largura: 40 },
              { titulo: "Situação", valor: (c: CentroCusto) => (c.ativo ? "Ativo" : "Inativo"), peso: 1, largura: 12 },
            ],
          })}
        />
        {podeOperar && (
          <button className="btn-primario" onClick={() => setForm({ codigo: "", nome: "", ativo: true })}>
            Novo centro de custo
          </button>
        )}
      </div>
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}
      {consulta.carregando && !consulta.dados ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio>Nenhum centro de custo cadastrado.</EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Centro de custo</th>
                {podeOperar && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                  <td className="w-24">{c.codigo ?? "—"}</td>
                  <td className="font-medium">
                    {c.nome}
                    {!c.ativo && <span className="chip ml-2 bg-neutral-100 text-neutral-600">Inativo</span>}
                  </td>
                  {podeOperar && (
                    <td className="text-right">
                      <button
                        className="btn !min-h-8"
                        onClick={() => setForm({ id: c.id, codigo: c.codigo ?? "", nome: c.nome, ativo: c.ativo })}
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
        <Modal titulo={form.id ? "Editar centro de custo" : "Novo centro de custo"} aoFechar={() => setForm(null)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="campo">
              <span>Código (opcional)</span>
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </label>
            <label className="campo sm:col-span-2">
              <span>Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
          </div>
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
