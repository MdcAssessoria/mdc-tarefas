// Financeiro › Itens e estoque da empresa escolhida: cadastro de produtos e serviços (com "controla estoque?"),
// estoques (locais) e movimentações. A baixa automática pela venda entra com os pedidos de venda.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { AbaItens, AbaLocais, AbaMovimentos } from "@/dominios/financeiro/componentes/Estoque";
import { Abas } from "@/components/ui/Abas";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";

type Aba = "itens" | "locais" | "movimentos";

export default function PaginaEstoque() {
  const { pode } = useOrg();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const { aviso, mostrar } = useAviso();
  const [aba, setAba] = useState<Aba>("itens");
  const props = cliente ? { cliente, podeOperar: pode("financeiro", "operar"), avisar: mostrar } : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Itens e estoque</h1>
        <p className="text-sm text-neutral-600">Produtos e serviços da empresa, onde ficam guardados e quanto tem de cada um.</p>
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
      </div>
      <Abas<Aba>
        rotulo="Itens e estoque"
        valor={aba}
        aoMudar={setAba}
        itens={[
          { id: "itens", nome: "Itens" },
          { id: "locais", nome: "Estoques" },
          { id: "movimentos", nome: "Movimentações" },
        ]}
      />
      {aviso}
      {!props ? (
        <EstadoVazio>Escolha a empresa acima para ver os itens e o estoque dela.</EstadoVazio>
      ) : aba === "itens" ? (
        <AbaItens key={props.cliente.id} {...props} />
      ) : aba === "locais" ? (
        <AbaLocais key={props.cliente.id} {...props} />
      ) : (
        <AbaMovimentos key={props.cliente.id} {...props} />
      )}
    </div>
  );
}
