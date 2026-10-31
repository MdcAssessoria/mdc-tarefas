"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MultiSelecao } from "@/components/MultiSelecao";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { fmtData, hojeISO } from "@/lib/datas";
import { carregarLogo } from "@/lib/marca";
import { baixarBytes } from "@/lib/contratoPdf";
import { exportarExcel } from "@/lib/excel";
import { gerarRelatorioPdf } from "@/lib/relatorioPdf";

export default function PaginaRelatorio() {
  return (
    <AppShell>
      <Relatorio />
    </AppShell>
  );
}

interface Concluida {
  id: string;
  titulo: string;
  cliente_id: string | null;
  setor_id: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  concluida_em: string;
  competencia: string | null;
}
interface Aberta {
  responsavel_id: string | null;
  prazo: string | null;
}
interface PorPessoa {
  id: string;
  nome: string;
  total: number;
  noPrazo: number;
  atrasadas: number;
  semPrazo: number;
  diasAtrasoMedio: number | null;
  abertas: number;
  vencidasHoje: number;
}

type Periodo = "mes" | "mes_anterior" | "trimestre" | "ano" | "livre";

const VERDE_OK = "#1B8263",
  OURO = "#C0892A";

function intervalo(p: Periodo, hoje: string): [string, string] {
  const [a, m] = hoje.split("-").map(Number);
  const iso = (y: number, mm: number, d: number) => new Date(Date.UTC(y, mm - 1, d)).toISOString().slice(0, 10);
  if (p === "mes") return [iso(a, m, 1), hoje];
  if (p === "mes_anterior") return [iso(a, m - 1, 1), iso(a, m, 0)];
  if (p === "trimestre") return [iso(a, m - 2, 1), hoje];
  return [iso(a, 1, 1), hoje];
}

function Relatorio() {
  const { org, eu, membros, setores, clientePorId, setorPorId, podeEditarCadastros } = useOrg();
  const hoje = hojeISO(org.fuso);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState(() => intervalo("mes", hoje)[0]);
  const [ate, setAte] = useState(hoje);
  const [pessoasSel, setPessoasSel] = useState<string[]>(podeEditarCadastros ? [] : [eu.user_id]);
  const [setorSel, setSetorSel] = useState<string[]>([]);
  const [feitas, setFeitas] = useState<Concluida[] | null>(null);
  const [abertas, setAbertas] = useState<Aberta[]>([]);
  const [foco, setFoco] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState<"pdf" | "xlsx" | null>(null);
  const soEu = !podeEditarCadastros; // analista vê só o próprio relatório

  useEffect(() => {
    if (periodo === "livre") return;
    const [d, a] = intervalo(periodo, hoje);
    setDe(d);
    setAte(a);
  }, [periodo, hoje]);

  const carregar = useCallback(async () => {
    setFeitas(null);
    setErro(null);
    const sb = supabase();
    const fim = new Date(Date.parse(ate + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
    // concluídas no período (paginado de 1000 em 1000)
    const todas: Concluida[] = [];
    for (let p = 0; p < 30; p++) {
      let q = sb
        .from("tarefas")
        .select("id,titulo,cliente_id,setor_id,responsavel_id,prazo,concluida_em,competencia")
        .eq("org_id", org.id)
        .eq("status", "concluida")
        .gte("concluida_em", de + "T03:00:00Z")
        .lt("concluida_em", fim + "T03:00:00Z")
        .order("concluida_em")
        .range(p * 1000, p * 1000 + 999);
      if (soEu) q = q.eq("responsavel_id", eu.user_id);
      const { data, error } = await q;
      if (error) return setErro(traduzirErro(error));
      todas.push(...((data as Concluida[]) ?? []));
      if ((data ?? []).length < 1000) break;
    }
    let qa = sb
      .from("tarefas")
      .select("responsavel_id,prazo")
      .eq("org_id", org.id)
      .in("status", ["a_fazer", "em_andamento", "aguardando"])
      .limit(5000);
    if (soEu) qa = qa.eq("responsavel_id", eu.user_id);
    const ab = await qa;
    setAbertas((ab.data as Aberta[]) ?? []);
    setFeitas(todas);
  }, [org.id, de, ate, soEu, eu.user_id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // data local (fuso da organização) em que foi concluída
  const diaLocal = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: org.fuso }), [org.fuso]);
  const diasAtraso = useCallback(
    (t: Concluida) => (t.prazo ? Math.round((Date.parse(diaLocal(t.concluida_em)) - Date.parse(t.prazo)) / 864e5) : null),
    [diaLocal],
  );

  const filtradas = useMemo(
    () =>
      (feitas ?? []).filter(
        (t) =>
          (!pessoasSel.length || pessoasSel.includes(t.responsavel_id ?? "_sem")) &&
          (!setorSel.length || setorSel.includes(t.setor_id ?? "_sem")),
      ),
    [feitas, pessoasSel, setorSel],
  );

  const nomePessoa = useCallback(
    (id: string | null) => (id ? (membros.find((m) => m.user_id === id)?.nome ?? "Pessoa removida") : "Sem responsável"),
    [membros],
  );

  const porPessoa = useMemo<PorPessoa[]>(() => {
    const m = new Map<string, PorPessoa & { somaAtraso: number }>();
    const base = (id: string) =>
      m.get(id) ?? {
        id,
        nome: nomePessoa(id === "_sem" ? null : id),
        total: 0,
        noPrazo: 0,
        atrasadas: 0,
        semPrazo: 0,
        diasAtrasoMedio: null,
        abertas: 0,
        vencidasHoje: 0,
        somaAtraso: 0,
      };
    for (const t of filtradas) {
      const k = t.responsavel_id ?? "_sem";
      const p = base(k);
      p.total++;
      const d = diasAtraso(t);
      if (d === null) p.semPrazo++;
      else if (d <= 0) p.noPrazo++;
      else {
        p.atrasadas++;
        p.somaAtraso += d;
      }
      m.set(k, p);
    }
    for (const a of abertas) {
      const k = a.responsavel_id ?? "_sem";
      if (pessoasSel.length && !pessoasSel.includes(k)) continue;
      if (!m.has(k) && !membros.some((x) => x.user_id === k && x.ativo)) continue;
      const p = base(k);
      p.abertas++;
      if (a.prazo && a.prazo < hoje) p.vencidasHoje++;
      m.set(k, p);
    }
    return [...m.values()]
      .map((p) => ({ ...p, diasAtrasoMedio: p.atrasadas ? p.somaAtraso / p.atrasadas : null }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [filtradas, abertas, pessoasSel, membros, nomePessoa, diasAtraso, hoje]);

  const tot = porPessoa.reduce(
    (a, p) => ({
      total: a.total + p.total,
      noPrazo: a.noPrazo + p.noPrazo,
      atrasadas: a.atrasadas + p.atrasadas,
      semPrazo: a.semPrazo + p.semPrazo,
      abertas: a.abertas + p.abertas,
      vencidas: a.vencidas + p.vencidasHoje,
    }),
    { total: 0, noPrazo: 0, atrasadas: 0, semPrazo: 0, abertas: 0, vencidas: 0 },
  );
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const max = Math.max(1, ...porPessoa.map((p) => p.total));
  const detalhe = foco ? filtradas.filter((t) => (t.responsavel_id ?? "_sem") === foco) : filtradas;
  const titulo = soEu ? `Tarefas concluídas · ${eu.nome}` : "Tarefas concluídas por pessoa";
  const subtitulo = `Período: ${fmtData(de)} a ${fmtData(ate)}${setorSel.length ? ` · setores: ${setorSel.map((s) => setorPorId(s)?.nome ?? "sem setor").join(", ")}` : ""}${
    pessoasSel.length && !soEu ? ` · pessoas: ${pessoasSel.map((p) => nomePessoa(p === "_sem" ? null : p)).join(", ")}` : ""
  }`;
  const nomeCli = (id: string | null) => {
    const c = clientePorId(id);
    return c ? c.nome_fantasia || c.razao_social : "Interna";
  };
  const situacao = (t: Concluida) => {
    const d = diasAtraso(t);
    return d === null ? "Sem prazo" : d <= 0 ? "No prazo" : `${d} dia(s) de atraso`;
  };

  async function exportarPdf() {
    setExportando("pdf");
    try {
      const bytes = await gerarRelatorioPdf({
        titulo,
        subtitulo: `${subtitulo}. No prazo = concluída até a data do prazo. Abertas e vencidas = situação de hoje (${fmtData(hoje)}).`,
        logo: await carregarLogo(org.logo_url),
        secoes: [
          {
            titulo: "Resumo por pessoa",
            colunas: [
              { titulo: "Pessoa", peso: 2.4 },
              { titulo: "Concluídas", peso: 1.2, direita: true },
              { titulo: "No prazo", peso: 1.1, direita: true },
              { titulo: "Atrasadas", peso: 1.15, direita: true },
              { titulo: "% prazo", peso: 1, direita: true },
              { titulo: "Atraso méd.", peso: 1.2, direita: true },
              { titulo: "Abertas", peso: 1, direita: true },
              { titulo: "Vencidas", peso: 1.1, direita: true },
            ],
            barras: porPessoa
              .filter((p) => p.total)
              .map((p) => ({
                rotulo: p.nome,
                partes: [
                  { valor: p.noPrazo + p.semPrazo, cor: "verde" as const },
                  { valor: p.atrasadas, cor: "ouro" as const },
                ],
              })),
            linhas: [
              ...porPessoa.map((p) => ({
                celulas: [
                  p.nome,
                  String(p.total),
                  String(p.noPrazo),
                  String(p.atrasadas),
                  pct(p.noPrazo, p.noPrazo + p.atrasadas),
                  p.diasAtrasoMedio ? `${p.diasAtrasoMedio.toFixed(1)} d` : "—",
                  String(p.abertas),
                  String(p.vencidasHoje),
                ],
                alerta: [false, false, false, p.atrasadas > 0, false, false, false, p.vencidasHoje > 0],
              })),
              {
                celulas: [
                  "Total",
                  String(tot.total),
                  String(tot.noPrazo),
                  String(tot.atrasadas),
                  pct(tot.noPrazo, tot.noPrazo + tot.atrasadas),
                  "",
                  String(tot.abertas),
                  String(tot.vencidas),
                ],
                negrito: true,
                fundo: true,
              },
            ],
            texto: "Barras: verde = concluídas no prazo (ou sem prazo); dourado = concluídas com atraso.",
          },
          {
            titulo: foco ? `Tarefas concluídas · ${nomePessoa(foco === "_sem" ? null : foco)}` : "Tarefas concluídas",
            colunas: [
              { titulo: "Concluída", peso: 1.25 },
              { titulo: "Tarefa", peso: 3.2 },
              { titulo: "Cliente", peso: 2.1 },
              ...(soEu ? [] : [{ titulo: "Responsável", peso: 1.8 }]),
              { titulo: "Prazo", peso: 1.25 },
              { titulo: "Situação", peso: 1.75 },
            ],
            linhas: detalhe.map((t) => {
              const d = diasAtraso(t);
              const cels = [
                fmtData(diaLocal(t.concluida_em)),
                t.titulo,
                nomeCli(t.cliente_id),
                ...(soEu ? [] : [nomePessoa(t.responsavel_id)]),
                fmtData(t.prazo),
                situacao(t),
              ];
              return { celulas: cels, alerta: cels.map((_, i) => i === cels.length - 1 && d !== null && d > 0) };
            }),
          },
        ],
      });
      baixarBytes(bytes, `Relatorio-tarefas-${de}-a-${ate}.pdf`);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setExportando(null);
    }
  }

  async function exportarXlsx() {
    setExportando("xlsx");
    try {
      await exportarExcel(`Relatorio-tarefas-${de}-a-${ate}.xlsx`, titulo, subtitulo, [
        {
          nome: "Resumo por pessoa",
          colunas: [
            { titulo: "Pessoa", chave: "nome", largura: 32 },
            { titulo: "Concluídas", chave: "total", formato: "numero", largura: 12 },
            { titulo: "No prazo", chave: "noPrazo", formato: "numero", largura: 11 },
            { titulo: "Com atraso", chave: "atrasadas", formato: "numero", largura: 12 },
            { titulo: "Sem prazo", chave: "semPrazo", formato: "numero", largura: 11 },
            { titulo: "% no prazo", chave: "pct", formato: "percentual", largura: 11 },
            { titulo: "Atraso médio (dias)", chave: "atraso", largura: 16 },
            { titulo: "Abertas hoje", chave: "abertas", formato: "numero", largura: 13 },
            { titulo: "Vencidas hoje", chave: "vencidas", formato: "numero", largura: 13 },
          ],
          linhas: porPessoa.map((p) => ({
            nome: p.nome,
            total: p.total,
            noPrazo: p.noPrazo,
            atrasadas: p.atrasadas,
            semPrazo: p.semPrazo,
            pct: p.noPrazo + p.atrasadas ? p.noPrazo / (p.noPrazo + p.atrasadas) : null,
            atraso: p.diasAtrasoMedio ? Number(p.diasAtrasoMedio.toFixed(1)) : null,
            abertas: p.abertas,
            vencidas: p.vencidasHoje,
          })),
          totais: {
            nome: "Total",
            total: tot.total,
            noPrazo: tot.noPrazo,
            atrasadas: tot.atrasadas,
            semPrazo: tot.semPrazo,
            pct: tot.noPrazo + tot.atrasadas ? tot.noPrazo / (tot.noPrazo + tot.atrasadas) : null,
            abertas: tot.abertas,
            vencidas: tot.vencidas,
          },
        },
        {
          nome: "Tarefas concluídas",
          colunas: [
            { titulo: "Concluída em", chave: "em", formato: "data", largura: 13 },
            { titulo: "Tarefa", chave: "titulo", largura: 48 },
            { titulo: "Cliente", chave: "cliente", largura: 34 },
            { titulo: "Responsável", chave: "resp", largura: 26 },
            { titulo: "Setor", chave: "setor", largura: 16 },
            { titulo: "Competência", chave: "comp", formato: "data", largura: 13 },
            { titulo: "Prazo", chave: "prazo", formato: "data", largura: 12 },
            { titulo: "Dias de atraso", chave: "atraso", formato: "numero", largura: 13 },
            { titulo: "Situação", chave: "sit", largura: 18 },
          ],
          linhas: filtradas.map((t) => {
            const d = diasAtraso(t);
            return {
              em: diaLocal(t.concluida_em),
              titulo: t.titulo,
              cliente: nomeCli(t.cliente_id),
              resp: nomePessoa(t.responsavel_id),
              setor: setorPorId(t.setor_id)?.nome ?? "",
              comp: t.competencia,
              prazo: t.prazo,
              atraso: d !== null && d > 0 ? d : 0,
              sit: situacao(t),
            };
          }),
        },
      ]);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setExportando(null);
    }
  }

  const pessoas = membros.filter((m) => m.papel !== "tv");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Relatório de tarefas concluídas</h1>
          <p className="text-sm text-neutral-600">
            {soEu
              ? "Suas entregas no período, no prazo e com atraso."
              : "Entregas de cada pessoa no período: quantas, quantas no prazo e o que ainda está em aberto."}
          </p>
        </div>
        <button className="btn" onClick={exportarXlsx} disabled={!feitas || !!exportando}>
          {exportando === "xlsx" ? "Gerando…" : "Exportar Excel"}
        </button>
        <button className="btn-primario" onClick={exportarPdf} disabled={!feitas || !!exportando}>
          {exportando === "pdf" ? "Gerando…" : "Exportar PDF"}
        </button>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="flex overflow-hidden rounded-lg border border-[var(--borda)] text-sm">
          {(
            [
              ["mes", "Este mês"],
              ["mes_anterior", "Mês anterior"],
              ["trimestre", "Últimos 3 meses"],
              ["ano", "Ano"],
              ["livre", "Escolher"],
            ] as [Periodo, string][]
          ).map(([id, nome]) => (
            <button
              key={id}
              onClick={() => setPeriodo(id)}
              className={`px-3 py-1.5 ${periodo === id ? "bg-[var(--marca)] text-white" : "bg-white"}`}
            >
              {nome}
            </button>
          ))}
        </div>
        <label className="campo">
          <span>De</span>
          <input type="date" value={de} max={ate} onChange={(e) => (setPeriodo("livre"), setDe(e.target.value))} />
        </label>
        <label className="campo">
          <span>Até</span>
          <input type="date" value={ate} min={de} onChange={(e) => (setPeriodo("livre"), setAte(e.target.value))} />
        </label>
        {!soEu && (
          <div className="w-56">
            <MultiSelecao
              rotulo="Pessoas"
              todos="Todas as pessoas"
              valor={pessoasSel}
              aoMudar={setPessoasSel}
              opcoes={pessoas.map((m) => ({ id: m.user_id, nome: m.nome + (m.ativo ? "" : " (inativo)") }))}
            />
          </div>
        )}
        <div className="w-52">
          <MultiSelecao
            rotulo="Setores"
            todos="Todos os setores"
            valor={setorSel}
            aoMudar={setSetorSel}
            opcoes={[...setores.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor })), { id: "_sem", nome: "Sem setor" }]}
          />
        </div>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Concluídas", String(tot.total), false],
          ["No prazo", `${tot.noPrazo} (${pct(tot.noPrazo, tot.noPrazo + tot.atrasadas)})`, false],
          ["Com atraso", String(tot.atrasadas), tot.atrasadas > 0],
          ["Abertas hoje", String(tot.abertas), false],
          ["Vencidas hoje", String(tot.vencidas), tot.vencidas > 0],
        ].map(([r, v, al]) => (
          <div key={r as string} className="cartao p-3">
            <div className="text-xs text-neutral-500">{r}</div>
            <div className={`font-display num mt-1 text-[28px] leading-none ${al ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>
              {feitas ? v : "…"}
            </div>
          </div>
        ))}
      </div>

      <section className="cartao p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-[var(--marca)]">Concluídas por pessoa</h2>
          <div className="flex items-center gap-4 text-xs text-neutral-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: VERDE_OK }} /> no prazo ou sem prazo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OURO }} /> com atraso
            </span>
            {foco && (
              <button className="btn-link" onClick={() => setFoco(null)}>
                Mostrar todos
              </button>
            )}
          </div>
        </div>
        {!feitas ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : porPessoa.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma tarefa concluída no período.</p>
        ) : (
          <ul className="space-y-1.5">
            {porPessoa.map((p) => {
              const ok = p.noPrazo + p.semPrazo;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setFoco(foco === p.id ? null : p.id)}
                    className={`grid w-full grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--fundo)] ${foco === p.id ? "bg-[var(--fundo)] ring-1 ring-[var(--destaque-escuro)]" : ""}`}
                    title={`${p.nome}: ${p.total} concluída(s), ${p.noPrazo} no prazo, ${p.atrasadas} com atraso. Clique para ver as tarefas.`}
                  >
                    <span className="truncate">{p.nome}</span>
                    <span className="flex h-4 overflow-hidden rounded-full bg-[var(--fundo)]">
                      <span
                        className="h-full transition-[width] duration-500"
                        style={{ width: `${(ok / max) * 100}%`, background: VERDE_OK }}
                      />
                      <span
                        className="h-full transition-[width] duration-500"
                        style={{ width: `${(p.atrasadas / max) * 100}%`, background: OURO }}
                      />
                    </span>
                    <span className="num w-28 text-right text-[13px] text-neutral-600">
                      <b className="text-[var(--marca)]">{p.total}</b> · {pct(p.noPrazo, p.noPrazo + p.atrasadas)} no prazo
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!soEu && porPessoa.length > 0 && (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th className="text-right">Concluídas</th>
                <th className="text-right">No prazo</th>
                <th className="text-right">Com atraso</th>
                <th className="text-right">% no prazo</th>
                <th className="text-right">Atraso médio</th>
                <th className="text-right">Abertas hoje</th>
                <th className="text-right">Vencidas hoje</th>
              </tr>
            </thead>
            <tbody>
              {porPessoa.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-[var(--fundo)]" onClick={() => setFoco(p.id)}>
                  <td className="font-medium">{p.nome}</td>
                  <td className="num text-right">{p.total}</td>
                  <td className="num text-right">{p.noPrazo}</td>
                  <td className={`num text-right ${p.atrasadas ? "text-[var(--perigo)]" : ""}`}>{p.atrasadas}</td>
                  <td className="num text-right">{pct(p.noPrazo, p.noPrazo + p.atrasadas)}</td>
                  <td className="num text-right">{p.diasAtrasoMedio ? `${p.diasAtrasoMedio.toFixed(1)} d` : "—"}</td>
                  <td className="num text-right">{p.abertas}</td>
                  <td className={`num text-right ${p.vencidasHoje ? "text-[var(--perigo)]" : ""}`}>{p.vencidasHoje}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {feitas && (
        <section>
          <h2 className="mb-2 font-semibold text-[var(--marca)]">
            {foco ? `Tarefas concluídas por ${nomePessoa(foco === "_sem" ? null : foco)}` : "Tarefas concluídas no período"}{" "}
            <span className="text-sm font-normal text-neutral-500">({detalhe.length})</span>
          </h2>
          <div className="cartao max-h-[480px] overflow-auto">
            <table className="tabela">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Concluída</th>
                  <th>Tarefa</th>
                  <th>Cliente</th>
                  {!soEu && <th>Responsável</th>}
                  <th>Prazo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.slice(0, 500).map((t) => {
                  const d = diasAtraso(t);
                  return (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-sm">{fmtData(diaLocal(t.concluida_em))}</td>
                      <td className="text-sm">{t.titulo}</td>
                      <td className="text-sm text-neutral-600">{nomeCli(t.cliente_id)}</td>
                      {!soEu && <td className="text-sm">{nomePessoa(t.responsavel_id)}</td>}
                      <td className="whitespace-nowrap text-sm">{fmtData(t.prazo)}</td>
                      <td className={`whitespace-nowrap text-sm ${d !== null && d > 0 ? "text-[var(--perigo)]" : "text-emerald-700"}`}>
                        {situacao(t)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {detalhe.length > 500 && (
              <p className="p-3 text-xs text-neutral-500">Mostrando 500 de {detalhe.length}. A exportação traz todas.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
