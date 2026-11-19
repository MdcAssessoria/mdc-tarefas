// Etiquetas das tarefas: prazo e situação (Chip com os tons padrão de components/ui/Tons), prioridade e setor.
import { hojeISO } from "@/lib/datas";
import type { Prioridade, Status } from "@/dominios/tarefas/tipos";
import type { Setor } from "@/dominios/organizacao/tipos";
import { nomePrioridade, nomeStatus } from "@/dominios/tarefas/tipos";
import { fmtData } from "@/lib/formato/datas";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { textoDoPrazo, tomDoPrazo, TOM_STATUS } from "@/dominios/tarefas/regras";

/**
 * Prazo da tarefa: "Atrasada 2 dias" (vermelho), "Vence hoje" (âmbar), "Em 5 dias" (azul); fechada mostra a data.
 * Com horário (089), mostra o relógio e a hora ao lado ("15:00"): é compromisso com lembrete.
 */
export function PrazoBadge({ prazo, status, fuso, hora }: { prazo: string | null; status: Status; fuso?: string; hora?: string | null }) {
  const fechada = status === "concluida" || status === "cancelada";
  const hoje = hojeISO(fuso);
  const hh = prazo && hora ? hora.slice(0, 5) : null;
  return (
    <span
      title={prazo ? `Prazo: ${fmtData(prazo)}${hh ? ` às ${hh} (aviso 10 min antes e na hora)` : ""}` : "Sem prazo"}
      className="inline-flex items-center gap-1 whitespace-nowrap"
    >
      <Chip tom={fechada ? "neutro" : tomDoPrazo(prazo, status, hoje)}>
        {fechada ? (prazo ? fmtData(prazo) : "Sem prazo") : textoDoPrazo(prazo, hoje)}
      </Chip>
      {hh && (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--marca)]">
          <Icone nome="relogio" className="h-3.5 w-3.5" />
          {hh}
        </span>
      )}
    </span>
  );
}

/** Situação da tarefa (A fazer, Em andamento, Aguardando, Concluída, Cancelada). */
export function StatusChip({ status }: { status: Status }) {
  return <Chip tom={TOM_STATUS[status]}>{nomeStatus(status)}</Chip>;
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
