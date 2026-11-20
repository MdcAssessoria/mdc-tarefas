// Janela "De onde vem este valor": abre ao clicar num valor da DRE ou do DFC e lista as notas, impostos das notas,
// títulos, pagamentos e lançamentos complementares que formam o número (bi_origem, migração 104), com PDF e Excel.
"use client";

import { useCallback, useMemo, useState } from "react";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { useConsulta } from "@/lib/useConsulta";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { lerOrigem } from "../dados";
import { NOME_ORIGEM } from "../detalhe";
import type { OrigemBanco } from "../detalhe";
import type { TipoRelatorio } from "../relatorio";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";

export interface PedidoOrigem {
  linha: string;
  /** Conta do plano, "-" (sem conta) ou null (a linha inteira). */
  conta: string | null;
  /** "AAAA-MM" ou null (o período inteiro). */
  mes: string | null;
  /** O que foi clicado: "Despesas com pessoal · 6.1.01 Salários". */
  titulo: string;
  valor: number;
}

const LIMITE = 5000;

export function JanelaOrigem({ rel, p, c, aoFechar }: { rel: TipoRelatorio; p: PedidoOrigem; c: ContextoBi; aoFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const r = useConsulta(
    useCallback(
      () => lerOrigem(rel, c.ids, c.de, c.ate, c.elimina, p.linha, p.conta, p.mes),
      [rel, c.ids, c.de, c.ate, c.elimina, p.linha, p.conta, p.mes],
    ),
  );
  const quando = p.mes ? rotuloMes(p.mes) : c.rotuloPeriodo;
  const varias = c.ids.length > 1;
  const termo = busca.trim().toLowerCase();
  const linhas = useMemo(
    () =>
      (r.dados ?? []).filter(
        (o) => !termo || [o.documento, o.pessoa, o.doc, o.categoria, o.empresa].some((x) => (x ?? "").toLowerCase().includes(termo)),
      ),
    [r.dados, termo],
  );
  const soma = linhas.reduce((a, o) => a + Number(o.valor), 0);

  const colunas: ColunaLista<OrigemBanco>[] = [
    ...(varias ? [{ titulo: "Empresa", valor: (o: OrigemBanco) => o.empresa, peso: 1.4 }] : []),
    { titulo: "Origem", valor: (o) => NOME_ORIGEM[o.origem] ?? o.origem, peso: 1.2 },
    { titulo: "Data", valor: (o) => (o.data ? fmtData(o.data) : ""), peso: 0.8 },
    { titulo: "Documento", valor: (o) => o.documento ?? "", peso: 0.9 },
    { titulo: "Cliente/fornecedor", valor: (o) => o.pessoa ?? "", peso: 2.2, largura: 36 },
    { titulo: "Categoria do Omie", valor: (o) => o.categoria ?? "", peso: 2, largura: 34 },
    { titulo: "Conta do plano", valor: (o) => o.conta ?? "", peso: 0.8 },
    { titulo: "Valor", valor: (o) => Number(o.valor), formato: "moeda", alerta: (o) => o.valor < 0 },
  ];

  return (
    <Modal
      titulo="De onde vem este valor"
      descricao={`${p.titulo} · ${quando}`}
      largura="6xl"
      celularCheio
      aoFechar={aoFechar}
      rodape={
        <button type="button" className="btn" onClick={aoFechar}>
          <Icone nome="voltar" className="h-4 w-4" />
          Voltar
        </button>
      }
    >
      {r.erro ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {r.erro}
        </p>
      ) : !r.dados ? (
        <Esqueleto />
      ) : !r.dados.length ? (
        <EstadoVazio icone="documento" titulo="Nenhum lançamento encontrado">
          O valor não tem notas nem títulos no período escolhido.
        </EstadoVazio>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="campo flex-1">
              <span>Procurar</span>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número, cliente, fornecedor ou categoria"
              />
            </label>
            <BotoesExportar
              vazio={!linhas.length}
              avisar={c.avisar}
              montar={() => ({
                titulo: `Origem · ${p.titulo}`,
                subtitulo: `${c.quem} · ${quando}${textoEliminacao(c)}`,
                arquivo: nomeArquivo("BI-origem", p.titulo, c.hoje),
                logoUrl: c.logoUrl,
                paisagem: true,
                linhas,
                colunas,
                totais: { Valor: Math.round(soma * 100) / 100 },
              })}
            />
          </div>
          <p className="text-sm text-[var(--texto-suave)]">
            {linhas.length.toLocaleString("pt-BR")} lançamento(s) somando <Valor v={soma} />
            {!termo && Math.abs(soma - p.valor) >= 0.05 && r.dados.length < LIMITE && (
              <>
                {" "}
                · o valor da tabela é <Valor v={p.valor} />
              </>
            )}
            {r.dados.length >= LIMITE && " · mostrando os 5.000 maiores; exporte ou reduza o período para ver todos"}
          </p>
          <QuadroTabela rotulo="Lançamentos de origem">
            <thead>
              <tr>
                {varias && <th>Empresa</th>}
                <th>Origem</th>
                <th>Data</th>
                <th>Documento</th>
                <th>Cliente/fornecedor</th>
                <th>Categoria do Omie</th>
                <th>Conta</th>
                <th className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((o, i) => (
                <tr key={`${o.origem}-${o.documento}-${i}`}>
                  {varias && <td data-rotulo="Empresa">{o.empresa}</td>}
                  <td data-rotulo="Origem">{NOME_ORIGEM[o.origem] ?? o.origem}</td>
                  <td data-rotulo="Data" className="num whitespace-nowrap">
                    {o.data ? fmtData(o.data) : "—"}
                  </td>
                  <td data-rotulo="Documento">{o.documento || "—"}</td>
                  <td data-rotulo="Cliente/fornecedor" className="celula-titulo">
                    {o.pessoa || "—"}
                  </td>
                  <td data-rotulo="Categoria do Omie">{o.categoria || "—"}</td>
                  <td data-rotulo="Conta" className="num">
                    {o.conta || "—"}
                  </td>
                  <td data-rotulo="Valor" className="text-right">
                    <Valor v={Number(o.valor)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </QuadroTabela>
        </>
      )}
    </Modal>
  );
}
