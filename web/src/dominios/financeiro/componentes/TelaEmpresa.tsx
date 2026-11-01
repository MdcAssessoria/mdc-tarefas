// Moldura das telas de Estoque, Saídas e Entradas: título, escolha da empresa (lembrada, a mesma do Financeiro) e
// aviso. O conteúdo recebe a empresa, se a pessoa pode lançar (nível "operar" no módulo) e a função de avisar.
"use client";

import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { EscolhaCliente, useClienteFinanceiro } from "./EscolhaCliente";
import type { PropsAba } from "./Comuns";

export function TelaEmpresa({
  titulo,
  descricao,
  modulo,
  acoes,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Ferramenta conferida para lançar (estoque, saidas, entradas). */
  modulo: string;
  /** Botões ao lado da empresa (opcional). */
  acoes?: React.ReactNode;
  children: (p: PropsAba) => React.ReactNode;
}) {
  const { pode } = useOrg();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const { aviso, mostrar } = useAviso();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">{titulo}</h1>
        <p className="text-sm text-neutral-600">{descricao}</p>
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
        {acoes}
      </div>
      {aviso}
      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima para começar.</EstadoVazio>
      ) : (
        <div key={cliente.id}>{children({ cliente, podeOperar: pode(modulo, "operar"), avisar: mostrar })}</div>
      )}
    </div>
  );
}
