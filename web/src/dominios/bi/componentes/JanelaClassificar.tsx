// Janela "Classificar categoria": a equipe MDC escolhe a conta do plano do BI para uma categoria do Omie (e, se quiser,
// para a mesma categoria nas outras empresas do grupo). Grava por bi_excecao_salvar (105), que guarda o histórico.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { gruposDoPlano } from "../classificacao";
import { salvarClassificacao } from "../dados";
import type { CategoriaClassificacao, ContaPlano } from "../dados";

export function JanelaClassificar({
  cat,
  outras,
  plano,
  nomes,
  clientes,
  aoGravar,
  aoFechar,
}: {
  cat: CategoriaClassificacao;
  /** A mesma categoria (código e nome) nas outras empresas escolhidas. */
  outras: CategoriaClassificacao[];
  plano: ContaPlano[];
  /** Nome das linhas do relatório: "dre:custos" → "(−) Custo dos produtos e serviços". */
  nomes: Map<string, string>;
  clientes: string[];
  aoGravar: (n: number) => void;
  aoFechar: () => void;
}) {
  const [conta, setConta] = useState(cat.conta && cat.conta !== "9.9.02" ? cat.conta : "");
  const [todas, setTodas] = useState(outras.length > 0);
  const [obs, setObs] = useState(cat.observacao ?? "");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const escolhida = plano.find((p) => p.codigo === conta);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!conta) return setErro("Escolha a conta do plano.");
    setOcupado(true);
    try {
      const n = await salvarClassificacao(clientes, cat.cliente_id, cat.categoria_codigo, conta, todas, obs.trim() || null);
      aoGravar(n);
    } catch (x) {
      setErro(traduzirErro(x));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Classificar categoria"
      descricao={`${cat.empresa} · ${cat.categoria_codigo} ${cat.descricao ?? ""} · ${brl(Number(cat.valor))} no período`}
      largura="2xl"
      aoFechar={aoFechar}
      avisoRodape={
        erro ? (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null
      }
      rodape={
        <>
          <button type="submit" form="bi-classificar" className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Gravando…" : "Gravar classificação"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="bi-classificar" onSubmit={salvar} className="space-y-3">
        <label className="campo">
          <span>Conta do plano</span>
          <select required value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Escolha…</option>
            {gruposDoPlano(plano).map((g) => (
              <optgroup key={g.tipo} label={g.nome}>
                {g.contas.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.codigo} · {p.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {escolhida && (
          <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
            {escolhida.linha_dre ? (
              <>
                Entra na DRE em <strong>{nomes.get(`dre:${escolhida.linha_dre}`) ?? escolhida.linha_dre}</strong>
              </>
            ) : (
              <>Não entra na DRE</>
            )}
            {" · "}
            {escolhida.linha_dfc ? (
              <>
                no fluxo de caixa em <strong>{nomes.get(`dfc:${escolhida.linha_dfc}`) ?? escolhida.linha_dfc}</strong>
                {escolhida.linha_dfc_entrada && (
                  <>
                    {" "}
                    (o que entra vai para <strong>{nomes.get(`dfc:${escolhida.linha_dfc_entrada}`) ?? escolhida.linha_dfc_entrada}</strong>)
                  </>
                )}
              </>
            ) : (
              <>não entra no fluxo de caixa</>
            )}
            .
          </p>
        )}
        {outras.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            <span>Aplicar também em {outras.map((o) => o.empresa).join(", ")} (mesma categoria, com o mesmo nome).</span>
          </label>
        )}
        <label className="campo">
          <span>Observação (opcional)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: conferido com o contador"
          />
        </label>
        <p className="text-xs text-[var(--texto-suave)]">
          A classificação vale para todos os relatórios do BI (passados e futuros) e fica no histórico com o seu nome.
        </p>
      </form>
    </Modal>
  );
}
