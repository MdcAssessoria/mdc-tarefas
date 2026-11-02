// Portal do Cliente › Rotinas do mês: o que a MDC entrega na competência (guias, folha, declarações), a situação
// de cada uma, os arquivos entregues e o que está aguardando o cliente (com envio de arquivo ali mesmo).
"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO, somarMeses } from "@/lib/datas";
import { abrirArquivo, enviarArquivo } from "@/lib/arquivos/armazenamento";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { fmtData, mesAno } from "@/lib/formato/datas";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import type { Tom } from "@/components/ui/Tons";
import { nomeCliente } from "@/dominios/clientes/nome";
import type { EmpresaPortal } from "../tipos";

interface Rotina {
  tarefa_id: string;
  titulo: string;
  situacao: string;
  prazo: string | null;
  concluida_em: string | null;
  pendencia: string | null;
  setor: string | null;
  arquivos: { id: string; nome: string; caminho: string }[];
}

const SITUACAO: Record<string, { nome: string; tom: Tom }> = {
  entregue: { nome: "Entregue", tom: "verde" },
  em_andamento: { nome: "Em andamento", tom: "azul" },
  aguardando_voce: { nome: "Aguardando você", tom: "ambar" },
};
/** Situação desconhecida (nova no banco) aparece como "Em andamento" em vez de quebrar a tela. */
const situacao = (s: string) => SITUACAO[s] ?? SITUACAO.em_andamento;

export function PortalRotinas({ emp }: { emp: EmpresaPortal }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [filtro, setFiltro] = useState("");
  const { aviso, mostrar } = useAviso();
  const [enviando, setEnviando] = useState<string | null>(null);

  const consulta = useConsulta(
    useCallback(
      async () =>
        (exigir(await supabase().rpc("portal_rotinas", { p_cliente: emp.cliente_id, p_competencia: mes + "-01" })) as Rotina[] | null) ??
        [],
      [emp.cliente_id, mes],
    ),
  );
  const todas = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const lista = useMemo(() => todas.filter((r) => !filtro || situacao(r.situacao) === SITUACAO[filtro]), [todas, filtro]);
  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(hoje, -i));
  const entregues = todas.filter((r) => r.situacao === "entregue").length;
  const pendentes = todas.filter((r) => r.situacao === "aguardando_voce");

  async function enviar(r: Rotina, arq: File) {
    setEnviando(r.tarefa_id);
    try {
      await enviarArquivo(arq, { org: emp.org_id, app: "portal", ref: r.tarefa_id, cliente: emp.cliente_id, visivelCliente: true });
      mostrar(`Arquivo “${arq.name}” enviado para a MDC.`);
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Rotinas do mês"
        descricao="O que a MDC faz para a sua empresa em cada mês e o que já foi entregue."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Rotinas do mês",
              subtitulo: `${nomeCliente(emp)} · competência ${mesAno(mes + "-01")} · ${entregues} de ${todas.length} entregue(s)`,
              arquivo: nomeArquivo("Rotinas", nomeCliente(emp), mes),
              logoUrl: emp.logo_url,
              paisagem: false,
              linhas: lista,
              colunas: [
                { titulo: "Rotina", valor: (r: Rotina) => r.titulo, peso: 3, largura: 40 },
                { titulo: "Setor", valor: (r: Rotina) => r.setor ?? "", peso: 1.2, largura: 16 },
                { titulo: "Situação", valor: (r: Rotina) => situacao(r.situacao).nome, peso: 1.3, largura: 18 },
                { titulo: "Previsão / vencimento", valor: (r: Rotina) => fmtData(r.prazo), peso: 1.2, largura: 16 },
                {
                  titulo: "Entregue em",
                  valor: (r: Rotina) => (r.concluida_em ? fmtData(r.concluida_em.slice(0, 10)) : ""),
                  peso: 1.1,
                  largura: 14,
                },
              ],
            })}
          />
        }
      />

      <CartaoFiltros
        ativos={filtro ? [{ id: "s", rotulo: `Situação: ${SITUACAO[filtro].nome}`, aoTirar: () => setFiltro("") }] : []}
        aoLimpar={() => setFiltro("")}
      >
        <label className="campo">
          <span>Competência</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {mesAno(m + "-01")}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(SITUACAO).map(([id, s]) => (
              <option key={id} value={id}>
                {s.nome}
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

      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={5} />
      ) : !todas.length ? (
        <EstadoVazio icone="calendario" titulo={`Nenhuma rotina em ${mesAno(mes + "-01")}`}>
          As rotinas aparecem conforme a MDC organiza o mês. Escolha outra competência acima ou fale com a MDC se esperava ver algo aqui.
        </EstadoVazio>
      ) : (
        <>
          <div className="cartao p-4">
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span>
                <b>{entregues}</b> de {todas.length} rotinas entregues
              </span>
              <span className="tabular-nums text-neutral-500">{Math.round((entregues / todas.length) * 100)}%</span>
            </div>
            <div
              className="h-2.5 rounded-full bg-[var(--fundo)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={todas.length}
              aria-valuenow={entregues}
              aria-label="Rotinas entregues"
            >
              <div className="h-2.5 rounded-full bg-[#1B8263]" style={{ width: `${(entregues / todas.length) * 100}%` }} />
            </div>
          </div>

          {pendentes.map((r) => (
            <div key={r.tarefa_id} className="cartao border-l-4 !border-l-amber-500 p-4">
              <div className="flex items-start gap-2 text-sm font-semibold">
                <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />A MDC precisa de você: {r.titulo}
              </div>
              {r.pendencia && <p className="mt-1 text-sm text-neutral-700">{r.pendencia}</p>}
              <label className={`btn mt-3 cursor-pointer ${enviando === r.tarefa_id ? "pointer-events-none opacity-60" : ""}`}>
                <Icone nome="importar" className="h-4 w-4" />
                {enviando === r.tarefa_id ? "Enviando…" : "Enviar arquivo"}
                <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && enviar(r, e.target.files[0])} />
              </label>
            </div>
          ))}

          {!lista.length ? (
            <EstadoVazio
              icone="filtro"
              titulo="Nenhuma rotina nesta situação"
              acao={
                <button className="btn" onClick={() => setFiltro("")}>
                  Limpar filtros
                </button>
              }
            >
              Troque a situação ou limpe o filtro para ver todas as rotinas do mês.
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Rotinas do mês">
              <thead>
                <tr>
                  <th>Rotina</th>
                  <th>Situação</th>
                  <th>Previsão / vencimento</th>
                  <th>Entregáveis</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => {
                  const s = situacao(r.situacao);
                  return (
                    <tr key={r.tarefa_id}>
                      <td className="celula-titulo">
                        <div className="font-medium">{r.titulo}</div>
                        {r.setor && <div className="text-xs font-normal text-neutral-500">{r.setor}</div>}
                      </td>
                      <td data-rotulo="Situação">
                        <span className="inline-flex flex-col items-end gap-0.5 sm:items-start">
                          <Chip tom={s.tom}>{s.nome}</Chip>
                          {r.concluida_em && <span className="text-xs text-neutral-500">em {fmtData(r.concluida_em.slice(0, 10))}</span>}
                        </span>
                      </td>
                      <td data-rotulo="Previsão" className="whitespace-nowrap">
                        {fmtData(r.prazo) || "—"}
                      </td>
                      <td data-rotulo="Entregáveis">
                        {r.arquivos.length ? (
                          <span className="inline-flex flex-col items-end gap-1 sm:items-start">
                            {r.arquivos.map((a) => (
                              <button
                                key={a.id}
                                className="inline-flex items-center gap-1 text-left text-sm text-[var(--destaque-escuro)] underline"
                                onClick={() => abrirArquivo(a.caminho, a.nome).catch((e) => mostrar(traduzirErro(e), "erro"))}
                              >
                                <Icone nome="baixar" className="h-3.5 w-3.5 shrink-0" />
                                {a.nome}
                              </button>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}
    </div>
  );
}
