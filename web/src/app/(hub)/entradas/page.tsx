// Entradas › Notas recebidas: painel dos XML que chegaram (busca automática na SEFAZ e na NFS-e Nacional, ou XML
// enviado), com a situação em linguagem simples (Aguardando sua resposta, Prazo vencendo, Confirmada, Recusada…),
// resposta à SEFAZ em lote, itens, histórico com protocolos, "Ver a nota" e "Baixar PDF" à vista em cada linha (espelho
// no layout DANFE/DANFSe), "Ver caminho" (pedido → nota → contas a pagar → pagamentos e estoque), XML para baixar,
// PDF e Excel do que está na tela. O aviso da busca automática sai em linguagem simples (dominios/notas/painel.ts),
// com o texto técnico recolhido em "Ver detalhes".
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Indicador } from "@/components/ui/Indicador";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { intervaloDoPeriodo } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { PERIODOS } from "@/lib/periodo";
import { lerCertificado, lerControle, lerEventos, lerNotas } from "@/dominios/notas/leituras";
import { buscarAgora } from "@/dominios/notas/repositorio";
import {
  manifestacoesPermitidas,
  prontaParaLancar,
  quandoProximaBusca,
  SITUACOES_PAINEL,
  situacaoDaNota,
  temManifestacao,
} from "@/dominios/notas/regras";
import type { SituacaoPainel } from "@/dominios/notas/regras";
import { manifestacaoDoTipo } from "@/dominios/notas/sefaz";
import type { CodigoManifestacao } from "@/dominios/notas/sefaz";
import type { Nota } from "@/dominios/notas/tipos";
import { BotaoXml, ChipSituacao, fornecedorDa, nomeModelo } from "@/dominios/notas/componentes/Comuns";
import { JanelaManifestar } from "@/dominios/notas/componentes/JanelaManifestar";
import { DetalheNota } from "@/dominios/notas/componentes/DetalheNota";
import { EspelhoNota } from "@/dominios/notas/componentes/EspelhoNota";
import { EnviarXml } from "@/dominios/notas/componentes/EnviarXml";
import { BotoesVerNota } from "@/dominios/notas/componentes/BotoesVerNota";
import { avisoDaBusca, contar, resumoNotasRecebidas } from "@/dominios/notas/painel";
import { ArvoreDocumento } from "@/dominios/financeiro/componentes/ArvoreDocumento";
import { plural } from "@/lib/formato/numero";

type FiltroSit = "todas" | SituacaoPainel | "a_lancar";
const FILTROS: { id: FiltroSit; nome: string }[] = [
  { id: "todas", nome: "Todas" },
  { id: "aguardando", nome: "Aguardando sua resposta" },
  { id: "prazo_vencendo", nome: "Prazo vencendo" },
  { id: "a_lancar", nome: "Prontas para lançar" },
  { id: "confirmada", nome: "Confirmadas" },
  { id: "recusada", nome: "Recusadas" },
  { id: "cancelada", nome: "Canceladas pelo fornecedor" },
  { id: "prazo_encerrado", nome: "Prazo encerrado" },
  { id: "recebida", nome: "Notas de serviço" },
];
const MOSTRAR = 500;
// células um pouco mais justas (8 px dos lados) para a coluna de ações caber a 1280 px sem rolar de lado
const LINHA = "[&>td]:px-2 [&>th]:px-2";
const ITEM_MENU = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--fundo)]";

type Janela =
  | { tipo: "manifestar"; notas: Nota[]; inicial?: CodigoManifestacao }
  | { tipo: "detalhe"; nota: Nota }
  | { tipo: "espelho"; nota: Nota }
  | { tipo: "caminho"; nota: Nota; volta?: Janela }
  | { tipo: "xml" };

export default function PaginaNotasRecebidas() {
  const { org, pode } = useOrg();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const podeOperar = pode("entradas", "operar") || pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [situacao, setSituacao] = useState<FiltroSit>("todas");
  const [fornecedor, setFornecedor] = useState("");
  const [modelo, setModelo] = useState("");
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [janela, setJanela] = useState<Janela | null>(null);
  const [buscando, setBuscando] = useState(false);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [notas, eventos, controle, certificado] = await Promise.all([
        lerNotas(cliente.id, { ...intervalo, direcao: "entrada", fuso: org.fuso }),
        lerEventos(cliente.id),
        lerControle(cliente.id),
        lerCertificado(cliente.id),
      ]);
      return { notas, eventos, controle, certificado };
    }, [cliente, intervalo, org.fuso]),
  );
  const d = consulta.dados;

  const eventosAceitos = useMemo(() => {
    const m = new Map<string, { tipo: CodigoManifestacao }[]>();
    for (const e of d?.eventos ?? []) {
      const t = manifestacaoDoTipo(e.tp_evento);
      if (!t || !e.nota_id || !["135", "136", "155"].includes(e.cstat ?? "")) continue;
      m.set(e.nota_id, [...(m.get(e.nota_id) ?? []), { tipo: t }]);
    }
    return m;
  }, [d?.eventos]);

  const comSituacao = useMemo(
    () => (d?.notas ?? []).map((n) => ({ n, s: situacaoDaNota(n, hoje), pronta: prontaParaLancar(n) })),
    [d?.notas, hoje],
  );
  const fornecedores = useMemo(
    () =>
      [...new Map(comSituacao.map(({ n }) => [n.emitente_doc ?? n.emitente_nome ?? "", fornecedorDa(n)])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [comSituacao],
  );
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return comSituacao.filter(
      ({ n }) =>
        (!fornecedor || (n.emitente_doc ?? n.emitente_nome) === fornecedor) &&
        (!modelo || n.modelo === modelo) &&
        (!q ||
          fornecedorDa(n).toLowerCase().includes(q) ||
          (n.numero ?? "").includes(q) ||
          n.chave.includes(q.replace(/\s/g, "")) ||
          brl(Number(n.valor_total)).includes(q)),
    );
  }, [comSituacao, fornecedor, modelo, busca]);
  const lista = useMemo(
    () => filtradas.filter(({ s, pronta }) => situacao === "todas" || (situacao === "a_lancar" ? pronta : s.id === situacao)),
    [filtradas, situacao],
  );

  const conta = (f: (x: (typeof filtradas)[number]) => boolean) => filtradas.filter(f);
  const aguardando = conta(({ s }) => s.id === "aguardando" || s.id === "prazo_vencendo");
  const vencendo = conta(({ s }) => s.id === "prazo_vencendo");
  const aLancar = conta(({ pronta }) => pronta);
  const soma = (l: typeof filtradas) => l.reduce((a, x) => a + Number(x.n.valor_total), 0);
  const totalLista = soma(lista);

  const selecionaveis = lista.filter(
    ({ n }) => temManifestacao(n) && manifestacoesPermitidas({ ...n, eventos: eventosAceitos.get(n.id) }, hoje).length > 0,
  );
  const notasMarcadas = (d?.notas ?? []).filter((n) => marcadas.has(n.id));
  const nfe = d?.controle.find((c) => c.fonte === "nfe");
  const vencido = d?.certificado && d.certificado.valido_ate < new Date().toISOString();
  const avisoBusca = useMemo(() => avisoDaBusca(d?.controle ?? []), [d?.controle]);

  const resumo = !cliente
    ? ""
    : resumoNotasRecebidas({
        aguardando: aguardando.length,
        valorAguardando: brl(soma(aguardando)),
        vencendo: vencendo.length,
        aLancar: aLancar.length,
        valorALancar: brl(soma(aLancar)),
      });

  function limparFiltros() {
    setFornecedor("");
    setModelo("");
    setBusca("");
    setSituacao("todas");
    setPeriodo("90");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    ...(periodo !== "90"
      ? [{ id: "periodo", rotulo: `Emissão: ${PERIODOS.find((x) => x.id === periodo)?.nome ?? ""}`, aoTirar: () => setPeriodo("90") }]
      : []),
    ...(situacao !== "todas"
      ? [{ id: "situacao", rotulo: `Situação: ${FILTROS.find((f) => f.id === situacao)?.nome ?? ""}`, aoTirar: () => setSituacao("todas") }]
      : []),
    ...(busca ? [{ id: "busca", rotulo: `Busca: ${busca}`, aoTirar: () => setBusca("") }] : []),
    ...(fornecedor
      ? [
          {
            id: "fornecedor",
            rotulo: `Fornecedor: ${fornecedores.find(([k]) => k === fornecedor)?.[1] ?? ""}`,
            aoTirar: () => setFornecedor(""),
          },
        ]
      : []),
    ...(modelo ? [{ id: "modelo", rotulo: `Tipo: ${modelo === "55" ? "NF-e" : "NFS-e"}`, aoTirar: () => setModelo("") }] : []),
  ];

  function marcar(id: string, sim: boolean) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (sim) n.add(id);
      else n.delete(id);
      return n;
    });
  }
  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      setMarcadas(new Set());
      consulta.recarregar();
    }
  }
  async function buscar() {
    if (!cliente) return;
    setBuscando(true);
    try {
      const r = await buscarAgora(cliente.id);
      if (r.mensagem) mostrar(r.mensagem, "atencao");
      else {
        const docs = r.resultados.reduce((a, x) => a + x.documentos, 0);
        const erro = r.resultados.find((x) => x.erro)?.erro;
        mostrar(erro ? `Busca feita com aviso: ${erro}` : `Busca feita: ${docs} documento(s) novo(s).`, erro ? "atencao" : "sucesso");
      }
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setBuscando(false);
    }
  }
  function menu(e: React.MouseEvent<HTMLElement>, j: Janela) {
    e.currentTarget.closest("details")?.removeAttribute("open");
    setJanela(j);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Notas recebidas</h1>
          <p className="text-sm text-neutral-600">
            Notas emitidas contra o CNPJ da MDC (compras e serviços), buscadas sozinhas na SEFAZ e na NFS-e Nacional: confira e lance
            no Financeiro.
          </p>
        </div>
        {pode("contratos") && (
          <Link href="/contratos/faturas" className="btn">
            <Icone nome="enviar" className="h-4 w-4" />
            Emitir nota fiscal
          </Link>
        )}
        <BotoesExportar
          vazio={!lista.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Notas recebidas",
            subtitulo: `${cliente ? nomeCliente(cliente) : ""} · emissão ${intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? "")}` : "todas"} · ${FILTROS.find((f) => f.id === situacao)?.nome} · ${plural(lista.length, "nota")}`,
            arquivo: nomeArquivo("Notas-recebidas", cliente ? nomeCliente(cliente) : "", hoje),
            logoUrl: org.logo_url,
            linhas: lista,
            colunas: [
              { titulo: "Emissão", valor: (x) => fmtDataLocal(x.n.emissao), largura: 12 },
              { titulo: "Tipo", valor: (x) => nomeModelo(x.n.modelo), largura: 8, peso: 0.6 },
              { titulo: "Número", valor: (x) => x.n.numero ?? "", largura: 10, peso: 0.7 },
              { titulo: "Fornecedor", valor: (x) => fornecedorDa(x.n), peso: 3, largura: 40 },
              { titulo: "Valor", valor: (x) => Number(x.n.valor_total), formato: "moeda", peso: 1.2 },
              {
                titulo: "Situação",
                valor: (x) => SITUACOES_PAINEL[x.s.id].nome,
                peso: 1.6,
                largura: 24,
                alerta: (x) => x.s.id === "prazo_vencendo",
              },
              { titulo: "Prazo", valor: (x) => (x.s.prazo ? fmtData(x.s.prazo) : ""), largura: 12 },
              { titulo: "Lançada", valor: (x) => (x.n.processada ? "Sim" : x.pronta ? "Pronta" : "Não"), largura: 10, peso: 0.7 },
              { titulo: "Chave", valor: (x) => x.n.chave, peso: 2.4, largura: 48 },
            ],
            totais: { Valor: totalLista },
          })}
        />
        {podeOperar && cliente && (
          <>
            <button className="btn" onClick={() => setJanela({ tipo: "xml" })}>
              Enviar XML
            </button>
            <button
              className="btn-primario"
              onClick={buscar}
              disabled={buscando || !d?.certificado || !!vencido}
              title="Busca notas novas na SEFAZ e na NFS-e Nacional"
            >
              {buscando ? "Buscando…" : "Buscar agora"}
            </button>
          </>
        )}
      </div>

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <FiltroPeriodo
          rotulo="Emissão"
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
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSit)}>
            {FILTROS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo-largo min-w-48 flex-1">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, fornecedor, chave ou valor" />
        </label>
        <MaisFiltros emUso={(fornecedor ? 1 : 0) + (modelo ? 1 : 0)}>
          <label className="campo">
            <span>Fornecedor</span>
            <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
              <option value="">Todos</option>
              {fornecedores.map(([k, nome]) => (
                <option key={k} value={k}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Tipo de nota</span>
            <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">Todas</option>
              <option value="55">NF-e (produtos)</option>
              <option value="nfse">NFS-e (serviços)</option>
            </select>
          </label>
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <SemEmpresaGestao />
      ) : consulta.carregando && !d ? (
        <Carregando />
      ) : (
        <>
          {!d?.certificado ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Sem certificado digital: as notas não chegam sozinhas. Cadastre o certificado A1 da MDC em{" "}
              <Link className="underline" href="/entradas/certificado">
                Certificado digital
              </Link>{" "}
              ou envie os XML pelo botão “Enviar XML”.
            </p>
          ) : vencido ? (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              O certificado digital venceu em {fmtDataLocal(d.certificado.valido_ate)}. A busca automática parou;{" "}
              <Link className="underline" href="/entradas/certificado">
                envie o novo
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="text-xs text-neutral-600">
                Busca automática ligada.{" "}
                {nfe?.ultima_consulta_em ? `Última consulta à SEFAZ: ${fmtDataLocal(nfe.ultima_consulta_em)}. ` : ""}
                Próxima: {quandoProximaBusca(nfe?.bloqueado_ate ?? nfe?.proxima_consulta_em ?? null, new Date())}.
              </p>
              {avisoBusca && (
                <div
                  role="status"
                  className={`rounded-md p-3 text-sm ${avisoBusca.agir ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                >
                  <p className="flex items-start gap-2">
                    <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {avisoBusca.texto}
                      {avisoBusca.agir && (
                        <>
                          {" "}
                          <Link className="underline" href="/entradas/certificado">
                            Abrir Certificado digital
                          </Link>
                        </>
                      )}
                    </span>
                  </p>
                  <details className="mt-1 pl-6 text-xs">
                    <summary className="cursor-pointer select-none underline">Ver detalhes</summary>
                    <p className="mt-1 opacity-80">Texto técnico para a equipe MDC, caso o aviso continue:</p>
                    <ul className="mt-1 space-y-1 break-all font-mono opacity-80">
                      {avisoBusca.detalhes.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </>
          )}

          <p className="text-sm text-neutral-700">{resumo}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              icone="chat"
              titulo="Aguardando sua resposta"
              valor={String(aguardando.length)}
              detalhe={brl(soma(aguardando))}
              tom={aguardando.length ? "ambar" : "neutro"}
              ativo={situacao === "aguardando"}
              aoClicar={() => setSituacao(situacao === "aguardando" ? "todas" : "aguardando")}
            />
            <Indicador
              icone="relogio"
              titulo="Prazo vencendo"
              valor={String(vencendo.length)}
              detalhe="10 dias ou menos para responder"
              tom={vencendo.length ? "vermelho" : "neutro"}
              ativo={situacao === "prazo_vencendo"}
              aoClicar={() => setSituacao(situacao === "prazo_vencendo" ? "todas" : "prazo_vencendo")}
            />
            <Indicador
              icone="check"
              titulo="Prontas para lançar"
              valor={String(aLancar.length)}
              detalhe={brl(soma(aLancar))}
              tom={aLancar.length ? "verde" : "neutro"}
              ativo={situacao === "a_lancar"}
              aoClicar={() => setSituacao(situacao === "a_lancar" ? "todas" : "a_lancar")}
            />
          </div>

          {podeOperar && notasMarcadas.length > 0 && (
            <div className="cartao flex flex-wrap items-center gap-2 p-3">
              <span className="mr-auto text-sm">
                {contar(notasMarcadas.length, "nota marcada", "notas marcadas")} ·{" "}
                {brl(notasMarcadas.reduce((a, n) => a + Number(n.valor_total), 0))}
              </span>
              <button
                className="btn-primario"
                onClick={() => setJanela({ tipo: "manifestar", notas: notasMarcadas, inicial: "confirmada" })}
              >
                Confirmar as marcadas
              </button>
              <button className="btn" onClick={() => setJanela({ tipo: "manifestar", notas: notasMarcadas })}>
                Outra resposta…
              </button>
              <button className="btn-link text-sm" onClick={() => setMarcadas(new Set())}>
                Desmarcar
              </button>
            </div>
          )}

          {!lista.length ? (
            <EstadoVazio
              acao={
                podeOperar &&
                !d?.notas.length && (
                  <button className="btn-primario" onClick={() => setJanela({ tipo: "xml" })}>
                    Enviar um XML
                  </button>
                )
              }
            >
              {d?.notas.length
                ? "Nada neste filtro. Troque a situação ou o período."
                : d?.certificado
                  ? "Nenhuma nota chegou neste período. A busca automática roda a cada 15 minutos."
                  : "Nenhuma nota ainda. Cadastre o certificado digital ou envie os XML."}
            </EstadoVazio>
          ) : (
            <QuadroTabela
              rotulo="Notas recebidas"
              rodape={
                lista.length > MOSTRAR ? `Mostrando ${MOSTRAR} de ${lista.length}. Os totais e a exportação consideram todas.` : undefined
              }
            >
              <thead>
                <tr className={LINHA}>
                  {podeOperar && (
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Marcar todas que aceitam resposta"
                        checked={selecionaveis.length > 0 && selecionaveis.every(({ n }) => marcadas.has(n.id))}
                        onChange={(e) => setMarcadas(e.target.checked ? new Set(selecionaveis.map(({ n }) => n.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>Emissão</th>
                  <th>Nota</th>
                  <th>Fornecedor</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  <th>Lançamento</th>
                  <th className="text-right">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, MOSTRAR).map(({ n, s, pronta }) => {
                  const pode = temManifestacao(n) && manifestacoesPermitidas({ ...n, eventos: eventosAceitos.get(n.id) }, hoje).length > 0;
                  return (
                    <tr key={n.id} className={`${LINHA} ${s.id === "cancelada" ? "linha-apagada" : ""}`}>
                      {podeOperar && (
                        <td data-rotulo={pode ? "Marcar" : undefined}>
                          {pode && (
                            <input
                              type="checkbox"
                              aria-label={`Marcar nota ${n.numero}`}
                              checked={marcadas.has(n.id)}
                              onChange={(e) => marcar(n.id, e.target.checked)}
                            />
                          )}
                        </td>
                      )}
                      <td data-rotulo="Emissão" className="whitespace-nowrap tabular-nums">
                        {fmtDataLocal(n.emissao)}
                      </td>
                      <td data-rotulo="Nota" className="whitespace-nowrap">
                        <span>
                          {nomeModelo(n.modelo)} {n.numero}
                          {n.conteudo === "resumo" && (
                            <span
                              className="block text-xs text-neutral-500"
                              title="O XML completo chega depois da ciência ou da confirmação"
                            >
                              só resumo
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="celula-titulo min-w-36">{fornecedorDa(n)}</td>
                      <td data-rotulo="Valor" className="whitespace-nowrap text-right tabular-nums">
                        {brl(Number(n.valor_total))}
                      </td>
                      <td data-rotulo="Situação">
                        <span>
                          <ChipSituacao id={s.id} />
                          {(s.id === "aguardando" || s.id === "prazo_vencendo") && s.diasRestantes != null && (
                            <span className="block pl-2.5 pt-0.5 text-xs text-[var(--texto-suave)]">
                              {s.diasRestantes === 1 ? "falta 1 dia" : `faltam ${s.diasRestantes} dias`} para responder
                            </span>
                          )}
                        </span>
                      </td>
                      <td data-rotulo="Lançamento" className="whitespace-nowrap text-sm">
                        {n.processada ? (
                          <span className="chip bg-emerald-50 text-emerald-800">Lançada</span>
                        ) : pronta && podeOperar ? (
                          <Link className="btn !min-h-8 !px-3" href={`/entradas/lancar?nota=${n.id}`}>
                            Lançar
                          </Link>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="celula-acoes whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeOperar && pode && (
                            <button
                              className="btn !min-h-10 !gap-1.5 !px-2.5"
                              title="Responder à SEFAZ: confirmar, desconhecer ou recusar a nota"
                              onClick={() => setJanela({ tipo: "manifestar", notas: [n] })}
                            >
                              <Icone nome="chat" className="h-4 w-4" />
                              Responder
                            </button>
                          )}
                          <BotoesVerNota nota={n} avisar={mostrar} aoVer={() => setJanela({ tipo: "espelho", nota: n })} />
                          <details className="relative">
                            <summary
                              className="btn !min-h-10 !w-10 list-none !p-0 [&::-webkit-details-marker]:hidden"
                              aria-label="Mais ações"
                              title="Mais ações"
                            >
                              <Icone nome="reticencias" className="h-5 w-5" />
                            </summary>
                            <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-[var(--borda)] bg-white p-1 text-left text-sm shadow-lg">
                              <button
                                className={ITEM_MENU}
                                title="Ver caminho: de onde veio esta nota e para onde foi (pedido, contas, pagamentos e estoque)"
                                onClick={(e) => menu(e, { tipo: "caminho", nota: n })}
                              >
                                <Icone nome="ramificacao" className="h-4 w-4 text-[var(--texto-suave)]" />
                                Ver caminho
                              </button>
                              {n.xml_caminho && (
                                <button
                                  className={ITEM_MENU}
                                  title="Mostra a nota no layout do DANFE / DANFSe e baixa em PDF"
                                  onClick={(e) => menu(e, { tipo: "espelho", nota: n })}
                                >
                                  <Icone nome="olho" className="h-4 w-4 text-[var(--texto-suave)]" />
                                  Ver a nota
                                </button>
                              )}
                              <button className={ITEM_MENU} onClick={(e) => menu(e, { tipo: "detalhe", nota: n })}>
                                <Icone nome="lista" className="h-4 w-4 text-[var(--texto-suave)]" />
                                Ver itens e histórico
                              </button>
                              <BotaoXml compacto caminho={n.xml_caminho} avisar={mostrar} />
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={`${LINHA} font-medium`}>
                  <td colSpan={podeOperar ? 4 : 3}>Total ({contar(lista.length, "nota", "notas")})</td>
                  <td className="text-right tabular-nums">{brl(totalLista)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </QuadroTabela>
          )}
        </>
      )}

      {janela?.tipo === "manifestar" && cliente && (
        <JanelaManifestar
          cliente={cliente.id}
          notas={janela.notas}
          tipoInicial={janela.inicial}
          aoFechar={() => fechar()}
          aoConcluir={fechar}
        />
      )}
      {janela?.tipo === "detalhe" && (
        <DetalheNota
          nota={janela.nota}
          eventos={d?.eventos ?? []}
          avisar={mostrar}
          aoFechar={() => fechar()}
          aoVerNota={() => setJanela({ tipo: "espelho", nota: janela.nota })}
          aoVerCaminho={() => setJanela({ tipo: "caminho", nota: janela.nota, volta: janela })}
        />
      )}
      {janela?.tipo === "caminho" && cliente && (
        <ArvoreDocumento
          ponto={{ tipo: "nota", id: janela.nota.id }}
          clienteId={cliente.id}
          empresa={nomeCliente(cliente)}
          titulo={`${nomeModelo(janela.nota.modelo)} nº ${janela.nota.numero ?? "—"}`}
          aoFechar={() => setJanela(janela.volta ?? null)}
        />
      )}
      {janela?.tipo === "espelho" && <EspelhoNota nota={janela.nota} avisar={mostrar} aoFechar={() => fechar()} />}
      {janela?.tipo === "xml" && cliente && <EnviarXml org={org.id} cliente={cliente.id} aoFechar={() => fechar()} aoConcluir={fechar} />}
    </div>
  );
}
