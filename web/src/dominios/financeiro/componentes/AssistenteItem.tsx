// Assistente de cadastro de item em 4 passos, pensado para quem nunca cadastrou produto:
// 1. O que é (produto para vender, serviço ou material de uso) · 2. Como vende e compra (unidade, caixa com N)
// 3. Estoque (controla? mínimo, saldo inicial) · 4. Preços (custo, markup ou preço, margem calculada na hora).
// Também serve para editar (todos os passos abertos) e duplicar (copia tudo, menos código, código de barras e foto).
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { hojeISO } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import type { Cliente } from "@/dominios/clientes/tipos";
import { numeroBr, valorParaCampo } from "../regras";
import { custoBase, margem, markupDe, pct, precoPorMarkup, sugerirCodigo, UNIDADES } from "../estoqueRegras";
import { enviarFotoItem, salvarItem } from "../repositorio";
import type { Item } from "../tipos";
import type { BaseEstoque } from "./estoqueBase";
import { FotoItem, reduzirImagem } from "./FotoItem";

type Natureza = "revenda" | "servico" | "consumo";
const NATUREZAS: { id: Natureza; titulo: string; texto: string }[] = [
  { id: "revenda", titulo: "Produto que eu vendo", texto: "Mercadoria, peça, produto fabricado. Entra e sai do estoque." },
  { id: "servico", titulo: "Serviço", texto: "Mão de obra, instalação, consultoria, hora técnica. Não tem estoque." },
  { id: "consumo", titulo: "Material de uso", texto: "Limpeza, escritório, brinde, embalagem. Compro, mas não controlo estoque." },
];
const PASSOS = ["O que é", "Venda e compra", "Estoque", "Preços"];

type Form = {
  natureza: Natureza;
  nome: string;
  codigo: string;
  grupo: string;
  marca: string;
  unidade: string;
  compraOutra: boolean;
  unidade_compra: string;
  fator_compra: string;
  codigo_barras: string;
  ncm: string;
  controla: boolean;
  estoque_minimo: string;
  saldo_inicial: string;
  local: string;
  custo: string;
  markup: string;
  preco_venda: string;
  categoria_receita: string;
  categoria_despesa: string;
  observacao: string;
  ativo: boolean;
  foto_caminho: string;
};

function formDoItem(i: Item | undefined, base: BaseEstoque, duplicar: boolean): Form {
  const grupo = i?.grupo_id ? (base.grupos.find((g) => g.id === i.grupo_id)?.nome ?? "") : "";
  const padrao = base.locais.find((l) => l.padrao && l.ativo) ?? base.locais.find((l) => l.ativo);
  return {
    natureza: !i ? "revenda" : i.tipo === "servico" ? "servico" : i.controla_estoque ? "revenda" : "consumo",
    nome: i ? (duplicar ? `${i.nome} (cópia)` : i.nome) : "",
    codigo: i && !duplicar ? (i.codigo ?? "") : sugerirCodigo(base.itens.map((x) => x.codigo)),
    grupo,
    marca: i?.marca ?? "",
    unidade: i?.unidade ?? "UN",
    compraOutra: !!i?.unidade_compra,
    unidade_compra: i?.unidade_compra ?? "CX",
    fator_compra: i?.unidade_compra ? valorParaCampo(i.fator_compra, 0) : "",
    codigo_barras: i && !duplicar ? (i.codigo_barras ?? "") : "",
    ncm: i?.ncm ?? "",
    controla: i ? i.controla_estoque : true,
    estoque_minimo: i && Number(i.estoque_minimo) ? valorParaCampo(i.estoque_minimo, 0) : "",
    saldo_inicial: "",
    local: padrao?.id ?? "",
    custo: valorParaCampo(i?.custo),
    markup: i?.markup != null ? valorParaCampo(i.markup, 0) : "",
    preco_venda: valorParaCampo(i?.preco_venda),
    categoria_receita: i?.categoria_receita_id ?? "",
    categoria_despesa: i?.categoria_despesa_id ?? "",
    observacao: i?.observacao ?? "",
    ativo: i ? (duplicar ? true : i.ativo) : true,
    foto_caminho: i && !duplicar ? (i.foto_caminho ?? "") : "",
  };
}

export function AssistenteItem({
  cliente,
  base,
  item,
  duplicar = false,
  aoFechar,
  aoSalvar,
}: {
  cliente: Cliente;
  base: BaseEstoque;
  /** Item a editar (ou a copiar, com `duplicar`). */
  item?: Item;
  duplicar?: boolean;
  aoFechar: () => void;
  aoSalvar: (msg: string, id: string) => void;
}) {
  const { org } = useOrg();
  const editando = !!item && !duplicar;
  const [f, setF] = useState<Form>(() => formDoItem(item, base, duplicar));
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const mudar = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const servico = f.natureza === "servico";
  const controla = f.natureza === "revenda" && f.controla;
  const temSaldo = item && !duplicar ? (base.porItem.get(item.id) ?? 0) !== 0 : false;

  const custo = numeroBr(f.custo);
  const preco = numeroBr(f.preco_venda);
  const mk = numeroBr(f.markup);
  const custoRef = item && !duplicar ? (custoBase({ custo_medio: item.custo_medio, custo }) ?? 0) : custo;
  const sugerido = custoRef > 0 && f.markup.trim() && mk >= 0 ? precoPorMarkup(custoRef, mk) : null;
  const nomeRepetido = useMemo(() => {
    const n = f.nome.trim().toLowerCase();
    return !!n && base.itens.some((x) => x.nome.toLowerCase() === n && x.id !== (editando ? item?.id : undefined));
  }, [f.nome, base.itens, editando, item]);

  /** Confere o passo atual; devolve a mensagem de erro ou "". */
  function conferir(p: number): string {
    if (p === 0) {
      if (!f.nome.trim()) return "Dê um nome ao item (ex.: Parafuso sextavado 10mm).";
      const cod = f.codigo.trim();
      if (cod && base.itens.some((x) => x.codigo === cod && x.id !== (editando ? item?.id : undefined)))
        return `Já existe outro item com o código ${cod}.`;
    }
    if (p === 1) {
      if (!f.unidade.trim()) return "Escolha a unidade em que você vende.";
      if (f.compraOutra && !servico) {
        if (!f.unidade_compra.trim()) return "Escolha a unidade em que você compra (ex.: CX).";
        if (!(numeroBr(f.fator_compra) > 0)) return `Informe quantas ${f.unidade} vêm em 1 ${f.unidade_compra}.`;
      }
      const ncm = f.ncm.replace(/\D/g, "");
      if (ncm && ncm.length !== 8) return "O NCM tem 8 números (ex.: 8471.30.12).";
    }
    if (p === 2 && controla) {
      const [min, ini] = [numeroBr(f.estoque_minimo), numeroBr(f.saldo_inicial)];
      if (Number.isNaN(min) || min < 0) return "O estoque mínimo precisa ser um número (ou em branco).";
      if (Number.isNaN(ini) || ini < 0) return "O saldo inicial precisa ser um número (ou em branco).";
      if (ini > 0 && !f.local && base.locais.some((l) => l.ativo)) return "Escolha em qual estoque está o saldo inicial.";
    }
    if (p === 3) {
      if ([custo, preco, mk].some((x) => Number.isNaN(x) || x < 0))
        return "Confira os valores: custo, markup e preço não podem ser negativos.";
    }
    return "";
  }

  function irPara(p: number) {
    if (p > passo) {
      for (let k = passo; k < p; k++) {
        const e = conferir(k);
        if (e) {
          setPasso(k);
          return setErro(e);
        }
      }
    }
    setErro("");
    setPasso(p);
  }

  async function escolherFoto(arquivos: File[]) {
    const arq = arquivos[0];
    if (!arq) return;
    if (!/^image\//.test(arq.type)) return setErro("Escolha uma foto (JPG, PNG ou WEBP).");
    setEnviandoFoto(true);
    setErro("");
    try {
      const caminho = await enviarFotoItem(org.id, cliente.id, await reduzirImagem(arq));
      mudar({ foto_caminho: caminho });
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvar() {
    for (let k = 0; k < PASSOS.length; k++) {
      const e = conferir(k);
      if (e) {
        setPasso(k);
        return setErro(e);
      }
    }
    setSalvando(true);
    setErro("");
    try {
      const grupoExiste = base.grupos.find((g) => g.nome.toLowerCase() === f.grupo.trim().toLowerCase());
      const num = (s: string) => (s.trim() ? numeroBr(s) : null);
      const id = await salvarItem({
        id: editando ? item!.id : null,
        cliente: cliente.id,
        nome: f.nome.trim(),
        codigo: f.codigo.trim() || null,
        tipo: servico ? "servico" : "produto",
        unidade: f.unidade.trim().toUpperCase(),
        controla_estoque: controla,
        estoque_minimo: controla ? num(f.estoque_minimo) : 0,
        preco_venda: num(f.preco_venda),
        custo: num(f.custo),
        markup: num(f.markup),
        ncm: f.ncm.replace(/\D/g, "") || null,
        codigo_barras: f.codigo_barras.trim() || null,
        grupo: grupoExiste?.id ?? null,
        grupo_nome: grupoExiste ? null : f.grupo.trim() || null,
        marca: f.marca.trim() || null,
        unidade_compra: !servico && f.compraOutra ? f.unidade_compra.trim().toUpperCase() : null,
        fator_compra: !servico && f.compraOutra ? numeroBr(f.fator_compra) : 1,
        categoria_receita: f.categoria_receita || null,
        categoria_despesa: f.categoria_despesa || null,
        observacao: f.observacao.trim() || null,
        foto_caminho: f.foto_caminho || null,
        ativo: f.ativo,
        saldo_inicial: !editando && controla ? num(f.saldo_inicial) : null,
        local: !editando && controla ? f.local || null : null,
        data: hojeISO(org.fuso),
      });
      aoSalvar(editando ? "Item atualizado." : duplicar ? "Cópia cadastrada." : "Item cadastrado.", id);
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  const cats = base.categorias;
  const titulo = editando ? `Editar: ${item!.nome}` : duplicar ? "Duplicar item" : "Novo item";
  return (
    <Modal
      titulo={titulo}
      descricao="Responda passo a passo. Só o nome é obrigatório; o resto ajuda nos relatórios."
      aoFechar={aoFechar}
      largura="2xl"
    >
      <ol className="grid grid-cols-4 gap-1 text-xs" aria-label="Passos do cadastro">
        {PASSOS.map((nome, k) => (
          <li key={nome}>
            <button
              type="button"
              onClick={() => irPara(k)}
              aria-current={passo === k ? "step" : undefined}
              className={`w-full rounded-md border-b-4 px-1 py-1.5 text-center ${
                passo === k
                  ? "border-[var(--destaque-escuro)] font-semibold text-[var(--marca)]"
                  : k < passo
                    ? "border-emerald-500 text-emerald-800"
                    : "border-[var(--borda)] text-neutral-500"
              }`}
            >
              <span className="block text-[11px]">Passo {k + 1}</span>
              {nome}
            </button>
          </li>
        ))}
      </ol>

      {passo === 0 && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="O que é o item">
            {NATUREZAS.map((n) => (
              <button
                key={n.id}
                type="button"
                role="radio"
                aria-checked={f.natureza === n.id}
                disabled={editando && temSaldo && n.id !== "revenda"}
                onClick={() =>
                  mudar({
                    natureza: n.id,
                    controla: n.id === "revenda",
                    unidade: n.id === "servico" && f.unidade === "UN" ? "H" : n.id !== "servico" && f.unidade === "H" ? "UN" : f.unidade,
                    codigo:
                      !editando && /^[PS]\d+$/.test(f.codigo)
                        ? sugerirCodigo(
                            base.itens.map((x) => x.codigo),
                            n.id === "servico" ? "S" : "P",
                          )
                        : f.codigo,
                  })
                }
                className={`rounded-lg border p-3 text-left transition disabled:opacity-40 ${
                  f.natureza === n.id
                    ? "border-[var(--destaque-escuro)] bg-amber-50/60 ring-1 ring-[var(--destaque-escuro)]"
                    : "border-[var(--borda)] hover:bg-[var(--fundo)]"
                }`}
              >
                <span className="block font-medium text-[var(--marca)]">{n.titulo}</span>
                <span className="block text-xs text-neutral-600">{n.texto}</span>
              </button>
            ))}
          </div>
          {editando && temSaldo && (
            <p className="text-xs text-neutral-500">Este item tem saldo em estoque: para mudar o tipo, zere o saldo antes (inventário).</p>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="campo sm:col-span-3">
              <span>Nome do item</span>
              <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Como aparece no pedido e na nota" />
              {nomeRepetido && <small className="text-xs text-amber-800">Já existe um item com este nome. Confira se não é o mesmo.</small>}
            </label>
            <label className="campo">
              <span>Código</span>
              <input value={f.codigo} onChange={(e) => mudar({ codigo: e.target.value })} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Grupo (opcional)</span>
              <input
                list="grupos-item"
                value={f.grupo}
                onChange={(e) => mudar({ grupo: e.target.value })}
                placeholder="Ex.: Bebidas, Ferragens"
              />
              <datalist id="grupos-item">
                {base.grupos
                  .filter((g) => g.ativo)
                  .map((g) => (
                    <option key={g.id} value={g.nome} />
                  ))}
              </datalist>
              {f.grupo.trim() && !base.grupos.some((g) => g.nome.toLowerCase() === f.grupo.trim().toLowerCase()) && (
                <small className="text-xs text-neutral-500">Grupo novo: será criado ao salvar.</small>
              )}
            </label>
            <label className="campo">
              <span>Marca (opcional)</span>
              <input value={f.marca} onChange={(e) => mudar({ marca: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FotoItem caminho={f.foto_caminho || null} nome={f.nome || "?"} tamanho={64} />
            <div className="min-w-56 flex-1">
              <CampoArquivo
                compacto
                accept=".jpg,.jpeg,.png,.webp"
                titulo={f.foto_caminho ? "Trocar a foto" : "Foto do item (opcional)"}
                dica="Tire com o celular ou escolha uma imagem; ela é reduzida antes de enviar."
                aoEscolher={escolherFoto}
                ocupado={enviandoFoto}
              />
            </div>
            {f.foto_caminho && (
              <button type="button" className="btn !min-h-8" onClick={() => mudar({ foto_caminho: "" })}>
                Tirar a foto
              </button>
            )}
          </div>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">{servico ? "Como você cobra?" : "Em que unidade você vende?"}</p>
            <div className="flex flex-wrap gap-1.5">
              {UNIDADES.filter((u) => (servico ? ["H", "SV", "UN", "M2", "M"].includes(u.id) : u.id !== "SV" && u.id !== "H")).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={f.unidade === u.id}
                  onClick={() => mudar({ unidade: u.id })}
                  className={`chip border ${f.unidade === u.id ? "border-[var(--destaque-escuro)] bg-amber-50 font-semibold" : "border-[var(--borda)] bg-white"}`}
                  title={u.nome}
                >
                  {u.id} · {u.nome}
                </button>
              ))}
              <input
                aria-label="Outra unidade"
                className="w-24 rounded-md border border-[var(--borda)] px-2 text-sm"
                placeholder="Outra"
                value={UNIDADES.some((u) => u.id === f.unidade) ? "" : f.unidade}
                onChange={(e) => mudar({ unidade: e.target.value.toUpperCase().slice(0, 6) })}
              />
            </div>
          </div>
          {!servico && (
            <div className={`rounded-md border p-3 ${f.compraOutra ? "border-sky-200 bg-sky-50/40" : "border-[var(--borda)]"}`}>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={f.compraOutra} onChange={(e) => mudar({ compraOutra: e.target.checked })} />
                Compro em outra embalagem (ex.: compro caixa, vendo unidade)
              </label>
              {f.compraOutra && (
                <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                  <span className="pb-2">1</span>
                  <label className="campo w-28">
                    <span>Compro em</span>
                    <input
                      list="unidades-compra"
                      value={f.unidade_compra}
                      onChange={(e) => mudar({ unidade_compra: e.target.value.toUpperCase().slice(0, 6) })}
                    />
                    <datalist id="unidades-compra">
                      {UNIDADES.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <span className="pb-2">vem com</span>
                  <label className="campo w-28">
                    <span>Quantidade</span>
                    <input
                      value={f.fator_compra}
                      onChange={(e) => mudar({ fator_compra: e.target.value })}
                      inputMode="decimal"
                      placeholder="12"
                    />
                  </label>
                  <span className="pb-2">{f.unidade}</span>
                </div>
              )}
              {f.compraOutra && numeroBr(f.fator_compra) > 0 && (
                <p className="mt-1 text-xs text-neutral-600">
                  No pedido de compra você digita {f.unidade_compra}; o estoque entra em {f.unidade} (2 {f.unidade_compra} ={" "}
                  {2 * numeroBr(f.fator_compra)} {f.unidade}).
                </p>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {!servico && (
              <label className="campo">
                <span>Código de barras (opcional)</span>
                <input
                  value={f.codigo_barras}
                  onChange={(e) => mudar({ codigo_barras: e.target.value })}
                  inputMode="numeric"
                  placeholder="EAN / GTIN"
                />
              </label>
            )}
            <label className="campo">
              <span title="Classificação fiscal da mercadoria, usada na nota. Se não souber, pergunte ao setor fiscal.">NCM (opcional) ⓘ</span>
              <input value={f.ncm} onChange={(e) => mudar({ ncm: e.target.value })} inputMode="numeric" placeholder="0000.00.00" />
            </label>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-3">
          {f.natureza !== "revenda" ? (
            <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
              {servico
                ? "Serviço não tem estoque. Pode seguir para os preços."
                : "Material de uso não controla estoque: aparece nos pedidos de compra, mas não soma nem baixa saldo. Pode seguir."}
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 rounded-md border border-[var(--borda)] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={f.controla}
                  disabled={temSaldo}
                  onChange={(e) => mudar({ controla: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Controlar o estoque deste item</span>
                  <span className="block text-xs text-neutral-600">
                    Entra no estoque nas compras e sai sozinho nas vendas. Não deixa vender mais do que tem (salvo se o estoque negativo
                    estiver liberado em Estoques).
                    {temSaldo && " Este item tem saldo: para parar de controlar, zere o saldo antes."}
                  </span>
                </span>
              </label>
              {f.controla && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="campo">
                    <span title="Quando o saldo chegar neste número, o item aparece como 'abaixo do mínimo'.">Estoque mínimo ⓘ</span>
                    <input
                      value={f.estoque_minimo}
                      onChange={(e) => mudar({ estoque_minimo: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </label>
                  {!editando && (
                    <>
                      <label className="campo">
                        <span>Quanto tem hoje? ({f.unidade})</span>
                        <input
                          value={f.saldo_inicial}
                          onChange={(e) => mudar({ saldo_inicial: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                        />
                      </label>
                      <label className="campo">
                        <span>Em qual estoque</span>
                        <select value={f.local} onChange={(e) => mudar({ local: e.target.value })}>
                          {!base.locais.some((l) => l.ativo) && <option value="">Depósito principal (será criado)</option>}
                          {base.locais
                            .filter((l) => l.ativo)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.nome}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}
              {editando && f.controla && (
                <p className="text-xs text-neutral-500">O saldo muda pelas compras, vendas, movimentações ou inventário (menu Estoque).</p>
              )}
            </>
          )}
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="campo">
              <span title="Quanto você paga por 1 unidade de venda. Depois das compras, o HUB calcula o custo médio sozinho.">
                Preço de custo (R$) ⓘ
              </span>
              <input value={f.custo} onChange={(e) => mudar({ custo: e.target.value })} inputMode="decimal" placeholder="0,00" />
              {editando && item?.custo_medio != null && (
                <small className="text-xs text-neutral-500">Custo médio atual: {brl(Number(item.custo_medio))}</small>
              )}
            </label>
            <label className="campo">
              <span title="Quanto quer ganhar sobre o custo. Ex.: custo 10 + markup 50% = preço 15.">Markup desejado (%) ⓘ</span>
              <input value={f.markup} onChange={(e) => mudar({ markup: e.target.value })} inputMode="decimal" placeholder="Ex.: 50" />
              {sugerido != null && (
                <button
                  type="button"
                  className="btn-link text-left text-xs"
                  onClick={() => mudar({ preco_venda: valorParaCampo(sugerido) })}
                >
                  Usar preço sugerido: {brl(sugerido)}
                </button>
              )}
            </label>
            <label className="campo">
              <span>Preço de venda (R$)</span>
              <input
                value={f.preco_venda}
                onChange={(e) => mudar({ preco_venda: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </label>
          </div>
          {preco > 0 && custoRef > 0 && (
            <div
              className={`grid gap-2 rounded-md p-3 text-sm sm:grid-cols-3 ${preco < custoRef ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}
            >
              <p>
                <span className="block text-xs opacity-70">Lucro por unidade</span>
                <strong>{brl(preco - custoRef)}</strong>
              </p>
              <p>
                <span className="block text-xs opacity-70" title="Quanto do preço de venda sobra depois do custo.">
                  Margem sobre o preço ⓘ
                </span>
                <strong>{pct(margem(preco, custoRef))}</strong>
              </p>
              <p>
                <span className="block text-xs opacity-70" title="Quanto o preço está acima do custo.">
                  Markup sobre o custo ⓘ
                </span>
                <strong>{pct(markupDe(preco, custoRef))}</strong>
              </p>
              {preco < custoRef && <p className="sm:col-span-3">Atenção: o preço está abaixo do custo.</p>}
            </div>
          )}
          <p className="text-xs text-neutral-500">Margem e lucro não incluem impostos; para a carga tributária da venda, fale com a MDC.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span title="Para onde vai o dinheiro das vendas deste item nos relatórios.">Categoria na venda (receita) ⓘ</span>
              <select value={f.categoria_receita} onChange={(e) => mudar({ categoria_receita: e.target.value })}>
                <option value="">Nenhuma</option>
                {cats
                  .filter((c) => c.tipo === "receita" && (c.ativo || c.id === f.categoria_receita))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label className="campo">
              <span>Categoria na compra (despesa)</span>
              <select value={f.categoria_despesa} onChange={(e) => mudar({ categoria_despesa: e.target.value })}>
                <option value="">Nenhuma</option>
                {cats
                  .filter((c) => c.tipo === "despesa" && (c.ativo || c.id === f.categoria_despesa))
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
            <textarea rows={2} value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />
          </label>
          {editando && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
              Item ativo (desmarque para esconder das listas e dos pedidos; nada é apagado)
            </label>
          )}
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <button className="btn" onClick={passo === 0 ? aoFechar : () => irPara(passo - 1)}>
          {passo === 0 ? "Cancelar" : "Voltar"}
        </button>
        <div className="flex gap-2">
          {(editando || passo === PASSOS.length - 1) && (
            <button className="btn-primario" onClick={salvar} disabled={salvando || enviandoFoto}>
              {salvando ? "Salvando…" : "Salvar item"}
            </button>
          )}
          {passo < PASSOS.length - 1 && (
            <button className={editando ? "btn" : "btn-primario"} onClick={() => irPara(passo + 1)}>
              Continuar
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
