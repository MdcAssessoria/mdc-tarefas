// Janela de cadastro e edição de um sistema vendido (059): nome e descrição. Quem gere Contratos cadastra; a receita
// de cada sistema vem dos contratos a receber que apontam para ele (Contratos › Receita por sistema).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { salvarSistema } from "../repositorio";
import type { Sistema } from "../tipos";

export function JanelaSistema({
  cliente,
  editar,
  nomeInicial = "",
  aoFechar,
  aoSalvar,
}: {
  cliente: string;
  editar?: Sistema;
  nomeInicial?: string;
  aoFechar: () => void;
  aoSalvar: (id: string, msg: string) => void;
}) {
  const [nome, setNome] = useState(editar?.nome ?? nomeInicial);
  const [descricao, setDescricao] = useState(editar?.descricao ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Escreva o nome do sistema. Exemplo: EXato");
    setSalvando(true);
    try {
      const r = await salvarSistema(
        editar
          ? { id: editar.id, nome: nome.trim(), descricao: descricao.trim() || null }
          : { cliente, nome: nome.trim(), descricao: descricao.trim() || null },
      );
      aoSalvar(r.id, editar ? "Sistema atualizado." : `Sistema "${nome.trim()}" cadastrado. Agora escolha-o nos contratos a receber.`);
    } catch (x) {
      setErro(traduzirErro(x));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={editar ? "Editar sistema" : "Novo sistema"}
      descricao="Um sistema ou módulo que a MDC licencia (ex.: Ledgra, EXato). Cada licença vendida é um contrato a receber que aponta para ele."
      aoFechar={aoFechar}
      largura="lg"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button type="submit" form="form-sistema" className="btn-primario" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : editar ? "Salvar" : "Cadastrar sistema"}
          </button>
        </>
      }
    >
      <form id="form-sistema" className="space-y-3" onSubmit={salvar}>
        <label className="campo">
          <span>Nome do sistema</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required autoFocus placeholder="Ex.: EXato" />
        </label>
        <label className="campo">
          <span>Descrição (opcional)</span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: gestão de diaristas · módulo Folha do Ledgra"
          />
        </label>
      </form>
    </Modal>
  );
}
