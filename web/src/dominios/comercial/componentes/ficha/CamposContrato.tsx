// Ficha da oportunidade › Proposta e contrato: os valores negociados (contratante, valores, serviços, assinatura).
// O texto vem do modelo-base; aqui só os dados que mudam de cliente para cliente.
"use client";

import { useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { SERVICOS_PADRAO } from "../../crm";
import type { Valores } from "../../crm";

const Grupo = ({ titulo, icone, children }: { titulo: string; icone: string; children: React.ReactNode }) => (
  <fieldset className="space-y-2 rounded-lg border border-[var(--borda)] p-3">
    <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-[var(--marca)]">
      <Icone nome={icone} className="h-4 w-4" />
      {titulo}
    </legend>
    {children}
  </fieldset>
);

export function CamposContrato({ v, setV, editavel }: { v: Valores; setV: (v: Valores) => void; editavel: boolean }) {
  const [extra, setExtra] = useState("");
  const num = (k: keyof Valores) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value === "" ? 0 : Number(e.target.value) });
  const txt = (k: keyof Valores) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <fieldset disabled={!editavel} className="min-w-0 space-y-3">
      <Grupo titulo="Contratante" icone="pasta">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="campo">
            <span>Razão social</span>
            <input value={v.razao_social} onChange={txt("razao_social")} />
          </label>
          <label className="campo">
            <span>CNPJ</span>
            <input inputMode="numeric" value={v.cnpj} onChange={txt("cnpj")} />
          </label>
          <label className="campo sm:col-span-2">
            <span>Endereço completo</span>
            <input value={v.endereco} onChange={txt("endereco")} placeholder="Rua, número, bairro, CEP" />
          </label>
          <label className="campo">
            <span>Cidade/UF</span>
            <input value={v.cidade_uf} onChange={txt("cidade_uf")} />
          </label>
          <label className="campo">
            <span>Representante</span>
            <input value={v.representante} onChange={txt("representante")} />
          </label>
          <label className="campo sm:col-span-2">
            <span>Qualificação do representante</span>
            <input
              value={v.representante_qualificacao}
              onChange={txt("representante_qualificacao")}
              placeholder="sócio administrador, CPF nº …"
            />
          </label>
        </div>
      </Grupo>

      <Grupo titulo="Valores negociados" icone="moeda">
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          <label className="campo">
            <span>Honorário mensal (R$)</span>
            <input type="number" inputMode="decimal" step="0.01" value={v.honorario_mensal || ""} onChange={num("honorario_mensal")} />
          </label>
          <label className="campo">
            <span>Vencimento (dia do mês)</span>
            <input type="number" min={1} max={28} value={v.vencimento_dia} onChange={num("vencimento_dia")} />
          </label>
          <label className="campo">
            <span>Início dos serviços</span>
            <input type="date" value={v.inicio} onChange={txt("inicio")} />
          </label>
          <label className="campo">
            <span>Funcionários incluídos</span>
            <input type="number" min={0} value={v.funcionarios_incluidos} onChange={num("funcionarios_incluidos")} />
          </label>
          <label className="campo">
            <span>Por funcionário a mais (R$)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={v.valor_funcionario_adicional || ""}
              onChange={num("valor_funcionario_adicional")}
            />
          </label>
          <label className="campo">
            <span>Taxa de implantação (R$)</span>
            <input type="number" inputMode="decimal" step="0.01" value={v.taxa_implantacao || ""} onChange={num("taxa_implantacao")} />
          </label>
          <label className="campo">
            <span>Parcelas da implantação</span>
            <input type="number" min={1} value={v.parcelas_implantacao} onChange={num("parcelas_implantacao")} />
          </label>
          <label className="campo">
            <span>Reajuste anual pelo</span>
            <select value={v.reajuste_indice} onChange={txt("reajuste_indice")}>
              {[...new Set([v.reajuste_indice, "IPCA (IBGE)", "INPC (IBGE)", "IGP-M (FGV)", "salário mínimo nacional"])].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Vigência</span>
            <select value={v.vigencia} onChange={txt("vigencia")}>
              {[
                ...new Set([
                  v.vigencia,
                  "indeterminado",
                  "de 12 meses, renovável automaticamente",
                  "de 24 meses, renovável automaticamente",
                ]),
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Aviso prévio (dias)</span>
            <input type="number" min={0} value={v.aviso_previo} onChange={num("aviso_previo")} />
          </label>
          <label className="campo">
            <span>Documentos até o dia</span>
            <input type="number" min={1} max={28} value={v.prazo_documentos} onChange={num("prazo_documentos")} />
          </label>
          <label
            className="flex min-h-10 items-center gap-2 self-end text-sm"
            title="Honorário extra em dezembro pelo encerramento do exercício"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--marca)]"
              checked={v.decimo_terceiro}
              onChange={(e) => setV({ ...v, decimo_terceiro: e.target.checked })}
            />
            Cobra 13º honorário
          </label>
        </div>
      </Grupo>

      <Grupo titulo="Serviços contratados" icone="lista">
        <div className="space-y-1.5">
          {[...new Set([...SERVICOS_PADRAO, ...v.servicos])].map((s) => (
            <label key={s} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--marca)]"
                checked={v.servicos.includes(s)}
                onChange={(e) => setV({ ...v, servicos: e.target.checked ? [...v.servicos, s] : v.servicos.filter((x) => x !== s) })}
              />
              {s}
            </label>
          ))}
          {editavel && (
            <div className="flex gap-2 pt-1">
              <input
                className="entrada min-w-0 flex-1"
                aria-label="Outro serviço"
                placeholder="Outro serviço…"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
              <button
                type="button"
                className="btn shrink-0"
                disabled={!extra.trim()}
                onClick={() => {
                  setV({ ...v, servicos: [...v.servicos, extra.trim()] });
                  setExtra("");
                }}
              >
                <Icone nome="mais" className="h-4 w-4" />
                Incluir
              </button>
            </div>
          )}
        </div>
      </Grupo>

      <Grupo titulo="Assinatura" icone="editar">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="campo">
            <span>Cidade da assinatura</span>
            <input value={v.cidade_assinatura} onChange={txt("cidade_assinatura")} />
          </label>
          <label className="campo">
            <span>Data da assinatura</span>
            <input type="date" value={v.data_assinatura} onChange={txt("data_assinatura")} />
          </label>
        </div>
      </Grupo>
    </fieldset>
  );
}
