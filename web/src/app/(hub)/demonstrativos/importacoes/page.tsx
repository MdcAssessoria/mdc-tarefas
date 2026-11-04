// Histórico de importações de balancete: o que chegou, quando, por qual porta (arquivo, lote ou pasta do SharePoint)
// e o resultado, com o motivo quando ficou para revisar. Molde de lista (docs/08-convencoes.md 8.3.1).
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { nomeCliente } from "@/dominios/clientes/nome";
import { hojeISO, inicioDoDiaUtc, somarDias } from "@/lib/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { fmtCompetencia, fmtDataHora } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import type { Tom } from "@/components/ui/Tons";
import { plural } from "@/lib/formato/numero";

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
const RESULTADO: Record<Registro["resultado"], { nome: string; tom: Tom }> = {
  importado: { nome: "Importado", tom: "verde" },
  revisar: { nome: "Para revisar", tom: "ambar" },
  erro: { nome: "Com erro", tom: "vermelho" },
};

export default function PaginaImportacoes() {
  const { org, clientes } = useOrg();
  const { aviso, mostrar } = useAviso();
  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [origem, setOrigem] = useState<"" | Registro["origem"]>("");
  const [resultado, setResultado] = useState<"" | Registro["resultado"]>("");
  const [busca, setBusca] = useState("");
  const hoje = hojeISO(org.fuso);
  const intervalo = intervaloDoPeriodo(periodo, hoje, de, ate);

  const consulta = useConsulta(
    useCallback(async () => {
      // datas do filtro no dia da organização (regra 8.3, item 9)
      const desde = intervalo.de ? inicioDoDiaUtc(intervalo.de, org.fuso) : null;
      const antes = intervalo.ate ? inicioDoDiaUtc(somarDias(intervalo.ate, 1), org.fuso) : null;
      return lerTudo<Registro>((i, f) => {
        let q = supabase().from("hub_importacoes").select("*").eq("org_id", org.id);
        if (desde) q = q.gte("em", desde);
        if (antes) q = q.lt("em", antes);
        return q.order("em", { ascending: false }).order("id").range(i, f);
      });
    }, [org.id, org.fuso, intervalo.de, intervalo.ate]),
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
  const doPeriodo = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doPeriodo.filter(
      (r) =>
        (!origem || r.origem === origem) &&
        (!resultado || r.resultado === resultado) &&
        (!q || r.arquivo.toLowerCase().includes(q) || empresa(r.cliente_id).toLowerCase().includes(q)),
    );
  }, [doPeriodo, origem, resultado, busca, empresa]);
  const conta = (t: Registro["resultado"]) => doPeriodo.filter((r) => r.resultado === t).length;
  const nomePeriodo = PERIODOS.find((p) => p.id === periodo)?.nome ?? "";

  const limpar = () => {
    setPeriodo("90");
    setDe("");
    setAte("");
    setOrigem("");
    setResultado("");
    setBusca("");
  };
  const ativos: FiltroAtivo[] = [
    ...(busca.trim() ? [{ id: "b", rotulo: `Busca: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
    ...(periodo !== "90" ? [{ id: "p", rotulo: `Período: ${nomePeriodo}`, aoTirar: () => setPeriodo("90") }] : []),
    ...(resultado ? [{ id: "r", rotulo: `Resultado: ${RESULTADO[resultado].nome}`, aoTirar: () => setResultado("") }] : []),
    ...(origem ? [{ id: "o", rotulo: `Por onde: ${ORIGEM[origem]}`, aoTirar: () => setOrigem("") }] : []),
  ];
  const alternar = (r: Registro["resultado"]) => setResultado((x) => (x === r ? "" : r));

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Histórico de importações"
        descricao="Tudo o que chegou de balancete: por arquivo, em lote ou pela pasta do SharePoint, e o que ficou para revisar."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Histórico de importações de balancete",
                subtitulo: `${nomePeriodo} · ${plural(lista.length, "registro")}: ${plural(conta("importado"), "importado")}, ${conta("revisar")} para revisar, ${conta("erro")} com erro`,
                arquivo: nomeArquivo("Historico-importacoes", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Quando", valor: (r: Registro) => fmtDataHora(r.em), peso: 1.3, largura: 18 },
                  { titulo: "Por onde", valor: (r: Registro) => ORIGEM[r.origem], peso: 1.4, largura: 20 },
                  { titulo: "Empresa", valor: (r: Registro) => empresa(r.cliente_id), peso: 2.4, largura: 36 },
                  { titulo: "Mês", valor: (r: Registro) => fmtCompetencia(r.competencia) || "—", peso: 0.9, largura: 10 },
                  { titulo: "Arquivo", valor: (r: Registro) => r.arquivo, peso: 2.2, largura: 36 },
                  {
                    titulo: "Resultado",
                    valor: (r: Registro) => RESULTADO[r.resultado].nome,
                    peso: 1.1,
                    largura: 14,
                    alerta: (r: Registro) => r.resultado !== "importado",
                  },
                  { titulo: "Motivo", valor: (r: Registro) => r.motivo ?? "", peso: 3.5, largura: 70 },
                ],
              })}
            />
            <Link href="/demonstrativos/importar" className="btn-primario">
              <Icone nome="importar" className="h-4 w-4" />
              Importar balancete
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Importados"
          icone="check"
          tom="verde"
          valor={String(conta("importado"))}
          ativo={resultado === "importado"}
          aoClicar={() => alternar("importado")}
        />
        <Indicador
          titulo="Para revisar"
          icone="alerta"
          tom={conta("revisar") ? "ambar" : "neutro"}
          valor={String(conta("revisar"))}
          detalhe="empresa ou contas sem identificação"
          ativo={resultado === "revisar"}
          aoClicar={() => alternar("revisar")}
        />
        <Indicador
          titulo="Com erro"
          icone="cancelar"
          tom={conta("erro") ? "vermelho" : "neutro"}
          valor={String(conta("erro"))}
          detalhe="arquivo que não é balancete"
          ativo={resultado === "erro"}
          aoClicar={() => alternar("erro")}
        />
      </div>

      <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
        <label className="campo campo-largo">
          <span>Buscar empresa ou arquivo</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Greencore" />
        </label>
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
        <label className="campo">
          <span>Resultado</span>
          <select value={resultado} onChange={(e) => setResultado(e.target.value as typeof resultado)}>
            <option value="">Todos</option>
            {Object.entries(RESULTADO).map(([id, r]) => (
              <option key={id} value={id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <MaisFiltros emUso={origem ? 1 : 0}>
          <label className="campo">
            <span>Por onde chegou</span>
            <select value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
              <option value="">Todos</option>
              {Object.entries(ORIGEM).map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={6} />
      ) : !lista.length ? (
        <EstadoVazio
          icone="importar"
          titulo={doPeriodo.length ? "Nenhuma importação neste filtro" : `Nenhuma importação em: ${nomePeriodo.toLowerCase()}`}
          acao={
            ativos.length ? (
              <button className="btn" onClick={limpar}>
                Limpar filtros
              </button>
            ) : (
              <Link href="/demonstrativos/importar" className="btn-primario">
                <Icone nome="importar" className="h-4 w-4" />
                Importar balancete
              </Link>
            )
          }
        >
          {doPeriodo.length
            ? "Troque o resultado ou a busca, ou limpe os filtros."
            : "Escolha um período maior acima, ou importe um balancete do Domínio (um arquivo ou vários de uma vez)."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Importações" rodape={`${lista.length} registro(s)`}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Quando</th>
              <th>Por onde</th>
              <th>Mês</th>
              <th>Arquivo</th>
              <th>Resultado</th>
              <th>O que fazer</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id}>
                <td className="celula-titulo font-medium">{empresa(r.cliente_id)}</td>
                <td data-rotulo="Quando" className="whitespace-nowrap">
                  {fmtDataHora(r.em)}
                </td>
                <td data-rotulo="Por onde">{ORIGEM[r.origem]}</td>
                <td data-rotulo="Mês">{fmtCompetencia(r.competencia) || "—"}</td>
                <td data-rotulo="Arquivo" className="max-w-56 break-all sm:truncate" title={r.arquivo}>
                  {r.arquivo}
                </td>
                <td data-rotulo="Resultado">
                  <Chip tom={RESULTADO[r.resultado].tom}>{RESULTADO[r.resultado].nome}</Chip>
                </td>
                <td data-rotulo="O que fazer" className="min-w-64 sm:min-w-64">
                  {r.balancete_id ? (
                    <Link href={`/demonstrativos/${r.balancete_id}`} className="btn !min-h-8 !px-3">
                      <Icone nome="olho" className="h-4 w-4" />
                      Abrir o balancete
                    </Link>
                  ) : (
                    <span className="text-sm">{r.motivo}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}
    </div>
  );
}
