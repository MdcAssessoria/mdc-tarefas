// Campo "Serviço conforme a LC 116": busca na lista anexa à Lei Complementar 116/2003 pelo número (17.19) ou por
// palavras (contabilidade); escolhido, mostra o subitem e a descrição e monta o código de tributação nacional da NFS-e
// (subitem + desdobramento, padrão 01: 17.19 → 17.19.01). Usado no item de serviço (Estoque) e no contrato.
// Também o CampoNbs (opcional), que carrega a lista NBS só quando a pessoa abre a busca.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icone } from "./Icone";
import {
  buscarLc116,
  codigoNacional,
  descricaoLc116,
  formatarCodigoNacional,
  formatarNbs,
  nbsDigitos,
  subitemDoCodigo,
} from "@/lib/fiscal/servicos";

/** Lista que fecha ao clicar fora (toque no celular incluído). */
function useListaAberta() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);
  return { aberto, setAberto, caixa };
}

export function CampoServico({
  rotulo = "Serviço conforme a Lei Complementar 116",
  valor,
  aoMudar,
  obrigatorio = false,
}: {
  rotulo?: string;
  /** Código de tributação nacional (171901 ou 17.19.01); vazio = nenhum escolhido. */
  valor: string;
  /** Devolve o código no formato 17.19.01 (vazio ao limpar) e a descrição do subitem. */
  aoMudar: (codigo: string, descricao: string | null) => void;
  obrigatorio?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [ativo, setAtivo] = useState(0);
  const { aberto, setAberto, caixa } = useListaAberta();
  const codigo = formatarCodigoNacional(valor);
  const subitem = subitemDoCodigo(codigo);
  const descricao = descricaoLc116(subitem);
  const resultados = buscarLc116(q, 15);

  function escolher(c: string, d: string) {
    aoMudar(codigoNacional(c), d);
    setQ("");
    setAberto(false);
  }

  if (codigo && descricao) {
    const desdobro = codigo.slice(-2);
    return (
      <div className="campo">
        <span>{rotulo}</span>
        <div className="rounded-md border border-[var(--borda)] bg-[var(--fundo)] p-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="chip shrink-0 bg-white font-semibold tabular-nums text-[var(--marca)]">{subitem}</span>
            <span className="min-w-0 flex-1">{descricao}</span>
            <button type="button" className="btn !min-h-8 shrink-0 !px-3" onClick={() => aoMudar("", null)}>
              Trocar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--texto-suave)]">
            <span>
              Código na NFS-e: <b className="tabular-nums text-[var(--marca)]">{codigo}</b>
            </span>
            <label className="flex items-center gap-1">
              desdobramento
              <input
                aria-label="Desdobramento do código nacional"
                className="w-14 rounded-md border border-[var(--borda)] px-2 py-1 text-center tabular-nums"
                inputMode="numeric"
                maxLength={2}
                value={desdobro}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 2);
                  if (d) aoMudar(codigoNacional(subitem!, d), descricao);
                }}
              />
            </label>
            <span>(quase sempre 01; mude só se a prefeitura pedir outro)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={caixa}>
      <label className="campo">
        <span>{rotulo}</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={id}
          aria-autocomplete="list"
          required={obrigatorio}
          value={q}
          placeholder="Digite o número (ex.: 17.19) ou o serviço (ex.: contabilidade)"
          onFocus={() => setAberto(true)}
          onClick={() => setAberto(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setAberto(true);
            setAtivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setAtivo((a) => Math.min(a + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const r = resultados[ativo];
              if (r) escolher(r[0], r[1]);
            } else if (e.key === "Escape" && aberto) {
              e.stopPropagation();
              setAberto(false);
            }
          }}
        />
        <small className="text-xs text-[var(--texto-suave)]">
          É o item da lista de serviços da LC 116. O HUB monta o código da nota fiscal (ex.: 17.19 Contabilidade → 17.19.01).
        </small>
      </label>
      {aberto && (
        <ul id={id} role="listbox" className="cartao absolute z-30 mt-1 max-h-72 w-full overflow-auto p-1 shadow-lg">
          {resultados.map(([c, d], k) => (
            <li key={c} role="option" aria-selected={k === ativo}>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(k)}
                onClick={() => escolher(c, d)}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm ${k === ativo ? "bg-amber-50" : ""}`}
              >
                <span className="w-12 shrink-0 font-semibold tabular-nums text-[var(--marca)]">{c}</span>
                <span className="min-w-0">{d}</span>
              </button>
            </li>
          ))}
          {!resultados.length && <li className="px-3 py-2 text-sm text-[var(--texto-suave)]">Nenhum serviço da LC 116 com esse texto.</li>}
        </ul>
      )}
    </div>
  );
}

type ListaNbs = [string, string][];
let cacheNbs: ListaNbs | null = null;

/** NBS (opcional): a lista (900 códigos) só é baixada quando a pessoa clica no campo. */
export function CampoNbs({ valor, aoMudar }: { valor: string; aoMudar: (nbs: string) => void }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<ListaNbs | null>(cacheNbs);
  const { aberto, setAberto, caixa } = useListaAberta();
  const d = nbsDigitos(valor);
  // editando um item que já tem NBS: baixa a lista para mostrar a descrição
  useEffect(() => {
    if (!d || cacheNbs) return;
    let vivo = true;
    void import("@/lib/fiscal/nbs").then((m) => {
      cacheNbs = m.default;
      if (vivo) setLista(m.default);
    });
    return () => {
      vivo = false;
    };
  }, [d]);

  async function carregar() {
    setAberto(true);
    if (lista) return;
    const m = await import("@/lib/fiscal/nbs");
    cacheNbs = m.default;
    setLista(m.default);
  }

  if (d) {
    const desc = lista?.find(([c]) => c.replace(/\D/g, "") === d)?.[1];
    return (
      <div className="campo">
        <span>NBS (opcional)</span>
        <div className="flex items-center gap-3 rounded-md border border-[var(--borda)] bg-[var(--fundo)] px-3 py-2 text-sm">
          <span className="chip shrink-0 bg-white font-semibold tabular-nums text-[var(--marca)]">{formatarNbs(d)}</span>
          <span className="min-w-0 flex-1 truncate">{desc ?? "Código NBS escolhido"}</span>
          <button type="button" className="btn !min-h-8 shrink-0 !px-3" onClick={() => aoMudar("")}>
            Trocar
          </button>
        </div>
      </div>
    );
  }

  const termo = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const resultados = (lista ?? [])
    .filter(([c, t]) => {
      if (!termo) return true;
      if (/^[\d.\s]+$/.test(termo)) return c.replace(/\D/g, "").startsWith(termo.replace(/\D/g, ""));
      const n = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return termo.split(/\s+/).every((p) => n.includes(p));
    })
    .slice(0, 15);

  return (
    <div className="relative" ref={caixa}>
      <label className="campo">
        <span>NBS (opcional)</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={id}
          aria-autocomplete="list"
          value={q}
          placeholder="Digite o código ou o serviço (ex.: contabilidade)"
          onFocus={carregar}
          onClick={carregar}
          onChange={(e) => {
            setQ(e.target.value);
            void carregar();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && aberto) {
              e.stopPropagation();
              setAberto(false);
            }
          }}
        />
        <small className="text-xs text-[var(--texto-suave)]">
          Nomenclatura Brasileira de Serviços. A reforma tributária (IBS/CBS) passa a pedir na nota; se não souber, deixe em branco.
        </small>
      </label>
      {aberto && (
        <ul id={id} role="listbox" className="cartao absolute z-30 mt-1 max-h-72 w-full overflow-auto p-1 shadow-lg">
          {!lista && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--texto-suave)]">
              <Icone nome="atualizar" className="h-4 w-4 animate-spin" /> Carregando a lista…
            </li>
          )}
          {resultados.map(([c, t]) => (
            <li key={c} role="option" aria-selected={false}>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  aoMudar(c.replace(/\D/g, ""));
                  setQ("");
                  setAberto(false);
                }}
                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-amber-50"
              >
                <span className="w-24 shrink-0 font-semibold tabular-nums text-[var(--marca)]">{c}</span>
                <span className="min-w-0">{t}</span>
              </button>
            </li>
          ))}
          {lista && !resultados.length && (
            <li className="px-3 py-2 text-sm text-[var(--texto-suave)]">Nenhum código NBS com esse texto.</li>
          )}
        </ul>
      )}
    </div>
  );
}
