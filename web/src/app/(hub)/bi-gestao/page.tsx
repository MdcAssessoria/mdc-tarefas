// BI de Gestão (v2, 20/11/2026): abre nos cartões das empresas ligadas ao Omie, sem números. Quem tem acesso à empresa
// (administrador, responsável pelo cliente ou pedido aprovado por 30 dias) abre o painel; quem não tem pede acesso.
// Regras de acesso no banco (097: app.bi_pode_ver, bi_empresas, bi_acesso_*); telas em dominios/bi/componentes.
"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { hojeISO } from "@/lib/datas";
import { useConsulta } from "@/lib/useConsulta";
import { useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { lerEmpresas } from "@/dominios/bi/dados";
import { PainelBi } from "@/dominios/bi/componentes/PainelBi";
import { SeletorEmpresas } from "@/dominios/bi/componentes/SeletorEmpresas";

const CHAVE_ULTIMA = "hub-bi-ultima";
interface Escolha {
  grupo: string;
  ids: string[];
}

function lerUltima(): Escolha | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_ULTIMA) ?? "null");
    return v && typeof v.grupo === "string" && Array.isArray(v.ids) ? v : null;
  } catch {
    return null;
  }
}
function guardarUltima(e: Escolha) {
  try {
    localStorage.setItem(CHAVE_ULTIMA, JSON.stringify(e));
  } catch {
    // sem armazenamento no navegador: só não lembra a última escolha
  }
}

function Tela() {
  const { org, papel, pode } = useOrg();
  const { aviso, mostrar } = useAviso();
  const params = useSearchParams();
  const hoje = hojeISO(org.fuso);
  const empresas = useConsulta(useCallback(() => lerEmpresas(), []));
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [ultima] = useState<Escolha | null>(() => (typeof window === "undefined" ? null : lerUltima()));

  const liberadas = (empresas.dados ?? []).filter((e) => e.liberado);
  const daEscolha = (e: Escolha | null) => (e ? liberadas.filter((x) => e.ids.includes(x.cliente_id)) : []);
  const escolhidas = daEscolha(escolha);
  const continuar = !escolha ? daEscolha(ultima) : [];

  function abrir(grupo: string, ids: string[]) {
    const e = { grupo, ids };
    guardarUltima(e);
    setEscolha(e);
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <CabecalhoPagina
          titulo="BI de Gestão"
          descricao="DRE, fluxo de caixa, comparações, indicadores e orçamento dos grupos de empresas ligados ao sistema do cliente (Omie)."
        />
      </div>
      {aviso}
      {empresas.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {empresas.erro}
        </p>
      )}
      {!empresas.dados ? (
        !empresas.erro && <Esqueleto />
      ) : escolhidas.length ? (
        <PainelBi
          key={escolhidas.map((e) => e.cliente_id).join(",")}
          grupo={escolha?.grupo ?? ""}
          escolhidas={escolhidas}
          aoTrocar={() => setEscolha(null)}
          contextoBase={{
            hoje,
            logoUrl: org.logo_url ?? null,
            podeLancar: pode("bi_gestao", "operar"),
            podeClassificar: pode("bi_gestao", "gerir"),
            avisar: mostrar,
          }}
        />
      ) : (
        <>
          {continuar.length > 0 && ultima && (
            <button
              type="button"
              className="cartao flex w-full items-center gap-3 p-4 text-left hover:border-[var(--destaque-escuro)]"
              onClick={() =>
                abrir(
                  ultima.grupo,
                  continuar.map((e) => e.cliente_id),
                )
              }
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--marca)] text-[var(--destaque)]" aria-hidden="true">
                <Icone nome="seta-direita" className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-[var(--marca)]">
                  Continuar em {continuar.length > 1 ? ultima.grupo : continuar[0].nome}
                </span>
                <span className="text-sm text-[var(--texto-suave)]">
                  A última empresa que você abriu. Os números só carregam depois do clique.
                </span>
              </span>
            </button>
          )}
          <SeletorEmpresas
            empresas={empresas.dados}
            aoAbrir={abrir}
            aoMudar={empresas.recarregar}
            admin={papel === "admin"}
            avisar={mostrar}
            pedidosAbertos={params.get("pedidos") === "1"}
          />
        </>
      )}
    </div>
  );
}

export default function PaginaBiGestao() {
  return (
    <Suspense>
      <Tela />
    </Suspense>
  );
}
