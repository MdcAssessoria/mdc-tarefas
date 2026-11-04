// Janela do boleto de uma fatura (049): mostra o banco do contrato (Itaú ou Santander), o valor e o vencimento e gera o
// boleto pelo Ledgra Link; com o boleto pronto, mostra a linha digitável e o Pix copia e cola com botão de copiar.
// Quem só vê Contratos enxerga o boleto, mas não gera. O banco confere tudo de novo (fatura_boleto_preparar).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { Chip } from "@/components/ui/Chip";
import { BANCOS_BOLETO } from "../faturamento";
import { gerarBoletoFatura } from "../repositorio";
import type { BancoBoleto, BoletoFatura, Fatura, SituacaoBoletoEmitido } from "../tipos";

export const SITUACOES_BOLETO_EMITIDO: Record<SituacaoBoletoEmitido, { nome: string; tom: "verde" | "azul" | "ambar" | "vermelho" | "neutro" }> = {
  registrada: { nome: "Registrado no banco", tom: "azul" },
  paga: { nome: "Pago", tom: "verde" },
  paga_parcial: { nome: "Pago a menos", tom: "ambar" },
  vencida: { nome: "Vencido", tom: "vermelho" },
  baixada: { nome: "Baixado", tom: "neutro" },
  cancelada: { nome: "Cancelado", tom: "neutro" },
  rejeitada: { nome: "Recusado pelo banco", tom: "vermelho" },
};

const nomeBanco = (b: BancoBoleto | null | undefined) => BANCOS_BOLETO.find((x) => x.id === b)?.nome ?? "—";

function Copiavel({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="campo">
      <span>{rotulo}</span>
      <div className="flex gap-2">
        <input readOnly value={texto} className="num min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              setCopiado(false);
            }
          }}
        >
          <Icone nome="copiar" className="h-4 w-4" />
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export function JanelaBoleto({
  fatura,
  cliente,
  banco,
  boleto,
  podeOperar,
  aoFechar,
}: {
  fatura: Fatura;
  cliente: string;
  /** Banco escolhido no contrato. */
  banco: BancoBoleto | null;
  /** Último boleto emitido para a fatura (se houver). */
  boleto: BoletoFatura | null;
  podeOperar: boolean;
  aoFechar: (mudou: boolean) => void;
}) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<{ linha_digitavel: string | null; pix_copia_cola: string | null; vencimento: string; aviso: string | null } | null>(
    null,
  );
  const valido = boleto && ["registrada", "paga", "paga_parcial", "vencida"].includes(boleto.situacao) ? boleto : null;
  const linha = novo?.linha_digitavel ?? valido?.linha_digitavel ?? null;
  const pix = novo?.pix_copia_cola ?? valido?.pix_copia_cola ?? null;
  const podeGerar = podeOperar && !valido && !novo && fatura.situacao !== "cancelada" && fatura.boleto_situacao !== "nao_se_aplica";

  async function gerar() {
    setErro("");
    setGerando(true);
    try {
      setNovo(await gerarBoletoFatura(fatura.id));
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <Modal
      titulo={`Boleto · Fatura ${fatura.numero}`}
      descricao={`${cliente} · ${brl(Number(fatura.valor))} · vence em ${fmtData(fatura.vencimento)}`}
      aoFechar={() => aoFechar(!!novo)}
      largura="lg"
      rodape={
        <>
          <button className="btn" onClick={() => aoFechar(!!novo)}>
            Voltar
          </button>
          {podeGerar && (
            <button className="btn-primario" onClick={() => void gerar()} disabled={gerando || !banco}>
              <Icone nome="banco" className="h-4 w-4" />
              {gerando ? "Gerando no banco…" : `Gerar boleto no ${nomeBanco(banco)}`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Icone nome="banco" className="h-4 w-4 text-[var(--marca)]" />
          Banco do boleto: <strong>{nomeBanco(valido?.banco ?? banco)}</strong>
          {valido && <Chip tom={SITUACOES_BOLETO_EMITIDO[valido.situacao].tom}>{SITUACOES_BOLETO_EMITIDO[valido.situacao].nome}</Chip>}
          {novo && <Chip tom="azul">Registrado no banco</Chip>}
        </p>
        {!banco && !valido && (
          <p className="rounded-md bg-amber-50 p-2 text-amber-900">
            O contrato não tem banco do boleto. Edite o contrato e escolha Itaú ou Santander.
          </p>
        )}
        {boleto && !valido && !novo && (
          <p className="rounded-md bg-amber-50 p-2 text-amber-900">
            O último boleto ficou “{SITUACOES_BOLETO_EMITIDO[boleto.situacao].nome.toLowerCase()}”. Gere outro para mandar ao cliente.
          </p>
        )}
        {novo?.aviso && <p className="rounded-md bg-sky-50 p-2 text-sky-900">{novo.aviso}</p>}
        {(linha || pix) && (
          <>
            {linha && <Copiavel rotulo="Linha digitável" texto={linha} />}
            {pix && <Copiavel rotulo="Pix copia e cola" texto={pix} />}
            <p className="text-xs text-[var(--texto-suave)]">
              Vence em {fmtData(novo?.vencimento ?? valido!.vencimento)}
              {valido ? ` · gerado em ${fmtDataHora(valido.emitido_em)}` : ""}. Quando o cliente pagar, o banco avisa e a baixa entra
              sozinha no Financeiro.
            </p>
          </>
        )}
        {!linha && !pix && valido && (
          <p className="text-[var(--texto-suave)]">O banco registrou o boleto, mas ainda não devolveu a linha digitável.</p>
        )}
        {!valido && !novo && podeGerar && (
          <p className="text-[var(--texto-suave)]">
            O HUB pede o boleto ao banco pelo Ledgra Link, com o CNPJ/CPF do cliente. Se a fatura já venceu, o boleto vence em 3 dias.
          </p>
        )}
        {erro && <p className="rounded-md bg-red-50 p-2 text-red-800">{erro}</p>}
      </div>
    </Modal>
  );
}
