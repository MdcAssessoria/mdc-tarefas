// Janela "Boleto/Pix" de uma mensalidade: emite pelo Ledgra Link (se ainda não tem) e mostra o Pix copia e cola e a
// linha digitável, com botões para copiar e mandar ao cliente pelo WhatsApp. A baixa acontece sozinha quando o banco
// avisa o pagamento; a baixa manual continua disponível.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { horaNoFuso } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { emissaoValida, emitirBoletoPix, mensagemBoletoPix, SITUACOES_EMISSAO, TIPOS_LINK } from "../ledgraLink";
import type { EmissaoLink, TipoCobrancaLink } from "../ledgraLink";
import type { Cobranca } from "../tipos";

function Copiar({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{rotulo}</span>
        <button
          className="btn !min-h-8"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setOk(true);
            } catch {}
          }}
        >
          {ok ? "Copiado" : "Copiar"}
        </button>
      </div>
      <textarea readOnly value={texto} rows={2} className="entrada w-full font-mono text-xs" onFocus={(e) => e.target.select()} />
    </div>
  );
}

export function JanelaBoletoPix({
  cobranca,
  cliente,
  emissao,
  tipoPadrao,
  aoFechar,
  aoEmitir,
}: {
  cobranca: Cobranca;
  cliente: string;
  emissao: EmissaoLink | undefined;
  tipoPadrao: TipoCobrancaLink;
  aoFechar: () => void;
  aoEmitir: () => void;
}) {
  const { org } = useOrg();
  const [res, setRes] = useState<{ linha: string | null; pix: string | null; venc: string; aviso: string | null } | null>(
    emissaoValida(emissao)
      ? { linha: emissao!.linha_digitavel, pix: emissao!.pix_copia_cola, venc: cobranca.vencimento, aviso: null }
      : null,
  );
  const [erro, setErro] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const tipo = TIPOS_LINK.find((t) => t.id === (emissao?.tipo ?? tipoPadrao));

  async function emitir() {
    setErro("");
    setEmitindo(true);
    try {
      const r = await emitirBoletoPix(cobranca.id);
      setRes({ linha: r.linha_digitavel, pix: r.pix_copia_cola, venc: r.vencimento, aviso: r.aviso });
      aoEmitir();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEmitindo(false);
    }
  }

  const mensagem = res
    ? mensagemBoletoPix({
        hora: horaNoFuso(org.fuso),
        cliente,
        escritorio: org.nome,
        cobranca,
        vencimento: res.venc,
        linha_digitavel: res.linha,
        pix_copia_cola: res.pix,
      })
    : "";

  return (
    <Modal
      titulo="Boleto/Pix da mensalidade"
      descricao={`${cliente} · ${cobranca.descricao} · ${brl(cobranca.valor)} · vence ${fmtData(cobranca.vencimento)}`}
      aoFechar={aoFechar}
      largura="lg"
    >
      {emissao && (
        <p className="text-sm">
          Situação no banco:{" "}
          <span className={`chip ${SITUACOES_EMISSAO[emissao.situacao].tom}`}>{SITUACOES_EMISSAO[emissao.situacao].nome}</span>
        </p>
      )}
      {!res ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">
            O Ledgra Link vai registrar no banco um <b>{tipo?.nome.toLowerCase() ?? "boleto com Pix"}</b> para esta mensalidade.{" "}
            {tipo?.ajuda} Quando o cliente pagar, a baixa é feita sozinha.
          </p>
          {emissao && !emissaoValida(emissao) && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              A emissão anterior não vale mais. Emitir de novo gera um novo boleto/Pix.
            </p>
          )}
          {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={aoFechar}>
              Voltar
            </button>
            <button className="btn-primario" onClick={emitir} disabled={emitindo}>
              {emitindo ? "Registrando no banco…" : "Emitir boleto/Pix"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {res.aviso && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{res.aviso}</p>}
          {res.pix && <Copiar rotulo="Pix copia e cola" texto={res.pix} />}
          {res.linha && <Copiar rotulo="Linha digitável do boleto" texto={res.linha} />}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button className="btn" onClick={aoFechar}>
              Fechar
            </button>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(mensagem);
                } catch {}
              }}
            >
              Copiar mensagem
            </button>
            <a
              className="btn-primario"
              href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Enviar pelo WhatsApp
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
