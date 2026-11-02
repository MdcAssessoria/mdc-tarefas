// Página de um cadastro da gestão (fornecedores e clientes, despesas e receitas, centros de custo): escolhe a empresa
// e entrega o cadastro dela. Sem empresa escolhida, mostra o cabeçalho, o seletor e o convite para escolher.
"use client";

import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { EscolhaCliente, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
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
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const { aviso, mostrar } = useAviso();
  const seletor = <EscolhaCliente gestao={financeiro} />;
  return (
    <div className="space-y-4">
      {aviso}
      {cliente ? (
        <div key={cliente.id}>
          {render({ cliente, podeOperar: ferramentas.some((f) => pode(f, "operar")), avisar: mostrar, seletor })}
        </div>
      ) : (
        <>
          <CabecalhoPagina titulo={titulo} descricao={descricao} />
          <CartaoFiltros>{seletor}</CartaoFiltros>
          <EstadoVazio icone={icone} titulo="Escolha a empresa">
            Escolha a empresa nos filtros acima para ver o cadastro dela.
          </EstadoVazio>
        </>
      )}
    </div>
  );
}
