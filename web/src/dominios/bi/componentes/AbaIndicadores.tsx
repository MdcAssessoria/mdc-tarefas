// Indicadores do BI: saúde do negócio (margem EBITDA, cobertura de juros, folga sobre o ponto de equilíbrio, fôlego de
// caixa e conversão em caixa, de ../indicadoresGestao.ts) e os indicadores dos títulos do Omie: prazos médios, inadimplência por faixa, a receber/a pagar em aberto, os 10 maiores
// clientes e fornecedores e a liquidez (do balancete do Domínio quando existir; senão, a cobertura estimada).
"use client";

import { useCallback } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtCompetencia } from "@/lib/formato/datas";
import { useConsulta } from "@/lib/useConsulta";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { fmtVariacao, periodoComparado } from "../comparar";
import { lerIndicadores, lerRelatorio, lerSaldos } from "../dados";
import { fmtIndicador, indicadoresGestao, reguaIndicador } from "../indicadoresGestao";
import { mesesDoPeriodo, resumirSaldos } from "../saldos";
import { CartaoFaixa } from "./CartaoFaixa";
import { QuadroDemonstrativo, TdValor } from "./Demonstrativo";
import { FAIXAS, cicloFinanceiro, cobertura, fmtDias, fmtIndice, inadimplencia, nomeItem, participacao } from "../indicadores";
import type { Indicadores, ItemTop } from "../indicadores";
import type { ContextoBi } from "./contexto";

const pct = (v: number | null) => (v === null ? "—" : fmtVariacao(v).replace("+", ""));
function dif(a: number | null, b: number | null) {
  if (a === null || b === null) return undefined;
  const d = Math.round((Number(a) - Number(b)) * 10) / 10;
  if (d === 0) return "Igual ao período anterior";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("pt-BR")} dias × período anterior`;
}

function TabelaTop({ titulo, itens, total, rotulo }: { titulo: string; itens: ItemTop[]; total: number; rotulo: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[15px] font-semibold text-[var(--marca)]">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-sm text-[var(--texto-suave)]">Nada no período.</p>
      ) : (
        <QuadroDemonstrativo rotulo={titulo}>
          <thead>
            <tr>
              <th>{rotulo}</th>
              <th className="demo-total">Valor</th>
              <th>% do total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i, k) => (
              <tr key={`${i.doc}-${k}`}>
                <td className="demo-conta">{nomeItem(i)}</td>
                <TdValor v={Number(i.valor)} className="demo-total" />
                <td className="demo-pct">{pct(participacao(Number(i.valor), total))}</td>
              </tr>
            ))}
          </tbody>
        </QuadroDemonstrativo>
      )}
    </div>
  );
}

export function AbaIndicadores({ c }: { c: ContextoBi }) {
  const antes = periodoComparado(c.de, c.ate, "anterior");
  const dados = useConsulta(
    useCallback(async () => {
      const [atual, anterior, dre, dfc, saldos] = await Promise.all([
        lerIndicadores(c.ids, c.de, c.ate, c.elimina),
        lerIndicadores(c.ids, antes.de, antes.ate, c.elimina),
        lerRelatorio("dre", c.ids, c.de, c.ate, c.elimina),
        lerRelatorio("dfc", c.ids, c.de, c.ate, c.elimina),
        lerSaldos(c.ids, c.de, c.ate),
      ]);
      const meses = mesesDoPeriodo(c.de, c.ate < c.hoje ? c.ate : c.hoje);
      const banco = resumirSaldos(saldos ?? [], meses, null);
      return { atual, anterior, gestao: indicadoresGestao(dre, dfc, banco ? banco.finalUltimoMes : null, meses.length) };
    }, [c.ids, c.de, c.ate, c.elimina, c.hoje, antes.de, antes.ate]),
  );
  if (dados.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {dados.erro}
      </p>
    );
  if (!dados.dados) return <Esqueleto />;
  const i: Indicadores = dados.dados.atual;
  const a: Indicadores = dados.dados.anterior;
  const g = dados.dados.gestao;
  const inad = inadimplencia(i);
  const cob = cobertura(i);
  const resumo = [
    { nome: "Prazo médio de recebimento", valor: fmtDias(i.pmr) },
    { nome: "Prazo médio de pagamento", valor: fmtDias(i.pmp) },
    { nome: "Ciclo financeiro (receber − pagar)", valor: fmtDias(cicloFinanceiro(i)) },
    { nome: `A receber em aberto em ${fmtData(i.corte)}`, valor: brl(Number(i.receber.aberto ?? 0)) },
    { nome: "A receber vencido", valor: brl(Number(i.receber.vencido ?? 0)) },
    { nome: "Inadimplência (vencido ÷ a receber)", valor: pct(inad) },
    { nome: `A pagar em aberto em ${fmtData(i.corte)}`, valor: brl(Number(i.pagar.aberto ?? 0)) },
    { nome: "A pagar vencido", valor: brl(Number(i.pagar.vencido ?? 0)) },
    { nome: "Cobertura de curto prazo (a receber ÷ a pagar)", valor: fmtIndice(cob) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <p className="flex-1 text-sm text-[var(--texto-suave)]">
          {c.quem} · prazos de {c.rotuloPeriodo} · posição em aberto em {fmtData(i.corte)}
        </p>
        <BotoesExportar
          vazio={false}
          avisar={c.avisar}
          montar={() => ({
            titulo: `Indicadores · ${c.quem}`,
            subtitulo: `${c.rotuloPeriodo} · posição em ${fmtData(i.corte)}`,
            arquivo: nomeArquivo("BI-indicadores", c.quem, c.hoje),
            logoUrl: c.logoUrl,
            linhas: [
              ...g.map((x) => ({ nome: `${x.titulo} (${x.conta})`, valor: fmtIndicador(x) })),
              ...resumo,
              ...i.clientes.map((x) => ({ nome: `Cliente: ${nomeItem(x)}`, valor: brl(Number(x.valor)) })),
              ...i.fornecedores.map((x) => ({ nome: `Fornecedor: ${nomeItem(x)}`, valor: brl(Number(x.valor)) })),
            ],
            colunas: [
              { titulo: "Indicador", valor: (l: { nome: string; valor: string }) => l.nome, peso: 3, largura: 60 },
              { titulo: "Valor", valor: (l) => l.valor, peso: 1.2, largura: 22 },
            ],
          })}
        />
      </div>

      <section aria-label="Saúde do negócio" className="space-y-2">
        <h3 className="text-[15px] font-semibold text-[var(--marca)]">Saúde do negócio</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {g.map((x) => (
            <CartaoFaixa
              key={x.id}
              titulo={x.titulo}
              valor={fmtIndicador(x)}
              nivel={x.nivel}
              regua={reguaIndicador(x)}
              frase={x.frase}
              dica={x.conta}
              nota={x.premissa}
            />
          ))}
        </div>
      </section>

      <h3 className="text-[15px] font-semibold text-[var(--marca)]">Prazos e contas em aberto</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Prazo médio de recebimento" icone="relogio" valor={fmtDias(i.pmr)} detalhe={dif(i.pmr, a.pmr)} />
        <Indicador titulo="Prazo médio de pagamento" icone="calendario" valor={fmtDias(i.pmp)} detalhe={dif(i.pmp, a.pmp)} />
        <Indicador
          titulo="Ciclo financeiro"
          icone="atualizar"
          valor={fmtDias(cicloFinanceiro(i))}
          detalhe="Dias que a empresa financia o cliente além do prazo do fornecedor (sem estoque)"
          tom={(cicloFinanceiro(i) ?? 0) > 0 ? "ambar" : "neutro"}
        />
        <Indicador
          titulo="Inadimplência"
          icone="alerta"
          valor={pct(inad)}
          detalhe={`${brl(Number(i.receber.vencido ?? 0))} vencidos de ${brl(Number(i.receber.aberto ?? 0))} a receber`}
          tom={(inad ?? 0) > 0.1 ? "vermelho" : (inad ?? 0) > 0.03 ? "ambar" : "verde"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["receber", "pagar"] as const).map((lado) => {
          const p = i[lado];
          return (
            <div key={lado} className="space-y-2">
              <h3 className="text-[15px] font-semibold text-[var(--marca)]">
                {lado === "receber" ? "A receber em aberto" : "A pagar em aberto"} · {brl(Number(p.aberto ?? 0))}
              </h3>
              <QuadroDemonstrativo rotulo={`Atraso ${lado}`}>
                <thead>
                  <tr>
                    <th>Situação</th>
                    <th className="demo-total">Valor</th>
                    <th>% do aberto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="demo-conta">A vencer</td>
                    <TdValor v={Number(p.aberto ?? 0) - Number(p.vencido ?? 0)} className="demo-total" />
                    <td className="demo-pct">{pct(participacao(Number(p.aberto ?? 0) - Number(p.vencido ?? 0), Number(p.aberto ?? 0)))}</td>
                  </tr>
                  {FAIXAS.map((f) => (
                    <tr key={f.chave}>
                      <td className="demo-conta">Vencido há {f.nome.toLowerCase()}</td>
                      <TdValor v={Number(p[f.chave] ?? 0)} className="demo-total" />
                      <td className="demo-pct">{pct(participacao(Number(p[f.chave] ?? 0), Number(p.aberto ?? 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </QuadroDemonstrativo>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold text-[var(--marca)]">Liquidez</h3>
        {i.liquidez.length ? (
          <QuadroDemonstrativo rotulo="Índices de liquidez">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Balancete</th>
                <th>Corrente</th>
                <th>Seca</th>
                <th>Imediata</th>
                <th>Geral</th>
              </tr>
            </thead>
            <tbody>
              {i.liquidez.map((l) => (
                <tr key={l.empresa}>
                  <td className="demo-conta">{l.empresa}</td>
                  <td className="demo-pct">{fmtCompetencia(l.competencia)}</td>
                  <td className="demo-num">{fmtIndice(l.corrente)}</td>
                  <td className="demo-num">{fmtIndice(l.seca)}</td>
                  <td className="demo-num">{fmtIndice(l.imediata)}</td>
                  <td className="demo-num">{fmtIndice(l.geral)}</td>
                </tr>
              ))}
            </tbody>
          </QuadroDemonstrativo>
        ) : (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Sem balancete do Domínio publicado em Demonstrativos para estas empresas, então não há liquidez corrente, seca e geral.
              Estimativa pelos títulos do Omie: <strong>cobertura de curto prazo {fmtIndice(cob)}</strong> (a receber em aberto ÷ a pagar em
              aberto, sem caixa, estoque nem empréstimos).
            </span>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaTop
          titulo={`10 maiores clientes · ${brl(Number(i.clientes_total))} faturados`}
          itens={i.clientes}
          total={Number(i.clientes_total)}
          rotulo="Cliente"
        />
        <TabelaTop
          titulo={`10 maiores fornecedores · ${brl(Number(i.fornecedores_total))} em títulos`}
          itens={i.fornecedores}
          total={Number(i.fornecedores_total)}
          rotulo="Fornecedor"
        />
      </div>
      <p className="text-xs text-[var(--texto-suave)]">
        Clientes pelas notas fiscais autorizadas; fornecedores pelos títulos a pagar das categorias de fornecedores e despesas (o Omie não
        envia o nome do fornecedor, só o CNPJ/CPF). Prazos e aberto dependem da classificação das categorias do Omie.
      </p>
    </div>
  );
}
