// Janela "Transferir entre contas": dinheiro que sai de uma conta bancária e entra em outra da mesma empresa
// (aplicação, reforço de caixa, troca de banco). Não é receita nem despesa. A regra é conferida no banco (fin_transferir).
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { numeroBr } from "../regras";
import { transferir } from "../repositorio";
import type { ContaBancaria } from "../tipos";

export function NovaTransferencia({
  contas,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  contas: ContaBancaria[];
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const ativas = contas.filter((c) => c.ativo);
  const [origem, setOrigem] = useState(ativas[0]?.id ?? "");
  const [destino, setDestino] = useState(ativas[1]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const nome = (id: string) => ativas.find((c) => c.id === id)?.nome ?? "";

  async function salvar() {
    const v = Math.round(numeroBr(valor) * 100) / 100;
    if (!origem || !destino) return setErro("Escolha a conta de onde sai e a conta para onde vai o dinheiro.");
    if (origem === destino) return setErro("Escolha contas diferentes para a origem e o destino.");
    if (!data) return setErro("Informe a data da transferência.");
    if (!(v > 0)) return setErro("Informe o valor (ex.: 1.500,00).");
    setOcupado(true);
    try {
      await transferir({ origem, destino, data, valor: v, obs: obs.trim() || undefined });
      aoSalvar(`Transferência de ${brl(v)} registrada: ${nome(origem)} → ${nome(destino)}.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Transferir entre contas"
      descricao="Dinheiro que passou de uma conta bancária para outra da mesma empresa. Não entra como receita nem como despesa."
      aoFechar={aoFechar}
      largura="lg"
    >
      {ativas.length < 2 ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          É preciso ter pelo menos duas contas bancárias ativas. Cadastre a outra conta em Bancos.
        </p>
      ) : (
        <>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <label className="campo">
              <span>Sai da conta</span>
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                {ativas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn !min-h-[38px] !px-2.5"
              onClick={() => {
                setOrigem(destino);
                setDestino(origem);
              }}
              title="Inverter origem e destino"
              aria-label="Inverter origem e destino"
            >
              <Icone nome="transferir" className="h-4 w-4" />
            </button>
            <label className="campo">
              <span>Entra na conta</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                {ativas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="campo">
              <span>Valor (R$)</span>
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
          </div>
          <label className="campo">
            <span>Observação (opcional)</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: aplicação, reforço de caixa" />
          </label>
        </>
      )}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={ocupado || ativas.length < 2}>
          {ocupado ? "Salvando…" : "Transferir"}
        </button>
      </div>
    </Modal>
  );
}
