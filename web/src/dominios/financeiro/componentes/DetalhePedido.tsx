// Ver um pedido já lançado (ou cancelado): itens, totais, margem da venda, contas a receber/pagar geradas com a
// situação de cada uma. E as janelas de ação: confirmar/receber (com "já recebi/paguei") e faturar.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { lerTitulosDoPedido } from "../leituras";
import { confirmarPedido, faturarPedido, receberPedido } from "../repositorio";
import { margemVenda, situacaoPedido } from "../pedidosRegras";
import { pct, qtdBr } from "../estoqueRegras";
import { saldoDoTitulo, SITUACOES, situacaoDoTitulo } from "../regras";
import type { ContaBancaria, Pedido, PedidoItem } from "../tipos";
import { TEXTOS_PEDIDO } from "./EditorPedido";

export function DetalhePedido({
  pedido,
  itens,
  pessoa,
  local,
  hoje,
  aoFechar,
}: {
  pedido: Pedido;
  itens: PedidoItem[];
  pessoa: string;
  local: string;
  hoje: string;
  aoFechar: () => void;
}) {
  const T = TEXTOS_PEDIDO[pedido.tipo];
  const titulos = useConsulta(useCallback(() => lerTitulosDoPedido(pedido.id), [pedido.id]));
  const s = situacaoPedido(pedido.tipo, pedido.situacao);
  const custo = itens.reduce((a, l) => a + Number(l.custo_unitario ?? 0) * Number(l.quantidade) * Number(l.fator), 0);
  const m = pedido.tipo === "venda" && pedido.lancado_em ? margemVenda(Number(pedido.total_itens), custo) : null;
  return (
    <Modal
      titulo={`${T.nome} nº ${pedido.numero}`}
      descricao={`${pessoa || `Sem ${T.pessoa.toLowerCase()}`} · ${fmtData(pedido.data)} · ${local || "sem estoque"}`}
      aoFechar={aoFechar}
      largura="2xl"
    >
      <p>
        <span className={`chip ${s.tom}`}>{s.nome}</span> <span className="text-xs text-neutral-600">{s.dica}</span>
        {pedido.cancelado_motivo && <span className="block text-sm text-red-800">Motivo do cancelamento: {pedido.cancelado_motivo}</span>}
        {pedido.documento && <span className="block text-sm text-neutral-600">Documento: {pedido.documento}</span>}
      </p>
      <div className="overflow-x-auto">
        <table className="tabela text-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Qtd.</th>
              <th className="text-right">Preço</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.descricao}
                  {l.movimento_id && (
                    <span className="block text-xs text-neutral-500">
                      {pedido.tipo === "venda" ? "saiu do estoque" : "entrou no estoque"}
                      {l.custo_unitario != null && ` · custo ${brl(Number(l.custo_unitario))}`}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {qtdBr(l.quantidade)} {l.unidade}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">{brl(Number(l.preco_unitario))}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{brl(Number(l.total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Number(pedido.desconto) > 0 && (
              <tr>
                <td colSpan={3}>Desconto</td>
                <td className="text-right tabular-nums">− {brl(Number(pedido.desconto))}</td>
              </tr>
            )}
            {Number(pedido.frete) > 0 && (
              <tr>
                <td colSpan={3}>Frete</td>
                <td className="text-right tabular-nums">{brl(Number(pedido.frete))}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td colSpan={3}>Total</td>
              <td className="text-right tabular-nums">{brl(Number(pedido.total))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {m != null && (
        <p
          className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900"
          title="Venda dos itens menos o custo médio das mercadorias, sem impostos"
        >
          Custo das mercadorias {brl(custo)} · lucro bruto {brl(Number(pedido.total_itens) - custo)} · margem {pct(m)}
        </p>
      )}
      <div>
        <p className="mb-1 text-sm font-medium">Contas a {pedido.tipo === "venda" ? "receber" : "pagar"} geradas</p>
        {titulos.carregando && !titulos.dados ? (
          <Carregando />
        ) : !titulos.dados?.length ? (
          <p className="text-sm text-neutral-500">
            {pedido.lancado_em
              ? "Nenhuma (pedido sem valor)."
              : `Ainda não lançadas: ${pedido.parcelas.map((p) => `${p.numero}ª ${fmtData(p.vencimento)} ${brl(Number(p.valor))}`).join(" · ") || "—"}`}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...titulos.dados]
              .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
              .map((t) => {
                const st = SITUACOES[situacaoDoTitulo(t, hoje)];
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--borda)] py-1">
                    <span>
                      {fmtData(t.vencimento)} · {brl(Number(t.valor))}
                    </span>
                    <span className="flex items-center gap-2">
                      {saldoDoTitulo(t) > 0 && t.situacao === "aberto" && (
                        <span className="text-xs text-neutral-500">falta {brl(saldoDoTitulo(t))}</span>
                      )}
                      <span className={`chip ${st.tom}`}>{st.nome}</span>
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
      <div className="flex justify-end pt-2">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}

/** Confirmar a venda ou receber a compra: resumo do que vai acontecer e "já recebi/paguei". */
export function JanelaLancar({
  pedido,
  itens,
  contas,
  hoje,
  aoFechar,
  aoFeito,
}: {
  pedido: Pedido;
  itens: PedidoItem[];
  contas: ContaBancaria[];
  hoje: string;
  aoFechar: () => void;
  aoFeito: (msg: string) => void;
}) {
  const venda = pedido.tipo === "venda";
  const ativas = contas.filter((c) => c.ativo);
  const [data, setData] = useState(venda ? pedido.data : hoje);
  const [documento, setDocumento] = useState(pedido.documento ?? "");
  const [jaPago, setJaPago] = useState(false);
  const [conta, setConta] = useState(ativas.length === 1 ? ativas[0].id : "");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function lancar() {
    if (jaPago && !conta) return setErro("Escolha a conta bancária.");
    setOcupado(true);
    setErro("");
    try {
      const pago = jaPago ? { data, conta, forma: pedido.forma_pagamento } : null;
      if (venda) await confirmarPedido(pedido.id, { pago, data });
      else await receberPedido(pedido.id, { pago, data, documento: documento.trim() || null });
      aoFeito(venda ? `Venda nº ${pedido.numero} confirmada.` : `Compra nº ${pedido.numero} recebida.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={venda ? `Confirmar a venda nº ${pedido.numero}` : `Receber a compra nº ${pedido.numero}`}
      descricao={
        venda
          ? "Os produtos saem do estoque agora e as parcelas viram contas a receber. Para desfazer, cancele o pedido."
          : "A mercadoria entra no estoque (o custo médio é recalculado) e as parcelas viram contas a pagar."
      }
      aoFechar={aoFechar}
    >
      <ul className="space-y-0.5 text-sm">
        {itens.map((l) => (
          <li key={l.id} className="flex justify-between gap-2">
            <span>{l.descricao}</span>
            <span className="tabular-nums">
              {qtdBr(l.quantidade)} {l.unidade}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {pedido.parcelas.length} parcela(s), total <strong>{brl(Number(pedido.total))}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>{venda ? "Data da saída" : "Data da chegada"}</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        {!venda && (
          <label className="campo">
            <span>Nº da nota do fornecedor</span>
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </label>
        )}
      </div>
      {Number(pedido.total) > 0 && (
        <div className="rounded-md border border-[var(--borda)] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
            {TEXTOS_PEDIDO[pedido.tipo].pago}
          </label>
          {jaPago && (
            <label className="campo mt-2">
              <span>Conta bancária</span>
              <select value={conta} onChange={(e) => setConta(e.target.value)}>
                <option value="">Escolha…</option>
                {ativas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={lancar} disabled={ocupado}>
          {ocupado ? "Aguarde…" : venda ? "Confirmar venda" : "Receber mercadoria"}
        </button>
      </div>
    </Modal>
  );
}

/** Marcar a venda como faturada, com o número da nota. */
export function JanelaFaturar({ pedido, aoFechar, aoFeito }: { pedido: Pedido; aoFechar: () => void; aoFeito: (msg: string) => void }) {
  const [nota, setNota] = useState(pedido.documento ?? "");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal
      titulo={`Faturar a venda nº ${pedido.numero}`}
      descricao="Registre o número da nota fiscal emitida para esta venda."
      aoFechar={aoFechar}
    >
      <label className="campo">
        <span>Número da nota fiscal</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button
          className="btn-primario"
          disabled={ocupado || !nota.trim()}
          onClick={async () => {
            setOcupado(true);
            try {
              await faturarPedido(pedido.id, nota.trim());
              aoFeito(`Venda nº ${pedido.numero} faturada (nota ${nota.trim()}).`);
            } catch (e) {
              setErro(traduzirErro(e));
              setOcupado(false);
            }
          }}
        >
          Faturar
        </button>
      </div>
    </Modal>
  );
}
