// Saldos dos bancos do Omie no período (bi_saldos, migração 105): saldo inicial, final e a diferença para a variação do
// fluxo de caixa, com a lista por conta. Mostrado na aba Fluxo de caixa e no comparativo Resultado × Caixa.
"use client";

import { brl } from "@/lib/formato/moeda";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import type { ResumoSaldos } from "../saldos";

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
          {elimina ? ", e transferências entre as empresas do grupo (que o fluxo tira e o banco mostra)" : ""}.
        </p>
      )}
      {r.incompleto && (
        <p className="text-sm text-amber-900">
          Algumas contas ainda não têm todos os meses do período; a sincronização completa nas próximas horas.
        </p>
      )}
      <QuadroTabela rotulo="Saldos por conta" cartoes={false}>
        <thead>
          <tr>
            <th>Conta corrente</th>
            <th className="text-right">Início</th>
            <th className="text-right">Fim</th>
          </tr>
        </thead>
        <tbody>
          {r.contas.map((x) => (
            <tr key={`${x.empresa}-${x.conta}`}>
              <td className="celula-titulo !font-normal">
                {x.conta}
                <span className="block text-xs text-[var(--texto-suave)]">
                  {x.empresa}
                  {x.incompleta ? " · meses faltando" : ""}
                </span>
              </td>
              <td className="text-right">
                <Valor v={x.inicial} />
              </td>
              <td className="text-right">
                <Valor v={x.final} />
              </td>
            </tr>
          ))}
        </tbody>
      </QuadroTabela>
    </section>
  );
}
