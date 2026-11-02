// Aviso da ficha para processo de empresa fora do cadastro de clientes, com a escolha do cliente já cadastrado.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { Icone } from "@/components/ui/Icone";

/**
 * Processo de empresa que ainda não está no cadastro de clientes: aviso e, para quem opera o Societário, a escolha do
 * cliente já cadastrado para ligar o processo (as tarefas das fases vão junto, pela função soc_vincular_cliente). Na
 * abertura, concluir o processo já cadastra a empresa sozinho; ligar antes só serve se ela já foi cadastrada à mão.
 */
export function LigarCliente({
  abertura,
  podeOperar,
  aoLigar,
}: {
  abertura: boolean;
  podeOperar: boolean;
  aoLigar: (cliente: string) => Promise<boolean>;
}) {
  const { clientes } = useOrg();
  const [cli, setCli] = useState("");
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="flex items-start gap-2">
        <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {abertura ? (
            <>
              Empresa em abertura: ao <b>concluir o processo</b>, o HUB cadastra a empresa em Clientes sozinho.
            </>
          ) : (
            <>
              <b>Esta empresa ainda não está no cadastro de clientes.</b> Peça a um gestor para cadastrá-la em Tarefas ›
              Configurações › Clientes e depois ligue o processo a ela aqui.
            </>
          )}
        </span>
      </p>
      {podeOperar && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="entrada w-full flex-1 bg-white sm:min-w-64"
            value={cli}
            onChange={(e) => setCli(e.target.value)}
            aria-label="Cliente cadastrado"
          >
            <option value="">{abertura ? "Já cadastrou à mão? Escolha o cliente…" : "Escolha o cliente já cadastrado…"}</option>
            {clientes
              .filter((c) => c.ativo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                  {nomeCliente(c)}
                </option>
              ))}
          </select>
          <button
            className="btn-primario justify-center"
            disabled={!cli || enviando}
            onClick={async () => {
              setEnviando(true);
              await aoLigar(cli);
              setEnviando(false);
            }}
          >
            <Icone nome="transferir" className="h-4 w-4" />
            {enviando ? "Ligando…" : "Ligar ao cliente"}
          </button>
        </div>
      )}
    </div>
  );
}
