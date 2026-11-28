// Módulos do Ledgra (migração 126, pedido do Edvaldo: "do HUB MDC eu preciso chamar os módulos XML, Auditor,
// Legislação e Varredura", "entra direto"). Cada botão pede ao Ledgra, pela Função ledgra-entrar, uma entrada com o
// mesmo e-mail e abre o módulo numa aba nova já logado. Sem usuário ou sem o módulo no Ledgra, mostra o motivo.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";
import { enderecoValido, MODULOS_LEDGRA, type ModuloLedgra } from "@/dominios/ledgraModulos/modulos";
import { useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";

export default function PaginaLedgraModulos() {
  const { org, pode } = useOrg();
  const { aviso, mostrar } = useAviso();
  const [abrindo, setAbrindo] = useState<ModuloLedgra | null>(null);

  async function abrir(modulo: ModuloLedgra) {
    // a aba abre já no clique (o celular bloqueia janela aberta depois de esperar o servidor)
    const aba = window.open("", "_blank");
    setAbrindo(modulo);
    try {
      const r = await chamarFuncao<{ url?: string }>("ledgra-entrar", { corpo: { org: org.id, modulo } });
      if (!enderecoValido(r.url)) throw new Error("O Ledgra não devolveu a entrada.");
      if (aba) aba.location.replace(r.url);
      else window.location.assign(r.url);
    } catch (e) {
      aba?.close();
      mostrar(traduzirErro(e), "erro");
    }
    setAbrindo(null);
  }

  if (!pode("ledgra_modulos", "ver"))
    return (
      <EstadoVazio titulo="Módulos do Ledgra não liberado">
        Peça ao administrador do HUB para liberar a ferramenta Módulos do Ledgra em Pessoas e acessos.
      </EstadoVazio>
    );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Módulos do Ledgra"
        descricao="Abra o Ledgra XML, Auditor, Legislação e Varredura numa aba nova, já entrando com o seu e-mail."
      />
      {aviso}
      <div className="grid gap-3 sm:grid-cols-2">
        {MODULOS_LEDGRA.map((m) => (
          <div key={m.chave} className="cartao flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--destaque-claro,#f3ead3)] text-[var(--marca)]">
                <Icone nome={m.icone} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-[var(--marca)]">{m.nome}</p>
                <p className="text-sm text-[var(--texto-suave)]">{m.descricao}</p>
              </div>
            </div>
            <div>
              <button className="btn-primario" onClick={() => void abrir(m.chave)} disabled={abrindo !== null}>
                <Icone nome="externo" />
                {abrindo === m.chave ? "Abrindo…" : `Abrir o ${m.nome}`}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--texto-suave)]">
        O Ledgra confere o seu e-mail: é preciso ter usuário no Ledgra com o módulo liberado (licença e acesso). Cada entrada fica
        registrada no Ledgra. Os clientes da MDC entram na Varredura pela conta da MDC no Ledgra (Minha conta › Clientes da conta › Trazer
        clientes do HUB).
      </p>
    </div>
  );
}
