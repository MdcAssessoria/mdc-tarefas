// Financeiro › Conciliação: confere o extrato do banco com o que está lançado no HUB. Escolha a conta e o período;
// à esquerda ficam os lançamentos do extrato (a conciliar primeiro), à direita as sugestões do HUB para o escolhido
// (mesmo valor, data perto, nome parecido, boleto já pago pelo Ledgra Link). Conciliar liga a linha a pagamentos,
// contas em aberto ou transferências; também dá para criar o lançamento, marcar transferência ou ignorar (com motivo).
// Em cima, o movimento do extrato × o do HUB no período, com a diferença em destaque. Regras: dominios/financeiro/
// conciliacao.ts; gravação no banco (051). Etapa 2 da importação de Financeiro › Extratos.
"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { lerCategorias, lerCentros, lerConciliacao, lerContas, lerPessoas } from "@/dominios/financeiro/leituras";
import { desfazerConciliacao } from "@/dominios/financeiro/repositorio";
import { sugerir, textoLigacao } from "@/dominios/financeiro/conciliacao";
import type { LinhaConciliacao } from "@/dominios/financeiro/conciliacao";
import { JanelaConciliar } from "@/dominios/financeiro/componentes/JanelaConciliar";
import type { AbaConciliar } from "@/dominios/financeiro/componentes/JanelaConciliar";
import { PainelConciliacao } from "@/dominios/financeiro/componentes/PainelConciliacao";
import { intervaloDoPeriodo, PERIODOS } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO, somarDias } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";

const SITUACAO = {
  pendente: { nome: "A conciliar", tom: "ambar" },
  conciliado: { nome: "Conciliado", tom: "verde" },
  ignorado: { nome: "Ignorado", tom: "neutro" },
} as const;
const MOSTRAR = 300;

export default function PaginaConciliacao() {
  const { org, pode } = useOrg();
  const { cliente } = useClienteGestao();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const painel = useRef<HTMLDivElement>(null);

  const [contaEscolhida, setConta] = useState("");
  const [periodo, setPeriodo] = useState("mes");
  const [de, setDe] = useState(somarDias(hoje, -30));
  const [ate, setAte] = useState(hoje);
  const [situacao, setSituacao] = useState("pendente");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [janela, setJanela] = useState<{ aba: AbaConciliar; escolha?: string[] } | null>(null);
  const [desfazer, setDesfazer] = useState(false);

  // datas do período como texto (dependências simples: a consulta só refaz quando o período muda de verdade)
  const intervalo = intervaloDoPeriodo(periodo as Periodo, hoje, de, ate);
  const inicio = intervalo.de ?? "1900-01-01";
  const fim = intervalo.ate ?? hoje;
  const rotuloPeriodo = `${fmtData(intervalo.de ?? "") || "início"} a ${fmtData(intervalo.ate ?? "") || "hoje"}`;
  const cad = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [contas, categorias, centros, pessoas] = await Promise.all([
        lerContas(cliente.id),
        lerCategorias(cliente.id),
        lerCentros(cliente.id),
        lerPessoas(cliente.id),
      ]);
      return { contas, categorias, centros, pessoas };
    }, [cliente]),
  );
  const contasAtivas = (cad.dados?.contas ?? []).filter((c) => c.ativo);
  // sem escolha, a primeira conta ativa (a tela é sempre de uma conta: o extrato é por conta)
  const conta = cad.dados?.contas.find((c) => c.id === contaEscolhida) ?? contasAtivas[0] ?? null;

  const contaId = conta?.id ?? "";
  const consulta = useConsulta(useCallback(async () => (contaId ? lerConciliacao(contaId, inicio, fim) : null), [contaId, inicio, fim]));
  const dados = consulta.dados;
  const podeOperar = pode("financeiro", "operar") && !!dados?.pode_operar;

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.linhas ?? []).filter(
      (l) =>
        (!situacao || l.situacao === situacao) &&
        (!tipo || (tipo === "entradas" ? l.valor > 0 : l.valor < 0)) &&
        (!q || `${l.descricao} ${l.documento ?? ""} ${brl(Math.abs(l.valor))} ${textoLigacao(l)}`.toLowerCase().includes(q)),
    );
  }, [dados, situacao, tipo, busca]);
  const aConciliar = (dados?.linhas ?? []).filter((l) => l.situacao === "pendente").length;
  const linha = (dados?.linhas ?? []).find((l) => l.id === escolhida) ?? lista[0] ?? null;
  const melhor = useCallback(
    (l: LinhaConciliacao) => (dados && l.situacao === "pendente" ? sugerir(l, dados, { limite: 1 })[0] : undefined),
    [dados],
  );

  function escolher(l: LinhaConciliacao) {
    setEscolhida(l.id);
    // no celular o painel fica abaixo da lista: leva a pessoa até ele
    if (typeof window !== "undefined" && window.innerWidth < 1024) painel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function gravou(msg: string, tom: "erro" | "sucesso" = "sucesso") {
    mostrar(msg, tom);
    if (tom === "sucesso") {
      setJanela(null);
      setEscolhida(null); // vai para o próximo a conciliar
      consulta.recarregar();
    }
  }

  function limparFiltros() {
    setPeriodo("mes");
    setSituacao("pendente");
    setTipo("");
    setBusca("");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "mes" && {
      id: "periodo",
      rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("mes"),
    },
    situacao !== "pendente" && {
      id: "situacao",
      rotulo: situacao ? `Situação: ${SITUACAO[situacao as keyof typeof SITUACAO].nome}` : "Todas as situações",
      aoTirar: () => setSituacao("pendente"),
    },
    tipo && { id: "tipo", rotulo: tipo === "entradas" ? "Só entradas" : "Só saídas", aoTirar: () => setTipo("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  const saldos = dados?.saldos ?? { extrato: 0, hub: 0, diferenca: 0 };
  const temDiferenca = Math.abs(Number(saldos.diferenca)) >= 0.005;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Conciliação"
        descricao="Confira cada lançamento do extrato com o que está no HUB: conciliar, criar o lançamento, transferência ou ignorar."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Conciliação bancária",
              subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${conta?.nome ?? ""} · ${rotuloPeriodo} · extrato ${brl(Number(saldos.extrato))} · HUB ${brl(Number(saldos.hub))} · diferença ${brl(Number(saldos.diferenca))}`,
              arquivo: `Conciliacao-${(conta?.nome ?? "").replace(/[^\w]+/g, "-")}-${hoje}`,
              logoUrl: org.logo_url,
              colunas: [
                { titulo: "Data", valor: (l: LinhaConciliacao) => fmtData(l.data), peso: 0.8, largura: 12 },
                { titulo: "Histórico", valor: (l) => l.descricao, peso: 3, largura: 50 },
                { titulo: "Valor", valor: (l) => Number(l.valor), formato: "moeda", peso: 1.1, alerta: (l) => l.valor < 0 },
                { titulo: "Situação", valor: (l) => SITUACAO[l.situacao].nome, peso: 0.9, largura: 14 },
                { titulo: "Ligado a", valor: (l) => textoLigacao(l), peso: 3, largura: 50 },
              ],
              linhas: lista,
            })}
          />
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo">
          <span>Conta bancária</span>
          <select
            value={conta?.id ?? ""}
            onChange={(e) => {
              setConta(e.target.value);
              setEscolhida(null);
            }}
            disabled={!cad.dados?.contas.length}
          >
            {(cad.dados?.contas ?? []).map((c) => (
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
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Histórico, documento, valor ou nome" />
        </label>
        <MaisFiltros emUso={(situacao !== "pendente" ? 1 : 0) + (tipo ? 1 : 0)}>
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
          <label className="campo">
            <span>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Entradas e saídas</option>
              <option value="entradas">Só entradas</option>
              <option value="saidas">Só saídas</option>
            </select>
          </label>
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {(consulta.erro || cad.erro) && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro ?? cad.erro}
        </p>
      )}

      {!cliente ? (
        <SemEmpresaGestao icone="banco" />
      ) : cad.carregando && !cad.dados ? (
        <Esqueleto />
      ) : !conta ? (
        <EstadoVazio
          icone="banco"
          titulo="Nenhuma conta bancária cadastrada"
          acao={
            <Link href="/financeiro/bancos" className="btn">
              Ir para Bancos
            </Link>
          }
        >
          Cadastre a conta do banco em Financeiro › Bancos e importe o extrato em Financeiro › Extratos. Depois volte aqui para conciliar.
        </EstadoVazio>
      ) : consulta.carregando && !dados ? (
        <Esqueleto />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Movimento no extrato"
              icone="banco"
              valor={brl(Number(saldos.extrato))}
              detalhe="entradas menos saídas do banco"
            />
            <Indicador
              titulo="Movimento no HUB"
              icone="carteira"
              valor={brl(Number(saldos.hub))}
              detalhe="pagamentos e transferências nesta conta"
            />
            <Indicador
              titulo="Diferença"
              icone={temDiferenca ? "alerta" : "check"}
              valor={brl(Number(saldos.diferenca))}
              tom={temDiferenca ? "vermelho" : "verde"}
              detalhe={temDiferenca ? "extrato menos HUB: falta conciliar ou lançar" : "extrato e HUB batem no período"}
            />
            <Indicador
              titulo="A conciliar"
              icone="lista"
              valor={String(aConciliar)}
              tom={aConciliar ? "ambar" : "verde"}
              detalhe="lançamentos do extrato"
              ativo={situacao === "pendente"}
              aoClicar={() => setSituacao("pendente")}
            />
          </div>

          {!dados?.linhas.length ? (
            <EstadoVazio
              icone="importar"
              titulo="Nenhum lançamento do extrato neste período"
              acao={
                <Link href="/financeiro/extratos" className="btn">
                  Importar extrato
                </Link>
              }
            >
              Importe o extrato desta conta em Financeiro › Extratos (arquivo OFX ou planilha) ou troque o período.
            </EstadoVazio>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {!lista.length ? (
                <EstadoVazio
                  icone={situacao === "pendente" && !busca && !tipo ? "check" : "filtro"}
                  titulo={situacao === "pendente" && !busca && !tipo ? "Tudo conciliado neste período" : "Nada neste filtro"}
                  acao={
                    <button className="btn" onClick={() => setSituacao("")}>
                      Ver todos os lançamentos
                    </button>
                  }
                >
                  {situacao === "pendente" ? "Todos os lançamentos do extrato já estão ligados ao HUB ou ignorados." : "Troque os filtros."}
                </EstadoVazio>
              ) : (
                <QuadroTabela
                  rotulo="Lançamentos do extrato"
                  rodape={lista.length > MOSTRAR ? `Mostrando ${MOSTRAR} de ${lista.length}. Use a busca para achar os demais.` : undefined}
                >
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Histórico</th>
                      <th className="text-right">Valor</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, MOSTRAR).map((l) => {
                      const s = melhor(l);
                      const ativa = linha?.id === l.id;
                      return (
                        <tr key={l.id} className={ativa ? "bg-[var(--fundo)]" : undefined} aria-selected={ativa}>
                          <td data-rotulo="Data" className="num whitespace-nowrap">
                            {fmtData(l.data)}
                          </td>
                          <td className="celula-titulo min-w-48">
                            <button className="text-left font-medium underline-offset-2 hover:underline" onClick={() => escolher(l)}>
                              {l.descricao}
                            </button>
                            <span className="block text-xs font-normal text-[var(--texto-suave)]">
                              {l.situacao === "pendente"
                                ? s
                                  ? `Sugestão: ${s.motivos[0]}`
                                  : "Sem sugestão: escolha no HUB ou crie o lançamento"
                                : textoLigacao(l)}
                            </span>
                          </td>
                          <td data-rotulo="Valor" className="whitespace-nowrap text-right font-medium">
                            <Valor v={Number(l.valor)} sinal />
                          </td>
                          <td data-rotulo="Situação">
                            <Chip tom={SITUACAO[l.situacao].tom}>{SITUACAO[l.situacao].nome}</Chip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </QuadroTabela>
              )}
              <div ref={painel} className="lg:sticky lg:top-4">
                {dados && (
                  <PainelConciliacao
                    linha={linha}
                    dados={dados}
                    podeOperar={podeOperar}
                    aoAbrir={(aba, escolha) => setJanela({ aba, escolha })}
                    aoDesfazer={() => setDesfazer(true)}
                    aoGravar={gravou}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {janela && linha && dados && conta && cad.dados && (
        <JanelaConciliar
          key={`${linha.id}-${janela.aba}`}
          linha={linha}
          dados={dados}
          conta={conta}
          contas={cad.dados.contas}
          cadastros={cad.dados}
          abaInicial={janela.aba}
          escolhaInicial={janela.escolha}
          aoFechar={() => setJanela(null)}
          aoGravar={gravou}
        />
      )}
      {desfazer && linha && (
        <JanelaMotivo
          titulo="Desfazer conciliação"
          descricao={`${fmtData(linha.data)} · ${linha.descricao}. A linha volta para "A conciliar". Pagamentos lançados continuam valendo (estorne em Contas a pagar/receber, se for o caso).`}
          botao="Desfazer conciliação"
          aoFechar={() => setDesfazer(false)}
          aoConfirmar={async (motivo) => {
            const r = await desfazerConciliacao(linha.id, motivo);
            setDesfazer(false);
            mostrar(
              r.lancados_aqui
                ? `Conciliação desfeita. ${r.lancados_aqui} pagamento(s) lançado(s) nela continua(m) valendo.`
                : "Conciliação desfeita.",
            );
            consulta.recarregar();
          }}
        />
      )}
    </div>
  );
}
