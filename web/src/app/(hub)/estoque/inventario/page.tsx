// Estoque › Inventário guiado: contar vários itens de um estoque e gravar as diferenças de uma vez.
"use client";

import { TelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { EstoqueInventario } from "@/dominios/financeiro/componentes/EstoqueInventario";

export default function PaginaInventario() {
  return (
    <TelaEmpresa modulo="estoque" titulo="Inventário" descricao="Conte o que tem na prateleira e o HUB acerta o saldo do sistema.">
      {(p) => <EstoqueInventario {...p} />}
    </TelaEmpresa>
  );
}
