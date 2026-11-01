// Pagar/receber um título (total ou parcial, com juros, multa e desconto) e ver/estornar os pagamentos dele.
"use client";

import { useCallback, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { useConsulta } from "@/lib/useConsulta";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { baixar, estornarBaixa } from "../repositorio";
import { lerBaixas } from "../leituras";
import { numeroBr, saldoDoTitulo, valorParaCampo } from "../regras";
import { FORMAS_PAGAMENTO } from "../tipos";
import type { Baixa, ContaBancaria, Titulo } from "../tipos";
import { TEXTOS } from "./LancarTitulo";
import { JanelaMotivo } from "./Comuns";

export function BaixarTitulo({
  titulo,
  contas,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  titulo: Titulo;
  contas: ContaBancaria[];
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const t = TEXTOS[titulo.tipo];
  const saldo = saldoDoTitulo(titulo);
  const ativas = contas.filter((c) => c.ativo);
  const [f, setF] = useState({
    data: hoje,
    valor: valorParaCampo(saldo),
    juros: "",
    multa: "",
    desconto: "",
    conta:
      titulo.conta_prevista_id && ativas.some((c) => c.id === titulo.conta_prevista_id)
        ? titulo.conta_prevista_id
        : ativas.length === 1
          ? ativas[0].id
          : "",
    forma: "",
    obs: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const valor = numeroBr(f.valor);
  const juros = numeroBr(f.juros);
  const multa = numeroBr(f.multa);
  const desconto = numeroBr(f.desconto);
  const total = Math.round((valor + juros + multa - desconto) * 100) / 100;
  const parcial = valor > 0 && valor < saldo;

  async function salvar() {
    setErro("");
    if (!(valor > 0)) return setErro("Informe quanto do título está sendo baixado.");
    if (valor > saldo + 0.001) return setErro(`O valor passa do que falta (${brl(saldo)}).`);
    if ([juros, multa, desconto].some((x) => Number.isNaN(x) || x < 0))
      return setErro("Juros, multa e desconto: use valores positivos (ou deixe em branco).");
    if (total < 0) return setErro("O desconto é maior que o valor.");
    if (!f.conta) return setErro("Escolha a conta bancária.");
    setSalvando(true);
    try {
      const r = await baixar({
        titulo: titulo.id,
        data: f.data,
        valor,
        conta: f.conta,
        juros,
        multa,
        desconto,
        forma: f.forma || null,
        obs: f.obs || null,
      });
      aoSalvar(r.quitado ? `${t.feito}. Título quitado.` : `${t.feito} em parte. Falta ${brl(Number(r.saldo))}.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={`${t.verbo}: ${titulo.descricao}`}
      descricao={`Vencimento ${fmtData(titulo.vencimento)} · valor ${brl(Number(titulo.valor))} · falta ${brl(saldo)}`}
      aoFechar={aoFechar}
      largura="lg"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Data do {titulo.tipo === "pagar" ? "pagamento" : "recebimento"}</span>
          <input type="date" value={f.data} onChange={(e) => mudar({ data: e.target.value })} />
        </label>
        <label className="campo">
          <span>Valor do título baixado (R$)</span>
          <input value={f.valor} onChange={(e) => mudar({ valor: e.target.value })} inputMode="decimal" />
        </label>
      </div>
      {parcial && <p className="text-xs text-violet-800">Baixa parcial: o título continua em aberto com {brl(saldo - valor)}.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="campo">
          <span>Juros</span>
          <input value={f.juros} onChange={(e) => mudar({ juros: e.target.value })} inputMode="decimal" placeholder="0,00" />
        </label>
        <label className="campo">
          <span>Multa</span>
          <input value={f.multa} onChange={(e) => mudar({ multa: e.target.value })} inputMode="decimal" placeholder="0,00" />
        </label>
        <label className="campo">
          <span>Desconto</span>
          <input value={f.desconto} onChange={(e) => mudar({ desconto: e.target.value })} inputMode="decimal" placeholder="0,00" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Conta bancária</span>
          <select value={f.conta} onChange={(e) => mudar({ conta: e.target.value })}>
            <option value="">{ativas.length ? "Escolha…" : "Cadastre uma conta bancária"}</option>
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Forma</span>
          <select value={f.forma} onChange={(e) => mudar({ forma: e.target.value })}>
            <option value="">—</option>
            {FORMAS_PAGAMENTO.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="campo">
        <span>Observação</span>
        <input value={f.obs} onChange={(e) => mudar({ obs: e.target.value })} />
      </label>
      <p className="rounded-md bg-neutral-50 p-3 text-sm">
        {titulo.tipo === "pagar" ? "Sai do banco" : "Entra no banco"}:{" "}
        <b className="tabular-nums">{brl(Number.isNaN(total) ? 0 : total)}</b>
      </p>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : `Confirmar ${t.verbo.toLowerCase() === "pagar" ? "pagamento" : "recebimento"}`}
        </button>
      </div>
    </Modal>
  );
}

/** Pagamentos do título, com estorno (marca e reabre o título; o motivo fica no histórico). */
export function HistoricoTitulo({
  titulo,
  contas,
  podeOperar,
  aoFechar,
  aoMudar,
}: {
  titulo: Titulo;
  contas: ContaBancaria[];
  podeOperar: boolean;
  aoFechar: () => void;
  aoMudar: (msg: string) => void;
}) {
  const consulta = useConsulta(useCallback(() => lerBaixas(titulo.cliente_id, { titulos: [titulo.id] }), [titulo]));
  const [estornar, setEstornar] = useState<Baixa | null>(null);
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "—";

  if (estornar)
    return (
      <JanelaMotivo
        titulo="Estornar pagamento"
        descricao={`${fmtData(estornar.data)} · ${brl(Number(estornar.total))}. O título volta a ficar em aberto. O registro não é apagado.`}
        botao="Estornar"
        aoFechar={() => setEstornar(null)}
        aoConfirmar={async (motivo) => {
          await estornarBaixa(estornar.id, motivo);
          aoMudar("Pagamento estornado. O título voltou a ficar em aberto.");
        }}
      />
    );

  return (
    <Modal titulo={`Histórico: ${titulo.descricao}`} aoFechar={aoFechar} largura="2xl">
      {titulo.situacao === "cancelado" && (
        <p className="rounded-md bg-neutral-100 p-3 text-sm">Cancelado. Motivo: {titulo.cancelado_motivo ?? "—"}</p>
      )}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}
      {!consulta.dados ? (
        <Carregando />
      ) : !consulta.dados.length ? (
        <p className="text-sm text-neutral-600">Nenhum pagamento registrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Conta</th>
                <th className="text-right">Valor</th>
                <th className="text-right">Juros/multa</th>
                <th className="text-right">Desconto</th>
                <th className="text-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {consulta.dados.map((b) => (
                <tr key={b.id} className={b.estornada ? "text-neutral-400 line-through" : ""}>
                  <td>{fmtData(b.data)}</td>
                  <td>
                    {nomeConta(b.conta_id)}
                    {b.forma && <span className="block text-xs text-neutral-500">{b.forma}</span>}
                  </td>
                  <td className="text-right tabular-nums">{brl(Number(b.valor))}</td>
                  <td className="text-right tabular-nums">{brl(Number(b.juros) + Number(b.multa))}</td>
                  <td className="text-right tabular-nums">{brl(Number(b.desconto))}</td>
                  <td className="text-right font-medium tabular-nums">{brl(Number(b.total))}</td>
                  <td className="text-right no-underline">
                    {b.estornada ? (
                      <span className="chip bg-neutral-100 text-neutral-600" title={b.estorno_motivo ?? ""}>
                        Estornado
                      </span>
                    ) : b.extrato_linha_id ? (
                      <span className="chip bg-emerald-50 text-emerald-800">Conciliado</span>
                    ) : (
                      podeOperar && (
                        <button className="btn !min-h-8" onClick={() => setEstornar(b)}>
                          Estornar
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
