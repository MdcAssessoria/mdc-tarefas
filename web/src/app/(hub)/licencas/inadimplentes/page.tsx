// Licenças › Inadimplentes: clientes com mensalidade vencida e em aberto, do maior atraso para o menor. Para cada um:
// copiar a mensagem de cobrança para o WhatsApp (com bom dia/boa tarde/boa noite) e bloquear ou desbloquear, sempre
// com motivo. O bloqueio é manual: o HUB só sugere a partir dos dias definidos aqui. Histórico dos bloqueios no fim.
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData, fmtDataHora } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Modal } from "@/components/ui/Modal";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { Cabecalho, EtiquetaBloqueado, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { FAIXAS, inadimplentes } from "@/dominios/licencas/regras";
import type { Faixa, Inadimplente } from "@/dominios/licencas/regras";
import { mensagemCobranca } from "@/dominios/licencas/mensagem";
import { horaNoFuso } from "@/lib/datas";
import { bloquearCliente, definirParametros, desbloquearCliente } from "@/dominios/licencas/repositorio";

type Linha = Inadimplente & { bloqueado: boolean; sugerido: boolean };
type Janela = { tipo: "bloquear" | "desbloquear"; cliente: string } | { tipo: "texto"; texto: string };

export default function PaginaInadimplentes() {
  const { org } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, nomeDoCliente, podeGerir, bloqueados } = dados;
  const { aviso, mostrar } = useAviso();
  const [faixa, setFaixa] = useState<Faixa | "">("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);
  const d = dados.dados;
  const diasSugerir = d?.parametros.dias_sugerir_bloqueio ?? 30;

  const todos: Linha[] = useMemo(
    () =>
      inadimplentes(d?.cobrancas ?? [], hoje).map((x) => ({
        ...x,
        bloqueado: bloqueados.has(x.cliente_id),
        sugerido: !bloqueados.has(x.cliente_id) && x.maiorAtraso >= diasSugerir,
      })),
    [d, hoje, bloqueados, diasSugerir],
  );
  const lista = todos.filter(
    (x) =>
      (!faixa || x.faixa === faixa) && (!busca.trim() || nomeDoCliente(x.cliente_id).toLowerCase().includes(busca.trim().toLowerCase())),
  );
  const bloqueadosSemAtraso = [...bloqueados.values()].filter((b) => !todos.some((x) => x.cliente_id === b.cliente_id));
  const total = lista.reduce((s, x) => s + x.total, 0);

  async function copiar(x: Linha) {
    const texto = mensagemCobranca({
      hora: horaNoFuso(org.fuso),
      cliente: nomeDoCliente(x.cliente_id),
      cobrancas: x.cobrancas,
      escritorio: org.nome,
    });
    try {
      await navigator.clipboard.writeText(texto);
      mostrar("Mensagem copiada. Cole no WhatsApp do cliente.");
    } catch {
      setJanela({ tipo: "texto", texto });
    }
  }

  async function mudarDias(v: number) {
    try {
      await definirParametros(org.id, v);
      mostrar(`O HUB passa a sugerir bloqueio a partir de ${v} dias de atraso.`);
      dados.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      dados.recarregar();
    }
  }

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Inadimplentes"
        descricao="Clientes com mensalidade vencida e não paga. Cobre pelo WhatsApp e, se a MDC decidir, bloqueie o acesso aos módulos pagos."
      >
        <BotoesExportar
          vazio={!lista.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Inadimplentes de licença",
            subtitulo: `${org.nome} · posição em ${fmtData(hoje)} · ${lista.length} cliente(s)`,
            arquivo: nomeArquivo("Inadimplentes-licenca", hoje),
            logoUrl: org.logo_url,
            linhas: lista,
            colunas: [
              { titulo: "Cliente", valor: (x) => nomeDoCliente(x.cliente_id), peso: 2.6, largura: 38 },
              {
                titulo: "Meses em aberto",
                valor: (x) => x.cobrancas.map((c) => fmtCompetencia(c.competencia)).join(", "),
                peso: 2,
                largura: 30,
              },
              { titulo: "Qtd.", valor: (x) => x.cobrancas.length, formato: "numero", peso: 0.6, largura: 8 },
              { titulo: "Total", valor: (x) => x.total, formato: "moeda", peso: 1.2 },
              {
                titulo: "Maior atraso (dias)",
                valor: (x) => x.maiorAtraso,
                formato: "numero",
                peso: 1,
                largura: 12,
                alerta: (x) => x.sugerido,
              },
              { titulo: "Faixa", valor: (x) => FAIXAS.find((f) => f.id === x.faixa)?.nome ?? "", peso: 1.2, largura: 16 },
              {
                titulo: "Situação",
                valor: (x) => (x.bloqueado ? "Bloqueado" : x.sugerido ? "Sugerido bloquear" : "Em cobrança"),
                peso: 1.3,
                largura: 18,
              },
            ],
            totais: { Total: total },
          })}
        />
      </Cabecalho>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Tempo de atraso</span>
          <select value={faixa} onChange={(e) => setFaixa(e.target.value as Faixa | "")}>
            <option value="">Todos</option>
            {FAIXAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar cliente</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do cliente" />
        </label>
        <label className="campo" title="A partir de quantos dias de atraso o HUB marca 'Sugerido bloquear' e avisa no sino">
          <span>Sugerir bloqueio com</span>
          <select value={diasSugerir} onChange={(e) => mudarDias(Number(e.target.value))} disabled={!podeGerir || !d}>
            {[15, 30, 45, 60, 90].concat([15, 30, 45, 60, 90].includes(diasSugerir) ? [] : [diasSugerir]).map((n) => (
              <option key={n} value={n}>
                {n} dias de atraso
              </option>
            ))}
          </select>
        </label>
        {(faixa || busca) && (
          <button
            className="btn-link min-h-10 text-sm"
            onClick={() => {
              setFaixa("");
              setBusca("");
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
            <Indicador icone="alerta"
              titulo="Total em atraso (neste filtro)"
              valor={brl(total)}
              detalhe={`${lista.length} cliente(s)`}
              tom={total ? "vermelho" : "neutro"}
            />
            <Indicador icone="relogio"
              titulo={`Com ${diasSugerir} dias ou mais`}
              valor={String(todos.filter((x) => x.sugerido).length)}
              detalhe="sugerido bloquear (ainda não bloqueados)"
              tom={todos.some((x) => x.sugerido) ? "ambar" : "neutro"}
            />
            <Indicador icone="cancelar" titulo="Bloqueados" valor={String(bloqueados.size)} detalhe="sem acesso aos módulos pagos" />
          </div>

          {!lista.length ? (
            <EstadoVazio>
              {todos.length ? "Ninguém nesta faixa de atraso." : "Nenhum cliente com mensalidade atrasada. Tudo em dia!"}
            </EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Em aberto</th>
                    <th className="text-right">Total</th>
                    <th>Atraso</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((x) => (
                    <tr key={x.cliente_id}>
                      <td className="min-w-44">
                        <span className="font-medium">{nomeDoCliente(x.cliente_id)}</span> {x.bloqueado && <EtiquetaBloqueado />}
                        {x.sugerido && <span className="chip ml-1 bg-amber-50 text-amber-900">Sugerido bloquear</span>}
                      </td>
                      <td className="text-sm">
                        {x.cobrancas.length} mensalidade(s)
                        <span className="block text-xs text-neutral-500">
                          {x.cobrancas.map((c) => fmtCompetencia(c.competencia)).join(", ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">{brl(x.total)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-medium text-red-700">{x.maiorAtraso} dia(s)</span>
                        <span className="block text-xs text-neutral-500">{FAIXAS.find((f) => f.id === x.faixa)?.nome}</span>
                      </td>
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            className="btn !min-h-8"
                            onClick={() => copiar(x)}
                            title="Copia o texto da cobrança para colar no WhatsApp"
                          >
                            Copiar mensagem de cobrança
                          </button>
                          {podeGerir &&
                            (x.bloqueado ? (
                              <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "desbloquear", cliente: x.cliente_id })}>
                                Desbloquear
                              </button>
                            ) : (
                              <button
                                className="btn !min-h-8 !border-[var(--perigo)] !text-[var(--perigo)]"
                                onClick={() => setJanela({ tipo: "bloquear", cliente: x.cliente_id })}
                              >
                                Bloquear
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bloqueadosSemAtraso.length > 0 && (
            <section className="cartao space-y-2 p-4">
              <h2 className="font-semibold text-[var(--marca)]">Bloqueados sem atraso</h2>
              <p className="text-sm text-neutral-600">
                Estes clientes já não devem nada, mas continuam bloqueados. Confira se é para desbloquear.
              </p>
              <ul className="divide-y divide-[var(--borda)] text-sm">
                {bloqueadosSemAtraso.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="mr-auto">
                      <b>{nomeDoCliente(b.cliente_id)}</b> · bloqueado em {fmtDataHora(b.bloqueado_em)} · {b.motivo}
                    </span>
                    {podeGerir && (
                      <button className="btn !min-h-8" onClick={() => setJanela({ tipo: "desbloquear", cliente: b.cliente_id })}>
                        Desbloquear
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details className="cartao p-4">
            <summary className="cursor-pointer font-semibold text-[var(--marca)]">Histórico de bloqueios ({d.bloqueios.length})</summary>
            {d.bloqueios.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Bloqueado</th>
                      <th>Desbloqueado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.bloqueios.map((b) => (
                      <tr key={b.id}>
                        <td>{nomeDoCliente(b.cliente_id)}</td>
                        <td className="text-sm">
                          {fmtDataHora(b.bloqueado_em)}
                          <span className="block text-xs text-neutral-500">{b.motivo}</span>
                        </td>
                        <td className="text-sm">
                          {b.desbloqueado_em ? (
                            <>
                              {fmtDataHora(b.desbloqueado_em)}
                              <span className="block text-xs text-neutral-500">{b.motivo_desbloqueio}</span>
                            </>
                          ) : (
                            <EtiquetaBloqueado />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Nenhum cliente foi bloqueado até hoje.</p>
            )}
          </details>
        </>
      )}

      {janela?.tipo === "bloquear" && (
        <JanelaMotivo
          titulo="Bloquear cliente"
          descricao={`${nomeDoCliente(janela.cliente)} deixa de acessar os módulos pagos no Portal (os dados ficam guardados e a equipe MDC continua acessando). Desbloqueie quando regularizar.`}
          botao="Bloquear"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await bloquearCliente(janela.cliente, motivo);
            fechar("Cliente bloqueado. No Portal ele vê um aviso para falar com a MDC.");
          }}
        />
      )}
      {janela?.tipo === "desbloquear" && (
        <JanelaMotivo
          titulo="Desbloquear cliente"
          descricao={`${nomeDoCliente(janela.cliente)} volta a acessar os módulos contratados no Portal.`}
          botao="Desbloquear"
          aoFechar={() => fechar()}
          aoConfirmar={async (motivo) => {
            await desbloquearCliente(janela.cliente, motivo);
            fechar("Cliente desbloqueado.");
          }}
        />
      )}
      {janela?.tipo === "texto" && (
        <Modal
          titulo="Mensagem de cobrança"
          descricao="Selecione o texto e copie (o navegador não deixou copiar sozinho)."
          aoFechar={() => setJanela(null)}
        >
          <textarea className="w-full rounded-md border border-[var(--borda)] p-2 text-sm" rows={12} readOnly value={janela.texto} />
          <div className="flex justify-end">
            <button className="btn" onClick={() => setJanela(null)}>
              Fechar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
