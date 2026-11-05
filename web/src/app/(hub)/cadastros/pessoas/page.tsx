// Cadastro comum › Fornecedores e clientes da MDC (serve ao Financeiro, Entradas, Saídas e Estoque).
// Antes ficava em /financeiro/cadastros (o endereço antigo redireciona para cá, ver next.config.ts).
"use client";

import { CadPessoas } from "@/dominios/financeiro/componentes/CadPessoas";
import { PaginaCadastro } from "@/dominios/financeiro/componentes/PaginaCadastro";

export default function PaginaPessoas() {
  return (
    <PaginaCadastro
      titulo="Fornecedores e clientes"
      descricao="Um cadastro só para a MDC toda: vale no Financeiro e nos Contratos."
      icone="pessoas"
      ferramentas={["financeiro", "entradas", "saidas", "estoque"]}
      render={(p) => <CadPessoas {...p} />}
    />
  );
}
