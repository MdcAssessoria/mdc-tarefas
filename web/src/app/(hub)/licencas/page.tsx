// Licenças › Painel: quanto a venda de módulos do HUB rende por mês, o que falta receber, o que já entrou, a
// inadimplência por faixa de atraso, clientes bloqueados, reajustes a fazer e o gráfico dos últimos 6 meses.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { fmtData, mesExtenso } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar, Indicador } from "@/dominios/financeiro/componentes/Comuns";
import { nomeArquivo } from "@/dominios/financeiro/exportar";
import { Cabecalho, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { GraficoMeses } from "@/dominios/licencas/componentes/GraficoMeses";
import {
  contratoVigente,
  diasDeAtraso,
  faturadoERecebido,
  inadimplenciaPorFaixa,
  mesesAte,
  receitaRecorrente,
  reajustePendente,
} from "@/dominios/licencas/regras";
import { gerarCobrancas } from "@/dominios/licencas/repositorio";

export default function PainelLicencas() {
  const { org } = useOrg();
  const dados = useDadosLicencas({ baixas: true });
  const { hoje, nomeDoCliente } = dados;
  const { aviso, mostrar } = useAviso();
  const [gerando, setGerando] = useState(false);
  const mes = hoje.slice(0, 7);
  const d = dados.dados;

  const numeros = useMemo(() => {
    if (!d) return null;
    const vigentes = d.contratos.filter((k) => contratoVigente(k, hoje));
    const doMes = d.cobrancas.filter((c) => c.situacao !== "cancelada" && c.vencimento.startsWith(mes));
    const aReceber = doMes.filter((c) => c.situacao === "aberta").reduce((s, c) => s + c.valor, 0);
    const recebido = d.recebimentos.filter((b) => !b.estornada && b.data.startsWith(mes)).reduce((s, b) => s + b.total, 0);
    const atrasadas = d.cobrancas.filter((c) => diasDeAtraso(c, hoje) > 0);
    const reajustes = d.contratos
      .map((k) => ({ k, prevista: reajustePendente(k, hoje) }))
      .filter((x): x is { k: (typeof d.contratos)[number]; prevista: string } => !!x.prevista);
    return {
      mrr: receitaRecorrente(d.contratos, hoje),
      vigentes: vigentes.length,
      clientes: new Set(vigentes.map((k) => k.cliente_id)).size,
      aReceber,
      qtdAReceber: doMes.filter((c) => c.situacao === "aberta").length,
      recebido,
      atraso: atrasadas.reduce((s, c) => s + c.valor, 0),
      clientesAtraso: new Set(atrasadas.map((c) => c.cliente_id)).size,
      faixas: inadimplenciaPorFaixa(d.cobrancas, hoje),
      grafico: faturadoERecebido(d.cobrancas, d.recebimentos, mesesAte(hoje, 6)),
      reajustes,
    };
  }, [d, hoje, mes]);

  async function gerar() {
    setGerando(true);
    try {
      const n = await gerarCobrancas(org.id, `${mes}-01`);
      mostrar(
        n ? `${n} mensalidade(s) de ${mesExtenso(mes)} gerada(s).` : `As mensalidades de ${mesExtenso(mes)} já estavam todas geradas.`,
      );
      dados.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Licenças" descricao="Quanto a venda dos módulos do HUB rende por mês, o que falta receber e quem está atrasado.">
        {numeros && (
          <BotoesExportar
            vazio={false}
            avisar={mostrar}
            montar={() => ({
              titulo: "Painel de licenças",
              subtitulo: `${org.nome} · posição em ${fmtData(hoje)}`,
              arquivo: nomeArquivo("Painel-licencas", hoje),
              logoUrl: org.logo_url,
              paisagem: false,
              colunas: [
                { titulo: "Indicador", valor: (l: { nome: string; valor: number; detalhe: string }) => l.nome, peso: 2, largura: 40 },
                { titulo: "Valor", valor: (l) => l.valor, formato: "moeda", peso: 1 },
                { titulo: "Detalhe", valor: (l) => l.detalhe, peso: 2, largura: 40 },
              ],
              linhas: [
                { nome: "Receita mensal recorrente", valor: numeros.mrr, detalhe: `${numeros.vigentes} contrato(s) valendo` },
                { nome: `A receber em ${mesExtenso(mes)}`, valor: numeros.aReceber, detalhe: `${numeros.qtdAReceber} mensalidade(s)` },
                { nome: `Recebido em ${mesExtenso(mes)}`, valor: numeros.recebido, detalhe: "" },
                { nome: "Em atraso (total)", valor: numeros.atraso, detalhe: `${numeros.clientesAtraso} cliente(s)` },
                ...numeros.faixas.map((f) => ({
                  nome: `Atraso de ${f.nome.toLowerCase()}`,
                  valor: f.valor,
                  detalhe: `${f.quantidade} mensalidade(s) · ${f.clientes} cliente(s)`,
                })),
              ],
            })}
          />
        )}
        {dados.podeOperar && (
          <button
            className="btn-primario"
            onClick={gerar}
            disabled={gerando || !d}
            title="Cria as mensalidades do mês que ainda faltam (não duplica)"
          >
            {gerando ? "Gerando…" : "Gerar mensalidades do mês"}
          </button>
        )}
      </Cabecalho>

      {aviso}
      {dados.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dados.erro}</p>}

      {!numeros ? (
        <Carregando />
      ) : !d?.contratos.length ? (
        <EstadoVazio
          acao={
            <Link className="btn-primario" href="/licencas/contratos">
              Cadastrar o primeiro contrato
            </Link>
          }
        >
          Nenhum contrato de licença ainda. Confira os preços em{" "}
          <Link className="underline" href="/licencas/produtos">
            Produtos e planos
          </Link>{" "}
          e cadastre o primeiro contrato.
        </EstadoVazio>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Indicador
              titulo="Receita mensal recorrente"
              valor={brl(numeros.mrr)}
              detalhe={`${numeros.vigentes} contrato(s) · ${numeros.clientes} cliente(s)`}
            />
            <Indicador
              titulo="A receber neste mês"
              valor={brl(numeros.aReceber)}
              detalhe={`${numeros.qtdAReceber} mensalidade(s)`}
              tom="ambar"
            />
            <Indicador titulo="Recebido neste mês" valor={brl(numeros.recebido)} tom="verde" />
            <Indicador
              titulo="Em atraso"
              valor={brl(numeros.atraso)}
              detalhe={`${numeros.clientesAtraso} cliente(s)`}
              tom={numeros.atraso ? "vermelho" : "neutro"}
            />
            <Indicador
              titulo="Clientes bloqueados"
              valor={String(dados.bloqueados.size)}
              detalhe="sem acesso aos módulos pagos"
              tom={dados.bloqueados.size ? "vermelho" : "neutro"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="cartao space-y-3 p-4">
              <div className="flex items-center gap-2">
                <h2 className="mr-auto font-semibold text-[var(--marca)]">Inadimplência por tempo de atraso</h2>
                <Link className="btn-link text-sm" href="/licencas/inadimplentes">
                  Ver inadimplentes
                </Link>
              </div>
              <ul className="space-y-2">
                {numeros.faixas.map((f) => {
                  const pct = numeros.atraso ? Math.round((f.valor / numeros.atraso) * 100) : 0;
                  return (
                    <li key={f.faixa}>
                      <div className="flex justify-between text-sm">
                        <span>{f.nome}</span>
                        <span className="tabular-nums">
                          {brl(f.valor)}{" "}
                          <span className="text-xs text-neutral-500">
                            · {f.quantidade} mens. · {f.clientes} cliente(s)
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-neutral-100">
                        <div className="h-2 rounded-full bg-red-600/80" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!numeros.atraso && <p className="text-sm text-emerald-800">Ninguém atrasado. Ótimo!</p>}
            </section>

            <section className="cartao space-y-3 p-4">
              <h2 className="font-semibold text-[var(--marca)]">Últimos 6 meses</h2>
              <GraficoMeses pontos={numeros.grafico} />
            </section>
          </div>

          {numeros.reajustes.length > 0 && (
            <section className="cartao space-y-2 p-4">
              <h2 className="font-semibold text-[var(--marca)]">Reajustes a fazer</h2>
              <p className="text-sm text-neutral-600">
                Contratos que já completaram 12 meses no mês do reajuste. Abra o contrato e aplique o índice do período.
              </p>
              <ul className="divide-y divide-[var(--borda)] text-sm">
                {numeros.reajustes.map(({ k, prevista }) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="mr-auto font-medium">{nomeDoCliente(k.cliente_id)}</span>
                    <span className="text-neutral-600">
                      {k.reajuste_indice} · desde {fmtData(prevista)} · hoje {brl(k.valor_mensal)}
                    </span>
                    <Link className="btn !min-h-8" href={`/licencas/contratos?cliente=${k.cliente_id}`}>
                      Abrir contrato
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
