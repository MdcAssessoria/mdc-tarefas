"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { REGIMES } from "@/lib/types";
import { traduzirErro } from "@/lib/erros";
import {
  CAMPOS, MODELO_CSV, detectarCabecalho, fichasParaTabela, montarLinhas, soDigitos,
  type Campo, type LinhaImport,
} from "@/lib/importacao";
import { carregarSheetJS, corrigirXlsDominio } from "@/lib/planilha";

async function lerArquivo(arq: File): Promise<{ abas: string[]; dados: Record<string, string[][]> }> {
  const XLSX = await carregarSheetJS();
  const buf = await arq.arrayBuffer();
  let wb;
  if (/\.(csv|txt)$/i.test(arq.name)) {
    // Domínio e Excel costumam gravar CSV em Windows-1252; tenta UTF-8 antes
    let texto: string;
    try { texto = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch { texto = new TextDecoder("windows-1252").decode(buf); }
    const sep = (texto.split(/\r?\n/, 5).join("").match(/;/g)?.length ?? 0) >= (texto.split(/\r?\n/, 5).join("").match(/,/g)?.length ?? 0) ? ";" : ",";
    wb = XLSX.read(texto.replace(/^﻿/, ""), { type: "string", FS: texto.includes("\t") && !texto.includes(sep) ? "\t" : sep, raw: true });
  } else {
    const bytes = new Uint8Array(buf);
    const corrigido = /\.xls$/i.test(arq.name) ? corrigirXlsDominio(XLSX, bytes.slice()) : null;
    wb = XLSX.read(corrigido ?? bytes, { type: "array", cellDates: false });
  }
  const dados: Record<string, string[][]> = {};
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][];
    const tabela = linhas.map((l) => l.map((c) => String(c ?? "")));
    // relatório "Completo" do Domínio (fichas rótulo: valor) vira tabela
    dados[nome] = fichasParaTabela(tabela) ?? tabela;
  }
  return { abas: wb.SheetNames, dados };
}

function baixarModelo() {
  const blob = new Blob([MODELO_CSV], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Modelo_Importacao_Clientes_MDC.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

const nomeRegime = (id: string | null) => REGIMES.find((r) => r.id === id)?.nome ?? "—";

export default function Pagina() {
  return (
    <AppShell>
      <Importar />
    </AppShell>
  );
}

function Importar() {
  const { org, clientes, podeEditarCadastros, recarregar } = useOrg();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [abas, setAbas] = useState<string[]>([]);
  const [dados, setDados] = useState<Record<string, string[][]>>({});
  const [aba, setAba] = useState("");
  const [cabecalho, setCabecalho] = useState(0);
  const [mapa, setMapa] = useState<Partial<Record<Campo, number>>>({});
  const [atualizar, setAtualizar] = useState(true);
  const [soAtivos, setSoAtivos] = useState(true);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [resultado, setResultado] = useState<{ inseridos: number; atualizados: number; ignorados: number; inativos: number; erros: { razao_social: string; erro: string }[] } | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "novo" | "atualizar" | "aviso" | "fora">("todos");
  const [arrastando, setArrastando] = useState(false);

  const linhasBrutas = dados[aba] ?? [];
  const colunas = linhasBrutas[cabecalho] ?? [];

  // índice dos clientes já cadastrados, para mostrar o que é novo e o que será atualizado
  const existentes = useMemo(() => {
    const porCodigo = new Map<string, string>();
    const porDoc = new Map<string, string>();
    for (const c of clientes) {
      const cc = c as typeof c & { codigo_dominio?: string | null };
      if (cc.codigo_dominio) porCodigo.set(cc.codigo_dominio, c.id);
      const d = soDigitos(c.cnpj);
      if (d) porDoc.set(d, c.id);
    }
    return { porCodigo, porDoc };
  }, [clientes]);

  const linhas = useMemo(() => {
    if (!linhasBrutas.length || mapa.razao_social === undefined) return [] as (LinhaImport & { situacao: "novo" | "atualizar" | "duplicado" | "fora" | "erro" })[];
    const vistos = new Set<string>();
    return montarLinhas(linhasBrutas, cabecalho, mapa).map((l) => {
      const chave = l.codigo_dominio ? `c${l.codigo_dominio}` : l.cnpj ? `d${soDigitos(l.cnpj)}` : `r${l.razao_social.toLowerCase()}`;
      let situacao: "novo" | "atualizar" | "duplicado" | "fora" | "erro";
      if (l.erro) situacao = "erro";
      else if (vistos.has(chave)) situacao = "duplicado";
      else if (soAtivos && l.ativo === false && !existentes.porCodigo.has(l.codigo_dominio ?? "") && !(l.cnpj && existentes.porDoc.has(soDigitos(l.cnpj)))) situacao = "fora";
      else if ((l.codigo_dominio && existentes.porCodigo.has(l.codigo_dominio)) || (l.cnpj && existentes.porDoc.has(soDigitos(l.cnpj))))
        situacao = "atualizar";
      else situacao = "novo";
      vistos.add(chave);
      return { ...l, situacao };
    });
  }, [linhasBrutas, cabecalho, mapa, soAtivos, existentes]);

  const cont = useMemo(() => {
    const c = { novo: 0, atualizar: 0, duplicado: 0, fora: 0, erro: 0, aviso: 0 };
    for (const l of linhas) { c[l.situacao]++; if (l.avisos.length) c.aviso++; }
    return c;
  }, [linhas]);

  const visiveis = linhas.filter((l) =>
    filtro === "todos" ? true :
    filtro === "aviso" ? l.avisos.length > 0 :
    filtro === "fora" ? ["fora", "duplicado", "erro"].includes(l.situacao) :
    l.situacao === filtro);

  async function abrir(arq: File) {
    setMsg(null); setResultado(null); setLendo(true);
    try {
      const r = await lerArquivo(arq);
      const primeira = r.abas.find((a) => (r.dados[a]?.length ?? 0) > 1) ?? r.abas[0];
      setArquivo(arq.name); setAbas(r.abas); setDados(r.dados); escolherAba(primeira, r.dados);
    } catch (e) {
      setMsg({ tipo: "erro", texto: traduzirErro(e) });
    } finally {
      setLendo(false);
    }
  }

  function escolherAba(nome: string, base = dados) {
    setAba(nome);
    const det = detectarCabecalho(base[nome] ?? []);
    setCabecalho(det.linha); setMapa(det.mapa);
  }

  function trocarCabecalho(i: number) {
    setCabecalho(i);
    setMapa(detectarCabecalho([linhasBrutas[i] ?? []]).mapa);
  }

  async function importar() {
    const enviar = linhas.filter((l) => l.situacao === "novo" || (atualizar && l.situacao === "atualizar"));
    if (!enviar.length) return setMsg({ tipo: "erro", texto: "Nenhuma linha para importar com as opções escolhidas." });
    setEnviando(true); setMsg(null);
    const total = { inseridos: 0, atualizados: 0, ignorados: 0, inativos: 0, erros: [] as { razao_social: string; erro: string }[] };
    try {
      for (let i = 0; i < enviar.length; i += 300) {
        const lote = enviar.slice(i, i + 300).map((l) => ({
          codigo_dominio: l.codigo_dominio, razao_social: l.razao_social, nome_fantasia: l.nome_fantasia,
          cnpj: l.cnpj, regime: l.regime, cidade: l.cidade, uf: l.uf, inicio_em: l.inicio_em,
          cliente_desde: l.cliente_desde, ativo: l.ativo, inativo_em: l.inativo_em,
          motivo_inativacao: l.motivo_inativacao,
        }));
        const { data, error } = await supabase().rpc("importar_clientes", { p_org: org.id, p_linhas: lote, p_atualizar: atualizar });
        if (error) throw error;
        total.inseridos += data.inseridos; total.atualizados += data.atualizados; total.ignorados += data.ignorados; total.inativos += data.inativos ?? 0;
        total.erros.push(...(data.erros ?? []));
      }
      setResultado(total);
      await recarregar();
    } catch (e) {
      setMsg({ tipo: "erro", texto: traduzirErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  if (!podeEditarCadastros) return <p className="text-sm">Apenas gestores e administradores importam clientes.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/config" className="btn-link text-sm">← Configurações</Link>
          <h1 className="text-xl font-semibold text-[var(--marca)]">Importar clientes</h1>
          <p className="text-sm text-[var(--texto-suave)]">
            Relatório de empresas exportado do Domínio ou qualquer planilha (.xlsx, .xls, .csv). Hoje há {clientes.length} cliente(s) cadastrado(s).
          </p>
        </div>
        <button className="btn" onClick={baixarModelo}>Baixar planilha modelo</button>
      </div>

      {/* 1. Arquivo */}
      <section
        className={`cartao grid place-items-center gap-2 border-2 border-dashed p-8 text-center transition ${arrastando ? "border-[var(--destaque)] bg-[var(--fundo)]" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) abrir(f); }}
      >
        <p className="font-medium text-[var(--marca)]">{lendo ? "Lendo arquivo…" : arquivo ? `Arquivo: ${arquivo}` : "Arraste o arquivo aqui"}</p>
        <p className="text-sm text-[var(--texto-suave)]">ou</p>
        <button className="btn-primario" onClick={() => inputRef.current?.click()} disabled={lendo}>
          {arquivo ? "Escolher outro arquivo" : "Escolher arquivo"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) abrir(f); e.target.value = ""; }} />
        <details className="mt-2 max-w-2xl text-left text-sm text-[var(--texto-suave)]">
          <summary className="cursor-pointer text-[var(--marca)]">Como tirar a lista do Domínio</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>No Domínio, acesse <b>Relatórios › Cadastrais › Empresas</b>, escolha o modelo <b>Completo</b> (traz município, UF, situação, data da situação e motivo) e clique em OK.</li>
            <li>Na visualização do relatório, exporte em Excel (.xls/.xlsx) ou texto/CSV e salve no computador.</li>
            <li>Envie o arquivo aqui. A tela acha o cabeçalho sozinha, mesmo com título e data no topo do relatório; se alguma coluna não for reconhecida, escolha abaixo.</li>
            <li>O código da empresa no Domínio fica gravado: na próxima importação os clientes são atualizados, não duplicados.</li>
          </ol>
        </details>
      </section>

      {msg && <p className={`rounded-md px-3 py-2 text-sm ${msg.tipo === "erro" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{msg.texto}</p>}

      {resultado && (
        <section className="cartao space-y-2 border-l-4 border-l-[var(--destaque)] p-4">
          <h2 className="font-semibold text-[var(--marca)]">Importação concluída</h2>
          <p className="text-sm">
            <b>{resultado.inseridos}</b> novo(s) · <b>{resultado.atualizados}</b> atualizado(s) · <b>{resultado.ignorados}</b> ignorado(s)
            {resultado.inativos > 0 && <> · <b>{resultado.inativos}</b> marcado(s) como inativo(s), com as tarefas posteriores à saída canceladas</>}
            {resultado.erros.length > 0 && <> · <b className="text-red-700">{resultado.erros.length}</b> com erro</>}
          </p>
          {resultado.erros.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-red-800">
              {resultado.erros.slice(0, 20).map((e, i) => <li key={i}>{e.razao_social}: {traduzirErro(e.erro)}</li>)}
            </ul>
          )}
          <p className="text-sm text-[var(--texto-suave)]">
            Próximo passo: em <Link className="underline" href="/config">Configurações › Clientes</Link> defina o responsável de cada setor e depois gere as tarefas em Obrigações recorrentes.
          </p>
        </section>
      )}

      {abas.length > 0 && (
        <>
          {/* 2. Colunas */}
          <section className="cartao space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="mr-auto font-semibold text-[var(--marca)]">Colunas</h2>
              {abas.length > 1 && (
                <label className="campo">
                  <span>Aba da planilha</span>
                  <select value={aba} onChange={(e) => escolherAba(e.target.value)}>
                    {abas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              )}
              <label className="campo">
                <span>Linha do cabeçalho</span>
                <select value={cabecalho} onChange={(e) => trocarCabecalho(Number(e.target.value))}>
                  {linhasBrutas.slice(0, 25).map((l, i) => (
                    <option key={i} value={i}>Linha {i + 1}: {l.filter(Boolean).slice(0, 4).join(" | ").slice(0, 60) || "(vazia)"}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((c) => (
                <label key={c.id} className="campo" title={c.dica}>
                  <span>{c.nome}{c.obrigatorio && " *"}</span>
                  <select
                    value={mapa[c.id] ?? ""}
                    onChange={(e) => setMapa({ ...mapa, [c.id]: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className={mapa[c.id] === undefined && c.obrigatorio ? "!border-red-400" : ""}
                  >
                    <option value="">— não importar —</option>
                    {colunas.map((col, i) => <option key={i} value={i}>{col || `Coluna ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {mapa.razao_social === undefined && <p className="text-sm text-red-700">Escolha qual coluna é a razão social.</p>}
            {mapa.codigo_dominio === undefined && mapa.razao_social !== undefined && (
              <p className="text-sm text-amber-800">Sem a coluna de código do Domínio, os clientes serão reconhecidos pelo CNPJ/CPF nas próximas importações.</p>
            )}
          </section>

          {/* 3. Prévia */}
          {linhas.length > 0 && (
            <section className="cartao space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <h2 className="mr-2 font-semibold text-[var(--marca)]">Prévia</h2>
                {([
                  ["todos", `Todas (${linhas.length})`],
                  ["novo", `Novos (${cont.novo})`],
                  ["atualizar", `Já cadastrados (${cont.atualizar})`],
                  ["aviso", `Com aviso (${cont.aviso})`],
                  ["fora", `Fora da importação (${cont.fora + cont.duplicado + cont.erro})`],
                ] as const).map(([id, nome]) => (
                  <button key={id} onClick={() => setFiltro(id)}
                    className={`rounded-full border px-3 py-1 ${filtro === id ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)]"}`}>
                    {nome}
                  </button>
                ))}
              </div>
              <div className="max-h-[55vh] overflow-auto rounded-md border border-[var(--borda)]">
                <table className="tabela">
                  <thead className="sticky top-0 bg-white">
                    <tr><th>Linha</th><th>Situação</th><th>Cód.</th><th>Razão social</th><th>CNPJ/CPF</th><th>Regime</th><th>Cidade/UF</th><th>Situação</th><th>Avisos</th></tr>
                  </thead>
                  <tbody>
                    {visiveis.slice(0, 1000).map((l) => (
                      <tr key={l.n} className={["fora", "duplicado", "erro"].includes(l.situacao) ? "opacity-50" : ""}>
                        <td className="text-[var(--texto-suave)]">{l.n}</td>
                        <td><Selo s={l.situacao} /></td>
                        <td>{l.codigo_dominio ?? "—"}</td>
                        <td>
                          <div className="font-medium">{l.razao_social || "—"}</div>
                          {l.nome_fantasia && <div className="text-xs text-[var(--texto-suave)]">{l.nome_fantasia}</div>}
                        </td>
                        <td className="whitespace-nowrap">{l.cnpj ?? "—"}</td>
                        <td title={l.regime_original}>{nomeRegime(l.regime)}</td>
                        <td>{[l.cidade, l.uf].filter(Boolean).join("/") || "—"}</td>
                        <td className="whitespace-nowrap text-xs">
                          {l.ativo === false
                            ? <span className="text-red-700">Inativa{l.inativo_em ? ` desde ${l.inativo_em.split("-").reverse().join("/")}` : ""}{l.motivo_inativacao ? ` · ${l.motivo_inativacao}` : ""}</span>
                            : l.ativo === true ? "Ativa" : "—"}
                        </td>
                        <td className="text-xs text-amber-800">{[l.erro, ...l.avisos].filter(Boolean).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visiveis.length > 1000 && <p className="text-xs text-[var(--texto-suave)]">Mostrando 1.000 de {visiveis.length} linhas; todas entram na importação.</p>}

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--borda)] pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--marca)]" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} />
                  Atualizar os {cont.atualizar} já cadastrados
                </label>
                {mapa.situacao !== undefined && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--marca)]" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} />
                    Não cadastrar empresas que já chegam inativas (as já cadastradas são marcadas como inativas)
                  </label>
                )}
                <button className="btn-primario ml-auto" disabled={enviando || cont.novo + (atualizar ? cont.atualizar : 0) === 0} onClick={importar}>
                  {enviando ? "Importando…" : `Importar ${cont.novo + (atualizar ? cont.atualizar : 0)} cliente(s)`}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Selo({ s }: { s: "novo" | "atualizar" | "duplicado" | "fora" | "erro" }) {
  const m = {
    novo: ["Novo", "bg-emerald-50 text-emerald-800"],
    atualizar: ["Atualizar", "bg-sky-50 text-sky-800"],
    duplicado: ["Repetido no arquivo", "bg-gray-100 text-gray-600"],
    fora: ["Inativa", "bg-gray-100 text-gray-600"],
    erro: ["Erro", "bg-red-50 text-red-800"],
  }[s];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${m[1]}`}>{m[0]}</span>;
}
