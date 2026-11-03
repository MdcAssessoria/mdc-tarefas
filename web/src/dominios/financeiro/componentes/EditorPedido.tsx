// Novo pedido / editar rascunho (venda ou compra): cliente ou fornecedor (digitado; novo é cadastrado junto), itens
// pela busca, quantidade, preço e desconto, desconto e frete do pedido, condição de pagamento com prévia das parcelas
// (editáveis no "Personalizado") e, ao confirmar, "já recebi/paguei" para venda ou compra à vista.
"use client";

import { useMemo, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import type { Cliente } from "@/dominios/clientes/tipos";
import { numeroBr, valorParaCampo } from "../regras";
import { custoBase, custoPorUnidadeEstoque, paraUnidadeEstoque, qtdBr } from "../estoqueRegras";
import { CONDICOES, diferencaParcelas, gerarParcelas, nomeCondicao, totaisPedido, totalLinha } from "../pedidosRegras";
import type { Condicao } from "../pedidosRegras";
import { confirmarPedido, receberPedido, salvarPedido } from "../repositorio";
import { FORMAS_PAGAMENTO } from "../tipos";
import type { Item, Pedido, PedidoItem } from "../tipos";
import type { Cadastros } from "./LancarTitulo";
import type { BaseEstoque } from "./estoqueBase";
import { BuscaItem } from "./BuscaItem";
import { CadastroRapido } from "./CadastroRapido";

type Linha = { chave: string; item: string; nome: string; quantidade: string; preco: string; desconto: string; emCompra: boolean };
let seq = 0;
const novaChave = () => `l${++seq}`;

export const TEXTOS_PEDIDO = {
  venda: {
    nome: "Pedido de venda",
    pessoa: "Cliente",
    categoria: "receita",
    lancar: "Salvar e confirmar",
    pago: "Já recebi (venda à vista)",
  },
  compra: {
    nome: "Pedido de compra",
    pessoa: "Fornecedor",
    categoria: "despesa",
    lancar: "Salvar e receber a mercadoria",
    pago: "Já paguei (compra à vista)",
  },
} as const;

export function EditorPedido({
  tipo,
  cliente,
  cad,
  base,
  pedido,
  itensPedido = [],
  duplicar = false,
  hoje,
  aoFechar,
  aoSalvar,
  aoMudarItens,
}: {
  tipo: "venda" | "compra";
  cliente: Cliente;
  cad: Cadastros;
  base: BaseEstoque;
  pedido?: Pedido;
  itensPedido?: PedidoItem[];
  duplicar?: boolean;
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
  /** Um item foi cadastrado na hora: recarregar a lista de itens. */
  aoMudarItens: () => void;
}) {
  const T = TEXTOS_PEDIDO[tipo];
  const editando = !!pedido && !duplicar;
  const itens = useMemo(() => new Map(base.itens.map((i) => [i.id, i])), [base.itens]);
  const locaisAtivos = base.locais.filter((l) => l.ativo);
  const padrao = locaisAtivos.find((l) => l.padrao) ?? locaisAtivos[0];
  const pessoaNome = (id: string | null) => cad.pessoas.find((p) => p.id === id)?.nome ?? "";

  const [pessoa, setPessoa] = useState(pedido ? pessoaNome(pedido.pessoa_id) : "");
  const [data, setData] = useState(editando ? pedido!.data : hoje);
  const [previsao, setPrevisao] = useState(editando ? (pedido!.previsao ?? "") : "");
  const [local, setLocal] = useState(pedido?.local_id ?? padrao?.id ?? "");
  const [categoria, setCategoria] = useState(pedido?.categoria_id ?? "");
  const [centro, setCentro] = useState(pedido?.centro_id ?? "");
  const [desconto, setDesconto] = useState(pedido && Number(pedido.desconto) ? valorParaCampo(pedido.desconto) : "");
  const [frete, setFrete] = useState(pedido && Number(pedido.frete) ? valorParaCampo(pedido.frete) : "");
  const [condicao, setCondicao] = useState<Condicao>(() => {
    const c = CONDICOES.find((x) => x.nome === pedido?.condicao)?.id;
    return c ?? (pedido?.condicao?.endsWith("x mensal") ? "mensal" : pedido && pedido.parcelas.length > 1 ? "personalizado" : "avista");
  });
  const [nParcelas, setNParcelas] = useState(pedido?.condicao?.endsWith("x mensal") ? String(pedido.parcelas.length) : "2");
  const [manuais, setManuais] = useState<{ vencimento: string; valor: string }[]>(() =>
    editando && pedido!.parcelas.length ? pedido!.parcelas.map((p) => ({ vencimento: p.vencimento, valor: valorParaCampo(p.valor) })) : [],
  );
  const [forma, setForma] = useState(pedido?.forma_pagamento ?? "");
  const [documento, setDocumento] = useState(editando ? (pedido!.documento ?? "") : "");
  const [obs, setObs] = useState(pedido?.observacao ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    itensPedido.map((l) => ({
      chave: novaChave(),
      item: l.item_id,
      nome: l.descricao,
      quantidade: valorParaCampo(l.quantidade, 0),
      preco: valorParaCampo(l.preco_unitario),
      desconto: Number(l.desconto) ? valorParaCampo(l.desconto) : "",
      emCompra: Number(l.fator) !== 1,
    })),
  );
  const [jaPago, setJaPago] = useState(false);
  const contasAtivas = cad.contas.filter((c) => c.ativo);
  const [pagoConta, setPagoConta] = useState(contasAtivas.length === 1 ? contasAtivas[0].id : "");
  const [rapido, setRapido] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const saldoLocal = (item: string) => Number(base.saldos.find((s) => s.item_id === item && s.local_id === local)?.saldo ?? 0);
  const calc = linhas.map((l) => {
    const it = itens.get(l.item);
    const q = numeroBr(l.quantidade);
    const fator = l.emCompra && it?.unidade_compra ? Number(it.fator_compra) : 1;
    return { l, it, q, fator, total: totalLinha(q || 0, numeroBr(l.preco) || 0, numeroBr(l.desconto) || 0) };
  });
  const tot = totaisPedido(calc, numeroBr(desconto) || 0, numeroBr(frete) || 0);
  const automaticas = gerarParcelas(tot.total, condicao, data, Number(nParcelas) || 1);
  const parcelas =
    condicao === "personalizado"
      ? manuais.map((p, k) => ({ numero: k + 1, vencimento: p.vencimento, valor: numeroBr(p.valor) || 0 }))
      : automaticas;
  const dif = diferencaParcelas(tot.total, parcelas);
  const categorias = cad.categorias.filter((c) => c.tipo === T.categoria && (c.ativo || c.id === categoria));
  const pessoas = cad.pessoas.filter((p) => p.ativo && (p.tipo === "ambos" || p.tipo === (tipo === "venda" ? "cliente" : "fornecedor")));

  function incluir(i: Item) {
    const compraEmCaixa = tipo === "compra" && !!i.unidade_compra;
    const custo = custoBase(i);
    const preco = tipo === "venda" ? i.preco_venda : custo != null ? (compraEmCaixa ? custo * Number(i.fator_compra) : custo) : null;
    setLinhas((ls) => [
      ...ls,
      {
        chave: novaChave(),
        item: i.id,
        nome: i.nome,
        quantidade: "1",
        preco: valorParaCampo(preco == null ? null : Number(preco)),
        desconto: "",
        emCompra: compraEmCaixa,
      },
    ]);
    if (!categoria) {
      const cat = tipo === "venda" ? i.categoria_receita_id : i.categoria_despesa_id;
      if (cat) setCategoria(cat);
      else if (categorias.length === 1) setCategoria(categorias[0].id);
    }
  }
  const mudarLinha = (chave: string, p: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...p } : l)));

  function personalizar() {
    setManuais(
      automaticas.length
        ? automaticas.map((p) => ({ vencimento: p.vencimento, valor: valorParaCampo(p.valor) }))
        : [{ vencimento: data, valor: valorParaCampo(tot.total) }],
    );
    setCondicao("personalizado");
  }

  async function salvar(lancar: boolean) {
    setErro("");
    if (!linhas.length) return setErro("Inclua pelo menos um item (use a busca acima).");
    for (const c of calc) {
      if (!(c.q > 0)) return setErro(`Informe a quantidade de "${c.l.nome}".`);
      if (Number.isNaN(numeroBr(c.l.preco)) || numeroBr(c.l.preco) < 0) return setErro(`Confira o preço de "${c.l.nome}".`);
      if (c.total < 0) return setErro(`O desconto de "${c.l.nome}" é maior que o valor da linha.`);
    }
    if (tot.total < 0) return setErro("O desconto do pedido é maior que o valor dos itens.");
    if (tot.total > 0 && dif !== 0)
      return setErro(`As parcelas somam ${brl(tot.total - dif)}, mas o pedido dá ${brl(tot.total)}. Ajuste os valores.`);
    if (tot.total > 0 && parcelas.some((p) => !p.vencimento || !(p.valor > 0)))
      return setErro("Toda parcela precisa de vencimento e valor.");
    if (lancar && tot.total > 0 && !categoria)
      return setErro(`Escolha a categoria (${T.categoria}) para gerar as contas a ${tipo === "venda" ? "receber" : "pagar"}.`);
    if (lancar && jaPago && !pagoConta) return setErro("Escolha a conta bancária onde o dinheiro entrou/saiu.");
    const precisaLocal = calc.some((c) => c.it?.controla_estoque);
    if (precisaLocal && !local) return setErro("Escolha o estoque (local).");
    setSalvando(true);
    try {
      const pessoaId = cad.pessoas.find((p) => p.nome.toLowerCase() === pessoa.trim().toLowerCase())?.id ?? null;
      const r = await salvarPedido({
        id: editando ? pedido!.id : null,
        cliente: cliente.id,
        tipo,
        pessoa: pessoaId,
        pessoa_nome: pessoa.trim() || null,
        data,
        previsao: previsao || null,
        local: local || null,
        categoria: categoria || null,
        centro: centro || null,
        desconto: numeroBr(desconto) || 0,
        frete: numeroBr(frete) || 0,
        condicao: nomeCondicao(condicao, Number(nParcelas) || 1),
        forma_pagamento: forma || null,
        documento: documento.trim() || null,
        observacao: obs.trim() || null,
        itens: calc.map((c) => ({
          item: c.l.item,
          quantidade: c.q,
          preco_unitario: numeroBr(c.l.preco) || 0,
          desconto: numeroBr(c.l.desconto) || 0,
          em_unidade_compra: c.fator !== 1,
        })),
        parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
      });
      if (!lancar) return aoSalvar(`${T.nome} nº ${r.numero} salvo como rascunho.`);
      const pago = jaPago ? { data, conta: pagoConta, forma: forma || null } : null;
      try {
        if (tipo === "venda") await confirmarPedido(r.id, { pago });
        else await receberPedido(r.id, { pago, data });
      } catch (e) {
        // o pedido ficou salvo em rascunho; o erro diz o que acertar (ex.: estoque insuficiente)
        aoSalvar(`${T.nome} nº ${r.numero} ficou salvo como rascunho, mas não foi lançado: ${traduzirErro(e)}`);
        return;
      }
      aoSalvar(
        tipo === "venda"
          ? `Venda nº ${r.numero} confirmada: estoque baixado e ${parcelas.length} conta(s) a receber lançada(s).`
          : `Compra nº ${r.numero} recebida: mercadoria no estoque e ${parcelas.length} conta(s) a pagar lançada(s).`,
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  const titulo = editando
    ? `${T.nome} nº ${pedido!.numero}`
    : duplicar
      ? `${T.nome} (cópia do nº ${pedido!.numero})`
      : `Novo ${T.nome.toLowerCase()}`;
  return (
    <Modal
      titulo={titulo}
      aoFechar={aoFechar}
      largura="6xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn" onClick={() => salvar(false)} disabled={salvando}>
            Salvar rascunho
          </button>
          <button
            className="btn-primario"
            onClick={() => salvar(true)}
            disabled={salvando}
            title={tipo === "venda" ? "Baixa o estoque e lança as contas a receber" : "Põe no estoque e lança as contas a pagar"}
          >
            {salvando ? "Salvando…" : T.lancar}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="campo sm:col-span-2">
          <span>{T.pessoa}</span>
          <input list="pessoas-pedido" value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="Digite o nome…" />
          <datalist id="pessoas-pedido">
            {pessoas.map((p) => (
              <option key={p.id} value={p.nome} />
            ))}
          </datalist>
          {pessoa.trim() && !cad.pessoas.some((p) => p.nome.toLowerCase() === pessoa.trim().toLowerCase()) && (
            <small className="text-xs text-neutral-500">Novo: será cadastrado ao salvar.</small>
          )}
        </label>
        <label className="campo">
          <span>Data do pedido</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="campo">
          <span>{tipo === "venda" ? "Entrega prevista" : "Chegada prevista"}</span>
          <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
        </label>
      </div>
      {/* computador: itens e total à esquerda; pagamento e mais informações à direita */}
      <ColunasFormulario esquerdaLarga>
        <ColunaFormulario>
          <BuscaItem
            itens={base.itens.filter((i) => i.ativo)}
            saldo={saldoLocal}
            tipo={tipo}
            aoEscolher={incluir}
            aoCadastrar={(nome) => setRapido(nome)}
          />

          {!linhas.length ? (
            <p className="rounded-md border border-dashed border-[var(--borda)] p-4 text-center text-sm text-neutral-500">
              Nenhum item ainda. Procure acima pelo nome ou código e aperte Enter.
            </p>
          ) : (
            <div className="space-y-2">
              {calc.map(({ l, it, q, fator, total }) => {
                const falta = tipo === "venda" && it?.controla_estoque && q > 0 && paraUnidadeEstoque(q, fator) > saldoLocal(l.item);
                return (
                  <div
                    key={l.chave}
                    className="grid grid-cols-2 items-end gap-2 rounded-md border border-[var(--borda)] p-2 sm:grid-cols-12"
                  >
                    <div className="col-span-2 sm:col-span-4">
                      <p className="text-sm font-medium">{it?.nome ?? l.nome}</p>
                      <p className={`text-xs ${falta ? "text-red-700" : "text-neutral-500"}`}>
                        {it?.tipo === "servico"
                          ? "Serviço"
                          : it?.controla_estoque
                            ? `Saldo neste estoque: ${qtdBr(saldoLocal(l.item))} ${it.unidade}${falta ? " · não tem o suficiente" : ""}`
                            : "Não controla estoque"}
                      </p>
                    </div>
                    <label className="campo">
                      <span>Qtd.</span>
                      <input
                        value={l.quantidade}
                        onChange={(e) => mudarLinha(l.chave, { quantidade: e.target.value })}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="campo">
                      <span>Unidade</span>
                      {tipo === "compra" && it?.unidade_compra ? (
                        <select
                          value={l.emCompra ? "c" : "e"}
                          onChange={(e) => {
                            const emCompra = e.target.value === "c";
                            const p = numeroBr(l.preco);
                            const f = Number(it.fator_compra);
                            mudarLinha(l.chave, {
                              emCompra,
                              preco: p > 0 ? valorParaCampo(emCompra ? p * f : custoPorUnidadeEstoque(p, f)) : l.preco,
                            });
                          }}
                        >
                          <option value="c">
                            {it.unidade_compra} ({qtdBr(it.fator_compra)} {it.unidade})
                          </option>
                          <option value="e">{it.unidade}</option>
                        </select>
                      ) : (
                        <input value={it?.unidade ?? ""} readOnly tabIndex={-1} className="bg-neutral-50" />
                      )}
                    </label>
                    <label className="campo sm:col-span-2">
                      <span>Preço unit. (R$)</span>
                      <input value={l.preco} onChange={(e) => mudarLinha(l.chave, { preco: e.target.value })} inputMode="decimal" />
                    </label>
                    <label className="campo sm:col-span-2">
                      <span>Desconto (R$)</span>
                      <input
                        value={l.desconto}
                        onChange={(e) => mudarLinha(l.chave, { desconto: e.target.value })}
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </label>
                    <div className="flex items-end justify-between gap-2 sm:col-span-2">
                      <p className="pb-2 text-right text-sm font-semibold tabular-nums">{brl(total)}</p>
                      <button
                        type="button"
                        className="btn !min-h-9 !px-2"
                        aria-label={`Tirar ${it?.nome ?? l.nome} do pedido`}
                        onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="campo">
              <span>Desconto no pedido (R$)</span>
              <input value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
            <label className="campo">
              <span>Frete (R$)</span>
              <input value={frete} onChange={(e) => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
            <div className="rounded-md bg-[var(--fundo)] p-3 text-right sm:col-span-2">
              <p className="text-xs text-neutral-600">
                Itens {brl(tot.itens)}
                {numeroBr(desconto) > 0 && ` − desconto ${brl(numeroBr(desconto))}`}
                {numeroBr(frete) > 0 && ` + frete ${brl(numeroBr(frete))}`}
              </p>
              <p className="text-xl font-semibold tabular-nums text-[var(--marca)]">Total {brl(tot.total)}</p>
            </div>
          </div>
        </ColunaFormulario>
        <ColunaFormulario>
          <fieldset className="space-y-2 rounded-md border border-[var(--borda)] p-3">
            <legend className="px-1 text-sm font-medium">Pagamento</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="campo sm:col-span-2">
                <span>Condição</span>
                <select
                  value={condicao}
                  onChange={(e) => (e.target.value === "personalizado" ? personalizar() : setCondicao(e.target.value as Condicao))}
                >
                  {CONDICOES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              {condicao === "mensal" && (
                <label className="campo">
                  <span>Quantas parcelas</span>
                  <input type="number" min={1} max={120} value={nParcelas} onChange={(e) => setNParcelas(e.target.value)} />
                </label>
              )}
              <label className="campo">
                <span>Forma</span>
                <select value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="">—</option>
                  {FORMAS_PAGAMENTO.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            {condicao === "personalizado" ? (
              <div className="space-y-2">
                {manuais.map((p, k) => (
                  <div key={k} className="flex flex-wrap items-end gap-2">
                    <span className="pb-2 text-sm text-neutral-600">{k + 1}ª</span>
                    <label className="campo">
                      <span>Vencimento</span>
                      <input
                        type="date"
                        value={p.vencimento}
                        onChange={(e) => setManuais((m) => m.map((x, j) => (j === k ? { ...x, vencimento: e.target.value } : x)))}
                      />
                    </label>
                    <label className="campo w-36">
                      <span>Valor (R$)</span>
                      <input
                        value={p.valor}
                        inputMode="decimal"
                        onChange={(e) => setManuais((m) => m.map((x, j) => (j === k ? { ...x, valor: e.target.value } : x)))}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn !min-h-9"
                      onClick={() => setManuais((m) => m.filter((_, j) => j !== k))}
                      disabled={manuais.length === 1}
                    >
                      Tirar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setManuais((m) => [...m, { vencimento: data, valor: dif > 0 ? valorParaCampo(dif) : "" }])}
                >
                  + Parcela
                </button>
              </div>
            ) : (
              tot.total > 0 && (
                <p className="text-sm tabular-nums text-neutral-700">
                  {parcelas.map((p) => `${p.numero}ª ${fmtData(p.vencimento)} ${brl(p.valor)}`).join(" · ")}
                </p>
              )
            )}
            {tot.total > 0 && dif !== 0 && (
              <p className="text-sm text-red-700">
                As parcelas somam {brl(tot.total - dif)}; faltam {brl(dif)} para o total.
              </p>
            )}
          </fieldset>

          <details className="rounded-md border border-[var(--borda)] p-3" open={!categoria && linhas.length > 0}>
            <summary className="cursor-pointer text-sm text-neutral-700">Estoque, categoria e mais informações</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>{tipo === "venda" ? "Sai do estoque" : "Entra no estoque"}</span>
                <select value={local} onChange={(e) => setLocal(e.target.value)}>
                  {!locaisAtivos.length && <option value="">Cadastre um estoque em Estoque › Estoques</option>}
                  {locaisAtivos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span title="Para onde vai o valor nos relatórios do Financeiro.">Categoria ({T.categoria}) ⓘ</span>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">{categorias.length ? "Escolha…" : `Cadastre uma ${T.categoria} em Financeiro › Cadastros`}</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grupo ? `${c.grupo} › ` : ""}
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Centro de custo</span>
                <select value={centro} onChange={(e) => setCentro(e.target.value)}>
                  <option value="">Nenhum</option>
                  {cad.centros
                    .filter((c) => c.ativo || c.id === centro)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </label>
              <label className="campo">
                <span>{tipo === "venda" ? "Nº do pedido do cliente" : "Nº da nota / pedido do fornecedor"}</span>
                <input value={documento} onChange={(e) => setDocumento(e.target.value)} />
              </label>
              <label className="campo sm:col-span-2">
                <span>Observação (sai no PDF)</span>
                <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </label>
            </div>
          </details>

          {tot.total > 0 && (
            <div className="rounded-md border border-[var(--borda)] p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
                {T.pago}
              </label>
              {jaPago && (
                <label className="campo mt-2 max-w-sm">
                  <span>Conta bancária</span>
                  <select value={pagoConta} onChange={(e) => setPagoConta(e.target.value)}>
                    <option value="">{contasAtivas.length ? "Escolha…" : "Cadastre uma conta em Financeiro › Bancos"}</option>
                    {contasAtivas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="mt-1 text-xs text-neutral-500">
                Vale ao {tipo === "venda" ? "confirmar" : "receber"}: as parcelas já entram como pagas na data do pedido.
              </p>
            </div>
          )}
        </ColunaFormulario>
      </ColunasFormulario>
      {rapido !== null && (
        <CadastroRapido
          cliente={cliente}
          codigos={base.itens.map((i) => i.codigo)}
          nomeInicial={rapido}
          aoFechar={() => setRapido(null)}
          aoSalvar={(id, nome) => {
            setRapido(null);
            setLinhas((ls) => [...ls, { chave: novaChave(), item: id, nome, quantidade: "1", preco: "", desconto: "", emCompra: false }]);
            aoMudarItens();
          }}
        />
      )}
    </Modal>
  );
}
