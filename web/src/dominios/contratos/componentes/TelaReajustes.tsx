// Módulo Contratos › Reajustes: o que está pendente de confirmar (o HUB já calculou a proposta) e o histórico de
// reajustes e mudanças de valor dos contratos da empresa. Molde 8.3.1.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtDataLocal } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Indicador } from "@/components/ui/Indicador";
import { Valor } from "@/components/ui/Valor";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { lerContratos, lerReajustes } from "../leituras";
import { reajustePendente, textoReajuste } from "../regras";
import type { Recorrente } from "../tipos";
import { JanelaReajuste } from "./JanelaReajuste";

type Visao = "pendentes" | "feitos" | "todos";
interface Linha {
  id: string;
  k: Recorrente;
  pendente: boolean;
  referencia: string | null;
  quando: string | null;
  origem: string;
  percentual: number | null;
  antes: number;
  depois: number | null;
  obs: string | null;
}

export function TelaReajustes() {
  const { org, pode } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const podeOperar = pode("contratos", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [visao, setVisao] = useState<Visao>("pendentes");
  const [busca, setBusca] = useState("");
  const [reajustar, setReajustar] = useState<Recorrente | null>(null);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [contratos, reajustes] = await Promise.all([lerContratos(cliente.id), lerReajustes(cliente.id)]);
      return { contratos, reajustes };
    }, [cliente]),
  );

  const linhas = useMemo<Linha[]>(() => {
    const d = consulta.dados;
    if (!d) return [];
    const porId = new Map(d.contratos.map((k) => [k.id, k]));
    const pend: Linha[] = d.contratos
      .map((k) => ({ k, ref: reajustePendente(k, d.reajustes, hoje) }))
      .filter((x) => x.ref)
      .map(({ k, ref }) => ({
        id: `p-${k.id}`,
        k,
        pendente: true,
        referencia: ref,
        quando: null,
        origem: textoReajuste(k),
        percentual: null,
        antes: Number(k.valor),
        depois: null,
        obs: null,
      }));
    const feitos: Linha[] = d.reajustes
      .filter((r) => porId.has(r.recorrente_id))
      .map((r) => ({
        id: `r-${r.id}`,
        k: porId.get(r.recorrente_id)!,
        pendente: false,
        referencia: r.referencia,
        quando: r.em,
        origem: r.origem === "edicao" ? "Edição do valor" : r.indice === "fixo" ? "% fixo" : (r.indice ?? ""),
        percentual: r.percentual != null ? Number(r.percentual) : null,
        antes: Number(r.valor_antes),
        depois: Number(r.valor_depois),
        obs: r.observacao,
      }));
    return [...pend, ...feitos];
  }, [consulta.dados, hoje]);

  const filtrados = linhas.filter(
    (l) =>
      (visao === "todos" || (visao === "pendentes" ? l.pendente : !l.pendente)) &&
      (!busca.trim() || l.k.descricao.toLowerCase().includes(busca.trim().toLowerCase())),
  );
  const pendentes = linhas.filter((l) => l.pendente);
  const ano = hoje.slice(0, 4);
  const doAno = linhas.filter((l) => !l.pendente && l.quando?.startsWith(ano) && l.depois != null);
  const aumento = doAno.reduce((a, l) => a + (l.k.tipo === "receber" ? 1 : -1) * ((l.depois ?? 0) - l.antes), 0);

  const filtrosAtivos: FiltroAtivo[] = [
    visao !== "pendentes" && {
      id: "visao",
      rotulo: visao === "feitos" ? "Só os já feitos" : "Pendentes e feitos",
      aoTirar: () => setVisao("pendentes"),
    },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Reajustes"
        descricao="Todo ano, no mês combinado, o HUB calcula o índice acumulado (IPCA, IGP-M, INPC) ou o % fixo e espera você confirmar."
        acoes={
          <BotoesExportar
            vazio={!filtrados.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Reajustes de contratos",
              subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${filtrados.length} linha(s)`,
              arquivo: nomeArquivo("Reajustes", cliente ? nomeCliente(cliente) : "", hoje),
              logoUrl: org.logo_url,
              linhas: filtrados,
              colunas: [
                { titulo: "Contrato", valor: (l) => l.k.descricao, peso: 2.4, largura: 34 },
                { titulo: "Tipo", valor: (l) => (l.k.tipo === "pagar" ? "A pagar" : "A receber"), peso: 1, largura: 11 },
                { titulo: "Mês do reajuste", valor: (l) => fmtCompetencia(l.referencia), peso: 1, largura: 14 },
                { titulo: "Índice", valor: (l) => l.origem, peso: 1.4, largura: 18 },
                { titulo: "%", valor: (l) => l.percentual ?? "", peso: 0.8, largura: 10 },
                { titulo: "Antes", valor: (l) => l.antes, formato: "moeda", peso: 1.1 },
                { titulo: "Depois", valor: (l) => l.depois ?? "", formato: "moeda", peso: 1.1 },
                {
                  titulo: "Situação",
                  valor: (l) => (l.pendente ? "Pendente" : `Feito em ${fmtDataLocal(l.quando)}`),
                  peso: 1.2,
                  largura: 18,
                  alerta: (l) => l.pendente,
                },
              ],
            })}
          />
        }
      />
      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={() => (setVisao("pendentes"), setBusca(""))}>
        <label className="campo">
          <span>Mostrar</span>
          <select value={visao} onChange={(e) => setVisao(e.target.value as Visao)}>
            <option value="pendentes">Pendentes de confirmar</option>
            <option value="feitos">Já feitos (histórico)</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do contrato" />
        </label>
      </CartaoFiltros>
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {!cliente ? (
        <SemEmpresaGestao icone="tendencia" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              titulo="Pendentes de confirmar"
              icone="alerta"
              valor={String(pendentes.length)}
              tom={pendentes.length ? "ambar" : "neutro"}
              ativo={visao === "pendentes"}
              aoClicar={() => setVisao("pendentes")}
            />
            <Indicador
              titulo={`Feitos em ${ano}`}
              icone="check"
              valor={String(doAno.length)}
              tom="verde"
              ativo={visao === "feitos"}
              aoClicar={() => setVisao("feitos")}
            />
            <Indicador
              titulo={`Efeito no mês (${ano})`}
              icone="tendencia"
              valor={brl(aumento)}
              detalhe="Recebe a mais − paga a mais"
              tom={aumento >= 0 ? "azul" : "vermelho"}
            />
          </div>
          {!filtrados.length ? (
            <EstadoVazio
              icone={visao === "pendentes" ? "check" : "tendencia"}
              titulo={visao === "pendentes" ? "Nenhum reajuste para confirmar" : "Nenhum reajuste ainda"}
              acao={
                visao === "pendentes" && linhas.length ? (
                  <button className="btn" onClick={() => setVisao("todos")}>
                    Ver o histórico
                  </button>
                ) : undefined
              }
            >
              {visao === "pendentes"
                ? "Quando um contrato chegar ao mês do reajuste, ele aparece aqui e o sino avisa. O HUB busca o índice no Banco Central e mostra o novo valor."
                : "Os reajustes confirmados e as mudanças de valor dos contratos aparecem aqui."}
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Reajustes">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Mês do reajuste</th>
                  <th>Índice</th>
                  <th className="text-right">Antes</th>
                  <th className="text-right">Depois</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => (
                  <tr key={l.id}>
                    <td className="celula-titulo min-w-56">
                      {l.k.descricao}
                      <span className="block text-xs font-normal text-[var(--texto-suave)]">
                        {l.k.tipo === "pagar" ? "A pagar" : "A receber"}
                        {l.obs && ` · ${l.obs}`}
                      </span>
                    </td>
                    <td data-rotulo="Mês do reajuste">{l.referencia ? fmtCompetencia(l.referencia) : "—"}</td>
                    <td data-rotulo="Índice">
                      {l.origem}
                      {l.percentual != null && ` · ${l.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`}
                    </td>
                    <td data-rotulo="Antes" className="whitespace-nowrap text-right">
                      <Valor v={l.antes} />
                    </td>
                    <td data-rotulo="Depois" className="whitespace-nowrap text-right font-medium">
                      {l.depois != null ? <Valor v={l.depois} /> : "—"}
                    </td>
                    <td data-rotulo="Situação">
                      {l.pendente ? <Chip tom="ambar">Pendente</Chip> : <Chip tom="verde">Feito em {fmtDataLocal(l.quando)}</Chip>}
                    </td>
                    <td className="celula-acoes whitespace-nowrap text-right">
                      {l.pendente && (
                        <button className="btn !min-h-8 !px-3" onClick={() => setReajustar(l.k)}>
                          <Icone nome="tendencia" className="h-4 w-4" />
                          {podeOperar ? "Conferir e confirmar" : "Ver proposta"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}
      {reajustar && (
        <JanelaReajuste
          contrato={reajustar}
          podeOperar={podeOperar}
          aoFechar={() => setReajustar(null)}
          aoSalvar={(m) => {
            setReajustar(null);
            mostrar(m);
            consulta.recarregar();
          }}
        />
      )}
    </div>
  );
}
