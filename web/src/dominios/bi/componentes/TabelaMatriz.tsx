// Tabela da DRE ou do DFC no padrão de demonstrativo da MDC (estilo .demo em globals.css): um mês por coluna e o total,
// em três níveis — linha do relatório → conta do plano (bi_relatorio_contas) → documentos que formam o saldo
// (bi_origem, carregados ao abrir a conta). Clique num valor abre a janela de origem com busca, PDF e Excel. No celular
// só o total. Exporta PDF e Excel do que está aberto na tela.
"use client";

import { useState } from "react";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { traduzirErro } from "@/lib/erros";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Icone } from "@/components/ui/Icone";
import { analiseVertical, fmtVariacao } from "../comparar";
import { lerOrigem } from "../dados";
import { contaDoClique } from "../detalhe";
import type { ContaMatriz } from "../detalhe";
import { documentosNosMeses, fmtCelula, RESULTADOS } from "../formatoMatriz";
import type { DocumentoMatriz } from "../formatoMatriz";
import type { LinhaMatriz, Matriz, TipoRelatorio } from "../relatorio";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";
import type { PedidoOrigem } from "./JanelaOrigem";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : fmtVariacao(v).replace("+", ""));
/** Documentos mostrados dentro da tabela; o resto abre na janela. */
const DOCS_NA_TABELA = 30;

type Linha = LinhaMatriz & { nivel: 0 | 1 | 2; conta?: ContaMatriz; doc?: DocumentoMatriz };
type EstadoDocs = { carregando: true } | { erro: string } | { docs: DocumentoMatriz[]; quantos: number };

/** Célula de valor: clicável quando há o que mostrar (abre a origem). */
function Celula({
  v,
  centavos,
  aoClicar,
  dica,
  extra = "",
}: {
  v: number;
  centavos: boolean;
  aoClicar?: () => void;
  dica: string;
  extra?: string;
}) {
  const texto = fmtCelula(v, centavos);
  return (
    <td className={`demo-num ${v < 0 ? "neg" : ""} ${extra}`}>
      {aoClicar && texto !== "–" ? (
        <button type="button" className="demo-clique" onClick={aoClicar} title={dica} aria-label={dica}>
          {texto}
        </button>
      ) : (
        texto
      )}
    </td>
  );
}

export function TabelaMatriz({
  m,
  rel,
  titulo,
  c,
  contas,
  aoAbrir,
}: {
  m: Matriz;
  rel: TipoRelatorio;
  titulo: string;
  c: ContextoBi;
  /** Contas do plano por linha (sem elas, a linha não abre). */
  contas?: Map<string, ContaMatriz[]>;
  /** Clique num valor de linha analítica ou de conta: abre a origem. */
  aoAbrir?: (p: PedidoOrigem) => void;
}) {
  const [vertical, setVertical] = useState(rel === "dre");
  const [centavos, setCentavos] = useState(false);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [docsAbertos, setDocsAbertos] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Map<string, EstadoDocs>>(new Map());
  const av = analiseVertical(m);
  const receita = m.linhas.find((l) => l.codigo === "receita_liquida")?.total ?? 0;
  const comVertical = rel === "dre" && vertical;
  const comContas = m.linhas.filter((l) => !l.subtotal && (contas?.get(l.codigo)?.length ?? 0) > 0).map((l) => l.codigo);
  const todasAbertas = comContas.length > 0 && comContas.every((k) => abertas.has(k));
  const nomeDaLinha = (codigo: string) => m.linhas.find((x) => x.codigo === codigo)?.nome ?? "";

  const alternar = (k: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function alternarDocs(cm: ContaMatriz) {
    const k = cm.codigo;
    const n = new Set(docsAbertos);
    if (n.has(k)) {
      n.delete(k);
      setDocsAbertos(n);
      return;
    }
    n.add(k);
    setDocsAbertos(n);
    const atual = docs.get(k);
    if (atual && !("erro" in atual)) return;
    setDocs((d) => new Map(d).set(k, { carregando: true }));
    try {
      const linhas = await lerOrigem(rel, c.ids, c.de, c.ate, c.elimina, cm.linha, contaDoClique(cm), null);
      const todos = documentosNosMeses(linhas ?? [], m.meses, c.ids.length > 1);
      setDocs((d) => new Map(d).set(k, { docs: todos.slice(0, DOCS_NA_TABELA), quantos: todos.length }));
    } catch (e) {
      setDocs((d) => new Map(d).set(k, { erro: traduzirErro(e) }));
    }
  }

  const visiveis: Linha[] = m.linhas.flatMap((l) => [
    { ...l, nivel: 0 as const },
    ...(abertas.has(l.codigo)
      ? (contas?.get(l.codigo) ?? []).flatMap((cm) => {
          const est = docs.get(cm.codigo);
          const filhos: Linha[] =
            docsAbertos.has(cm.codigo) && est && "docs" in est
              ? est.docs.map((d) => ({
                  codigo: `${cm.codigo}:${d.chave}`,
                  nome: d.rotulo,
                  subtotal: false,
                  valores: d.valores,
                  total: d.total,
                  nivel: 2 as const,
                  doc: d,
                }))
              : [];
          return [{ ...cm, nivel: 1 as const, conta: cm }, ...filhos];
        })
      : []),
  ]);
  const verticalDe = (l: Linha) => (l.nivel > 0 ? (receita ? l.total / receita : null) : av.get(l.codigo));

  const abrir = (l: Linha, mes: string | null, v: number) =>
    aoAbrir && !l.subtotal && l.nivel < 2
      ? () =>
          aoAbrir({
            linha: l.conta ? l.conta.linha : l.codigo,
            conta: contaDoClique(l.conta ?? null),
            mes,
            titulo: l.conta ? `${nomeDaLinha(l.conta.linha)} · ${l.nome}` : l.nome,
            valor: v,
          })
      : undefined;

  const colunas: ColunaLista<Linha>[] = [
    { titulo: "Conta", valor: (l) => `${"    ".repeat(l.nivel)}${l.nome}`, peso: 3.2, largura: 56 },
    ...m.meses.map((mes, i) => ({
      titulo: rotuloMes(mes),
      valor: (l: Linha) => l.valores[i],
      formato: "moeda" as const,
      alerta: (l: Linha) => l.valores[i] < 0,
    })),
    { titulo: "Total", valor: (l) => l.total, formato: "moeda", peso: 1.2, alerta: (l) => l.total < 0 },
    ...(comVertical ? [{ titulo: "% receita", valor: (l: Linha) => pct(verticalDe(l)), peso: 0.8 }] : []),
  ];

  const classe = (l: Linha) =>
    l.nivel === 2
      ? "demo-nivel2"
      : l.nivel === 1
        ? "demo-nivel1"
        : RESULTADOS.has(l.codigo)
          ? "demo-resultado"
          : l.subtotal
            ? "demo-subtotal"
            : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-[var(--marca)]">{titulo}</h2>
          <p className="text-sm text-[var(--texto-suave)]">
            {c.quem} · {c.rotuloPeriodo}
            {textoEliminacao(c)} · valores em R${centavos ? "" : ", sem centavos"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rel === "dre" && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} />% da receita
            </label>
          )}
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={centavos} onChange={(e) => setCentavos(e.target.checked)} />
            Centavos
          </label>
          {comContas.length > 0 && (
            <button type="button" className="btn" onClick={() => setAbertas(todasAbertas ? new Set() : new Set(comContas))}>
              <Icone nome={todasAbertas ? "seta-cima" : "chevron-baixo"} className="h-4 w-4" />
              {todasAbertas ? "Fechar as contas" : "Abrir as contas"}
            </button>
          )}
          <BotoesExportar
            vazio={!m.linhas.length}
            avisar={c.avisar}
            montar={() => ({
              titulo: `${titulo} · ${c.quem}`,
              subtitulo: `${c.rotuloPeriodo}${textoEliminacao(c)}`,
              arquivo: nomeArquivo(rel === "dre" ? "DRE-gerencial" : "Fluxo-de-caixa", c.quem, c.hoje),
              logoUrl: c.logoUrl,
              paisagem: true,
              linhas: visiveis,
              colunas,
            })}
          />
        </div>
      </div>

      <div className="demo-quadro" tabIndex={0} role="region" aria-label={titulo}>
        <table className="demo">
          <thead>
            <tr>
              <th>Conta</th>
              {m.meses.map((mes) => (
                <th key={mes} className="hidden md:table-cell">
                  {rotuloMes(mes)}
                </th>
              ))}
              <th className="demo-total">Total</th>
              {comVertical && <th>% rec.</th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const abreContas = l.nivel === 0 && comContas.includes(l.codigo);
              const abreDocs = l.nivel === 1 && !!l.conta;
              const aberto = abreContas ? abertas.has(l.codigo) : abreDocs ? docsAbertos.has(l.codigo) : false;
              const est = abreDocs ? docs.get(l.codigo) : undefined;
              return (
                <LinhaDemonstrativo
                  key={l.codigo}
                  l={l}
                  classe={classe(l)}
                  aberto={aberto}
                  podeAbrir={abreContas || abreDocs}
                  aoAlternar={() => (abreContas ? alternar(l.codigo) : l.conta && alternarDocs(l.conta))}
                  dicaAbrir={abreContas ? "Abrir nas contas do plano" : "Ver os documentos desta conta"}
                  meses={m.meses}
                  centavos={centavos}
                  abrir={abrir}
                  comVertical={comVertical}
                  vertical={pct(verticalDe(l))}
                  rodape={
                    abreDocs && aberto && est ? (
                      <RodapeDocs
                        est={est}
                        colunas={m.meses.length + 1 + (comVertical ? 1 : 0)}
                        aoVerTodos={() => abrir(l, null, l.total)?.()}
                      />
                    ) : null
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--texto-suave)]">
        Clique na seta para abrir a linha nas contas do plano e, em cada conta, nos documentos (notas e contas a pagar/receber) que formam o
        saldo. Clique num valor para ver todos os lançamentos com busca, PDF e Excel. No celular aparece só o total.
      </p>
    </div>
  );
}

/** Uma linha da tabela (qualquer nível) + a linha de aviso dos documentos logo abaixo, quando houver. */
function LinhaDemonstrativo({
  l,
  classe,
  aberto,
  podeAbrir,
  aoAlternar,
  dicaAbrir,
  meses,
  centavos,
  abrir,
  comVertical,
  vertical,
  rodape,
}: {
  l: Linha;
  classe: string;
  aberto: boolean;
  podeAbrir: boolean;
  aoAlternar: () => void;
  dicaAbrir: string;
  meses: string[];
  centavos: boolean;
  abrir: (l: Linha, mes: string | null, v: number) => (() => void) | undefined;
  comVertical: boolean;
  vertical: string;
  rodape: React.ReactNode;
}) {
  return (
    <>
      <tr className={classe}>
        <td className="demo-conta" title={l.doc?.titulo ?? l.nome}>
          {podeAbrir ? (
            <button
              type="button"
              onClick={aoAlternar}
              aria-expanded={aberto}
              title={dicaAbrir}
              className="text-left hover:text-[var(--destaque-escuro)]"
            >
              <span className="flex items-start gap-1">
                <Icone nome={aberto ? "chevron-baixo" : "chevron-direita"} className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{l.nome}</span>
              </span>
            </button>
          ) : (
            <span className={`block ${l.nivel === 0 ? "pl-[1.1rem]" : ""}`}>{l.nome}</span>
          )}
        </td>
        {l.valores.map((v, i) => (
          <Celula
            key={meses[i]}
            v={v}
            centavos={centavos}
            extra="hidden md:table-cell"
            aoClicar={abrir(l, meses[i], v)}
            dica={`Ver de onde vem: ${l.nome}, ${rotuloMes(meses[i])}`}
          />
        ))}
        <Celula v={l.total} centavos={centavos} extra="demo-total" aoClicar={abrir(l, null, l.total)} dica={`Ver de onde vem: ${l.nome}`} />
        {comVertical && <td className="demo-pct">{vertical}</td>}
      </tr>
      {rodape}
    </>
  );
}

/** Situação dos documentos abertos de uma conta: carregando, erro, nenhum ou "mostrando 30 de N". */
function RodapeDocs({ est, colunas, aoVerTodos }: { est: EstadoDocs; colunas: number; aoVerTodos: () => void }) {
  let texto: React.ReactNode = null;
  if ("carregando" in est) texto = "Carregando os documentos…";
  else if ("erro" in est) texto = <span className="text-[var(--perigo)]">{est.erro}</span>;
  else if (!est.quantos) texto = "Nenhum documento nesta conta no período.";
  else if (est.quantos > est.docs.length)
    texto = (
      <>
        Mostrando os {est.docs.length} maiores de {est.quantos.toLocaleString("pt-BR")} documentos ·{" "}
        <button type="button" className="font-semibold text-[var(--destaque-escuro)] hover:underline" onClick={aoVerTodos}>
          ver todos
        </button>
      </>
    );
  if (!texto) return null;
  return (
    <tr className="demo-nivel2">
      <td className="demo-conta italic">{texto}</td>
      <td colSpan={colunas} className="hidden md:table-cell" />
    </tr>
  );
}
