// Financeiro › Plano de contas da empresa, importado do Domínio (Excel/CSV exportado do "Plano de contas").
// Importar de novo atualiza: contas novas entram, as existentes são atualizadas e as que saíram do Domínio ficam
// inativas (podem estar ligadas a banco ou lançamento). Lista com busca e exportação em PDF e Excel.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { lerPlano } from "@/dominios/financeiro/leituras";
import { lerPlanoDominio } from "@/dominios/financeiro/planoDominio";
import type { ContaPlano } from "@/dominios/financeiro/planoDominio";
import { importarPlano } from "@/dominios/financeiro/repositorio";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { fmtDataHora } from "@/lib/formato/datas";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";

const FILTROS = [
  { id: "ativas", nome: "Contas ativas" },
  { id: "analiticas", nome: "Só analíticas (recebem lançamento)" },
  { id: "sinteticas", nome: "Só sintéticas (grupos)" },
  { id: "inativas", nome: "Inativas (saíram do Domínio)" },
  { id: "todas", nome: "Todas" },
];
const MOSTRAR = 300; // linhas na tela; a exportação leva tudo

type Previa = { arquivo: string; contas: ContaPlano[]; avisos: string[] };

export default function PaginaPlano() {
  const { org, pode } = useOrg();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const podeOperar = pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const [filtro, setFiltro] = useState("ativas");
  const [busca, setBusca] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [plano, ultima] = await Promise.all([
        lerPlano(cliente.id),
        supabase()
          .from("fin_plano_importacoes")
          .select("arquivo,total,novas,inativadas,em")
          .eq("cliente_id", cliente.id)
          .order("em", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return { plano, ultima: exigir(ultima) };
    }, [cliente]),
  );
  const plano = useMemo(() => consulta.dados?.plano ?? [], [consulta.dados]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return plano.filter((c) => {
      const ok =
        filtro === "todas" ||
        (filtro === "ativas" && c.ativo) ||
        (filtro === "analiticas" && c.ativo && c.analitica) ||
        (filtro === "sinteticas" && c.ativo && !c.analitica) ||
        (filtro === "inativas" && !c.ativo);
      return ok && (!q || c.descricao.toLowerCase().includes(q) || c.classificacao.startsWith(q) || (c.codigo ?? "") === q);
    });
  }, [plano, filtro, busca]);

  async function escolherArquivo(arq: File | undefined) {
    if (!arq) return;
    setLendo(true);
    setPrevia(null);
    try {
      const { abas, dados } = await lerPlanilha(arq);
      const r = lerPlanoDominio(dados[abas[0]]);
      if (!r.contas.length) throw new Error("O arquivo não tem contas com classificação (ex.: 1.1.1.01).");
      setPrevia({ arquivo: arq.name, ...r });
    } catch (e) {
      mostrar(e instanceof Error ? e.message : traduzirErro(e), "erro");
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!previa || !cliente) return;
    setGravando(true);
    try {
      const r = await importarPlano(cliente.id, previa.arquivo, previa.contas);
      setPrevia(null);
      mostrar(
        `Plano importado: ${r.total} conta(s), ${r.novas} nova(s)` +
          (r.inativadas ? `, ${r.inativadas} ficaram inativas (saíram do Domínio).` : "."),
      );
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setGravando(false);
    }
  }

  const titulo = "Plano de contas";
  const subtitulo = cliente ? `${nomeCliente(cliente)} · ${FILTROS.find((f) => f.id === filtro)?.nome} · ${lista.length} conta(s)` : "";
  const arquivoBase = `Plano-de-contas-${(cliente ? nomeCliente(cliente) : "").replace(/[^\w]+/g, "-")}-${hojeISO(org.fuso)}`;
  const tipo = (a: boolean) => (a ? "Analítica" : "Sintética");

  async function pdf() {
    try {
      const bytes = await gerarRelatorioPdf({
        titulo,
        subtitulo,
        logo: await carregarLogo(org.logo_url),
        secoes: [
          {
            titulo: "Contas",
            colunas: [
              { titulo: "Classificação", peso: 1.6 },
              { titulo: "Código", peso: 0.8 },
              { titulo: "Descrição", peso: 4 },
              { titulo: "Tipo", peso: 1 },
            ],
            linhas: lista.map((c) => ({
              celulas: [
                c.classificacao,
                c.codigo ?? "",
                `${"  ".repeat(Math.max(0, c.nivel - 1))}${c.descricao}`,
                tipo(c.analitica) + (c.ativo ? "" : " (inativa)"),
              ],
              negrito: !c.analitica,
            })),
          },
        ],
      });
      baixarBytes(bytes, `${arquivoBase}.pdf`);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  async function excel() {
    try {
      await exportarExcel(`${arquivoBase}.xlsx`, titulo, subtitulo, [
        {
          nome: "Plano",
          colunas: [
            { titulo: "Classificação", chave: "classificacao", largura: 18 },
            { titulo: "Código", chave: "codigo", largura: 10 },
            { titulo: "Descrição", chave: "descricao", largura: 60 },
            { titulo: "Nível", chave: "nivel", largura: 8, formato: "numero" },
            { titulo: "Tipo", chave: "tipo", largura: 12 },
            { titulo: "Situação", chave: "situacao", largura: 10 },
          ],
          linhas: lista.map((c) => ({ ...c, codigo: c.codigo ?? "", tipo: tipo(c.analitica), situacao: c.ativo ? "Ativa" : "Inativa" })),
        },
      ]);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  const ultima = consulta.dados?.ultima;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Plano de contas</h1>
          <p className="text-sm text-neutral-600">O plano do Domínio de cada empresa, usado para ligar bancos e classificar lançamentos.</p>
        </div>
        <button className="btn" onClick={pdf} disabled={!lista.length}>
          PDF
        </button>
        <button className="btn" onClick={excel} disabled={!lista.length}>
          Excel
        </button>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
        <label className="campo">
          <span>Mostrar</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {FILTROS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, classificação (1.1.1) ou código" />
        </label>
      </div>

      {cliente && podeOperar && (
        <div className="cartao space-y-3 p-4">
          <div>
            <h2 className="font-semibold text-[var(--marca)]">Importar o plano do Domínio</h2>
            <p className="text-sm text-neutral-600">
              No Domínio, exporte o plano de contas da empresa em Excel ou CSV (com as colunas Classificação e Descrição) e escolha o
              arquivo aqui. Você confere antes de gravar. Importar de novo atualiza o plano sem apagar nada.
            </p>
          </div>
          <input
            type="file"
            accept=".xls,.xlsx,.csv,.txt"
            disabled={lendo || gravando}
            onChange={(e) => {
              void escolherArquivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {lendo && <p className="text-sm text-neutral-600">Lendo o arquivo…</p>}
          {previa && (
            <div className="space-y-2 rounded-md bg-neutral-50 p-3 text-sm">
              <p>
                <b>{previa.arquivo}</b>: {previa.contas.length} conta(s) · {previa.contas.filter((c) => c.analitica).length} analítica(s) ·{" "}
                {previa.contas.filter((c) => !c.analitica).length} sintética(s).
              </p>
              {(() => {
                const novas = new Set(previa.contas.map((c) => c.classificacao));
                const ativas = plano.filter((c) => c.ativo);
                const saem = ativas.filter((c) => !novas.has(c.classificacao)).length;
                const entram = previa.contas.filter((c) => !plano.some((p) => p.classificacao === c.classificacao)).length;
                if (!ativas.length) return null;
                const muito = saem > ativas.length * 0.3;
                return (
                  <p className={muito ? "rounded-md bg-red-50 p-2 font-medium text-red-800" : "text-neutral-700"}>
                    Comparado com o plano atual: {entram} conta(s) nova(s) e {saem} conta(s) que ficarão inativas.
                    {muito && " Muitas contas sairiam: confira se este é mesmo o plano desta empresa antes de gravar."}
                  </p>
                );
              })()}
              {previa.avisos.map((a) => (
                <p key={a} className="text-amber-900">
                  {a}
                </p>
              ))}
              <div className="max-h-48 overflow-auto rounded border border-neutral-200 bg-white">
                <table className="tabela text-xs">
                  <tbody>
                    {previa.contas.slice(0, 12).map((c) => (
                      <tr key={c.classificacao}>
                        <td className="whitespace-nowrap">{c.classificacao}</td>
                        <td>{c.codigo}</td>
                        <td className={c.analitica ? "" : "font-semibold"}>{c.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button className="btn-primario" onClick={confirmar} disabled={gravando}>
                  {gravando ? "Gravando…" : `Gravar o plano de ${nomeCliente(cliente)}`}
                </button>
                <button className="btn" onClick={() => setPrevia(null)} disabled={gravando}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {ultima && (
            <p className="text-xs text-neutral-500">
              Última importação: {fmtDataHora(ultima.em)} · {ultima.arquivo} · {ultima.total} conta(s), {ultima.novas} nova(s),{" "}
              {ultima.inativadas} inativada(s).
            </p>
          )}
        </div>
      )}

      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima para ver o plano de contas dela.</EstadoVazio>
      ) : consulta.carregando && !consulta.dados ? (
        <Carregando />
      ) : !plano.length ? (
        <EstadoVazio>O plano de contas de {nomeCliente(cliente)} ainda não foi importado.</EstadoVazio>
      ) : !lista.length ? (
        <EstadoVazio>Nenhuma conta neste filtro.</EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Classificação</th>
                <th>Código</th>
                <th>Descrição</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, MOSTRAR).map((c) => (
                <tr key={c.id} className={c.ativo ? "" : "text-neutral-400"}>
                  <td className="whitespace-nowrap tabular-nums">{c.classificacao}</td>
                  <td className="tabular-nums">{c.codigo}</td>
                  <td className={c.analitica ? "" : "font-semibold"} style={{ paddingLeft: `${0.75 + Math.max(0, c.nivel - 1) * 0.9}rem` }}>
                    {c.descricao}
                  </td>
                  <td>
                    {tipo(c.analitica)}
                    {!c.ativo && " · inativa"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > MOSTRAR && (
            <p className="p-3 text-xs text-neutral-500">
              Mostrando {MOSTRAR} de {lista.length} contas. Use a busca para achar uma conta, ou exporte para ver tudo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
