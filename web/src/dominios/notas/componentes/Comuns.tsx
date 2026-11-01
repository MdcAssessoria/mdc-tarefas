// Peças repetidas nas telas de Entradas: nomes em linguagem simples, etiqueta de situação, gráfico de barras que filtra
// ao clicar e o botão de baixar o XML.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { formatarDocumento } from "@/dominios/financeiro/regras";
import { enderecoDoXml } from "../leituras";
import { SITUACOES_PAINEL } from "../regras";
import type { SituacaoPainel } from "../regras";
import { EVENTOS } from "../sefaz";
import type { CodigoManifestacao } from "../sefaz";
import type { Nota } from "../tipos";

export const nomeModelo = (m: string) => ({ "55": "NF-e", "65": "NFC-e", "57": "CT-e", nfse: "NFS-e" })[m] ?? "Outro";

export const ORIGENS_NOTA: Record<Nota["origem"], string> = {
  dfe: "SEFAZ (busca automática)",
  adn: "NFS-e Nacional (busca automática)",
  upload: "XML enviado",
};

export const nomeManifestacao = (m: CodigoManifestacao | null) => (m ? EVENTOS[m].nome : "Sem resposta");

/** Nome do tipo de evento (manifestação, cancelamento, carta de correção…). */
export function nomeEvento(tp: string): string {
  const man = Object.values(EVENTOS).find((e) => e.tp === tp);
  if (man) return man.nome;
  return (
    (
      { "110111": "Cancelamento pelo fornecedor", "110112": "Cancelamento por substituição", "110110": "Carta de correção" } as Record<
        string,
        string
      >
    )[tp] ?? `Evento ${tp}`
  );
}

export const fornecedorDa = (n: Pick<Nota, "emitente_nome" | "emitente_doc">) =>
  n.emitente_nome ?? (n.emitente_doc ? formatarDocumento(n.emitente_doc) : "Fornecedor não informado");

export function ChipSituacao({ id, dias }: { id: SituacaoPainel; dias?: number | null }) {
  const s = SITUACOES_PAINEL[id];
  return (
    <span className={`chip whitespace-nowrap ${s.tom}`} title={s.dica}>
      {s.nome}
      {(id === "aguardando" || id === "prazo_vencendo") && dias != null ? ` · ${dias} dia(s)` : ""}
    </span>
  );
}

/** Barras horizontais; clicar numa barra filtra a tabela (clicar de novo limpa). */
export function BarrasClicaveis({
  itens,
  ativo,
  aoClicar,
  cor = "#C0892A",
}: {
  itens: { chave: string; rotulo: string; valor: number; detalhe?: string }[];
  ativo?: string | null;
  aoClicar?: (chave: string | null) => void;
  cor?: string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div className="space-y-1.5">
      {itens.map((i) => (
        <button
          type="button"
          key={i.chave}
          onClick={() => aoClicar?.(ativo === i.chave ? null : i.chave)}
          aria-pressed={ativo === i.chave}
          className={`grid w-full grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 rounded px-1 text-left text-sm hover:bg-[var(--fundo)] ${
            ativo === i.chave ? "ring-2 ring-[var(--destaque-escuro)]" : ""
          } ${ativo && ativo !== i.chave ? "opacity-50" : ""}`}
          title={`${i.rotulo}: ${brl(i.valor)}${i.detalhe ? ` · ${i.detalhe}` : ""}`}
        >
          <span className="truncate text-neutral-700">{i.rotulo}</span>
          <span className="h-3.5 rounded bg-[var(--fundo)]">
            <span className="block h-3.5 rounded" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums text-neutral-600">{brl(i.valor)}</span>
        </button>
      ))}
    </div>
  );
}

export function BotaoXml({
  caminho,
  avisar,
  compacto,
}: {
  caminho: string | null;
  avisar: (t: string, tom?: "erro") => void;
  compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  if (!caminho) return null;
  return (
    <button
      className={compacto ? "block w-full px-3 py-1.5 text-left hover:bg-neutral-50" : "btn"}
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        try {
          window.open(await enderecoDoXml(caminho), "_blank", "noopener");
        } catch (e) {
          avisar(traduzirErro(e), "erro");
        } finally {
          setOcupado(false);
        }
      }}
    >
      {ocupado ? "Preparando…" : "Baixar XML"}
    </button>
  );
}
