// Ficha da oportunidade › Histórico e próximos passos: registrar conversa (ligação, WhatsApp, reunião…) ou próximo
// passo com data, marcar como feito e corrigir o texto. Nada sai do histórico (migração 036: atividade não se apaga).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { TIPOS_ATIVIDADE } from "../../crm";
import type { Atividade, Oportunidade } from "../../crm";
import { concluirAtividade, editarAtividade, registrarAtividade } from "../../repositorio";

const ICONE: Record<string, NomeIcone> = {
  nota: "editar",
  ligacao: "chat",
  whatsapp: "chat",
  email: "enviar",
  reuniao: "pessoas",
  tarefa: "calendario",
  contrato: "documento",
  etapa: "funil",
};
const nomeTipo = (t: string) =>
  TIPOS_ATIVIDADE.find((x) => x.id === t)?.nome ?? (t === "etapa" ? "Etapa" : t === "contrato" ? "Contrato" : t);
/** Só os registros feitos à mão podem ter o texto corrigido; os automáticos (contrato, etapa) ficam como estão. */
const editavel = (a: Atividade) => TIPOS_ATIVIDADE.some((t) => t.id === a.tipo);

export function HistoricoOportunidade({
  o,
  atividades,
  podeOperar,
  eu,
  autorNome,
  aoMudar,
  avisar,
}: {
  o: Oportunidade;
  atividades: Atividade[];
  podeOperar: boolean;
  eu: string;
  autorNome: (u: string | null) => string;
  aoMudar: () => void;
  avisar: (msg: string, tom?: "erro" | "sucesso" | "atencao") => void;
}) {
  const [tipo, setTipo] = useState("nota");
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<Atividade | null>(null);
  const pendentes = atividades.filter((a) => a.tipo === "tarefa" && !a.concluida).length;

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return avisar("Escreva o que foi conversado ou o que precisa ser feito.", "atencao");
    if (tipo === "tarefa" && !quando) return avisar("Escolha a data do próximo passo.", "atencao");
    setOcupado(true);
    try {
      const falha = await registrarAtividade(o, eu, { tipo, texto: texto.trim(), quando: tipo === "tarefa" ? quando : "" });
      setTexto("");
      setQuando("");
      avisar(falha ?? "Registrado no histórico.", falha ? "atencao" : "sucesso");
      aoMudar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(false);
    }
  }

  async function concluir(a: Atividade) {
    try {
      await concluirAtividade(a);
      aoMudar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    }
  }

  return (
    <section className="cartao flex flex-col gap-3 p-4" aria-labelledby="historico-titulo">
      <h2 id="historico-titulo" className="flex items-center gap-2 font-semibold text-[var(--marca)]">
        <Icone nome="relogio" className="h-5 w-5" />
        Histórico e próximos passos
        {pendentes > 0 && <span className="chip bg-amber-50 text-amber-900">{pendentes} a fazer</span>}
      </h2>

      {podeOperar && (
        <form onSubmit={adicionar} className="space-y-2 rounded-lg bg-[var(--fundo)] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="campo">
              <span>O que foi</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_ATIVIDADE.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            {tipo === "tarefa" && (
              <label className="campo">
                <span>Para quando</span>
                <input type="date" value={quando} onChange={(e) => setQuando(e.target.value)} />
              </label>
            )}
          </div>
          <label className="campo">
            <span>{tipo === "tarefa" ? "O que fazer" : "O que foi conversado"}</span>
            <textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: pediu proposta com folha de 5 funcionários"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--texto-suave)]">
              {tipo === "tarefa" ? "A data vira o “Próximo retorno” da oportunidade." : "O primeiro contato tira a empresa de “Novo lead”."}
            </p>
            <button className="btn shrink-0" disabled={ocupado}>
              <Icone nome="mais" className="h-4 w-4" />
              {ocupado ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      )}

      <ul className="max-h-[560px] space-y-2 overflow-y-auto">
        {atividades.map((a) => {
          const aFazer = a.tipo === "tarefa" && !a.concluida;
          return (
            <li
              key={a.id}
              className={`rounded-lg border p-2.5 text-sm ${aFazer ? "border-amber-200 bg-amber-50" : "border-[var(--borda)] bg-white"}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--texto-suave)]">
                <span className="flex items-center gap-1 font-medium text-[var(--texto)]">
                  <Icone nome={ICONE[a.tipo] ?? "info"} className="h-3.5 w-3.5" />
                  {nomeTipo(a.tipo)}
                </span>
                <span>{fmtDataHora(a.criado_em)}</span>
                {autorNome(a.autor_id) && <span>· {autorNome(a.autor_id)}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {a.tipo === "tarefa" && (
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-[var(--marca)]"
                        checked={a.concluida}
                        onChange={() => concluir(a)}
                        disabled={!podeOperar}
                      />
                      feito
                    </label>
                  )}
                  {podeOperar && editavel(a) && (
                    <button
                      className="btn-link"
                      onClick={() => setEditando(a)}
                      aria-label={`Corrigir o registro de ${fmtDataHora(a.criado_em)}`}
                    >
                      corrigir
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{a.texto}</p>
              {a.quando && <p className="mt-0.5 text-[12px] text-[var(--texto-suave)]">para {fmtData(a.quando)}</p>}
            </li>
          );
        })}
        {!atividades.length && (
          <li className="rounded-lg border border-dashed border-[var(--borda)] p-4 text-center text-sm text-[var(--texto-suave)]">
            Nenhum registro ainda. Anote aqui cada conversa e o próximo passo combinado: assim qualquer pessoa da equipe continua o
            atendimento.
          </li>
        )}
      </ul>

      {editando && (
        <CorrigirRegistro
          a={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            avisar("Registro corrigido.");
            aoMudar();
          }}
        />
      )}
    </section>
  );
}

function CorrigirRegistro({ a, aoFechar, aoSalvar }: { a: Atividade; aoFechar: () => void; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(a.texto);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    if (!texto.trim()) return setErro("O texto não pode ficar vazio.");
    setOcupado(true);
    try {
      await editarAtividade(a.id, texto.trim());
      aoSalvar();
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo="Corrigir registro"
      descricao={`${nomeTipo(a.tipo)} de ${fmtDataHora(a.criado_em)}. O registro continua no histórico.`}
      aoFechar={aoFechar}
    >
      <label className="campo">
        <span>Texto</span>
        <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={ocupado}>
          <Icone nome="check" className="h-4 w-4" />
          {ocupado ? "Salvando…" : "Salvar correção"}
        </button>
      </div>
    </Modal>
  );
}
