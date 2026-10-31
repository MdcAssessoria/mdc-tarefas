"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { diasAte, hojeISO } from "@/lib/datas";
import { COLUNAS, diasParado } from "@/lib/societario";
import type { SocFase, SocProcesso, SocTipo } from "@/lib/societario";
import { caminho } from "@/lib/caminho";
import { nomeCliente } from "@/lib/clientes";

export default function PaginaPainelSocietario() {
  return (
    <AppShell modulo="societario">
      <Painel />
    </AppShell>
  );
}

function Painel() {
  const { org, clientePorId } = useOrg();
  const [processos, setProcessos] = useState<SocProcesso[]>([]);
  const [fases, setFases] = useState<SocFase[]>([]);
  const [tipos, setTipos] = useState<SocTipo[]>([]);

  useEffect(() => {
    const sb = supabase();
    const carregar = async () => {
      const [p, f, t] = await Promise.all([
        sb.from("soc_processos").select("*").eq("org_id", org.id).neq("status", "cancelado").limit(2000),
        sb.from("soc_fases").select("*").eq("org_id", org.id).limit(20000),
        sb.from("soc_tipos").select("*").eq("org_id", org.id),
      ]);
      setProcessos((p.data as SocProcesso[]) ?? []);
      setFases((f.data as SocFase[]) ?? []);
      setTipos((t.data as SocTipo[]) ?? []);
    };
    void carregar();
    const i = setInterval(carregar, 120_000);
    return () => clearInterval(i);
  }, [org.id]);

  const d = useMemo(() => {
    const hoje = hojeISO(org.fuso);
    const mes = hoje.slice(0, 7);
    const abertos = processos.filter((p) => p.status === "aberto");
    const atual = (p: SocProcesso) => fases.find((f) => f.processo_id === p.id && f.ordem === p.fase_atual);
    const porFase = COLUNAS.map((c) => ({ ...c, n: abertos.filter((p) => atual(p)?.codigo === c.codigo).length }));
    const atrasados = abertos.filter((p) => {
      const f = atual(p);
      const x = diasAte(f?.prazo_em ?? null, org.fuso);
      return x !== null && x < 0;
    });
    const aguardandoCliente = abertos.filter((p) => atual(p)?.status === "aguardando_cliente");
    const aguardandoOrgao = abertos.filter((p) => atual(p)?.status === "aguardando_orgao");
    const concluidosMes = processos.filter((p) => p.status === "concluido" && p.concluido_em?.startsWith(mes));
    const tempoMedio = tipos
      .map((t) => {
        const c = processos.filter((p) => p.tipo_id === t.id && p.status === "concluido" && p.concluido_em);
        if (!c.length) return null;
        const media = c.reduce((s, p) => s + (Date.parse(p.concluido_em!) - Date.parse(p.pedido_em)) / 864e5, 0) / c.length;
        return { nome: t.nome, dias: Math.round(media), n: c.length };
      })
      .filter(Boolean) as { nome: string; dias: number; n: number }[];
    const parados = abertos
      .map((p) => ({ p, f: atual(p) }))
      .filter((x) => x.f && diasParado(x.f.mudou_em) >= 5)
      .sort((a, b) => Date.parse(a.f!.mudou_em) - Date.parse(b.f!.mudou_em))
      .slice(0, 8);
    return { abertos, porFase, atrasados, aguardandoCliente, aguardandoOrgao, concluidosMes, tempoMedio, parados };
  }, [processos, fases, tipos, org.fuso]);

  const max = Math.max(1, ...d.porFase.map((f) => f.n));
  const nome = (p: SocProcesso) => {
    const c = clientePorId(p.cliente_id);
    return nomeCliente(c, p.futuro_cliente ?? "");
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-[var(--marca)]">Painel do Societário</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { r: "Em andamento", v: d.abertos.length },
          { r: "Com fase atrasada", v: d.atrasados.length, alerta: true },
          { r: "Aguardando cliente", v: d.aguardandoCliente.length },
          { r: "Aguardando órgão", v: d.aguardandoOrgao.length },
          { r: "Concluídos no mês", v: d.concluidosMes.length },
        ].map((k) => (
          <div key={k.r} className="cartao p-4">
            <div className={`text-3xl font-semibold tabular-nums ${k.alerta && k.v ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>
              {k.v}
            </div>
            <div className="text-sm text-neutral-600">{k.r}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">Processos abertos por fase</h2>
          <div className="space-y-1.5">
            {d.porFase.map((f) => (
              <div key={f.codigo} className="grid grid-cols-[150px_1fr_32px] items-center gap-2 text-sm">
                <span className="truncate text-neutral-600">{f.nome}</span>
                <div className="h-4 rounded bg-[var(--fundo)]">
                  <div className="h-4 rounded bg-[var(--marca)]" style={{ width: `${(f.n / max) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{f.n}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">Parados há mais tempo</h2>
          {d.parados.length === 0 && <p className="text-sm text-neutral-500">Nenhuma fase parada há 5 dias ou mais.</p>}
          <ul className="space-y-2 text-sm">
            {d.parados.map(({ p, f }) => (
              <li key={p.id} className="flex justify-between gap-2">
                <a href={caminho(`/societario/${p.id}`)} className="hover:underline">
                  #{p.numero} {nome(p)} · <span className="text-neutral-500">{f!.nome}</span>
                </a>
                <span className="chip bg-amber-50 text-amber-800">{diasParado(f!.mudou_em)} dias</span>
              </li>
            ))}
          </ul>
          <h2 className="mb-2 mt-5 font-semibold">Tempo médio por tipo (concluídos)</h2>
          {d.tempoMedio.length === 0 && <p className="text-sm text-neutral-500">Ainda sem processos concluídos.</p>}
          <ul className="space-y-1 text-sm">
            {d.tempoMedio.map((t) => (
              <li key={t.nome} className="flex justify-between">
                <span>{t.nome}</span>
                <span className="tabular-nums text-neutral-600">
                  {t.dias} dias · {t.n} proc.
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
