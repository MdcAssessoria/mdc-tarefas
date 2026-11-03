// Empresa das telas de gestão (Financeiro, Entradas, Saídas, Estoque, Centros de custo, Plano de contas, Relatórios,
// Contratos, Fornecedores e clientes). Desde 03/11/2026 a Gestão cuida só das rotinas da própria MDC: a empresa é
// sempre a da organização (`organizacoes.gestao_cliente_id`), sem escolha na tela. O banco recusa gravar ou ler a
// gestão de outra empresa (migração 042).
// - useClienteGestao: a empresa própria da organização (null enquanto não foi definida);
// - SemEmpresaGestao: aviso para quando a empresa própria ainda não foi definida;
// - TelaEmpresa: moldura com título e aviso; o conteúdo recebe a empresa e se a pessoa pode lançar.
"use client";

import { useOrg } from "@/dominios/organizacao/OrgProvider";
import type { Cliente } from "@/dominios/clientes/tipos";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";

/** A empresa própria da organização (na MDC, a MDC Assessoria). null se ainda não foi definida. */
export function useClienteGestao(): { cliente: Cliente | null } {
  const { org, clientePorId } = useOrg();
  return { cliente: clientePorId(org.gestao_cliente_id ?? null) ?? null };
}

/** Tela de gestão aberta sem a empresa própria definida: explica o que fazer. */
export function SemEmpresaGestao({ icone = "info" }: { icone?: string }) {
  return (
    <EstadoVazio icone={icone} titulo="Empresa da Gestão não definida">
      A empresa da MDC ainda não foi definida para a Gestão. Peça ao administrador.
    </EstadoVazio>
  );
}

/** O que o conteúdo de uma TelaEmpresa (e as telas de cadastro do Financeiro) recebe. */
export interface PropsTelaEmpresa {
  cliente: Cliente;
  podeOperar: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
}

export function TelaEmpresa({
  titulo,
  descricao,
  modulo,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Ferramenta conferida para lançar (estoque, saidas, entradas). */
  modulo: string;
  children: (p: PropsTelaEmpresa) => React.ReactNode;
}) {
  const { pode } = useOrg();
  const { cliente } = useClienteGestao();
  const { aviso, mostrar } = useAviso();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">{titulo}</h1>
        <p className="text-sm text-neutral-600">{descricao}</p>
      </div>
      {aviso}
      {!cliente ? (
        <SemEmpresaGestao />
      ) : (
        <div key={cliente.id}>{children({ cliente, podeOperar: pode(modulo, "operar"), avisar: mostrar })}</div>
      )}
    </div>
  );
}
