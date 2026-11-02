// Fases do processo na ficha: situação, responsável e prazo editáveis (quem opera, com o processo em andamento),
// anexar documento da fase e link da tarefa. No celular cada fase vira um cartão (QuadroTabela).
"use client";

import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { diasAte } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { STATUS_FASE, diasParado, nomeStatusFase, tomStatusFase } from "../processos";
import type { SocFase, SocProcesso, StatusFase } from "../processos";

const CAMPO = "entrada !min-h-9 !py-1 text-sm w-full sm:w-auto max-w-[13rem] sm:max-w-none";

export function FasesProcesso({
  processo,
  fases,
  podeOperar,
  aoMudarStatus,
  aoAtualizar,
  aoAnexar,
}: {
  processo: SocProcesso;
  fases: SocFase[];
  podeOperar: boolean;
  aoMudarStatus: (f: SocFase, status: StatusFase) => void;
  aoAtualizar: (f: SocFase, campos: Partial<SocFase>) => void;
  aoAnexar: (arquivos: FileList | null, faseNome: string) => void;
}) {
  const { org, membros, nomeMembro } = useOrg();
  const aberto = processo.status === "aberto";
  const concluidas = fases.filter((f) => f.status === "concluida" || f.status === "dispensada").length;

  return (
    <section className="space-y-2" aria-labelledby="titulo-fases">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-fases" className="flex items-center gap-2 font-semibold text-[var(--marca)]">
          <Icone nome="lista" className="h-4 w-4" />
          Fases do processo
        </h2>
        <span className="flex items-center gap-2 text-xs text-[var(--texto-suave)]">
          <span className="h-2 w-24 overflow-hidden rounded-full bg-[#e7e3d6]" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-[var(--destaque-escuro)]"
              style={{ width: `${fases.length ? (concluidas / fases.length) * 100 : 0}%` }}
            />
          </span>
          {concluidas} de {fases.length} fases resolvidas
        </span>
      </div>
      <QuadroTabela rotulo="Fases do processo">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Situação</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Início → fim</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fases.map((f) => {
            const atual = aberto && f.ordem === processo.fase_atual;
            const editavel = aberto && podeOperar && f.status !== "dispensada" && f.status !== "concluida";
            const d = diasAte(f.prazo_em, org.fuso);
            const atrasada = editavel && d !== null && d < 0;
            return (
              <tr
                key={f.id}
                className={atual ? "[&>td]:!bg-[#faf5ea]" : f.status === "dispensada" ? "text-[var(--texto-suave)]" : ""}
                aria-current={atual ? "step" : undefined}
              >
                <td className="celula-titulo min-w-44">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.nome}</span>
                    {atual && <Chip tom="azul">Fase atual</Chip>}
                  </span>
                  {atual && (
                    <span className="block text-xs font-normal text-[var(--texto-suave)]">há {diasParado(f.mudou_em)} dia(s) nesta fase</span>
                  )}
                </td>
                <td data-rotulo="Situação">
                  {aberto && podeOperar ? (
                    <select
                      className={CAMPO}
                      aria-label={`Situação da fase ${f.nome}`}
                      value={f.status}
                      onChange={(e) => aoMudarStatus(f, e.target.value as StatusFase)}
                    >
                      {STATUS_FASE.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Chip tom={tomStatusFase(f.status)}>{nomeStatusFase(f.status)}</Chip>
                  )}
                </td>
                <td data-rotulo="Responsável">
                  {editavel ? (
                    <select
                      className={CAMPO}
                      aria-label={`Responsável pela fase ${f.nome}`}
                      value={f.responsavel_id ?? ""}
                      onChange={(e) => aoAtualizar(f, { responsavel_id: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {membros
                        .filter((m) => m.ativo)
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.nome}
                          </option>
                        ))}
                    </select>
                  ) : (
                    // vazio some do cartão no celular (td:empty)
                    f.responsavel_id && nomeMembro(f.responsavel_id)
                  )}
                </td>
                <td data-rotulo="Prazo">
                  {editavel ? (
                    <input
                      type="date"
                      aria-label={`Prazo da fase ${f.nome}`}
                      className={`${CAMPO} ${atrasada ? "!border-red-300 text-red-700" : ""}`}
                      value={f.prazo_em ?? ""}
                      onChange={(e) => aoAtualizar(f, { prazo_em: e.target.value || null })}
                    />
                  ) : (
                    f.prazo_em && <span className="num">{fmtData(f.prazo_em)}</span>
                  )}
                </td>
                <td data-rotulo="Início → fim" className="num whitespace-nowrap text-xs text-[var(--texto-suave)]">
                  {f.inicio_em || f.fim_em ? `${fmtData(f.inicio_em) || "—"} → ${fmtData(f.fim_em) || "…"}` : "—"}
                </td>
                <td className="celula-acoes whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1">
                    {f.tarefa_id && (
                      <Link href="/tarefas" className="btn !min-h-8 !px-2.5" title="A fase tem uma tarefa no MDC Tarefas">
                        <Icone nome="check" className="h-4 w-4" />
                        Tarefa
                      </Link>
                    )}
                    {podeOperar && (
                      <label
                        className={`btn !min-h-8 cursor-pointer !px-2.5 ${editavel || atual ? "" : "max-sm:!hidden"}`} title={`Anexar documento na fase ${f.nome}`}>
                        <Icone nome="clipe" className="h-4 w-4" />
                        Anexar
                        <input type="file" multiple className="sr-only" onChange={(e) => aoAnexar(e.target.files, f.nome)} />
                      </label>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </QuadroTabela>
    </section>
  );
}
