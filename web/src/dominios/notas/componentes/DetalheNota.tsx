// Detalhe de uma nota: dados principais, prazos da manifestação, itens com impostos, histórico de eventos (com
// protocolo e código da SEFAZ), o XML para baixar e o botão "Ver a nota" (espelho DANFE/DANFSe em EspelhoNota).
"use client";

import { useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { Icone } from "@/components/ui/Icone";
import { BotaoVerCaminho } from "@/components/ui/BotaoVerCaminho";
import { useConsulta } from "@/lib/useConsulta";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { formatarDocumento } from "@/lib/documento";
import { lerItensDasNotas } from "../leituras";
import { prazosDaNota, temManifestacao } from "../regras";
import { tipoEntrada } from "../tiposEntrada";
import type { EventoNota, Nota } from "../tipos";
import { BotaoXml, fornecedorDa, nomeEvento, nomeManifestacao, nomeModelo, ORIGENS_NOTA } from "./Comuns";

export function DetalheNota({
  nota,
  eventos,
  avisar,
  aoFechar,
  aoVerNota,
  aoVerCaminho,
}: {
  nota: Nota;
  eventos: EventoNota[];
  avisar: (t: string, tom?: "erro") => void;
  aoFechar: () => void;
  /** Abre o espelho da nota (layout DANFE/DANFSe com PDF). */
  aoVerNota?: () => void;
  /** Abre o "Ver caminho" da nota (pedido, contas a pagar, pagamentos e estoque). */
  aoVerCaminho?: () => void;
}) {
  const itens = useConsulta(useCallback(() => lerItensDasNotas([nota.id]), [nota.id]));
  const prazos = prazosDaNota(nota.autorizacao ?? nota.emissao);
  const meus = eventos.filter((e) => e.nota_id === nota.id || e.chave === nota.chave);
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <>
      <dt className="text-neutral-500">{rotulo}</dt>
      <dd>{valor}</dd>
    </>
  );
  return (
    <Modal
      titulo={`${nomeModelo(nota.modelo)} ${nota.numero ?? ""} · ${fornecedorDa(nota)}`}
      descricao={`Chave ${nota.chave}`}
      aoFechar={aoFechar}
      largura="2xl"
    >
      <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
        {linha("Fornecedor", `${fornecedorDa(nota)}${nota.emitente_doc ? ` · ${formatarDocumento(nota.emitente_doc)}` : ""}`)}
        {linha("Emissão", fmtDataLocal(nota.emissao))}
        {linha("Valor", <span className="font-medium">{brl(Number(nota.valor_total))}</span>)}
        {linha("Origem", ORIGENS_NOTA[nota.origem])}
        {nota.conteudo === "resumo" && linha("Conteúdo", "Só o resumo: o XML completo chega depois da ciência ou da confirmação.")}
        {temManifestacao(nota) &&
          linha(
            "Resposta à SEFAZ",
            `${nomeManifestacao(nota.manifestacao)}${nota.manifestacao_protocolo ? ` · protocolo ${nota.manifestacao_protocolo}` : ""}`,
          )}
        {temManifestacao(nota) &&
          prazos &&
          linha(
            "Prazos",
            `ciência até ${fmtData(prazos.ciencia)}; confirmar ou recusar até ${fmtData(prazos.conclusiva)} (${prazos.fonte})`,
          )}
        {nota.processada && linha("Lançada como", `${tipoEntrada(nota.tipo_entrada)?.nome ?? "—"} em ${fmtDataLocal(nota.processada_em)}`)}
      </dl>

      <h3 className="pt-2 text-sm font-semibold">Itens</h3>
      {itens.carregando && !itens.dados ? (
        <Carregando />
      ) : !itens.dados?.length ? (
        <p className="text-sm text-neutral-500">Sem itens (resumo da SEFAZ). Dê ciência ou confirme para receber o XML completo.</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded border border-[var(--borda)]">
          <table className="tabela text-xs">
            <thead>
              <tr>
                <th>#</th>
                <th>Descrição</th>
                <th>NCM</th>
                <th>CFOP</th>
                <th className="text-right">Qtd.</th>
                <th className="text-right">Valor</th>
                <th className="text-right">ICMS</th>
                <th className="text-right">IPI</th>
                <th className="text-right">PIS/COFINS</th>
              </tr>
            </thead>
            <tbody>
              {itens.dados.map((i) => (
                <tr key={i.id}>
                  <td>{i.numero}</td>
                  <td className="min-w-48">
                    {i.descricao}
                    {i.codigo && <span className="block text-neutral-500">cód. {i.codigo}</span>}
                  </td>
                  <td>{i.ncm}</td>
                  <td>{i.cfop}</td>
                  <td className="text-right tabular-nums">
                    {Number(i.quantidade).toLocaleString("pt-BR")} {i.unidade}
                  </td>
                  <td className="text-right tabular-nums">{brl(Number(i.valor_total))}</td>
                  <td className="text-right tabular-nums">{brl(Number(i.icms_valor) + Number(i.icms_st_valor))}</td>
                  <td className="text-right tabular-nums">{brl(Number(i.ipi_valor))}</td>
                  <td className="text-right tabular-nums">{brl(Number(i.pis_valor) + Number(i.cofins_valor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="pt-2 text-sm font-semibold">Histórico na SEFAZ</h3>
      {!meus.length ? (
        <p className="text-sm text-neutral-500">Nenhum evento ainda.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {meus.map((e) => {
            const aceito = ["135", "136", "155"].includes(e.cstat ?? "") || (!e.cstat && !!e.protocolo);
            return (
              <li key={e.id} className={`rounded-md p-2 ${aceito ? "bg-neutral-50" : "bg-red-50 text-red-800"}`}>
                <span className="font-medium">{nomeEvento(e.tp_evento)}</span> · {fmtDataLocal(e.registrado_em ?? e.em)}
                {e.protocolo && ` · protocolo ${e.protocolo}`}
                {!aceito && ` · não aceito: ${e.motivo ?? ""}${e.cstat ? ` (código ${e.cstat})` : ""}`}
                {e.justificativa && <span className="block text-xs text-neutral-600">Motivo: {e.justificativa}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {aoVerCaminho && <BotaoVerCaminho aoClicar={aoVerCaminho} className="!min-h-10" />}
        {aoVerNota && nota.xml_caminho && (
          <button className="btn" onClick={aoVerNota}>
            <Icone nome="olho" className="h-4 w-4" />
            Ver a nota
          </button>
        )}
        <BotaoXml caminho={nota.xml_caminho} avisar={avisar} />
        <button className="btn-primario" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
