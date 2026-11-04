// Quadro do funil por etapa. No computador: colunas lado a lado, com arrastar e soltar (e o menu "⋯" do cartão
// para quem não arrasta). No celular: um seletor de etapa (botões com a quantidade) e os cartões daquela etapa
// empilhados, cada um com "Mover para" — nada depende de arrastar.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import { TONS } from "@/components/ui/Tons";
import { ETAPAS } from "../crm";
import type { Etapa, Oportunidade } from "../crm";
import { TOM_ETAPA, diasDesde, estaAberta, nomeOrigem, retornoAtrasado, rotuloDias } from "../rotulos";

type Coluna = (typeof ETAPAS)[number];

export function QuadroFunil({
  colunas,
  itens,
  hoje,
  podeOperar,
  nomeMembro,
  aoMover,
  aoArquivar,
}: {
  colunas: Coluna[];
  itens: Oportunidade[];
  hoje: string;
  podeOperar: boolean;
  nomeMembro: (id: string | null) => string;
  aoMover: (o: Oportunidade, etapa: Etapa) => void;
  aoArquivar: (o: Oportunidade) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<Etapa | null>(null);
  const porEtapa = (id: Etapa) => itens.filter((o) => o.etapa === id);
  // no celular: a etapa escolhida ou, de início, a primeira que tem cartões
  const etapaCelular =
    escolhida && colunas.some((c) => c.id === escolhida) ? escolhida : (colunas.find((c) => porEtapa(c.id).length)?.id ?? colunas[0]?.id);

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden" role="tablist" aria-label="Etapa do funil">
        {colunas.map((c) => {
          const n = porEtapa(c.id).length;
          const ativo = c.id === etapaCelular;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={ativo}
              onClick={() => setEscolhida(c.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                ativo ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-[var(--texto)]"
              }`}
            >
              {c.nome}
              <span className={`rounded-full px-1.5 text-xs ${ativo ? "bg-white/20" : "bg-[var(--fundo)]"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="md:flex md:gap-3 md:overflow-x-auto md:pb-3">
        {colunas.map((col) => {
          const lista = porEtapa(col.id);
          const soma = lista.reduce((a, o) => a + (o.valor_mensal ?? 0), 0);
          return (
            <section
              key={col.id}
              aria-label={`Etapa ${col.nome}`}
              className={`${col.id === etapaCelular ? "flex" : "hidden md:flex"} w-full flex-col rounded-xl border border-[var(--borda)] bg-[#f3f1ea] md:w-auto md:min-w-[14rem] md:max-w-[22rem] md:flex-1 ${
                arrastando ? "md:outline-dashed md:outline-1 md:outline-[var(--destaque-escuro)]" : ""
              }`}
              onDragOver={(e) => podeOperar && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setArrastando(null);
                const o = itens.find((x) => x.id === id);
                if (o) aoMover(o, col.id);
              }}
            >
              <header className="px-3 pb-2 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2 w-2 rounded-full ${TONS[TOM_ETAPA[col.id]].ponto}`} aria-hidden="true" />
                    {col.nome}
                  </h2>
                  <span className="chip bg-white text-neutral-700">{lista.length}</span>
                </div>
                <p className="text-[12px] text-[var(--texto-suave)]">
                  {col.dica}
                  {soma > 0 && ` · ${brl(soma)}/mês`}
                </p>
              </header>
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-3">
                {lista.map((o) => (
                  <CartaoOportunidade
                    key={o.id}
                    o={o}
                    hoje={hoje}
                    podeOperar={podeOperar}
                    responsavel={nomeMembro(o.responsavel_id)}
                    aoArrastar={setArrastando}
                    aoMover={(etapa) => aoMover(o, etapa)}
                    aoArquivar={() => aoArquivar(o)}
                  />
                ))}
                {!lista.length && (
                  <p className="px-1 py-6 text-center text-xs text-[var(--texto-suave)]">
                    Nenhuma oportunidade aqui.
                    <span className="hidden md:inline"> Arraste um cartão para cá.</span>
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

function CartaoOportunidade({
  o,
  hoje,
  podeOperar,
  responsavel,
  aoArrastar,
  aoMover,
  aoArquivar,
}: {
  o: Oportunidade;
  hoje: string;
  podeOperar: boolean;
  responsavel: string;
  aoArrastar: (id: string | null) => void;
  aoMover: (etapa: Etapa) => void;
  aoArquivar: () => void;
}) {
  const router = useRouter();
  const parado = diasDesde(o.etapa_desde);
  const atrasado = retornoAtrasado(o, hoje);
  const economia = typeof o.dados_origem?.economia_estimada === "number" ? (o.dados_origem.economia_estimada as number) : 0;

  function item(e: React.MouseEvent<HTMLElement>, f: () => void) {
    e.stopPropagation();
    e.currentTarget.closest("details")?.removeAttribute("open");
    f();
  }

  return (
    <article
      draggable={podeOperar}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", o.id);
        aoArrastar(o.id);
      }}
      onDragEnd={() => aoArrastar(null)}
      onClick={() => router.push(`/comercial/${o.id}`)}
      className="cursor-pointer rounded-lg border border-[var(--borda)] bg-white p-3 text-sm shadow-sm transition hover:border-[var(--destaque-escuro)]"
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/comercial/${o.id}`} className="font-medium leading-snug hover:underline" onClick={(e) => e.stopPropagation()}>
          {o.empresa}
        </Link>
        {podeOperar && (
          <details className="relative -mr-2 -mt-2 shrink-0 md:-mr-1 md:-mt-1" onClick={(e) => e.stopPropagation()}>
            <summary
              className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-md text-[var(--texto-suave)] md:h-7 md:w-7 hover:bg-[var(--fundo)] hover:text-[var(--marca)] [&::-webkit-details-marker]:hidden"
              aria-label={`Ações de ${o.empresa}`}
              title="Mais ações"
            >
              ⋯
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[var(--borda)] bg-white p-1 text-sm shadow-lg">
              {ETAPAS.filter((x) => x.id !== o.etapa).map((x) => (
                <button
                  key={x.id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-[var(--fundo)]"
                  onClick={(e) => item(e, () => aoMover(x.id))}
                >
                  <span className={`h-2 w-2 rounded-full ${TONS[TOM_ETAPA[x.id]].ponto}`} aria-hidden="true" />
                  Mover para {x.nome}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--borda)]" />
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-[var(--fundo)]"
                onClick={(e) => item(e, aoArquivar)}
              >
                <Icone nome="caixa" className="h-4 w-4 text-[var(--texto-suave)]" />
                Arquivar (dar baixa)
              </button>
            </div>
          </details>
        )}
      </div>
      <div className="mt-0.5 text-xs text-[var(--texto-suave)]">
        {[o.contato_nome, o.cidade && `${o.cidade}${o.uf ? `/${o.uf}` : ""}`].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="chip bg-[var(--fundo)] text-neutral-700">{nomeOrigem(o.origem)}</span>
        {o.valor_mensal ? <span className="chip bg-emerald-50 text-emerald-800">{brl(o.valor_mensal)}/mês</span> : null}
        {o.origem === "simulador" && economia > 0 && <span className="chip bg-amber-50 text-amber-900">economia {brl(economia)}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--texto-suave)]">
        <span className="flex items-center gap-1">
          <Icone nome="pessoas" className="h-3.5 w-3.5" />
          {responsavel}
        </span>
        <span
          className={
            atrasado ? "flex items-center gap-1 font-medium text-[var(--perigo)]" : parado > 7 && estaAberta(o) ? "text-amber-700" : ""
          }
          title={atrasado ? "O retorno combinado já passou" : "Tempo nesta etapa"}
        >
          {atrasado ? (
            <>
              <Icone nome="alerta" className="h-3.5 w-3.5" />
              retorno {fmtData(o.proximo_contato)}
            </>
          ) : (
            `${rotuloDias(parado)} na etapa`
          )}
        </span>
      </div>
      {podeOperar && (
        <label className="mt-2 block md:hidden" onClick={(e) => e.stopPropagation()}>
          <span className="sr-only">Mover {o.empresa} para outra etapa</span>
          <select className="entrada !min-h-9 w-full text-sm" value={o.etapa} onChange={(e) => aoMover(e.target.value as Etapa)}>
            {ETAPAS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id === o.etapa ? `Etapa: ${x.nome}` : `Mover para: ${x.nome}`}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
