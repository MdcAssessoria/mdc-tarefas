// Quadro "Módulos contratados" mostrado no cadastro do cliente (Configurações › Clientes): módulos do HUB que o cliente
// tem hoje, valor mensal, se está bloqueado e o atalho para os contratos. Só aparece para quem tem a ferramenta Licenças.
"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { lerProdutos } from "../leituras";
import { contratoVigente } from "../regras";
import type { Contrato } from "../tipos";

export function ModulosDoCliente({ cliente }: { cliente: string }) {
  const { org, pode } = useOrg();
  const ver = pode("licencas");
  const consulta = useConsulta(
    useCallback(async () => {
      if (!ver) return null;
      const [contratos, produtos, bloqueio] = await Promise.all([
        supabase().from("lic_contratos").select("id,cliente_id,plano_id,modalidade,inicio,fim,situacao,lic_contrato_produtos(produto_id)").eq("cliente_id", cliente).eq("situacao", "ativo"),
        lerProdutos(org.id),
        supabase().from("lic_bloqueios").select("id").eq("cliente_id", cliente).is("desbloqueado_em", null),
      ]);
      // sem valores aqui (074): o valor do contrato só aparece em Licenças Ledgra para quem tem a permissão de valores
      const ks = (exigir(contratos) ?? []) as (Pick<Contrato, "id" | "cliente_id" | "plano_id" | "modalidade" | "inicio" | "fim" | "situacao"> & {
        lic_contrato_produtos?: { produto_id: string }[];
      })[];
      return {
        contratos: ks.map((k) => ({
          ...k,
          produtos: (k.lic_contrato_produtos ?? []).map((x) => x.produto_id),
        })),
        nomes: new Map(produtos.map((p) => [p.id, p.nome])),
        bloqueado: ((exigir(bloqueio) ?? []) as unknown[]).length > 0,
      };
    }, [cliente, org.id, ver]),
  );
  if (!ver) return null;
  const d = consulta.dados;
  const hoje = hojeISO(org.fuso);
  const vigentes = (d?.contratos ?? []).filter((k) => contratoVigente(k, hoje));
  const modulos = vigentes.flatMap((k) => k.produtos.map((id) => d?.nomes.get(id) ?? "")).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--borda)] py-2 text-sm">
      <span className="text-[var(--texto-suave)]">Licença do Ledgra:</span>
      {!d ? (
        <span className="text-[var(--texto-suave)]">{consulta.erro ?? "carregando…"}</span>
      ) : modulos.length ? (
        <>
          {modulos.map((m) => (
            <span key={m} className="chip bg-emerald-50 text-emerald-800">
              {m}
            </span>
          ))}
          {d.bloqueado && <span className="chip bg-red-50 text-red-800">Bloqueado</span>}
        </>
      ) : (
        <span>nenhum</span>
      )}
      <Link className="btn-link" href={`/licencas/contratos?cliente=${cliente}`}>
        Ver licença
      </Link>
    </div>
  );
}
