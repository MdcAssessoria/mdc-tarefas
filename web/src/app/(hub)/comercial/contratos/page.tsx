// Comercial › Contratos: todos os contratos gerados nas fichas das oportunidades, com situação, honorário e PDF.
// Contrato não se apaga (migração 036): muda para "cancelado" na ficha ("Renegociar").
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { brl } from "@/lib/formato/moeda";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { lerContratos } from "@/dominios/comercial/leituras";
import type { ContratoComEmpresa } from "@/dominios/comercial/leituras";
import { SITUACOES_CONTRATO } from "@/dominios/comercial/rotulos";
import type { SituacaoContrato } from "@/dominios/comercial/rotulos";
import { baixarContratoPdf } from "@/dominios/comercial/baixarContrato";

export default function PaginaContratos() {
  return <Lista />;
}

const empresa = (c: ContratoComEmpresa) => c.crm_oportunidades?.empresa ?? c.valores.razao_social;
const honorario = (c: ContratoComEmpresa) => Number(c.valores.honorario_mensal) || 0;
type FiltroSituacao = "" | "valendo" | SituacaoContrato;
const passa = (c: ContratoComEmpresa, f: FiltroSituacao) => !f || (f === "valendo" ? c.status !== "cancelado" : c.status === f);

function Lista() {
  const { org } = useOrg();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [situacao, setSituacao] = useState<FiltroSituacao>("valendo");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [baixando, setBaixando] = useState<string | null>(null);

  const consulta = useConsulta(useCallback(() => lerContratos(org.id), [org.id]));
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (consulta.dados ?? []).filter((c) => {
      const dia = c.criado_em.slice(0, 10);
      return (
        (!intervalo.de || dia >= intervalo.de) &&
        (!intervalo.ate || dia <= intervalo.ate) &&
        (!q || `${empresa(c)} ${c.numero ?? ""} ${c.valores.cnpj ?? ""}`.toLowerCase().includes(q))
      );
    });
  }, [consulta.dados, busca, intervalo]);
  const lista = useMemo(() => base.filter((c) => passa(c, situacao)), [base, situacao]);

  const conta = (s: SituacaoContrato) => base.filter((c) => c.status === s);
  const assinadosMes = (consulta.dados ?? []).filter((c) => c.status === "assinado" && c.assinado_em?.slice(0, 7) === hoje.slice(0, 7));
  const totalLista = lista.reduce((a, c) => a + honorario(c), 0);

  const rotuloPeriodo =
    periodo === "escolher"
      ? `${fmtData(de) === "—" ? "início" : fmtData(de)} a ${fmtData(ate) === "—" ? "hoje" : fmtData(ate)}`
      : PERIODOS.find((p) => p.id === periodo)?.nome;
  const nomeSituacao = (f: FiltroSituacao) => (f === "valendo" ? "Sem os cancelados" : f ? SITUACOES_CONTRATO[f].nome : "Todos");

  function limparFiltros() {
    setSituacao("valendo");
    setBusca("");
    setPeriodo("tudo");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "tudo" && { id: "periodo", rotulo: `Criado: ${rotuloPeriodo}`, aoTirar: () => setPeriodo("tudo") },
    situacao !== "valendo" && { id: "situacao", rotulo: `Situação: ${nomeSituacao(situacao)}`, aoTirar: () => setSituacao("valendo") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  async function pdf(c: ContratoComEmpresa) {
    setBaixando(c.id);
    try {
      await baixarContratoPdf(c, org.logo_url);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setBaixando(null);
    }
  }

  const alternar = (s: SituacaoContrato) => setSituacao(situacao === s ? "valendo" : s);
  const carregando = consulta.carregando && !consulta.dados;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Contratos"
        descricao="Os contratos gerados nas oportunidades: o que está em ajuste, o que foi enviado e o que já foi assinado."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Contratos do CRM",
              subtitulo: `${org.nome} · ${nomeSituacao(situacao)}${periodo !== "tudo" ? ` · criados: ${rotuloPeriodo}` : ""} · ${lista.length} contrato(s)`,
              arquivo: nomeArquivo("Contratos", hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Nº", valor: (c) => c.numero ?? "", peso: 0.8, largura: 11 },
                { titulo: "Empresa", valor: empresa, peso: 2.6, largura: 36 },
                { titulo: "CNPJ", valor: (c) => c.valores.cnpj ?? "", peso: 1.4, largura: 20 },
                { titulo: "Honorário/mês", valor: honorario, formato: "moeda", peso: 1.2 },
                { titulo: "Início", valor: (c) => fmtData(c.valores.inicio), peso: 1, largura: 12 },
                { titulo: "Situação", valor: (c) => SITUACOES_CONTRATO[c.status].nome, peso: 1.3, largura: 18 },
                { titulo: "Criado em", valor: (c) => fmtDataLocal(c.criado_em), peso: 1, largura: 12 },
                { titulo: "Assinado em", valor: (c) => (c.assinado_em ? fmtDataLocal(c.assinado_em) : ""), peso: 1, largura: 12 },
              ],
              totais: { "Honorário/mês": totalLista },
            })}
          />
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Empresa, número ou CNPJ" />
        </label>
        <FiltroPeriodo
          rotulo="Criado"
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
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}>
            <option value="valendo">Sem os cancelados</option>
            {(Object.keys(SITUACOES_CONTRATO) as SituacaoContrato[]).map((s) => (
              <option key={s} value={s}>
                {SITUACOES_CONTRATO[s].nome}
              </option>
            ))}
            <option value="">Todos</option>
          </select>
        </label>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {carregando ? (
        <Esqueleto indicadores={3} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              titulo="Em ajuste (rascunho)"
              icone="editar"
              tom={conta("rascunho").length ? "ambar" : "neutro"}
              valor={String(conta("rascunho").length)}
              detalhe="Valores ainda podem mudar"
              ativo={situacao === "rascunho"}
              aoClicar={() => alternar("rascunho")}
            />
            <Indicador
              titulo="Aguardando assinatura"
              icone="enviar"
              tom="azul"
              valor={String(conta("enviado").length)}
              detalhe="Enviados ao cliente"
              ativo={situacao === "enviado"}
              aoClicar={() => alternar("enviado")}
            />
            <Indicador
              titulo="Assinados no mês"
              icone="check"
              tom="verde"
              valor={String(assinadosMes.length)}
              detalhe={`${brl(assinadosMes.reduce((a, c) => a + honorario(c), 0))}/mês em honorários novos`}
              ativo={situacao === "assinado"}
              aoClicar={() => alternar("assinado")}
            />
          </div>

          {!lista.length ? (
            <EstadoVazio
              icone={consulta.dados?.length ? "filtro" : "documento"}
              titulo={consulta.dados?.length ? "Nenhum contrato neste filtro" : "Nenhum contrato ainda"}
              acao={
                consulta.dados?.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : (
                  <Link className="btn-primario" href="/comercial">
                    <Icone nome="funil" className="h-4 w-4" />
                    Ir para o funil
                  </Link>
                )
              }
            >
              {consulta.dados?.length
                ? "Troque a situação ou o período, ou limpe os filtros para ver todos."
                : "O contrato nasce na ficha de cada oportunidade: abra a empresa no funil, preencha os valores negociados em “Proposta e contrato” e baixe o PDF."}
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Contratos">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Empresa</th>
                  <th className="text-right">Honorário/mês</th>
                  <th>Início</th>
                  <th>Situação</th>
                  <th>Criado em</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={c.status === "cancelado" ? "opacity-70" : ""}>
                    <td data-rotulo="Nº" className="num whitespace-nowrap">
                      {c.numero ?? "—"}
                    </td>
                    <td className="celula-titulo min-w-56">
                      <Link className="hover:underline" href={`/comercial/${c.oportunidade_id}`}>
                        {empresa(c)}
                      </Link>
                      {c.valores.cnpj && <span className="block text-xs font-normal text-[var(--texto-suave)]">{c.valores.cnpj}</span>}
                    </td>
                    <td data-rotulo="Honorário/mês" className="text-right">
                      <Valor v={honorario(c)} />
                    </td>
                    <td data-rotulo="Início" className="num whitespace-nowrap">
                      {fmtData(c.valores.inicio)}
                    </td>
                    <td data-rotulo="Situação">
                      <span title={SITUACOES_CONTRATO[c.status].dica}>
                        <Chip tom={SITUACOES_CONTRATO[c.status].tom}>{SITUACOES_CONTRATO[c.status].nome}</Chip>
                      </span>
                    </td>
                    <td data-rotulo="Criado em" className="num whitespace-nowrap">
                      {fmtDataLocal(c.criado_em)}
                    </td>
                    <td className="celula-acoes whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn !min-h-8 !px-3"
                          onClick={() => pdf(c)}
                          disabled={baixando === c.id}
                          title="Baixar o contrato em PDF"
                        >
                          <Icone nome="documento" className="h-4 w-4" />
                          {baixando === c.id ? "Gerando…" : "PDF"}
                        </button>
                        <Link href={`/comercial/${c.oportunidade_id}`} className="btn !min-h-8 !px-3" title="Abrir a ficha da oportunidade">
                          <Icone nome="olho" className="h-4 w-4" />
                          Abrir
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={2} className="celula-titulo">
                    Total ({lista.length})
                  </td>
                  <td data-rotulo="Honorário/mês" className="text-right">
                    <Valor v={totalLista} />
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}
    </div>
  );
}
