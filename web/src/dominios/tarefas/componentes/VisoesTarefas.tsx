// As duas visões da tela de Tarefas: a lista (molde 8.3.1, vira cartões no celular) e o quadro por situação
// (arrastar o cartão entre colunas muda a situação). A tela (app/(hub)/tarefas) cuida dos filtros e da gravação.
"use client";

import { useState } from "react";
import type { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { fmtCompetencia } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { STATUS } from "../tipos";
import type { Status, Tarefa } from "../tipos";
import { estaAberta } from "../regras";
import { PrazoBadge, PrioridadeDot, SetorChip } from "./Badges";

export interface VisaoProps {
  tarefas: Tarefa[];
  abrir: (t: Tarefa) => void;
  mudarStatus: (t: Tarefa, s: Status) => void;
  fuso: string;
  setorPorId: ReturnType<typeof useOrg>["setorPorId"];
  clientePorId: ReturnType<typeof useOrg>["clientePorId"];
  nomeMembro: ReturnType<typeof useOrg>["nomeMembro"];
  /** Rodapé da lista (ex.: aviso de que as concluídas são só dos últimos 45 dias). */
  rodape?: React.ReactNode;
}

const MOSTRAR = 500;

export function ListaTarefas({ tarefas, abrir, mudarStatus, fuso, setorPorId, clientePorId, nomeMembro, rodape }: VisaoProps) {
  const aviso =
    tarefas.length > MOSTRAR
      ? `Mostrando ${MOSTRAR} de ${tarefas.length}. A exportação traz todas; use os filtros para achar o resto.`
      : null;
  return (
    <QuadroTabela
      rotulo="Tarefas"
      rodape={
        aviso || rodape ? (
          <>
            {aviso} {rodape}
          </>
        ) : undefined
      }
    >
      <thead>
        <tr>
          <th>Tarefa</th>
          <th>Setor</th>
          <th>Responsável</th>
          <th>Prazo</th>
          <th>Situação</th>
          <th>
            <span className="sr-only">Ações</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {tarefas.slice(0, MOSTRAR).map((t) => {
          const c = clientePorId(t.cliente_id);
          const feita = t.status === "concluida";
          const fechada = !estaAberta(t.status);
          return (
            <tr key={t.id} className={t.status === "cancelada" ? "opacity-60" : ""}>
              <td className="celula-titulo min-w-64">
                <button type="button" className="w-full text-left" onClick={() => abrir(t)} title="Abrir a tarefa">
                  <span className="flex items-start gap-2">
                    <span className="mt-1.5 shrink-0">
                      <PrioridadeDot p={t.prioridade} />
                    </span>
                    <span className={`font-medium ${fechada ? "text-neutral-500 line-through" : "text-[var(--texto)]"}`}>{t.titulo}</span>
                  </span>
                  <span className="mt-0.5 block pl-[18px] text-xs font-normal text-[var(--texto-suave)]">
                    {nomeCliente(c, "Interna (sem cliente)")}
                    {t.competencia && ` · competência ${fmtCompetencia(t.competencia)}`}
                  </span>
                </button>
              </td>
              <td data-rotulo="Setor" className="whitespace-nowrap">
                {setorPorId(t.setor_id) ? (
                  <SetorChip setor={setorPorId(t.setor_id)} />
                ) : (
                  <span className="text-[var(--texto-suave)]">—</span>
                )}
              </td>
              <td data-rotulo="Responsável" className="min-w-32">
                {nomeMembro(t.responsavel_id)}
              </td>
              <td data-rotulo="Prazo">
                <PrazoBadge prazo={t.prazo} status={t.status} fuso={fuso} />
              </td>
              <td data-rotulo="Situação">
                <select
                  className="entrada !min-h-8 w-36 !py-1 text-sm"
                  value={t.status}
                  onChange={(e) => mudarStatus(t, e.target.value as Status)}
                  aria-label={`Situação de ${t.titulo}`}
                >
                  {STATUS.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === "cancelada" && t.status !== "cancelada"}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </td>
              <td className="celula-acoes whitespace-nowrap text-right">
                <div className="flex justify-end gap-1">
                  {estaAberta(t.status) && (
                    <button className="btn !min-h-8 !px-3" onClick={() => mudarStatus(t, "concluida")} title="Marcar como concluída">
                      <Icone nome="check" className="h-4 w-4" />
                      Concluir
                    </button>
                  )}
                  {feita && (
                    <button className="btn !min-h-8 !px-3" onClick={() => mudarStatus(t, "a_fazer")} title="Voltar para A fazer">
                      <Icone nome="atualizar" className="h-4 w-4" />
                      Reabrir
                    </button>
                  )}
                  <button className="btn !min-h-8 !px-3" onClick={() => abrir(t)} title="Abrir para ver ou editar">
                    <Icone nome="editar" className="h-4 w-4" />
                    Abrir
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </QuadroTabela>
  );
}

const LIMITE_COLUNA = 200;

export function QuadroTarefas({ tarefas, abrir, mudarStatus, fuso, setorPorId, clientePorId, nomeMembro }: VisaoProps) {
  const [sobre, setSobre] = useState<Status | null>(null);
  const colunas = STATUS.filter((s) => s.id !== "cancelada");
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <p className="mb-2 text-xs text-[var(--texto-suave)]">
        Arraste o cartão para outra coluna para mudar a situação. Para cancelar, abra a tarefa.
      </p>
      <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3">
        {colunas.map((col) => {
          const itens = tarefas.filter((t) => t.status === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.nome}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.id);
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                const id = e.dataTransfer.getData("text/plain");
                const t = tarefas.find((x) => x.id === id);
                if (t && t.status !== col.id) mudarStatus(t, col.id);
              }}
              className={`rounded-xl border p-2 transition ${
                sobre === col.id ? "border-[var(--destaque-escuro)] bg-[#efe9da]" : "border-[var(--borda)] bg-[#eeebe2]"
              }`}
            >
              <div className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-[var(--marca)]">
                {col.nome}
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-xs font-medium text-[var(--texto-suave)]">
                  {itens.length}
                </span>
              </div>
              <div className="max-h-[calc(100vh-330px)] min-h-24 space-y-2 overflow-y-auto">
                {itens.length === 0 && <p className="px-2 py-4 text-center text-xs text-[var(--texto-suave)]">Nenhuma tarefa aqui.</p>}
                {itens.slice(0, LIMITE_COLUNA).map((t) => {
                  const c = clientePorId(t.cliente_id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      onClick={() => abrir(t)}
                      className="cartao block w-full cursor-pointer space-y-2 p-3 text-left text-sm hover:border-[var(--destaque-escuro)]"
                    >
                      <span className="flex items-start gap-2">
                        <span className="mt-1.5">
                          <PrioridadeDot p={t.prioridade} />
                        </span>
                        <span className="font-medium leading-snug">{t.titulo}</span>
                      </span>
                      {c && <span className="block truncate text-xs text-[var(--texto-suave)]">{nomeCliente(c)}</span>}
                      <span className="flex flex-wrap items-center gap-1.5">
                        <PrazoBadge prazo={t.prazo} status={t.status} fuso={fuso} />
                        <SetorChip setor={setorPorId(t.setor_id)} />
                      </span>
                      <span className="block text-xs text-[var(--texto-suave)]">{nomeMembro(t.responsavel_id)}</span>
                    </button>
                  );
                })}
                {itens.length > LIMITE_COLUNA && (
                  <p className="px-2 text-xs text-[var(--texto-suave)]">
                    E mais {itens.length - LIMITE_COLUNA}. Use os filtros para achar.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
