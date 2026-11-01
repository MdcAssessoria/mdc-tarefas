// Peças de tela repetidas no Financeiro: botões PDF/Excel, filtro de período, indicador e janela de motivo.
"use client";

import { useState } from "react";
import type { Cliente } from "@/dominios/clientes/tipos";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { PERIODOS } from "../regras";
import type { Periodo } from "../regras";
import { exportarPdf, exportarXlsx } from "../exportar";
import type { ListaExportavel } from "../exportar";

/** PDF e Excel do que está na tela. `montar` é chamado só no clique. */
export function BotoesExportar<L>({
  montar,
  vazio,
  avisar,
}: {
  montar: () => ListaExportavel<L>;
  vazio: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  async function fazer(f: typeof exportarPdf) {
    setOcupado(true);
    try {
      await f(montar());
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <button className="btn" onClick={() => fazer(exportarPdf)} disabled={vazio || ocupado} title="Baixar a lista filtrada em PDF">
        PDF
      </button>
      <button className="btn" onClick={() => fazer(exportarXlsx)} disabled={vazio || ocupado} title="Baixar a lista filtrada em Excel">
        Excel
      </button>
    </>
  );
}

/** Período em um clique; "Escolher datas" abre os dois campos. */
export function FiltroPeriodo({
  rotulo = "Período",
  periodo,
  de,
  ate,
  aoMudar,
}: {
  rotulo?: string;
  periodo: Periodo;
  de: string;
  ate: string;
  aoMudar: (v: { periodo?: Periodo; de?: string; ate?: string }) => void;
}) {
  return (
    <>
      <label className="campo">
        <span>{rotulo}</span>
        <select value={periodo} onChange={(e) => aoMudar({ periodo: e.target.value as Periodo })}>
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      {periodo === "escolher" && (
        <>
          <label className="campo">
            <span>De</span>
            <input type="date" value={de} onChange={(e) => aoMudar({ de: e.target.value })} />
          </label>
          <label className="campo">
            <span>Até</span>
            <input type="date" value={ate} onChange={(e) => aoMudar({ ate: e.target.value })} />
          </label>
        </>
      )}
    </>
  );
}

/** Cartão de número em destaque (clicável quando filtra a lista). */
export function Indicador({
  titulo,
  valor,
  detalhe,
  tom = "neutro",
  ativo,
  aoClicar,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  tom?: "neutro" | "verde" | "vermelho" | "ambar";
  ativo?: boolean;
  aoClicar?: () => void;
}) {
  const cor = { neutro: "text-neutral-900", verde: "text-emerald-800", vermelho: "text-red-700", ambar: "text-amber-800" }[tom];
  const corpo = (
    <>
      <p className="text-xs text-neutral-500">{titulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="text-xs text-neutral-500">{detalhe}</p>}
    </>
  );
  return aoClicar ? (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={!!ativo}
      className={`cartao p-4 text-left transition hover:ring-2 hover:ring-[var(--destaque)] ${ativo ? "ring-2 ring-[var(--destaque-escuro)]" : ""}`}
    >
      {corpo}
    </button>
  ) : (
    <div className="cartao p-4">{corpo}</div>
  );
}

/** Confirmação que exige motivo (cancelar título, estornar pagamento ou movimento). */
export function JanelaMotivo({
  titulo,
  descricao,
  botao,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  descricao: React.ReactNode;
  botao: string;
  aoConfirmar: (motivo: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    if (!motivo.trim()) return setErro("Escreva o motivo. Ele fica guardado no histórico.");
    setOcupado(true);
    try {
      await aoConfirmar(motivo.trim());
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal titulo={titulo} descricao={descricao} aoFechar={aoFechar}>
      <label className="campo">
        <span>Motivo</span>
        <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: lançado em duplicidade" />
      </label>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario !bg-[var(--perigo)] !border-[var(--perigo)]" onClick={confirmar} disabled={ocupado}>
          {ocupado ? "Aguarde…" : botao}
        </button>
      </div>
    </Modal>
  );
}

/** O que toda aba de cadastro do Financeiro recebe da página. */
export interface PropsAba {
  cliente: Cliente;
  podeOperar: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
}
