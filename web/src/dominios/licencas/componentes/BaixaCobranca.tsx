// Janela "Dar baixa" de uma mensalidade de licença: data do recebimento, forma, juros e desconto (o total aparece
// na hora). A baixa é sempre do valor inteiro da mensalidade (o boleto/Pix é o mesmo do honorário).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { numeroBr } from "@/dominios/financeiro/regras";
import { FORMAS_PAGAMENTO } from "@/dominios/financeiro/tipos";
import { baixarCobranca } from "../repositorio";
import type { Cobranca } from "../tipos";

export function BaixaCobranca({
  cobranca,
  cliente,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  cobranca: Cobranca;
  cliente: string;
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [f, setF] = useState({ data: hoje, forma: "Pix", juros: "", desconto: "", obs: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const juros = numeroBr(f.juros);
  const desconto = numeroBr(f.desconto);
  const total = Math.round((cobranca.valor + (juros || 0) - (desconto || 0)) * 100) / 100;

  async function salvar() {
    if (!f.data) return setErro("Informe a data do recebimento.");
    if (f.data > hoje) return setErro("A data do recebimento não pode ser no futuro.");
    if ([juros, desconto].some((x) => Number.isNaN(x) || x < 0))
      return setErro("Juros e desconto: use valores positivos (ou deixe em branco).");
    if (total < 0) return setErro("O desconto é maior que a mensalidade.");
    setSalvando(true);
    try {
      await baixarCobranca({ cobranca: cobranca.id, data: f.data, forma: f.forma || null, juros, desconto, obs: f.obs.trim() || null });
      aoSalvar(`Recebimento de ${brl(total)} registrado.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Dar baixa na mensalidade"
      descricao={`${cliente} · ${cobranca.descricao} · ${brl(cobranca.valor)} · venceu/vence ${fmtData(cobranca.vencimento)}`}
      aoFechar={aoFechar}
      largura="lg"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Data do recebimento</span>
          <input type="date" value={f.data} max={hoje} onChange={(e) => mudar({ data: e.target.value })} />
        </label>
        <label className="campo">
          <span>Forma</span>
          <select value={f.forma} onChange={(e) => mudar({ forma: e.target.value })}>
            {FORMAS_PAGAMENTO.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Juros e multa (R$)</span>
          <input inputMode="decimal" value={f.juros} onChange={(e) => mudar({ juros: e.target.value })} placeholder="0,00" />
        </label>
        <label className="campo">
          <span>Desconto (R$)</span>
          <input inputMode="decimal" value={f.desconto} onChange={(e) => mudar({ desconto: e.target.value })} placeholder="0,00" />
        </label>
      </div>
      <label className="campo">
        <span>Observação (opcional)</span>
        <input value={f.obs} onChange={(e) => mudar({ obs: e.target.value })} placeholder="Ex.: pago junto com o honorário de outubro" />
      </label>
      <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
        Total recebido: <b>{Number.isNaN(total) ? "—" : brl(total)}</b>
      </p>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Aguarde…" : "Confirmar recebimento"}
        </button>
      </div>
    </Modal>
  );
}
