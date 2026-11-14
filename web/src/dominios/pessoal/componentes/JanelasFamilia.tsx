// Janelas da tela Família do MDC · Pessoal: o que cada pessoa pode fazer (permissão) e o nome da família.
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { PERMISSOES } from "../familia";
import type { Permissao } from "../familia";

export function JanelaPermissao({
  pessoa,
  aoFechar,
  aoSalvar,
}: {
  pessoa: { nome: string; permissao: Permissao };
  aoFechar: () => void;
  aoSalvar: (p: Permissao) => Promise<void>;
}) {
  const [perm, setPerm] = useState<Permissao>(pessoa.permissao);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setOcupado(true);
    setErro("");
    try {
      await aoSalvar(perm);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo={`O que ${pessoa.nome} pode fazer`}
      aoFechar={aoFechar}
      largura="lg"
      avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
      rodape={
        <>
          <button className="btn-primario" onClick={() => void salvar()} disabled={ocupado || perm === pessoa.permissao}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn" onClick={aoFechar} disabled={ocupado}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <div className="grid gap-2">
        {PERMISSOES.map((p) => (
          <button
            key={p.valor}
            type="button"
            aria-pressed={perm === p.valor}
            onClick={() => setPerm(p.valor)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left ${perm === p.valor ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-neutral-200"}`}
          >
            <Icone nome={perm === p.valor ? "check" : "escudo"} className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
            <span>
              <b className="block text-[var(--marca)]">{p.nome}</b>
              <span className="text-sm text-neutral-600">{p.explica}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function JanelaNome({ atual, aoFechar, aoSalvar }: { atual: string; aoFechar: () => void; aoSalvar: (nome: string) => Promise<void> }) {
  const [nome, setNome] = useState(atual);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    try {
      await aoSalvar(nome.trim());
    } catch (x) {
      setErro(traduzirErro(x));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo="Nome da família"
      descricao="É o nome que aparece no app e nos convites."
      aoFechar={aoFechar}
      avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
      rodape={
        <>
          <button type="submit" form="form-nome-familia" className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" className="btn" onClick={aoFechar} disabled={ocupado}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-nome-familia" onSubmit={(e) => void salvar(e)}>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} maxLength={80} required />
        </label>
      </form>
    </Modal>
  );
}
