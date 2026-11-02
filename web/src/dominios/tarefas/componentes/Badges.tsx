// Etiquetas das tarefas: prazo e situação (Chip com os tons padrão de components/ui/Tons), prioridade e setor.
import { hojeISO } from "@/lib/datas";
import type { Prioridade, Status } from "@/dominios/tarefas/tipos";
import type { Setor } from "@/dominios/organizacao/tipos";
import { nomePrioridade, nomeStatus } from "@/dominios/tarefas/tipos";
import { fmtData } from "@/lib/formato/datas";
import { Chip } from "@/components/ui/Chip";
import { textoDoPrazo, tomDoPrazo, TOM_STATUS } from "@/dominios/tarefas/regras";

/** Prazo da tarefa: "Atrasada 2 dias" (vermelho), "Vence hoje" (âmbar), "Em 5 dias" (azul); fechada mostra a data. */
export function PrazoBadge({ prazo, status, fuso }: { prazo: string | null; status: Status; fuso?: string }) {
  const fechada = status === "concluida" || status === "cancelada";
  const hoje = hojeISO(fuso);
  return (
    <span title={prazo ? `Prazo: ${fmtData(prazo)}` : "Sem prazo"} className="whitespace-nowrap">
      <Chip tom={fechada ? "neutro" : tomDoPrazo(prazo, status, hoje)}>
        {fechada ? (prazo ? fmtData(prazo) : "Sem prazo") : textoDoPrazo(prazo, hoje)}
      </Chip>
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
