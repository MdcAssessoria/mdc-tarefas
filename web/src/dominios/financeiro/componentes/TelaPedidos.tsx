// Lista de pedidos de venda (Saídas) ou de compra (Entradas › Compras): período em um clique, situação e busca;
// indicadores clicáveis; novo pedido; ações por pedido (editar, confirmar/receber, faturar, ver, PDF, duplicar,
// cancelar com motivo); PDF e Excel da lista.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { lerCategorias, lerCentros, lerContas, lerItensDoPedido, lerPedidos, lerPessoas } from "../leituras";
import { cancelarPedido } from "../repositorio";
import { intervaloDoPeriodo } from "../regras";
import type { Periodo } from "../regras";
import { situacaoPedido } from "../pedidosRegras";
import type { SituacaoPedido } from "../pedidosRegras";
import { normalizar } from "../estoqueRegras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { baixarPdfPedido } from "../pdfPedido";
import type { Pedido, PedidoItem } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import type { PropsAba } from "./Comuns";
import { useBaseEstoque } from "./estoqueBase";
import { EditorPedido, TEXTOS_PEDIDO } from "./EditorPedido";
import { DetalhePedido, JanelaFaturar, JanelaLancar } from "./DetalhePedido";

type Janela =
  | { tipo: "novo" }
  | { tipo: "editar" | "duplicar" | "ver" | "lancar"; p: Pedido; itens: PedidoItem[] }
  | { tipo: "faturar" | "cancelar"; p: Pedido };

export function TelaPedidos({ tipo, cliente, podeOperar, avisar }: PropsAba & { tipo: "venda" | "compra" }) {
  const { org } = useOrg();
  const hoje = hojeISO(org.fuso);
  const T = TEXTOS_PEDIDO[tipo];
  const base = useBaseEstoque(cliente.id);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [situacao, setSituacao] = useState<"" | SituacaoPedido | "ativos">("ativos");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);
  const cad = useConsulta(
    useCallback(async () => {
      const [pessoas, categorias, centros, contas] = await Promise.all([
        lerPessoas(cliente.id),
        lerCategorias(cliente.id),
        lerCentros(cliente.id),
        lerContas(cliente.id),
      ]);
      return { pessoas, categorias, centros, contas };
    }, [cliente.id]),
  );
  const pedidos = useConsulta(useCallback(() => lerPedidos(cliente.id, tipo, intervalo), [cliente.id, tipo, intervalo]));

  const nomePessoa = useMemo(() => new Map((cad.dados?.pessoas ?? []).map((p) => [p.id, p.nome])), [cad.dados]);
  const nomeLocal = useMemo(() => new Map((base.dados?.locais ?? []).map((l) => [l.id, l.nome])), [base.dados]);
  const doPeriodo = pedidos.dados ?? [];
  const lista = doPeriodo.filter((p) => {
    if (situacao === "ativos" ? p.situacao === "cancelado" : situacao && p.situacao !== situacao) return false;
    const q = normalizar(busca);
    return !q || normalizar([p.numero, nomePessoa.get(p.pessoa_id ?? ""), p.documento, p.observacao].join(" ")).includes(q);
  });
  const validos = doPeriodo.filter((p) => p.situacao !== "cancelado");
  const lancados = validos.filter((p) => p.lancado_em);
  const rascunhos = doPeriodo.filter((p) => p.situacao === "rascunho");
  const pendentes = doPeriodo.filter((p) => p.situacao === "confirmado");
  const totalLista = lista.filter((p) => p.situacao !== "cancelado").reduce((a, p) => a + Number(p.total), 0);
  const alternar = (s: SituacaoPedido) => setSituacao(situacao === s ? "ativos" : s);
  const feito = (msg: string) => {
    avisar(msg, /não foi lançado/.test(msg) ? "atencao" : "sucesso");
    setJanela(null);
    pedidos.recarregar();
    base.recarregar();
  };

  async function abrir(t: "editar" | "duplicar" | "ver" | "lancar", p: Pedido) {
    setAbrindo(p.id);
    try {
      setJanela({ tipo: t, p, itens: await lerItensDoPedido(p.id) });
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setAbrindo(null);
    }
  }
  async function pdf(p: Pedido) {
    setAbrindo(p.id);
    try {
      await baixarPdfPedido({
        pedido: p,
        itens: await lerItensDoPedido(p.id),
        empresa: nomeCliente(cliente),
        pessoa: cad.dados?.pessoas.find((x) => x.id === p.pessoa_id) ?? null,
        local: p.local_id ? (nomeLocal.get(p.local_id) ?? null) : null,
        logoUrl: org.logo_url,
      });
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setAbrindo(null);
    }
  }

  const acoes = (p: Pedido) => {
    const b = (rotulo: string, f: () => void, primario = false) => (
      <button key={rotulo} className={`${primario ? "btn-primario" : "btn"} !min-h-8`} onClick={f} disabled={abrindo === p.id}>
        {rotulo}
      </button>
    );
    const editavel = p.situacao === "rascunho" || (tipo === "compra" && p.situacao === "confirmado");
    const lista: React.ReactNode[] = [];
    if (podeOperar && editavel) lista.push(b("Editar", () => abrir("editar", p)));
    if (podeOperar && p.situacao === "rascunho" && tipo === "venda") lista.push(b("Confirmar", () => abrir("lancar", p), true));
    if (podeOperar && editavel && tipo === "compra") lista.push(b("Receber", () => abrir("lancar", p), true));
    if (podeOperar && p.situacao === "confirmado" && tipo === "venda") lista.push(b("Faturar", () => setJanela({ tipo: "faturar", p })));
    if (!editavel) lista.push(b("Ver", () => abrir("ver", p)));
    lista.push(b("PDF", () => pdf(p)));
    if (podeOperar) lista.push(b("Duplicar", () => abrir("duplicar", p)));
    if (podeOperar && p.situacao !== "cancelado") lista.push(b("Cancelar", () => setJanela({ tipo: "cancelar", p })));
    return lista;
  };

  const carregando = (pedidos.carregando && !pedidos.dados) || !cad.dados || !base.dados;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador icone="moeda"
          titulo={tipo === "venda" ? "Vendido no período" : "Comprado no período"}
          valor={brl(lancados.reduce((a, p) => a + Number(p.total), 0))}
          detalhe={`${lancados.length} pedido(s) lançado(s)`}
          tom="verde"
        />
        <Indicador icone="editar"
          titulo="Rascunhos"
          valor={String(rascunhos.length)}
          detalhe={brl(rascunhos.reduce((a, p) => a + Number(p.total), 0))}
          ativo={situacao === "rascunho"}
          aoClicar={() => alternar("rascunho")}
        />
        <Indicador icone="relogio"
          titulo={tipo === "venda" ? "A faturar" : "Aguardando entrega"}
          valor={String(pendentes.length)}
          detalhe={brl(pendentes.reduce((a, p) => a + Number(p.total), 0))}
          tom="ambar"
          ativo={situacao === "confirmado"}
          aoClicar={() => alternar("confirmado")}
        />
        <Indicador icone="grafico"
          titulo="Ticket médio"
          valor={lancados.length ? brl(lancados.reduce((a, p) => a + Number(p.total), 0) / lancados.length) : "—"}
          detalhe="valor médio por pedido lançado"
        />
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <FiltroPeriodo
          rotulo="Data do pedido"
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
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
            <option value="ativos">Todos menos cancelados</option>
            {(["rascunho", "confirmado", tipo === "venda" ? "faturado" : "recebido", "cancelado"] as SituacaoPedido[]).map((s) => (
              <option key={s} value={s}>
                {situacaoPedido(tipo, s).nome}
              </option>
            ))}
            <option value="">Todos</option>
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Número, ${T.pessoa.toLowerCase()} ou documento`}
          />
        </label>
        {(busca || situacao !== "ativos" || periodo !== "mes") && (
          <button
            className="btn-link pb-2 text-sm"
            onClick={() => {
              setBusca("");
              setSituacao("ativos");
              setPeriodo("mes");
            }}
          >
            Limpar
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: tipo === "venda" ? "Pedidos de venda" : "Pedidos de compra",
              subtitulo: `${nomeCliente(cliente)} · ${intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? hoje)}` : "todo o período"} · ${lista.length} pedido(s)`,
              arquivo: nomeArquivo(tipo === "venda" ? "Pedidos-venda" : "Pedidos-compra", nomeCliente(cliente), hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              totais: { Total: totalLista },
              colunas: [
                { titulo: "Nº", valor: (p) => p.numero, peso: 0.5, largura: 8 },
                { titulo: "Data", valor: (p) => fmtData(p.data), peso: 0.9, largura: 12 },
                { titulo: T.pessoa, valor: (p) => nomePessoa.get(p.pessoa_id ?? "") ?? "", peso: 2.6, largura: 36 },
                { titulo: "Situação", valor: (p) => situacaoPedido(tipo, p.situacao).nome, peso: 1.3, largura: 18 },
                { titulo: "Condição", valor: (p) => p.condicao ?? "", peso: 1.2, largura: 16 },
                { titulo: "Documento", valor: (p) => p.documento ?? "", peso: 1, largura: 14 },
                {
                  titulo: "Total",
                  valor: (p) => (p.situacao === "cancelado" ? 0 : Number(p.total)),
                  formato: "moeda",
                  peso: 1.1,
                  alerta: (p) => p.situacao === "cancelado",
                },
              ],
            })}
          />
          {podeOperar && (
            <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })} disabled={carregando}>
              Novo pedido
            </button>
          )}
        </div>
      </div>

      {(pedidos.erro || cad.erro || base.erro) && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{pedidos.erro ?? cad.erro ?? base.erro}</p>
      )}
      {carregando ? (
        <Carregando />
      ) : !lista.length ? (
        <EstadoVazio
          acao={
            podeOperar && !doPeriodo.length ? (
              <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
                Fazer o primeiro pedido
              </button>
            ) : null
          }
        >
          {doPeriodo.length
            ? "Nenhum pedido com estes filtros."
            : tipo === "venda"
              ? "Nenhum pedido de venda neste período. Ao confirmar um pedido, o estoque baixa e as contas a receber são lançadas sozinhas."
              : "Nenhum pedido de compra neste período. Ao receber a mercadoria, o estoque entra com o custo e as contas a pagar são lançadas sozinhas."}
        </EstadoVazio>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => {
            const s = situacaoPedido(tipo, p.situacao);
            return (
              <article
                key={p.id}
                className={`cartao flex flex-wrap items-center gap-3 p-3 ${p.situacao === "cancelado" ? "opacity-60" : ""}`}
              >
                <div className="min-w-48 flex-1">
                  <p className="font-medium text-[var(--marca)]">
                    Nº {p.numero} · {nomePessoa.get(p.pessoa_id ?? "") ?? `Sem ${T.pessoa.toLowerCase()}`}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {[
                      fmtData(p.data),
                      p.condicao,
                      p.documento && `doc. ${p.documento}`,
                      p.previsao && p.situacao === "confirmado" && tipo === "compra" && `chega ${fmtData(p.previsao)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className={`chip ${s.tom}`} title={s.dica}>
                  {s.nome}
                </span>
                <p className={`w-28 text-right font-semibold tabular-nums ${p.situacao === "cancelado" ? "line-through" : ""}`}>
                  {brl(Number(p.total))}
                </p>
                <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">{acoes(p)}</div>
              </article>
            );
          })}
          <p className="text-right text-sm text-neutral-600">
            {lista.length} pedido(s) · total {brl(totalLista)}
          </p>
        </div>
      )}

      {janela && cad.dados && base.dados && (
        <>
          {(janela.tipo === "novo" || janela.tipo === "editar" || janela.tipo === "duplicar") && (
            <EditorPedido
              tipo={tipo}
              cliente={cliente}
              cad={cad.dados}
              base={base.dados}
              pedido={janela.tipo === "novo" ? undefined : janela.p}
              itensPedido={janela.tipo === "novo" ? [] : janela.itens}
              duplicar={janela.tipo === "duplicar"}
              hoje={hoje}
              aoFechar={() => setJanela(null)}
              aoSalvar={feito}
              aoMudarItens={base.recarregar}
            />
          )}
          {janela.tipo === "ver" && (
            <DetalhePedido
              pedido={janela.p}
              itens={janela.itens}
              pessoa={nomePessoa.get(janela.p.pessoa_id ?? "") ?? ""}
              local={nomeLocal.get(janela.p.local_id ?? "") ?? ""}
              hoje={hoje}
              aoFechar={() => setJanela(null)}
            />
          )}
          {janela.tipo === "lancar" && (
            <JanelaLancar
              pedido={janela.p}
              itens={janela.itens}
              contas={cad.dados.contas}
              hoje={hoje}
              aoFechar={() => setJanela(null)}
              aoFeito={feito}
            />
          )}
          {janela.tipo === "faturar" && <JanelaFaturar pedido={janela.p} aoFechar={() => setJanela(null)} aoFeito={feito} />}
          {janela.tipo === "cancelar" && (
            <JanelaMotivo
              titulo={`Cancelar o pedido nº ${janela.p.numero}`}
              descricao={
                janela.p.lancado_em
                  ? `O estoque volta e as contas a ${tipo === "venda" ? "receber" : "pagar"} em aberto são canceladas. Se alguma parcela já foi ${tipo === "venda" ? "recebida" : "paga"}, estorne antes. Nada é apagado.`
                  : "O pedido fica guardado como cancelado."
              }
              botao="Cancelar pedido"
              aoFechar={() => setJanela(null)}
              aoConfirmar={async (motivo) => {
                await cancelarPedido(janela.p.id, motivo);
                feito(`Pedido nº ${janela.p.numero} cancelado.`);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
