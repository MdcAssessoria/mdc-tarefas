// PN - Parceiros de negócio › Clientes da MDC (mesmo cadastro de Fornecedores e clientes, filtrado; 05/11/2026).
"use client";

import { CadPessoas } from "@/dominios/financeiro/componentes/CadPessoas";
import { PaginaCadastro } from "@/dominios/financeiro/componentes/PaginaCadastro";

export default function PaginaClientes() {
  return (
    <PaginaCadastro
      titulo="Clientes"
      descricao="Um cadastro só para a MDC toda: vale no Financeiro e nos Contratos."
      icone="pessoas"
      ferramentas={["financeiro", "entradas", "saidas", "estoque"]}
      render={(p) => <CadPessoas {...p} fixo="cliente" />}
    />
  );
}
