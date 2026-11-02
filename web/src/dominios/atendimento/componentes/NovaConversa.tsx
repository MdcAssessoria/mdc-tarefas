// Janela "Nova conversa": a equipe (escolhendo o cliente) ou o próprio cliente no Portal abre um atendimento.
// Grava pela função do banco portal_abrir_conversa, que define responsável, setor e prazo de resposta.
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { nomeCliente } from "@/dominios/clientes/nome";
import { ASSUNTOS } from "../chat";

export function NovaConversa({
  clientes,
  cliente: clienteFixo,
  titulo = "Nova conversa",
  descricao,
  aoFechar,
  aoCriar,
}: {
  /** Lista para escolher (lado da equipe). Sem ela, use `cliente`. */
  clientes?: { id: string; razao_social: string; nome_fantasia: string | null; codigo_dominio?: string | null }[];
  /** Cliente já definido (lado do Portal). */
  cliente?: string;
  titulo?: string;
  descricao?: string;
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const [cliente, setCliente] = useState(clienteFixo ?? "");
  const [assunto, setAssunto] = useState("duvida");
  const [resumo, setResumo] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return setErro("Escolha o cliente.");
    if (!texto.trim()) return setErro("Escreva a mensagem.");
    setEnviando(true);
    setErro(null);
    try {
      const id = exigir(
        await supabase().rpc("portal_abrir_conversa", { p_cliente: cliente, p_assunto: assunto, p_titulo: resumo, p_texto: texto }),
      );
      aoCriar(id as string);
    } catch (x) {
      setErro(traduzirErro(x));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={titulo} descricao={descricao} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-3">
        {clientes && (
          <label className="campo">
            <span>Cliente</span>
            <select required value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Escolha…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                  {nomeCliente(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="campo">
          <span>Assunto</span>
          <select value={assunto} onChange={(e) => setAssunto(e.target.value)}>
            {ASSUNTOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Resumo em uma linha</span>
          <input value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Ex.: Admissão da Maria em 10/11" />
        </label>
        <label className="campo">
          <span>Mensagem</span>
          <textarea required rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button className="btn-primario" disabled={enviando}>
            <Icone nome="enviar" className="h-4 w-4" />
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
