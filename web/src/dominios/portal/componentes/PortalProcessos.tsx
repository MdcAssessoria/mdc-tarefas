// Portal do Cliente › Societário: aberturas, alterações e baixas da empresa, com a fase atual e o histórico.
"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { hojeISO } from "@/lib/datas";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import type { Tom } from "@/components/ui/Tons";
import { nomeCliente } from "@/dominios/clientes/nome";
import type { EmpresaPortal } from "../tipos";

interface Processo {
  processo_id: string;
  numero: number;
  tipo: string;
  descricao: string | null;
  status: string;
  fase: string | null;
  fase_status: string | null;
  pedido_em: string;
  previsao_em: string | null;
  concluido_em: string | null;
  eventos: { em: string; texto: string }[];
}

/** Situação em palavras simples e o tom do chip (âmbar quando depende do cliente). */
function situacao(p: Processo): { texto: string; tom: Tom } {
  if (p.status === "concluido") return { texto: `Concluído em ${fmtData(p.concluido_em)}`, tom: "verde" };
  if (p.fase_status === "aguardando_cliente") return { texto: `${p.fase ?? "Em andamento"} · aguardando você`, tom: "ambar" };
  if (p.fase_status === "aguardando_orgao") return { texto: `${p.fase ?? "Em andamento"} · aguardando o órgão`, tom: "azul" };
  return { texto: p.fase ?? "Em andamento", tom: "azul" };
}

export function PortalProcessos({ emp, aoFalar }: { emp: EmpresaPortal; aoFalar?: () => void }) {
  const { aviso, mostrar } = useAviso();
  const [concluidos, setConcluidos] = useState(true);
  const consulta = useConsulta(
    useCallback(
      async () => (exigir(await supabase().rpc("portal_processos", { p_cliente: emp.cliente_id })) as Processo[] | null) ?? [],
      [emp.cliente_id],
    ),
  );
  const todos = consulta.dados ?? [];
  const lista = todos.filter((p) => concluidos || p.status !== "concluido");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Processos societários"
        descricao="Abertura, alterações no contrato e baixa da empresa: em que fase está cada pedido."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Processos societários",
              subtitulo: `${nomeCliente(emp)} · ${lista.length} processo(s)`,
              arquivo: nomeArquivo("Processos-societarios", nomeCliente(emp), hojeISO()),
              logoUrl: emp.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Nº", valor: (p: Processo) => p.numero, formato: "numero", peso: 0.5, largura: 8 },
                { titulo: "Processo", valor: (p: Processo) => p.tipo, peso: 2, largura: 30 },
                { titulo: "Situação", valor: (p: Processo) => situacao(p).texto, peso: 2.2, largura: 34 },
                { titulo: "Pedido em", valor: (p: Processo) => fmtData(p.pedido_em), peso: 1, largura: 14 },
                { titulo: "Previsão", valor: (p: Processo) => fmtData(p.previsao_em), peso: 1, largura: 14 },
                { titulo: "Último andamento", valor: (p: Processo) => p.eventos.at(-1)?.texto ?? "", peso: 3, largura: 50 },
              ],
            })}
          />
        }
      />
      {todos.some((p) => p.status === "concluido") && (
        <CartaoFiltros
          ativos={!concluidos ? [{ id: "c", rotulo: "Só em andamento", aoTirar: () => setConcluidos(true) }] : []}
          aoLimpar={() => setConcluidos(true)}
        >
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={!concluidos} onChange={(e) => setConcluidos(!e.target.checked)} />
            Mostrar só os que estão em andamento
          </label>
        </CartaoFiltros>
      )}
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={3} />
      ) : !lista.length ? (
        <EstadoVazio
          icone="pasta"
          titulo={todos.length ? "Nenhum processo em andamento" : "Nenhum processo societário"}
          acao={
            aoFalar && (
              <button className="btn-primario" onClick={aoFalar}>
                <Icone nome="chat" className="h-4 w-4" />
                Pedir uma alteração à MDC
              </button>
            )
          }
        >
          Quando a MDC cuidar de uma abertura, alteração de contrato ou baixa da sua empresa, você acompanha cada fase por aqui.
        </EstadoVazio>
      ) : (
        lista.map((p) => {
          const s = situacao(p);
          return (
            <section key={p.processo_id} className="cartao p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold text-[var(--marca)]">
                  {p.tipo} <span className="text-sm font-normal text-neutral-500">nº {p.numero}</span>
                </h2>
                <Chip tom={s.tom}>{s.texto}</Chip>
              </div>
              {p.descricao && <p className="mt-1 text-sm text-neutral-700">{p.descricao}</p>}
              <p className="mt-0.5 text-xs text-neutral-500">
                Pedido em {fmtData(p.pedido_em)}
                {p.previsao_em && ` · previsão ${fmtData(p.previsao_em)}`}
              </p>
              {p.eventos.length > 0 && (
                <ol className="mt-3 space-y-1.5 border-l-2 border-[var(--borda)] pl-3 text-sm">
                  {p.eventos.map((e, i) => (
                    <li key={i}>
                      {e.texto} <span className="text-xs text-neutral-500">· {fmtDataHora(e.em)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
