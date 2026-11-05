// Regras fiscais › Emitente (MDC): NBS padrão e tributos aproximados do Simples "conforme a legislação" (062).
// - NBS: escolhe o serviço principal (só para filtrar) e mostra apenas os NBS que a tabela oficial (Anexo VIII da NFS-e
//   Nacional) permite para ele (CampoNbsLegal).
// - Tributos aproximados (pTotTribSN, Lei 12.741/2012, art. 1º, §6º): calcula a alíquota efetiva do Simples pela
//   LC 123, art. 18, §1º-A — anexo pela atividade do Anexo VIII (III, IV ou Fator R, com a folha), faixa pelo RBT12 — e
//   tira a parte do ISS quando o escritório contábil paga ISS fixo (§22-A). "Usar este percentual" preenche o campo.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtPercentual } from "@/lib/formato/numero";
import { numeroBr } from "@/dominios/financeiro/regras";
import { aliquotaEfetiva, anexoDaAtividade, anexoPeloFatorR, semIssAnexoIII } from "@/lib/fiscal/simples";
import type { AnexoSimples } from "@/lib/fiscal/simples";
import { CampoServico } from "@/components/ui/CampoServico";
import { Icone } from "@/components/ui/Icone";
import { CampoNbsLegal } from "./CampoNbsLegal";

export function NbsETributosSimples({
  servicoInicial,
  nbs,
  aoNbs,
  ptot,
  aoPtot,
  desabilitado,
}: {
  servicoInicial: string;
  nbs: string;
  aoNbs: (v: string) => void;
  ptot: string;
  aoPtot: (v: string) => void;
  desabilitado: boolean;
}) {
  const [servico, setServico] = useState(servicoInicial);
  const [ativ, setAtiv] = useState<{ codigo: string | null; descricao: string | null } | null>(null);
  const [rbt12, setRbt12] = useState("");
  const [folha, setFolha] = useState("");
  const [anexoManual, setAnexoManual] = useState<AnexoSimples | "">("");
  const contabil = servico.replace(/\D/g, "").startsWith("1719");
  const [issFixo, setIssFixo] = useState(contabil);

  const daAtividade = anexoDaAtividade(ativ?.codigo);
  const receita = rbt12.trim() ? numeroBr(rbt12) || 0 : 0;
  const fr = daAtividade === "fator_r" && folha.trim() ? anexoPeloFatorR(numeroBr(folha) || 0, receita) : null;
  const anexo: AnexoSimples | null =
    anexoManual || (daAtividade === "III" || daAtividade === "IV" ? daAtividade : daAtividade === "fator_r" ? (fr?.anexo ?? null) : null);
  const calc = anexo && rbt12.trim() ? aliquotaEfetiva(anexo, receita) : null;
  const final = calc ? (issFixo && contabil ? semIssAnexoIII(calc) : calc.efetiva) : null;
  const finalTexto = final != null ? final.toFixed(2).replace(".", ",") : "";

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoServico
          rotulo="Serviço principal da MDC (para filtrar o NBS)"
          valor={servico}
          aoMudar={(c) => {
            setServico(c);
            setIssFixo(c.replace(/\D/g, "").startsWith("1719"));
          }}
        />
        <CampoNbsLegal
          servico={servico}
          valor={nbs}
          aoMudar={aoNbs}
          desabilitado={desabilitado}
          rotulo="NBS padrão da nota"
          aoAtividade={setAtiv}
        />
      </div>

      <div className="rounded-lg border border-[var(--borda)] p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="campo">
            <span>Tributos aproximados do Simples (%)</span>
            <input
              inputMode="decimal"
              value={ptot}
              disabled={desabilitado}
              onChange={(e) => aoPtot(e.target.value)}
              placeholder="Ex.: 6,00"
            />
            <small className="text-xs text-[var(--texto-suave)]">
              Vai na nota (Lei 12.741/2012): a alíquota efetiva do Simples da MDC. Recalcule quando a receita dos 12 meses mudar de faixa.
            </small>
          </label>
          <div className="space-y-2 rounded-md bg-[var(--fundo)] p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--marca)]">
              <Icone nome="grade" className="h-4 w-4 text-[var(--destaque-escuro)]" />
              Calcular pela regra do Simples (LC 123, art. 18)
            </p>
            {ativ?.descricao && (
              <p className="text-xs text-[var(--texto-suave)]">
                Atividade pela tabela oficial: <b>{ativ.descricao}</b>
              </p>
            )}
            {daAtividade === "impeditiva" ? (
              <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">
                A tabela oficial marca esta atividade como impeditiva no Simples.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="campo">
                  <span>Receita bruta dos 12 meses (RBT12)</span>
                  <input inputMode="decimal" value={rbt12} onChange={(e) => setRbt12(e.target.value)} placeholder="Ex.: 300.000,00" />
                </label>
                {daAtividade === "fator_r" && !anexoManual && (
                  <label className="campo">
                    <span>Folha dos 12 meses (Fator R)</span>
                    <input
                      inputMode="decimal"
                      value={folha}
                      onChange={(e) => setFolha(e.target.value)}
                      placeholder="Salários, pró-labore, encargos"
                    />
                  </label>
                )}
                <label className="campo">
                  <span>Anexo</span>
                  <select value={anexoManual} onChange={(e) => setAnexoManual(e.target.value as AnexoSimples | "")}>
                    <option value="">
                      {daAtividade === "fator_r" ? "Pelo Fator R" : anexo ? `Anexo ${anexo}` : "Escolha"}
                    </option>
                    <option value="III">Anexo III</option>
                    <option value="IV">Anexo IV</option>
                    <option value="V">Anexo V</option>
                  </select>
                </label>
              </div>
            )}
            {contabil && (
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={issFixo} onChange={(e) => setIssFixo(e.target.checked)} />
                <span>Escritório de contabilidade com ISS fixo (LC 123, art. 18, §22-A): tira a parte do ISS do percentual.</span>
              </label>
            )}
            {fr && (
              <p className="text-xs text-[var(--texto-suave)]">
                Fator R: {fmtPercentual(fr.fatorR, 2)} da receita é folha → <b>Anexo {fr.anexo}</b> (28% ou mais vai para o III).
              </p>
            )}
            {calc && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2 text-sm">
                <span>
                  Anexo {calc.anexo}, {calc.faixa}ª faixa: ({brl(receita)} × {fmtPercentual(calc.nominal / 100, 2)} − {brl(calc.deduzir)}) ÷{" "}
                  {brl(receita)} = <b>{fmtPercentual(calc.efetiva / 100, 2)}</b>
                  {final !== calc.efetiva && (
                    <>
                      {" "}
                      → sem o ISS: <b>{fmtPercentual((final ?? 0) / 100, 2)}</b>
                    </>
                  )}
                </span>
                {!desabilitado && (
                  <button type="button" className="btn !min-h-8 !px-3 text-xs" onClick={() => aoPtot(finalTexto)}>
                    <Icone nome="check" className="h-4 w-4" />
                    Usar {finalTexto}%
                  </button>
                )}
              </div>
            )}
            {calc?.aviso && <p className="text-xs text-amber-800">{calc.aviso}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
