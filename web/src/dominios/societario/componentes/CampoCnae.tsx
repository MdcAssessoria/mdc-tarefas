// Busca de CNAE na lista oficial (CNAE-Subclasses do IBGE, a mesma da Receita) por código ou palavra. Cada resultado
// mostra se o regime escolhido aceita: "Não permitido" (Anexo VI do Simples ou art. 14 da Lei 9.718 no Presumido)
// vem desabilitado; "Analisar" (Anexo VII) pode ser escolhido, com aviso.
"use client";

import { useId, useMemo, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { formatarCnae } from "../abertura";
import type { CnaeEscolhido, Regime, RestricaoCnae } from "../abertura";
import { carregarCnaes, filtrarCnaes } from "../consultasAbertura";
import type { CnaeLista } from "../consultasAbertura";

export function CampoCnae({
  rotulo,
  regime,
  restricoes,
  ja,
  aoEscolher,
}: {
  rotulo: string;
  regime: Regime | null;
  restricoes: RestricaoCnae[];
  /** Códigos já escolhidos (não aparecem de novo). */
  ja: string[];
  aoEscolher: (c: CnaeEscolhido) => void;
}) {
  const id = useId();
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<CnaeLista[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrirLista() {
    if (lista || carregando) return;
    setCarregando(true);
    setErro(null);
    try {
      setLista(await carregarCnaes());
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setCarregando(false);
    }
  }

  const resultados = useMemo(
    () => (lista ? filtrarCnaes(lista, busca).filter((c) => !ja.includes(c.codigo)) : []),
    [lista, busca, ja],
  );
  const restricao = (codigo: string) =>
    regime && regime !== "real" ? restricoes.find((r) => r.codigo === codigo && r.regime === regime) : undefined;

  return (
    <div className="campo">
      <label htmlFor={id}>
        <span>{rotulo}</span>
      </label>
      <div className="relative">
        <Icone nome="busca" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--texto-suave)]" />
        <input
          id={id}
          className="w-full pl-8"
          value={busca}
          placeholder="Código ou atividade (ex.: 6920-6/01, contabilidade)"
          onFocus={abrirLista}
          onChange={(e) => {
            setBusca(e.target.value);
            void abrirLista();
          }}
          autoComplete="off"
        />
      </div>
      {carregando && <small className="text-xs text-[var(--texto-suave)]">Carregando a lista oficial de CNAE…</small>}
      {erro && (
        <small role="alert" className="text-xs text-red-700">
          {erro}
        </small>
      )}
      {busca.trim().length >= 2 && lista && (
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--borda)] bg-[var(--superficie)] text-sm" aria-label="CNAE encontrados">
          {resultados.length === 0 && <li className="px-3 py-2 text-[var(--texto-suave)]">Nenhum CNAE com esse código ou palavra.</li>}
          {resultados.map((c) => {
            const r = restricao(c.codigo);
            const bloqueado = r?.nivel === "impeditivo";
            return (
              <li key={c.codigo} className="border-b border-[var(--borda)] last:border-0">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--fundo)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={bloqueado}
                  title={r ? `${r.fundamento}` : undefined}
                  onClick={() => {
                    aoEscolher({ codigo: c.codigo, descricao: c.descricao });
                    setBusca("");
                  }}
                >
                  <span className="num shrink-0 font-medium">{formatarCnae(c.codigo)}</span>
                  <span className="min-w-0 flex-1">{c.descricao}</span>
                  {r && <Chip tom={bloqueado ? "vermelho" : "ambar"}>{bloqueado ? "Não permitido" : "Analisar"}</Chip>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
