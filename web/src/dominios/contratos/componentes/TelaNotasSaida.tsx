// Notas fiscais › Saída (065): as NFS-e que a MDC emite, uma por fatura de contrato com nota fiscal. A nota nasce sozinha
// com a fatura; aqui a pessoa abre, ajusta o que precisar (serviço, NBS, texto, tributos aproximados) e emite pelo
// Emissor Nacional (JanelaEmitirNfse). O "Emitir nota" das faturas abre esta tela já com a nota aberta
// (?fatura=<id>). Indicadores que filtram, período pela competência, busca, PDF e Excel, cartão no celular.
"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { brl } from "@/lib/formato/moeda";
import { hojeISO } from "@/lib/datas";
import { fmtCompetencia, fmtData, fmtDataHora } from "@/lib/formato/datas";
import { formatarDocumento } from "@/lib/documento";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { intervaloDoPeriodo, PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import { plural } from "@/lib/formato/numero";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Indicador } from "@/components/ui/Indicador";
import { Valor } from "@/components/ui/Valor";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { EspelhoNota } from "@/dominios/notas/componentes/EspelhoNota";
import { lerNotasSaida } from "../repositorio";
import { formatarCodigoServico } from "../nfse";
import type { NotaSaida, SituacaoNotaSaida } from "../tipos";
import { JanelaEmitirNfse } from "./JanelaEmitirNfse";

export const SITUACOES_NOTA_SAIDA: Record<
  SituacaoNotaSaida,
  { nome: string; tom: "verde" | "azul" | "ambar" | "vermelho" | "neutro"; explica: string }
> = {
  para_emitir: { nome: "Para emitir", tom: "ambar", explica: "Abra, confira e clique em Emitir" },
  enviando: { nome: "Enviando", tom: "azul", explica: "O HUB está mandando ao Emissor Nacional" },
  incerta: { nome: "Sem resposta certa", tom: "ambar", explica: "Clique em Emitir: o HUB confere se saiu antes de reenviar" },
  recusada: { nome: "Recusada", tom: "vermelho", explica: "Abra para ver o motivo, ajuste e emita de novo" },
  teste: { nome: "Emitida em teste", tom: "azul", explica: "Sem valor fiscal: falta a nota de verdade (produção)" },
  emitida: { nome: "Emitida", tom: "verde", explica: "Nota de verdade, com número e chave" },
  cancelada: { nome: "Fatura cancelada", tom: "neutro", explica: "A fatura foi cancelada: a nota não sai" },
};

type Filtro = "abertas" | "pendentes" | SituacaoNotaSaida | "todas";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "abertas", nome: "Todas, menos canceladas" },
  { id: "pendentes", nome: "Para emitir (inclui recusadas e de teste)" },
  { id: "recusada", nome: "Recusadas" },
  { id: "emitida", nome: "Emitidas" },
  { id: "cancelada", nome: "Canceladas" },
  { id: "todas", nome: "Todas" },
];
const PENDENTES: SituacaoNotaSaida[] = ["para_emitir", "recusada", "teste", "incerta", "enviando"];

export function TelaNotasSaida() {
  return (
    <Suspense fallback={<Esqueleto />}>
      <TelaNotasSaidaConteudo />
    </Suspense>
  );
}

function TelaNotasSaidaConteudo() {
  const { org, pode } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const roteador = useRouter();
  const params = useSearchParams();
  const faturaAberta = params.get("fatura");

  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [busca, setBusca] = useState("");
  const [nota, setNota] = useState<{ caminho: string; chave: string; numero: string | null } | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(
      async () => (cliente ? lerNotasSaida(cliente.id, intervalo.de ?? null, intervalo.ate ?? null) : null),
      [cliente, intervalo.de, intervalo.ate],
    ),
  );
  const todas = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const termo = busca.trim().toLowerCase();
  const filtradas = todas.filter((n) => {
    if (filtro === "abertas" && n.situacao === "cancelada") return false;
    if (filtro === "pendentes" && !PENDENTES.includes(n.situacao)) return false;
    if (!["abertas", "pendentes", "todas"].includes(filtro) && n.situacao !== filtro) return false;
    if (!termo) return true;
    return [n.fatura_numero, n.tomador, n.tomador_documento, n.descricao, n.numero_nfse].some((x) =>
      (x ?? "").toLowerCase().includes(termo),
    );
  });
  const conta = (s: SituacaoNotaSaida[]) => todas.filter((n) => s.includes(n.situacao)).length;
  const emitidas = todas.filter((n) => n.situacao === "emitida");
  const totalEmitido = emitidas.reduce((t, n) => t + Number(n.valor), 0);
  const totalLista = filtradas.reduce((t, n) => t + Number(n.valor), 0);
  const aberta = faturaAberta ? todas.find((n) => n.fatura === faturaAberta) : undefined;

  const filtrosAtivos: FiltroAtivo[] = [
    ...(periodo !== "tudo"
      ? [{ id: "periodo", rotulo: `Mês: ${PERIODOS.find((p) => p.id === periodo)?.nome}`, aoTirar: () => setPeriodo("tudo") }]
      : []),
    ...(filtro !== "abertas"
      ? [{ id: "situacao", rotulo: `Situação: ${FILTROS.find((x) => x.id === filtro)?.nome}`, aoTirar: () => setFiltro("abertas") }]
      : []),
    ...(termo ? [{ id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") }] : []),
  ];
  function limparFiltros() {
    setPeriodo("tudo");
    setFiltro("abertas");
    setBusca("");
  }
  const abrir = (n: NotaSaida) => roteador.replace(`/entradas/saida?fatura=${n.fatura}`, { scroll: false });
  const fecharJanela = (mudou: boolean) => {
    roteador.replace("/entradas/saida", { scroll: false });
    if (mudou) consulta.recarregar();
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Notas fiscais de saída"
        descricao="As notas que a MDC emite: uma para cada fatura de contrato com nota fiscal. Abra a nota, ajuste o que precisar e emita pelo Emissor Nacional."
        acoes={
          <>
            <BotoesExportar
              vazio={!filtradas.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Notas fiscais de saída",
                subtitulo: `${PERIODOS.find((p) => p.id === periodo)?.nome} · ${FILTROS.find((x) => x.id === filtro)?.nome} · ${plural(filtradas.length, "nota")}`,
                arquivo: nomeArquivo("Notas de saída", "", hoje),
                logoUrl: org.logo_url,
                paisagem: true,
                linhas: filtradas,
                colunas: [
                  { titulo: "Fatura", valor: (n) => n.fatura_numero, peso: 1, largura: 12 },
                  { titulo: "Cliente", valor: (n) => n.tomador ?? "", peso: 2, largura: 30 },
                  {
                    titulo: "CNPJ/CPF",
                    valor: (n) => (n.tomador_documento ? formatarDocumento(n.tomador_documento) : ""),
                    peso: 1.2,
                    largura: 20,
                  },
                  { titulo: "Mês", valor: (n) => fmtCompetencia(n.competencia), peso: 0.8, largura: 10 },
                  { titulo: "Serviço", valor: (n) => formatarCodigoServico(n.servico_codigo), peso: 0.8, largura: 10 },
                  { titulo: "Valor", valor: (n) => Number(n.valor), formato: "moeda", peso: 1 },
                  { titulo: "Nota nº", valor: (n) => n.numero_nfse ?? "", peso: 0.8, largura: 10 },
                  {
                    titulo: "Situação",
                    valor: (n) => SITUACOES_NOTA_SAIDA[n.situacao].nome,
                    peso: 1.2,
                    largura: 20,
                    alerta: (n) => n.situacao === "recusada",
                  },
                ],
                totais: { Valor: totalLista },
              })}
            />
            <Link className="btn" href="/contratos/faturas">
              <Icone nome="arquivo" className="h-4 w-4" />
              Ver as faturas
            </Link>
          </>
        }
      />

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <FiltroPeriodo
          rotulo="Mês da nota"
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
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            {FILTROS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Fatura, cliente, CNPJ ou número da nota"
          />
        </label>
      </CartaoFiltros>

      {!cliente ? (
        <SemEmpresaGestao icone="enviar" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Para emitir"
              icone="documento"
              valor={String(conta(["para_emitir", "teste", "incerta", "enviando"]))}
              detalhe="Abra, confira e clique em Emitir"
              tom={conta(["para_emitir", "teste", "incerta"]) ? "ambar" : "neutro"}
              ativo={filtro === "pendentes"}
              aoClicar={() => setFiltro(filtro === "pendentes" ? "abertas" : "pendentes")}
            />
            <Indicador
              titulo="Recusadas"
              icone="alerta"
              valor={String(conta(["recusada"]))}
              detalhe="Veja o motivo, ajuste e emita de novo"
              tom={conta(["recusada"]) ? "vermelho" : "neutro"}
              ativo={filtro === "recusada"}
              aoClicar={() => setFiltro(filtro === "recusada" ? "abertas" : "recusada")}
            />
            <Indicador
              titulo="Emitidas"
              icone="check"
              valor={String(emitidas.length)}
              detalhe="Notas de verdade (produção)"
              tom={emitidas.length ? "verde" : "neutro"}
              ativo={filtro === "emitida"}
              aoClicar={() => setFiltro(filtro === "emitida" ? "abertas" : "emitida")}
            />
            <Indicador
              titulo="Valor emitido"
              icone="moeda"
              valor={brl(totalEmitido)}
              detalhe="Soma das notas emitidas no período"
              tom="verde"
            />
          </div>

          {!filtradas.length ? (
            <EstadoVazio
              icone={todas.length ? "filtro" : "enviar"}
              titulo={todas.length ? "Nada neste filtro" : "Nenhuma nota de saída ainda"}
              acao={
                todas.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    <Icone nome="filtro" className="h-4 w-4" />
                    Limpar filtros
                  </button>
                ) : (
                  <Link className="btn-primario" href="/contratos">
                    <Icone nome="documento" className="h-4 w-4" />
                    Ir para os contratos
                  </Link>
                )
              }
            >
              {todas.length
                ? "Troque o mês ou a situação, ou limpe os filtros para ver tudo."
                : 'A nota de saída nasce sozinha com a fatura de cada contrato que emite nota fiscal. Em Contratos, escolha "Nota fiscal + fatura" no envio ao cliente.'}
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Notas fiscais de saída">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Cliente</th>
                  <th>Mês</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((n) => {
                  const s = SITUACOES_NOTA_SAIDA[n.situacao];
                  const podeVer = !!(n.xml_caminho && n.chave_acesso);
                  return (
                    <tr key={n.id} className={n.situacao === "cancelada" ? "linha-apagada" : ""}>
                      <td className="celula-titulo min-w-48">
                        <button className="text-left font-medium hover:underline" onClick={() => abrir(n)}>
                          {n.numero_nfse ? `Nota nº ${n.numero_nfse}` : `Nota da fatura ${n.fatura_numero}`}
                        </button>
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {n.numero_nfse ? `Fatura ${n.fatura_numero} · ` : ""}
                          {formatarCodigoServico(n.servico_codigo) || "sem código"} · {n.descricao}
                        </span>
                      </td>
                      <td data-rotulo="Cliente" className="min-w-32">
                        {n.tomador ?? "—"}
                        {n.tomador_documento && (
                          <span className="block text-xs text-[var(--texto-suave)]">{formatarDocumento(n.tomador_documento)}</span>
                        )}
                      </td>
                      <td data-rotulo="Mês" className="whitespace-nowrap">
                        {fmtCompetencia(n.competencia)}
                        <span className="block text-xs text-[var(--texto-suave)]">fatura vence {fmtData(n.vencimento)}</span>
                      </td>
                      <td data-rotulo="Valor" className="whitespace-nowrap text-right">
                        <Valor v={Number(n.valor)} />
                      </td>
                      <td data-rotulo="Situação" className="min-w-40">
                        <Chip tom={s.tom}>{s.nome}</Chip>
                        {n.ajustada && n.situacao !== "emitida" && (
                          <span className="ml-1">
                            <Chip tom="neutro">Ajustada</Chip>
                          </span>
                        )}
                        <span className="block text-xs text-[var(--texto-suave)]">
                          {n.situacao === "recusada" && n.mensagem
                            ? n.mensagem
                            : n.emitida_em && (n.situacao === "emitida" || n.situacao === "teste")
                              ? `em ${fmtDataHora(n.emitida_em)}`
                              : s.explica}
                        </span>
                      </td>
                      <td className="celula-acoes whitespace-nowrap text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {PENDENTES.includes(n.situacao) ? (
                            <button
                              className="btn-primario !min-h-8 !px-3"
                              onClick={() => abrir(n)}
                              aria-label={`Abrir e emitir a nota da fatura ${n.fatura_numero}`}
                            >
                              <Icone nome="enviar" className="h-4 w-4" />
                              Abrir e emitir
                            </button>
                          ) : (
                            <button
                              className="btn !min-h-8 !px-3"
                              onClick={() => abrir(n)}
                              aria-label={`Abrir a nota da fatura ${n.fatura_numero}`}
                            >
                              <Icone nome="olho" className="h-4 w-4" />
                              Abrir
                            </button>
                          )}
                          {podeVer && (
                            <button
                              className="btn !min-h-8 !px-3"
                              onClick={() => setNota({ caminho: n.xml_caminho!, chave: n.chave_acesso!, numero: n.numero_nfse })}
                              aria-label={`Ver o documento da nota ${n.numero_nfse ?? ""}`}
                            >
                              <Icone nome="documento" className="h-4 w-4" />
                              {n.situacao === "teste" ? "Ver teste" : "Ver nota"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total ({plural(filtradas.length, "nota")})</td>
                  <td className="whitespace-nowrap text-right">
                    <Valor v={totalLista} />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}

      {aberta && cliente && !nota && (
        <JanelaEmitirNfse
          fatura={{ id: aberta.fatura, numero: aberta.fatura_numero, valor: aberta.valor, competencia: aberta.competencia }}
          cliente={aberta.tomador ?? ""}
          podeGerir={podeGerir}
          aoVerNota={(caminho, chave, numero) => setNota({ caminho, chave, numero })}
          aoFechar={fecharJanela}
        />
      )}
      {faturaAberta && consulta.dados && !aberta && (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          A nota desta fatura não está no período escolhido.{" "}
          <button className="underline" onClick={() => setPeriodo("tudo")}>
            Mostrar todos os meses
          </button>
        </p>
      )}
      {nota && (
        <EspelhoNota
          nota={{
            xml_caminho: nota.caminho,
            chave: nota.chave,
            numero: nota.numero,
            emitente_doc: null,
            emitente_nome: null,
            modelo: "nfse",
          }}
          avisar={mostrar}
          aoFechar={() => setNota(null)}
        />
      )}
    </div>
  );
}
