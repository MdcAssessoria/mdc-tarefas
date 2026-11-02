// Ficha da oportunidade › Dados: cadastro da empresa e do contato, valores e próximo retorno, e as respostas do
// Simulador de Regime quando o lead veio de lá. Recebe a oportunidade já lida; quem usa recria com key ao recarregar.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { REGIMES } from "@/dominios/clientes/tipos";
import type { Oportunidade } from "../../crm";
import { atualizarOportunidade } from "../../repositorio";

const ROT_SIM: Record<string, string> = {
  melhor_regime: "Melhor regime (simulador)",
  economia_estimada: "Economia estimada/ano",
  carga_pct_melhor: "Carga no melhor regime",
  folha: "Folha anual",
  compras: "Compras anuais",
  margem: "Margem",
  pct_b2b: "Vendas para empresas",
  cnae: "CNAE",
  cnae_descricao: "Atividade (CNAE)",
  porte: "Porte",
  situacao_cadastral: "Situação cadastral",
};

function fmtSim(k: string, v: unknown) {
  if (typeof v === "number") {
    if (["margem", "pct_b2b", "carga_pct_melhor"].includes(k)) return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    if (["folha", "compras", "economia_estimada"].includes(k)) return brl(v);
    return String(v);
  }
  return k === "melhor_regime" ? (REGIMES.find((r) => r.id === v)?.nome ?? String(v)) : String(v);
}

/** Campos que a tela pode gravar (o resto muda por função do banco ou gatilho). */
const EDITAVEIS = [
  "empresa",
  "razao_social",
  "cnpj",
  "contato_nome",
  "whatsapp",
  "email",
  "cidade",
  "uf",
  "regime_atual",
  "faturamento",
  "valor_mensal",
  "proximo_contato",
  "responsavel_id",
  "observacoes",
] as const;

export function DadosOportunidade({
  o,
  podeOperar,
  membros,
  aoSalvar,
}: {
  o: Oportunidade;
  podeOperar: boolean;
  membros: { user_id: string; nome: string; ativo: boolean }[];
  aoSalvar: (msg: string, tom?: "erro" | "sucesso") => void;
}) {
  const [f, setF] = useState(o);
  const [ocupado, setOcupado] = useState(false);
  const alterado = EDITAVEIS.some((k) => (f[k] ?? null) !== (o[k] ?? null));

  const campo = (k: (typeof EDITAVEIS)[number], rot: string, tipo = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="campo">
      <span>{rot}</span>
      <input
        type={tipo}
        disabled={!podeOperar}
        value={(f[k] as string | number | null) ?? ""}
        onChange={(e) =>
          setF({ ...f, [k]: tipo === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null })
        }
        {...extra}
      />
    </label>
  );
  const sim = o.dados_origem ? Object.entries(o.dados_origem).filter(([k]) => k in ROT_SIM) : [];

  async function salvar() {
    setOcupado(true);
    try {
      const campos = Object.fromEntries(EDITAVEIS.map((k) => [k, f[k] ?? null])) as Partial<Oportunidade>;
      campos.uf = campos.uf ? campos.uf.toUpperCase() : null;
      if (!campos.empresa?.trim()) throw new Error("Informe o nome da empresa.");
      await atualizarOportunidade(o.id, campos);
      aoSalvar("Dados salvos.");
    } catch (e) {
      aoSalvar(traduzirErro(e), "erro");
      setOcupado(false);
    }
  }

  return (
    <section className="cartao space-y-4 p-4" aria-labelledby="dados-titulo">
      <h2 id="dados-titulo" className="flex items-center gap-2 font-semibold text-[var(--marca)]">
        <Icone nome="pasta" className="h-5 w-5" />
        Dados da oportunidade
      </h2>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Empresa</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {campo("empresa", "Nome (como é conhecida)")}
          {campo("razao_social", "Razão social")}
          {campo("cnpj", "CNPJ", "text", { inputMode: "numeric" })}
          <label className="campo">
            <span>Regime atual</span>
            <select
              disabled={!podeOperar}
              value={f.regime_atual ?? ""}
              onChange={(e) => setF({ ...f, regime_atual: e.target.value || null })}
            >
              <option value="">—</option>
              {REGIMES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
              <option value="nao_sei">Não sabe</option>
            </select>
          </label>
          {campo("cidade", "Cidade")}
          {campo("uf", "UF", "text", { maxLength: 2 })}
          {campo("faturamento", "Faturamento anual (R$)", "number", { inputMode: "decimal" })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Contato</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {campo("contato_nome", "Nome do contato")}
          {campo("whatsapp", "WhatsApp", "text", { inputMode: "tel" })}
          <div className="sm:col-span-2">{campo("email", "E-mail", "email")}</div>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Negociação</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {campo("valor_mensal", "Honorário proposto (R$/mês)", "number", { inputMode: "decimal" })}
          {campo("proximo_contato", "Próximo retorno", "date")}
          <label className="campo sm:col-span-2">
            <span>Responsável</span>
            <select
              disabled={!podeOperar}
              value={f.responsavel_id ?? ""}
              onChange={(e) => setF({ ...f, responsavel_id: e.target.value || null })}
            >
              <option value="">Sem responsável</option>
              {membros
                .filter((m) => m.ativo || m.user_id === f.responsavel_id)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Observações</span>
          <textarea
            rows={3}
            disabled={!podeOperar}
            value={f.observacoes ?? ""}
            onChange={(e) => setF({ ...f, observacoes: e.target.value || null })}
          />
        </label>
      </fieldset>

      {podeOperar && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {alterado && <span className="text-xs text-amber-800">Há mudanças não salvas</span>}
          <button className="btn-primario" onClick={salvar} disabled={!alterado || ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar dados"}
          </button>
        </div>
      )}

      {sim.length > 0 && (
        <div className="rounded-lg bg-[var(--fundo)] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Icone nome="grafico" className="h-4 w-4" />
            Respostas do Simulador de Regime
          </h3>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {sim.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-[var(--borda)] py-1 last:border-0">
                <dt className="text-[var(--texto-suave)]">{ROT_SIM[k]}</dt>
                <dd className="text-right font-medium">{fmtSim(k, v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
