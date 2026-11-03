// Regras dos tipos de entrada da MDC: o que cada tipo faz (estoque, conta a pagar) e a categoria padrão.
// Todos veem; só quem tem "gerir" no Financeiro muda (o banco confere em fis_salvar_tipo_entrada).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import type { Categoria } from "@/dominios/financeiro/tipos";
import { salvarTipoEntrada } from "../repositorio";
import { regraDoTipo, TIPOS_ENTRADA } from "../tiposEntrada";
import type { CodigoTipoEntrada } from "../tiposEntrada";
import type { TipoEntradaRegra } from "../tipos";

export function RegrasTipos({
  cliente,
  orgId,
  regras,
  categorias,
  podeGerir,
  avisar,
  aoMudar,
}: {
  cliente: string;
  orgId: string;
  regras: TipoEntradaRegra[];
  categorias: Categoria[];
  podeGerir: boolean;
  avisar: (t: string, tom?: "erro" | "sucesso") => void;
  aoMudar: () => void;
}) {
  const [ocupado, setOcupado] = useState<CodigoTipoEntrada | null>(null);
  const despesas = categorias.filter((c) => c.tipo === "despesa" && c.ativo);

  async function salvar(codigo: CodigoTipoEntrada, m: { movimenta_estoque?: boolean; gera_pagar?: boolean; categoria?: string | null }) {
    const atual = regraDoTipo(regras, codigo, cliente, orgId);
    setOcupado(codigo);
    try {
      await salvarTipoEntrada({
        cliente,
        codigo,
        movimenta_estoque: m.movimenta_estoque ?? atual.movimenta_estoque,
        gera_pagar: m.gera_pagar ?? atual.gera_pagar,
        categoria: m.categoria !== undefined ? m.categoria : atual.categoria_id,
      });
      avisar("Regra salva.");
      aoMudar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead>
          <tr>
            <th>Tipo de entrada</th>
            <th>Mexe no estoque?</th>
            <th>Gera conta a pagar?</th>
            <th>Categoria padrão</th>
          </tr>
        </thead>
        <tbody>
          {TIPOS_ENTRADA.map((t) => {
            const r = regraDoTipo(regras, t.codigo, cliente, orgId);
            return (
              <tr key={t.codigo} className={ocupado === t.codigo ? "opacity-60" : ""}>
                <td className="min-w-56">
                  <span className="font-medium">{t.nome}</span>
                  <span className="block text-xs text-neutral-500">{t.explicacao}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${t.nome}: mexe no estoque`}
                    checked={r.movimenta_estoque}
                    disabled={!podeGerir || !!ocupado}
                    onChange={(e) => salvar(t.codigo, { movimenta_estoque: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${t.nome}: gera conta a pagar`}
                    checked={r.gera_pagar}
                    disabled={!podeGerir || !!ocupado}
                    onChange={(e) => salvar(t.codigo, { gera_pagar: e.target.checked })}
                  />
                </td>
                <td className="min-w-48">
                  <select
                    aria-label={`${t.nome}: categoria padrão`}
                    value={r.categoria_id ?? ""}
                    disabled={!podeGerir || !!ocupado}
                    onChange={(e) => salvar(t.codigo, { categoria: e.target.value || null })}
                  >
                    <option value="">Escolher ao lançar</option>
                    {despesas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!podeGerir && <p className="p-3 text-xs text-neutral-500">Só quem gerencia o Financeiro muda estas regras. Se precisar, peça ao administrador.</p>}
    </div>
  );
}
