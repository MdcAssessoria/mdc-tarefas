// Janelas do contrato: reajustar (percentual do índice, prévia do valor novo), encerrar (data e motivo) e histórico
// (reajustes, encerramento e mensalidades do contrato).
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { useConsulta } from "@/lib/useConsulta";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { numeroBr } from "@/dominios/financeiro/regras";
import { aplicarReajuste, SITUACOES, situacaoDaCobranca } from "../regras";
import { encerrarContrato, reajustarContrato } from "../repositorio";
import { lerReajustes } from "../leituras";
import { INDICES } from "../tipos";
import type { Cobranca, Contrato } from "../tipos";

export function ReajustarContrato({
  contrato,
  cliente,
  aoFechar,
  aoSalvar,
}: {
  contrato: Contrato;
  cliente: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [pct, setPct] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const p = numeroBr(pct);
  const novo = Number.isNaN(p) ? null : aplicarReajuste(contrato.valor_mensal, p);
  const indice = INDICES.find((i) => i.id === contrato.reajuste_indice)?.nome ?? contrato.reajuste_indice;

  async function salvar() {
    if (!pct.trim() || Number.isNaN(p) || p === 0) return setErro("Informe o percentual do reajuste (ex.: 4,5).");
    setSalvando(true);
    try {
      const v = await reajustarContrato(contrato.id, p, obs.trim() || null);
      aoSalvar(`Reajuste aplicado. Novo valor: ${brl(Number(v))} por mês, a partir da próxima mensalidade gerada.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Reajustar contrato"
      descricao={`${cliente} · hoje ${brl(contrato.valor_mensal)} por mês · índice ${indice}`}
      aoFechar={aoFechar}
    >
      <label className="campo">
        <span>Percentual do reajuste (%)</span>
        <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ex.: 4,5" autoFocus />
      </label>
      <p className="text-xs text-neutral-600">Use o acumulado de 12 meses do índice. As mensalidades já geradas não mudam.</p>
      {novo != null && pct.trim() && (
        <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
          Novo valor: <b>{brl(novo)}</b> por mês ({novo >= contrato.valor_mensal ? "+" : ""}
          {brl(novo - contrato.valor_mensal)}).
        </p>
      )}
      <label className="campo">
        <span>Observação (opcional)</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: IPCA acumulado até setembro" />
      </label>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Aguarde…" : "Aplicar reajuste"}
        </button>
      </div>
    </Modal>
  );
}

export function EncerrarContrato({
  contrato,
  cliente,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  contrato: Contrato;
  cliente: string;
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [data, setData] = useState(hoje < contrato.inicio ? contrato.inicio : hoje);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!data) return setErro("Informe a data do encerramento.");
    if (!motivo.trim()) return setErro("Escreva o motivo. Ele fica guardado no histórico.");
    setSalvando(true);
    try {
      const n = await encerrarContrato(contrato.id, data, motivo.trim());
      aoSalvar(n ? `Contrato encerrado. ${n} mensalidade(s) de meses seguintes cancelada(s).` : "Contrato encerrado.");
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Encerrar contrato"
      descricao={`${cliente}. Depois da data, o cliente deixa de acessar estes módulos no Portal; os dados ficam guardados.`}
      aoFechar={aoFechar}
    >
      <label className="campo">
        <span>Encerrar em</span>
        <input type="date" value={data} min={contrato.inicio} onChange={(e) => setData(e.target.value)} />
      </label>
      <label className="campo">
        <span>Motivo</span>
        <textarea
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: cliente pediu para cancelar o Financeiro"
        />
      </label>
      <p className="text-xs text-neutral-600">
        As mensalidades em aberto de meses depois do encerramento são canceladas. O mês do encerramento continua cobrado.
      </p>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario !border-[var(--perigo)] !bg-[var(--perigo)]" onClick={salvar} disabled={salvando}>
          {salvando ? "Aguarde…" : "Encerrar contrato"}
        </button>
      </div>
    </Modal>
  );
}

export function HistoricoContrato({
  contrato,
  cliente,
  cobrancas,
  hoje,
  aoFechar,
}: {
  contrato: Contrato;
  cliente: string;
  cobrancas: Cobranca[];
  hoje: string;
  aoFechar: () => void;
}) {
  const { org } = useOrg();
  const reajustes = useConsulta(
    useCallback(async () => (await lerReajustes(org.id)).filter((r) => r.contrato_id === contrato.id), [org.id, contrato.id]),
  );
  const minhas = cobrancas.filter((c) => c.contrato_id === contrato.id).sort((a, b) => b.competencia.localeCompare(a.competencia));
  return (
    <Modal titulo="Histórico do contrato" descricao={cliente} aoFechar={aoFechar} largura="xl">
      <section className="space-y-1 text-sm">
        <h3 className="font-medium">Contrato</h3>
        <p>
          Cadastrado em {fmtData(contrato.criado_em)} · início {fmtData(contrato.inicio)}
          {contrato.fim ? ` · fim ${fmtData(contrato.fim)}` : ""}
        </p>
        {contrato.situacao === "encerrado" && (
          <p className="text-red-800">
            Encerrado em {fmtData(contrato.encerrado_em)}: {contrato.encerrado_motivo}
          </p>
        )}
        {contrato.observacao && <p className="text-neutral-600">Obs.: {contrato.observacao}</p>}
      </section>
      <section className="space-y-1 text-sm">
        <h3 className="font-medium">Reajustes</h3>
        {reajustes.carregando && !reajustes.dados ? (
          <Carregando />
        ) : reajustes.dados?.length ? (
          <ul className="list-disc pl-5">
            {reajustes.dados.map((r) => (
              <li key={r.id}>
                {fmtData(r.data)}: {r.indice} {r.percentual.toLocaleString("pt-BR")}% · {brl(r.valor_antes)} → {brl(r.valor_depois)}
                {r.observacao ? ` (${r.observacao})` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-500">Nenhum reajuste ainda.</p>
        )}
      </section>
      <section className="space-y-1 text-sm">
        <h3 className="font-medium">Mensalidades ({minhas.length})</h3>
        <div className="max-h-64 overflow-y-auto">
          <table className="tabela">
            <tbody>
              {minhas.map((c) => {
                const s = situacaoDaCobranca(c, hoje);
                return (
                  <tr key={c.id}>
                    <td>{fmtCompetencia(c.competencia)}</td>
                    <td className="text-right tabular-nums">{brl(c.valor)}</td>
                    <td>
                      <span className={`chip ${SITUACOES[s].tom}`}>{SITUACOES[s].nome}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex justify-end pt-2">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
