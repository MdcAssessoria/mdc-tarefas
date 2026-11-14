// MDC · Pessoal, tela Hoje: como o dinheiro da família evoluiu nos últimos 12 meses. Dois gráficos que se alternam
// (entrou × saiu mês a mês, e o saldo guardado no fim de cada mês). Some enquanto a família não tem nada pago ou recebido.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConsulta } from "@/lib/useConsulta";
import { somarMeses } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { Icone } from "@/components/ui/Icone";
import { lerBaixas, lerContas, lerLinhas, lerTitulosPorId, lerTransferencias } from "@/dominios/financeiro/leituras";
import { realizadoPorMes, saldoComTransferencias, saldoPorMes } from "@/dominios/financeiro/painel";
import { GraficoMeses, GraficoSaldo } from "@/dominios/financeiro/componentes/GraficosPainel";
import { EVENTO_MUDOU } from "./dados";

const MESES = 12;

export function EvolucaoDoDinheiro({ cliente, hoje }: { cliente: string; hoje: string }) {
  const [visao, setVisao] = useState<"mes" | "guardado">("mes");
  const consulta = useConsulta(
    useCallback(async () => {
      const [contas, linhas, baixas, transferencias] = await Promise.all([
        lerContas(cliente),
        lerLinhas(cliente),
        lerBaixas(cliente, { de: `${somarMeses(hoje, -(MESES - 1))}-01`, ate: hoje }),
        lerTransferencias(cliente),
      ]);
      const titulos = await lerTitulosPorId(baixas.map((b) => b.titulo_id));
      return { contas, linhas, baixas, transferencias, titulos };
    }, [cliente, hoje]),
  );
  const { recarregar } = consulta;
  useEffect(() => {
    window.addEventListener(EVENTO_MUDOU, recarregar);
    return () => window.removeEventListener(EVENTO_MUDOU, recarregar);
  }, [recarregar]);

  const calc = useMemo(() => {
    const d = consulta.dados;
    if (!d) return null;
    const saldo = d.contas.filter((c) => c.ativo).reduce((a, c) => a + saldoComTransferencias(c, d.linhas, d.transferencias), 0);
    const meses = realizadoPorMes(d.baixas, new Map(d.titulos.map((t) => [t.id, t.tipo])), hoje, MESES);
    const entrou = meses.reduce((a, m) => a + m.entrou, 0);
    const saiu = meses.reduce((a, m) => a + m.saiu, 0);
    return { meses, saldos: saldoPorMes(meses, Math.round(saldo * 100) / 100), entrou, saiu };
  }, [consulta.dados, hoje]);

  if (!calc || (!calc.entrou && !calc.saiu)) return null;
  const sobra = calc.entrou - calc.saiu;
  return (
    <section className="rounded-[18px] border border-[var(--borda)] bg-white p-4 lg:col-span-2">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--marca)]">Como seu dinheiro evoluiu</h2>
        <Link href="/financeiro" className="text-sm font-semibold text-[#8A6A2A]">
          Ver mais
        </Link>
      </div>
      <p className="text-[13px] text-neutral-600">
        Em 12 meses entrou {brl(calc.entrou)} e saiu {brl(calc.saiu)}: {sobra >= 0 ? "sobrou" : "faltou"}{" "}
        <b className={sobra >= 0 ? "text-emerald-800" : "text-red-700"}>{brl(Math.abs(sobra))}</b>.
      </p>
      <div className="my-3 flex gap-2" role="group" aria-label="Escolha o gráfico">
        {(
          [
            ["mes", "Entrou e saiu", "grafico"],
            ["guardado", "Dinheiro guardado", "tendencia"],
          ] as const
        ).map(([v, rotulo, icone]) => (
          <button
            key={v}
            type="button"
            aria-pressed={visao === v}
            onClick={() => setVisao(v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${
              visao === v ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-neutral-700"
            }`}
          >
            <Icone nome={visao === v ? "check" : icone} className="h-4 w-4" />
            {rotulo}
          </button>
        ))}
      </div>
      {visao === "mes" ? <GraficoMeses meses={calc.meses} /> : <GraficoSaldo pontos={calc.saldos} />}
    </section>
  );
}
