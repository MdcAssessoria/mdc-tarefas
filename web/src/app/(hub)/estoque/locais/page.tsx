// Estoque › Estoques (locais): depósito, loja, veículo; o padrão; a regra de estoque negativo.
"use client";

import { TelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { AbaLocais } from "@/dominios/financeiro/componentes/EstoqueLocais";

export default function PaginaLocais() {
  return (
    <TelaEmpresa modulo="estoque" titulo="Estoques" descricao="Os lugares onde os produtos ficam guardados.">
      {(p) => <AbaLocais {...p} />}
    </TelaEmpresa>
  );
}
