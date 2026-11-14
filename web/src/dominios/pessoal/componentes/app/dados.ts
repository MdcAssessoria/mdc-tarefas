// MDC · Pessoal no celular: leitura das contas da família (em aberto + as do mês), dos tipos de gasto e das contas
// bancárias, com aviso entre telas: quem grava dispara "pessoal:mudou" e as telas abertas recarregam sozinhas.
"use client";

import { useCallback, useEffect } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { limitesDoMes } from "../../app";
import type { ContaApp } from "../../app";

export const EVENTO_MUDOU = "pessoal:mudou";

/** Avisa as telas abertas que a família gravou algo (lançou, pagou). */
export function avisarMudanca() {
  window.dispatchEvent(new Event(EVENTO_MUDOU));
}

export interface Categoria {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
}
export interface ContaBanco {
  id: string;
  nome: string;
}

const CAMPOS = "id, tipo, descricao, vencimento, valor, valor_pago, situacao, quitado_em, parcela, parcelas, categoria_id";

/** Contas da família (em aberto e as que vencem no mês), tipos de gasto e contas bancárias ativas. */
export function useFinancasFamilia() {
  const { org } = useOrg();
  const cliente = org.gestao_cliente_id ?? null;
  const hoje = hojeISO(org.fuso);
  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return { contas: [] as ContaApp[], categorias: [] as Categoria[], bancos: [] as ContaBanco[] };
      const sb = supabase();
      const { de, ate } = limitesDoMes(hoje);
      const [abertas, doMes, cats, bancos] = await Promise.all([
        sb.from("fin_titulos").select(CAMPOS).eq("cliente_id", cliente).eq("situacao", "aberto").order("vencimento").order("id").range(0, 999),
        sb.from("fin_titulos").select(CAMPOS).eq("cliente_id", cliente).neq("situacao", "cancelado").or(`and(vencimento.gte.${de},vencimento.lte.${ate}),and(quitado_em.gte.${de},quitado_em.lte.${ate})`).order("vencimento").order("id").range(0, 999),
        sb.from("fin_categorias").select("id, nome, tipo").eq("cliente_id", cliente).eq("ativo", true).order("nome"),
        sb.from("fin_contas_bancarias").select("id, nome").eq("cliente_id", cliente).eq("ativo", true).order("nome"),
      ]);
      const categorias = exigir(cats) as Categoria[];
      const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));
      const porId = new Map<string, ContaApp>();
      for (const t of [...(exigir(abertas) as Linha[]), ...(exigir(doMes) as Linha[])])
        porId.set(t.id, { ...t, valor: Number(t.valor), valor_pago: Number(t.valor_pago), categoria: t.categoria_id ? (nomeCat.get(t.categoria_id) ?? null) : null });
      return { contas: [...porId.values()], categorias, bancos: exigir(bancos) as ContaBanco[] };
    }, [cliente, hoje]),
  );
  const { recarregar } = consulta;
  useEffect(() => {
    window.addEventListener(EVENTO_MUDOU, recarregar);
    return () => window.removeEventListener(EVENTO_MUDOU, recarregar);
  }, [recarregar]);
  return { ...consulta, hoje, cliente };
}

type Linha = Omit<ContaApp, "categoria" | "valor" | "valor_pago"> & { valor: number | string; valor_pago: number | string; categoria_id: string | null };
