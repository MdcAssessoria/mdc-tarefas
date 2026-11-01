// Histórico de importações de balancete: o que chegou, quando, por qual porta (arquivo, lote ou pasta do SharePoint)
// e o resultado, com o motivo quando ficou para revisar. Filtros simples e exportação em PDF e Excel do que está na tela.
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { nomeCliente } from "@/dominios/clientes/nome";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtCompetencia, fmtDataHora } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";

type Registro = {
  id: number;
  origem: "arquivo" | "lote" | "pasta";
  arquivo: string;
  cliente_id: string | null;
  competencia: string | null;
  balancete_id: string | null;
  resultado: "importado" | "revisar" | "erro";
  motivo: string | null;
  em: string;
};

const ORIGEM = { arquivo: "Um arquivo", lote: "Vários de uma vez", pasta: "Pasta do SharePoint" } as const;
const RESULTADO = {
  importado: { nome: "Importado", tom: "bg-emerald-50 text-emerald-800" },
  revisar: { nome: "Para revisar", tom: "bg-amber-50 text-amber-900" },
  erro: { nome: "Com erro", tom: "bg-red-50 text-red-800" },
} as const;
const PERIODOS = [
  { id: "7", nome: "Últimos 7 dias" },
  { id: "30", nome: "Últimos 30 dias" },
  { id: "90", nome: "Últimos 90 dias" },
  { id: "tudo", nome: "Tudo" },
];

export default function PaginaImportacoes() {
  const { org, clientes } = useOrg();
  const [periodo, setPeriodo] = useState("30");
  const [origem, setOrigem] = useState("");
  const [resultado, setResultado] = useState("");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const consulta = useConsulta(
    useCallback(async () => {
      const desde = periodo === "tudo" ? null : new Date(Date.now() - Number(periodo) * 864e5).toISOString();
      return lerTudo<Registro>((de, ate) => {
        const q = supabase()
          .from("hub_importacoes")
          .select("*")
          .eq("org_id", org.id)
          .order("em", { ascending: false })
          .order("id")
          .range(de, ate);
        return desde ? q.gte("em", desde) : q;
      });
    }, [org.id, periodo]),
  );

  const empresa = useCallback(
    (id: string | null) =>
      id
        ? nomeCliente(
            clientes.find((c) => c.id === id),
            "—",
          )
        : "Não reconhecida",
    [clientes],
  );
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (consulta.dados ?? []).filter(
      (r) =>
        (!origem || r.origem === origem) &&
        (!resultado || r.resultado === resultado) &&
        (!q || r.arquivo.toLowerCase().includes(q) || empresa(r.cliente_id).toLowerCase().includes(q)),
    );
  }, [consulta.dados, origem, resultado, busca, empresa]);
  const conta = (t: Registro["resultado"]) => lista.filter((r) => r.resultado === t).length;

  const hoje = hojeISO(org.fuso);
  const titulo = "Histórico de importações de balancete";
  const subtitulo = `${PERIODOS.find((p) => p.id === periodo)?.nome} · ${lista.length} registro(s): ${conta("importado")} importado(s), ${conta("revisar")} para revisar, ${conta("erro")} com erro`;
  const linha = (r: Registro) => ({
    quando: fmtDataHora(r.em),
    origem: ORIGEM[r.origem],
    empresa: empresa(r.cliente_id),
    competencia: fmtCompetencia(r.competencia) || "—",
    arquivo: r.arquivo,
    resultado: RESULTADO[r.resultado].nome,
    motivo: r.motivo ?? "",
  });

  async function pdf() {
    setErro(null);
    try {
      const bytes = await gerarRelatorioPdf({
        titulo,
        subtitulo,
        paisagem: true,
        logo: await carregarLogo(org.logo_url),
        secoes: [
          {
            titulo: "Importações",
            colunas: [
              { titulo: "Quando", peso: 1.3 },
              { titulo: "Por onde", peso: 1.4 },
              { titulo: "Empresa", peso: 2.4 },
              { titulo: "Mês", peso: 0.9 },
              { titulo: "Arquivo", peso: 2.2 },
              { titulo: "Resultado", peso: 1.1 },
              { titulo: "Motivo", peso: 3.5 },
            ],
            linhas: lista.map((r) => {
              const l = linha(r);
              return {
                celulas: [l.quando, l.origem, l.empresa, l.competencia, l.arquivo, l.resultado, l.motivo || "—"],
                alerta: [false, false, false, false, false, r.resultado !== "importado", false],
              };
            }),
          },
        ],
      });
      baixarBytes(bytes, `Historico-importacoes-${hoje}.pdf`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  async function excel() {
    setErro(null);
    try {
      await exportarExcel(`Historico-importacoes-${hoje}.xlsx`, titulo, subtitulo, [
        {
          nome: "Importações",
          colunas: [
            { titulo: "Quando", chave: "quando", largura: 18 },
            { titulo: "Por onde", chave: "origem", largura: 20 },
            { titulo: "Empresa", chave: "empresa", largura: 36 },
            { titulo: "Mês", chave: "competencia", largura: 10 },
            { titulo: "Arquivo", chave: "arquivo", largura: 36 },
            { titulo: "Resultado", chave: "resultado", largura: 14 },
            { titulo: "Motivo", chave: "motivo", largura: 70 },
          ],
          linhas: lista.map(linha),
        },
      ]);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Histórico de importações</h1>
          <p className="text-sm text-neutral-600">Tudo o que chegou de balancete: por arquivo, em lote ou pela pasta do SharePoint.</p>
        </div>
        <button className="btn" onClick={pdf} disabled={!lista.length}>
          PDF
        </button>
        <button className="btn" onClick={excel} disabled={!lista.length}>
          Excel
        </button>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Período</span>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Por onde chegou</span>
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ORIGEM).map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Resultado</span>
          <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(RESULTADO).map(([id, r]) => (
              <option key={id} value={id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar empresa ou arquivo</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Greencore" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="chip bg-emerald-50 text-emerald-800">{conta("importado")} importado(s)</span>
        <span className="chip bg-amber-50 text-amber-900">{conta("revisar")} para revisar</span>
        <span className="chip bg-red-50 text-red-800">{conta("erro")} com erro</span>
      </div>

      {(erro || consulta.erro) && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro ?? consulta.erro}</p>}
      {consulta.carregando && !consulta.dados ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio>Nenhuma importação neste filtro. Troque o período ou os filtros acima.</EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Por onde</th>
                <th>Empresa</th>
                <th>Mês</th>
                <th>Arquivo</th>
                <th>Resultado</th>
                <th>O que fazer</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDataHora(r.em)}</td>
                  <td>{ORIGEM[r.origem]}</td>
                  <td>{empresa(r.cliente_id)}</td>
                  <td>{fmtCompetencia(r.competencia) || "—"}</td>
                  <td className="max-w-56 truncate" title={r.arquivo}>
                    {r.arquivo}
                  </td>
                  <td>
                    <span className={`chip ${RESULTADO[r.resultado].tom}`}>{RESULTADO[r.resultado].nome}</span>
                  </td>
                  <td className="min-w-64">
                    {r.balancete_id ? (
                      <Link href={`/demonstrativos/${r.balancete_id}`} className="underline">
                        Abrir o balancete
                      </Link>
                    ) : (
                      r.motivo
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
