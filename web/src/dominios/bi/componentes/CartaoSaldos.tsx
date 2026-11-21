// Saldos dos bancos do Omie no período (bi_saldos, migração 105): saldo inicial, final e a diferença para a variação do
// fluxo de caixa, com a lista por conta. Mostrado na aba Fluxo de caixa e no comparativo Resultado × Caixa.
"use client";

import { brl } from "@/lib/formato/moeda";
import { Indicador } from "@/components/ui/Indicador";
import type { ResumoSaldos } from "../saldos";
import { QuadroDemonstrativo, TdValor } from "./Demonstrativo";

export function CartaoSaldos({ r, elimina }: { r: ResumoSaldos | null; elimina: boolean }) {
  if (!r)
    return (
      <p className="flex items-start gap-2 rounded-md bg-[var(--fundo)] p-3 text-sm text-[var(--texto-suave)]">
        Os saldos dos bancos ainda não chegaram do Omie para este período. Eles vêm na sincronização automática (a cada 3 horas).
      </p>
    );
  const dif = r.diferenca ?? 0;
  return (
    <section aria-label="Saldos dos bancos" className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Indicador titulo="Saldo dos bancos no início" valor={brl(r.inicial)} icone="banco" />
        <Indicador
          titulo="Saldo dos bancos no fim"
          valor={brl(r.final)}
          detalhe={`Variação de ${brl(r.variacaoBanco)}`}
          icone="banco"
          tom={r.final < 0 ? "vermelho" : "neutro"}
        />
        {r.diferenca !== null && (
          <Indicador
            titulo="Bancos × fluxo de caixa"
            valor={brl(dif)}
            detalhe={Math.abs(dif) < 1 ? "Os bancos fecham com o fluxo" : "Movimento do banco sem conta a pagar/receber no Omie"}
            icone="alerta"
            tom={Math.abs(dif) < 1 ? "verde" : Math.abs(dif) < 5000 ? "ambar" : "vermelho"}
          />
        )}
      </div>
      {r.diferenca !== null && Math.abs(dif) >= 1 && (
        <p className="text-sm text-[var(--texto-suave)]">
          A diferença costuma ser tarifa, juros ou transferência lançados direto na conta corrente do Omie, sem conta a pagar ou receber
          {elimina
            ? ", e operações entre as empresas do grupo que só têm uma ponta lançada (veja o quadro Operações entre as empresas)"
            : ""}
          .
        </p>
      )}
      {r.incompleto && (
        <p className="text-sm text-amber-900">
          Algumas contas ainda não têm todos os meses do período; a sincronização completa nas próximas horas.
        </p>
      )}
      <QuadroDemonstrativo rotulo="Saldos por conta">
        <thead>
          <tr>
            <th>Conta corrente</th>
            <th>Início</th>
            <th className="demo-total">Fim</th>
            <th>Variação</th>
          </tr>
        </thead>
        <tbody>
          {r.contas.map((x) => (
            <tr key={`${x.empresa}-${x.conta}`}>
              <td className="demo-conta">
                {x.conta}
                <span className="block text-[11.5px] text-[var(--texto-suave)]">
                  {x.empresa}
                  {x.incompleta ? " · meses faltando" : ""}
                </span>
              </td>
              <TdValor v={x.inicial} />
              <TdValor v={x.final} className="demo-total" />
              <TdValor v={x.final - x.inicial} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="demo-conta">Total dos bancos</td>
            <TdValor v={r.inicial} />
            <TdValor v={r.final} className="demo-total" />
            <TdValor v={r.variacaoBanco} />
          </tr>
        </tfoot>
      </QuadroDemonstrativo>
    </section>
  );
}
