// Estoque › Itens: cadastro de produtos e serviços da empresa escolhida (assistente, rápido, planilha, grupos).
"use client";

import { TelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { ItensTela } from "@/dominios/financeiro/componentes/ItensTela";

export default function PaginaItens() {
  return (
    <TelaEmpresa modulo="estoque" titulo="Itens" descricao="Produtos e serviços que a empresa vende e compra, com preço, custo e estoque.">
      {(p) => <ItensTela {...p} />}
    </TelaEmpresa>
  );
}
