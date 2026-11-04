// Plano de contas › Despesas e receitas (categorias) da MDC (/plano-contas/categorias).
// Cada categoria aponta para uma conta ANALÍTICA ATIVA do plano do Domínio: é ela que vai para a contabilidade
// quando a conta for paga ou recebida. Nada se apaga: inativa.
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { lerCategorias, lerPlano, rotuloConta } from "../leituras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { Categoria, ContaContabil } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import type { PropsAba } from "./Comuns";
import { plural } from "@/lib/formato/numero";

export const TIPOS_CATEGORIA = { despesa: "Despesa", receita: "Receita" } as const;

/** Lista de contas analíticas ativas com busca (classificação, código ou nome). */
export function EscolhaConta({ contas, valor, aoMudar }: { contas: ContaContabil[]; valor: string; aoMudar: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const opcoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas.filter((c) => c.id === valor || !q || rotuloConta(c).toLowerCase().includes(q)).slice(0, 300);
  }, [contas, busca, valor]);
  return (
    <div className="space-y-1">
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Procure pelo nome ou número da conta…"
        aria-label="Procurar conta"
      />
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Conta contábil">
        <option value="">{contas.length ? "Escolha a conta do plano…" : "Importe o plano de contas primeiro"}</option>
        {opcoes.map((c) => (
          <option key={c.id} value={c.id}>
            {rotuloConta(c)}
          </option>
        ))}
      </select>
    </div>
  );
}

type FormCat = { id?: string; tipo: "despesa" | "receita"; nome: string; grupo: string; conta_contabil_id: string; ativo: boolean };

export function CadCategorias({ cliente, podeOperar, avisar }: PropsAba) {
  const { org } = useOrg();
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<FormCat | null>(null);
  const [salvando, setSalvando] = useState(false);

  const consulta = useConsulta(
    useCallback(async () => {
      const [categorias, plano] = await Promise.all([lerCategorias(cliente.id), lerPlano(cliente.id)]);
      return { categorias, plano };
    }, [cliente.id]),
  );
  const porId = useMemo(() => new Map((consulta.dados?.plano ?? []).map((c) => [c.id, c])), [consulta.dados]);
  const analiticas = useMemo(() => (consulta.dados?.plano ?? []).filter((c) => c.analitica && c.ativo), [consulta.dados]);
  const grupos = useMemo(
    () => [...new Set((consulta.dados?.categorias ?? []).map((c) => c.grupo).filter(Boolean))] as string[],
    [consulta.dados],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (consulta.dados?.categorias ?? []).filter(
      (c) =>
        (inativos || c.ativo) &&
        (!tipo || c.tipo === tipo) &&
        (!q || c.nome.toLowerCase().includes(q) || (c.grupo ?? "").toLowerCase().includes(q)),
    );
  }, [consulta.dados, tipo, busca, inativos]);
  const contaDe = (c: Categoria) => {
    const p = porId.get(c.conta_contabil_id);
    return p ? rotuloConta(p) : "—";
  };

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return avisar("Dê um nome para a categoria (ex.: Aluguel, Energia, Venda de produtos).", "erro");
    if (!form.conta_contabil_id) return avisar("Escolha a conta do plano de contas onde ela vai ser contabilizada.", "erro");
    setSalvando(true);
    const dados = {
      tipo: form.tipo,
      nome: form.nome.trim(),
      grupo: form.grupo.trim() || null,
      conta_contabil_id: form.conta_contabil_id,
      ativo: form.ativo,
    };
    const { error } = form.id
      ? await supabase().from("fin_categorias").update(dados).eq("id", form.id)
      : await supabase()
          .from("fin_categorias")
          .insert({ ...dados, org_id: cliente.org_id, cliente_id: cliente.id });
    setSalvando(false);
    if (error) return avisar(traduzirErro(error), "erro");
    avisar(form.id ? "Categoria atualizada." : "Categoria cadastrada.");
    setForm(null);
    consulta.recarregar();
  }

  const nova = (t: "despesa" | "receita" = "despesa"): FormCat => ({ tipo: t, nome: "", grupo: "", conta_contabil_id: "", ativo: true });

  const filtrosAtivos: FiltroAtivo[] = [
    tipo && { id: "tipo", rotulo: tipo === "despesa" ? "Só despesas" : "Só receitas", aoTirar: () => setTipo("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
    inativos && { id: "inativos", rotulo: "Com inativas", aoTirar: () => setInativos(false) },
  ].filter((f): f is FiltroAtivo => !!f);
  const limparFiltros = () => {
    setTipo("");
    setBusca("");
    setInativos(false);
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Despesas e receitas"
        descricao="As categorias de cada lançamento, cada uma ligada a uma conta do plano do Domínio."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={avisar}
              montar={() => ({
                titulo: "Despesas e receitas",
                subtitulo: `${nomeCliente(cliente)} · ${plural(lista.length, "categoria")}`,
                arquivo: nomeArquivo("Categorias", nomeCliente(cliente), hojeISO(org.fuso)),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Tipo", valor: (c) => TIPOS_CATEGORIA[c.tipo], peso: 0.8, largura: 10 },
                  { titulo: "Categoria", valor: (c) => c.nome, peso: 2, largura: 30 },
                  { titulo: "Grupo", valor: (c) => c.grupo ?? "", peso: 1.5, largura: 24 },
                  {
                    titulo: "Conta contábil (Domínio)",
                    valor: contaDe,
                    peso: 3,
                    largura: 50,
                    alerta: (c) => !porId.get(c.conta_contabil_id)?.ativo,
                  },
                  { titulo: "Situação", valor: (c) => (c.ativo ? "Ativa" : "Inativa"), peso: 0.8, largura: 10 },
                ],
              })}
            />
            {podeOperar && (
              <button
                className="btn-primario"
                onClick={() => setForm(nova(tipo === "receita" ? "receita" : "despesa"))}
                disabled={!analiticas.length}
              >
                <Icone nome="mais" className="h-4 w-4" />
                Nova categoria
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Despesas e receitas</option>
            <option value="despesa">Só despesas</option>
            <option value="receita">Só receitas</option>
          </select>
        </label>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou grupo" />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar inativas
        </label>
      </CartaoFiltros>

      {consulta.dados && !analiticas.length && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Para cadastrar despesas e receitas, importe antes o plano de contas da MDC em{" "}
            <Link className="underline" href="/plano-contas">
              Plano do Domínio
            </Link>
            . Cada categoria fica ligada a uma conta do Domínio.
          </span>
        </p>
      )}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={5} />
      ) : !lista.length ? (
        <EstadoVazio
          icone={consulta.dados?.categorias.length ? "filtro" : "etiqueta"}
          titulo={consulta.dados?.categorias.length ? "Nenhuma categoria neste filtro" : "Nenhuma despesa ou receita cadastrada"}
          acao={
            consulta.dados?.categorias.length ? (
              <button className="btn" onClick={limparFiltros}>
                Limpar filtros
              </button>
            ) : (
              podeOperar &&
              analiticas.length > 0 && (
                <button className="btn-primario" onClick={() => setForm(nova())}>
                  <Icone nome="mais" className="h-4 w-4" />
                  Cadastrar a primeira
                </button>
              )
            )
          }
        >
          {consulta.dados?.categorias.length
            ? "Troque o tipo ou a busca."
            : "Exemplos: Aluguel, Energia, Folha de pagamento, Venda de produtos. Elas organizam as contas e os relatórios."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Despesas e receitas">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Tipo</th>
              <th>Conta contábil (Domínio)</th>
              {podeOperar && (
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const conta = porId.get(c.conta_contabil_id);
              return (
                <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                  <td className="celula-titulo min-w-48">
                    <span className="font-medium">{c.nome}</span>
                    {c.grupo && <span className="block text-xs font-normal text-[var(--texto-suave)]">{c.grupo}</span>}
                  </td>
                  <td data-rotulo="Tipo">
                    <span className="flex flex-wrap justify-end gap-1 sm:justify-start">
                      <Chip tom={c.tipo === "despesa" ? "vermelho" : "verde"}>{TIPOS_CATEGORIA[c.tipo]}</Chip>
                      {!c.ativo && <Chip tom="neutro">Inativa</Chip>}
                    </span>
                  </td>
                  <td data-rotulo="Conta contábil" className="text-sm">
                    <span>
                      {contaDe(c)}
                      {conta && !conta.ativo && (
                        <span className="block text-xs text-amber-800">Conta inativa no plano: troque por uma ativa</span>
                      )}
                    </span>
                  </td>
                  {podeOperar && (
                    <td className="celula-acoes text-right">
                      <button
                        className="btn !min-h-8 !px-3"
                        onClick={() =>
                          setForm({
                            id: c.id,
                            tipo: c.tipo,
                            nome: c.nome,
                            grupo: c.grupo ?? "",
                            conta_contabil_id: c.conta_contabil_id,
                            ativo: c.ativo,
                          })
                        }
                      >
                        <Icone nome="editar" className="h-4 w-4" />
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </QuadroTabela>
      )}

      {form && (
        <Modal
          titulo={form.id ? "Editar categoria" : "Nova categoria"}
          descricao="A categoria diz para onde vai o dinheiro (despesa) ou de onde vem (receita). A conta escolhida é a do Domínio."
          aoFechar={() => setForm(null)}
          largura="lg"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="campo">
              <span>Tipo</span>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as FormCat["tipo"] })}
                disabled={!!form.id}
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </label>
            <label className="campo sm:col-span-2">
              <span>Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Aluguel" />
            </label>
          </div>
          <label className="campo">
            <span>Grupo (opcional, para os relatórios)</span>
            <input
              list="grupos-categorias"
              value={form.grupo}
              onChange={(e) => setForm({ ...form, grupo: e.target.value })}
              placeholder="Ex.: Despesas administrativas"
            />
            <datalist id="grupos-categorias">
              {grupos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <div className="campo">
            <span>Conta contábil no Domínio</span>
            <EscolhaConta
              contas={analiticas}
              valor={form.conta_contabil_id}
              aoMudar={(id) => setForm({ ...form, conta_contabil_id: id })}
            />
          </div>
          {form.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Ativa (desmarque para não aparecer em novos lançamentos)
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
