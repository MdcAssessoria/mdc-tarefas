// Estoque › Movimentações: entrada, saída, inventário, transferência e estorno manuais.
"use client";

import { TelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { AbaMovimentos } from "@/dominios/financeiro/componentes/EstoqueMovimentos";

export default function PaginaMovimentos() {
  return (
    <TelaEmpresa
      modulo="estoque"
      titulo="Movimentações"
      descricao="Tudo o que entrou e saiu do estoque. Compras e vendas lançam sozinhas; aqui você lança o que for avulso."
    >
      {(p) => <AbaMovimentos {...p} />}
    </TelaEmpresa>
  );
}
