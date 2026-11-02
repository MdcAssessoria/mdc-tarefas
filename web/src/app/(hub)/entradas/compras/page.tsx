// Entradas › Pedidos de compra: receber a mercadoria põe no estoque (com custo médio) e lança as contas a pagar.
"use client";

import { TelaEmpresa } from "@/dominios/financeiro/componentes/TelaEmpresa";
import { TelaPedidos } from "@/dominios/financeiro/componentes/TelaPedidos";

export default function PaginaPedidosCompra() {
  return (
    <TelaEmpresa
      modulo="entradas"
      titulo="Pedidos de compra"
      descricao="Faça o pedido ao fornecedor; quando a mercadoria chegar, receba e o HUB lança estoque e contas a pagar."
    >
      {(p) => <TelaPedidos tipo="compra" {...p} />}
    </TelaEmpresa>
  );
}
