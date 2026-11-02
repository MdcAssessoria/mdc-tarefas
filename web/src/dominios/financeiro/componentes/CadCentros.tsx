// Centros de custo (módulo próprio, /centros-custo) da empresa escolhida (opcional em cada lançamento). Nada se apaga: inativa.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { lerCentros } from "../leituras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { CentroCusto } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import type { PropsAba } from "./Comuns";

type FormCentro = { id?: string; codigo: string; nome: string; ativo: boolean };

export function CadCentros({ cliente, podeOperar, avisar, seletor }: PropsAba) {
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
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Centros de custo"
        descricao="Separe os gastos e ganhos por área, loja ou obra. É opcional em cada lançamento."
        acoes={
          <>
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
                <Icone nome="mais" className="h-4 w-4" />
                Novo centro de custo
              </button>
            )}
          </>
        }
      />
      <CartaoFiltros ativos={inativos ? [{ id: "inativos", rotulo: "Com inativos", aoTirar: () => setInativos(false) }] : []}>
        {seletor}
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </CartaoFiltros>
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={4} />
      ) : !lista.length ? (
        <EstadoVazio
          icone="etiqueta"
          titulo="Nenhum centro de custo cadastrado"
          acao={
            podeOperar && (
              <button className="btn-primario" onClick={() => setForm({ codigo: "", nome: "", ativo: true })}>
                <Icone nome="mais" className="h-4 w-4" />
                Cadastrar o primeiro
              </button>
            )
          }
        >
          Exemplos: Administrativo, Loja Centro, Obra 12. Depois, escolha o centro ao lançar uma conta a pagar ou a receber.
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Centros de custo">
          <thead>
            <tr>
              <th>Código</th>
              <th>Centro de custo</th>
              <th>Situação</th>
              {podeOperar && (
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                <td data-rotulo="Código" className="num w-24">
                  {c.codigo ?? "—"}
                </td>
                <td className="celula-titulo font-medium">{c.nome}</td>
                <td data-rotulo="Situação">
                  <Chip tom={c.ativo ? "verde" : "neutro"}>{c.ativo ? "Ativo" : "Inativo"}</Chip>
                </td>
                {podeOperar && (
                  <td className="celula-acoes text-right">
                    <button
                      className="btn !min-h-8 !px-3"
                      onClick={() => setForm({ id: c.id, codigo: c.codigo ?? "", nome: c.nome, ativo: c.ativo })}
                    >
                      <Icone nome="editar" className="h-4 w-4" />
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
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
