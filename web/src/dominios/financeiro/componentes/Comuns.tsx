// Peças de tela repetidas no Financeiro: botões PDF/Excel, filtro de período, indicador, chip de situação, valor em
// reais (negativo em vermelho) e janela de motivo. Molde visual em docs/08-convencoes.md (8.3.1).
"use client";

import { useState } from "react";
import type { Cliente } from "@/dominios/clientes/tipos";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { Icone } from "@/components/ui/Icone";
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
        <Icone nome="documento" className="h-4 w-4" />
        PDF
      </button>
      <button className="btn" onClick={() => fazer(exportarXlsx)} disabled={vazio || ocupado} title="Baixar a lista filtrada em Excel">
        <Icone nome="planilha" className="h-4 w-4" />
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

export type Tom = "neutro" | "verde" | "vermelho" | "ambar" | "azul" | "violeta";

/** Cores de cada tom: texto do número, fundo e traço do ícone, e o chip. */
export const TONS: Record<Tom, { valor: string; icone: string; chip: string; ponto: string }> = {
  neutro: { valor: "text-[var(--texto)]", icone: "bg-[var(--fundo)] text-[var(--marca)]", chip: "bg-neutral-100 text-neutral-700", ponto: "bg-neutral-400" },
  verde: { valor: "text-emerald-800", icone: "bg-emerald-50 text-emerald-700", chip: "bg-emerald-50 text-emerald-800", ponto: "bg-emerald-600" },
  vermelho: { valor: "text-red-700", icone: "bg-red-50 text-red-700", chip: "bg-red-50 text-red-800", ponto: "bg-red-600" },
  ambar: { valor: "text-amber-800", icone: "bg-amber-50 text-amber-700", chip: "bg-amber-50 text-amber-900", ponto: "bg-amber-500" },
  azul: { valor: "text-sky-900", icone: "bg-sky-50 text-sky-700", chip: "bg-sky-50 text-sky-900", ponto: "bg-sky-600" },
  violeta: { valor: "text-violet-900", icone: "bg-violet-50 text-violet-700", chip: "bg-violet-50 text-violet-900", ponto: "bg-violet-600" },
};

/** Cartão de número em destaque, com ícone (clicável quando filtra a lista). */
export function Indicador({
  titulo,
  valor,
  detalhe,
  tom = "neutro",
  icone,
  ativo,
  aoClicar,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  tom?: Tom;
  icone?: string;
  ativo?: boolean;
  aoClicar?: () => void;
}) {
  const t = TONS[tom];
  const corpo = (
    <div className="flex items-start gap-3">
      {icone && (
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.icone}`} aria-hidden="true">
          <Icone nome={icone} className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[13px] text-[var(--texto-suave)]">{titulo}</p>
        <p className={`num text-xl font-semibold tracking-tight ${t.valor}`}>{valor}</p>
        {detalhe && <p className="text-xs text-[var(--texto-suave)]">{detalhe}</p>}
      </div>
      {aoClicar && (
        <span className={`ml-auto text-[11px] ${ativo ? "text-[var(--destaque-escuro)]" : "text-transparent"}`}>Filtrando</span>
      )}
    </div>
  );
  return aoClicar ? (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={!!ativo}
      title={ativo ? "Clique para tirar o filtro" : "Clique para ver só estes"}
      className={`cartao p-4 text-left transition hover:border-[var(--destaque-escuro)] ${ativo ? "border-[var(--destaque-escuro)] ring-2 ring-[var(--destaque)]" : ""}`}
    >
      {corpo}
    </button>
  ) : (
    <div className="cartao p-4">{corpo}</div>
  );
}

/** Chip de situação com bolinha de cor (mesmo desenho em todas as telas do Financeiro). */
export function Chip({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return (
    <span className={`chip ${TONS[tom].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONS[tom].ponto}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Valor em reais; negativo sai em vermelho. `sinal` colore também o positivo de verde (entradas). */
export function Valor({ v, sinal, className = "" }: { v: number; sinal?: boolean; className?: string }) {
  const cor = v < 0 ? "text-[var(--perigo)]" : sinal && v > 0 ? "text-emerald-800" : "";
  return <span className={`num whitespace-nowrap ${cor} ${className}`}>{brl(v)}</span>;
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

/** O que toda tela de cadastro (pessoas, categorias, centros) recebe da página. */
export interface PropsAba {
  cliente: Cliente;
  podeOperar: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
  /** Escolha da empresa, mostrada como primeiro campo do cartão de filtros da tela. */
  seletor?: React.ReactNode;
}
