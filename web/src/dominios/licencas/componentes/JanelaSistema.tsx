// Janela "Sistema" de Sistemas › Produtos e planos (088): cadastra ou altera um sistema que a MDC licencia (nome,
// código, prefixo da chave e situação de venda). Grava pela lic_sistema_salvar (permissão de valores = gerir).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { salvarSistema } from "../repositorio";
import { SITUACOES_SISTEMA, type Sistema, type SituacaoSistema } from "../tipos";

export function JanelaSistema({
  sistema,
  org,
  aoFechar,
  aoSalvar,
}: {
  sistema: Sistema | null;
  org: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [f, setF] = useState({
    nome: sistema?.nome ?? "",
    slug: sistema?.slug ?? "",
    descricao: sistema?.descricao ?? "",
    prefixo: sistema?.prefixo ?? "",
    situacao: (sistema?.situacao ?? "em_breve") as SituacaoSistema,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (f.nome.trim().length < 2) return setErro("Informe o nome do sistema.");
    if (!sistema && !/^[a-z][a-z0-9-]{1,29}$/.test(f.slug))
      return setErro("Código: letras minúsculas sem acento, números ou hífen (ex.: exato).");
    if (!/^[A-Z]{3}$/.test(f.prefixo)) return setErro("Prefixo da chave: 3 letras (ex.: EXA).");
    setSalvando(true);
    setErro("");
    try {
      await salvarSistema({
        id: sistema?.id,
        org,
        slug: sistema ? undefined : f.slug,
        nome: f.nome.trim(),
        descricao: f.descricao.trim(),
        prefixo: f.prefixo,
        situacao: f.situacao,
      });
      aoSalvar(sistema ? "Sistema atualizado." : "Sistema cadastrado. Agora cadastre os módulos dele na aba Produtos.");
    } catch (x) {
      setErro(traduzirErro(x));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={sistema ? `Editar ${sistema.nome}` : "Novo sistema"}
      descricao="Sistema que a MDC licencia aos clientes. O código e os módulos não mudam de sistema depois."
      aoFechar={aoFechar}
      largura="2xl"
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <>
          <button className="btn-primario" type="submit" form="form-sistema" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn" type="button" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-sistema" onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="campo sm:col-span-1">
            <span>Nome</span>
            <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} required autoFocus />
          </label>
          <label className="campo">
            <span>Código (não muda)</span>
            <input
              value={f.slug}
              disabled={!!sistema}
              onChange={(e) => mudar({ slug: e.target.value.toLowerCase() })}
              placeholder="ex.: exato"
              required
            />
          </label>
          <label className="campo">
            <span>Prefixo da chave</span>
            <input
              value={f.prefixo}
              maxLength={3}
              onChange={(e) => mudar({ prefixo: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
              required
            />
          </label>
        </div>
        <label className="campo">
          <span>O que o sistema faz</span>
          <input value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
        </label>
        <div>
          <p className="mb-1 text-sm">Situação</p>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Situação">
            {SITUACOES_SISTEMA.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={f.situacao === x.id}
                className={`cartao flex items-start gap-2 p-2 text-left text-sm ${f.situacao === x.id ? "ring-2 ring-[var(--marca)]" : ""}`}
                onClick={() => mudar({ situacao: x.id })}
              >
                <Icone nome={f.situacao === x.id ? "check" : "caixa"} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
                <span>
                  <b>{x.nome}</b>
                  <span className="block text-xs text-neutral-600">{x.dica}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
