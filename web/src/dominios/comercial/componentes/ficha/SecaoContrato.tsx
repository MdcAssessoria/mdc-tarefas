// Ficha da oportunidade › Proposta e contrato: valores negociados, prévia do texto, PDF e a vida do contrato
// (rascunho → enviado → assinado; "Renegociar" muda o atual para cancelado — contrato não se apaga, migração 036).
// Quem usa recria este componente (key) quando muda o último contrato, para os campos voltarem ao que foi salvo.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtDataLocal } from "@/lib/formato/datas";
import { mdParaHtml } from "@/lib/markdown";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { Modal } from "@/components/ui/Modal";
import type { TomAviso } from "@/components/ui/Aviso";
import { montarContrato, valoresIniciais } from "../../crm";
import type { Contrato, Modelo, Oportunidade, Valores } from "../../crm";
import { marcarContrato, salvarContrato } from "../../repositorio";
import { SITUACOES_CONTRATO, mesmosValores } from "../../rotulos";
import { baixarContratoPdf } from "../../baixarContrato";
import { CamposContrato } from "./CamposContrato";

export function SecaoContrato({
  o,
  modelo,
  contratos,
  podeOperar,
  podeGerir,
  aoMudar,
  avisar,
}: {
  o: Oportunidade;
  modelo: Modelo | null;
  contratos: Contrato[];
  podeOperar: boolean;
  podeGerir: boolean;
  aoMudar: () => void;
  avisar: (msg: string, tom?: TomAviso) => void;
}) {
  const { org } = useOrg();
  const ultimo = contratos[0];
  const [v, setV] = useState<Valores>(ultimo?.valores ?? valoresIniciais(o, hojeISO(org.fuso)));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [perguntaAssinado, setPerguntaAssinado] = useState(false);
  const [confirmacao, confirmar] = useConfirmar();

  const editavel = podeOperar && (!ultimo || ultimo.status === "rascunho" || ultimo.status === "cancelado");
  const numeroPrevisto = ultimo && ultimo.status !== "cancelado" ? (ultimo.numero ?? "") : "(número gerado ao salvar)";
  const texto = useMemo(() => (modelo ? montarContrato(modelo.texto, v, numeroPrevisto) : ""), [modelo, v, numeroPrevisto]);
  const pendencias = (texto.match(/\[preencher[^\]]*\]/g) ?? []).length;
  const alterado = !ultimo || ultimo.status === "cancelado" || !mesmosValores(ultimo.valores, v);

  async function fazer(qual: string, f: () => Promise<void>) {
    setOcupado(qual);
    try {
      await f();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  /** Grava os valores (cria o contrato se ainda não há rascunho) e devolve o contrato salvo. */
  async function gravar(): Promise<Contrato> {
    const r = await salvarContrato(o, modelo!, v, ultimo, hojeISO(org.fuso));
    if (r.falha) avisar(r.falha, "atencao");
    aoMudar();
    return r.contrato;
  }

  const salvar = () =>
    fazer("salvar", async () => {
      const c = await gravar();
      avisar(ultimo?.status === "rascunho" ? "Valores salvos." : `Contrato ${c.numero} criado como rascunho.`);
    });

  const pdf = (c?: Contrato) =>
    fazer(c ? `pdf-${c.id}` : "pdf", async () => {
      const alvo = c ?? (editavel && alterado ? await gravar() : ultimo);
      if (alvo) await baixarContratoPdf(alvo, org.logo_url);
    });

  const marcar = (status: "enviado" | "assinado" | "cancelado", converter = false) =>
    fazer(status, async () => {
      const falhas = await marcarContrato(o, ultimo!, status, converter);
      if (falhas.length) avisar(`Contrato atualizado, mas houve falha em: ${falhas.join("; ")}.`, "atencao");
      else
        avisar(
          status === "enviado"
            ? "Marcado como enviado ao cliente."
            : status === "assinado"
              ? converter
                ? "Contrato assinado e empresa cadastrada na carteira."
                : "Contrato marcado como assinado."
              : "Contrato cancelado. Ajuste os valores e salve para gerar a nova versão.",
        );
      aoMudar();
    });

  async function renegociar() {
    const sim = await confirmar({
      titulo: `Renegociar o contrato ${ultimo?.numero ?? ""}?`,
      descricao:
        "O contrato atual fica como “Cancelado” (não é apagado: continua em Versões anteriores). Depois você ajusta os valores e salva para gerar um contrato com número novo.",
      botao: "Cancelar este e renegociar",
      perigo: true,
    });
    if (sim) await marcar("cancelado");
  }

  if (!modelo)
    return (
      <EstadoVazio
        icone="documento"
        titulo="Falta o modelo de contrato"
        acao={
          podeGerir && (
            <Link className="btn-primario" href="/comercial/modelo">
              <Icone nome="editar" className="h-4 w-4" />
              Cadastrar o modelo
            </Link>
          )
        }
      >
        O contrato é montado a partir do texto-base da MDC.{" "}
        {podeGerir
          ? "Cadastre o modelo uma vez e depois preencha só os valores de cada cliente."
          : "Peça a quem gerencia o Comercial para cadastrar o modelo."}
      </EstadoVazio>
    );

  const situacao = ultimo ? SITUACOES_CONTRATO[ultimo.status] : null;

  return (
    <section className="cartao space-y-4 p-4" aria-labelledby="contrato-titulo">
      {confirmacao}
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="contrato-titulo" className="mr-auto flex items-center gap-2 font-semibold text-[var(--marca)]">
          <Icone nome="documento" className="h-5 w-5" />
          Proposta e contrato
        </h2>
        {ultimo && situacao && (
          <span title={situacao.dica}>
            <Chip tom={situacao.tom}>
              Contrato {ultimo.numero} · {situacao.nome}
            </Chip>
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--texto-suave)]">
        Modelo “{modelo.nome}” (versão {modelo.versao}). Aqui entram só os valores negociados; o texto vem do modelo-base.
        {!editavel && ultimo && podeOperar && " Contrato enviado ou assinado não muda: para alterar valores, use “Renegociar”."}
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <CamposContrato v={v} setV={setV} editavel={editavel} />
        <div className="min-w-0 space-y-2 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icone nome="olho" className="h-4 w-4 text-[var(--texto-suave)]" />
              Prévia do contrato
            </h3>
            {pendencias > 0 && (
              <span className="chip bg-amber-50 text-amber-900" title="Trechos marcados como [preencher] no texto">
                {pendencias} campo(s) a preencher
              </span>
            )}
          </div>
          <article
            className="prosa max-h-[480px] overflow-y-auto rounded-lg border border-[var(--borda)] bg-white p-4 sm:p-5 xl:max-h-[760px]"
            dangerouslySetInnerHTML={{ __html: mdParaHtml(texto) }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--borda)] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        {editavel && (
          <button className="btn" onClick={salvar} disabled={!alterado || !!ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado === "salvar" ? "Salvando…" : ultimo?.status === "rascunho" ? "Salvar valores" : "Criar contrato (rascunho)"}
          </button>
        )}
        <button className="btn-primario" disabled={!!ocupado} onClick={() => pdf()}>
          <Icone nome="documento" className="h-4 w-4" />
          {ocupado === "pdf" ? "Gerando…" : "Baixar contrato em PDF"}
        </button>
        {podeOperar && ultimo?.status === "rascunho" && (
          <button className="btn" onClick={() => marcar("enviado")} disabled={!!ocupado || alterado}>
            <Icone nome="enviar" className="h-4 w-4" />
            Marcar como enviado
          </button>
        )}
        {podeOperar && ultimo && ["rascunho", "enviado"].includes(ultimo.status) && (
          <button
            className="btn"
            onClick={() => setPerguntaAssinado(true)}
            disabled={!!ocupado || (ultimo.status === "rascunho" && alterado)}
          >
            <Icone nome="check" className="h-4 w-4" />
            Marcar como assinado
          </button>
        )}
        {podeOperar && ultimo && ["enviado", "assinado"].includes(ultimo.status) && (
          <button className="btn" onClick={renegociar} disabled={!!ocupado}>
            <Icone nome="editar" className="h-4 w-4" />
            Renegociar (nova versão)
          </button>
        )}
      </div>
      {editavel && ultimo?.status === "rascunho" && alterado && (
        <p className="text-xs text-amber-800">
          Há valores não salvos. Salve antes de marcar como enviado ou assinado; o PDF salva sozinho.
        </p>
      )}

      {contratos.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Versões anteriores</h3>
          <ul className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)] text-sm">
            {contratos.slice(1).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="num font-medium">{c.numero}</span>
                <Chip tom={SITUACOES_CONTRATO[c.status].tom}>{SITUACOES_CONTRATO[c.status].nome}</Chip>
                <span className="text-xs text-[var(--texto-suave)]">criado em {fmtDataLocal(c.criado_em)}</span>
                <button className="btn ml-auto !min-h-8 !px-3" onClick={() => pdf(c)} disabled={!!ocupado}>
                  <Icone nome="documento" className="h-4 w-4" />
                  {ocupado === `pdf-${c.id}` ? "Gerando…" : "PDF"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {perguntaAssinado && ultimo && (
        <Modal
          titulo={`Contrato ${ultimo.numero} assinado`}
          descricao={
            o.cliente_id
              ? "Confirme que o cliente assinou. A data de hoje fica registrada."
              : "Confirme que o cliente assinou. Quer também cadastrar a empresa como cliente da carteira (Tarefas, Portal e Demonstrativos) agora?"
          }
          aoFechar={() => setPerguntaAssinado(false)}
        >
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button className="btn" onClick={() => setPerguntaAssinado(false)}>
              Voltar
            </button>
            {o.cliente_id ? (
              <button
                className="btn-primario"
                onClick={() => {
                  setPerguntaAssinado(false);
                  void marcar("assinado");
                }}
              >
                <Icone nome="check" className="h-4 w-4" />
                Marcar como assinado
              </button>
            ) : (
              <>
                <button
                  className="btn"
                  onClick={() => {
                    setPerguntaAssinado(false);
                    void marcar("assinado");
                  }}
                >
                  Só marcar assinado
                </button>
                <button
                  className="btn-primario"
                  onClick={() => {
                    setPerguntaAssinado(false);
                    void marcar("assinado", true);
                  }}
                >
                  <Icone nome="check" className="h-4 w-4" />
                  Assinado e cadastrar cliente
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
