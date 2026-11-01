// Importação em lote na tela "Importar balancete": lista os arquivos lidos (arquivo · empresa · competência ·
// situação), deixa escolher a empresa quando não foi reconhecida e marcar se substitui o rascunho, e o botão
// "Importar todos" grava um por um pelo mesmo caminho do import de um arquivo (salvarBalancete), com barra de progresso.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import type { Cliente } from "@/dominios/clientes/tipos";
import { classificar } from "@/dominios/demonstrativos/balancete/classificacao";
import { lerBalancete } from "@/dominios/demonstrativos/balancete/leitura";
import type { Grupo } from "@/dominios/demonstrativos/balancete/tipos";
import {
  SITUACOES,
  avaliarLote,
  competenciaDoArquivo,
  descreverPeriodo,
  identificarEmpresa,
  vaiGravar,
} from "@/dominios/demonstrativos/importacaoLote";
import type { Existente, ItemLote, ResultadoLote } from "@/dominios/demonstrativos/importacaoLote";
import { carregarMapa, salvarBalancete } from "@/dominios/demonstrativos/repositorio";
import { Aviso } from "@/components/ui/Aviso";
import { traduzirErro } from "@/lib/erros";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { ResumoLote } from "./ResumoLote";

/** Lê cada arquivo com o leitor de sempre e já tenta reconhecer a empresa e a competência. Nunca lança erro. */
export async function lerLote(arquivos: File[], clientes: Cliente[]): Promise<ItemLote[]> {
  const itens: ItemLote[] = [];
  for (const [k, arq] of arquivos.entries()) {
    const base = { chave: `${k}-${arq.name}`, arquivo: arq.name, substituir: false };
    try {
      const { abas, dados } = await lerPlanilha(arq, true);
      const leitura = lerBalancete(dados[abas[0]]);
      const c = identificarEmpresa(leitura.cabecalho, clientes);
      itens.push({
        ...base,
        leitura,
        erroLeitura: null,
        clienteId: c?.id ?? "",
        reconhecida: !!c,
        competencia: competenciaDoArquivo(leitura.cabecalho),
      });
    } catch (e) {
      itens.push({ ...base, leitura: null, erroLeitura: traduzirErro(e), clienteId: "", reconhecida: false, competencia: "" });
    }
  }
  return itens;
}

const TOM = { ok: "bg-emerald-50 text-emerald-800", atencao: "bg-amber-50 text-amber-900", erro: "bg-red-50 text-red-800" };

export function ImportacaoLote({ inicial, aoRecomecar }: { inicial: ItemLote[]; aoRecomecar: () => void }) {
  const { org, clientes } = useOrg();
  const ativos = useMemo(() => clientes.filter((c) => c.ativo || c.inativo_em), [clientes]);
  const [itens, setItens] = useState(inicial);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number; atual: string } | null>(null);
  const [resultados, setResultados] = useState<ResultadoLote[] | null>(null);

  const existentes = useConsulta(
    useCallback(
      // todos os meses já gravados (paginado: passa de 1.000 com a carteira inteira)
      async () =>
        lerTudo<Existente>((de, ate) =>
          supabase().from("portal_balancetes").select("cliente_id,competencia,status").eq("org_id", org.id).order("id").range(de, ate),
        ),
      [org.id],
    ),
  );
  const avaliacoes = useMemo(() => avaliarLote(itens, existentes.dados ?? []), [itens, existentes.dados]);
  const prontos = avaliacoes.filter(vaiGravar).length;
  const nomeDe = (id: string) =>
    nomeCliente(
      ativos.find((c) => c.id === id),
      "—",
    );
  const mudar = (chave: string, o: Partial<ItemLote>) => setItens((l) => l.map((x) => (x.chave === chave ? { ...x, ...o } : x)));

  async function importarTodos() {
    // grava em ordem de empresa e mês: os alertas comparam com o mês anterior, que precisa já estar gravado
    const fila = itens
      .map((it, k) => ({ it, av: avaliacoes[k] }))
      .sort((a, b) => (a.it.clienteId ?? "").localeCompare(b.it.clienteId ?? "") || a.it.competencia.localeCompare(b.it.competencia));
    const gravar = fila.filter((x) => vaiGravar(x.av));
    const saida: ResultadoLote[] = [];
    setProgresso({ feitos: 0, total: gravar.length, atual: "" });
    for (const { it, av } of fila) {
      const r = {
        empresa: it.clienteId ? nomeDe(it.clienteId) : (it.leitura?.cabecalho.empresa ?? "—"),
        arquivo: it.arquivo,
        competencia: it.competencia,
      };
      if (!vaiGravar(av)) {
        saida.push({ ...r, entrou: false, motivo: `${SITUACOES[av.situacao].nome}. ${av.motivo}`.trim() });
        continue;
      }
      setProgresso((p) => p && { ...p, atual: `${r.empresa} · ${it.arquivo}` });
      try {
        // mesmo caminho do import de um arquivo: aplica as regras de conta da empresa e grava o rascunho
        const linhas = it.leitura!.linhas.map((l) => ({ ...l, grupo: null }));
        classificar(linhas, (await carregarMapa(org.id, it.clienteId)) as { classificacao: string; grupo: Grupo }[]);
        const id = await salvarBalancete({
          org: org.id,
          cliente: it.clienteId,
          competencia: it.competencia + "-01",
          arquivo: it.arquivo,
          linhas,
          inicio: it.leitura!.cabecalho.inicio,
          fim: it.leitura!.cabecalho.fim,
          origem: "lote",
        });
        saida.push({ ...r, entrou: true, motivo: "", balanceteId: id });
      } catch (e) {
        saida.push({ ...r, entrou: false, motivo: traduzirErro(e) });
      }
      setProgresso((p) => p && { ...p, feitos: p.feitos + 1 });
    }
    setProgresso(null);
    setResultados(saida);
    existentes.recarregar();
  }

  if (resultados) return <ResumoLote resultados={resultados} aoRecomecar={aoRecomecar} />;

  const atencao = avaliacoes.length - prontos;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold text-[var(--marca)]">
          {itens.length} arquivo{itens.length > 1 ? "s" : ""} · {prontos} pronto{prontos === 1 ? "" : "s"}
          {atencao > 0 && (
            <span className="text-amber-800">
              {" "}
              · {atencao} precisa{atencao > 1 ? "m" : ""} de atenção
            </span>
          )}
        </h2>
        <button className="btn" onClick={aoRecomecar} disabled={!!progresso}>
          Escolher outros arquivos
        </button>
        <button className="btn-primario" onClick={importarTodos} disabled={!prontos || !!progresso || existentes.carregando}>
          {progresso ? "Importando…" : `Importar todos (${prontos})`}
        </button>
      </div>
      {existentes.erro && <Aviso>{existentes.erro}</Aviso>}

      {progresso && (
        <div className="cartao space-y-1 p-3" role="status" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span>Gravando {progresso.atual}</span>
            <b>
              {progresso.feitos} de {progresso.total}
            </b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--fundo)]">
            <div
              className="h-full bg-[var(--marca)] transition-all"
              style={{ width: `${progresso.total ? (progresso.feitos / progresso.total) * 100 : 100}%` }}
            />
          </div>
        </div>
      )}

      <ul className="cartao divide-y divide-[var(--borda)]">
        {itens.map((it, k) => {
          const av = avaliacoes[k];
          const s = SITUACOES[av.situacao];
          const cab = it.leitura?.cabecalho;
          return (
            <li key={it.chave} className="grid gap-3 p-3 md:grid-cols-[1.2fr_1.4fr_0.9fr_1.3fr_auto] md:items-start">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" title={it.arquivo}>
                  {it.arquivo}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {cab
                    ? `${cab.empresa ?? "sem nome"} · ${cab.cnpj ?? (cab.codigoEmpresa ? `código ${cab.codigoEmpresa}` : "sem CNPJ")}`
                    : "—"}
                </div>
              </div>
              <label className="campo">
                <span className="md:sr-only">Empresa</span>
                <select
                  value={it.clienteId}
                  disabled={!it.leitura || !!progresso}
                  onChange={(e) => mudar(it.chave, { clienteId: e.target.value })}
                  className={!it.clienteId && it.leitura ? "!border-amber-400" : ""}
                  aria-label={`Empresa do arquivo ${it.arquivo}`}
                >
                  <option value="">Escolha a empresa…</option>
                  {ativos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                      {nomeCliente(c)}
                    </option>
                  ))}
                </select>
                {it.reconhecida && <span className="text-[11px] text-emerald-700">reconhecida pelo cabeçalho do arquivo</span>}
              </label>
              <label className="campo">
                <span className="md:sr-only">Competência</span>
                <input
                  type="month"
                  value={it.competencia}
                  disabled={!it.leitura || !!progresso}
                  onChange={(e) => mudar(it.chave, { competencia: e.target.value })}
                  aria-label={`Competência do arquivo ${it.arquivo}`}
                />
                {cab && <span className="text-[11px] text-neutral-500">{descreverPeriodo(cab)}</span>}
              </label>
              <div className="space-y-1">
                <span className={`chip ${TOM[s.tom]}`}>{s.nome}</span>
                {av.motivo && <p className="text-xs text-neutral-600">{av.motivo}</p>}
                {(av.situacao === "ja_existe" || av.situacao === "substitui") && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={it.substituir}
                      disabled={!!progresso}
                      onChange={(e) => mudar(it.chave, { substituir: e.target.checked })}
                    />
                    Substituir o rascunho já gravado
                  </label>
                )}
              </div>
              <button
                className="btn !min-h-8 !px-2 text-xs"
                disabled={!!progresso}
                onClick={() => setItens((l) => l.filter((x) => x.chave !== it.chave))}
                title="Tirar este arquivo do lote"
              >
                Tirar
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        Cada arquivo vira um rascunho da empresa e do mês, com as regras de conta já salvas para a empresa. Nada vai para o cliente antes de
        alguém revisar e publicar. Balancete já publicado nunca é substituído: despublique na tela dele primeiro.
      </p>
    </section>
  );
}
