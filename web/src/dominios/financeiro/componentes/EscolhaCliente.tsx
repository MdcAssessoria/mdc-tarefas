// Escolha da empresa no Financeiro (lembrada neste navegador). Todas as telas do módulo trabalham com uma empresa
// por vez: o plano de contas, as contas bancárias e os extratos são de cada cliente.
"use client";

import { useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";

export function useClienteFinanceiro() {
  const { clientes } = useOrg();
  const ativos = useMemo(() => clientes.filter((c) => c.ativo).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b))), [clientes]);
  const [id, setId] = useEstadoLembrado<string>(CHAVES.clienteFinanceiro, "", (v) => ativos.some((c) => c.id === v));
  const cliente = ativos.find((c) => c.id === id) ?? null;
  return { cliente, ativos, escolher: setId };
}

export function EscolhaCliente({ financeiro }: { financeiro: ReturnType<typeof useClienteFinanceiro> }) {
  const { cliente, ativos, escolher } = financeiro;
  return (
    <label className="campo min-w-64 flex-1 sm:max-w-md">
      <span>Empresa</span>
      <select value={cliente?.id ?? ""} onChange={(e) => escolher(e.target.value)}>
        <option value="">Escolha a empresa…</option>
        {ativos.map((c) => (
          <option key={c.id} value={c.id}>
            {nomeCliente(c)}
            {c.codigo_dominio ? ` · cód. ${c.codigo_dominio}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
