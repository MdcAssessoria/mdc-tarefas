// Financeiro › Bancos: contas bancárias da MDC: saldo atual (saldo inicial + extratos importados), último
// lançamento, a conta contábil do Domínio ligada a cada banco (usada na conciliação e na exportação, etapas 2 e 3)
// e o cadastro/edição. Exporta a lista em PDF e Excel.
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { lerContas, lerLinhas, lerPlano, lerTransferencias, rotuloConta } from "@/dominios/financeiro/leituras";
import { saldoComTransferencias } from "@/dominios/financeiro/painel";
import { NovaTransferencia } from "@/dominios/financeiro/componentes/NovaTransferencia";
import { BANCOS } from "@/dominios/financeiro/tipos";
import { numeroBr } from "@/dominios/financeiro/regras";
import type { ContaBancaria, ContaContabil } from "@/dominios/financeiro/tipos";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";
import { Modal } from "@/components/ui/Modal";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Chip } from "@/components/ui/Chip";
import { Indicador } from "@/components/ui/Indicador";
import { useAviso } from "@/components/ui/Aviso";

type Form = {
  id?: string;
  nome: string;
  banco: string;
  agencia: string;
  numero: string;
  conta_contabil_id: string;
  saldo_inicial: string;
  saldo_inicial_em: string;
  ativo: boolean;
};
const VAZIO: Form = {
  nome: "",
  banco: "",
  agencia: "",
  numero: "",
  conta_contabil_id: "",
  saldo_inicial: "0,00",
  saldo_inicial_em: "",
  ativo: true,
};

export default function PaginaContasBancarias() {
  const { org, pode } = useOrg();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const podeOperar = pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [transferindo, setTransferindo] = useState(false);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [contas, plano, linhas, transferencias] = await Promise.all([
        lerContas(cliente.id),
        lerPlano(cliente.id),
        lerLinhas(cliente.id),
        lerTransferencias(cliente.id),
      ]);
      return { contas, plano, linhas, transferencias };
    }, [cliente]),
  );
  const dados = consulta.dados;
  const analiticas = useMemo(() => (dados?.plano ?? []).filter((c) => c.analitica && c.ativo), [dados]);
  const porId = useMemo(() => new Map((dados?.plano ?? []).map((c) => [c.id, c])), [dados]);

  const lista = useMemo(() => {
    if (!dados) return [];
    return dados.contas
      .filter((c) => mostrarInativas || c.ativo)
      .map((c) => {
        const daConta = dados.linhas.filter((l) => l.conta_id === c.id);
        return {
          conta: c,
          saldo: saldoComTransferencias(c, daConta, dados.transferencias),
          ultimo: daConta.length ? daConta[daConta.length - 1].data : null,
          pendentes: daConta.filter((l) => l.situacao === "pendente").length,
          contabil: c.conta_contabil_id ? porId.get(c.conta_contabil_id) : undefined,
        };
      });
  }, [dados, mostrarInativas, porId]);
  const total = lista.filter((x) => x.conta.ativo).reduce((a, x) => a + x.saldo, 0);
  const aConciliar = lista.filter((x) => x.conta.ativo).reduce((a, x) => a + x.pendentes, 0);
  const semContabil = lista.filter((x) => x.conta.ativo && !x.contabil).length;

  function abrir(c?: ContaBancaria) {
    setForm(
      c
        ? {
            id: c.id,
            nome: c.nome,
            banco: c.banco ?? "",
            agencia: c.agencia ?? "",
            numero: c.numero ?? "",
            conta_contabil_id: c.conta_contabil_id ?? "",
            saldo_inicial: Number(c.saldo_inicial).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
            saldo_inicial_em: c.saldo_inicial_em ?? "",
            ativo: c.ativo,
          }
        : { ...VAZIO },
    );
  }

  async function salvar() {
    if (!form || !cliente) return;
    const saldo = Math.round(numeroBr(form.saldo_inicial || "0") * 100) / 100;
    if (!form.nome.trim()) return mostrar("Dê um nome para a conta (ex.: Itaú movimento).", "erro");
    if (Number.isNaN(saldo)) return mostrar("O saldo inicial não é um valor válido. Exemplo: 1.234,56 ou -500,00.", "erro");
    setSalvando(true);
    const dadosConta = {
      nome: form.nome.trim(),
      banco: form.banco.trim() || null,
      agencia: form.agencia.trim() || null,
      numero: form.numero.trim() || null,
      conta_contabil_id: form.conta_contabil_id || null,
      saldo_inicial: saldo,
      saldo_inicial_em: form.saldo_inicial_em || null,
      ativo: form.ativo,
    };
    const { error } = form.id
      ? await supabase().from("fin_contas_bancarias").update(dadosConta).eq("id", form.id)
      : await supabase()
          .from("fin_contas_bancarias")
          .insert({ ...dadosConta, org_id: org.id, cliente_id: cliente.id });
    setSalvando(false);
    if (error) return mostrar(traduzirErro(error), "erro");
    setForm(null);
    mostrar(form.id ? "Conta atualizada." : "Conta cadastrada. Agora importe o extrato dela em Extratos.");
    consulta.recarregar();
  }

  const titulo = "Contas bancárias";
  const subtitulo = cliente ? `${nomeCliente(cliente)} · saldo em ${fmtData(hojeISO(org.fuso))}` : "";
  const linhaExp = (x: (typeof lista)[number]) => ({
    nome: x.conta.nome,
    banco: x.conta.banco ?? "",
    agencia: x.conta.agencia ?? "",
    numero: x.conta.numero ?? "",
    contabil: x.contabil ? rotuloConta(x.contabil) : "Não ligada",
    ultimo: x.ultimo ? fmtData(x.ultimo) : "Sem extrato",
    pendentes: x.pendentes,
    saldo: x.saldo,
    situacao: x.conta.ativo ? "Ativa" : "Inativa",
  });
  const arquivoBase = `Contas-bancarias-${(cliente ? nomeCliente(cliente) : "").replace(/[^\w]+/g, "-")}-${hojeISO(org.fuso)}`;

  async function pdf() {
    try {
      const bytes = await gerarRelatorioPdf({
        titulo,
        subtitulo,
        paisagem: true,
        logo: await carregarLogo(org.logo_url),
        secoes: [
          {
            titulo: "Contas",
            colunas: [
              { titulo: "Conta", peso: 2 },
              { titulo: "Banco", peso: 1.8 },
              { titulo: "Agência / conta", peso: 1.4 },
              { titulo: "Conta contábil", peso: 2.6 },
              { titulo: "Último lançamento", peso: 1.2 },
              { titulo: "A conciliar", peso: 0.9, direita: true },
              { titulo: "Saldo", peso: 1.3, direita: true },
            ],
            linhas: [
              ...lista.map((x) => {
                const l = linhaExp(x);
                return {
                  celulas: [
                    l.nome,
                    l.banco || "—",
                    [l.agencia, l.numero].filter(Boolean).join(" / ") || "—",
                    l.contabil,
                    l.ultimo,
                    String(l.pendentes),
                    brl(l.saldo),
                  ],
                  alerta: [false, false, false, !x.contabil, false, false, x.saldo < 0],
                };
              }),
              { celulas: ["Total das contas ativas", "", "", "", "", "", brl(total)], negrito: true, fundo: true },
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
          nome: "Contas",
          colunas: [
            { titulo: "Conta", chave: "nome", largura: 28 },
            { titulo: "Banco", chave: "banco", largura: 28 },
            { titulo: "Agência", chave: "agencia", largura: 10 },
            { titulo: "Conta", chave: "numero", largura: 14 },
            { titulo: "Conta contábil", chave: "contabil", largura: 44 },
            { titulo: "Último lançamento", chave: "ultimo", largura: 16 },
            { titulo: "A conciliar", chave: "pendentes", largura: 12, formato: "numero" },
            { titulo: "Saldo", chave: "saldo", largura: 16, formato: "moeda" },
            { titulo: "Situação", chave: "situacao", largura: 10 },
          ],
          linhas: lista.map(linhaExp),
          totais: { nome: "Total das contas ativas", saldo: total },
        },
      ]);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Contas bancárias"
        descricao="Os bancos da MDC, com o saldo pelos extratos importados e as transferências entre contas."
        acoes={
          <>
            <button className="btn" onClick={pdf} disabled={!lista.length} title="Baixar a lista em PDF">
              <Icone nome="documento" className="h-4 w-4" />
              PDF
            </button>
            <button className="btn" onClick={excel} disabled={!lista.length} title="Baixar a lista em Excel">
              <Icone nome="planilha" className="h-4 w-4" />
              Excel
            </button>
            {podeOperar && cliente && (dados?.contas.filter((c) => c.ativo).length ?? 0) >= 2 && (
              <button className="btn" onClick={() => setTransferindo(true)}>
                <Icone nome="transferir" className="h-4 w-4" />
                Transferir entre contas
              </button>
            )}
            {podeOperar && cliente && (
              <button className="btn-primario" onClick={() => abrir()} aria-label="Nova conta">
                <Icone nome="mais" className="h-4 w-4" />
                Nova conta
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros
        ativos={mostrarInativas ? [{ id: "inativas", rotulo: "Com contas inativas", aoTirar: () => setMostrarInativas(false) }] : []}
      >
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
          Mostrar contas inativas
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
      ) : consulta.carregando && !dados ? (
        <Esqueleto linhas={3} />
      ) : !lista.length ? (
        <EstadoVazio
          icone="banco"
          titulo="Nenhuma conta bancária cadastrada"
          acao={
            podeOperar && (
              <button className="btn-primario" onClick={() => abrir()}>
                <Icone nome="mais" className="h-4 w-4" />
                Cadastrar a primeira conta
              </button>
            )
          }
        >
          Cadastre as contas de {nomeCliente(cliente)} com o saldo de um dia. Depois é só importar o extrato do banco.
        </EstadoVazio>
      ) : (
        <>
          {!dados?.plano.length && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                O plano de contas da MDC ainda não foi importado. Importe em{" "}
                <Link className="underline" href="/plano-contas">
                  Plano de contas
                </Link>{" "}
                para ligar cada banco à conta contábil do Domínio.
              </span>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador titulo="Saldo das contas ativas" icone="carteira" valor={brl(total)} tom={total < 0 ? "vermelho" : "neutro"} />
            <Indicador
              titulo="Lançamentos a conciliar"
              icone="lista"
              valor={String(aConciliar)}
              detalhe="Linhas do extrato ainda não ligadas a uma conta"
              tom={aConciliar ? "ambar" : "neutro"}
            />
            <Indicador
              titulo="Sem conta contábil"
              icone="alerta"
              valor={String(semContabil)}
              detalhe={semContabil ? "Edite o banco e escolha a conta do Domínio" : "Todos ligados ao plano"}
              tom={semContabil ? "ambar" : "verde"}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((x) => (
              <div key={x.conta.id} className={`cartao flex flex-col gap-4 p-4 sm:p-5 ${x.conta.ativo ? "" : "linha-apagada"}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--marca)] text-[var(--destaque)]" aria-hidden="true">
                    <Icone nome="banco" className="h-5 w-5" />
                  </span>
                  <div className="mr-auto min-w-0">
                    <h2 className="truncate font-semibold text-[var(--marca)]">{x.conta.nome}</h2>
                    <p className="truncate text-xs text-[var(--texto-suave)]">
                      {x.conta.banco ?? "Banco não informado"}
                      {x.conta.agencia || x.conta.numero ? ` · ag. ${x.conta.agencia ?? "—"} · conta ${x.conta.numero ?? "—"}` : ""}
                    </p>
                  </div>
                  {!x.conta.ativo && <Chip tom="neutro">Inativa</Chip>}
                </div>
                <div>
                  <p className="text-xs text-[var(--texto-suave)]" title="Saldo pelos extratos importados, mais as transferências registradas depois do último extrato">
                    Saldo atual
                  </p>
                  <p className={`num text-[26px] font-semibold tracking-tight ${x.saldo < 0 ? "text-[var(--perigo)]" : "text-[var(--texto)]"}`}>
                    {brl(x.saldo)}
                  </p>
                  <p className="text-xs text-[var(--texto-suave)]">
                    {x.ultimo ? `Último lançamento em ${fmtData(x.ultimo)}` : "Nenhum extrato importado ainda"}
                  </p>
                </div>
                <p className="text-xs">
                  <span className="text-[var(--texto-suave)]">Conta contábil: </span>
                  {x.contabil ? rotuloConta(x.contabil) : <span className="text-amber-800">não ligada</span>}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {x.pendentes > 0 && <Chip tom="ambar">{x.pendentes} a conciliar</Chip>}
                  <span className="ml-auto flex gap-2">
                    <Link href="/financeiro/extratos" className="btn !min-h-8 !px-3">
                      <Icone nome="lista" className="h-4 w-4" />
                      Ver extrato
                    </Link>
                    {podeOperar && (
                      <button className="btn !min-h-8 !px-3" onClick={() => abrir(x.conta)}>
                        <Icone nome="editar" className="h-4 w-4" />
                        Editar
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}


      {transferindo && dados && (
        <NovaTransferencia
          contas={dados.contas}
          hoje={hojeISO(org.fuso)}
          aoFechar={() => setTransferindo(false)}
          aoSalvar={(msg) => {
            setTransferindo(false);
            mostrar(msg);
            consulta.recarregar();
          }}
        />
      )}

      {form && (
        <Modal

          titulo={form.id ? "Editar conta bancária" : "Nova conta bancária"}
          descricao="Informe o saldo do banco no fim de um dia (como aparece no extrato). Os lançamentos dos dias seguintes somam a partir dele."
          aoFechar={() => setForm(null)}
          largura="lg"
        >
          <label className="campo">
            <span>Nome da conta</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Itaú movimento" />
          </label>
          <label className="campo">
            <span>Banco</span>
            <input
              list="lista-bancos"
              value={form.banco}
              onChange={(e) => setForm({ ...form, banco: e.target.value })}
              placeholder="Comece a digitar…"
            />
            <datalist id="lista-bancos">
              {BANCOS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Agência</span>
              <input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} inputMode="numeric" />
            </label>
            <label className="campo">
              <span>Número da conta</span>
              <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </label>
          </div>
          <label className="campo">
            <span>Conta contábil no Domínio</span>
            <select value={form.conta_contabil_id} onChange={(e) => setForm({ ...form, conta_contabil_id: e.target.value })}>
              <option value="">{analiticas.length ? "Escolha a conta do banco no plano…" : "Importe o plano de contas primeiro"}</option>
              {analiticas.map((c: ContaContabil) => (
                <option key={c.id} value={c.id}>
                  {rotuloConta(c)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Saldo inicial (R$)</span>
              <input value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })} inputMode="decimal" />
            </label>
            <label className="campo">
              <span>Saldo no fim do dia</span>
              <input type="date" value={form.saldo_inicial_em} onChange={(e) => setForm({ ...form, saldo_inicial_em: e.target.value })} />
            </label>
          </div>
          {form.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Conta ativa (desmarque quando a MDC encerrar a conta; o histórico continua guardado)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
