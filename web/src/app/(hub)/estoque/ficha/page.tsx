// Estoque › Ficha do item (kardex): entradas, saídas, saldo e custo médio depois de cada movimento.
"use client";

import { TelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { FichaItem } from "@/dominios/financeiro/componentes/FichaItem";
import { useBaseEstoque } from "@/dominios/financeiro/componentes/estoqueBase";
import type { PropsTelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { Carregando } from "@/components/ui/Carregando";

function Ficha({ cliente, avisar }: PropsTelaEmpresa) {
  const base = useBaseEstoque(cliente.id);
  if (base.erro) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{base.erro}</p>;
  if (!base.dados) return <Carregando />;
  return <FichaItem cliente={cliente} avisar={avisar} base={base.dados} />;
}

export default function PaginaFicha() {
  return (
    <TelaEmpresa
      modulo="estoque"
      titulo="Ficha do item"
      descricao="O histórico de um item: cada entrada e saída, com o saldo e o custo médio depois de cada uma."
    >
      {(p) => <Ficha {...p} />}
    </TelaEmpresa>
  );
}
