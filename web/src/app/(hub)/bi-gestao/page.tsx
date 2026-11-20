// BI de Gestão (19/11/2026): DRE e DFC gerenciais do grupo de empresas a partir do ERP do cliente (Omie), com os
// lançamentos complementares. O banco monta o relatório (bi_relatorio, com RLS por empresa via app.bi_pode_ver); a tela
// escolhe grupo, empresas, período e relatório, mostra mês a mês e exporta em PDF e Excel (regras em dominios/bi).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { brl } from "@/lib/formato/moeda";
import { PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { DESTAQUES, margem, montarMatriz, periodoDoBi, periodoLongo, temMovimento, totalDe } from "@/dominios/bi/relatorio";
import type { LinhaBanco, LinhaMatriz, TipoRelatorio } from "@/dominios/bi/relatorio";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";

interface Empresa {
  id: string;
  nome: string;
}
interface Grupo {
  id: string;
  nome: string;
  eliminar: boolean;
  empresas: Empresa[];
}

const RELATORIOS: { id: TipoRelatorio; nome: string; texto: string; icone: "grafico" | "tendencia" }[] = [
  { id: "dre", nome: "DRE gerencial", texto: "Receitas, custos e despesas pela data do fato (competência)", icone: "grafico" },
  { id: "dfc", nome: "Fluxo de caixa (DFC)", texto: "O que entrou e saiu do caixa, pela data do pagamento", icone: "tendencia" },
];
const PERIODO_PADRAO: Periodo = "ano";
const pct = (v: number | null) =>
  v === null ? undefined : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da receita líquida`;

type GrupoBanco = { id: string; nome: string; eliminar_intragrupo: boolean };
type LigacaoBanco = { grupo_id: string; cliente_id: string };
type ClienteBanco = { id: string; razao_social: string | null; nome_fantasia: string | null };

/** Grupos de empresas que a pessoa pode ver, com as empresas de cada um (RLS do banco decide). */
async function lerGrupos(): Promise<Grupo[]> {
  const { data: grupos, error: e1 } = await supabase()
    .from("bi_grupos")
    .select("id, nome, eliminar_intragrupo")
    .eq("ativo", true)
    .order("nome");
  if (e1) throw new Error(traduzirErro(e1));
  const gs = (grupos ?? []) as GrupoBanco[];
  if (!gs.length) return [];
  const { data: ligacoes, error: e2 } = await supabase()
    .from("bi_grupo_empresas")
    .select("grupo_id, cliente_id")
    .in(
      "grupo_id",
      gs.map((g) => g.id),
    );
  if (e2) throw new Error(traduzirErro(e2));
  const ls = (ligacoes ?? []) as LigacaoBanco[];
  const ids = [...new Set(ls.map((l) => l.cliente_id))];
  const { data: clientes, error: e3 } = ids.length
    ? await supabase().from("clientes").select("id, razao_social, nome_fantasia").in("id", ids)
    : { data: [], error: null };
  if (e3) throw new Error(traduzirErro(e3));
  const nome = new Map(((clientes ?? []) as ClienteBanco[]).map((c) => [c.id, c.nome_fantasia || c.razao_social || "Empresa"]));
  return gs
    .map((g) => ({
      id: g.id,
      nome: g.nome,
      eliminar: g.eliminar_intragrupo,
      empresas: ls
        .filter((l) => l.grupo_id === g.id && nome.has(l.cliente_id))
        .map((l) => ({ id: l.cliente_id, nome: nome.get(l.cliente_id) ?? "Empresa" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .filter((g) => g.empresas.length > 0);
}

export default function PaginaBiGestao() {
  const { org } = useOrg();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const grupos = useConsulta(useCallback(() => lerGrupos(), []));
  const [grupoId, setGrupoId] = useState("");
  const grupo = grupos.dados?.find((g) => g.id === grupoId) ?? grupos.dados?.[0] ?? null;
  const [marcadas, setMarcadas] = useState<string[] | null>(null);
  const empresas = useMemo(() => {
    if (!grupo) return [];
    const ok = marcadas?.filter((id) => grupo.empresas.some((e) => e.id === id));
    return ok?.length ? ok : grupo.empresas.map((e) => e.id);
  }, [grupo, marcadas]);
  const [rel, setRel] = useState<TipoRelatorio>("dre");
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_PADRAO);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [eliminar, setEliminar] = useState<boolean | null>(null);
  const elimina = (eliminar ?? grupo?.eliminar ?? true) && empresas.length > 1;
  const intervalo = useMemo(() => periodoDoBi(periodo, hoje, de, ate), [periodo, hoje, de, ate]);
  const longo = periodoLongo(intervalo.de, intervalo.ate);

  const relatorio = useConsulta(
    useCallback(async () => {
      if (!empresas.length || longo) return null;
      const { data, error } = await supabase().rpc("bi_relatorio", {
        p_relatorio: rel,
        p_clientes: empresas,
        p_inicio: intervalo.de,
        p_fim: intervalo.ate,
        p_eliminar: elimina,
      });
      if (error) throw new Error(traduzirErro(error));
      return montarMatriz((data ?? []) as LinhaBanco[]);
    }, [empresas, rel, intervalo, elimina, longo]),
  );
  const m = relatorio.dados;

  const nomesEmpresas = grupo ? grupo.empresas.filter((e) => empresas.includes(e.id)).map((e) => e.nome) : [];
  const rotuloPeriodo = `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate)}`;
  const quem = grupo ? (nomesEmpresas.length === grupo.empresas.length ? grupo.nome : nomesEmpresas.join(", ")) : "";
  const tituloRel = RELATORIOS.find((r) => r.id === rel)?.nome ?? "";
  const naoClassificado = m ? totalDe(m, "nao_classificado") : 0;

  function alternarEmpresa(id: string) {
    const atual = new Set(empresas);
    if (atual.has(id)) {
      if (atual.size === 1) return mostrar("Deixe ao menos uma empresa marcada.", "atencao");
      atual.delete(id);
    } else atual.add(id);
    setMarcadas([...atual]);
  }
  function limpar() {
    setPeriodo(PERIODO_PADRAO);
    setMarcadas(null);
    setEliminar(null);
  }

  const filtrosAtivos: FiltroAtivo[] = [
    ...(periodo !== PERIODO_PADRAO
      ? [
          {
            id: "periodo",
            rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
            aoTirar: () => setPeriodo(PERIODO_PADRAO),
          },
        ]
      : []),
    ...(grupo && empresas.length < grupo.empresas.length
      ? [{ id: "empresas", rotulo: `Empresas: ${nomesEmpresas.join(", ")}`, aoTirar: () => setMarcadas(null) }]
      : []),
  ];

  const colunasExportar = (meses: string[]): ColunaLista<LinhaMatriz>[] => [
    { titulo: "Conta", valor: (l) => l.nome, peso: 3.2, largura: 44 },
    ...meses.map((mes, i) => ({
      titulo: rotuloMes(mes),
      valor: (l: LinhaMatriz) => l.valores[i],
      formato: "moeda" as const,
      peso: 1,
      alerta: (l: LinhaMatriz) => l.valores[i] < 0,
    })),
    { titulo: "Total", valor: (l) => l.total, formato: "moeda", peso: 1.2, alerta: (l) => l.total < 0 },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="BI de Gestão"
        descricao="DRE e fluxo de caixa do grupo de empresas, mês a mês, a partir do sistema do cliente (Omie) e dos lançamentos complementares."
      />

      {grupos.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {grupos.erro}
        </p>
      )}

      {!grupos.dados ? (
        !grupos.erro && <Esqueleto />
      ) : !grupo ? (
        <EstadoVazio icone="grafico" titulo="Nenhum grupo de empresas liberado para você">
          O BI de Gestão mostra os grupos de empresas ligados ao Omie. Peça ao administrador do HUB para liberar o grupo.
        </EstadoVazio>
      ) : (
        <>
          <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limpar}>
            {grupos.dados.length > 1 && (
              <label className="campo">
                <span>Grupo</span>
                <select
                  value={grupo.id}
                  onChange={(e) => {
                    // trocou de grupo: volta a marcar todas as empresas e a regra de eliminação do grupo
                    setGrupoId(e.target.value);
                    setMarcadas(null);
                    setEliminar(null);
                  }}
                >
                  {grupos.dados.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <FiltroPeriodo
              periodo={periodo}
              de={de}
              ate={ate}
              aoMudar={(v) => {
                if (v.periodo) setPeriodo(v.periodo);
                if (v.de !== undefined) setDe(v.de);
                if (v.ate !== undefined) setAte(v.ate);
              }}
            />
            <fieldset className="campo min-w-0">
              <legend className="mb-1 text-[13px] font-medium">Empresas</legend>
              <div className="flex flex-wrap gap-2">
                {grupo.empresas.map((e) => {
                  const on = empresas.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => alternarEmpresa(e.id)}
                      className={`chip flex items-center gap-1.5 border ${
                        on ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-[var(--texto)]"
                      }`}
                    >
                      <Icone nome={on ? "check" : "mais"} className="h-3.5 w-3.5" />
                      {e.nome}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {empresas.length > 1 && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={elimina} onChange={(e) => setEliminar(e.target.checked)} />
                Tirar vendas e pagamentos entre as empresas do grupo
              </label>
            )}
          </CartaoFiltros>

          <nav aria-label="Relatórios do BI" className="grid grid-cols-2 gap-3">
            {RELATORIOS.map((r) => {
              const ativo = rel === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRel(r.id)}
                  aria-pressed={ativo}
                  className={`cartao flex items-start gap-3 p-3.5 text-left transition-colors sm:p-4 ${
                    ativo ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "hover:border-[var(--destaque-escuro)]"
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ativo ? "bg-white/10 text-[var(--destaque)]" : "bg-[var(--fundo)] text-[var(--marca)]"}`}
                    aria-hidden="true"
                  >
                    <Icone nome={r.icone} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[14px] font-semibold leading-tight ${ativo ? "text-white" : "text-[var(--marca)]"}`}>
                      {r.nome}
                    </span>
                    <span className={`mt-0.5 hidden text-xs sm:block ${ativo ? "text-[var(--nevoa)]" : "text-[var(--texto-suave)]"}`}>
                      {r.texto}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {aviso}
          {longo && (
            <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Escolha um período de até 3 anos.
            </p>
          )}
          {relatorio.erro && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {relatorio.erro}
            </p>
          )}

          {longo || relatorio.erro ? null : !m ? (
            <Esqueleto />
          ) : !temMovimento(m) ? (
            <EstadoVazio icone="grafico" titulo="Nada lançado neste período">
              Não há notas, contas ou lançamentos complementares das empresas escolhidas entre {rotuloPeriodo}. Troque o período.
            </EstadoVazio>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-semibold text-[var(--marca)]">{tituloRel}</h2>
                  <p className="text-sm text-[var(--texto-suave)]">
                    {quem} · {rotuloPeriodo}
                    {empresas.length > 1 &&
                      (elimina ? " · sem as operações entre as empresas do grupo" : " · com as operações entre as empresas")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <BotoesExportar
                    vazio={false}
                    avisar={mostrar}
                    montar={() => ({
                      titulo: `${tituloRel} · ${quem}`,
                      subtitulo: `${rotuloPeriodo}${empresas.length > 1 ? (elimina ? " · sem operações entre as empresas do grupo" : "") : ""}`,
                      arquivo: nomeArquivo(rel === "dre" ? "DRE-gerencial" : "Fluxo-de-caixa", quem, hoje),
                      logoUrl: org.logo_url,
                      paisagem: true,
                      linhas: m.linhas,
                      colunas: colunasExportar(m.meses),
                    })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {DESTAQUES[rel].map((d) => {
                  const v = totalDe(m, d.codigo);
                  return (
                    <Indicador
                      key={d.codigo}
                      titulo={d.titulo}
                      icone={d.icone}
                      valor={brl(v)}
                      detalhe={rel === "dre" && d.codigo !== "receita_liquida" ? pct(margem(m, d.codigo)) : undefined}
                      tom={v < 0 ? "vermelho" : "neutro"}
                    />
                  );
                })}
              </div>

              {naoClassificado !== 0 && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                  {brl(Math.abs(naoClassificado))} estão em &quot;Não classificado&quot;: são categorias do Omie ainda sem conta no relatório. Peça à
                  equipe MDC para classificar.
                </p>
              )}

              <QuadroTabela rotulo={tituloRel} cartoes={false}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[1] min-w-[14rem] bg-[var(--fundo)]">Conta</th>
                    {m.meses.map((mes) => (
                      <th key={mes} className="hidden text-right md:table-cell">
                        {rotuloMes(mes)}
                      </th>
                    ))}
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {m.linhas.map((l) => (
                    <tr key={l.codigo} className={l.subtotal ? "bg-[var(--fundo)]" : ""}>
                      <td
                        className={`celula-titulo sticky left-0 z-[1] ${l.subtotal ? "bg-[var(--fundo)] font-semibold text-[var(--marca)]" : "bg-white !font-normal"}`}
                      >
                        {l.nome}
                      </td>
                      {l.valores.map((v, i) => (
                        <td key={m.meses[i]} className={`hidden text-right md:table-cell ${l.subtotal ? "font-semibold" : ""}`}>
                          <Valor v={v} />
                        </td>
                      ))}
                      <td className={`text-right ${l.subtotal ? "font-semibold" : ""}`}>
                        <Valor v={l.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </QuadroTabela>
              <p className="text-xs text-[var(--texto-suave)]">
                No celular aparece só o total do período; os meses aparecem na tela maior e nos arquivos PDF e Excel.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
