// Janela para editar uma pessoa da equipe: nome, papel, setor e os módulos que ela vê (escolhidos um a um ou por
// perfil pronto). Só o administrador chega aqui.
"use client";

import { useId, useState } from "react";
import { PAPEIS } from "@/dominios/organizacao/tipos";
import type { Membro, Papel } from "@/dominios/organizacao/tipos";
import type { Acesso, HubApp, Perfil } from "@/dominios/acessos/tipos";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { EscolhaModulos } from "./EscolhaModulos";
import type { Modulos } from "./EscolhaModulos";

export interface EdicaoPessoa {
  nome: string;
  papel: Papel;
  setor: string | null;
  perfil: string | null;
  ativo: boolean;
  /** Acesso personalizado: os módulos escolhidos um a um (sem perfil). */
  modulos?: Modulos;
}

export function EditarPessoa({
  m,
  perfis,
  setores,
  ferramentas,
  acessos,
  souEu,
  aoFechar,
  aoSalvar,
}: {
  m: Membro;
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  ferramentas: HubApp[];
  acessos: Acesso[];
  souEu: boolean;
  aoFechar: () => void;
  aoSalvar: (c: EdicaoPessoa) => void;
}) {
  const [nome, setNome] = useState(m.nome);
  const idForm = useId();
  const [papel, setPapel] = useState<Papel>(m.papel);
  const [setor, setSetor] = useState(m.setor_id ?? "");
  const [modo, setModo] = useState<"modulos" | "perfil">(m.perfil_id ? "perfil" : "modulos");
  const [perfil, setPerfil] = useState(m.perfil_id ?? perfis[0]?.id ?? "");
  const [modulos, setModulos] = useState<Modulos>(() => Object.fromEntries(acessos.map((a) => [a.app, a.papel])));
  const [erro, setErro] = useState<string | null>(null);
  const reativando = !m.ativo;
  const admin = papel === "admin";

  return (
    <Modal
      titulo={reativando ? `Reativar ${m.nome}` : `Editar ${m.nome}`}
      descricao={m.email}
      aoFechar={aoFechar}
      largura="6xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button type="submit" form={idForm} className="btn-primario">
            <Icone nome="check" className="h-4 w-4" />
            {reativando ? "Reativar" : "Salvar"}
          </button>
        </>
      }
    >
      <form
        id={idForm}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!admin && modo === "modulos" && Object.keys(modulos).length === 0) return setErro("Marque ao menos um módulo.");
          if (!admin && modo === "perfil" && !perfil) return setErro("Escolha o perfil de acesso.");
          aoSalvar({
            nome,
            papel,
            setor: setor || null,
            perfil: admin || modo === "modulos" ? null : perfil,
            ativo: true,
            modulos: !admin && modo === "modulos" ? modulos : undefined,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="campo sm:col-span-2 lg:col-span-1">
            <span>Nome</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Papel nas tarefas</span>
            <select value={papel} disabled={souEu} onChange={(e) => setPapel(e.target.value as Papel)}>
              {PAPEIS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Setor</span>
            <select value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">—</option>
              {setores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        {admin ? (
          <p className="rounded-md bg-[var(--fundo)] p-3 text-sm text-neutral-700">
            Administrador vê todos os módulos e esta tela de acessos.
          </p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Como liberar os módulos" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["modulos", "Escolher os módulos", "Um a um, só para esta pessoa."],
                  ["perfil", "Seguir um perfil pronto", "Mudou o perfil, muda para todos que o seguem."],
                ] as const
              ).map(([id, titulo, texto]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={modo === id}
                  onClick={() => setModo(id)}
                  className={`rounded-lg border p-3 text-left text-sm ${modo === id ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)] bg-white"}`}
                >
                  <span className="flex items-center gap-2 font-medium text-[var(--texto)]">
                    <Icone nome={modo === id ? "check" : id === "modulos" ? "lista" : "pessoas"} className="h-4 w-4" />
                    {titulo}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--texto-suave)]">{texto}</span>
                </button>
              ))}
            </div>
            {modo === "modulos" ? (
              <EscolhaModulos apps={ferramentas} valor={modulos} aoMudar={setModulos} perfis={perfis} />
            ) : (
              <label className="campo">
                <span>Perfil de acesso</span>
                <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {perfis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
