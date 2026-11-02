// Estoque › Posição: saldo e valor de cada item por estoque (local).
"use client";

import { TelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { EstoquePosicao } from "@/dominios/financeiro/componentes/EstoquePosicao";

export default function PaginaPosicao() {
  return (
    <TelaEmpresa
      modulo="estoque"
      titulo="Posição do estoque"
      descricao="Quanto tem de cada item, onde está e quanto vale pelo custo médio."
    >
      {(p) => <EstoquePosicao {...p} />}
    </TelaEmpresa>
  );
}
