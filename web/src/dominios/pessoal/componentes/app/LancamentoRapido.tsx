// "Lançar um gasto / uma entrada" do app da família: valor no teclado grande (dígitos viram centavos), tipo de gasto
// com ícone, quando e se já foi pago. Grava pela mesma função do Financeiro (fin_lancar), já paga quando marcado.
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { somarDias } from "@/lib/datas";
import { lancar } from "@/dominios/financeiro/repositorio";
import { iconeDaCategoria, teclar, valorDosDigitos } from "../../app";
import type { Categoria, ContaBanco } from "./dados";
import { avisarMudanca } from "./dados";
import { Escolha, EscolhaData } from "./Escolhas";
import { avisoRapido } from "./avisoRapido";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "apagar"];
// os mais usados primeiro (o resto segue em ordem alfabética)
const PRIMEIROS = /mercado|contas da casa|moradia|transporte|restaurante|saúde|salário|renda extra/i;

export function LancamentoRapido({
  tipoInicial,
  cliente,
  categorias,
  bancos,
  hoje,
  aoFechar,
}: {
  tipoInicial: "pagar" | "receber";
  cliente: string;
  categorias: Categoria[];
  bancos: ContaBanco[];
  hoje: string;
  aoFechar: () => void;
}) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [digitos, setDigitos] = useState("");
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [data, setData] = useState(hoje);
  const [pago, setPago] = useState(true);
  const [banco, setBanco] = useState(bancos[0]?.id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gasto = tipo === "pagar";
  const valor = valorDosDigitos(digitos);
  const opcoes = categorias
    .filter((c) => c.tipo === (gasto ? "despesa" : "receita"))
    .sort((a, b) => Number(PRIMEIROS.test(b.nome)) - Number(PRIMEIROS.test(a.nome)) || a.nome.localeCompare(b.nome, "pt-BR"));
  const escolhida = opcoes.find((c) => c.id === categoria);
  const falta = !valor ? "Digite o valor" : !escolhida ? (gasto ? "Escolha o tipo de gasto" : "Escolha o tipo de entrada") : pago && !banco ? "Escolha a conta" : null;

  function trocarTipo(t: "pagar" | "receber") {
    setTipo(t);
    setCategoria("");
  }

  async function salvar() {
    if (salvando || falta || !escolhida) return;
    setSalvando(true);
    setErro(null);
    try {
      await lancar({
        cliente,
        tipo,
        categoria: escolhida.id,
        descricao: texto.trim() || escolhida.nome,
        vencimento: data,
        valor,
        parcelas: 1,
        pago: pago ? { data, conta: banco } : null,
      });
      avisarMudanca();
      avisoRapido(`${gasto ? "Gasto" : "Entrada"} de ${brl(valor)} salvo`);
      aoFechar();
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={gasto ? "Novo gasto" : "Nova entrada"}
      largura="lg"
      celularCheio
      aoFechar={aoFechar}
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <>
          <button type="button" className="btn-primario min-h-12 flex-1 text-base sm:flex-none" disabled={!!falta || salvando} onClick={() => void salvar()}>
            <Icone nome="check" className="h-5 w-5" />
            {salvando ? "Gravando…" : (falta ?? `Salvar ${gasto ? "gasto" : "entrada"} de ${brl(valor)}`)}
          </button>
          <button type="button" className="btn min-h-12" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#E9E5D9] p-1" role="group" aria-label="Gasto ou entrada">
        {(["pagar", "receber"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => trocarTipo(t)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${
              tipo === t ? (t === "pagar" ? "bg-white text-red-700 shadow-sm" : "bg-white text-emerald-800 shadow-sm") : "text-neutral-600"
            }`}
          >
            <Icone nome={t === "pagar" ? "seta-saida" : "seta-entrada"} className="h-4 w-4" />
            {t === "pagar" ? "Gasto" : "Entrada"}
          </button>
        ))}
      </div>

      <div className="text-center">
        <p className="text-[13px] text-neutral-600">{gasto ? "Quanto você gastou?" : "Quanto entrou?"}</p>
        <p aria-live="polite" className={`num text-5xl font-semibold tracking-tight ${valor ? (gasto ? "text-[var(--marca)]" : "text-emerald-800") : "text-neutral-300"}`}>
          {brl(valor)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TECLAS.map((t) => (
          <button
            key={t}
            type="button"
            aria-label={t === "apagar" ? "Apagar o último número" : t}
            onClick={() => setDigitos((d) => teclar(d, t))}
            className="grid min-h-12 place-items-center rounded-xl bg-white text-2xl font-medium text-[var(--marca)] shadow-[0_1px_0_#E3DFD3] transition active:scale-95 active:bg-[#F1EEE5]"
          >
            {t === "apagar" ? <Icone nome="apagar" className="h-6 w-6" /> : t}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-[var(--marca)]">{gasto ? "Tipo de gasto" : "Tipo de entrada"}</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {opcoes.map((c) => {
            const ativo = c.id === categoria;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setCategoria(c.id)}
                className={`flex w-[88px] shrink-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-[12px] font-semibold leading-tight transition active:scale-95 ${
                  ativo ? "border-2 border-[var(--marca)] bg-white text-[var(--marca)]" : "border-[var(--borda)] bg-white text-neutral-700"
                }`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${ativo ? "bg-[var(--marca)] text-[var(--destaque)]" : "bg-[#F1EEE5] text-[var(--marca)]"}`}>
                  <Icone nome={iconeDaCategoria(c.nome, tipo)} className="h-5 w-5" />
                </span>
                <span className="line-clamp-2 text-center">{c.nome}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="campo">
        <span>{gasto ? "Com o quê? (se quiser)" : "De onde veio? (se quiser)"}</span>
        <input value={texto} maxLength={120} onChange={(e) => setTexto(e.target.value)} placeholder={escolhida?.nome ?? (gasto ? "Ex.: compra do mês" : "Ex.: salário de novembro")} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--marca)]">Quando?</p>
          <EscolhaData valor={data} hoje={hoje} ontem={somarDias(hoje, -1)} aoMudar={setData} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--marca)]">{gasto ? "Já pagou?" : "Já recebeu?"}</p>
          <div className="grid grid-cols-2 gap-2">
            <Escolha rotulo={gasto ? "Já paguei" : "Já recebi"} ativo={pago} aoEscolher={() => setPago(true)} />
            <Escolha rotulo={gasto ? "Vou pagar" : "Vou receber"} ativo={!pago} aoEscolher={() => setPago(false)} />
          </div>
        </div>
      </div>

      {pago && (
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--marca)]">{gasto ? "Saiu de onde?" : "Entrou em qual conta?"}</p>
          {bancos.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bancos.map((b) => (
                <Escolha key={b.id} rotulo={b.nome} icone="banco" ativo={banco === b.id} aoEscolher={() => setBanco(b.id)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">Nenhuma conta cadastrada: marque “{gasto ? "Vou pagar" : "Vou receber"}” ou cadastre em Família › Contas e cartões.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
