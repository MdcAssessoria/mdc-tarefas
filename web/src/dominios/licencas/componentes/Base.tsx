// Peças comuns das telas de Licenças: carregamento dos dados da organização (módulos, planos, contratos, mensalidades,
// bloqueios), nomes prontos para mostrar, permissões da pessoa e o cabeçalho das telas.
"use client";

import { useCallback, useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { lerBaixas, lerBloqueios, lerCobrancas, lerContratos, lerParametros, lerPlanos, lerProdutos } from "../leituras";
import type { Contrato, Plano, Produto } from "../tipos";

/** "Plano Gestão" ou "Financeiro, Estoque" (módulos avulsos). */
export function rotuloContrato(k: Pick<Contrato, "plano_id" | "produtos">, produtos: Map<string, Produto>, planos: Map<string, Plano>) {
  if (k.plano_id && planos.get(k.plano_id)) return `Plano ${planos.get(k.plano_id)!.nome}`;
  return (
    k.produtos
      .map((id) => produtos.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.ordem - b!.ordem)
      .map((p) => p!.nome)
      .join(", ") || "—"
  );
}

/** Dados de Licenças da organização. `baixas` também lê os recebimentos (painel). */
export function useDadosLicencas({ baixas = false }: { baixas?: boolean } = {}) {
  const { org, pode, clientePorId } = useOrg();
  const hoje = hojeISO(org.fuso);
  const consulta = useConsulta(
    useCallback(async () => {
      const [produtos, planos, contratos, cobrancas, bloqueios, parametros, recebimentos] = await Promise.all([
        lerProdutos(org.id),
        lerPlanos(org.id),
        lerContratos(org.id),
        lerCobrancas(org.id),
        lerBloqueios(org.id),
        lerParametros(org.id),
        baixas ? lerBaixas(org.id) : Promise.resolve([]),
      ]);
      return { produtos, planos, contratos, cobrancas, bloqueios, parametros, recebimentos };
    }, [org.id, baixas]),
  );
  const d = consulta.dados;
  const mapas = useMemo(() => {
    const produtos = new Map((d?.produtos ?? []).map((p) => [p.id, p]));
    const planos = new Map((d?.planos ?? []).map((p) => [p.id, p]));
    const bloqueados = new Map((d?.bloqueios ?? []).filter((b) => !b.desbloqueado_em).map((b) => [b.cliente_id, b]));
    return { produtos, planos, bloqueados };
  }, [d]);
  const nomeDoCliente = useCallback((id: string) => nomeCliente(clientePorId(id), "Cliente removido"), [clientePorId]);
  return {
    ...consulta,
    ...mapas,
    hoje,
    nomeDoCliente,
    rotulo: (k: Pick<Contrato, "plano_id" | "produtos">) => rotuloContrato(k, mapas.produtos, mapas.planos),
    podeOperar: pode("licencas", "operar"),
    podeGerir: pode("licencas", "gerir"),
  };
}

export function Cabecalho({ titulo, descricao, children }: { titulo: string; descricao: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="mr-auto">
        <h1 className="text-xl font-semibold text-[var(--marca)]">{titulo}</h1>
        <p className="text-sm text-neutral-600">{descricao}</p>
      </div>
      {children}
    </div>
  );
}

/** Etiqueta "Bloqueado" (vermelha) para listas. */
export const EtiquetaBloqueado = () => <span className="chip bg-red-50 text-red-800">Bloqueado</span>;
