// Empresa das telas de gestão (Financeiro, Entradas, Saídas, Estoque, Centros de custo, Plano de contas, Relatórios,
// Contratos, Fornecedores e clientes). Desde 03/11/2026 a Gestão cuida só das rotinas da própria MDC: a empresa é
// sempre a da organização (`organizacoes.gestao_cliente_id`), sem escolha na tela. O banco recusa gravar ou ler a
// gestão de outra empresa (migração 042).
// - useClienteGestao: a empresa própria da organização (null enquanto não foi definida);
// - SemEmpresaGestao: "Carregando…" enquanto os cadastros chegam; depois o aviso (ou, ao administrador, a escolha);
// - TelaEmpresa: moldura com título e aviso; o conteúdo recebe a empresa e se a pessoa pode lançar.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import type { Cliente } from "@/dominios/clientes/tipos";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";

/** A empresa própria da organização (na MDC, a MDC Assessoria). null se ainda não foi definida ou está carregando. */
export function useClienteGestao(): { cliente: Cliente | null; carregando: boolean } {
  const { org, clientePorId, cadastrosCarregados } = useOrg();
  const cliente = clientePorId(org.gestao_cliente_id ?? null) ?? null;
  return { cliente, carregando: !cliente && (!cadastrosCarregados || !!org.gestao_cliente_id) };
}

/**
 * Tela de gestão sem a empresa própria: enquanto os cadastros chegam mostra "Carregando…" (sem piscar o aviso);
 * definida de fato, explica. O administrador escolhe a empresa ali mesmo (função auditada, migração 047).
 */
export function SemEmpresaGestao({ icone = "info" }: { icone?: string }) {
  const { carregando } = useClienteGestao();
  const { papel } = useOrg();
  if (carregando) return <Esqueleto indicadores={0} linhas={4} />;
  if (papel !== "admin")
    return (
      <EstadoVazio icone={icone} titulo="Empresa da Gestão não definida">
        A Gestão (Financeiro, Entradas, Contratos…) precisa saber qual é a empresa da própria MDC. Peça ao administrador
        do HUB para escolher a empresa nesta tela.
      </EstadoVazio>
    );
  return <DefinirEmpresaGestao icone={icone} />;
}

function DefinirEmpresaGestao({ icone }: { icone: string }) {
  const { org, clientes, recarregar } = useOrg();
  const ativos = clientes.filter((c) => c.ativo !== false);
  const [escolhida, setEscolhida] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function definir() {
    if (!escolhida) return setErro("Escolha a empresa da MDC na lista.");
    setSalvando(true);
    setErro(null);
    const { error } = await supabase().rpc("org_definir_empresa_gestao", { p_org: org.id, p_cliente: escolhida });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    await recarregar();
  }
  return (
    <EstadoVazio
      icone={icone}
      titulo="Escolha a empresa da Gestão"
      acao={
        <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <label className="campo flex-1 text-left">
            <span className="sr-only">Empresa da MDC</span>
            <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} aria-label="Empresa da MDC">
              <option value="">Escolha a empresa…</option>
              {ativos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeCliente(c)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primario" onClick={definir} disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : "Definir empresa"}
          </button>
        </div>
      }
    >
      Você é o administrador: escolha qual cadastro é a própria MDC. O Financeiro, as Entradas e os Contratos passam a
      trabalhar só com ela. A escolha fica registrada no histórico.
      {erro && <span className="mt-2 block text-red-700" role="alert">{erro}</span>}
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
