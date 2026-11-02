// Saídas › Pedidos de venda: confirmar dá baixa no estoque e lança as contas a receber.
"use client";

import { TelaEmpresa } from "@/dominios/financeiro/componentes/TelaEmpresa";
import { TelaPedidos } from "@/dominios/financeiro/componentes/TelaPedidos";

export default function PaginaPedidosVenda() {
  return (
    <TelaEmpresa
      modulo="saidas"
      titulo="Pedidos de venda"
      descricao="Monte o pedido, confirme e o HUB baixa o estoque e lança as contas a receber."
    >
      {(p) => <TelaPedidos tipo="venda" {...p} />}
    </TelaEmpresa>
  );
}
