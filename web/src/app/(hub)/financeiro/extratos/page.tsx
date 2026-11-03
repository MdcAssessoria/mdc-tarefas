// Financeiro › Extratos: importa o extrato do banco (OFX, que todo banco exporta, ou planilha Excel/CSV) numa conta
// bancária da empresa e lista os lançamentos com filtros simples (período, conta, entradas/saídas, situação, busca),
// totais e exportação em PDF e Excel. Lançamento repetido (mesmo identificador do banco ou mesma data/valor/histórico)
// não entra duas vezes. A conciliação (classificar cada lançamento) é a etapa 2.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { lerContas, lerLinhas, lerLotes } from "@/dominios/financeiro/leituras";
import { ImportarExtrato } from "@/dominios/financeiro/componentes/ImportarExtrato";
import { ListaLotes } from "@/dominios/financeiro/componentes/ListaLotes";
import type { LinhaExtrato } from "@/dominios/financeiro/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO, somarDias } from "@/lib/datas";
import { intervaloDoPeriodo, PERIODOS } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";
import { Chip } from "@/components/ui/Chip";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { Valor } from "@/components/ui/Valor";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";

import { useAviso } from "@/components/ui/Aviso";

const SITUACAO = {
  pendente: { nome: "A conciliar", tom: "ambar" },
  conciliado: { nome: "Conciliado", tom: "verde" },
  ignorado: { nome: "Ignorado", tom: "neutro" },
} as const;
const MOSTRAR = 500;

export default function PaginaExtratos() {
  const { org, pode } = useOrg();
  const financeiro = useClienteGestao();
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

  // datas completas (AAAA-MM-DD): antes "Este mês" e "Mês passado" mandavam "AAAA-MM" e a consulta falhava
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo as Periodo, hoje, de, ate), [periodo, hoje, de, ate]);

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

  function limparFiltros() {
    setPeriodo("mes");
    setConta("");
    setTipo("");
    setSituacao("");
    setBusca("");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    conta && { id: "conta", rotulo: `Conta: ${nomeConta(conta)}`, aoTirar: () => setConta("") },
    periodo !== "mes" && {
      id: "periodo",
      rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("mes"),
    },
    tipo && { id: "tipo", rotulo: tipo === "entradas" ? "Só entradas" : "Só saídas", aoTirar: () => setTipo("") },
    situacao && {
      id: "situacao",
      rotulo: `Situação: ${SITUACAO[situacao as keyof typeof SITUACAO].nome}`,
      aoTirar: () => setSituacao(""),
    },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Extratos"
        descricao="Importe o extrato do banco e veja entradas e saídas por período."
        acoes={
          <>
            <button className="btn" onClick={pdf} disabled={!lista.length} title="Baixar a lista filtrada em PDF">
              <Icone nome="documento" className="h-4 w-4" />
              PDF
            </button>
            <button className="btn" onClick={excel} disabled={!lista.length} title="Baixar a lista filtrada em Excel">
              <Icone nome="planilha" className="h-4 w-4" />
              Excel
            </button>
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
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
        <FiltroPeriodo
          periodo={periodo as Periodo}
          de={de}
          ate={ate}
          aoMudar={(v) => {
            if (v.periodo) setPeriodo(v.periodo);
            if (v.de !== undefined) setDe(v.de);
            if (v.ate !== undefined) setAte(v.ate);
          }}
        />
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Histórico, documento ou valor" />
        </label>
        <MaisFiltros emUso={(tipo ? 1 : 0) + (situacao ? 1 : 0)}>
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
        </MaisFiltros>
      </CartaoFiltros>

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
      {(consulta.erro || contas.erro) && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro ?? contas.erro}
        </p>
      )}

      {!cliente ? (
        <SemEmpresaGestao icone="banco" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador titulo="Entradas" icone="seta-entrada" valor={brl(entradas)} tom="verde" />
            <Indicador titulo="Saídas" icone="seta-saida" valor={brl(-saidas)} tom="vermelho" />
            <Indicador
              titulo="Resultado do período"
              icone="tendencia"
              valor={brl(entradas + saidas)}
              tom={entradas + saidas < 0 ? "vermelho" : "neutro"}
            />
          </div>

          {!lista.length ? (
            <EstadoVazio
              icone={consulta.dados?.linhas.length ? "filtro" : "importar"}
              titulo={consulta.dados?.linhas.length ? "Nada neste filtro" : "Nenhum lançamento neste período"}
              acao={
                filtrosAtivos.length ? (
                  <button className="btn" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                ) : undefined
              }
            >
              {contas.dados?.length
                ? "Troque o período ou importe o extrato do banco no quadro acima (arquivo OFX ou planilha)."
                : "Cadastre a conta bancária da MDC em Bancos e depois importe o extrato aqui."}
            </EstadoVazio>
          ) : (
            <QuadroTabela
              rotulo="Lançamentos do extrato"
              rodape={
                lista.length > MOSTRAR
                  ? `Mostrando ${MOSTRAR} de ${lista.length} lançamentos. Os totais e a exportação consideram todos.`
                  : undefined
              }
            >
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
                    <td data-rotulo="Data" className="num whitespace-nowrap">
                      {fmtData(l.data)}
                    </td>
                    {!conta && (
                      <td data-rotulo="Conta" className="whitespace-nowrap">
                        {nomeConta(l.conta_id)}
                      </td>
                    )}
                    <td className="celula-titulo min-w-56">
                      {l.descricao}
                      {l.documento && <span className="block text-xs font-normal text-[var(--texto-suave)]">doc. {l.documento}</span>}
                    </td>
                    <td data-rotulo="Valor" className="whitespace-nowrap text-right font-medium">
                      <Valor v={Number(l.valor)} sinal />
                    </td>
                    <td data-rotulo="Situação">
                      <Chip tom={SITUACAO[l.situacao].tom}>{SITUACAO[l.situacao].nome}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}

          <ListaLotes lotes={lotes} nomeConta={nomeConta} podeOperar={podeOperar} avisar={mostrar} aoDesfazer={consulta.recarregar} />
        </>
      )}
    </div>
  );
}
