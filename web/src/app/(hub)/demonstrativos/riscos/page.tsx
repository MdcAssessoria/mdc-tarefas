// Demonstrativos › Riscos da carteira: o último balancete de cada cliente, ordenado pelos sinais de alerta.
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice, plural } from "@/lib/formato/numero";
import { mesAno } from "@/lib/formato/datas";
import { nomeCliente } from "@/dominios/clientes/nome";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";

export default function PaginaRiscos() {
  return <Riscos />;
}

const peso = (b: BalanceteReg) => b.alertas.filter((a) => a.nivel === "alto").length * 3 + b.alertas.length;

/** Painel de riscos da carteira: o último balancete de cada cliente, ordenado pelos sinais de alerta. */
function Riscos() {
  const { org, clientePorId } = useOrg();
  const router = useRouter();
  const { aviso, mostrar } = useAviso();
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [so, setSo] = useState<"" | "alerta" | "alto" | "liquidez">("");

  const consulta = useConsulta(
    useCallback(
      () =>
        lerTudo<BalanceteReg>((de, ate) =>
          supabase()
            .from("portal_balancetes")
            .select("id,cliente_id,competencia,status,resumo,indices,alertas")
            .eq("org_id", org.id)
            .order("competencia", { ascending: false })
            .order("id")
            .range(de, ate),
        ),
      [org.id],
    ),
  );

  const ultimos = useMemo(() => {
    const vistos = new Set<string>();
    const out: BalanceteReg[] = [];
    for (const b of consulta.dados ?? []) {
      if (vistos.has(b.cliente_id)) continue;
      vistos.add(b.cliente_id);
      out.push({ ...b, alertas: b.alertas ?? [] });
    }
    return out.sort((a, b) => peso(b) - peso(a));
  }, [consulta.dados]);

  const nome = useCallback((b: BalanceteReg) => nomeCliente(clientePorId(b.cliente_id), "—"), [clientePorId]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ultimos.filter(
      (b) =>
        (!area || b.alertas.some((a) => a.area === area)) &&
        (!q || nome(b).toLowerCase().includes(q)) &&
        (so !== "alerta" || b.alertas.length > 0) &&
        (so !== "alto" || b.alertas.some((a) => a.nivel === "alto")) &&
        (so !== "liquidez" || (b.indices?.liquidez_corrente ?? 1) < 1),
    );
  }, [ultimos, area, busca, so, nome]);

  const areas = [...new Set(ultimos.flatMap((b) => b.alertas.map((a) => a.area)))].sort();
  const comAlerta = ultimos.filter((b) => b.alertas.length).length;
  const comAlto = ultimos.filter((b) => b.alertas.some((a) => a.nivel === "alto")).length;
  const semLiquidez = ultimos.filter((b) => (b.indices?.liquidez_corrente ?? 1) < 1).length;
  const NOMES_SO = { alerta: "Com sinal de alerta", alto: "Com alerta alto", liquidez: "Liquidez abaixo de 1" } as const;
  const alternar = (v: typeof so) => setSo((x) => (x === v ? "" : v));
  const limpar = () => {
    setArea("");
    setBusca("");
    setSo("");
  };
  const ativos: FiltroAtivo[] = [
    ...(busca.trim() ? [{ id: "b", rotulo: `Empresa: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
    ...(area ? [{ id: "a", rotulo: `Área: ${area}`, aoTirar: () => setArea("") }] : []),
    ...(so ? [{ id: "s", rotulo: NOMES_SO[so], aoTirar: () => setSo("") }] : []),
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Riscos da carteira"
        descricao="O último balancete de cada cliente, dos que mais preocupam para os que menos preocupam."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Riscos da carteira",
              subtitulo: `${org.nome} · ${plural(lista.length, "empresa")} · ${comAlerta} com sinais de alerta`,
              arquivo: nomeArquivo("Riscos-da-carteira", hojeISO(org.fuso)),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Empresa", valor: nome, peso: 2.4, largura: 36 },
                { titulo: "Último mês", valor: (b: BalanceteReg) => mesAno(b.competencia), peso: 1, largura: 12 },
                {
                  titulo: "Liquidez corrente",
                  valor: (b: BalanceteReg) => fmtIndice(b.indices?.liquidez_corrente, "x"),
                  peso: 1,
                  largura: 12,
                  alerta: (b: BalanceteReg) => (b.indices?.liquidez_corrente ?? 1) < 1,
                },
                {
                  titulo: "Resultado no ano",
                  valor: (b: BalanceteReg) => b.resumo?.ano?.lucro_liquido ?? null,
                  formato: "moeda",
                  peso: 1.3,
                  largura: 16,
                  alerta: (b: BalanceteReg) => (b.resumo?.ano?.lucro_liquido ?? 0) < 0,
                },
                { titulo: "Sinais de alerta", valor: (b: BalanceteReg) => b.alertas.map((a) => a.texto).join("; "), peso: 4, largura: 70 },
              ],
            })}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Com sinal de alerta"
          icone="alerta"
          tom={comAlerta ? "ambar" : "verde"}
          valor={`${comAlerta} de ${ultimos.length}`}
          ativo={so === "alerta"}
          aoClicar={() => alternar("alerta")}
        />
        <Indicador
          titulo="Com alerta alto"
          icone="escudo"
          tom={comAlto ? "vermelho" : "neutro"}
          valor={String(comAlto)}
          ativo={so === "alto"}
          aoClicar={() => alternar("alto")}
        />
        <Indicador
          titulo="Liquidez abaixo de 1"
          icone="carteira"
          tom={semLiquidez ? "vermelho" : "neutro"}
          valor={String(semLiquidez)}
          detalhe="dívida de curto prazo maior que o caixa + a receber"
          ativo={so === "liquidez"}
          aoClicar={() => alternar("liquidez")}
        />
      </div>

      <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
        <label className="campo campo-largo">
          <span>Empresa</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Greencore" />
        </label>
        <label className="campo">
          <span>Área do alerta</span>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas as áreas</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={6} />
      ) : !ultimos.length ? (
        <EstadoVazio
          icone="escudo"
          titulo="Nenhum balancete importado"
          acao={
            <Link href="/demonstrativos/importar" className="btn-primario">
              <Icone nome="importar" className="h-4 w-4" />
              Importar balancete
            </Link>
          }
        >
          O painel de riscos usa o último balancete de cada cliente. Importe os balancetes para ver aqui quem precisa de atenção.
        </EstadoVazio>
      ) : !lista.length ? (
        <EstadoVazio
          icone="filtro"
          titulo="Nenhuma empresa neste filtro"
          acao={
            <button className="btn" onClick={limpar}>
              Limpar filtros
            </button>
          }
        >
          Troque a área ou a busca, ou limpe os filtros para ver toda a carteira.
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Riscos da carteira">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Último mês</th>
              <th className="text-right">Liquidez corrente</th>
              <th className="text-right">Resultado no ano</th>
              <th>Sinais de alerta</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((b) => (
              <tr key={b.id} className="cursor-pointer align-top" onClick={() => router.push(`/demonstrativos/${b.id}`)}>
                <td className="celula-titulo font-medium">
                  <Link href={`/demonstrativos/${b.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {nome(b)}
                  </Link>
                </td>
                <td data-rotulo="Último mês" className="whitespace-nowrap">
                  {mesAno(b.competencia)}
                </td>
                <td
                  data-rotulo="Liquidez corrente"
                  className={`text-right tabular-nums ${(b.indices?.liquidez_corrente ?? 1) < 1 ? "text-[var(--perigo)]" : ""}`}
                >
                  {fmtIndice(b.indices?.liquidez_corrente, "x")}
                </td>
                <td
                  data-rotulo="Resultado no ano"
                  className={`whitespace-nowrap text-right tabular-nums ${(b.resumo?.ano?.lucro_liquido ?? 0) < 0 ? "text-[var(--perigo)]" : ""}`}
                >
                  {brl(b.resumo?.ano?.lucro_liquido, { centavos: false })}
                </td>
                <td data-rotulo="Alertas">
                  <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                    {b.alertas.length === 0 && <Chip tom="verde">nenhum</Chip>}
                    {b.alertas.map((a, k) => (
                      <Chip key={k} tom={a.nivel === "alto" ? "vermelho" : "ambar"}>
                        {a.texto}
                      </Chip>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}
    </div>
  );
}
