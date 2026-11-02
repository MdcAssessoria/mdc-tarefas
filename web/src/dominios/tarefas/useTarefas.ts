"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { hojeISO } from "@/lib/datas";
import type { Tarefa } from "./tipos";
import { traduzirErro } from "@/lib/erros";

/** Lê as abertas + as concluídas/canceladas mexidas nos últimos 45 dias (por inteiro, sem o corte de 1.000 linhas). */
function lerTarefas(orgId: string, fuso: string): Promise<Tarefa[]> {
  const corte = new Date(hojeISO(fuso) + "T00:00:00Z");
  corte.setUTCDate(corte.getUTCDate() - 45);
  return lerTudo<Tarefa>((de, ate) =>
    supabase()
      .from("tarefas")
      .select("*")
      .eq("org_id", orgId)
      .or(`status.in.(a_fazer,em_andamento,aguardando),atualizado_em.gte.${corte.toISOString()}`)
      .order("prazo", { ascending: true, nullsFirst: false })
      .order("id")
      .range(de, ate),
  );
}

/**
 * Carrega as tarefas visíveis da organização e mantém a lista viva via Supabase Realtime.
 * Por padrão traz as abertas + as concluídas/canceladas dos últimos 45 dias.
 */
export function useTarefas(orgId: string, fuso: string) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  // organização cuja lista já chegou: "carregando" é derivado (troca de organização volta a mostrar o esqueleto)
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(() => {
    lerTarefas(orgId, fuso).then(
      (lista) => {
        setErro(null);
        setTarefas(lista);
        setCarregadoPara(orgId);
      },
      (e: unknown) => {
        setErro(traduzirErro(e));
        setCarregadoPara(orgId);
      },
    );
  }, [orgId, fuso]);

  useEffect(() => {
    carregar();
    const canal = supabase()
      .channel(`tarefas-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas", filter: `org_id=eq.${orgId}` }, (p) => {
        // aplica a mudança na hora e agenda uma recarga completa (garante consistência)
        setTarefas((lista) => {
          if (p.eventType === "DELETE") return lista.filter((t) => t.id !== (p.old as Tarefa).id);
          const nova = p.new as Tarefa;
          const i = lista.findIndex((t) => t.id === nova.id);
          if (i === -1) return [...lista, nova];
          const copia = lista.slice();
          copia[i] = nova;
          return copia;
        });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(carregar, 4000);
      })
      .subscribe((status) => setOnline(status === "SUBSCRIBED"));
    const intervalo = setInterval(carregar, 5 * 60_000);
    return () => {
      clearInterval(intervalo);
      if (timer.current) clearTimeout(timer.current);
      void supabase().removeChannel(canal);
    };
  }, [orgId, carregar]);

  const atualizar = useCallback(
    async (id: string, campos: Partial<Tarefa>) => {
      const antes = tarefas.find((t) => t.id === id);
      setTarefas((l) => l.map((t) => (t.id === id ? { ...t, ...campos } : t)));
      const { data, error } = await supabase().from("tarefas").update(campos).eq("id", id).select("id");
      if (error || !data?.length) {
        if (antes) setTarefas((l) => l.map((t) => (t.id === id ? antes : t)));
        throw error ?? new Error("Você não tem permissão para alterar esta tarefa.");
      }
    },
    [tarefas],
  );

  const carregando = carregadoPara !== orgId;
  return { tarefas, carregando, erro, online, recarregar: carregar, atualizar };
}
