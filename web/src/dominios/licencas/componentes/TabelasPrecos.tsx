// Licenças › Produtos e planos: as duas tabelas de digitar direto (pedido do Edvaldo, 15/11/2026).
// 1) Valor de cada produto: o preço mensal de tabela na própria linha, "Salvar preços" grava só o que mudou.
// 2) Pacotes: quadro produto × pacote com X para marcar, a soma dos avulsos, o preço do pacote, o desconto e um atalho
//    "aplicar X% de desconto". Grava pelas mesmas funções do banco (lic_salvar_produto / lic_salvar_plano).
"use client";

import { useMemo, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { valorParaCampo } from "@/dominios/financeiro/regras";
import { descontoSobreTabela } from "@/dominios/licencas/regras";
import { lerPreco, pacotesAlterados, precoComDesconto, precosAlterados, somaDoPacote, type PacoteEditado } from "@/dominios/licencas/precos";
import { salvarPlano, salvarProduto } from "@/dominios/licencas/repositorio";
import type { Plano, Produto } from "@/dominios/licencas/tipos";

type Sistema = "ledgra" | "hub";
const NOME_SISTEMA: Record<Sistema, string> = { ledgra: "Ledgra", hub: "HUB" };

function EscolhaSistema({ valor, aoMudar, tem }: { valor: Sistema; aoMudar: (s: Sistema) => void; tem: Sistema[] }) {
  if (tem.length < 2) return null;
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Sistema">
      {tem.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={valor === s}
          className={`btn !min-h-9 ${valor === s ? "!border-[var(--marca)] !bg-[var(--marca)] !text-white" : ""}`}
          onClick={() => aoMudar(s)}
        >
          {valor === s && <Icone nome="check" className="h-4 w-4" />} {NOME_SISTEMA[s]}
        </button>
      ))}
    </div>
  );
}

/** Produto sem a marca de sistema (dado antigo) conta como do HUB. */
const sis = (p: Produto | undefined): Sistema => (p?.sistema === "ledgra" ? "ledgra" : "hub");
const sistemasDe = (produtos: Produto[]) => (["ledgra", "hub"] as Sistema[]).filter((s) => produtos.some((p) => sis(p) === s));

/** Tabela 1: valor mensal de cada produto, digitado na linha. */
export function TabelaPrecosProdutos({
  produtos,
  org,
  emUso,
  aoEditar,
  aoSalvar,
}: {
  produtos: Produto[];
  org: string;
  emUso: (produto: string) => number;
  aoEditar: (p: Produto) => void;
  aoSalvar: (msg: string) => void;
}) {
  const tem = sistemasDe(produtos);
  const [sistema, setSistema] = useState<Sistema>(tem[0] ?? "ledgra");
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const lista = produtos.filter((p) => sis(p) === sistema);
  const mudou = precosAlterados(produtos, digitado);
  const invalido = Object.entries(digitado).some(([, t]) => lerPreco(t) === null);
  const total = somaDoPacote(lista.filter((p) => p.ativo).map((p) => p.id), new Map(lista.map((p) => [p.id, p])), digitado);

  async function salvar() {
    if (!mudou.length || invalido) return;
    setSalvando(true);
    setErro("");
    try {
      for (const { produto: p, preco } of mudou) {
        await salvarProduto({ id: p.id, org, nome: p.nome, descricao: p.descricao, preco, ativo: p.ativo });
      }
      setDigitado({});
      aoSalvar(`${mudou.length} preço(s) gravado(s). Contratos já fechados mantêm o valor combinado.`);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EscolhaSistema valor={sistema} aoMudar={setSistema} tem={tem} />
        <p className="text-sm text-neutral-600">
          Todos os produtos à venda somam <b className="tabular-nums">{brl(total)}</b> por mês.
        </p>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="w-44 text-right">Preço mensal (R$)</th>
              <th className="text-right">Contratos ativos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const t = digitado[p.id];
              const ruim = t !== undefined && lerPreco(t) === null;
              const alterado = t !== undefined && !ruim && lerPreco(t) !== p.preco;
              return (
                <tr key={p.id} className={p.ativo ? "" : "linha-apagada"}>
                  <td className="min-w-52">
                    <span className="font-medium">{p.nome}</span>{" "}
                    {!p.ativo && <span className="chip bg-neutral-100 text-neutral-600">Inativo</span>}
                    {p.descricao && <span className="block text-xs text-neutral-500">{p.descricao}</span>}
                  </td>
                  <td className="text-right">
                    <input
                      inputMode="decimal"
                      aria-label={`Preço mensal de ${p.nome}`}
                      className={`w-36 rounded-lg border px-2 py-1.5 text-right tabular-nums ${ruim ? "border-red-500 bg-red-50" : alterado ? "border-[var(--marca)] bg-amber-50" : "border-neutral-300"}`}
                      value={t ?? valorParaCampo(p.preco)}
                      onChange={(e) => setDigitado((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder="0,00"
                    />
                    {ruim && <span className="block text-xs text-red-700">valor inválido</span>}
                  </td>
                  <td className="text-right tabular-nums">{emUso(p.id)}</td>
                  <td className="text-right">
                    <button className="btn !min-h-8" onClick={() => aoEditar(p)}>
                      <Icone nome="editar" className="h-4 w-4" /> Nome e descrição
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-sm text-neutral-600">
          {mudou.length ? `${mudou.length} preço(s) alterado(s), ainda não gravado(s).` : "Digite os preços na coluna e grave de uma vez."}
        </span>
        <button className="btn-primario" onClick={salvar} disabled={salvando || !mudou.length || invalido}>
          <Icone nome="check" className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar preços"}
        </button>
        {mudou.length > 0 && (
          <button className="btn" onClick={() => setDigitado({})} disabled={salvando}>
            <Icone nome="cancelar" className="h-4 w-4" /> Desfazer
          </button>
        )}
      </div>
    </div>
  );
}

/** Tabela 2: pacotes — produto × pacote, com soma, preço e desconto. */
export function QuadroPacotes({
  produtos,
  planos,
  org,
  emUso,
  aoEditar,
  aoSalvar,
}: {
  produtos: Produto[];
  planos: Plano[];
  org: string;
  emUso: (plano: string) => number;
  aoEditar: (p: Plano) => void;
  aoSalvar: (msg: string) => void;
}) {
  const tem = sistemasDe(produtos);
  const [sistema, setSistema] = useState<Sistema>(tem[0] ?? "ledgra");
  const [editado, setEditado] = useState<Record<string, PacoteEditado>>({});
  const [descontos, setDescontos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const linhas = produtos.filter((p) => sis(p) === sistema && p.ativo);
  const doSistema = (pl: Plano) => pl.produtos.every((id) => sis(porId.get(id)) === sistema);
  const colunas = planos.filter((pl) => doSistema(pl) && (pl.ativo || editado[pl.id]));
  const atual = (pl: Plano): PacoteEditado => editado[pl.id] ?? { produtos: pl.produtos, preco: valorParaCampo(pl.preco) };
  const mudou = pacotesAlterados(planos, editado);
  const invalido = Object.values(editado).some((e) => lerPreco(e.preco) === null || !e.produtos.length);

  const marcar = (pl: Plano, produto: string) => {
    const e = atual(pl);
    const produtosNovos = e.produtos.includes(produto) ? e.produtos.filter((x) => x !== produto) : [...e.produtos, produto];
    setEditado((x) => ({ ...x, [pl.id]: { ...e, produtos: produtosNovos } }));
  };
  const precoDigitado = (pl: Plano, preco: string) => setEditado((x) => ({ ...x, [pl.id]: { ...atual(pl), preco } }));
  const aplicarDesconto = (pl: Plano) => {
    const pct = lerPreco(descontos[pl.id] ?? "");
    if (pct === null || pct >= 100) return;
    const soma = somaDoPacote(atual(pl).produtos, porId);
    precoDigitado(pl, valorParaCampo(precoComDesconto(soma, pct)));
  };

  async function salvar() {
    if (!mudou.length || invalido) return;
    setSalvando(true);
    setErro("");
    try {
      for (const { plano: pl, produtos: ids, preco } of mudou) {
        await salvarPlano({ id: pl.id, org, nome: pl.nome, descricao: pl.descricao, preco, ativo: pl.ativo, produtos: ids });
      }
      setEditado({});
      setDescontos({});
      aoSalvar(`${mudou.length} pacote(s) gravado(s). Contratos já fechados continuam com os produtos e o valor combinados.`);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!colunas.length) {
    return (
      <div className="space-y-3">
        <EscolhaSistema valor={sistema} aoMudar={setSistema} tem={tem} />
        <p className="cartao p-4 text-sm text-neutral-600">Nenhum pacote deste sistema. Use &ldquo;Novo plano&rdquo; para criar o primeiro.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EscolhaSistema valor={sistema} aoMudar={setSistema} tem={tem} />
        <p className="text-sm text-neutral-600">Marque com X os produtos de cada pacote e digite o preço do pacote embaixo.</p>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th className="min-w-48">Produto</th>
              <th className="text-right">Preço avulso</th>
              {colunas.map((pl) => (
                <th key={pl.id} className="min-w-36 text-center">
                  <button className="font-semibold underline-offset-2 hover:underline" onClick={() => aoEditar(pl)} title="Nome e descrição">
                    {pl.nome.replace(/^Ledgra\s+/, "")}
                  </button>
                  <span className="block text-xs font-normal text-neutral-500">{emUso(pl.id)} contrato(s)</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.nome.replace(/^Ledgra · /, "")}</td>
                <td className="text-right tabular-nums">{brl(p.preco)}</td>
                {colunas.map((pl) => {
                  const marcado = atual(pl).produtos.includes(p.id);
                  return (
                    <td key={pl.id} className="text-center">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={marcado}
                        aria-label={`${p.nome} no pacote ${pl.nome}`}
                        onClick={() => marcar(pl, p.id)}
                        className={`inline-grid h-8 w-8 place-items-center rounded-md border-2 ${marcado ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-neutral-300 bg-white"}`}
                      >
                        {marcado && <Icone nome="check" className="h-4 w-4" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="font-medium">Avulsos somariam</td>
              {colunas.map((pl) => (
                <td key={pl.id} className="text-center tabular-nums">{brl(somaDoPacote(atual(pl).produtos, porId))}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={2} className="font-semibold text-[var(--marca)]">Preço do pacote por mês (R$)</td>
              {colunas.map((pl) => {
                const e = atual(pl);
                const ruim = lerPreco(e.preco) === null;
                return (
                  <td key={pl.id} className="text-center">
                    <input
                      inputMode="decimal"
                      aria-label={`Preço do pacote ${pl.nome}`}
                      className={`w-28 rounded-lg border px-2 py-1.5 text-right tabular-nums ${ruim ? "border-red-500 bg-red-50" : editado[pl.id] ? "border-[var(--marca)] bg-amber-50" : "border-neutral-300"}`}
                      value={e.preco}
                      onChange={(ev) => precoDigitado(pl, ev.target.value)}
                    />
                  </td>
                );
              })}
            </tr>
            <tr>
              <td colSpan={2}>Desconto sobre os avulsos</td>
              {colunas.map((pl) => {
                const e = atual(pl);
                const d = descontoSobreTabela(somaDoPacote(e.produtos, porId), lerPreco(e.preco) ?? 0);
                return (
                  <td key={pl.id} className="text-center tabular-nums">
                    {d > 0 ? `${d.toLocaleString("pt-BR")}%` : "—"}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td colSpan={2} className="text-sm text-neutral-600">Calcular o preço com desconto de</td>
              {colunas.map((pl) => (
                <td key={pl.id} className="text-center">
                  <span className="inline-flex items-center gap-1">
                    <input
                      inputMode="decimal"
                      aria-label={`Desconto do pacote ${pl.nome}`}
                      className="w-14 rounded-lg border border-neutral-300 px-2 py-1 text-right"
                      value={descontos[pl.id] ?? ""}
                      onChange={(ev) => setDescontos((x) => ({ ...x, [pl.id]: ev.target.value }))}
                      placeholder="10"
                    />
                    %
                    <button className="btn !min-h-8 !px-2" onClick={() => aplicarDesconto(pl)} aria-label={`Aplicar desconto no pacote ${pl.nome}`}>
                      <Icone nome="check" className="h-4 w-4" />
                    </button>
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-sm text-neutral-600">
          {invalido
            ? "Confira: pacote sem produto ou preço inválido."
            : mudou.length
              ? `${mudou.length} pacote(s) alterado(s), ainda não gravado(s).`
              : "Marque, digite e grave de uma vez."}
        </span>
        <button className="btn-primario" onClick={salvar} disabled={salvando || !mudou.length || invalido}>
          <Icone nome="check" className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar pacotes"}
        </button>
        {Object.keys(editado).length > 0 && (
          <button className="btn" onClick={() => { setEditado({}); setDescontos({}); }} disabled={salvando}>
            <Icone nome="cancelar" className="h-4 w-4" /> Desfazer
          </button>
        )}
      </div>
    </div>
  );
}
