// Financeiro › Início: o painel da MDC. Saldo dos bancos (pelos extratos), o que vence hoje, o que está
// vencido, os próximos 7 dias, o fluxo de caixa previsto dos próximos 30 dias (saldo atual + contas em aberto), o
// realizado dos últimos 6 meses (pagamentos e recebimentos), as maiores despesas do mês e atalhos. Sem nada
// cadastrado vê os primeiros passos (plano → banco → categorias → lançar). Só lê; as contas ficam em painel.ts.
"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { Valor } from "@/components/ui/Valor";
import { BarrasCategorias, GraficoFluxo, GraficoMeses } from "@/dominios/financeiro/componentes/GraficosPainel";
import { PrimeirosPassos } from "@/dominios/financeiro/componentes/PrimeirosPassos";
import {
  contarDoCliente,
  lerBaixas,
  lerCategorias,
  lerContas,
  lerLinhas,
  lerTitulosAbertos,
  lerTitulosPorId,
  lerTransferencias,
} from "@/dominios/financeiro/leituras";
import {
  despesasPorCategoria,
  fluxoPrevisto,
  menorSaldo,
  primeirosPassos,
  realizadoPorMes,
  resumirPrazos,
  saldoComTransferencias,
} from "@/dominios/financeiro/painel";
import type { Soma } from "@/dominios/financeiro/painel";


import { useConsulta } from "@/lib/useConsulta";
import { hojeISO, horaNoFuso, saudacao, somarMeses } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import { Esqueleto } from "@/components/ui/Esqueleto";

const dataPorExtenso = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));

const nomeDoMes = (mes: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${mes}-15T12:00:00Z`));

export default function PainelFinanceiro() {
  const { org, eu, pode } = useOrg();
  const { cliente } = useClienteGestao();
  const podeOperar = pode("financeiro", "operar");
  const hoje = hojeISO(org.fuso);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const id = cliente.id;
      const [contas, linhas, abertos, baixas, categorias, plano, titulos, transferencias] = await Promise.all([
        lerContas(id),
        lerLinhas(id),
        lerTitulosAbertos(id),
        lerBaixas(id, { de: `${somarMeses(hoje, -5)}-01`, ate: hoje }),
        lerCategorias(id),
        contarDoCliente("fin_plano_contas", id),
        contarDoCliente("fin_titulos", id),
        lerTransferencias(id),
      ]);
      const daBaixa = await lerTitulosPorId(baixas.map((b) => b.titulo_id));
      return { contas, linhas, abertos, baixas, categorias, plano, titulos, daBaixa, transferencias };
    }, [cliente, hoje]),
  );
  const d = consulta.dados;

  const calc = useMemo(() => {
    if (!d) return null;
    const bancos = d.contas.filter((c) => c.ativo).map((c) => ({ conta: c, saldo: saldoComTransferencias(c, d.linhas, d.transferencias) }));
    const saldo = Math.round(bancos.reduce((a, b) => a + b.saldo, 0) * 100) / 100;
    const fluxo = fluxoPrevisto(saldo, d.abertos, hoje, 30);
    const titulos = new Map(d.daBaixa.map((t) => [t.id, t]));
    const cats = new Map(d.categorias.map((c) => [c.id, c]));
    // no começo do mês (nada pago ainda) mostra o mês passado, para o quadro não abrir vazio
    let mesDespesas = hoje.slice(0, 7);
    let despesas = despesasPorCategoria(d.baixas, titulos, cats, mesDespesas);
    if (!despesas.length) {
      const anterior = somarMeses(hoje, -1);
      const doAnterior = despesasPorCategoria(d.baixas, titulos, cats, anterior);
      if (doAnterior.length) [mesDespesas, despesas] = [anterior, doAnterior];
    }
    return {
      bancos,
      saldo,
      prazos: resumirPrazos(d.abertos, hoje),
      fluxo,
      pior: menorSaldo(fluxo),
      meses: realizadoPorMes(d.baixas, new Map(d.daBaixa.map((t) => [t.id, t.tipo])), hoje, 6),
      despesas,
      mesDespesas,
      passos: primeirosPassos({ plano: d.plano, bancos: d.contas.length, categorias: d.categorias.length, titulos: d.titulos }),
    };
  }, [d, hoje]);

  const primeiroNome = eu.nome.split(/\s+/)[0] ?? "";
  const faltaPasso = calc?.passos.some((p) => !p.feito);
  const semMovimento = !!d && !d.contas.length && !d.titulos;

  return (
    <div className="space-y-5">
      {/* faixa de abertura: saudação e o saldo dos bancos */}
      <section className="relative overflow-hidden rounded-2xl bg-[var(--marca)] text-[var(--nevoa)]">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-[var(--destaque)]/20"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-[var(--destaque)]/15"
          aria-hidden="true"
        />
        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0 space-y-5">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight text-white">
                {saudacao(horaNoFuso(org.fuso))}, {primeiroNome}
              </h1>
              <p className="mt-0.5 text-sm first-letter:uppercase text-[var(--nevoa)]/75">{dataPorExtenso(hoje)}</p>
            </div>
            {cliente && (
              <p className="flex items-center gap-1.5 text-[13px] text-[var(--nevoa)]/80">
                <Icone nome="banco" className="h-3.5 w-3.5 text-[var(--destaque)]" />
                Financeiro da {nomeCliente(cliente)}
              </p>
            )}
          </div>
          {cliente && calc && (
            <div className="min-w-0 lg:text-right">
              <p className="text-[13px] text-[var(--nevoa)]/75">Dinheiro nos bancos hoje</p>
              <p
                className={`font-display num mt-1 text-[40px] leading-none tracking-tight sm:text-[52px] ${calc.saldo < 0 ? "text-[#ffb4a8]" : "text-white"}`}
              >
                {brl(calc.saldo)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 lg:justify-end">
                {calc.bancos.slice(0, 4).map((b) => (
                  <span key={b.conta.id} className="chip bg-white/[0.08] text-[var(--nevoa)]">
                    <Icone nome="banco" className="h-3.5 w-3.5 text-[var(--destaque)]" />
                    {b.conta.nome}
                    <span className={`num ${b.saldo < 0 ? "text-[#ffb4a8]" : "text-white"}`}>{brl(b.saldo, { centavos: false })}</span>
                  </span>
                ))}
                {!calc.bancos.length && <span className="text-[13px] text-[var(--nevoa)]/70">Nenhum banco cadastrado ainda.</span>}
              </div>
            </div>
          )}
        </div>
      </section>

      {!cliente ? (
        <SemEmpresaGestao icone="moeda" />
      ) : consulta.erro ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      ) : !calc || !d ? (
        <Esqueleto indicadores={3} linhas={4} />
      ) : (
        <>
          {podeOperar && <Atalhos />}

          {faltaPasso && <PrimeirosPassos passos={calc.passos} podeOperar={podeOperar} />}

          {!semMovimento && (
            <>
              <section className="grid gap-3 md:grid-cols-3" aria-label="Contas do dia">
                <CartaoPrazo titulo="Hoje" icone="calendario" pagar={calc.prazos.hoje.pagar} receber={calc.prazos.hoje.receber} vazio="Nada vence hoje." />
                <CartaoPrazo
                  titulo="Vencidos"
                  icone="alerta"
                  alerta
                  pagar={calc.prazos.vencidos.pagar}
                  receber={calc.prazos.vencidos.receber}
                  vazio="Nada vencido. Tudo em dia."
                />
                <CartaoPrazo
                  titulo="Próximos 7 dias"
                  icone="relogio"
                  pagar={calc.prazos.semana.pagar}
                  receber={calc.prazos.semana.receber}
                  vazio="Nada vence nos próximos 7 dias."
                />
              </section>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <section className="cartao min-w-0 space-y-3 p-4 sm:p-5">
                  <div>
                    <h2 className="font-semibold text-[var(--marca)]">Fluxo de caixa dos próximos 30 dias</h2>
                    <p className="text-sm text-[var(--texto-suave)]">
                      Se tudo for pago e recebido no vencimento, o saldo chega a{" "}
                      <Valor v={calc.fluxo.at(-1)?.saldo ?? 0} className="font-medium" /> em {fmtData(calc.fluxo.at(-1)?.data ?? hoje)}.
                      {calc.prazos.vencidos.pagar.qtd + calc.prazos.vencidos.receber.qtd > 0 && " O que está vencido conta no dia de hoje."}
                    </p>
                  </div>
                  {calc.pior && calc.pior.saldo < 0 && (
                    <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Atenção: o saldo fica negativo em {fmtData(calc.pior.data)} ({brl(calc.pior.saldo)}). Antecipe recebimentos ou
                        renegocie pagamentos.
                      </span>
                    </p>
                  )}
                  <GraficoFluxo dias={calc.fluxo} />
                </section>

                <section className="cartao min-w-0 space-y-3 p-4 sm:p-5">
                  <div className="flex items-start gap-2">
                    <div className="mr-auto">
                      <h2 className="font-semibold text-[var(--marca)]">
                        {calc.mesDespesas === hoje.slice(0, 7) ? "Maiores despesas do mês" : `Maiores despesas de ${nomeDoMes(calc.mesDespesas)}`}
                      </h2>
                      <p className="text-sm text-[var(--texto-suave)]">O que já foi pago, por categoria.</p>
                    </div>
                  </div>
                  {calc.despesas.length ? (
                    <BarrasCategorias fatias={calc.despesas} />
                  ) : (
                    <p className="py-6 text-center text-sm text-[var(--texto-suave)]">Nenhum pagamento registrado neste mês.</p>
                  )}
                  <Link href="/financeiro/movimento" className="btn-link inline-block">
                    Ver entradas e saídas
                  </Link>
                </section>
              </div>

              <section className="cartao space-y-3 p-4 sm:p-5">
                <div>
                  <h2 className="font-semibold text-[var(--marca)]">Últimos 6 meses</h2>
                  <p className="text-sm text-[var(--texto-suave)]">O dinheiro que entrou e saiu de verdade (pagamentos e recebimentos registrados).</p>
                </div>
                <GraficoMeses meses={calc.meses} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Atalhos grandes para o que mais se faz no dia a dia. */
function Atalhos() {
  const itens = [
    { href: "/financeiro/pagar?nova=1", nome: "Nova conta a pagar", dica: "Boleto, aluguel, fornecedor", icone: "seta-saida" },
    { href: "/financeiro/receber?nova=1", nome: "Nova conta a receber", dica: "Venda, serviço, mensalidade", icone: "seta-entrada" },
    { href: "/financeiro/extratos", nome: "Importar extrato", dica: "Arquivo OFX ou planilha do banco", icone: "importar" },
    { href: "/financeiro/estoque", nome: "Cadastrar item", dica: "Produto ou serviço", icone: "caixa" },
  ];
  return (
    <nav aria-label="Atalhos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="cartao group flex items-center gap-3 p-3.5 transition-colors hover:border-[var(--destaque-escuro)] sm:p-4"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--marca)] text-[var(--destaque)] transition-transform group-hover:scale-105">
            <Icone nome={a.icone} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-tight text-[var(--marca)]">{a.nome}</span>
            <span className="hidden truncate text-xs text-[var(--texto-suave)] sm:block">{a.dica}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Cartão de prazo (hoje, vencidos, próximos 7 dias): quanto há a pagar e a receber, com link para a lista. */
function CartaoPrazo({
  titulo,
  icone,
  pagar,
  receber,
  vazio,
  alerta,
}: {
  titulo: string;
  icone: string;
  pagar: Soma;
  receber: Soma;
  vazio: string;
  alerta?: boolean;
}) {
  const nada = !pagar.qtd && !receber.qtd;
  const vermelho = alerta && !nada;
  return (
    <div className={`cartao p-4 ${vermelho ? "border-red-200" : ""}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl ${vermelho ? "bg-red-50 text-red-700" : "bg-[var(--fundo)] text-[var(--marca)]"}`}
          aria-hidden="true"
        >
          <Icone nome={icone} className="h-[18px] w-[18px]" />
        </span>
        <h2 className={`font-semibold ${vermelho ? "text-red-800" : "text-[var(--marca)]"}`}>{titulo}</h2>
      </div>
      {nada ? (
        <p className="flex items-center gap-2 py-2 text-sm text-[var(--texto-suave)]">
          <Icone nome="check" className="h-4 w-4 text-emerald-700" />
          {vazio}
        </p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <Link href="/financeiro/pagar" className="flex items-baseline gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--fundo)]">
            <span className="text-[var(--texto-suave)]">A pagar</span>
            <span className="text-xs text-[var(--texto-suave)]">({pagar.qtd})</span>
            <span className={`num ml-auto font-semibold ${vermelho && pagar.valor ? "text-red-700" : ""}`}>{brl(pagar.valor)}</span>
          </Link>
          <Link href="/financeiro/receber" className="flex items-baseline gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--fundo)]">
            <span className="text-[var(--texto-suave)]">A receber</span>
            <span className="text-xs text-[var(--texto-suave)]">({receber.qtd})</span>
            <span className="num ml-auto font-semibold text-emerald-800">{brl(receber.valor)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
