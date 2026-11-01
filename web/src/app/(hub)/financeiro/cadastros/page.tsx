// Financeiro › Cadastros da empresa escolhida: fornecedores e clientes, despesas e receitas (ligadas ao plano de
// contas do Domínio) e centros de custo. Cada aba tem busca, filtros, PDF e Excel.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { CadPessoas } from "@/dominios/financeiro/componentes/CadPessoas";
import { CadCategorias } from "@/dominios/financeiro/componentes/CadCategorias";
import { CadCentros } from "@/dominios/financeiro/componentes/CadCentros";
import { Abas } from "@/components/ui/Abas";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";

type Aba = "pessoas" | "categorias" | "centros";

export default function PaginaCadastros() {
  const { pode } = useOrg();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const { aviso, mostrar } = useAviso();
  const [aba, setAba] = useState<Aba>("pessoas");
  const props = cliente ? { cliente, podeOperar: pode("financeiro", "operar"), avisar: mostrar } : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Cadastros</h1>
        <p className="text-sm text-neutral-600">Fornecedores, clientes, despesas, receitas e centros de custo de cada empresa.</p>
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
      </div>
      <Abas<Aba>
        rotulo="Cadastros"
        valor={aba}
        aoMudar={setAba}
        itens={[
          { id: "pessoas", nome: "Fornecedores e clientes" },
          { id: "categorias", nome: "Despesas e receitas" },
          { id: "centros", nome: "Centros de custo" },
        ]}
      />
      {aviso}
      {!props ? (
        <EstadoVazio>Escolha a empresa acima para ver os cadastros dela.</EstadoVazio>
      ) : aba === "pessoas" ? (
        <CadPessoas key={props.cliente.id} {...props} />
      ) : aba === "categorias" ? (
        <CadCategorias key={props.cliente.id} {...props} />
      ) : (
        <CadCentros key={props.cliente.id} {...props} />
      )}
    </div>
  );
}
