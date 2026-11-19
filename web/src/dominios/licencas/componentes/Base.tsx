// Peças comuns das telas de Licenças: carregamento dos dados da organização (módulos, planos, contratos, mensalidades,
// bloqueios), nomes prontos para mostrar, permissões da pessoa e o cabeçalho das telas.
"use client";

import { useCallback, useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import {
  comValores,
  lerBaixas,
  lerBloqueios,
  lerCobrancas,
  lerContratos,
  lerParametros,
  lerPlanos,
  lerProdutos,
  lerSistemas,
  lerUsos,
  lerValores,
} from "../leituras";
import { somarMeses } from "@/lib/datas";
import type { Contrato, Plano, Produto, Sistema } from "../tipos";

/** "Pacote Gestão", "EXato full" ou "Financeiro, Estoque" (módulos avulsos); "(gratuita)" quando o valor é zero. */
export function rotuloContrato(
  k: Pick<Contrato, "plano_id" | "produtos"> & Partial<Pick<Contrato, "modalidade" | "sistema">>,
  produtos: Map<string, Produto>,
  planos: Map<string, Plano>,
  sistemas: Map<string, Sistema> = new Map(),
): string {
  if (k.modalidade === "full") return `${(k.sistema && sistemas.get(k.sistema)?.nome) || "Ledgra"} full`;
  if (k.modalidade === "gratuita") return `${rotuloContrato({ ...k, modalidade: undefined }, produtos, planos, sistemas)} (gratuita)`;
  if (k.plano_id && planos.get(k.plano_id)) return `Pacote ${planos.get(k.plano_id)!.nome}`;
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
      // usuários informados pelos sistemas: este mês e o anterior (o adicional do mês passado entra na cobrança deste)
      const mesPassado = somarMeses(hoje.slice(0, 7), -1) + "-01";
      const [produtos, planos, contratos, cobrancas, bloqueios, parametros, recebimentos, v, sistemas, usos] = await Promise.all([
        lerProdutos(org.id),
        lerPlanos(org.id),
        lerContratos(org.id),
        valores ? lerCobrancas(org.id) : Promise.resolve([]),
        lerBloqueios(org.id),
        lerParametros(org.id),
        baixas && valores ? lerBaixas(org.id) : Promise.resolve([]),
        valores ? lerValores(org.id) : Promise.resolve(null),
        lerSistemas(org.id),
        lerUsos(org.id, mesPassado),
      ]);
      return { ...comValores({ produtos, planos, contratos, cobrancas, bloqueios, parametros, recebimentos }, v), sistemas, usos };
    }, [org.id, baixas, valores, hoje]),
  );
  const d = consulta.dados;
  const mapas = useMemo(() => {
    const produtos = new Map((d?.produtos ?? []).map((p) => [p.id, p]));
    const planos = new Map((d?.planos ?? []).map((p) => [p.id, p]));
    const bloqueados = new Map((d?.bloqueios ?? []).filter((b) => !b.desbloqueado_em).map((b) => [b.cliente_id, b]));
    const sistemas = new Map((d?.sistemas ?? []).map((s) => [s.slug, s]));
    // maior número de usuários deste mês por licença (o sistema informa ao conferir a chave)
    const mes = hoje.slice(0, 7) + "-01";
    const usuariosNoMes = new Map((d?.usos ?? []).filter((u) => u.competencia === mes).map((u) => [u.contrato_id, u.usuarios]));
    return { produtos, planos, bloqueados, sistemas, usuariosNoMes };
  }, [d, hoje]);
  const nomeDoCliente = useCallback((id: string) => nomeCliente(clientePorId(id), "Cliente removido"), [clientePorId]);
  return {
    ...consulta,
    ...mapas,
    hoje,
    nomeDoCliente,
    rotulo: (k: Pick<Contrato, "plano_id" | "produtos"> & Partial<Pick<Contrato, "modalidade" | "sistema">>) =>
      rotuloContrato(k, mapas.produtos, mapas.planos, mapas.sistemas),
    nomeSistema: (slug: string) => mapas.sistemas.get(slug)?.nome ?? slug,
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
