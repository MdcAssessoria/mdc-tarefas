"use client";

import { useState } from "react";
import type { Dre } from "@/dominios/demonstrativos/balancete/resumo";
import { cruzar, linhasDre } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { Balanco, Dfc, LinhaBp } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { Selecao } from "@/dominios/demonstrativos/selecaoPeriodo";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice, fmtNumero } from "@/lib/formato/numero";
import { fmtData } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import { QuadroDemonstrativo } from "@/components/ui/QuadroDemonstrativo";

const fmt = (v: number) => (Math.abs(v) < 0.5 ? "—" : (v < 0 ? "(" : "") + fmtNumero(Math.abs(v)) + (v < 0 ? ")" : ""));

type Sub = "bp" | "dre" | "dfc" | "cruzamento";

export function AbaDemonstracoes({ sel, anterior }: { sel: Selecao<BalanceteReg>; anterior: Selecao<BalanceteReg> | null }) {
  const [sub, setSub] = useState<Sub>("bp");
  const demo = sel.base.demonstracoes;
  const ag = sel.ag;
  const anoAnterior = anterior?.ag ?? null;
  if (!demo)
    return (
      <p className="cartao p-6 text-center text-sm text-neutral-600">
        As demonstrações deste balancete ainda não foram geradas. Use “Reprocessar rascunhos” na lista de balancetes.
      </p>
    );
  const titulo = sel.rotulo;
  const SUBS: { id: Sub; nome: string }[] = [
    { id: "bp", nome: "Balanço Patrimonial" },
    { id: "dre", nome: "DRE" },
    { id: "dfc", nome: "Fluxo de caixa (DFC)" },
    { id: "cruzamento", nome: "DRE × DFC" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 print:hidden">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`rounded-full border px-3 py-1 text-sm ${sub === s.id ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white"}`}
          >
            {s.nome}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        {sel.fonte === "acumulado" || sel.escolha.visao === "mensal"
          ? `${sel.rotulo}: elaboradas a partir do balancete de ${fmtData(demo.periodo.inicio)} a ${fmtData(demo.periodo.fim)}`
          : `${sel.rotulo}: soma de ${ag.meses.length} balancete(s) mensal(is)${sel.completo ? "" : ` (${sel.completude.toLowerCase()})`}`}{" "}
        (Lei nº 6.404/1976, arts. 176 a 188; NBC TG 26 e NBC TG 03). Valores em R$; entre parênteses, negativos.
      </p>
      {sub === "bp" && ag.balanco && <TabelaBalanco b={ag.balanco} inicio={sel.inicio} fim={sel.fim} />}
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

/** Um lado do balanço (ativo ou passivo + PL) em tabela: saldo inicial (abertura), saldo final e variação, nessa ordem. */
function BlocoBalanco({
  titulo,
  linhas,
  total,
  inicio,
  fim,
}: {
  titulo: string;
  linhas: LinhaBp[];
  total: { atual: number; anterior: number };
  inicio: string;
  fim: string;
}) {
  return (
    <QuadroDemonstrativo rotulo={titulo}>
      <thead>
        <tr>
          <th>{titulo}</th>
          <th>
            Saldo inicial
            <span className="block text-[10.5px] font-normal normal-case tracking-normal opacity-80">{fmtData(inicio)}*</span>
          </th>
          <th className="demo-total">
            Saldo final
            <span className="block text-[10.5px] font-normal normal-case tracking-normal opacity-80">{fmtData(fim)}</span>
          </th>
          <th>Variação</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, k) => (
          <tr key={k} className={l.nivel <= 1 ? "demo-subtotal" : l.nivel === 2 ? "font-semibold" : ""}>
            <td className="demo-conta" style={{ paddingLeft: `${0.6 + (l.nivel - 1) * 0.9}rem` }}>
              {l.rotulo}
            </td>
            <td className={`demo-num text-[var(--texto-suave)] ${l.anterior < -0.5 ? "neg" : ""}`}>{fmt(l.anterior)}</td>
            <td className={`demo-num demo-total ${l.atual < -0.5 ? "neg" : ""}`}>{fmt(l.atual)}</td>
            <td className="demo-pct">{fmt(l.atual - l.anterior)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="demo-conta">Total</td>
          <td className="demo-num">{fmt(total.anterior)}</td>
          <td className="demo-num demo-total">{fmt(total.atual)}</td>
          <td className="demo-num">{fmt(total.atual - total.anterior)}</td>
        </tr>
      </tfoot>
    </QuadroDemonstrativo>
  );
}

function TabelaBalanco({ b, inicio, fim }: { b: Balanco; inicio: string; fim: string }) {
  const fecha = Math.abs(b.total_ativo.atual - b.total_passivo.atual) < 1;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 2xl:grid-cols-2">
        <BlocoBalanco titulo="Ativo" linhas={b.ativo} total={b.total_ativo} inicio={inicio} fim={fim} />
        <BlocoBalanco titulo="Passivo e patrimônio líquido" linhas={b.passivo} total={b.total_passivo} inicio={inicio} fim={fim} />
      </div>
      <p className={`text-xs ${fecha ? "text-emerald-700" : "text-[var(--perigo)]"}`}>
        <Icone nome={fecha ? "check" : "fechar"} className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        {fecha
          ? "Ativo igual a passivo + patrimônio líquido."
          : `Diferença de ${brl(b.total_ativo.atual - b.total_passivo.atual, { centavos: false })} entre ativo e passivo + PL.`}{" "}
        Período de {fmtData(inicio)} a {fmtData(fim)}. * Saldo inicial = saldo de abertura do período.
      </p>
    </div>
  );
}

export function TabelaDre({ colunas }: { colunas: { titulo: string; d: Dre }[] }) {
  const base = colunas.map((c) => linhasDre(c.d));
  return (
    <QuadroDemonstrativo rotulo="Demonstração do resultado">
      <thead>
        <tr>
          <th>Demonstração do resultado</th>
          {colunas.map((c, j) => (
            <th key={c.titulo} className={j === 0 ? "demo-total" : ""}>
              {c.titulo}
            </th>
          ))}
          {colunas.map((c) => (
            <th key={c.titulo + "%"}>% receita</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {base[0].map((l, k) => (
          <tr key={k} className={l.total ? (k === base[0].length - 1 ? "demo-resultado" : "demo-subtotal") : ""}>
            <td className="demo-conta" style={l.total ? undefined : { paddingLeft: "1.5rem" }}>
              {l.rotulo}
            </td>
            {base.map((b, j) => (
              <td key={j} className={`demo-num ${j === 0 ? "demo-total" : ""} ${b[k].valor < -0.5 && l.total ? "neg" : ""}`}>
                {fmt(b[k].valor)}
              </td>
            ))}
            {colunas.map((c, j) => (
              <td key={"p" + j} className="demo-pct">
                {c.d.receita_bruta && Math.abs(base[j][k].valor) >= 0.5 ? fmtIndice(base[j][k].valor / c.d.receita_bruta, "%") : "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </QuadroDemonstrativo>
  );
}

export function TabelaDfc({ colunas }: { colunas: { titulo: string; f: Dfc }[] }) {
  const f0 = colunas[0].f;
  const secoes: { titulo: string; chave: "operacional" | "investimento" | "financiamento"; total: "fco" | "fci" | "fcf"; leigo: string }[] =
    [
      { titulo: "Atividades operacionais", chave: "operacional", total: "fco", leigo: "o dinheiro gerado ou consumido pelo negócio em si" },
      {
        titulo: "Atividades de investimento",
        chave: "investimento",
        total: "fci",
        leigo: "compra e venda de bens, como máquinas, veículos e imóveis",
      },
      {
        titulo: "Atividades de financiamento",
        chave: "financiamento",
        total: "fcf",
        leigo: "dinheiro de bancos e sócios: empréstimos, aportes e retiradas de lucro",
      },
    ];
  const chaves = (s: "operacional" | "investimento" | "financiamento") => {
    const vistos: { chave: string; rotulo: string }[] = [];
    for (const c of colunas)
      for (const x of c.f[s]) if (!vistos.some((v) => v.chave === x.chave)) vistos.push({ chave: x.chave, rotulo: x.rotulo });
    return vistos;
  };
  const val = (f: Dfc, s: "operacional" | "investimento" | "financiamento", k: string) => f[s].find((x) => x.chave === k)?.valor ?? 0;
  return (
    <div className="space-y-2">
      <QuadroDemonstrativo rotulo="Demonstração dos fluxos de caixa">
        <thead>
          <tr>
            <th>Fluxos de caixa — método indireto</th>
            {colunas.map((c, j) => (
              <th key={c.titulo} className={j === 0 ? "demo-total" : ""}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secoes.map((s) => (
            <FragmentoSecao key={s.chave}>
              <tr className="font-semibold text-[var(--marca)]">
                <td className="demo-conta">
                  {s.titulo} <span className="block text-[11px] font-normal text-[var(--texto-suave)]">{s.leigo}</span>
                </td>
                {colunas.map((c, j) => (
                  <td key={c.titulo} className={j === 0 ? "demo-total" : ""} />
                ))}
              </tr>
              {chaves(s.chave).map((k) => (
                <tr key={k.chave}>
                  <td className="demo-conta" style={{ paddingLeft: "1.5rem" }}>
                    {k.rotulo}
                  </td>
                  {colunas.map((c, j) => {
                    const v = val(c.f, s.chave, k.chave);
                    return (
                      <td key={c.titulo} className={`demo-num ${j === 0 ? "demo-total" : ""} ${v < -0.5 ? "neg" : ""}`}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="demo-subtotal">
                <td className="demo-conta">Caixa líquido das {s.titulo.toLowerCase()}</td>
                {colunas.map((c, j) => (
                  <td key={c.titulo} className={`demo-num ${j === 0 ? "demo-total" : ""} ${c.f[s.total] < -0.5 ? "neg" : ""}`}>
                    {fmt(c.f[s.total])}
                  </td>
                ))}
              </tr>
            </FragmentoSecao>
          ))}
          <tr className="demo-resultado">
            <td className="demo-conta">Aumento (redução) do caixa e equivalentes</td>
            {colunas.map((c, j) => (
              <td key={c.titulo} className={`demo-num ${j === 0 ? "demo-total" : ""} ${c.f.variacao < -0.5 ? "neg" : ""}`}>
                {fmt(c.f.variacao)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="demo-conta" style={{ paddingLeft: "1.5rem" }}>
              Caixa e equivalentes no início
            </td>
            {colunas.map((c, j) => (
              <td key={c.titulo} className={`demo-num ${j === 0 ? "demo-total" : ""}`}>
                {fmt(c.f.caixa_inicial)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="demo-conta" style={{ paddingLeft: "1.5rem" }}>
              Caixa e equivalentes no fim
            </td>
            {colunas.map((c, j) => (
              <td key={c.titulo} className={`demo-num ${j === 0 ? "demo-total" : ""}`}>
                {fmt(c.f.caixa_final)}
              </td>
            ))}
          </tr>
        </tbody>
      </QuadroDemonstrativo>
      <p className={`text-xs ${f0.fechado ? "text-emerald-700" : "text-[var(--perigo)]"}`}>
        <Icone nome={f0.fechado ? "check" : "fechar"} className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        {f0.fechado
          ? "A soma dos três fluxos é igual à variação do caixa no balancete."
          : "A DFC não fecha com a variação do caixa — revise os grupos das contas."}
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
              {
                r: "Lucro líquido (DRE)",
                v: brl(b.c.lucro, { centavos: false }),
                neg: b.c.lucro < 0,
                s: "o que a empresa ganhou ou perdeu",
              },
              {
                r: "EBITDA",
                v: brl(b.c.ebitda, { centavos: false }),
                neg: b.c.ebitda < 0,
                s: "geração da atividade, antes de juros, IR e depreciação",
              },
              {
                r: "Caixa da operação (DFC)",
                v: brl(b.c.fco, { centavos: false }),
                neg: b.c.fco < 0,
                s: "o que de fato entrou ou saiu do caixa",
              },
              {
                r: "Lucro que virou caixa",
                v: b.c.conversao === null ? "—" : fmtIndice(b.c.conversao, "%"),
                neg: (b.c.conversao ?? 1) < 0.5,
                s: "acima de 100%: o caixa veio mais forte que o lucro",
              },
            ].map((k) => (
              <div key={k.r} className="cartao p-4">
                <div className="text-xs text-neutral-500">{k.r}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${k.neg ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>
                  {k.v}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">{k.s}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {b.c.comentarios.map((c, k) => (
              <div
                key={k}
                className={`rounded-lg border p-3 text-sm ${c.tom === "positivo" ? "border-emerald-200 bg-emerald-50" : c.tom === "atencao" ? "border-amber-200 bg-amber-50" : "border-[var(--borda)] bg-white"}`}
              >
                <b>{c.titulo}.</b> <span className="text-neutral-700">{c.texto}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
