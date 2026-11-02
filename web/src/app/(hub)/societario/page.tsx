// Societário › Processos: lista e quadro dos processos de abertura, alteração e baixa. Filtros simples (busca,
// situação, tipo e, em "Mais filtros", responsável, UF e tempo parado), indicadores clicáveis, PDF e Excel do que
// está filtrado (no quadro também exporta a lista) e "Novo processo". Molde de tela em docs/08-convencoes.md (8.3.1).
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { diasAte, hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";
import { lerProcessos } from "@/dominios/societario/leituras";
import {
  DIAS_PARADO,
  NOMES_DESTAQUE,
  diasParado,
  faseAtualDe,
  nomeStatusFase,
  paradoHa,
  passaDestaque,
  situacaoProcesso,
  tomStatusFase,
} from "@/dominios/societario/processos";
import type { Destaque, LinhaProcesso } from "@/dominios/societario/processos";
import { QuadroProcessos } from "@/dominios/societario/componentes/QuadroProcessos";
import { NovoProcesso } from "@/dominios/societario/componentes/NovoProcesso";

export default function PaginaSocietario() {
  return <Societario />;
}

type Visao = "quadro" | "lista";
type Situacao = "aberto" | "concluido" | "cancelado" | "todos";
const SITUACOES: { id: Situacao; nome: string }[] = [
  { id: "aberto", nome: "Em andamento" },
  { id: "concluido", nome: "Concluídos" },
  { id: "cancelado", nome: "Cancelados" },
  { id: "todos", nome: "Todos" },
];
const PARADOS = [
  { dias: 0, nome: "Qualquer tempo" },
  { dias: 3, nome: "Parado há 3+ dias" },
  { dias: DIAS_PARADO, nome: `Parado há ${DIAS_PARADO}+ dias` },
  { dias: 10, nome: "Parado há 10+ dias" },
];

function Societario() {
  const { org, membros, clientePorId, nomeMembro, pode } = useOrg();
  const router = useRouter();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const podeOperar = pode("societario", "operar");
  const [visao, setVisao] = useEstadoLembrado<Visao>(CHAVES.visaoSocietario, "quadro", (v) => v === "quadro" || v === "lista");
  const [situacao, setSituacao] = useState<Situacao>("aberto");
  const [tipo, setTipo] = useState("");
  const [resp, setResp] = useState("");
  const [uf, setUf] = useState("");
  const [parado, setParado] = useState(0);
  const [destaque, setDestaque] = useState<Destaque>("");
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);

  const consulta = useConsulta(useCallback(() => lerProcessos(org.id), [org.id]));
  const dados = consulta.dados;

  /** Todas as linhas já com fase atual e nomes (uma vez por leitura). */
  const todas = useMemo<LinhaProcesso[]>(() => {
    if (!dados) return [];
    const nomeTipo = new Map(dados.tipos.map((t) => [t.id, t.nome]));
    return dados.processos.map((p) => {
      const f = faseAtualDe(p, dados.fases);
      const aberto = p.status === "aberto" ? f : undefined;
      return {
        p,
        f,
        cliente: nomeCliente(clientePorId(p.cliente_id), p.futuro_cliente ?? "—"),
        tipo: nomeTipo.get(p.tipo_id) ?? "",
        responsavel: nomeMembro(f?.responsavel_id ?? p.responsavel_id),
        naFase: aberto ? diasParado(aberto.mudou_em) : null,
        prazo: aberto ? diasAte(aberto.prazo_em, org.fuso) : null,
      };
    });
  }, [dados, clientePorId, nomeMembro, org.fuso]);

  /** Filtros que valem para os indicadores (busca, tipo, responsável, UF). */
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter(({ p, cliente }) => {
      if (tipo && p.tipo_id !== tipo) return false;
      if (resp && p.responsavel_id !== resp) return false;
      if (uf && p.uf !== uf) return false;
      if (q && !`${p.numero} ${cliente} ${p.descricao ?? ""} ${p.cnpj ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [todas, busca, tipo, resp, uf]);

  const lista = useMemo(
    () =>
      base.filter(
        (l) =>
          (situacao === "todos" || l.p.status === situacao) && passaDestaque(l.p, l.f, destaque, hoje) && paradoHa(l.p, l.f, parado),
      ),
    [base, situacao, destaque, parado, hoje],
  );

  const abertos = base.filter((l) => l.p.status === "aberto");
  const conta = (d: Exclude<Destaque, "">) => abertos.filter((l) => passaDestaque(l.p, l.f, d, hoje)).length;
  const qtd = {
    andamento: abertos.length,
    atrasada: conta("atrasada"),
    previsao: conta("previsao"),
    exigencia: conta("exigencia"),
    parados: abertos.filter((l) => paradoHa(l.p, l.f, DIAS_PARADO)).length,
  };

  const tipos = dados?.tipos ?? [];
  const ufs = [...new Set((dados?.processos ?? []).map((p) => p.uf).filter(Boolean))].sort() as string[];
  const nomeSituacao = SITUACOES.find((s) => s.id === situacao)?.nome ?? "";

  function limparFiltros() {
    setSituacao("aberto");
    setTipo("");
    setResp("");
    setUf("");
    setParado(0);
    setDestaque("");
    setBusca("");
  }
  /** Indicador clicável: liga o destaque (e mostra os em andamento) ou desliga se já estava ligado. */
  function alternarDestaque(d: Exclude<Destaque, "">) {
    setDestaque(destaque === d ? "" : d);
    setSituacao("aberto");
  }

  const filtrosAtivos: FiltroAtivo[] = [
    situacao !== "aberto" && { id: "situacao", rotulo: `Situação: ${nomeSituacao}`, aoTirar: () => setSituacao("aberto") },
    destaque && { id: "destaque", rotulo: NOMES_DESTAQUE[destaque], aoTirar: () => setDestaque("") },
    tipo && { id: "tipo", rotulo: `Tipo: ${tipos.find((t) => t.id === tipo)?.nome ?? "—"}`, aoTirar: () => setTipo("") },
    resp && { id: "resp", rotulo: `Responsável: ${nomeMembro(resp)}`, aoTirar: () => setResp("") },
    uf && { id: "uf", rotulo: `UF: ${uf}`, aoTirar: () => setUf("") },
    parado > 0 && { id: "parado", rotulo: `Parado há ${parado}+ dias`, aoTirar: () => setParado(0) },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const noQuadro = lista.filter((l) => l.p.status === "aberto" && l.f);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Processos societários"
        descricao="Aberturas, alterações e baixas de empresas: em que fase cada uma está, quem cuida e o que está atrasado."
        acoes={
          <>
            <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm" role="group" aria-label="Como ver os processos">
              {(["quadro", "lista"] as Visao[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 ${visao === v ? "bg-[var(--marca)] text-white" : "text-[var(--texto-suave)]"}`}
                  onClick={() => setVisao(v)}
                >
                  <Icone nome={v === "quadro" ? "grade" : "lista"} className="h-4 w-4" />
                  {v === "quadro" ? "Quadro" : "Lista"}
                </button>
              ))}
            </div>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Processos societários",
                subtitulo: [nomeSituacao, ...filtrosAtivos.filter((f) => f.id !== "situacao").map((f) => f.rotulo), `${lista.length} processo(s)`].join(" · "),
                arquivo: nomeArquivo("Processos-societarios", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Nº", valor: (l) => l.p.numero, formato: "numero", peso: 0.5, largura: 7 },
                  { titulo: "Cliente", valor: (l) => l.cliente, peso: 2.4, largura: 36 },
                  { titulo: "CNPJ", valor: (l) => l.p.cnpj ?? "", peso: 1.4, largura: 20 },
                  { titulo: "Tipo", valor: (l) => l.tipo, peso: 1.5, largura: 24 },
                  { titulo: "Situação", valor: (l) => situacaoProcesso(l.p).nome, peso: 1, largura: 14 },
                  { titulo: "Fase atual", valor: (l) => (l.p.status === "aberto" ? (l.f?.nome ?? "") : ""), peso: 1.4, largura: 22 },
                  { titulo: "Andamento da fase", valor: (l) => (l.p.status === "aberto" && l.f ? nomeStatusFase(l.f.status) : ""), peso: 1.2, largura: 18 },
                  {
                    titulo: "Prazo da fase",
                    valor: (l) => (l.p.status === "aberto" ? fmtData(l.f?.prazo_em) : ""),
                    peso: 1,
                    largura: 13,
                    alerta: (l) => l.prazo !== null && l.prazo < 0,
                  },
                  { titulo: "Dias na fase", valor: (l) => l.naFase, formato: "numero", peso: 0.8, largura: 11 },
                  { titulo: "Exigências", valor: (l) => l.p.exigencias, formato: "numero", peso: 0.8, largura: 11 },
                  { titulo: "Responsável", valor: (l) => l.responsavel, peso: 1.3, largura: 22 },
                  { titulo: "UF", valor: (l) => l.p.uf ?? "", peso: 0.4, largura: 6 },
                  { titulo: "Pedido", valor: (l) => fmtData(l.p.pedido_em), peso: 0.9, largura: 12 },
                  {
                    titulo: "Previsão",
                    valor: (l) => fmtData(l.p.previsao_em),
                    peso: 0.9,
                    largura: 12,
                    alerta: (l) => l.p.status === "aberto" && !!l.p.previsao_em && l.p.previsao_em < hoje,
                  },
                ],
              })}
            />
            {podeOperar && (
              <button className="btn-primario" onClick={() => setNovo(true)} disabled={!dados}>
                <Icone nome="mais" className="h-4 w-4" />
                Novo processo
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, nº do processo ou CNPJ" />
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            {SITUACOES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <MaisFiltros emUso={(resp ? 1 : 0) + (uf ? 1 : 0) + (parado ? 1 : 0)}>
          <label className="campo">
            <span>Responsável</span>
            <select value={resp} onChange={(e) => setResp(e.target.value)}>
              <option value="">Todos</option>
              {membros
                .filter((m) => m.ativo)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo">
            <span>UF</span>
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Todas</option>
              {ufs.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Tempo na mesma fase</span>
            <select value={parado} onChange={(e) => setParado(Number(e.target.value))}>
              {PARADOS.map((x) => (
                <option key={x.dias} value={x.dias}>
                  {x.nome}
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

      {consulta.carregando && !dados ? (
        <Esqueleto indicadores={3} />
      ) : !dados ? null : (
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--texto)]">
            <span>
              <Icone nome="pasta" className="mr-1.5 inline h-4 w-4 align-[-3px] text-[var(--marca)]" />
              <b className="num">{qtd.andamento}</b> processo(s) em andamento
              {qtd.atrasada + qtd.previsao + qtd.exigencia + qtd.parados
                ? ". Clique num quadro abaixo para ver só os que pedem atenção."
                : ". Nada atrasado nem parado."}
            </span>
            {(destaque || parado > 0) && (
              <button
                className="btn-link"
                onClick={() => {
                  setDestaque("");
                  setParado(0);
                }}
              >
                Ver todos em andamento
              </button>
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Fase atrasada"
              icone="alerta"
              valor={String(qtd.atrasada)}
              detalhe="prazo da fase passou"
              tom={qtd.atrasada ? "vermelho" : "neutro"}
              ativo={destaque === "atrasada"}
              aoClicar={() => alternarDestaque("atrasada")}
            />
            <Indicador
              titulo="Previsão vencida"
              icone="calendario"
              valor={String(qtd.previsao)}
              detalhe="passou da data prometida"
              tom={qtd.previsao ? "vermelho" : "neutro"}
              ativo={destaque === "previsao"}
              aoClicar={() => alternarDestaque("previsao")}
            />
            <Indicador
              titulo="Com exigência"
              icone="documento"
              valor={String(qtd.exigencia)}
              detalhe="órgão pediu correção"
              tom={qtd.exigencia ? "ambar" : "neutro"}
              ativo={destaque === "exigencia"}
              aoClicar={() => alternarDestaque("exigencia")}
            />
            <Indicador
              titulo="Parados"
              icone="relogio"
              valor={String(qtd.parados)}
              detalhe={`${DIAS_PARADO}+ dias na mesma fase`}
              tom={qtd.parados ? "ambar" : "neutro"}
              ativo={parado === DIAS_PARADO}
              aoClicar={() => {
                setParado(parado === DIAS_PARADO ? 0 : DIAS_PARADO);
                setSituacao("aberto");
              }}
            />
          </div>

          {!dados.processos.length ? (
            <EstadoVazio
              icone="pasta"
              titulo="Nenhum processo ainda"
              acao={
                podeOperar && (
                  <button className="btn-primario" onClick={() => setNovo(true)}>
                    <Icone nome="mais" className="h-4 w-4" />
                    Abrir o primeiro processo
                  </button>
                )
              }
            >
              Abra aqui cada abertura, alteração contratual ou baixa. O HUB cria as fases, avisa o responsável de cada uma e
              mostra o que está parado ou atrasado.
            </EstadoVazio>
          ) : !lista.length ? (
            <EstadoVazio
              icone="filtro"
              titulo="Nada neste filtro"
              acao={
                <button className="btn" onClick={limparFiltros}>
                  <Icone nome="fechar" className="h-4 w-4" />
                  Limpar filtros
                </button>
              }
            >
              Nenhum processo combina com os filtros escolhidos. Troque a situação ou limpe os filtros para ver todos os em andamento.
            </EstadoVazio>
          ) : visao === "quadro" ? (
            noQuadro.length ? (
              <QuadroProcessos linhas={noQuadro} fases={dados.fases} podeOperar={podeOperar} avisar={mostrar} aoMudar={consulta.recarregar} />
            ) : (
              <EstadoVazio
                icone="grade"
                titulo="O quadro mostra só os processos em andamento"
                acao={
                  <button className="btn" onClick={() => setVisao("lista")}>
                    <Icone nome="lista" className="h-4 w-4" />
                    Ver em lista
                  </button>
                }
              >
                Os {lista.length} processo(s) deste filtro já terminaram ou foram cancelados. Veja-os na lista.
              </EstadoVazio>
            )
          ) : (
            <ListaProcessos linhas={lista} hoje={hoje} />
          )}
        </>
      )}

      {novo && dados && <NovoProcesso tipos={dados.tipos} aoFechar={() => setNovo(false)} aoCriar={(id) => router.push(`/societario/${id}`)} />}
    </div>
  );
}

function ListaProcessos({ linhas, hoje }: { linhas: LinhaProcesso[]; hoje: string }) {
  return (
    <QuadroTabela rotulo="Processos societários" rodape={`${linhas.length} processo(s)`}>
      <thead>
        <tr>
          <th>Processo</th>
          <th>Fase atual</th>
          <th>Prazo da fase</th>
          <th>Na fase há</th>
          <th>Responsável</th>
          <th>Pedido</th>
          <th>Previsão</th>
          <th>
            <span className="sr-only">Ações</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const { p, f } = l;
          const aberto = p.status === "aberto" && f;
          const sit = situacaoProcesso(p);
          const previsaoVencida = p.status === "aberto" && !!p.previsao_em && p.previsao_em < hoje;
          return (
            <tr key={p.id} className={p.status === "cancelado" ? "opacity-60" : ""}>
              <td className="celula-titulo min-w-56">
                <Link href={`/societario/${p.id}`} className="font-medium text-[var(--marca)] hover:underline">
                  {l.cliente}
                </Link>
                <span className="block text-xs font-normal text-[var(--texto-suave)]">
                  #{p.numero} · {l.tipo}
                  {p.uf && ` · ${p.uf}`}
                  {p.exigencias > 0 && ` · ${p.exigencias} exigência(s)`}
                </span>
              </td>
              <td data-rotulo="Fase atual">
                {aberto ? (
                  <span className="flex flex-wrap items-center justify-end gap-1.5 sm:justify-start">
                    <span>{f.nome}</span>
                    <Chip tom={tomStatusFase(f.status)}>{nomeStatusFase(f.status)}</Chip>
                  </span>
                ) : (
                  <Chip tom={sit.tom}>{sit.nome}</Chip>
                )}
              </td>
              <td data-rotulo="Prazo da fase" className={`num whitespace-nowrap ${l.prazo !== null && l.prazo < 0 ? "font-medium text-red-700" : ""}`}>
                <span>
                  {aberto ? fmtData(f.prazo_em) || "—" : "—"}
                  {l.prazo !== null && l.prazo < 0 && <span className="ml-1 text-xs">({-l.prazo}d atraso)</span>}
                </span>
              </td>
              <td data-rotulo="Na fase há" className={`num whitespace-nowrap ${l.naFase !== null && l.naFase >= DIAS_PARADO ? "text-amber-800" : ""}`}>
                {l.naFase !== null ? `${l.naFase} dia(s)` : "—"}
              </td>
              <td data-rotulo="Responsável">{l.responsavel}</td>
              <td data-rotulo="Pedido" className="num whitespace-nowrap">
                {fmtData(p.pedido_em)}
              </td>
              <td data-rotulo="Previsão" className={`num whitespace-nowrap ${previsaoVencida ? "font-medium text-red-700" : ""}`}>
                {p.status === "concluido" ? `concluído ${fmtData(p.concluido_em)}` : fmtData(p.previsao_em) || "—"}
              </td>
              <td className="celula-acoes whitespace-nowrap text-right">
                <Link href={`/societario/${p.id}`} className="btn !min-h-8 !px-3">
                  <Icone nome="olho" className="h-4 w-4" />
                  Abrir
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </QuadroTabela>
  );
}
