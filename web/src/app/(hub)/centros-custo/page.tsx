// Centros de custo (módulo próprio) da MDC: separam gastos e ganhos por área, loja ou obra.
"use client";

import { CadCentros } from "@/dominios/financeiro/componentes/CadCentros";
import { PaginaCadastro } from "@/dominios/financeiro/componentes/PaginaCadastro";

export default function PaginaCentrosCusto() {
  return (
    <PaginaCadastro
      titulo="Centros de custo"
      descricao="Separe os gastos e ganhos por área, loja ou obra. É opcional em cada lançamento."
      icone="etiqueta"
      ferramentas={["centros_custo"]}
      render={(p) => <CadCentros {...p} />}
    />
  );
}
