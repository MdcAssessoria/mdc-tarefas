"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrgProvider, useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { PainelTV, type DadosPainel } from "@/components/PainelTV";

export default function PaginaTV() {
  return (
    <OrgProvider>
      <TV />
    </OrgProvider>
  );
}

function TV() {
  const { org } = useOrg();
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [online, setOnline] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [k, s, r, v, c] = await Promise.all([
      sb.from("vw_painel_kpis").select("*").eq("org_id", org.id).maybeSingle(),
      sb.from("vw_painel_setores").select("*").eq("org_id", org.id).order("ordem"),
      sb.from("vw_painel_responsaveis").select("*").eq("org_id", org.id),
      sb.from("vw_painel_vencimentos").select("*").eq("org_id", org.id).order("prazo").order("prioridade", { ascending: false }).limit(200),
      sb
        .from("tarefas")
        .select("id,titulo,responsavel_id,cliente_id,concluida_em")
        .eq("org_id", org.id)
        .eq("status", "concluida")
        .order("concluida_em", { ascending: false })
        .limit(12),
    ]);
    if (k.error || s.error || r.error || v.error || c.error) return;
    setDados({
      // Sem tarefas a view não retorna linha: mostra zeros em vez de traço.
      kpis: k.data ?? {
        abertas: 0,
        vencem_hoje: 0,
        atrasadas: 0,
        proximos_7_dias: 0,
        em_andamento: 0,
        concluidas_hoje: 0,
        concluidas_mes: 0,
        pct_no_prazo_mes: null,
      },
      setores: s.data ?? [],
      responsaveis: r.data ?? [],
      vencimentos: v.data ?? [],
      concluidas: c.data ?? [],
    });
    setAtualizadoEm(new Date());
  }, [org.id]);

  useEffect(() => {
    carregar();
    const sb = supabase();
    const canal = sb
      .channel(`tv-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas", filter: `org_id=eq.${org.id}` }, () => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(carregar, 1200);
      })
      .subscribe((st) => setOnline(st === "SUBSCRIBED"));
    const intervalo = setInterval(carregar, 60_000);
    // recarga completa a cada 6 h evita acúmulo de memória em navegadores de TV
    const recarga = setTimeout(() => window.location.reload(), 6 * 3600_000);
    return () => {
      clearInterval(intervalo);
      clearTimeout(recarga);
      if (debounce.current) clearTimeout(debounce.current);
      sb.removeChannel(canal);
    };
  }, [org.id, carregar]);

  // mantém a tela acesa quando o navegador permite
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {}
    };
    pedir();
    const vis = () => document.visibilityState === "visible" && pedir();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      lock?.release().catch(() => {});
    };
  }, []);

  return <PainelTV org={org} dados={dados} online={online} atualizadoEm={atualizadoEm} />;
}
