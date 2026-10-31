// Tela de Configurações (gestores e administradores): escolhe a aba; cada aba fica em _abas/.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Abas } from "@/components/ui/Abas";
import { AbaClientes } from "./_abas/AbaClientes";
import { AbaEquipe } from "./_abas/AbaEquipe";
import { AbaFeriados } from "./_abas/AbaFeriados";
import { AbaObrigacoes } from "./_abas/AbaObrigacoes";
import { AbaOrganizacao } from "./_abas/AbaOrganizacao";
import { AbaSetores } from "./_abas/AbaSetores";

type Aba = "organizacao" | "equipe" | "setores" | "clientes" | "obrigacoes" | "feriados";

export default function PaginaConfig() {
  return <Config />;
}

function Config() {
  const { papel } = useOrg();
  const abas: { id: Aba; nome: string; admin?: boolean }[] = [
    { id: "obrigacoes", nome: "Obrigações recorrentes" },
    { id: "clientes", nome: "Clientes" },
    { id: "equipe", nome: "Equipe", admin: true },
    { id: "setores", nome: "Setores" },
    { id: "feriados", nome: "Feriados" },
    { id: "organizacao", nome: "Organização e painel", admin: true },
  ];
  const [aba, setAba] = useState<Aba>("obrigacoes");

  if (papel !== "admin" && papel !== "gestor")
    return <p className="text-sm">Apenas gestores e administradores acessam as configurações.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--marca)]">Configurações</h1>
      <Abas rotulo="Seções das configurações" itens={abas.filter((a) => !a.admin || papel === "admin")} valor={aba} aoMudar={setAba} />
      {aba === "organizacao" && <AbaOrganizacao />}
      {aba === "equipe" && <AbaEquipe />}
      {aba === "setores" && <AbaSetores />}
      {aba === "clientes" && <AbaClientes />}
      {aba === "obrigacoes" && <AbaObrigacoes />}
      {aba === "feriados" && <AbaFeriados />}
    </div>
  );
}
