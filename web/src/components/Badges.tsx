import { diasAte, fmtData, rotuloPrazo } from "@/lib/datas";
import type { Prioridade, Setor, Status } from "@/lib/types";
import { nomePrioridade } from "@/lib/types";

export function PrazoBadge({ prazo, status, fuso }: { prazo: string | null; status: Status; fuso?: string }) {
  const fechada = status === "concluida" || status === "cancelada";
  const d = diasAte(prazo, fuso);
  let cls = "bg-neutral-100 text-neutral-600";
  if (!fechada && d !== null) {
    if (d < 0) cls = "bg-red-50 text-red-700 ring-1 ring-red-200";
    else if (d === 0) cls = "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    else if (d <= 3) cls = "bg-yellow-50 text-yellow-800";
  }
  return (
    <span className={`chip ${cls}`} title={fmtData(prazo)}>
      {fechada ? fmtData(prazo) : rotuloPrazo(d)}
    </span>
  );
}

const COR_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "#9CA3AF",
  media: "#8A6A2A",
  alta: "#D97706",
  urgente: "#B42318",
};

export function PrioridadeDot({ p }: { p: Prioridade }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: COR_PRIORIDADE[p] }}
      title={`Prioridade ${nomePrioridade(p).toLowerCase()}`}
    />
  );
}

export function SetorChip({ setor }: { setor?: Setor }) {
  if (!setor) return null;
  return (
    <span className="chip text-[var(--texto)]" style={{ background: setor.cor + "33" }}>
      <span className="h-2 w-2 rounded-full" style={{ background: setor.cor }} />
      {setor.nome}
    </span>
  );
}
