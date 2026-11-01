// Estoque › Itens: produtos e serviços da empresa em cartões (com foto) ou lista; busca por qualquer palavra
// (nome, código, código de barras, marca, grupo), filtros simples, indicadores clicáveis, assistente de cadastro,
// cadastro rápido, duplicar, importar planilha, grupos, ficha do item, PDF e Excel.
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { combinaBusca, custoBase, margem, pct, qtdBr, situacaoSaldo, SITUACOES_SALDO } from "../estoqueRegras";
import type { SituacaoSaldo } from "../estoqueRegras";
import { nomeArquivo } from "../exportar";
import type { Item } from "../tipos";
import { BotoesExportar, Indicador } from "./Comuns";
import type { PropsAba } from "./Comuns";
import { useBaseEstoque } from "./estoqueBase";
import { AssistenteItem } from "./AssistenteItem";
import { CadastroRapido } from "./CadastroRapido";
import { ImportarItens } from "./ImportarItens";
import { GruposItens } from "./GruposItens";
import { FichaItem } from "./FichaItem";
import { FotoItem } from "./FotoItem";

type Mostrar = "" | "produtos" | "servicos" | "estoque" | "baixo" | "zerado" | "sem_preco";
const MOSTRAR: { id: Mostrar; nome: string }[] = [
  { id: "", nome: "Todos os itens" },
  { id: "produtos", nome: "Só produtos" },
  { id: "servicos", nome: "Só serviços" },
  { id: "estoque", nome: "Só os que controlam estoque" },
  { id: "baixo", nome: "Abaixo do mínimo" },
  { id: "zerado", nome: "Sem estoque (zerado ou negativo)" },
  { id: "sem_preco", nome: "Sem preço de venda" },
];
const PAGINA = 120;

type Janela =
  | { tipo: "novo" }
  | { tipo: "editar"; item: Item }
  | { tipo: "duplicar"; item: Item }
  | { tipo: "rapido" }
  | { tipo: "importar" }
  | { tipo: "grupos" }
  | { tipo: "ficha"; item: Item };

export function ItensTela({ cliente, podeOperar, avisar }: PropsAba) {
  const { org } = useOrg();
  const base = useBaseEstoque(cliente.id);
  const [visao, setVisao] = useEstadoLembrado<"cartoes" | "lista">(CHAVES.visaoItens, "cartoes", (v) => v === "cartoes" || v === "lista");
  const [busca, setBusca] = useState("");
  const [mostrar, setMostrar] = useState<Mostrar>("");
  const [grupo, setGrupo] = useState("");
  const [inativos, setInativos] = useState(false);
  const [limite, setLimite] = useState(PAGINA);
  const [janela, setJanela] = useState<Janela | null>(null);

  const d = base.dados;
  const nomeGrupo = useMemo(() => new Map((d?.grupos ?? []).map((g) => [g.id, g.nome])), [d]);
  const linhas = useMemo(
    () =>
      (d?.itens ?? []).map((i) => {
        const saldo = d?.porItem.get(i.id) ?? 0;
        const custo = custoBase(i);
        return {
          i,
          saldo,
          custo,
          situacao: situacaoSaldo(saldo, Number(i.estoque_minimo), i.controla_estoque) as SituacaoSaldo,
          margem: margem(i.preco_venda == null ? null : Number(i.preco_venda), custo),
          grupo: i.grupo_id ? (nomeGrupo.get(i.grupo_id) ?? "") : "",
        };
      }),
    [d, nomeGrupo],
  );
  const lista = useMemo(
    () =>
      linhas.filter(
        (x) =>
          (inativos || x.i.ativo) &&
          (!grupo || x.i.grupo_id === grupo) &&
          (!mostrar ||
            (mostrar === "produtos" && x.i.tipo === "produto") ||
            (mostrar === "servicos" && x.i.tipo === "servico") ||
            (mostrar === "estoque" && x.i.controla_estoque) ||
            (mostrar === "baixo" && x.situacao === "baixo") ||
            (mostrar === "zerado" && (x.situacao === "zerado" || x.situacao === "negativo")) ||
            (mostrar === "sem_preco" && x.i.preco_venda == null)) &&
          combinaBusca([x.i.nome, x.i.codigo, x.i.codigo_barras, x.i.marca, x.grupo, x.i.ncm], busca),
      ),
    [linhas, inativos, grupo, mostrar, busca],
  );
  const ativos = linhas.filter((x) => x.i.ativo);
  const valorEstoque = ativos.filter((x) => x.i.controla_estoque).reduce((a, x) => a + Math.max(0, x.saldo) * (x.custo ?? 0), 0);
  const qtdBaixo = ativos.filter((x) => x.situacao === "baixo").length;
  const qtdZerado = ativos.filter((x) => x.situacao === "zerado" || x.situacao === "negativo").length;
  const filtrando = !!(busca || mostrar || grupo || inativos);
  const limpar = () => {
    setBusca("");
    setMostrar("");
    setGrupo("");
    setInativos(false);
  };
  const alternar = (m: Mostrar) => setMostrar(mostrar === m ? "" : m);
  const fechar = () => setJanela(null);
  const salvo = (msg: string) => {
    avisar(msg);
    setJanela(null);
    base.recarregar();
  };

  const acoes = (i: Item) =>
    podeOperar ? (
      <>
        <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "editar", item: i })}>
          Editar
        </button>
        <button
          className="btn !min-h-8"
          onClick={() => setJanela({ tipo: "duplicar", item: i })}
          title="Cadastrar outro item a partir deste"
        >
          Duplicar
        </button>
        {i.controla_estoque && (
          <button
            className="btn !min-h-8"
            onClick={() => setJanela({ tipo: "ficha", item: i })}
            title="Entradas, saídas, saldo e custo médio"
          >
            Ficha
          </button>
        )}
      </>
    ) : i.controla_estoque ? (
      <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "ficha", item: i })}>
        Ficha
      </button>
    ) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador
          titulo="Itens ativos"
          valor={String(ativos.length)}
          detalhe={`${ativos.filter((x) => x.i.controla_estoque).length} controlam estoque`}
        />
        <Indicador titulo="Valor em estoque" valor={brl(valorEstoque)} detalhe="pelo custo médio" tom="verde" />
        <Indicador
          titulo="Abaixo do mínimo"
          valor={String(qtdBaixo)}
          tom={qtdBaixo ? "ambar" : "neutro"}
          ativo={mostrar === "baixo"}
          aoClicar={() => alternar("baixo")}
        />
        <Indicador
          titulo="Sem estoque"
          valor={String(qtdZerado)}
          tom={qtdZerado ? "vermelho" : "neutro"}
          ativo={mostrar === "zerado"}
          aoClicar={() => alternar("zerado")}
        />
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo min-w-56 flex-1">
          <span>Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setLimite(PAGINA);
            }}
            placeholder="Nome, código, código de barras, marca ou grupo"
          />
        </label>
        <label className="campo">
          <span>Mostrar</span>
          <select value={mostrar} onChange={(e) => setMostrar(e.target.value as Mostrar)}>
            {MOSTRAR.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
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
        <details className="relative">
          <summary className="btn cursor-pointer list-none">Mais filtros</summary>
          <div className="cartao absolute z-10 mt-1 w-64 space-y-2 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
              Mostrar itens inativos
            </label>
          </div>
        </details>
        {filtrando && (
          <button className="btn-link pb-2 text-sm" onClick={limpar}>
            Limpar
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <div role="group" aria-label="Ver como" className="flex overflow-hidden rounded-md border border-[var(--borda)]">
            {(["cartoes", "lista"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={visao === v}
                onClick={() => setVisao(v)}
                className={`px-3 text-sm ${visao === v ? "bg-[var(--marca)] text-white" : "bg-white"}`}
              >
                {v === "cartoes" ? "Cartões" : "Lista"}
              </button>
            ))}
          </div>
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: "Itens",
              subtitulo: `${nomeCliente(cliente)} · ${lista.length} item(ns) · saldo em ${fmtData(hojeISO(org.fuso))}`,
              arquivo: nomeArquivo("Itens", nomeCliente(cliente), hojeISO(org.fuso)),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Código", valor: (x) => x.i.codigo ?? "", peso: 0.9, largura: 12 },
                { titulo: "Item", valor: (x) => x.i.nome, peso: 3, largura: 40 },
                { titulo: "Grupo", valor: (x) => x.grupo, peso: 1.2, largura: 16 },
                { titulo: "Tipo", valor: (x) => (x.i.tipo === "produto" ? "Produto" : "Serviço"), peso: 0.8, largura: 10 },
                { titulo: "Un.", valor: (x) => x.i.unidade, peso: 0.5, largura: 6 },
                {
                  titulo: "Saldo",
                  valor: (x) => (x.i.controla_estoque ? x.saldo : null),
                  formato: "numero",
                  peso: 0.8,
                  alerta: (x) => x.situacao === "baixo" || x.situacao === "zerado" || x.situacao === "negativo",
                },
                {
                  titulo: "Mínimo",
                  valor: (x) => (x.i.controla_estoque ? Number(x.i.estoque_minimo) : null),
                  formato: "numero",
                  peso: 0.8,
                },
                { titulo: "Custo médio", valor: (x) => x.custo, formato: "moeda", peso: 1 },
                { titulo: "Preço de venda", valor: (x) => x.i.preco_venda, formato: "moeda", peso: 1 },
                { titulo: "Margem %", valor: (x) => x.margem, formato: "numero", peso: 0.8 },
                { titulo: "Código de barras", valor: (x) => x.i.codigo_barras ?? "", peso: 1.3, largura: 16 },
                { titulo: "NCM", valor: (x) => x.i.ncm ?? "", peso: 0.9, largura: 11 },
              ],
            })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {podeOperar && (
          <>
            <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
              Novo item
            </button>
            <button className="btn" onClick={() => setJanela({ tipo: "rapido" })}>
              Cadastro rápido
            </button>
            <button className="btn" onClick={() => setJanela({ tipo: "importar" })}>
              Importar planilha
            </button>
          </>
        )}
        <button className="btn" onClick={() => setJanela({ tipo: "grupos" })}>
          Grupos
        </button>
      </div>

      {base.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{base.erro}</p>}
      {base.carregando && !d ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio
          acao={
            podeOperar && !linhas.length ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
                  Cadastrar o primeiro item
                </button>
                <button className="btn" onClick={() => setJanela({ tipo: "importar" })}>
                  Trazer de uma planilha
                </button>
              </div>
            ) : filtrando ? (
              <button className="btn" onClick={limpar}>
                Limpar filtros
              </button>
            ) : null
          }
        >
          {linhas.length
            ? "Nenhum item com estes filtros."
            : "Nenhum produto ou serviço cadastrado ainda. Comece pelo assistente ou importe a sua planilha."}
        </EstadoVazio>
      ) : visao === "cartoes" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.slice(0, limite).map((x) => (
            <article key={x.i.id} className={`cartao flex flex-col gap-3 p-4 ${x.i.ativo ? "" : "opacity-60"}`}>
              <div className="flex gap-3">
                <FotoItem caminho={x.i.foto_caminho} nome={x.i.nome} tamanho={56} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium leading-tight text-[var(--marca)]">{x.i.nome}</h3>
                  <p className="text-xs text-neutral-500">
                    {[x.i.codigo && `cód. ${x.i.codigo}`, x.grupo, x.i.marca, x.i.tipo === "servico" ? "Serviço" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <span className={`chip mt-1 ${SITUACOES_SALDO[x.situacao].tom}`}>{SITUACOES_SALDO[x.situacao].nome}</span>
                  {!x.i.ativo && <span className="chip ml-1 mt-1 bg-neutral-100 text-neutral-600">Inativo</span>}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-neutral-500">Saldo</dt>
                  <dd className="font-medium tabular-nums">{x.i.controla_estoque ? `${qtdBr(x.saldo)} ${x.i.unidade}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Preço</dt>
                  <dd className="font-medium tabular-nums">{x.i.preco_venda != null ? brl(Number(x.i.preco_venda)) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500" title="Margem sobre o preço de venda, pelo custo médio">
                    Margem
                  </dt>
                  <dd className={`font-medium tabular-nums ${x.margem != null && x.margem < 0 ? "text-red-700" : ""}`}>{pct(x.margem)}</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2">{acoes(x.i)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Situação</th>
                <th className="text-right">Saldo</th>
                <th className="text-right">Custo médio</th>
                <th className="text-right">Preço</th>
                <th className="text-right">Margem</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, limite).map((x) => (
                <tr key={x.i.id} className={x.i.ativo ? "" : "opacity-60"}>
                  <td className="min-w-56">
                    <div className="flex items-center gap-2">
                      <FotoItem caminho={x.i.foto_caminho} nome={x.i.nome} tamanho={32} />
                      <span>
                        <span className="font-medium">{x.i.nome}</span>
                        <span className="block text-xs text-neutral-500">
                          {[x.i.codigo && `cód. ${x.i.codigo}`, x.grupo, x.i.tipo === "servico" ? "Serviço" : "Produto", x.i.unidade]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${SITUACOES_SALDO[x.situacao].tom}`}>{SITUACOES_SALDO[x.situacao].nome}</span>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {x.i.controla_estoque ? `${qtdBr(x.saldo)} ${x.i.unidade}` : "—"}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{x.custo != null ? brl(x.custo) : "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {x.i.preco_venda != null ? brl(Number(x.i.preco_venda)) : "—"}
                  </td>
                  <td className={`whitespace-nowrap text-right tabular-nums ${x.margem != null && x.margem < 0 ? "text-red-700" : ""}`}>
                    {pct(x.margem)}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">{acoes(x.i)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lista.length > limite && (
        <div className="text-center">
          <button className="btn" onClick={() => setLimite(limite + PAGINA)}>
            Mostrar mais ({lista.length - limite} restantes)
          </button>
        </div>
      )}

      {d && janela?.tipo === "novo" && <AssistenteItem cliente={cliente} base={d} aoFechar={fechar} aoSalvar={salvo} />}
      {d && janela?.tipo === "editar" && (
        <AssistenteItem cliente={cliente} base={d} item={janela.item} aoFechar={fechar} aoSalvar={salvo} />
      )}
      {d && janela?.tipo === "duplicar" && (
        <AssistenteItem cliente={cliente} base={d} item={janela.item} duplicar aoFechar={fechar} aoSalvar={salvo} />
      )}
      {d && janela?.tipo === "rapido" && (
        <CadastroRapido
          cliente={cliente}
          codigos={d.itens.map((i) => i.codigo)}
          aoFechar={fechar}
          aoSalvar={(_id, nome) => salvo(`"${nome}" cadastrado.`)}
        />
      )}
      {d && janela?.tipo === "importar" && <ImportarItens cliente={cliente} itens={d.itens} aoFechar={fechar} aoImportar={salvo} />}
      {d && janela?.tipo === "grupos" && (
        <GruposItens
          cliente={cliente}
          grupos={d.grupos}
          itens={d.itens}
          podeOperar={podeOperar}
          aoFechar={fechar}
          aoMudar={base.recarregar}
        />
      )}
      {d && janela?.tipo === "ficha" && (
        <Modal titulo={`Ficha de estoque · ${janela.item.nome}`} aoFechar={fechar} largura="4xl">
          <FichaItem cliente={cliente} avisar={avisar} base={d} itemInicial={janela.item.id} />
        </Modal>
      )}
    </div>
  );
}
