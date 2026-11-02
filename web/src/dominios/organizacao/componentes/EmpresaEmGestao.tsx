// Empresa (cliente) em que a pessoa está trabalhando nas telas de gestão: Financeiro, Estoque, Saídas, Entradas,
// Plano de contas, Relatórios. Uma empresa por vez, lembrada neste navegador e a mesma em todos esses módulos.
// - useClienteGestao: a empresa escolhida, a lista de ativas e a função de escolher;
// - EscolhaCliente: o seletor "Empresa" (primeiro campo do cartão de filtros);
// - TelaEmpresa: moldura com título, seletor e aviso; o conteúdo recebe a empresa e se a pessoa pode lançar.
"use client";

import { useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import type { Cliente } from "@/dominios/clientes/tipos";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";

export function useClienteGestao() {
  const { clientes } = useOrg();
  const ativos = useMemo(() => clientes.filter((c) => c.ativo).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b))), [clientes]);
  // chave antiga (do tempo em que só o Financeiro escolhia empresa) ainda é lida para não perder a escolha da pessoa
  const [id, setId] = useEstadoLembrado<string>(CHAVES.clienteGestao, "", (v) => ativos.some((c) => c.id === v), CHAVES.clienteFinanceiroAntiga);
  const cliente = ativos.find((c) => c.id === id) ?? null;
  return { cliente, ativos, escolher: setId };
}

export type ClienteGestao = ReturnType<typeof useClienteGestao>;

export function EscolhaCliente({ gestao }: { gestao: ClienteGestao }) {
  const { cliente, ativos, escolher } = gestao;
  return (
    <label className="campo campo-largo min-w-64 sm:max-w-md">
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

/** O que o conteúdo de uma TelaEmpresa (e as telas de cadastro do Financeiro) recebe. */
export interface PropsTelaEmpresa {
  cliente: Cliente;
  podeOperar: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
  /** Escolha da empresa, mostrada como primeiro campo do cartão de filtros da tela. */
  seletor?: React.ReactNode;
}

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
  children: (p: PropsTelaEmpresa) => React.ReactNode;
}) {
  const { pode } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const { aviso, mostrar } = useAviso();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">{titulo}</h1>
        <p className="text-sm text-neutral-600">{descricao}</p>
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente gestao={gestao} />
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
