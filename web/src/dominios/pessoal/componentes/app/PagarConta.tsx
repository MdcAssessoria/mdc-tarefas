// Tela "Pagar" do app da família: mostra a conta e dá baixa do que falta com um toque, escolhendo de qual conta saiu
// o dinheiro e quando. Grava pela mesma função do Financeiro (fin_baixar). Pagamento de só uma parte, juros ou desconto
// ficam na lista completa (Financeiro › Contas a pagar).
"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { somarDias } from "@/lib/datas";
import { baixar } from "@/dominios/financeiro/repositorio";
import { falta, quando, quitada, textoVencimento } from "../../app";
import type { ContaApp } from "../../app";
import type { ContaBanco } from "./dados";
import { Escolha, EscolhaData } from "./Escolhas";
import { avisarMudanca } from "./dados";
import { avisoRapido } from "./avisoRapido";

export function PagarConta({
  conta: c,
  bancos,
  hoje,
  podePagar,
  aoFechar,
}: {
  conta: ContaApp;
  bancos: ContaBanco[];
  hoje: string;
  podePagar: boolean;
  aoFechar: () => void;
}) {
  const receber = c.tipo === "receber";
  const paga = quitada(c);
  const [banco, setBanco] = useState(bancos[0]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const q = quando(c.vencimento, hoje);

  async function confirmar() {
    if (salvando) return;
    if (!banco) return setErro(receber ? "Escolha em qual conta o dinheiro entrou." : "Escolha de qual conta o dinheiro saiu.");
    setSalvando(true);
    setErro(null);
    try {
      await baixar({ titulo: c.id, data, valor: falta(c), conta: banco, juros: 0, multa: 0, desconto: 0, forma: null, obs: null });
      avisarMudanca();
      avisoRapido(receber ? `${c.descricao}: recebido` : `${c.descricao}: paga`);
      aoFechar();
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  const chip = paga
    ? "bg-emerald-50 text-emerald-900"
    : receber
      ? "bg-emerald-50 text-emerald-900"
      : q === "atrasada"
        ? "bg-red-50 text-red-800"
        : q === "hoje"
          ? "bg-amber-50 text-amber-900"
          : "bg-[#F1EEE5] text-[var(--marca)]";

  return (
    <Modal
      titulo={c.descricao}
      largura="lg"
      celularCheio
      aoFechar={aoFechar}
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <>
          {!paga && podePagar && (
            <button type="button" className="btn-primario min-h-12 flex-1 text-base sm:flex-none" disabled={salvando} onClick={() => void confirmar()}>
              <Icone nome="check" className="h-5 w-5" />
              {salvando ? "Gravando…" : receber ? "Marcar como recebido" : "Marcar como paga"}
            </button>
          )}
          <button type="button" className="btn min-h-12" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <section className="rounded-2xl border border-[var(--borda)] bg-white p-4 text-center">
        <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${chip}`}>
          {paga ? (receber ? "Recebido" : "Paga") : textoVencimento(c, hoje)}
        </span>
        <p className="num mt-2 text-4xl font-semibold tracking-tight text-[var(--marca)]">{brl(paga ? c.valor : falta(c))}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {[c.categoria, c.parcelas && c.parcelas > 1 ? `parcela ${c.parcela} de ${c.parcelas}` : null, `vencimento ${c.vencimento.split("-").reverse().join("/")}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>

      {!paga && podePagar && (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--marca)]">{receber ? "Entrou em qual conta?" : "Saiu de onde?"}</p>
            {bancos.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {bancos.map((b) => (
                  <Escolha key={b.id} rotulo={b.nome} icone="banco" alto ativo={banco === b.id} aoEscolher={() => setBanco(b.id)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-600">
                Cadastre primeiro onde o dinheiro fica (conta do banco ou carteira) em{" "}
                <Link className="font-semibold text-[var(--marca)] underline" href="/financeiro/bancos">
                  Contas e cartões
                </Link>
                .
              </p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--marca)]">Quando?</p>
            <EscolhaData valor={data} hoje={hoje} ontem={somarDias(hoje, -1)} aoMudar={setData} />
          </div>
          <p className="text-xs text-neutral-500">
            Pagou só uma parte, com juros ou desconto? Use a{" "}
            <Link className="underline" href={receber ? "/financeiro/receber" : "/financeiro/pagar"}>
              lista completa
            </Link>
            .
          </p>
        </>
      )}
    </Modal>
  );
}
