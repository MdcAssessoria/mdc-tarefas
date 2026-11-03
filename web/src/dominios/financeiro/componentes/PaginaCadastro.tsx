// Página de um cadastro da gestão (fornecedores e clientes, despesas e receitas, centros de custo): entrega o cadastro
// da MDC (a empresa própria da organização). Sem ela definida, mostra o cabeçalho e o aviso para o administrador.
"use client";

import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { useAviso } from "@/components/ui/Aviso";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import type { PropsAba } from "./Comuns";

export function PaginaCadastro({
  titulo,
  descricao,
  icone,
  ferramentas,
  render,
}: {
  titulo: string;
  descricao: string;
  icone: string;
  /** Ferramentas (slugs) que permitem cadastrar e editar; basta uma no nível "operar". */
  ferramentas: string[];
  render: (props: PropsAba) => React.ReactNode;
}) {
  const { pode } = useOrg();
  const { cliente } = useClienteGestao();
  const { aviso, mostrar } = useAviso();
  return (
    <div className="space-y-4">
      {aviso}
      {cliente ? (
        <div key={cliente.id}>{render({ cliente, podeOperar: ferramentas.some((f) => pode(f, "operar")), avisar: mostrar })}</div>
      ) : (
        <>
          <CabecalhoPagina titulo={titulo} descricao={descricao} />
          <SemEmpresaGestao icone={icone} />
        </>
      )}
    </div>
  );
}
