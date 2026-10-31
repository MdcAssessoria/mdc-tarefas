"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { traduzirErro } from "@/lib/erros";
import { lerPlanilha } from "@/lib/planilha";
import { GRUPOS, brl, classificar, lerBalancete, nomeGrupo } from "@/lib/balancete";
import type { Grupo, Leitura } from "@/lib/balancete";
import { analisar, carregarMapa, salvarBalancete } from "@/lib/demonstrativos";
import { caminho } from "@/lib/caminho";

export default function PaginaImportarBalancete() {
  return (
    <AppShell modulo="demonstrativos">
      <Importar />
    </AppShell>
  );
}

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function Importar() {
  const { org, clientes, pode } = useOrg();
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [arquivo, setArquivo] = useState("");
  const [cliente, setCliente] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [mostrar, setMostrar] = useState<"todas" | "sem">("todas");

  const ativos = clientes.filter((c) => c.ativo || c.inativo_em);

  async function abrir(arq: File) {
    setErro(null);
    setLeitura(null);
    setProcessando(true);
    try {
      const { abas, dados } = await lerPlanilha(arq, true);
      const l = lerBalancete(dados[abas[0]]);
      // empresa: pelo CNPJ do cabeçalho, senão pelo código do Domínio
      const porCnpj = l.cabecalho.cnpj ? ativos.find((c) => so(c.cnpj) && so(c.cnpj) === so(l.cabecalho.cnpj)) : undefined;
      const porCodigo = l.cabecalho.codigoEmpresa ? ativos.find((c) => c.codigo_dominio === l.cabecalho.codigoEmpresa) : undefined;
      const c = porCnpj ?? porCodigo;
      if (c) setCliente(c.id);
      if (l.cabecalho.fim) setCompetencia(l.cabecalho.fim.slice(0, 7));
      if (l.cabecalho.inicio && l.cabecalho.fim && l.cabecalho.inicio.slice(0, 7) !== l.cabecalho.fim.slice(0, 7))
        l.avisos.push(
          `O período do arquivo vai de ${l.cabecalho.inicio.split("-").reverse().join("/")} a ${l.cabecalho.fim.split("-").reverse().join("/")}. Débitos e créditos cobrem o período inteiro; a DRE "do mês" vai refletir esse período. Para o painel mensal, exporte o balancete de um mês só.`,
        );
      const mapa = c ? await carregarMapa(org.id, c.id) : [];
      classificar(l.linhas, mapa as { classificacao: string; grupo: Grupo }[]);
      setLeitura(l);
      setArquivo(arq.name);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setProcessando(false);
  }

  // ao trocar a empresa, reaplica as regras salvas dela
  async function trocarCliente(id: string) {
    setCliente(id);
    if (!leitura || !id) return;
    const mapa = await carregarMapa(org.id, id);
    for (const l of leitura.linhas) l.grupo = null;
    classificar(leitura.linhas, mapa as { classificacao: string; grupo: Grupo }[]);
    setLeitura({ ...leitura });
  }

  const analise = useMemo(
    () =>
      leitura
        ? analisar(leitura.linhas, competencia ? competencia + "-01" : null, null, leitura.cabecalho.inicio, leitura.cabecalho.fim)
        : null,
    [leitura, competencia],
  );

  async function gravar() {
    if (!leitura || !cliente || !competencia) return;
    setProcessando(true);
    setErro(null);
    try {
      const id = await salvarBalancete({
        org: org.id,
        cliente,
        competencia: competencia + "-01",
        arquivo,
        linhas: leitura.linhas,
        inicio: leitura.cabecalho.inicio,
        fim: leitura.cabecalho.fim,
      });
      window.location.href = caminho(`/demonstrativos/${id}`);
    } catch (e) {
      setErro(traduzirErro(e));
      setProcessando(false);
    }
  }

  if (!pode("demonstrativos", "operar"))
    return <p className="text-sm text-neutral-600">Você pode consultar os demonstrativos, mas não importar.</p>;

  const cab = leitura?.cabecalho;
  const nomeCliente = clientes.find((c) => c.id === cliente);
  const analiticas = leitura?.linhas.filter((l) => l.analitica) ?? [];
  const lista = mostrar === "sem" ? analiticas.filter((l) => !l.grupo) : analiticas;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Importar balancete do Domínio</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          No Domínio: Relatórios › Contabilidade › Balancete, empresa e mês, e exporte em Excel (.xls ou .xlsx). O Hub reconhece a empresa
          pelo CNPJ ou código, o mês pelo período e cada conta pelo plano de contas. Nada vai para o cliente antes de você revisar e
          publicar.
        </p>
      </div>

      <label className="cartao flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-8 text-center hover:border-[var(--destaque-escuro)]">
        <span className="font-medium">{arquivo || "Escolher arquivo do balancete"}</span>
        <span className="text-xs text-neutral-500">.xls, .xlsx ou .csv</span>
        <input
          type="file"
          accept=".xls,.xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && abrir(e.target.files[0])}
        />
      </label>

      {processando && <p className="text-sm text-neutral-500">Lendo…</p>}
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}

      {leitura && analise && (
        <>
          <section className="cartao grid gap-4 p-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-neutral-500">No arquivo</div>
              <div className="font-medium">{cab?.empresa ?? "—"}</div>
              <div className="text-xs text-neutral-500">
                {cab?.cnpj ?? "sem CNPJ"} {cab?.codigoEmpresa && `· código ${cab.codigoEmpresa}`}
              </div>
            </div>
            <label className="campo">
              <span>Empresa no Hub</span>
              <select value={cliente} onChange={(e) => trocarCliente(e.target.value)} className={!cliente ? "!border-amber-400" : ""}>
                <option value="">Escolha…</option>
                {ativos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                    {c.nome_fantasia || c.razao_social}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Competência</span>
              <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
            </label>
          </section>

          {leitura.avisos.map((a, i) => (
            <p key={i} className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              {a}
            </p>
          ))}

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <section className="cartao overflow-x-auto">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--borda)] p-3">
                <span className="text-sm">
                  {analiticas.length} contas analíticas · {analiticas.filter((l) => !l.grupo).length} sem grupo
                </span>
                <select
                  className="entrada !min-h-8 !py-1 text-sm"
                  value={mostrar}
                  onChange={(e) => setMostrar(e.target.value as "todas" | "sem")}
                >
                  <option value="todas">Todas</option>
                  <option value="sem">Só sem grupo</option>
                </select>
              </div>
              <table className="tabela text-[13px]">
                <thead>
                  <tr>
                    <th>Classificação</th>
                    <th>Conta</th>
                    <th className="text-right">Saldo atual</th>
                    <th>Grupo gerencial</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, 600).map((l) => (
                    <tr key={l.classificacao}>
                      <td className="text-neutral-500">{l.classificacao}</td>
                      <td>{l.descricao}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {Math.abs(l.saldo_atual).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{" "}
                        {l.saldo_atual > 0 ? "D" : l.saldo_atual < 0 ? "C" : ""}
                      </td>
                      <td>
                        <select
                          className="entrada !min-h-7 !py-0.5 text-xs"
                          value={l.grupo ?? ""}
                          onChange={(e) => {
                            l.grupo = (e.target.value || null) as Grupo | null;
                            setLeitura({ ...leitura });
                          }}
                        >
                          <option value="">—</option>
                          {GRUPOS.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.bloco} · {g.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-3 text-xs text-neutral-500">
                O grupo foi sugerido pelo nome das contas. Ajustes feitos aqui valem para este arquivo; para guardar a regra para os
                próximos meses, ajuste o grupo na tela do balancete depois de gravar.
              </p>
            </section>

            <aside className="space-y-4">
              <section className="cartao p-4">
                <h2 className="mb-2 font-semibold">Conferências</h2>
                <ul className="space-y-1.5 text-sm">
                  {analise.conferencias.map((c) => (
                    <li key={c.nome} className="flex items-start gap-2">
                      <span className={c.ok ? "text-emerald-700" : "text-[var(--perigo)]"}>{c.ok ? "✓" : "✕"}</span>
                      <span>
                        {c.nome}
                        {!c.ok && <span className="block text-xs text-neutral-500">{c.detalhe}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="cartao space-y-1 p-4 text-sm">
                <h2 className="mb-1 font-semibold">Prévia</h2>
                <div className="flex justify-between">
                  <span>Ativo total</span>
                  <b>{brl(analise.resumo.ativo_total)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Receita bruta do mês</span>
                  <b>{brl(analise.resumo.mes.receita_bruta)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Resultado do mês</span>
                  <b>{brl(analise.resumo.mes.lucro_liquido)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Resultado no ano</span>
                  <b>{brl(analise.resumo.ano.lucro_liquido)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Fragilidades</span>
                  <b>{analise.alertas.length}</b>
                </div>
              </section>
              <button className="btn-primario w-full" disabled={!cliente || !competencia || processando} onClick={gravar}>
                {processando
                  ? "Gravando…"
                  : `Gravar rascunho${nomeCliente ? ` de ${nomeCliente.nome_fantasia || nomeCliente.razao_social}` : ""}`}
              </button>
              {!cliente && <p className="text-xs text-amber-800">Escolha a empresa para gravar.</p>}
              <p className="text-xs text-neutral-500">
                Grupos: {[...new Set(analiticas.map((l) => l.grupo))].filter(Boolean).length} usados. {nomeGrupo(null)} = conta que não
                entra nos demonstrativos até receber um grupo.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
