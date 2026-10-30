"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { brl, fmtIndice } from "@/lib/balancete";
import { mesAno } from "@/components/demonstrativos/Painel";
import type { BalanceteReg } from "@/components/demonstrativos/Painel";
import { reprocessar } from "@/lib/demonstrativos";

export default function PaginaDemonstrativos() {
  return (
    <AppShell modulo="demonstrativos">
      <Lista />
    </AppShell>
  );
}

function Lista() {
  const { org, clientePorId, pode } = useOrg();
  const [lista, setLista] = useState<BalanceteReg[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [progresso, setProgresso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  async function reprocessarRascunhos() {
    const alvo = [...lista].filter((b) => b.status === "rascunho").sort((a, b) => a.competencia.localeCompare(b.competencia));
    if (!alvo.length || !confirm(`Reprocessar ${alvo.length} balancete(s) em rascunho com as regras atuais do leitor?`)) return;
    setErro(null);
    for (let i = 0; i < alvo.length; i++) {
      const c = clientePorId(alvo[i].cliente_id);
      setProgresso(`Reprocessando ${i + 1} de ${alvo.length}: ${c?.nome_fantasia || c?.razao_social || ""} ${alvo[i].competencia.slice(0, 7)}`);
      try {
        await reprocessar(alvo[i].id);
      } catch (e) {
        setErro(traduzirErro(e));
        break;
      }
    }
    setProgresso(null);
    setRecarga((x) => x + 1);
  }

  useEffect(() => {
    supabase()
      .from("portal_balancetes")
      .select("id,org_id,cliente_id,competencia,status,arquivo_nome,resumo,indices,alertas,conferencias,comentario,importado_em,publicado_em")
      .eq("org_id", org.id)
      .order("competencia", { ascending: false })
      .limit(2000)
      .then(({ data, error }) => (error ? setErro(traduzirErro(error)) : setLista(data as BalanceteReg[])));
  }, [org.id, recarga]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((b) => {
      if (status && b.status !== status) return false;
      if (q) {
        const c = clientePorId(b.cliente_id);
        if (!`${c?.razao_social} ${c?.nome_fantasia} ${c?.codigo_dominio}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [lista, busca, status, clientePorId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Balancetes e demonstrativos</h1>
        {pode("demonstrativos", "operar") && lista.some((b) => b.status === "rascunho") && (
          <button className="btn" onClick={reprocessarRascunhos} disabled={!!progresso} title="Relê as contas gravadas com as regras atuais: sinal, grupos e cálculos">
            Reprocessar rascunhos
          </button>
        )}
        {pode("demonstrativos", "operar") && (
          <Link href="/demonstrativos/importar" className="btn-primario">
            Importar balancete
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="entrada w-64" placeholder="Buscar empresa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="entrada" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="rascunho">A revisar e publicar</option>
          <option value="publicado">Publicados</option>
        </select>
      </div>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {progresso && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{progresso}</p>}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Competência</th>
              <th>Situação</th>
              <th className="text-right">Receita do mês</th>
              <th className="text-right">Resultado no ano</th>
              <th className="text-right">Liquidez corrente</th>
              <th>Fragilidades</th>
              <th>Conferências</th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((b) => {
              const c = clientePorId(b.cliente_id);
              const falhas = (b.conferencias ?? []).filter((x) => !x.ok).length;
              const altos = (b.alertas ?? []).filter((a) => a.nivel === "alto").length;
              return (
                <tr key={b.id} className="cursor-pointer hover:bg-[var(--fundo)]" onClick={() => (window.location.href = `/demonstrativos/${b.id}`)}>
                  <td className="font-medium">{c ? c.nome_fantasia || c.razao_social : "—"}</td>
                  <td>{mesAno(b.competencia)}</td>
                  <td>
                    {b.status === "publicado" ? (
                      <span className="chip bg-emerald-50 text-emerald-800">Publicado</span>
                    ) : (
                      <span className="chip bg-amber-50 text-amber-800">Rascunho</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{brl(b.resumo?.mes?.receita_bruta)}</td>
                  <td className={`text-right tabular-nums ${b.resumo?.ano?.lucro_liquido < 0 ? "text-[var(--perigo)]" : ""}`}>{brl(b.resumo?.ano?.lucro_liquido)}</td>
                  <td className="text-right tabular-nums">{fmtIndice(b.indices?.liquidez_corrente, "x")}</td>
                  <td>
                    {b.alertas?.length ? (
                      <span className={`chip ${altos ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                        {b.alertas.length}
                        {altos ? ` · ${altos} alto` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">nenhuma</span>
                    )}
                  </td>
                  <td>{falhas ? <span className="chip bg-red-50 text-red-700">{falhas} pendente(s)</span> : <span className="text-xs text-emerald-700">ok</span>}</td>
                </tr>
              );
            })}
            {filtrada.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-neutral-500">
                  Nenhum balancete ainda. Importe o primeiro em “Importar balancete”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
