// Acessos do Portal do Cliente (Atendimento › Acessos do portal). A gestão é a mesma da aba "Clientes (portal)" de
// Pessoas e acessos: um só componente (dominios/portal/componentes/AcessosClientes), com as permissões e perfis de
// dominios/portal/permissoes.ts. Nível exigido ("gerir" em Atendimento) aplicado pela Guarda (navegacao.ts).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { AcessosClientes } from "@/dominios/portal/componentes/AcessosClientes";
import { Aviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { LinkCopiavel } from "@/app/(hub)/hub/acessos/_componentes/LinkCopiavel";

export default function PaginaAcessosPortal() {
  const [aviso, setAviso] = useState<{ texto: string; link?: string; nome?: string } | null>(null);
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
          {aviso.link && <LinkCopiavel link={aviso.link} nome={aviso.nome} />}
        </div>
      )}
      <AcessosClientes
        aoAviso={(texto, link, nome) => {
          setErro(null);
          setAviso({ texto, link, nome });
        }}
        aoErro={(e) => {
          setAviso(null);
          setErro(traduzirErro(e));
        }}
      />
    </div>
  );
}
