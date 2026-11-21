// Aba Resultado × Caixa do BI: compara a DRE (competência) com o fluxo de caixa (pagamento) conta a conta do plano,
// aponta as variações (atenção a partir de 10%, alerta a partir de 25%, só acima de R$ 5 mil) e faz a ponte do resultado
// líquido à variação do caixa e aos saldos dos bancos (CPC 03 (R2), item 20A). Regras em ../conciliacao.ts.
"use client";

import { useCallback } from "react";
import { brl } from "@/lib/formato/moeda";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { useConsulta } from "@/lib/useConsulta";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import type { Tom } from "@/components/ui/Tons";
import { conciliar, fraseDoAlerta, LIMITES } from "../conciliacao";
import type { LinhaConciliacao, NivelAlerta } from "../conciliacao";
import { lerContas, lerSaldos } from "../dados";
import { mesesDoPeriodo, resumirSaldos } from "../saldos";
import { CartaoSaldos } from "./CartaoSaldos";
import { QuadroDemonstrativo, TdValor } from "./Demonstrativo";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";

const NIVEL: Record<NivelAlerta, { nome: string; tom: Tom }> = {
  ok: { nome: "Dentro do esperado", tom: "verde" },
  atencao: { nome: "Atenção", tom: "ambar" },
  alerta: { nome: "Alerta", tom: "vermelho" },
};
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function AbaConciliacao({ c }: { c: ContextoBi }) {
  const d = useConsulta(
    useCallback(async () => {
      const [dre, dfc, saldos] = await Promise.all([
        lerContas("dre", c.ids, c.de, c.ate, c.elimina),
        lerContas("dfc", c.ids, c.de, c.ate, c.elimina),
        lerSaldos(c.ids, c.de, c.ate),
      ]);
      return { conc: conciliar(dre ?? [], dfc ?? []), saldos: saldos ?? [] };
    }, [c.ids, c.de, c.ate, c.elimina]),
  );
  if (d.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {d.erro}
      </p>
    );
  if (!d.dados) return <Esqueleto />;
  const { conc } = d.dados;
  if (!conc.linhas.length && !conc.variacaoCaixa)
    return (
      <EstadoVazio icone="grafico" titulo="Nada lançado neste período">
        Não há notas nem contas das empresas escolhidas entre {c.rotuloPeriodo}. Troque o período.
      </EstadoVazio>
    );
  const saldos = resumirSaldos(d.dados.saldos, mesesDoPeriodo(c.de, c.ate < c.hoje ? c.ate : c.hoje), conc.variacaoCaixa);
  const alertas = conc.linhas.filter((l) => l.nivel !== "ok").sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
  const somaDif = conc.linhas.reduce((a, l) => a + l.diferenca, 0);

  const colunas: ColunaLista<LinhaConciliacao>[] = [
    { titulo: "Grupo de contas", valor: (l) => l.nome, peso: 2.4, largura: 40 },
    { titulo: "Resultado (competência)", valor: (l) => l.competencia, formato: "moeda", peso: 1.3 },
    { titulo: "Caixa (pagamento)", valor: (l) => l.caixa, formato: "moeda", peso: 1.3 },
    { titulo: "Diferença", valor: (l) => l.diferenca, formato: "moeda", peso: 1.2, alerta: (l) => l.nivel !== "ok" },
    { titulo: "Variação", valor: (l) => pct(l.percentual), peso: 0.8 },
    { titulo: "Situação", valor: (l) => NIVEL[l.nivel].nome, peso: 1.1 },
    { titulo: "Causa comum", valor: (l) => l.explica, peso: 3, largura: 60 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-[var(--marca)]">Resultado × caixa</h2>
          <p className="text-sm text-[var(--texto-suave)]">
            {c.quem} · {c.rotuloPeriodo}
            {textoEliminacao(c)}. A DRE mostra o que foi vendido e gasto no mês (competência); o fluxo de caixa, o que entrou e saiu do
            banco.
          </p>
        </div>
        <BotoesExportar
          vazio={!conc.linhas.length}
          avisar={c.avisar}
          montar={() => ({
            titulo: `Resultado × caixa · ${c.quem}`,
            subtitulo: `${c.rotuloPeriodo}${textoEliminacao(c)} · resultado ${brl(conc.resultado)} · caixa das operações ${brl(conc.caixaOperacional)} · variação do caixa ${brl(conc.variacaoCaixa)}`,
            arquivo: nomeArquivo("Resultado-x-caixa", c.quem, c.hoje),
            logoUrl: c.logoUrl,
            paisagem: true,
            linhas: conc.linhas,
            colunas,
            totais: {
              "Resultado (competência)": conc.resultado,
              "Caixa (pagamento)": conc.caixaOperacional,
              Diferença: Math.round(somaDif * 100) / 100,
            },
          })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Resultado líquido (DRE)"
          valor={brl(conc.resultado)}
          icone="tendencia"
          tom={conc.resultado < 0 ? "vermelho" : "neutro"}
        />
        <Indicador
          titulo="Caixa das operações"
          valor={brl(conc.caixaOperacional)}
          detalhe={`${brl(somaDif)} de diferença para o resultado`}
          icone="moeda"
          tom={conc.caixaOperacional < 0 ? "vermelho" : "neutro"}
        />
        <Indicador
          titulo="Só caixa"
          valor={brl(conc.soCaixa)}
          detalhe="Empréstimos, parcelamentos, adiantamentos, investimentos e sócios"
          icone="banco"
        />
        <Indicador
          titulo="Variação do caixa"
          valor={brl(conc.variacaoCaixa)}
          icone="grafico"
          tom={conc.variacaoCaixa < 0 ? "vermelho" : "verde"}
        />
      </div>

      {alertas.length > 0 ? (
        <section className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-950" aria-label="Variações apontadas">
          <p className="flex items-center gap-2 font-semibold">
            <Icone nome="alerta" className="h-4 w-4" />
            {alertas.length} variação(ões) para olhar
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {alertas.map((l) => (
              <li key={l.id}>
                <strong>{NIVEL[l.nivel].nome}:</strong> {fraseDoAlerta(l, brl)}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          <Icone nome="check" className="h-4 w-4" />
          Resultado e caixa andam juntos: nenhuma diferença acima de {pct(LIMITES.atencao)} e de {brl(LIMITES.piso)}.
        </p>
      )}

      <QuadroDemonstrativo rotulo="Resultado × caixa por grupo de contas">
        <thead>
          <tr>
            <th>Grupo de contas</th>
            <th>Resultado (competência)</th>
            <th>Caixa (pagamento)</th>
            <th className="demo-total">Diferença</th>
            <th>Variação</th>
            <th className="!text-left">Situação</th>
          </tr>
        </thead>
        <tbody>
          {conc.linhas.map((l) => (
            <tr key={l.id}>
              <td className="demo-conta">
                <span className="font-semibold">{l.nome}</span>
                <span className="block text-[11.5px] text-[var(--texto-suave)]">Causa comum: {l.explica}.</span>
              </td>
              <TdValor v={l.competencia} />
              <TdValor v={l.caixa} />
              <TdValor v={l.diferenca} className="demo-total" />
              <td className="demo-pct">{pct(l.percentual)}</td>
              <td>
                <Chip tom={NIVEL[l.nivel].tom}>{NIVEL[l.nivel].nome}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="demo-conta">Total das operações</td>
            <TdValor v={conc.resultado} />
            <TdValor v={conc.caixaOperacional} />
            <TdValor v={Math.round(somaDif * 100) / 100} className="demo-total" />
            <td />
            <td />
          </tr>
        </tfoot>
      </QuadroDemonstrativo>
      <p className="text-xs text-[var(--texto-suave)]">
        Diferença = caixa − resultado. Positiva: entrou mais (ou saiu menos) no banco do que o resultado mostra. Atenção a partir de{" "}
        {pct(LIMITES.atencao)} e alerta a partir de {pct(LIMITES.alerta)} da diferença, só acima de {brl(LIMITES.piso)}. Resultado +
        diferenças + só caixa = variação do caixa.
      </p>

      <h3 className="text-[15px] font-semibold text-[var(--marca)]">Saldos dos bancos</h3>
      <CartaoSaldos r={saldos} elimina={c.elimina} />
    </div>
  );
}
