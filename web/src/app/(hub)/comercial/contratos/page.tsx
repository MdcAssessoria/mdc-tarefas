"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import type { Contrato } from "@/lib/crm";
import { mesAtualISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { Aviso } from "@/components/ui/Aviso";

export default function PaginaContratos() {
  return <Lista />;
}

type Linha = Contrato & { crm_oportunidades: { empresa: string } | null };

const COR: Record<string, string> = {
  rascunho: "bg-amber-50 text-amber-800",
  enviado: "bg-sky-50 text-sky-800",
  assinado: "bg-emerald-50 text-emerald-800",
  cancelado: "bg-neutral-100 text-neutral-600",
};

function Lista() {
  const { org } = useOrg();
  const [status, setStatus] = useState("");
  const { dados: lista, erro } = useConsulta(
    useCallback(
      async () =>
        exigir(
          await supabase()
            .from("crm_contratos")
            .select("*, crm_oportunidades(empresa)")
            .eq("org_id", org.id)
            .order("criado_em", { ascending: false }),
        ) as Linha[],
      [org.id],
    ),
  );
  const filtrada = useMemo(() => (lista ?? []).filter((c) => !status || c.status === status), [lista, status]);
  const assinadosMes = (lista ?? []).filter((c) => c.status === "assinado" && c.assinado_em?.slice(0, 7) === mesAtualISO(org.fuso));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Contratos</h1>
        <select className="entrada" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="rascunho">Rascunho</option>
          <option value="enviado">Enviados</option>
          <option value="assinado">Assinados</option>
          <option value="cancelado">Cancelados</option>
        </select>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <p className="text-sm text-neutral-600">
        Assinados no mês: {assinadosMes.length} · {brl(assinadosMes.reduce((a, c) => a + (c.valores.honorario_mensal || 0), 0))} em
        honorários mensais novos.
      </p>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Empresa</th>
              <th className="text-right">Honorário</th>
              <th>Início</th>
              <th>Situação</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{c.numero}</td>
                <td>
                  <Link className="hover:underline" href={`/comercial/${c.oportunidade_id}`}>
                    {c.crm_oportunidades?.empresa ?? c.valores.razao_social}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{brl(c.valores.honorario_mensal || 0)}</td>
                <td>{fmtData(c.valores.inicio)}</td>
                <td>
                  <span className={`chip ${COR[c.status]}`}>{c.status}</span>
                </td>
                <td className="whitespace-nowrap text-sm text-neutral-500">{fmtDataLocal(c.criado_em)}</td>
              </tr>
            ))}
            {lista && !filtrada.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-neutral-500">
                  Nenhum contrato ainda. Eles nascem na tela de cada oportunidade.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
