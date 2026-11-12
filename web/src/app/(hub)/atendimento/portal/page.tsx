// Acessos do Portal do Cliente (Atendimento › Acessos do portal). A gestão é a mesma da aba "Clientes (portal)" de
// Pessoas e acessos: um só componente (dominios/portal/componentes/AcessosClientes), com as permissões e perfis de
// dominios/portal/permissoes.ts. Nível exigido ("gerir" em Atendimento) aplicado pela Guarda (navegacao.ts).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { AcessosClientes } from "@/dominios/portal/componentes/AcessosClientes";
import { Aviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { SenhaCopiavel } from "@/app/(hub)/hub/acessos/_componentes/SenhaCopiavel";
import { caminho } from "@/lib/caminho";
import type { SenhaGerada } from "@/dominios/acessos/convite";

export default function PaginaAcessosPortal() {
  const [aviso, setAviso] = useState<{ texto: string; senha?: SenhaGerada; nome?: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Acessos ao Portal do Cliente"
        descricao="Quem de cada cliente (sócio, financeiro, RH) entra no Portal, em quais empresas e com qual perfil. Cliente inativado perde o acesso depois do mês de saída."
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && (
        <div role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          {aviso.texto}
          {aviso.senha && (
            <SenhaCopiavel
              {...aviso.senha}
              endereco={aviso.senha.endereco || `${window.location.origin}${caminho("/login")}`}
              nome={aviso.nome}
            />
          )}
        </div>
      )}
      <AcessosClientes
        aoAviso={(texto, senha, nome) => {
          setErro(null);
          setAviso({ texto, senha, nome });
        }}
        aoErro={(e) => {
          setAviso(null);
          setErro(traduzirErro(e));
        }}
      />
    </div>
  );
}
