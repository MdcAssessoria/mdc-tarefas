// Plano de contas › Despesas e receitas (categorias) da MDC, cada uma ligada a uma conta analítica do plano.
"use client";

import { CadCategorias } from "@/dominios/financeiro/componentes/CadCategorias";
import { PaginaCadastro } from "@/dominios/financeiro/componentes/PaginaCadastro";

export default function PaginaCategorias() {
  return (
    <PaginaCadastro
      titulo="Despesas e receitas"
      descricao="As categorias de cada lançamento, cada uma ligada a uma conta do plano do Domínio."
      icone="etiqueta"
      ferramentas={["plano_contas"]}
      render={(p) => <CadCategorias {...p} />}
    />
  );
}
