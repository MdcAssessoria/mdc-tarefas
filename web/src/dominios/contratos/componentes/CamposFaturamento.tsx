// Parte "Fatura e envio ao cliente" do cadastro de contrato A RECEBER (migração 043): o que enviar (4 opções com
// ícones), dados do serviço quando sai nota fiscal e por onde enviar (e-mail, WhatsApp, Portal do Cliente).
// O dia de gerar fica junto do "Vence todo dia" em ContratoFixo. Linguagem simples; o banco confere tudo de novo.
// As grades seguem a largura do próprio bloco (@container), não a da tela: na terceira coluna da janela larga (monitor
// grande) cada opção ocupa uma linha; na coluna da direita do notebook, duas por linha.
"use client";

import { Icone } from "@/components/ui/Icone";
import type { Cliente } from "@/dominios/clientes/tipos";
import { nomeCliente } from "@/dominios/clientes/nome";
import { CANAIS_ENVIO, documentoDoEnvio, NOME_DOCUMENTO, OPCOES_ENVIO } from "../faturamento";
import type { FaturamentoForm } from "../faturamento";
import type { CanalEnvio } from "../tipos";

const CARTAO = "rounded-lg border p-3 text-left transition";
const MARCADO = "border-[var(--destaque-escuro)] bg-amber-50/60 ring-1 ring-[var(--destaque-escuro)]";
const DESMARCADO = "border-[var(--borda)] hover:bg-[var(--fundo)]";

export function CamposFaturamento({
  f,
  mudar,
  carteira,
}: {
  f: FaturamentoForm;
  mudar: (p: Partial<FaturamentoForm>) => void;
  carteira: Cliente[];
}) {
  const doc = documentoDoEnvio(f.envio);
  const temBoleto = f.envio !== "fatura";
  const marcar = (c: CanalEnvio, sim: boolean) =>
    mudar({ canais: sim ? [...f.canais.filter((x) => x !== c), c] : f.canais.filter((x) => x !== c) });

  return (
    <fieldset className="@container rounded-md border border-[var(--borda)] p-3">
      <legend className="px-1 text-sm font-medium">Fatura e envio ao cliente</legend>
      <p className="mb-2 text-xs text-[var(--texto-suave)]">
        Todo mês, no dia de gerar, o HUB cria a conta a receber e a fatura deste contrato e manda para o cliente pelos canais marcados.
      </p>

      <p className="mb-1 text-sm font-medium" id="rotulo-o-que-enviar">
        O que enviar ao cliente
      </p>
      <div className="grid gap-2 @md:grid-cols-2" role="radiogroup" aria-labelledby="rotulo-o-que-enviar">
        {OPCOES_ENVIO.map((o) => {
          const sel = f.envio === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => mudar({ envio: o.id })}
              className={`${CARTAO} ${sel ? MARCADO : DESMARCADO}`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    sel ? "border-[var(--marca)] bg-[var(--marca)]" : "border-neutral-400 bg-white"
                  }`}
                >
                  {sel && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="flex gap-1" aria-hidden="true">
                  {o.icones.map((i) => (
                    <span key={i} className="grid h-7 w-7 place-items-center rounded-full bg-[var(--fundo)] text-[var(--marca)]">
                      <Icone nome={i} className="h-4 w-4" />
                    </span>
                  ))}
                </span>
                <span className="font-medium">{o.titulo}</span>
              </span>
              <span className="mt-1 block pl-6 text-xs text-[var(--texto-suave)]">{o.detalhe}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--texto-suave)]">
        Documento do mês: <strong className="text-[var(--texto)]">{NOME_DOCUMENTO[doc]}</strong>
        {doc === "nfse" && " — a nota será emitida pelo Emissor Nacional (próxima etapa); até lá a fatura fica “Aguardando nota fiscal”."}
      </p>
      {temBoleto && (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
          Boleto: a plataforma de boletos ainda não foi escolhida. A fatura sai normalmente e o boleto fica “aguardando configuração”.
        </p>
      )}

      {doc === "nfse" && (
        <div className="mt-3 grid gap-3 @md:grid-cols-4">
          <label className="campo @md:col-span-4">
            <span>Descrição do serviço (vai na nota)</span>
            <textarea
              rows={2}
              value={f.servicoDescricao}
              onChange={(e) => mudar({ servicoDescricao: e.target.value })}
              placeholder="Ex.: Serviços de contabilidade, escrituração fiscal e folha de pagamento"
            />
          </label>
          <label className="campo @md:col-span-2">
            <span>Código do serviço</span>
            <input value={f.servicoCodigo} onChange={(e) => mudar({ servicoCodigo: e.target.value })} placeholder="17.01.01" />
            <small className="text-xs text-[var(--texto-suave)]">Código de tributação nacional (ou o item da LC 116, ex.: 17.01).</small>
          </label>
          <label className="campo @md:col-span-2">
            <span>ISS (%)</span>
            <input value={f.iss} onChange={(e) => mudar({ iss: e.target.value })} inputMode="decimal" placeholder="2" />
            <small className="text-xs text-[var(--texto-suave)]">Alíquota do município, de 0% a 5%.</small>
          </label>
        </div>
      )}

      <p className="mb-1 mt-3 text-sm font-medium">Por onde enviar</p>
      <div className="grid gap-2 @lg:grid-cols-3">
        {CANAIS_ENVIO.map((c) => {
          const sel = f.canais.includes(c.id);
          return (
            <label key={c.id} className={`${CARTAO} flex cursor-pointer items-start gap-2 ${sel ? MARCADO : DESMARCADO}`}>
              <input type="checkbox" className="mt-1" checked={sel} onChange={(e) => marcar(c.id, e.target.checked)} />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Icone nome={c.icone} className="h-4 w-4 text-[var(--marca)]" />
                  {c.nome}
                </span>
                <span className="block text-xs text-[var(--texto-suave)]">{c.explicacao}</span>
              </span>
            </label>
          );
        })}
      </div>
      {f.canais.length > 0 && (
        <div className="mt-3 grid gap-3 @lg:grid-cols-3">
          {f.canais.includes("email") && (
            <label className="campo">
              <span>E-mail que recebe</span>
              <input
                type="email"
                value={f.email}
                onChange={(e) => mudar({ email: e.target.value })}
                placeholder="financeiro@cliente.com.br"
              />
            </label>
          )}
          {f.canais.includes("whatsapp") && (
            <label className="campo">
              <span>WhatsApp que recebe</span>
              <input
                type="tel"
                inputMode="tel"
                value={f.whatsapp}
                onChange={(e) => mudar({ whatsapp: e.target.value })}
                placeholder="(11) 98888-7777"
              />
            </label>
          )}
          {f.canais.includes("portal") && (
            <label className="campo">
              <span>Cliente no Portal</span>
              <select value={f.carteira} onChange={(e) => mudar({ carteira: e.target.value })}>
                <option value="">Escolha o cliente…</option>
                {carteira.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nomeCliente(c)}
                  </option>
                ))}
              </select>
              <small className="text-xs text-[var(--texto-suave)]">Quem tem login do Portal desse cliente vê a fatura.</small>
            </label>
          )}
        </div>
      )}
      {(f.canais.includes("email") || f.canais.includes("whatsapp")) && (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-[var(--fundo)] p-2 text-xs text-[var(--texto-suave)]">
          <Icone nome="relogio" className="mt-0.5 h-4 w-4 shrink-0" />
          Envio por e-mail e WhatsApp: aguardando configuração. Até lá a fatura fica na fila e você baixa o PDF em Contratos › Faturas.
        </p>
      )}
    </fieldset>
  );
}
