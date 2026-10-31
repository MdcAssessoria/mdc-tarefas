"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { brl, fmtIndice } from "@/lib/balancete";
import { mesAno } from "@/components/demonstrativos/Painel";
import type { BalanceteReg } from "@/components/demonstrativos/Painel";
import { caminho } from "@/lib/caminho";

export default function PaginaRiscos() {
  return (
    <AppShell modulo="demonstrativos">
      <Riscos />
    </AppShell>
  );
}

/** Painel de riscos da carteira: o último balancete de cada cliente, ordenado pelos sinais de alerta. */
function Riscos() {
  const { org, clientePorId } = useOrg();
  const [lista, setLista] = useState<BalanceteReg[]>([]);
  const [area, setArea] = useState("");

  useEffect(() => {
    supabase()
      .from("portal_balancetes")
      .select("id,cliente_id,competencia,status,resumo,indices,alertas")
      .eq("org_id", org.id)
      .order("competencia", { ascending: false })
      .limit(3000)
      .then(({ data }) => setLista((data as BalanceteReg[]) ?? []));
  }, [org.id]);

  const ultimos = useMemo(() => {
    const vistos = new Set<string>();
    const out: BalanceteReg[] = [];
    for (const b of lista) {
      if (vistos.has(b.cliente_id)) continue;
      vistos.add(b.cliente_id);
      out.push(b);
    }
    const peso = (b: BalanceteReg) => b.alertas.filter((a) => a.nivel === "alto").length * 3 + b.alertas.length;
    return out.filter((b) => !area || b.alertas.some((a) => a.area === area)).sort((a, b) => peso(b) - peso(a));
  }, [lista, area]);

  const areas = [...new Set(lista.flatMap((b) => b.alertas.map((a) => a.area)))].sort();
  const comAlerta = ultimos.filter((b) => b.alertas.length).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Riscos da carteira</h1>
        <p className="text-sm text-neutral-600">
          Último balancete importado de cada cliente. {comAlerta} de {ultimos.length} com sinais de alerta.
        </p>
      </div>
      <select className="entrada" value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">Todas as áreas</option>
        {areas.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Último mês</th>
              <th className="text-right">Liquidez corrente</th>
              <th className="text-right">Resultado no ano</th>
              <th>Sinais de alerta</th>
            </tr>
          </thead>
          <tbody>
            {ultimos.map((b) => {
              const c = clientePorId(b.cliente_id);
              return (
                <tr
                  key={b.id}
                  className="cursor-pointer align-top hover:bg-[var(--fundo)]"
                  onClick={() => (window.location.href = caminho(`/demonstrativos/${b.id}`))}
                >
                  <td className="font-medium">{c ? c.nome_fantasia || c.razao_social : "—"}</td>
                  <td>{mesAno(b.competencia)}</td>
                  <td className={`text-right tabular-nums ${(b.indices.liquidez_corrente ?? 1) < 1 ? "text-[var(--perigo)]" : ""}`}>
                    {fmtIndice(b.indices.liquidez_corrente, "x")}
                  </td>
                  <td className={`text-right tabular-nums ${b.resumo.ano.lucro_liquido < 0 ? "text-[var(--perigo)]" : ""}`}>
                    {brl(b.resumo.ano.lucro_liquido)}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {b.alertas.length === 0 && <span className="text-xs text-emerald-700">nenhum</span>}
                      {b.alertas.map((a, k) => (
                        <span key={k} className={`chip ${a.nivel === "alto" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                          {a.texto}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
