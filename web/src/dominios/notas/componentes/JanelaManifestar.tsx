// Janela para responder à SEFAZ (manifestação do destinatário) sobre uma ou várias notas: explica cada resposta em
// linguagem simples, pede a justificativa quando é "Operação não realizada" e mostra o resultado de cada nota.
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { manifestar } from "../repositorio";
import type { ResultadoManifestar } from "../repositorio";
import { EVENTOS, justificativaValida } from "../sefaz";
import type { CodigoManifestacao } from "../sefaz";
import type { Nota } from "../tipos";
import { fornecedorDa } from "./Comuns";

const ORDEM: CodigoManifestacao[] = ["confirmada", "ciencia", "desconhecida", "nao_realizada"];

export function JanelaManifestar({
  cliente,
  notas,
  tipoInicial,
  aoFechar,
  aoConcluir,
}: {
  cliente: string;
  notas: Nota[];
  tipoInicial?: CodigoManifestacao;
  aoFechar: () => void;
  aoConcluir: (msg: string) => void;
}) {
  const [tipo, setTipo] = useState<CodigoManifestacao>(tipoInicial ?? "confirmada");
  const [just, setJust] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoManifestar | null>(null);
  const total = notas.reduce((a, n) => a + Number(n.valor_total), 0);
  const nomes = new Map(notas.map((n) => [n.id, `NF ${n.numero ?? ""} · ${fornecedorDa(n)}`]));

  async function enviar() {
    setErro("");
    if (tipo === "nao_realizada" && !justificativaValida(just))
      return setErro("Explique o motivo com 15 a 255 letras (ex.: mercadoria recusada na entrega).");
    setOcupado(true);
    try {
      setResultado(
        await manifestar(
          cliente,
          notas.map((n) => n.id),
          tipo,
          tipo === "nao_realizada" ? just : undefined,
        ),
      );
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (resultado) {
    const ok = resultado.resultados.filter((r) => r.aceito).length;
    return (
      <Modal titulo="Resposta enviada à SEFAZ" aoFechar={() => aoConcluir(`${ok} nota(s) com resposta registrada na SEFAZ.`)} largura="lg">
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {resultado.resultados.map((r) => (
            <li key={r.nota} className={`rounded-md p-2 ${r.aceito ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
              <span className="font-medium">{nomes.get(r.nota)}</span>:{" "}
              {r.aceito
                ? `registrada (protocolo ${r.protocolo ?? "—"})`
                : `não aceita — ${r.motivo}${r.cStat ? ` (código ${r.cStat})` : ""}`}
            </li>
          ))}
          {resultado.recusadas.map((r) => (
            <li key={r.nota} className="rounded-md bg-amber-50 p-2 text-amber-900">
              {r.motivo}
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-2">
          <button className="btn-primario" onClick={() => aoConcluir(`${ok} nota(s) com resposta registrada na SEFAZ.`)}>
            Fechar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Responder à SEFAZ"
      descricao={`${notas.length} nota(s) · ${brl(total)}. A resposta fica registrada no Ambiente Nacional com o certificado da empresa.`}
      aoFechar={aoFechar}
      largura="lg"
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">O que aconteceu com esta compra?</legend>
        {ORDEM.map((t) => (
          <label
            key={t}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${tipo === t ? "border-[var(--destaque-escuro)] bg-amber-50/50" : "border-[var(--borda)]"}`}
          >
            <input type="radio" name="manifestacao" checked={tipo === t} onChange={() => setTipo(t)} className="mt-1" />
            <span>
              <span className="block font-medium">{EVENTOS[t].nome}</span>
              <span className="block text-neutral-600">{EVENTOS[t].explicacao}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {tipo === "nao_realizada" && (
        <label className="campo">
          <span>Motivo (15 a 255 letras)</span>
          <textarea
            rows={3}
            maxLength={255}
            value={just}
            onChange={(e) => setJust(e.target.value)}
            placeholder="Ex.: mercadoria recusada na entrega por avaria"
          />
        </label>
      )}
      {notas.length > 1 && (
        <p className="text-xs text-neutral-600">
          Notas:{" "}
          {notas
            .slice(0, 6)
            .map((n) => `NF ${n.numero ?? "?"}`)
            .join(", ")}
          {notas.length > 6 ? ` e mais ${notas.length - 6}` : ""}.
        </p>
      )}
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={enviar} disabled={ocupado}>
          {ocupado ? "Enviando à SEFAZ…" : `Enviar ${EVENTOS[tipo].nome.toLowerCase()}`}
        </button>
      </div>
    </Modal>
  );
}
