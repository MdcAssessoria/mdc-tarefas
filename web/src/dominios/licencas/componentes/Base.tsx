// Peças comuns das telas de Licenças: carregamento dos dados da organização (módulos, planos, contratos, mensalidades,
// bloqueios), nomes prontos para mostrar, permissões da pessoa e o cabeçalho das telas.
"use client";

import { useCallback, useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { comValores, lerBaixas, lerBloqueios, lerCobrancas, lerContratos, lerParametros, lerPlanos, lerProdutos, lerValores } from "../leituras";
import type { Contrato, Plano, Produto } from "../tipos";

/** "Plano Gestão", "Ledgra full" ou "Financeiro, Estoque" (módulos avulsos); "(gratuita)" quando o valor é zero. */
export function rotuloContrato(
  k: Pick<Contrato, "plano_id" | "produtos"> & Partial<Pick<Contrato, "modalidade">>,
  produtos: Map<string, Produto>,
  planos: Map<string, Plano>,
): string {
  if (k.modalidade === "full") return "Ledgra full";
  if (k.modalidade === "gratuita") return `${rotuloContrato({ ...k, modalidade: undefined }, produtos, planos)} (gratuita)`;
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
  const valores = pode("licencas", "gerir");
  const consulta = useConsulta(
    useCallback(async () => {
      // mensalidades, recebimentos e valores só para quem tem a permissão de valores (o banco também barra)
      const [produtos, planos, contratos, cobrancas, bloqueios, parametros, recebimentos, v] = await Promise.all([
        lerProdutos(org.id),
        lerPlanos(org.id),
        lerContratos(org.id),
        valores ? lerCobrancas(org.id) : Promise.resolve([]),
        lerBloqueios(org.id),
        lerParametros(org.id),
        baixas && valores ? lerBaixas(org.id) : Promise.resolve([]),
        valores ? lerValores(org.id) : Promise.resolve(null),
      ]);
      return comValores({ produtos, planos, contratos, cobrancas, bloqueios, parametros, recebimentos }, v);
    }, [org.id, baixas, valores]),
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
    rotulo: (k: Pick<Contrato, "plano_id" | "produtos"> & Partial<Pick<Contrato, "modalidade">>) =>
      rotuloContrato(k, mapas.produtos, mapas.planos),
    podeOperar: pode("licencas", "operar"),
    /** gerir = permissão de valores (preços, valor do contrato, mensalidades) */
    podeGerir: valores,
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
