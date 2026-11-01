// Financeiro › Extratos: importa o extrato do banco (OFX, que todo banco exporta, ou planilha Excel/CSV) numa conta
// bancária da empresa e lista os lançamentos com filtros simples (período, conta, entradas/saídas, situação, busca),
// totais e exportação em PDF e Excel. Lançamento repetido (mesmo identificador do banco ou mesma data/valor/histórico)
// não entra duas vezes. A conciliação (classificar cada lançamento) é a etapa 2.
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { lerContas, lerLinhas, lerLotes, textoDoArquivo } from "@/dominios/financeiro/leituras";
import { lerOfx } from "@/dominios/financeiro/ofx";
import type { ExtratoLido } from "@/dominios/financeiro/ofx";
import { lerExtratoPlanilha } from "@/dominios/financeiro/extratoPlanilha";
import { importarExtrato } from "@/dominios/financeiro/repositorio";
import type { LinhaExtrato } from "@/dominios/financeiro/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO, mesAtualISO, mesAnteriorISO, somarDias } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";

const SITUACAO = {
  pendente: { nome: "A conciliar", tom: "bg-amber-50 text-amber-900" },
  conciliado: { nome: "Conciliado", tom: "bg-emerald-50 text-emerald-800" },
  ignorado: { nome: "Ignorado", tom: "bg-neutral-100 text-neutral-700" },
} as const;
const MOSTRAR = 500;

type Previa = { arquivo: string; formato: "ofx" | "planilha"; extrato: ExtratoLido };

/** Último dia do mês de uma data AAAA-MM-01. */
const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes.slice(0, 8)}${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
};

export default function PaginaExtratos() {
  const { org, pode } = useOrg();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const podeOperar = pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const [periodo, setPeriodo] = useState("mes");
  const [de, setDe] = useState(somarDias(hoje, -30));
  const [ate, setAte] = useState(hoje);
  const [conta, setConta] = useState("");
  const [tipo, setTipo] = useState("");
  const [situacao, setSituacao] = useState("");
  const [busca, setBusca] = useState("");
  const [contaImportar, setContaImportar] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  const intervalo = useMemo(() => {
    if (periodo === "mes") return { de: mesAtualISO(org.fuso), ate: fimDoMes(mesAtualISO(org.fuso)) };
    if (periodo === "anterior") return { de: mesAnteriorISO(org.fuso), ate: fimDoMes(mesAnteriorISO(org.fuso)) };
    if (periodo === "90") return { de: somarDias(hoje, -90), ate: hoje };
    if (periodo === "tudo") return { de: undefined, ate: undefined };
    return { de: de || undefined, ate: ate || undefined };
  }, [periodo, de, ate, hoje, org.fuso]);

  const contas = useConsulta(useCallback(async () => (cliente ? lerContas(cliente.id) : []), [cliente]));
  const ativas = useMemo(() => (contas.dados ?? []).filter((c) => c.ativo), [contas.dados]);
  const nomeConta = useCallback((id: string) => contas.dados?.find((c) => c.id === id)?.nome ?? "—", [contas.dados]);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [linhas, lotes] = await Promise.all([
        lerLinhas(cliente.id, { conta: conta || undefined, de: intervalo.de, ate: intervalo.ate }),
        lerLotes(cliente.id),
      ]);
      return { linhas, lotes };
    }, [cliente, conta, intervalo]),
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (consulta.dados?.linhas ?? []).filter(
      (l) =>
        (!tipo || (tipo === "entradas" ? l.valor > 0 : l.valor < 0)) &&
        (!situacao || l.situacao === situacao) &&
        (!q ||
          l.descricao.toLowerCase().includes(q) ||
          (l.documento ?? "").toLowerCase().includes(q) ||
          brl(Math.abs(l.valor)).includes(q)),
    );
  }, [consulta.dados, tipo, situacao, busca]);
  const entradas = lista.filter((l) => l.valor > 0).reduce((a, l) => a + Number(l.valor), 0);
  const saidas = lista.filter((l) => l.valor < 0).reduce((a, l) => a + Number(l.valor), 0);

  async function escolherArquivo(arq: File | undefined) {
    if (!arq) return;
    setLendo(true);
    setPrevia(null);
    try {
      const ofx = /\.(ofx|qfx)$/i.test(arq.name);
      let extrato: ExtratoLido;
      if (ofx) extrato = lerOfx(await textoDoArquivo(arq));
      else {
        const { abas, dados } = await lerPlanilha(arq);
        extrato = lerExtratoPlanilha(dados[abas[0]]);
      }
      if (!extrato.lancamentos.length) throw new Error("Não encontrei lançamentos neste arquivo.");
      const alvo = contas.dados?.find((c) => c.id === contaImportar);
      const numero = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
      if (
        alvo?.numero &&
        extrato.conta &&
        !numero(extrato.conta).includes(numero(alvo.numero)) &&
        !numero(alvo.numero).includes(numero(extrato.conta))
      )
        extrato.avisos.unshift(
          `Atenção: o arquivo é da conta ${extrato.conta}, e a conta escolhida está cadastrada como ${alvo.numero}. Confira antes de gravar.`,
        );
      setPrevia({ arquivo: arq.name, formato: ofx ? "ofx" : "planilha", extrato });
    } catch (e) {
      mostrar(e instanceof Error ? e.message : traduzirErro(e), "erro");
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!previa || !contaImportar) return;
    setGravando(true);
    try {
      const r = await importarExtrato(contaImportar, previa.arquivo, previa.formato, previa.extrato);
      setPrevia(null);
      mostrar(
        r.novas
          ? `Extrato importado em ${nomeConta(contaImportar)}: ${r.novas} lançamento(s) novo(s)` +
              (r.repetidas ? `, ${r.repetidas} já estavam no HUB e foram ignorados.` : ".")
          : `Nada novo: os ${r.recebidas} lançamento(s) deste arquivo já estavam no HUB.`,
        r.novas ? "sucesso" : "atencao",
      );
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setGravando(false);
    }
  }

  const rotuloPeriodo =
    intervalo.de || intervalo.ate
      ? `${fmtData(intervalo.de ?? "") || "início"} a ${fmtData(intervalo.ate ?? "") || "hoje"}`
      : "Todo o período";
  const titulo = "Extrato bancário";
  const subtitulo = cliente
    ? `${nomeCliente(cliente)} · ${conta ? nomeConta(conta) : "Todas as contas"} · ${rotuloPeriodo} · ${lista.length} lançamento(s)`
    : "";
  const arquivoBase = `Extrato-${(cliente ? nomeCliente(cliente) : "").replace(/[^\w]+/g, "-")}-${hoje}`;
  const linhaExp = (l: LinhaExtrato) => ({
    data: fmtData(l.data),
    conta: nomeConta(l.conta_id),
    descricao: l.descricao,
    documento: l.documento ?? "",
    entrada: l.valor > 0 ? Number(l.valor) : null,
    saida: l.valor < 0 ? -Number(l.valor) : null,
    situacao: SITUACAO[l.situacao].nome,
  });

  async function pdf() {
    try {
      const bytes = await gerarRelatorioPdf({
        titulo,
        subtitulo,
        paisagem: true,
        logo: await carregarLogo(org.logo_url),
        secoes: [
          {
            titulo: "Lançamentos",
            colunas: [
              { titulo: "Data", peso: 0.9 },
              { titulo: "Conta", peso: 1.5 },
              { titulo: "Histórico", peso: 4 },
              { titulo: "Documento", peso: 1.1 },
              { titulo: "Entrada", peso: 1.2, direita: true },
              { titulo: "Saída", peso: 1.2, direita: true },
              { titulo: "Situação", peso: 1 },
            ],
            linhas: [
              ...lista.map((l) => {
                const x = linhaExp(l);
                return {
                  celulas: [
                    x.data,
                    x.conta,
                    x.descricao,
                    x.documento,
                    x.entrada ? brl(x.entrada) : "",
                    x.saida ? brl(x.saida) : "",
                    x.situacao,
                  ],
                  alerta: [false, false, false, false, false, !!x.saida, false],
                };
              }),
              { celulas: ["", "", "Totais do filtro", "", brl(entradas), brl(-saidas), ""], negrito: true, fundo: true },
              { celulas: ["", "", "Resultado (entradas menos saídas)", "", brl(entradas + saidas), "", ""], negrito: true },
            ],
          },
        ],
      });
      baixarBytes(bytes, `${arquivoBase}.pdf`);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  async function excel() {
    try {
      await exportarExcel(`${arquivoBase}.xlsx`, titulo, subtitulo, [
        {
          nome: "Lançamentos",
          colunas: [
            { titulo: "Data", chave: "data", largura: 12 },
            { titulo: "Conta", chave: "conta", largura: 24 },
            { titulo: "Histórico", chave: "descricao", largura: 60 },
            { titulo: "Documento", chave: "documento", largura: 16 },
            { titulo: "Entrada", chave: "entrada", largura: 16, formato: "moeda" },
            { titulo: "Saída", chave: "saida", largura: 16, formato: "moeda" },
            { titulo: "Situação", chave: "situacao", largura: 14 },
          ],
          linhas: lista.map(linhaExp),
          totais: { descricao: "Totais do filtro", entrada: entradas, saida: -saidas },
        },
      ]);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  const lotes = (consulta.dados?.lotes ?? []).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Extratos</h1>
          <p className="text-sm text-neutral-600">Importe o extrato do banco e veja entradas e saídas por período.</p>
        </div>
        <button className="btn" onClick={pdf} disabled={!lista.length}>
          PDF
        </button>
        <button className="btn" onClick={excel} disabled={!lista.length}>
          Excel
        </button>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
        <label className="campo">
          <span>Conta</span>
          <select value={conta} onChange={(e) => setConta(e.target.value)} disabled={!cliente}>
            <option value="">Todas as contas</option>
            {(contas.dados ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.ativo ? "" : " (inativa)"}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Período</span>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="mes">Este mês</option>
            <option value="anterior">Mês passado</option>
            <option value="90">Últimos 90 dias</option>
            <option value="escolher">Escolher datas</option>
            <option value="tudo">Tudo</option>
          </select>
        </label>
        {periodo === "escolher" && (
          <>
            <label className="campo">
              <span>De</span>
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="campo">
              <span>Até</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
          </>
        )}
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Entradas e saídas</option>
            <option value="entradas">Só entradas</option>
            <option value="saidas">Só saídas</option>
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(SITUACAO).map(([id, s]) => (
              <option key={id} value={id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Histórico, documento ou valor" />
        </label>
      </div>

      {cliente && podeOperar && (
        <div className="cartao space-y-3 p-4">
          <div>
            <h2 className="font-semibold text-[var(--marca)]">Importar extrato</h2>
            <p className="text-sm text-neutral-600">
              Baixe o extrato no internet banking em <b>OFX</b> (também chamado de &quot;Money&quot; ou &quot;arquivo para
              conciliação&quot;) ou em Excel, escolha a conta e o arquivo. Você confere antes de gravar; lançamento que já foi importado não
              entra de novo.
            </p>
          </div>
          {!ativas.length ? (
            <p className="text-sm text-amber-900">
              Cadastre antes a conta bancária em{" "}
              <Link href="/financeiro" className="underline">
                Contas bancárias
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="campo">
                <span>Conta que recebe o extrato</span>
                <select
                  value={contaImportar}
                  onChange={(e) => {
                    setContaImportar(e.target.value);
                    setPrevia(null);
                  }}
                >
                  <option value="">Escolha a conta…</option>
                  {ativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="file"
                accept=".ofx,.qfx,.xls,.xlsx,.csv,.txt"
                disabled={!contaImportar || lendo || gravando}
                onChange={(e) => {
                  void escolherArquivo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}
          {lendo && <p className="text-sm text-neutral-600">Lendo o arquivo…</p>}
          {previa && (
            <div className="space-y-2 rounded-md bg-neutral-50 p-3 text-sm">
              <p>
                <b>{previa.arquivo}</b> → {nomeConta(contaImportar)}: {previa.extrato.lancamentos.length} lançamento(s)
                {previa.extrato.inicio ? ` de ${fmtData(previa.extrato.inicio)} a ${fmtData(previa.extrato.fim ?? "")}` : ""}.
              </p>
              <p>
                Entradas{" "}
                <b className="text-emerald-800">
                  {brl(previa.extrato.lancamentos.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0))}
                </b>{" "}
                · Saídas{" "}
                <b className="text-red-700">
                  {brl(-previa.extrato.lancamentos.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0))}
                </b>
                {previa.extrato.saldoFinal !== null && (
                  <>
                    {" "}
                    · Saldo final informado pelo banco <b>{brl(previa.extrato.saldoFinal)}</b>
                  </>
                )}
              </p>
              {previa.extrato.avisos.map((a) => (
                <p key={a} className="text-amber-900">
                  {a}
                </p>
              ))}
              <div className="flex gap-2">
                <button className="btn-primario" onClick={confirmar} disabled={gravando}>
                  {gravando ? "Gravando…" : "Gravar extrato"}
                </button>
                <button className="btn" onClick={() => setPrevia(null)} disabled={gravando}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {aviso}
      {(consulta.erro || contas.erro) && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro ?? contas.erro}</p>}

      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima para ver os extratos dela.</EstadoVazio>
      ) : consulta.carregando && !consulta.dados ? (
        <Carregando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="cartao p-4">
              <p className="text-xs text-neutral-500">Entradas</p>
              <p className="text-xl font-semibold tabular-nums text-emerald-800">{brl(entradas)}</p>
            </div>
            <div className="cartao p-4">
              <p className="text-xs text-neutral-500">Saídas</p>
              <p className="text-xl font-semibold tabular-nums text-red-700">{brl(-saidas)}</p>
            </div>
            <div className="cartao p-4">
              <p className="text-xs text-neutral-500">Resultado do período</p>
              <p className={`text-xl font-semibold tabular-nums ${entradas + saidas < 0 ? "text-red-700" : "text-neutral-900"}`}>
                {brl(entradas + saidas)}
              </p>
            </div>
          </div>

          {!lista.length ? (
            <EstadoVazio>Nenhum lançamento neste filtro. Troque o período ou importe um extrato.</EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    {!conta && <th>Conta</th>}
                    <th>Histórico</th>
                    <th className="text-right">Valor</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, MOSTRAR).map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">{fmtData(l.data)}</td>
                      {!conta && <td className="whitespace-nowrap">{nomeConta(l.conta_id)}</td>}
                      <td className="min-w-56">
                        {l.descricao}
                        {l.documento && <span className="block text-xs text-neutral-500">doc. {l.documento}</span>}
                      </td>
                      <td className={`whitespace-nowrap text-right tabular-nums ${l.valor < 0 ? "text-red-700" : "text-emerald-800"}`}>
                        {brl(Number(l.valor))}
                      </td>
                      <td>
                        <span className={`chip ${SITUACAO[l.situacao].tom}`}>{SITUACAO[l.situacao].nome}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lista.length > MOSTRAR && (
                <p className="p-3 text-xs text-neutral-500">
                  Mostrando {MOSTRAR} de {lista.length} lançamentos. Os totais e a exportação consideram todos.
                </p>
              )}
            </div>
          )}

          {lotes.length > 0 && (
            <div className="cartao p-4">
              <h2 className="mb-2 font-semibold text-[var(--marca)]">Últimos extratos importados</h2>
              <ul className="space-y-1 text-sm">
                {lotes.map((l) => (
                  <li key={l.id} className="flex flex-wrap gap-x-2">
                    <span className="text-neutral-500">{fmtDataHora(l.em)}</span>
                    <span>{nomeConta(l.conta_id)}</span>
                    <span className="truncate text-neutral-600">{l.arquivo}</span>
                    <span>
                      · {l.novas} novo(s){l.repetidas ? `, ${l.repetidas} repetido(s)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
