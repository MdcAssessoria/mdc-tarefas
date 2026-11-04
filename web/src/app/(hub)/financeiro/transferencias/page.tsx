// Financeiro › Transferências: dinheiro que passou de uma conta bancária para outra da mesma empresa. Lista por
// período e conta, transferir (fin_transferir) e estornar com motivo (fin_estornar_transferencia). PDF e Excel.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Valor } from "@/components/ui/Valor";
import { NovaTransferencia } from "@/dominios/financeiro/componentes/NovaTransferencia";
import { lerContas, lerTransferencias } from "@/dominios/financeiro/leituras";
import { estornarTransferencia } from "@/dominios/financeiro/repositorio";
import { intervaloDoPeriodo, PERIODOS } from "@/dominios/financeiro/regras";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { Transferencia } from "@/dominios/financeiro/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { plural } from "@/lib/formato/numero";

export default function PaginaTransferencias() {
  const { org, pode } = useOrg();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const podeOperar = pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [conta, setConta] = useState("");
  const [nova, setNova] = useState(false);
  const [estornar, setEstornar] = useState<Transferencia | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [contas, transferencias] = await Promise.all([lerContas(cliente.id), lerTransferencias(cliente.id, intervalo)]);
      return { contas, transferencias };
    }, [cliente, intervalo]),
  );
  const nomeConta = useCallback((id: string) => consulta.dados?.contas.find((c) => c.id === id)?.nome ?? "—", [consulta.dados]);
  const lista = useMemo(
    () => (consulta.dados?.transferencias ?? []).filter((t) => !conta || t.origem_id === conta || t.destino_id === conta),
    [consulta.dados, conta],
  );
  const validas = lista.filter((t) => !t.estornada);
  const total = validas.reduce((a, t) => a + Number(t.valor), 0);
  const ativas = (consulta.dados?.contas ?? []).filter((c) => c.ativo).length;

  const rotuloPeriodo =
    intervalo.de || intervalo.ate ? `${fmtData(intervalo.de ?? "") || "início"} a ${fmtData(intervalo.ate ?? "") || "hoje"}` : "Todo o período";
  const filtrosAtivos: FiltroAtivo[] = [
    periodo !== "90" && {
      id: "periodo",
      rotulo: `Período: ${periodo === "escolher" ? rotuloPeriodo : PERIODOS.find((p) => p.id === periodo)?.nome}`,
      aoTirar: () => setPeriodo("90"),
    },
    conta && { id: "conta", rotulo: `Conta: ${nomeConta(conta)}`, aoTirar: () => setConta("") },
  ].filter((f): f is FiltroAtivo => !!f);
  const limpar = () => {
    setPeriodo("90");
    setConta("");
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Transferências"
        descricao="Dinheiro que passou de uma conta bancária para outra da MDC. Não é receita nem despesa."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Transferências entre contas",
                subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${rotuloPeriodo}${conta ? ` · ${nomeConta(conta)}` : ""} · ${plural(lista.length, "transferência")}`,
                arquivo: nomeArquivo("Transferencias", cliente ? nomeCliente(cliente) : "", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Data", valor: (t) => fmtData(t.data), peso: 1, largura: 12 },
                  { titulo: "Saiu de", valor: (t) => nomeConta(t.origem_id), peso: 2, largura: 26 },
                  { titulo: "Entrou em", valor: (t) => nomeConta(t.destino_id), peso: 2, largura: 26 },
                  { titulo: "Observação", valor: (t) => t.observacao ?? "", peso: 2.4, largura: 34 },
                  { titulo: "Valor", valor: (t) => Number(t.valor), formato: "moeda", peso: 1.2 },
                  {
                    titulo: "Situação",
                    valor: (t) => (t.estornada ? `Estornada: ${t.estorno_motivo ?? ""}` : "Feita"),
                    peso: 1.4,
                    largura: 24,
                    alerta: (t) => t.estornada,
                  },
                ],
                totais: { Valor: total },
              })}
            />
            {podeOperar && cliente && (
              <button className="btn-primario" onClick={() => setNova(true)} disabled={!consulta.dados}>
                <Icone nome="mais" className="h-4 w-4" />
                Nova transferência
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limpar}>
        <FiltroPeriodo
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
          <span>Conta</span>
          <select value={conta} onChange={(e) => setConta(e.target.value)} disabled={!cliente}>
            <option value="">Todas as contas</option>
            {(consulta.dados?.contas ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {!cliente ? (
        <SemEmpresaGestao icone="banco" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={2} linhas={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador titulo="Transferido no período" icone="transferir" valor={brl(total)} detalhe={`${validas.length} transferência(s)`} />
            <Indicador
              titulo="Estornadas"
              icone="fechar"
              valor={String(lista.length - validas.length)}
              detalhe="Lançadas por engano; ficam guardadas"
            />
          </div>
          {!lista.length ? (
            <EstadoVazio
              icone="transferir"
              titulo="Nenhuma transferência neste período"
              acao={
                podeOperar && ativas >= 2 ? (
                  <button className="btn-primario" onClick={() => setNova(true)}>
                    <Icone nome="mais" className="h-4 w-4" />
                    Registrar transferência
                  </button>
                ) : undefined
              }
            >
              {ativas >= 2
                ? "Registre aqui quando o dinheiro passar de uma conta da MDC para outra (aplicação, reforço de caixa, troca de banco)."
                : "Para transferir, a MDC precisa de pelo menos duas contas bancárias ativas (cadastre em Contas bancárias)."}
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Transferências">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>De → Para</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  {podeOperar && (
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className={t.estornada ? "linha-apagada" : ""}>
                    <td data-rotulo="Data" className="num whitespace-nowrap">
                      {fmtData(t.data)}
                    </td>
                    <td className="celula-titulo min-w-56">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {nomeConta(t.origem_id)}
                        <Icone nome="expandir" className="h-3.5 w-3.5 text-[var(--destaque-escuro)]" />
                        {nomeConta(t.destino_id)}
                      </span>
                      {t.observacao && <span className="block text-xs font-normal text-[var(--texto-suave)]">{t.observacao}</span>}
                    </td>
                    <td data-rotulo="Valor" className="whitespace-nowrap text-right font-medium">
                      <Valor v={Number(t.valor)} />
                    </td>
                    <td data-rotulo="Situação">
                      {t.estornada ? (
                        <span title={t.estorno_motivo ?? ""}>
                          <Chip tom="neutro">Estornada</Chip>
                        </span>
                      ) : (
                        <Chip tom="verde">Feita</Chip>
                      )}
                    </td>
                    {podeOperar && (
                      <td className="celula-acoes text-right">
                        {!t.estornada && (
                          <button className="btn !min-h-8 !px-3" onClick={() => setEstornar(t)}>
                            <Icone nome="fechar" className="h-4 w-4" />
                            Estornar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}

      {nova && consulta.dados && (
        <NovaTransferencia
          contas={consulta.dados.contas}
          hoje={hoje}
          aoFechar={() => setNova(false)}
          aoSalvar={(msg) => {
            setNova(false);
            mostrar(msg);
            consulta.recarregar();
          }}
        />
      )}
      {estornar && (
        <JanelaMotivo
          titulo="Estornar transferência"
          descricao={`${nomeConta(estornar.origem_id)} → ${nomeConta(estornar.destino_id)} · ${brl(Number(estornar.valor))} em ${fmtData(estornar.data)}. Ela deixa de contar, mas fica guardada com o motivo.`}
          botao="Estornar"
          aoFechar={() => setEstornar(null)}
          aoConfirmar={async (motivo) => {
            await estornarTransferencia(estornar.id, motivo);
            setEstornar(null);
            mostrar("Transferência estornada.");
            consulta.recarregar();
          }}
        />
      )}
    </div>
  );
}
