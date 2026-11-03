// Licenças › Mensalidades: as cobranças mensais de cada contrato. Filtros por mês, situação e cliente; dar baixa
// (recebimento), desfazer baixa e cancelar, sempre com motivo; gerar as mensalidades do mês; PDF e Excel.
// Com o Ledgra Link ligado (Configurações › Integrações), cada mensalidade em aberto ganha o botão "Boleto/Pix" e a
// baixa passa a ser automática quando o banco avisa o pagamento (migração 043).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData, mesExtenso } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { Cabecalho, EtiquetaBloqueado, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { BaixaCobranca } from "@/dominios/licencas/componentes/BaixaCobranca";
import { diasDeAtraso, mesesAte, SITUACOES, situacaoDaCobranca } from "@/dominios/licencas/regras";
import type { SituacaoExibida } from "@/dominios/licencas/regras";
import { cancelarCobranca, desfazerBaixa, gerarCobrancas } from "@/dominios/licencas/repositorio";
import type { Cobranca } from "@/dominios/licencas/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { JanelaBoletoPix } from "@/dominios/licencas/componentes/JanelaBoletoPix";
import { emissaoValida, lerConfigLink, lerEmissoes, SITUACOES_EMISSAO } from "@/dominios/licencas/ledgraLink";

type FiltroSituacao = "abertas" | "atrasada" | "a_vencer" | "paga" | "cancelada" | "todas";
const FILTROS: { id: FiltroSituacao; nome: string }[] = [
  { id: "abertas", nome: "Em aberto (todas)" },
  { id: "atrasada", nome: "Só atrasadas" },
  { id: "a_vencer", nome: "Só a vencer" },
  { id: "paga", nome: "Pagas" },
  { id: "cancelada", nome: "Canceladas" },
  { id: "todas", nome: "Todas" },
];
const passa = (s: SituacaoExibida, f: FiltroSituacao) =>
  f === "todas" ||
  (f === "abertas"
    ? ["atrasada", "vence_hoje", "a_vencer"].includes(s)
    : f === "a_vencer"
      ? s === "a_vencer" || s === "vence_hoje"
      : s === f);

type Janela = { tipo: "baixa" | "desfazer" | "cancelar" | "boleto"; c: Cobranca };

export default function PaginaCobrancas() {
  const { org } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, nomeDoCliente, podeOperar, bloqueados } = dados;
  const { aviso, mostrar } = useAviso();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [situacao, setSituacao] = useState<FiltroSituacao>("todas");
  const [cliente, setCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);
  const [gerando, setGerando] = useState(false);
  const meses = useMemo(() => mesesAte(hoje, 12, 1).reverse(), [hoje]);
  // Ledgra Link: configuração e boletos/Pix já emitidos (sem configuração, a tela fica como antes)
  const link = useConsulta(
    useCallback(async () => {
      const [config, emissoes] = await Promise.all([lerConfigLink(org.id), lerEmissoes(org.id)]);
      return { config, emissoes: new Map(emissoes.map((e) => [e.lic_cobranca_id, e])) };
    }, [org.id]),
  );
  const linkLigado = !!link.dados?.config?.ativo;
  const emissaoDe = (id: string) => link.dados?.emissoes.get(id);
  const d = dados.dados;

  const clientesComCobranca = useMemo(
    () => [...new Set((d?.cobrancas ?? []).map((c) => c.cliente_id))].sort((a, b) => nomeDoCliente(a).localeCompare(nomeDoCliente(b))),
    [d, nomeDoCliente],
  );
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (d?.cobrancas ?? [])
      .filter(
        (c) =>
          (!mes || c.competencia.startsWith(mes)) &&
          (!cliente || c.cliente_id === cliente) &&
          (!q || `${nomeDoCliente(c.cliente_id)} ${c.descricao}`.toLowerCase().includes(q)),
      )
      .map((c) => ({ c, s: situacaoDaCobranca(c, hoje) }));
  }, [d, mes, cliente, busca, hoje, nomeDoCliente]);
  const lista = useMemo(
    () =>
      base
        .filter((x) => passa(x.s, situacao))
        .sort(
          (a, b) =>
            a.c.vencimento.localeCompare(b.c.vencimento) || nomeDoCliente(a.c.cliente_id).localeCompare(nomeDoCliente(b.c.cliente_id)),
        ),
    [base, situacao, nomeDoCliente],
  );
  const soma = (f: (x: (typeof base)[number]) => boolean, v: (c: Cobranca) => number = (c) => c.valor) =>
    base.filter(f).reduce((s, x) => s + v(x.c), 0);
  const atrasado = soma((x) => x.s === "atrasada");
  const aVencer = soma((x) => x.s === "a_vencer" || x.s === "vence_hoje");
  const recebido = soma(
    (x) => x.s === "paga",
    (c) => c.valor_pago ?? c.valor,
  );
  const totalLista = lista.reduce((s, x) => s + (x.s === "cancelada" ? 0 : x.c.valor), 0);
  const rotuloMes = mes ? mesExtenso(mes) : "todos os meses";

  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      dados.recarregar();
      link.recarregar();
    }
  }
  function menu(e: React.MouseEvent<HTMLElement>, j: Janela) {
    e.currentTarget.closest("details")?.removeAttribute("open");
    setJanela(j);
  }
  async function gerar() {
    const alvo = mes || hoje.slice(0, 7);
    setGerando(true);
    try {
      const n = await gerarCobrancas(org.id, `${alvo}-01`);
      mostrar(
        n ? `${n} mensalidade(s) de ${mesExtenso(alvo)} gerada(s).` : `As mensalidades de ${mesExtenso(alvo)} já estavam todas geradas.`,
      );
      dados.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Mensalidades" descricao="As cobranças mensais das licenças: o que vence, o que foi pago e o que está atrasado.">
        <BotoesExportar
          vazio={!lista.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Mensalidades de licença",
            subtitulo: `${org.nome} · ${rotuloMes} · ${FILTROS.find((x) => x.id === situacao)?.nome} · ${lista.length} mensalidade(s)`,
            arquivo: nomeArquivo("Mensalidades-licenca", mes || "todos", hoje),
            logoUrl: org.logo_url,
            linhas: lista,
            colunas: [
              { titulo: "Cliente", valor: (x) => nomeDoCliente(x.c.cliente_id), peso: 2.4, largura: 36 },
              { titulo: "Descrição", valor: (x) => x.c.descricao, peso: 3, largura: 44 },
              { titulo: "Mês", valor: (x) => fmtCompetencia(x.c.competencia), peso: 0.8, largura: 10 },
              { titulo: "Vencimento", valor: (x) => fmtData(x.c.vencimento), peso: 1, largura: 12 },
              { titulo: "Valor", valor: (x) => x.c.valor, formato: "moeda", peso: 1.1 },
              { titulo: "Recebido", valor: (x) => x.c.valor_pago, formato: "moeda", peso: 1.1 },
              { titulo: "Pago em", valor: (x) => (x.c.pago_em ? fmtData(x.c.pago_em) : ""), peso: 1, largura: 12 },
              {
                titulo: "Situação",
                valor: (x) => SITUACOES[x.s].nome + (x.s === "atrasada" ? ` (${diasDeAtraso(x.c, hoje)} dias)` : ""),
                peso: 1.3,
                largura: 18,
                alerta: (x) => x.s === "atrasada",
              },
            ],
            totais: { Valor: totalLista, Recebido: lista.reduce((s, x) => s + (x.c.valor_pago ?? 0), 0) },
          })}
        />
        {podeOperar && (
          <button
            className="btn-primario"
            onClick={gerar}
            disabled={gerando || !d}
            title="Cria as mensalidades que ainda faltam no mês escolhido (não duplica)"
          >
            {gerando ? "Gerando…" : `Gerar mensalidades de ${mesExtenso(mes || hoje.slice(0, 7))}`}
          </button>
        )}
      </Cabecalho>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Mês</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {mesExtenso(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}>
            {FILTROS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48">
          <span>Cliente</span>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientesComCobranca.map((id) => (
              <option key={id} value={id}>
                {nomeDoCliente(id)}
              </option>
            ))}
          </select>
        </label>
        <details className="w-full sm:w-auto">
          <summary className="cursor-pointer py-2 text-sm text-neutral-700">Mais filtros</summary>
          <label className="campo mt-2">
            <span>Buscar</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente ou descrição" />
          </label>
        </details>
        {(cliente || busca || situacao !== "todas" || mes !== hoje.slice(0, 7)) && (
          <button
            className="btn-link min-h-10 text-sm"
            onClick={() => {
              setCliente("");
              setBusca("");
              setSituacao("todas");
              setMes(hoje.slice(0, 7));
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {aviso}
      {dados.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dados.erro}</p>}

      {!d ? (
        <Carregando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              icone="alerta"
              titulo="Atrasado"
              valor={brl(atrasado)}
              tom={atrasado ? "vermelho" : "neutro"}
              ativo={situacao === "atrasada"}
              aoClicar={() => setSituacao(situacao === "atrasada" ? "todas" : "atrasada")}
            />
            <Indicador
              icone="calendario"
              titulo="A vencer"
              valor={brl(aVencer)}
              tom="azul"
              ativo={situacao === "a_vencer"}
              aoClicar={() => setSituacao(situacao === "a_vencer" ? "todas" : "a_vencer")}
            />
            <Indicador
              icone="check"
              titulo="Recebido"
              valor={brl(recebido)}
              tom="verde"
              ativo={situacao === "paga"}
              aoClicar={() => setSituacao(situacao === "paga" ? "todas" : "paga")}
            />
          </div>

          {!lista.length ? (
            <EstadoVazio
              acao={
                podeOperar &&
                !base.length &&
                d.contratos.some((k) => k.situacao === "ativo") && (
                  <button className="btn-primario" onClick={gerar} disabled={gerando}>
                    Gerar mensalidades de {mesExtenso(mes || hoje.slice(0, 7))}
                  </button>
                )
              }
            >
              {base.length
                ? "Nada nesta situação. Troque o filtro."
                : d.contratos.length
                  ? `Nenhuma mensalidade em ${rotuloMes}. Elas são geradas sozinhas todo dia; se precisar, gere agora.`
                  : "Ainda não há contratos de licença. Cadastre em Contratos."}
            </EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Cliente</th>
                    <th className="text-right">Valor</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map(({ c, s }) => (
                    <tr key={c.id} className={s === "cancelada" ? "opacity-60" : ""}>
                      <td className={`whitespace-nowrap tabular-nums ${s === "atrasada" ? "font-medium text-red-700" : ""}`}>
                        {fmtData(c.vencimento)}
                      </td>
                      <td className="min-w-56">
                        <span className="font-medium">{nomeDoCliente(c.cliente_id)}</span>{" "}
                        {bloqueados.has(c.cliente_id) && <EtiquetaBloqueado />}
                        <span className="block text-xs text-neutral-500">{c.descricao}</span>
                        {s === "cancelada" && c.cancelado_motivo && (
                          <span className="block text-xs text-neutral-500">Cancelada: {c.cancelado_motivo}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {brl(c.valor)}
                        {s === "paga" && c.valor_pago != null && c.valor_pago !== c.valor && (
                          <span className="block text-xs text-neutral-500">recebido {brl(c.valor_pago)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={`chip ${SITUACOES[s].tom}`}>{SITUACOES[s].nome}</span>
                        {emissaoDe(c.id) && c.situacao !== "cancelada" && (
                          <span className={`chip mt-1 block w-fit ${SITUACOES_EMISSAO[emissaoDe(c.id)!.situacao].tom}`}>
                            {SITUACOES_EMISSAO[emissaoDe(c.id)!.situacao].nome}
                          </span>
                        )}
                        <span className="block text-xs text-neutral-500">
                          {s === "atrasada" ? `${diasDeAtraso(c, hoje)} dia(s)` : s === "paga" ? `em ${fmtData(c.pago_em)}` : ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {podeOperar && (
                          <div className="flex justify-end gap-1">
                            {c.situacao === "aberta" && linkLigado && (
                              <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "boleto", c })}>
                                {emissaoValida(emissaoDe(c.id)) ? "Ver boleto/Pix" : "Boleto/Pix"}
                              </button>
                            )}
                            {c.situacao === "aberta" && (
                              <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "baixa", c })}>
                                Dar baixa
                              </button>
                            )}
                            {c.situacao !== "cancelada" && (
                              <details className="relative">
                                <summary className="btn !min-h-8 list-none" aria-label="Mais ações">
                                  ⋯
                                </summary>
                                <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-[var(--borda)] bg-white py-1 text-left text-sm shadow-lg">
                                  {c.situacao === "paga" ? (
                                    <button
                                      className="block w-full px-3 py-1.5 text-left text-[var(--perigo)] hover:bg-red-50"
                                      onClick={(e) => menu(e, { tipo: "desfazer", c })}
                                    >
                                      Desfazer baixa
                                    </button>
                                  ) : (
                                    <button
                                      className="block w-full px-3 py-1.5 text-left text-[var(--perigo)] hover:bg-red-50"
                                      onClick={(e) => menu(e, { tipo: "cancelar", c })}
                                    >
                                      Cancelar mensalidade
                                    </button>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td colSpan={2}>Total ({lista.length})</td>
                    <td className="text-right tabular-nums">{brl(totalLista)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {janela?.tipo === "boleto" && (
        <JanelaBoletoPix
          cobranca={janela.c}
          cliente={nomeDoCliente(janela.c.cliente_id)}
          emissao={emissaoDe(janela.c.id)}
          tipoPadrao={link.dados?.config?.tipo_padrao ?? "boleto_hibrido"}
          aoFechar={() => setJanela(null)}
          aoEmitir={() => link.recarregar()}
        />
      )}
      {janela?.tipo === "baixa" && (
        <BaixaCobranca
          cobranca={janela.c}
          cliente={nomeDoCliente(janela.c.cliente_id)}
          hoje={hoje}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
      {janela?.tipo === "desfazer" && (
        <JanelaMotivo
          titulo="Desfazer baixa"
          descricao={`${nomeDoCliente(janela.c.cliente_id)} · ${janela.c.descricao} · recebido ${brl(janela.c.valor_pago)} em ${fmtData(janela.c.pago_em)}. A mensalidade volta a ficar em aberto; o registro do pagamento fica guardado.`}
          botao="Desfazer baixa"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await desfazerBaixa(janela.c.id, motivo);
            fechar("Baixa desfeita. A mensalidade voltou a ficar em aberto.");
          }}
        />
      )}
      {janela?.tipo === "cancelar" && (
        <JanelaMotivo
          titulo="Cancelar mensalidade"
          descricao={`${nomeDoCliente(janela.c.cliente_id)} · ${janela.c.descricao} · ${brl(janela.c.valor)}. Ela deixa de ser cobrada e não é gerada de novo; fica guardada como cancelada.`}
          botao="Cancelar mensalidade"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await cancelarCobranca(janela.c.id, motivo);
            fechar("Mensalidade cancelada.");
          }}
        />
      )}
    </div>
  );
}
