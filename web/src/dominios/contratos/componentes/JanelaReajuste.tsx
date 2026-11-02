// Janela do reajuste anual: o HUB mostra o índice acumulado de 12 meses (buscado no Banco Central) ou o % fixo, o valor
// atual e o novo; a pessoa confere (pode ajustar o %) e confirma. Faltando mês do índice, explica e oferece buscar de novo.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtDataHora, mesExtenso } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { Icone } from "@/components/ui/Icone";
import { numeroBr } from "@/dominios/financeiro/regras";
import { atualizarIndices, propostaReajuste, reajustarContrato } from "../repositorio";
import { valorReajustado } from "../regras";
import type { Recorrente } from "../tipos";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;

export function JanelaReajuste({
  contrato,
  podeOperar,
  aoFechar,
  aoSalvar,
}: {
  contrato: Recorrente;
  podeOperar: boolean;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const consulta = useConsulta(useCallback(() => propostaReajuste(contrato.id), [contrato.id]));
  const p = consulta.dados;
  const [digitado, setDigitado] = useState<string | null>(null);
  const [atualizar, setAtualizar] = useState(false);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const campo = digitado ?? (p?.percentual != null ? String(p.percentual).replace(".", ",") : "");
  const percentual = campo.trim() ? numeroBr(campo) : NaN;
  const novo = Number.isFinite(percentual) ? valorReajustado(Number(contrato.valor), percentual) : null;
  const mudouDaProposta = p?.percentual != null && Number.isFinite(percentual) && Math.abs(percentual - p.percentual) > 0.00005;

  async function buscar() {
    setErro("");
    setBuscando(true);
    try {
      await atualizarIndices(contrato.cliente_id);
      // a resposta do Banco Central chega em alguns segundos; a proposta lê o que chegou
      await new Promise((r) => setTimeout(r, 5000));
      consulta.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar() {
    setErro("");
    if (!Number.isFinite(percentual) || percentual <= -50 || percentual > 100)
      return setErro("Informe o percentual do reajuste (ex.: 4,68).");
    setOcupado(true);
    try {
      const r = await reajustarContrato(contrato.id, percentual, obs.trim() || null, atualizar);
      aoSalvar(
        `Reajuste confirmado: ${brl(Number(r.valor))} por mês a partir da próxima conta` +
          (r.contas_atualizadas ? ` (${r.contas_atualizadas} conta(s) em aberto atualizada(s)).` : "."),
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={`Reajuste · ${contrato.descricao}`} aoFechar={aoFechar} largura="lg">
      {consulta.erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{consulta.erro}</p>}
      {!p ? (
        !consulta.erro && <Carregando />
      ) : !p.pendente ? (
        <>
          <p className="flex items-start gap-2 rounded-md bg-[var(--fundo)] p-3 text-sm">
            <Icone nome="calendario" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nada pendente agora. O próximo reajuste é em <strong>{mesExtenso(p.referencia)}</strong>
              {p.tipo === "fixo" ? ` (${pct(Number(p.percentual))} fixo).` : `, pelo ${p.indice} acumulado dos 12 meses anteriores.`}
            </span>
          </p>
          <div className="flex justify-end">
            <button className="btn" onClick={aoFechar}>
              Fechar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--texto-suave)]">
            Reajuste de <strong className="text-[var(--texto)]">{mesExtenso(p.referencia)}</strong>
            {p.tipo === "fixo"
              ? " · percentual fixo do contrato"
              : ` · ${p.indice} acumulado de ${fmtCompetencia(p.de)} a ${fmtCompetencia(p.ate)} (Banco Central)`}
          </p>
          {p.faltam.length > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-start gap-2">
                <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Ainda faltam os índices de {p.faltam.join(", ")}. O IBGE e a FGV divulgam o mês anterior por volta do dia 10. Busque de
                  novo mais tarde ou digite o percentual combinado.
                </span>
              </p>
              {podeOperar && (
                <button className="btn mt-2" onClick={buscar} disabled={buscando}>
                  <Icone nome="atualizar" className="h-4 w-4" />
                  {buscando ? "Buscando no Banco Central…" : "Buscar índices agora"}
                </button>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="cartao p-3">
              <p className="text-xs text-[var(--texto-suave)]">Valor atual</p>
              <p className="num text-lg font-semibold">{brl(Number(contrato.valor))}</p>
            </div>
            <label className="campo">
              <span>Reajuste (%)</span>
              <input
                value={campo}
                onChange={(e) => setDigitado(e.target.value)}
                inputMode="decimal"
                disabled={!podeOperar}
                placeholder="Ex.: 4,68"
                aria-describedby="origem-percentual"
              />
              <small id="origem-percentual" className="text-xs text-[var(--texto-suave)]">
                {mudouDaProposta
                  ? `Proposta do HUB: ${pct(Number(p.percentual))}`
                  : p.percentual != null
                    ? "Proposto pelo HUB"
                    : "Digite o percentual"}
              </small>
            </label>
            <div className="cartao border-[var(--destaque-escuro)] p-3">
              <p className="text-xs text-[var(--texto-suave)]">Novo valor</p>
              <p className="num text-lg font-semibold text-[var(--marca)]">{novo != null ? brl(novo) : "—"}</p>
            </div>
          </div>
          {p.contas_em_aberto.length > 0 && (
            <label className="flex items-start gap-2 rounded-md border border-[var(--borda)] p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={atualizar}
                onChange={(e) => setAtualizar(e.target.checked)}
                disabled={!podeOperar}
              />
              <span>
                Atualizar também as contas já lançadas deste ciclo que ainda estão em aberto (
                {p.contas_em_aberto.map((c) => `${fmtCompetencia(c.competencia)}: ${brl(Number(c.valor))}`).join("; ")}). Sem marcar, elas
                continuam como estão e o valor novo vale a partir da próxima conta.
              </span>
            </label>
          )}
          {podeOperar && (
            <label className="campo">
              <span>Observação (opcional)</span>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: reajuste negociado com o cliente" />
            </label>
          )}
          {p.indices_atualizados_em && (
            <p className="text-xs text-[var(--texto-suave)]">Índices atualizados em {fmtDataHora(p.indices_atualizados_em)}.</p>
          )}
          {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn" onClick={aoFechar}>
              {podeOperar ? "Agora não" : "Fechar"}
            </button>
            {podeOperar && (
              <button className="btn-primario" onClick={confirmar} disabled={ocupado || novo == null}>
                <Icone nome="check" className="h-4 w-4" />
                {ocupado ? "Confirmando…" : "Confirmar reajuste"}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
