// Tela de Configurações (gestores e administradores): escolhe a aba; cada aba fica em _abas/. Quem tem Tarefas › Gerir
// sem ser gestor vê só a aba Clientes (empresas e responsáveis, 123).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Abas } from "@/components/ui/Abas";
import { AbaClientes } from "./_abas/AbaClientes";
import { AbaEquipe } from "./_abas/AbaEquipe";
import { AbaFeriados } from "./_abas/AbaFeriados";
import { AbaIntegracoes } from "./_abas/AbaIntegracoes";
import { AbaObrigacoes } from "./_abas/AbaObrigacoes";
import { AbaOrganizacao } from "./_abas/AbaOrganizacao";
import { AbaSetores } from "./_abas/AbaSetores";

type Aba = "organizacao" | "equipe" | "setores" | "clientes" | "obrigacoes" | "feriados" | "integracoes";

export default function PaginaConfig() {
  return <Config />;
}

function Config() {
  const { papel, podeEditarCadastros } = useOrg();
  const abas: { id: Aba; nome: string; admin?: boolean; gestor?: boolean }[] = [
    { id: "obrigacoes", nome: "Obrigações recorrentes", gestor: true },
    { id: "clientes", nome: "Clientes" },
    { id: "equipe", nome: "Equipe", admin: true },
    { id: "setores", nome: "Setores", gestor: true },
    { id: "feriados", nome: "Feriados", gestor: true },
    { id: "organizacao", nome: "Organização e painel", admin: true },
    { id: "integracoes", nome: "Integrações", admin: true },
  ];
  const [aba, setAba] = useState<Aba>(podeEditarCadastros ? "obrigacoes" : "clientes");
  const visiveis = abas.filter((a) => (!a.admin || papel === "admin") && (!a.gestor || podeEditarCadastros));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--marca)]">Configurações</h1>
      <Abas rotulo="Seções das configurações" itens={visiveis} valor={aba} aoMudar={setAba} />
      {aba === "organizacao" && <AbaOrganizacao />}
      {aba === "equipe" && <AbaEquipe />}
      {aba === "integracoes" && papel === "admin" && <AbaIntegracoes />}
      {aba === "setores" && podeEditarCadastros && <AbaSetores />}
      {aba === "clientes" && <AbaClientes />}
      {aba === "obrigacoes" && podeEditarCadastros && <AbaObrigacoes />}
      {aba === "feriados" && podeEditarCadastros && <AbaFeriados />}
    </div>
  );
}
