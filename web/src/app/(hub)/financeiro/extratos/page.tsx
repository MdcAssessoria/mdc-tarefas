// Financeiro › Extratos: importa o extrato do banco (OFX, que todo banco exporta, ou planilha Excel/CSV) numa conta
// bancária da empresa e lista os lançamentos com filtros simples (período, conta, entradas/saídas, situação, busca),
// totais e exportação em PDF e Excel. Lançamento repetido (mesmo identificador do banco ou mesma data/valor/histórico)
// não entra duas vezes. A conciliação (classificar cada lançamento) é a etapa 2.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { lerContas, lerLinhas, lerLotes } from "@/dominios/financeiro/leituras";
import { ImportarExtrato } from "@/dominios/financeiro/componentes/ImportarExtrato";
import { ListaLotes } from "@/dominios/financeiro/componentes/ListaLotes";
import type { LinhaExtrato } from "@/dominios/financeiro/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO, mesAtualISO, mesAnteriorISO, somarDias } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
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

  const intervalo = useMemo(() => {
    if (periodo === "mes") return { de: mesAtualISO(org.fuso), ate: fimDoMes(mesAtualISO(org.fuso)) };
    if (periodo === "anterior") return { de: mesAnteriorISO(org.fuso), ate: fimDoMes(mesAnteriorISO(org.fuso)) };
    if (periodo === "90") return { de: somarDias(hoje, -90), ate: hoje };
    if (periodo === "tudo") return { de: undefined, ate: undefined };
    return { de: de || undefined, ate: ate || undefined };
  }, [periodo, de, ate, hoje, org.fuso]);

  const contas = useConsulta(useCallback(async () => (cliente ? lerContas(cliente.id) : []), [cliente]));
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
        <ImportarExtrato
          clienteId={cliente.id}
          contas={contas.dados ?? []}
          nomeConta={nomeConta}
          avisar={mostrar}
          aoGravar={consulta.recarregar}
        />
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

          <ListaLotes lotes={lotes} nomeConta={nomeConta} podeOperar={podeOperar} avisar={mostrar} aoDesfazer={consulta.recarregar} />
        </>
      )}
    </div>
  );
}
