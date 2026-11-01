// As quatro visões da tela de Relatórios (resultado de caixa, realizado x previsto, pagos e recebidos, centros de
// custo). Cada uma recebe os dados já lidos e calculados (relatorios.ts) e exporta exatamente o que mostra.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { BotoesExportar, Chip, Indicador, Valor } from "./Comuns";
import { GraficoMeses } from "./GraficosPainel";
import { rotuloMes } from "../painel";
import type { LinhaCentro, LinhaPagoRecebido, LinhaResultado, MesFluxo, ResultadoDeCaixa } from "../relatorios";
import type { ListaExportavel } from "../exportar";

type Avisar = (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
/** O que toda visão recebe: cabeçalho dos arquivos (empresa e período) e como avisar. */
export interface BaseVisao {
  subtitulo: string;
  arquivo: (nome: string) => string;
  logoUrl: string | null;
  avisar: Avisar;
}

const pct = (v?: number) => (v === undefined ? "" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Topo<L>({ titulo, frase, exportar, avisar }: { titulo: string; frase: string; exportar: () => ListaExportavel<L>; avisar: Avisar }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold text-[var(--marca)]">{titulo}</h2>
        <p className="text-sm text-[var(--texto-suave)]">{frase}</p>
      </div>
      <div className="flex gap-2">
        <BotoesExportar vazio={false} avisar={avisar} montar={exportar} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ resultado de caixa

export function VisaoResultado({ r, linhas, base }: { r: ResultadoDeCaixa; linhas: LinhaResultado[]; base: BaseVisao }) {
  if (!r.receitas.length && !r.despesas.length)
    return (
      <EstadoVazio icone="grafico" titulo="Nada pago ou recebido neste período">
        O resultado de caixa usa os pagamentos e recebimentos registrados em Contas a pagar e a receber. Troque o período.
      </EstadoVazio>
    );
  return (
    <div className="space-y-4">
      <Topo
        titulo="Resultado de caixa"
        frase={`Entrou ${brl(r.totalReceitas)} em receitas e saiu ${brl(r.totalDespesas)} em despesas; ${r.resultado >= 0 ? "sobrou" : "faltou"} ${brl(Math.abs(r.resultado))}. É a DRE gerencial pelo dinheiro que passou no banco.`}
        avisar={base.avisar}
        exportar={() => ({
          titulo: "Resultado de caixa (DRE gerencial)",
          subtitulo: base.subtitulo,
          arquivo: base.arquivo("Resultado-de-caixa"),
          logoUrl: base.logoUrl,
          paisagem: false,
          linhas,
          colunas: [
            { titulo: "Descrição", valor: (l) => `${"   ".repeat(l.nivel)}${l.nome}`, peso: 4, largura: 50 },
            { titulo: "Valor", valor: (l) => l.valor, formato: "moeda", peso: 1.4, alerta: (l) => l.valor < 0 },
            { titulo: "% do grupo", valor: (l) => pct(l.parte), peso: 1, largura: 12 },
          ],
        })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador titulo="Receitas" icone="seta-entrada" valor={brl(r.totalReceitas)} tom="verde" />
        <Indicador titulo="Despesas" icone="seta-saida" valor={brl(r.totalDespesas)} tom="vermelho" />
        <Indicador
          titulo={r.resultado >= 0 ? "Sobrou" : "Faltou"}
          icone="tendencia"
          valor={brl(r.resultado)}
          detalhe={r.financeiro ? `Inclui ${brl(r.financeiro)} de juros e descontos` : undefined}
          tom={r.resultado < 0 ? "vermelho" : "neutro"}
        />
      </div>
      <QuadroTabela rotulo="Resultado de caixa" cartoes={false}>
        <thead>
          <tr>
            <th>Descrição</th>
            <th className="text-right">Valor</th>
            <th className="hidden text-right sm:table-cell">% do total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className={l.nivel === 0 ? "bg-[var(--fundo)]" : ""}>
              <td
                className={`celula-titulo ${l.nivel === 0 ? "font-semibold text-[var(--marca)]" : l.nivel === 1 ? "font-medium" : "!font-normal text-[var(--texto-suave)]"}`}
                style={{ paddingLeft: `${0.75 + l.nivel * 1.1}rem` }}
              >
                {l.nome}
              </td>
              <td data-rotulo="Valor" className={`whitespace-nowrap text-right ${l.nivel === 0 ? "font-semibold" : ""}`}>
                <Valor v={l.valor} />
              </td>
              <td className="num hidden text-right text-[var(--texto-suave)] sm:table-cell">
                {pct(l.parte)}
              </td>
            </tr>
          ))}
        </tbody>
      </QuadroTabela>
    </div>
  );
}

// ------------------------------------------------------------------ realizado x previsto

export function VisaoFluxo({ meses, base }: { meses: MesFluxo[]; base: BaseVisao }) {
  const soma = (k: keyof Omit<MesFluxo, "mes">) => meses.reduce((a, m) => a + m[k], 0);
  if (!meses.some((m) => m.entrou || m.saiu || m.previstoEntrar || m.previstoSair))
    return (
      <EstadoVazio icone="tendencia" titulo="Sem movimento neste período">
        Lance contas a pagar e a receber e registre os pagamentos para comparar o previsto com o realizado.
      </EstadoVazio>
    );
  const t = { pe: soma("previstoEntrar"), e: soma("entrou"), ps: soma("previstoSair"), s: soma("saiu"), r: soma("resultado") };
  return (
    <div className="space-y-4">
      <Topo
        titulo="Fluxo de caixa: realizado x previsto"
        frase={`Previsto entrar ${brl(t.pe)} e entrou ${brl(t.e)}; previsto sair ${brl(t.ps)} e saiu ${brl(t.s)}. O previsto é pelo vencimento das contas; o realizado, pelos pagamentos.`}
        avisar={base.avisar}
        exportar={() => ({
          titulo: "Fluxo de caixa: realizado x previsto",
          subtitulo: base.subtitulo,
          arquivo: base.arquivo("Fluxo-realizado-x-previsto"),
          logoUrl: base.logoUrl,
          linhas: meses,
          colunas: [
            { titulo: "Mês", valor: (m) => rotuloMes(m.mes), peso: 1, largura: 10 },
            { titulo: "Previsto entrar", valor: (m) => m.previstoEntrar, formato: "moeda", peso: 1.3 },
            { titulo: "Entrou", valor: (m) => m.entrou, formato: "moeda", peso: 1.3 },
            { titulo: "Previsto sair", valor: (m) => m.previstoSair, formato: "moeda", peso: 1.3 },
            { titulo: "Saiu", valor: (m) => m.saiu, formato: "moeda", peso: 1.3 },
            { titulo: "Resultado", valor: (m) => m.resultado, formato: "moeda", peso: 1.3, alerta: (m) => m.resultado < 0 },
          ],
          totais: { "Previsto entrar": t.pe, Entrou: t.e, "Previsto sair": t.ps, Saiu: t.s, Resultado: t.r },
        })}
      />
      {meses.length > 1 && (
        <div className="cartao p-4 sm:p-5">
          <GraficoMeses meses={meses.slice(-12)} />
        </div>
      )}
      <QuadroTabela rotulo="Realizado x previsto por mês">
        <thead>
          <tr>
            <th>Mês</th>
            <th className="text-right">Previsto entrar</th>
            <th className="text-right">Entrou</th>
            <th className="text-right">Previsto sair</th>
            <th className="text-right">Saiu</th>
            <th className="text-right">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <td className="celula-titulo">{rotuloMes(m.mes)}</td>
              <td data-rotulo="Previsto entrar" className="text-right text-[var(--texto-suave)]">
                <Valor v={m.previstoEntrar} />
              </td>
              <td data-rotulo="Entrou" className="text-right">
                <Valor v={m.entrou} sinal />
              </td>
              <td data-rotulo="Previsto sair" className="text-right text-[var(--texto-suave)]">
                <Valor v={m.previstoSair} />
              </td>
              <td data-rotulo="Saiu" className="text-right">
                <Valor v={-m.saiu} />
              </td>
              <td data-rotulo="Resultado" className="text-right font-medium">
                <Valor v={m.resultado} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="celula-titulo">Total</td>
            <td data-rotulo="Previsto entrar" className="text-right">
              <Valor v={t.pe} />
            </td>
            <td data-rotulo="Entrou" className="text-right">
              <Valor v={t.e} />
            </td>
            <td data-rotulo="Previsto sair" className="text-right">
              <Valor v={t.ps} />
            </td>
            <td data-rotulo="Saiu" className="text-right">
              <Valor v={-t.s} />
            </td>
            <td data-rotulo="Resultado" className="text-right">
              <Valor v={t.r} />
            </td>
          </tr>
        </tfoot>
      </QuadroTabela>
    </div>
  );
}

// ------------------------------------------------------------------ pagos e recebidos

export function VisaoPagos({
  linhas,
  nomes,
  base,
}: {
  linhas: LinhaPagoRecebido[];
  nomes: { pessoa: (id: string | null) => string; categoria: (id: string) => string; conta: (id: string) => string };
  base: BaseVisao;
}) {
  const [tipo, setTipo] = useState<"" | "receber" | "pagar">("");
  const lista = linhas.filter((l) => !tipo || l.tipo === tipo);
  const recebido = linhas.filter((l) => l.total > 0).reduce((a, l) => a + l.total, 0);
  const pago = -linhas.filter((l) => l.total < 0).reduce((a, l) => a + l.total, 0);
  if (!linhas.length)
    return (
      <EstadoVazio icone="check" titulo="Nada pago ou recebido neste período">
        Os pagamentos e recebimentos entram aqui quando você dá baixa em Contas a pagar e a receber.
      </EstadoVazio>
    );
  return (
    <div className="space-y-4">
      <Topo
        titulo="Contas pagas e recebidas"
        frase={`${linhas.length} pagamento(s) e recebimento(s): recebido ${brl(recebido)}, pago ${brl(pago)}.`}
        avisar={base.avisar}
        exportar={() => ({
          titulo: tipo === "receber" ? "Contas recebidas" : tipo === "pagar" ? "Contas pagas" : "Contas pagas e recebidas",
          subtitulo: base.subtitulo,
          arquivo: base.arquivo("Pagas-e-recebidas"),
          logoUrl: base.logoUrl,
          linhas: lista,
          colunas: [
            { titulo: "Data", valor: (l) => fmtData(l.data), peso: 1, largura: 12 },
            { titulo: "Tipo", valor: (l) => (l.tipo === "receber" ? "Recebido" : "Pago"), peso: 0.9, largura: 10 },
            { titulo: "Descrição", valor: (l) => l.descricao, peso: 2.6, largura: 36 },
            { titulo: "Fornecedor/cliente", valor: (l) => nomes.pessoa(l.pessoaId), peso: 2, largura: 28 },
            { titulo: "Categoria", valor: (l) => nomes.categoria(l.categoriaId), peso: 1.6, largura: 24 },
            { titulo: "Conta", valor: (l) => nomes.conta(l.contaId), peso: 1.4, largura: 20 },
            { titulo: "Juros/multa", valor: (l) => l.encargos || null, formato: "moeda", peso: 1 },
            { titulo: "Desconto", valor: (l) => l.desconto || null, formato: "moeda", peso: 1 },
            { titulo: "Total", valor: (l) => l.total, formato: "moeda", peso: 1.2, alerta: (l) => l.total < 0 },
          ],
          totais: { Total: lista.reduce((a, l) => a + l.total, 0) },
        })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Recebido"
          icone="seta-entrada"
          valor={brl(recebido)}
          tom="verde"
          ativo={tipo === "receber"}
          aoClicar={() => setTipo(tipo === "receber" ? "" : "receber")}
        />
        <Indicador
          titulo="Pago"
          icone="seta-saida"
          valor={brl(pago)}
          tom="vermelho"
          ativo={tipo === "pagar"}
          aoClicar={() => setTipo(tipo === "pagar" ? "" : "pagar")}
        />
        <Indicador titulo="Diferença" icone="tendencia" valor={brl(recebido - pago)} tom={recebido - pago < 0 ? "vermelho" : "neutro"} />
      </div>
      <QuadroTabela rotulo="Contas pagas e recebidas">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Conta</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((l) => (
            <tr key={l.id}>
              <td data-rotulo="Data" className="num whitespace-nowrap">
                {fmtData(l.data)}
              </td>
              <td className="celula-titulo min-w-56">
                <span className="flex flex-wrap items-center gap-2">
                  {l.descricao}
                  <Chip tom={l.tipo === "receber" ? "verde" : "ambar"}>{l.tipo === "receber" ? "Recebido" : "Pago"}</Chip>
                </span>
                <span className="block text-xs font-normal text-[var(--texto-suave)]">
                  {[nomes.categoria(l.categoriaId), nomes.pessoa(l.pessoaId)].filter(Boolean).join(" · ")}
                  {l.encargos ? ` · juros/multa ${brl(l.encargos)}` : ""}
                  {l.desconto ? ` · desconto ${brl(l.desconto)}` : ""}
                </span>
              </td>
              <td data-rotulo="Conta" className="whitespace-nowrap">
                {nomes.conta(l.contaId)}
              </td>
              <td data-rotulo="Total" className="whitespace-nowrap text-right font-medium">
                <Valor v={l.total} sinal />
              </td>
            </tr>
          ))}
        </tbody>
      </QuadroTabela>
    </div>
  );
}

// ------------------------------------------------------------------ centros de custo

export function VisaoCentros({ linhas, nomeCentro, base }: { linhas: LinhaCentro[]; nomeCentro: (id: string) => string; base: BaseVisao }) {
  if (!linhas.length)
    return (
      <EstadoVazio icone="etiqueta" titulo="Nada pago ou recebido neste período">
        Escolha o centro de custo ao lançar as contas a pagar e a receber para ver aqui quanto cada área gastou.
      </EstadoVazio>
    );
  const totalDesp = linhas.reduce((a, x) => a + x.despesas, 0);
  const maior = linhas.find((x) => x.id);
  return (
    <div className="space-y-4">
      <Topo
        titulo="Despesas por centro de custo"
        frase={
          maior
            ? `${nomeCentro(maior.id)} é o centro que mais gastou: ${brl(maior.despesas)} (${pct(maior.parteDespesas)} das despesas).`
            : "Nenhuma conta deste período tem centro de custo. Escolha o centro ao lançar."
        }
        avisar={base.avisar}
        exportar={() => ({
          titulo: "Despesas por centro de custo",
          subtitulo: base.subtitulo,
          arquivo: base.arquivo("Centros-de-custo"),
          logoUrl: base.logoUrl,
          paisagem: false,
          linhas,
          colunas: [
            { titulo: "Centro de custo", valor: (x) => nomeCentro(x.id), peso: 2.6, largura: 34 },
            { titulo: "Receitas", valor: (x) => x.receitas, formato: "moeda", peso: 1.3 },
            { titulo: "Despesas", valor: (x) => x.despesas, formato: "moeda", peso: 1.3 },
            { titulo: "Resultado", valor: (x) => x.resultado, formato: "moeda", peso: 1.3, alerta: (x) => x.resultado < 0 },
            { titulo: "% das despesas", valor: (x) => pct(x.parteDespesas), peso: 1, largura: 14 },
          ],
          totais: {
            Receitas: linhas.reduce((a, x) => a + x.receitas, 0),
            Despesas: totalDesp,
            Resultado: linhas.reduce((a, x) => a + x.resultado, 0),
          },
        })}
      />
      <QuadroTabela rotulo="Despesas por centro de custo">
        <thead>
          <tr>
            <th>Centro de custo</th>
            <th className="text-right">Receitas</th>
            <th className="text-right">Despesas</th>
            <th className="text-right">Resultado</th>
            <th>Parte das despesas</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((x) => (
            <tr key={x.id || "_sem"}>
              <td className={`celula-titulo ${x.id ? "" : "italic text-[var(--texto-suave)]"}`}>{nomeCentro(x.id)}</td>
              <td data-rotulo="Receitas" className="text-right">
                <Valor v={x.receitas} />
              </td>
              <td data-rotulo="Despesas" className="text-right">
                <Valor v={-x.despesas} />
              </td>
              <td data-rotulo="Resultado" className="text-right font-medium">
                <Valor v={x.resultado} />
              </td>
              <td data-rotulo="Parte das despesas" className="min-w-40">
                <span className="flex w-full items-center gap-2">
                  <span className="h-2 flex-1 rounded-full bg-[var(--fundo)]">
                    <span className="block h-2 rounded-full bg-[#C0892A]" style={{ width: `${Math.max(1, x.parteDespesas * 100)}%` }} />
                  </span>
                  <span className="num w-12 text-right text-xs text-[var(--texto-suave)]">{pct(x.parteDespesas)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </QuadroTabela>
    </div>
  );
}
