// Entradas › Notas recebidas: painel dos XML que chegaram (busca automática na SEFAZ e na NFS-e Nacional, ou XML
// enviado), com a situação em linguagem simples (Aguardando sua resposta, Prazo vencendo, Confirmada, Recusada…),
// resposta à SEFAZ em lote, itens, histórico com protocolos, XML para baixar, PDF e Excel do que está na tela.
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
import { EscolhaCliente, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { intervaloDoPeriodo } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
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
import { EnviarXml } from "@/dominios/notas/componentes/EnviarXml";

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

type Janela = { tipo: "manifestar"; notas: Nota[]; inicial?: CodigoManifestacao } | { tipo: "detalhe"; nota: Nota } | { tipo: "xml" };

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

  const resumo = !cliente
    ? ""
    : aguardando.length
      ? `${aguardando.length} nota(s) aguardam sua resposta (${brl(soma(aguardando))})${vencendo.length ? `, ${vencendo.length} com prazo vencendo` : ""}. ${aLancar.length} pronta(s) para lançar.`
      : aLancar.length
        ? `Nenhuma nota esperando resposta. ${aLancar.length} pronta(s) para lançar (${brl(soma(aLancar))}).`
        : "Tudo em dia neste período.";

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
            Notas de compra e de serviço que chegaram para a empresa: responda à SEFAZ e lance no financeiro.
          </p>
        </div>
        <BotoesExportar
          vazio={!lista.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Notas recebidas",
            subtitulo: `${cliente ? nomeCliente(cliente) : ""} · emissão ${intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? "")}` : "todas"} · ${FILTROS.find((f) => f.id === situacao)?.nome} · ${lista.length} nota(s)`,
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

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente gestao={financeiro} />
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
        <details className="w-full sm:w-auto">
          <summary className="cursor-pointer py-2 text-sm text-neutral-700">Mais filtros</summary>
          <div className="mt-2 flex flex-wrap gap-3">
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
          </div>
        </details>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, fornecedor, chave ou valor" />
        </label>
        {(fornecedor || modelo || busca || situacao !== "todas" || periodo !== "90") && (
          <button
            className="btn-link min-h-10 text-sm"
            onClick={() => {
              setFornecedor("");
              setModelo("");
              setBusca("");
              setSituacao("todas");
              setPeriodo("90");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima para ver as notas que ela recebeu.</EstadoVazio>
      ) : consulta.carregando && !d ? (
        <Carregando />
      ) : (
        <>
          {!d?.certificado ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Sem certificado digital: as notas não chegam sozinhas. Cadastre o certificado A1 da empresa em{" "}
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
            <p className="text-xs text-neutral-600">
              Busca automática ligada. {nfe?.ultima_consulta_em ? `Última consulta à SEFAZ: ${fmtDataLocal(nfe.ultima_consulta_em)}. ` : ""}
              Próxima: {quandoProximaBusca(nfe?.bloqueado_ate ?? nfe?.proxima_consulta_em ?? null, new Date())}.
              {nfe?.ultimo_erro && <span className="text-red-700"> Último aviso: {nfe.ultimo_erro}</span>}
            </p>
          )}

          <p className="text-sm text-neutral-700">{resumo}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador icone="chat"
              titulo="Aguardando sua resposta"
              valor={String(aguardando.length)}
              detalhe={brl(soma(aguardando))}
              tom={aguardando.length ? "ambar" : "neutro"}
              ativo={situacao === "aguardando"}
              aoClicar={() => setSituacao(situacao === "aguardando" ? "todas" : "aguardando")}
            />
            <Indicador icone="relogio"
              titulo="Prazo vencendo"
              valor={String(vencendo.length)}
              detalhe="10 dias ou menos para responder"
              tom={vencendo.length ? "vermelho" : "neutro"}
              ativo={situacao === "prazo_vencendo"}
              aoClicar={() => setSituacao(situacao === "prazo_vencendo" ? "todas" : "prazo_vencendo")}
            />
            <Indicador icone="check"
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
                {notasMarcadas.length} nota(s) marcada(s) · {brl(notasMarcadas.reduce((a, n) => a + Number(n.valor_total), 0))}
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
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, MOSTRAR).map(({ n, s, pronta }) => {
                    const pode =
                      temManifestacao(n) && manifestacoesPermitidas({ ...n, eventos: eventosAceitos.get(n.id) }, hoje).length > 0;
                    return (
                      <tr key={n.id} className={s.id === "cancelada" ? "opacity-60" : ""}>
                        {podeOperar && (
                          <td>
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
                        <td className="whitespace-nowrap tabular-nums">{fmtDataLocal(n.emissao)}</td>
                        <td className="whitespace-nowrap">
                          {nomeModelo(n.modelo)} {n.numero}
                          {n.conteudo === "resumo" && (
                            <span
                              className="block text-xs text-neutral-500"
                              title="O XML completo chega depois da ciência ou da confirmação"
                            >
                              só resumo
                            </span>
                          )}
                        </td>
                        <td className="min-w-48">{fornecedorDa(n)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{brl(Number(n.valor_total))}</td>
                        <td>
                          <ChipSituacao id={s.id} dias={s.diasRestantes} />
                        </td>
                        <td className="whitespace-nowrap text-sm">
                          {n.processada ? (
                            <span className="chip bg-emerald-50 text-emerald-800">Lançada</span>
                          ) : pronta && podeOperar ? (
                            <Link className="btn !min-h-8" href={`/entradas/lancar?nota=${n.id}`}>
                              Lançar
                            </Link>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">
                            {podeOperar && pode && (
                              <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "manifestar", notas: [n] })}>
                                Responder
                              </button>
                            )}
                            <details className="relative">
                              <summary className="btn !min-h-8 list-none" aria-label="Mais ações">
                                ⋯
                              </summary>
                              <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-[var(--borda)] bg-white py-1 text-left text-sm shadow-lg">
                                <button
                                  className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                                  onClick={(e) => menu(e, { tipo: "detalhe", nota: n })}
                                >
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
                  <tr className="font-medium">
                    <td colSpan={podeOperar ? 4 : 3}>Total ({lista.length})</td>
                    <td className="text-right tabular-nums">{brl(totalLista)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
              {lista.length > MOSTRAR && (
                <p className="p-3 text-xs text-neutral-500">
                  Mostrando {MOSTRAR} de {lista.length}. Os totais e a exportação consideram todas.
                </p>
              )}
            </div>
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
        <DetalheNota nota={janela.nota} eventos={d?.eventos ?? []} avisar={mostrar} aoFechar={() => fechar()} />
      )}
      {janela?.tipo === "xml" && cliente && <EnviarXml org={org.id} cliente={cliente.id} aoFechar={() => fechar()} aoConcluir={fechar} />}
    </div>
  );
}
