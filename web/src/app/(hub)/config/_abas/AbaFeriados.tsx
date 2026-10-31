// Aba "Feriados" das Configurações: feriados do ano usados no ajuste dos vencimentos.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtData } from "@/lib/formato/datas";
import { useMensagem } from "./useMensagem";

interface Feriado {
  id: string;
  org_id: string | null;
  data: string;
  descricao: string;
}

export function AbaFeriados() {
  const { org } = useOrg();
  const [lista, setLista] = useState<Feriado[]>([]);
  const [novo, setNovo] = useState({ data: "", descricao: "" });
  const { mostrar, el } = useMensagem();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("feriados")
      .select("*")
      .gte("data", hojeISO(org.fuso).slice(0, 4) + "-01-01")
      .order("data");
    if (error) return mostrar(traduzirErro(error), true);
    setLista(((data as Feriado[]) ?? []).filter((f) => !f.org_id || f.org_id === org.id));
  }, [org.id, org.fuso, mostrar]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("feriados")
      .insert({ ...novo, org_id: org.id });
    if (error) return mostrar(traduzirErro(error), true);
    setNovo({ data: "", descricao: "" });
    void carregar();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={adicionar} className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Data</span>
          <input type="date" required value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
        </label>
        <label className="campo flex-1">
          <span>Feriado municipal/estadual</span>
          <input required value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>
      {el}
      <div className="cartao">
        <table className="tabela">
          <tbody>
            {lista.map((f) => (
              <tr key={f.id}>
                <td className="w-28">{fmtData(f.data)}</td>
                <td>{f.descricao}</td>
                <td className="text-right text-xs text-[var(--texto-suave)]">
                  {f.org_id ? (
                    <button
                      className="btn-link"
                      onClick={async () => {
                        const { error } = await supabase().from("feriados").delete().eq("id", f.id);
                        if (error) return mostrar(traduzirErro(error), true);
                        void carregar();
                      }}
                    >
                      remover
                    </button>
                  ) : (
                    "nacional"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
