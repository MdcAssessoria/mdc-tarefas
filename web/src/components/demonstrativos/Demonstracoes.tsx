"use client";

import { useMemo, useState } from "react";
import { brl, fmtIndice } from "@/lib/balancete";
import type { Dre } from "@/lib/balancete";
import { cruzar, linhasDre } from "@/lib/demonstracoes";
import type { Balanco, Dfc, LinhaBp } from "@/lib/demonstracoes";
import { SeletorPeriodo, mesExtenso, useSeletorPeriodo } from "./Painel";
import { agregar } from "@/lib/periodos";
import type { TipoPeriodo } from "@/lib/periodos";
import type { BalanceteReg } from "./Painel";

const dataBr = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const fmt = (v: number) =>
  Math.abs(v) < 0.5 ? "—" : (v < 0 ? "(" : "") + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (v < 0 ? ")" : "");

type Sub = "bp" | "dre" | "dfc" | "cruzamento";

export function AbaDemonstracoes({ atual, historico }: { atual: BalanceteReg; historico: BalanceteReg[] }) {
  const [sub, setSub] = useState<Sub>("bp");
  const [tipo, setTipo] = useSeletorPeriodo();
  const demo = atual.demonstracoes;
  const multi = (demo?.periodo.dias ?? 31) > 31;
  const t: TipoPeriodo = multi ? "mensal" : tipo;
  const ag = useMemo(() => agregar(atual, historico, t), [atual, historico, t]);
  const anoAnterior = useMemo(() => {
    const c = `${Number(atual.competencia.slice(0, 4)) - 1}${atual.competencia.slice(4)}`;
    const reg = historico.find((b) => b.competencia === c);
    return reg ? agregar(reg, historico, t) : null;
  }, [historico, atual.competencia, t]);
  if (!demo)
    return <p className="cartao p-6 text-center text-sm text-neutral-600">As demonstrações deste balancete ainda não foram geradas. Use “Reprocessar rascunhos” na lista de balancetes.</p>;
  const titulo = multi ? "Período" : t === "mensal" ? mesExtenso(atual.competencia) : ag.rotulo;
  const SUBS: { id: Sub; nome: string }[] = [
    { id: "bp", nome: "Balanço Patrimonial" },
    { id: "dre", nome: "DRE" },
    { id: "dfc", nome: "Fluxo de caixa (DFC)" },
    { id: "cruzamento", nome: "DRE × DFC" },
  ];
  const inicioBp = t === "mensal" || !ag.meses.length ? demo.periodo.inicio : `${ag.meses[0].slice(0, 7)}-01`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-1">
          {SUBS.map((s) => (
            <button key={s.id} onClick={() => setSub(s.id)} className={`rounded-full border px-3 py-1 text-sm ${sub === s.id ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white"}`}>
              {s.nome}
            </button>
          ))}
        </div>
        {!multi && <SeletorPeriodo tipo={tipo} aoMudar={setTipo} />}
      </div>
      <p className="text-xs text-neutral-500">
        {t === "mensal" ? `Elaboradas a partir do balancete de ${dataBr(demo.periodo.inicio)} a ${dataBr(demo.periodo.fim)}` : `${ag.rotulo}: soma de ${ag.meses.length} balancete(s) mensal(is)${ag.completo ? "" : " — faltam meses do período no Hub"}`}{" "}
        (Lei nº 6.404/1976, arts. 176 a 188; NBC TG 26 e NBC TG 03). Valores em R$; entre parênteses, negativos.
      </p>
      {sub === "bp" && ag.balanco && <TabelaBalanco b={ag.balanco} inicio={inicioBp} fim={demo.periodo.fim} />}
      {sub === "dre" && (
        <TabelaDre colunas={[{ titulo, d: ag.dre }, ...(anoAnterior ? [{ titulo: anoAnterior.rotulo, d: anoAnterior.dre }] : [])]} />
      )}
      {sub === "dfc" &&
        (ag.dfc ? (
          <TabelaDfc colunas={[{ titulo, f: ag.dfc }, ...(anoAnterior?.dfc ? [{ titulo: anoAnterior.rotulo, f: anoAnterior.dfc }] : [])]} />
        ) : (
          <p className="text-sm text-neutral-600">Algum mês do período está sem DFC gerada. Reprocesse os balancetes do período.</p>
        ))}
      {sub === "cruzamento" && ag.dfc && <Cruzamento d={ag.dre} f={ag.dfc} titulo={titulo} />}
    </div>
  );
}

function TabelaBalanco({ b, inicio, fim }: { b: Balanco; inicio: string; fim: string }) {
  const Bloco = ({ titulo, linhas, total }: { titulo: string; linhas: LinhaBp[]; total: { atual: number; anterior: number } }) => (
    <div className="cartao overflow-x-auto">
      <table className="tabela text-[13px]">
        <thead>
          <tr>
            <th>{titulo}</th>
            <th className="text-right">{dataBr(fim)}</th>
            <th className="text-right">{dataBr(inicio)}*</th>
            <th className="text-right">Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, k) => (
            <tr key={k} className={l.nivel <= 2 ? "bg-[var(--fundo)] font-medium" : ""}>
              <td style={{ paddingLeft: 10 + (l.nivel - 1) * 14 }}>{l.rotulo}</td>
              <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.atual)}</td>
              <td className="whitespace-nowrap text-right tabular-nums text-neutral-500">{fmt(l.anterior)}</td>
              <td className="whitespace-nowrap text-right tabular-nums text-xs text-neutral-500">{fmt(l.atual - l.anterior)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[var(--marca)] font-semibold">
            <td>Total</td>
            <td className="text-right tabular-nums">{fmt(total.atual)}</td>
            <td className="text-right tabular-nums">{fmt(total.anterior)}</td>
            <td className="text-right tabular-nums text-xs">{fmt(total.atual - total.anterior)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  const fecha = Math.abs(b.total_ativo.atual - b.total_passivo.atual) < 1;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="Ativo" linhas={b.ativo} total={b.total_ativo} />
        <Bloco titulo="Passivo e patrimônio líquido" linhas={b.passivo} total={b.total_passivo} />
      </div>
      <p className={`text-xs ${fecha ? "text-emerald-700" : "text-[var(--perigo)]"}`}>
        {fecha ? "✔ Ativo igual a passivo + patrimônio líquido." : `✖ Diferença de ${brl(b.total_ativo.atual - b.total_passivo.atual)} entre ativo e passivo + PL.`} * Saldo de abertura do período.
      </p>
    </div>
  );
}

export function TabelaDre({ colunas }: { colunas: { titulo: string; d: Dre }[] }) {
  const base = colunas.map((c) => linhasDre(c.d));
  return (
    <div className="cartao overflow-x-auto">
      <table className="tabela text-[13px]">
        <thead>
          <tr>
            <th>Demonstração do resultado</th>
            {colunas.map((c) => (
              <th key={c.titulo} className="text-right">{c.titulo}</th>
            ))}
            {colunas.map((c) => (
              <th key={c.titulo + "%"} className="text-right text-xs">% receita</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {base[0].map((l, k) => (
            <tr key={k} className={l.total ? "bg-[var(--fundo)] font-semibold" : ""}>
              <td style={{ paddingLeft: l.total ? 10 : 24 }}>{l.rotulo}</td>
              {base.map((b, j) => (
                <td key={j} className={`whitespace-nowrap text-right tabular-nums ${b[k].valor < 0 && l.total ? "text-[var(--perigo)]" : ""}`}>{fmt(b[k].valor)}</td>
              ))}
              {colunas.map((c, j) => (
                <td key={"p" + j} className="whitespace-nowrap text-right text-xs tabular-nums text-neutral-500">
                  {c.d.receita_bruta ? fmtIndice(base[j][k].valor / c.d.receita_bruta, "%") : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaDfc({ colunas }: { colunas: { titulo: string; f: Dfc }[] }) {
  const f0 = colunas[0].f;
  const secoes: { titulo: string; chave: "operacional" | "investimento" | "financiamento"; total: "fco" | "fci" | "fcf"; leigo: string }[] = [
    { titulo: "Atividades operacionais", chave: "operacional", total: "fco", leigo: "o dinheiro gerado ou consumido pelo negócio em si" },
    { titulo: "Atividades de investimento", chave: "investimento", total: "fci", leigo: "compra e venda de bens, como máquinas, veículos e imóveis" },
    { titulo: "Atividades de financiamento", chave: "financiamento", total: "fcf", leigo: "dinheiro de bancos e sócios: empréstimos, aportes e retiradas de lucro" },
  ];
  const chaves = (s: "operacional" | "investimento" | "financiamento") => {
    const vistos: { chave: string; rotulo: string }[] = [];
    for (const c of colunas) for (const x of c.f[s]) if (!vistos.some((v) => v.chave === x.chave)) vistos.push({ chave: x.chave, rotulo: x.rotulo });
    return vistos;
  };
  const val = (f: Dfc, s: "operacional" | "investimento" | "financiamento", k: string) => f[s].find((x) => x.chave === k)?.valor ?? 0;
  return (
    <div className="space-y-2">
      <div className="cartao overflow-x-auto">
        <table className="tabela text-[13px]">
          <thead>
            <tr>
              <th>Demonstração dos fluxos de caixa — método indireto</th>
              {colunas.map((c) => (
                <th key={c.titulo} className="text-right">{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {secoes.map((s) => (
              <FragmentoSecao key={s.chave}>
                <tr className="bg-[var(--fundo)]">
                  <td colSpan={colunas.length + 1} className="font-semibold">
                    {s.titulo} <span className="text-xs font-normal text-neutral-500">· {s.leigo}</span>
                  </td>
                </tr>
                {chaves(s.chave).map((k) => (
                  <tr key={k.chave}>
                    <td style={{ paddingLeft: 24 }}>{k.rotulo}</td>
                    {colunas.map((c) => (
                      <td key={c.titulo} className="whitespace-nowrap text-right tabular-nums">{fmt(val(c.f, s.chave, k.chave))}</td>
                    ))}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td style={{ paddingLeft: 10 }}>Caixa líquido das {s.titulo.toLowerCase()}</td>
                  {colunas.map((c) => (
                    <td key={c.titulo} className={`whitespace-nowrap text-right tabular-nums ${c.f[s.total] < 0 ? "text-[var(--perigo)]" : ""}`}>{fmt(c.f[s.total])}</td>
                  ))}
                </tr>
              </FragmentoSecao>
            ))}
            <tr className="border-t-2 border-[var(--marca)] font-semibold">
              <td>Aumento (redução) do caixa e equivalentes</td>
              {colunas.map((c) => (
                <td key={c.titulo} className="text-right tabular-nums">{fmt(c.f.variacao)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ paddingLeft: 24 }}>Caixa e equivalentes no início</td>
              {colunas.map((c) => (
                <td key={c.titulo} className="text-right tabular-nums">{fmt(c.f.caixa_inicial)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ paddingLeft: 24 }}>Caixa e equivalentes no fim</td>
              {colunas.map((c) => (
                <td key={c.titulo} className="text-right tabular-nums">{fmt(c.f.caixa_final)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className={`text-xs ${f0.fechado ? "text-emerald-700" : "text-[var(--perigo)]"}`}>
        {f0.fechado ? "✔ A soma dos três fluxos é igual à variação do caixa no balancete." : "✖ A DFC não fecha com a variação do caixa — revise os grupos das contas."}
      </p>
    </div>
  );
}

function FragmentoSecao({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Cruzamento({ d, f, titulo }: { d: Dre; f: Dfc; titulo: string }) {
  const blocos = [{ titulo, c: cruzar(d, f), d }];
  return (
    <div className="space-y-5">
      {blocos.map((b) => (
        <section key={b.titulo} className="space-y-3">
          <h3 className="font-semibold text-[var(--marca)]">{b.titulo}</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { r: "Lucro líquido (DRE)", v: brl(b.c.lucro), neg: b.c.lucro < 0, s: "o que a empresa ganhou ou perdeu" },
              { r: "EBITDA", v: brl(b.c.ebitda), neg: b.c.ebitda < 0, s: "geração da atividade, antes de juros, IR e depreciação" },
              { r: "Caixa da operação (DFC)", v: brl(b.c.fco), neg: b.c.fco < 0, s: "o que de fato entrou ou saiu do caixa" },
              { r: "Lucro que virou caixa", v: b.c.conversao === null ? "—" : fmtIndice(b.c.conversao, "%"), neg: (b.c.conversao ?? 1) < 0.5, s: "acima de 100%: o caixa veio mais forte que o lucro" },
            ].map((k) => (
              <div key={k.r} className="cartao p-4">
                <div className="text-xs text-neutral-500">{k.r}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${k.neg ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>{k.v}</div>
                <div className="mt-1 text-[11px] text-neutral-500">{k.s}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {b.c.comentarios.map((c, k) => (
              <div key={k} className={`rounded-lg border p-3 text-sm ${c.tom === "positivo" ? "border-emerald-200 bg-emerald-50" : c.tom === "atencao" ? "border-amber-200 bg-amber-50" : "border-[var(--borda)] bg-white"}`}>
                <b>{c.titulo}.</b> <span className="text-neutral-700">{c.texto}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
