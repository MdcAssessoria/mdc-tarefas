// Cartão "Ledgra Link" da aba Integrações: liga a emissão de boleto/Pix das mensalidades da Cobrança Ledgra pelo
// Ledgra Link (add-on bancário da MDC) e a baixa automática. A chave do Ledgra Link fica nos segredos do servidor; aqui
// só a conta da MDC no Ledgra Link, o tipo de cobrança, multa e juros.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { caminho } from "@/lib/caminho";
import { numeroBr } from "@/dominios/financeiro/regras";
import { lerConfigLink, salvarConfigLink, situacaoLedgraLink, TIPOS_LINK } from "@/dominios/licencas/ledgraLink";
import type { ConfigLink, TipoCobrancaLink } from "@/dominios/licencas/ledgraLink";
import { useMensagem } from "./useMensagem";

type Form = { conta: string; tipo: TipoCobrancaLink; multa: string; juros: string; dias: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deConfig = (c: ConfigLink | null): Form => ({
  conta: c?.conta_link_id ?? "",
  tipo: c?.tipo_padrao ?? "boleto_hibrido",
  multa: String(c?.multa_percentual ?? 2).replace(".", ","),
  juros: String(c?.juros_mensal_percentual ?? 1).replace(".", ","),
  dias: String(c?.dias_apos_vencimento ?? 30),
});

export function CartaoLedgraLink() {
  const { org } = useOrg();
  const { mostrar, el } = useMensagem();
  const consulta = useConsulta(useCallback(() => lerConfigLink(org.id), [org.id]));
  const atual = consulta.dados ?? null;
  const [editado, setEditado] = useState<Form | null>(null);
  const f = editado ?? deConfig(atual);
  const mudar = (p: Partial<Form>) => setEditado({ ...f, ...p });
  const [ocupado, setOcupado] = useState<"salvar" | "testar" | null>(null);

  async function salvar(ativo: boolean) {
    const multa = numeroBr(f.multa);
    const juros = numeroBr(f.juros);
    const dias = Number(f.dias);
    if (ativo && !UUID.test(f.conta.trim()))
      return mostrar("Informe o código da conta da MDC no Ledgra Link (formato xxxxxxxx-xxxx-…).", true);
    if (Number.isNaN(multa) || multa < 0 || multa > 2) return mostrar("Multa: de 0 a 2% (limite do Código de Defesa do Consumidor).", true);
    if (Number.isNaN(juros) || juros < 0 || juros > 10) return mostrar("Juros: de 0 a 10% ao mês.", true);
    if (!Number.isInteger(dias) || dias < 0 || dias > 120) return mostrar("Prazo após o vencimento: de 0 a 120 dias.", true);
    setOcupado("salvar");
    try {
      await salvarConfigLink(org.id, {
        ativo,
        conta_link_id: f.conta.trim() || null,
        tipo_padrao: f.tipo,
        multa_percentual: multa,
        juros_mensal_percentual: juros,
        dias_apos_vencimento: dias,
      });
      setEditado(null);
      mostrar(
        ativo
          ? "Ledgra Link ligado: as mensalidades em aberto ganham o botão Boleto/Pix."
          : "Configuração salva. O Ledgra Link está desligado.",
      );
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), true);
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado("testar");
    try {
      const r = await situacaoLedgraLink();
      mostrar(r.mensagem, !r.ligado);
    } catch (e) {
      mostrar(traduzirErro(e), true);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="cartao space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-[var(--marca)]">Ledgra Link — boleto e Pix da Cobrança Ledgra</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Com o Ledgra Link ligado, cada mensalidade em aberto ganha o botão <b>Boleto/Pix</b>: o banco registra a cobrança e, quando o
            cliente paga, a baixa é feita sozinha. A baixa manual continua valendo.
          </p>
        </div>
        <label className="campo">
          <span>Conta da MDC no Ledgra Link</span>
          <input placeholder="Código da conta (ex.: 7c1e…-…)" value={f.conta} onChange={(e) => mudar({ conta: e.target.value })} />
        </label>
        <label className="campo">
          <span>Tipo de cobrança</span>
          <select value={f.tipo} onChange={(e) => mudar({ tipo: e.target.value as TipoCobrancaLink })}>
            {TIPOS_LINK.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <small className="text-neutral-500">{TIPOS_LINK.find((t) => t.id === f.tipo)?.ajuda}</small>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="campo">
            <span>Multa (%)</span>
            <input inputMode="decimal" value={f.multa} onChange={(e) => mudar({ multa: e.target.value })} />
          </label>
          <label className="campo">
            <span>Juros ao mês (%)</span>
            <input inputMode="decimal" value={f.juros} onChange={(e) => mudar({ juros: e.target.value })} />
          </label>
          <label className="campo">
            <span>Aceita pagar até (dias após vencer)</span>
            <input inputMode="numeric" value={f.dias} onChange={(e) => mudar({ dias: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primario" disabled={!!ocupado} onClick={() => salvar(true)}>
            {ocupado === "salvar" ? "Salvando…" : "Salvar e ligar"}
          </button>
          <button className="btn" disabled={!!ocupado} onClick={() => salvar(false)}>
            Salvar desligado
          </button>
          <button
            className="btn"
            disabled={!!ocupado}
            onClick={testar}
            title="Confere se o servidor do HUB consegue falar com o Ledgra Link"
          >
            {ocupado === "testar" ? "Testando…" : "Testar conexão"}
          </button>
        </div>
        {el}
      </div>

      <div className="cartao space-y-3 p-5 text-sm">
        <h2 className="font-semibold text-[var(--marca)]">Situação</h2>
        {consulta.carregando ? (
          <p className="text-neutral-500">Carregando…</p>
        ) : (
          <p>
            <span className={`chip ${atual?.ativo ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-700"}`}>
              {atual?.ativo ? "Ligado na Cobrança Ledgra" : "Desligado"}
            </span>
          </p>
        )}
        <p>
          <a className="underline" href={caminho("/licencas/cobrancas")}>
            Ir para as mensalidades
          </a>
        </p>
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          <b>Uma vez só, pelo administrador:</b> cadastrar nos segredos das Funções Edge a chave do HUB no Ledgra Link (
          <code>LEDGRA_LINK_URL</code> e <code>LEDGRA_LINK_CHAVE</code>) e o segredo dos avisos (<code>LEDGRA_LINK_SEGREDO_WEBHOOK</code>).
          Enquanto isso não for feito, o “Testar conexão” avisa que o Ledgra Link ainda não está ligado.
        </div>
      </div>
    </div>
  );
}
