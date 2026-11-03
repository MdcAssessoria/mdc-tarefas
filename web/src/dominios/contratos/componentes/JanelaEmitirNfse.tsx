// "Emitir nota fiscal" (046): janela de conferência da NFS-e da fatura antes de mandar ao Emissor Nacional. Mostra o
// AMBIENTE em destaque (teste sem valor fiscal × produção), a MDC (prestador), o cliente (tomador), o serviço com os
// códigos, o valor e o ISS (no Simples vai no DAS, não na nota), o que falta ajustar e as tentativas anteriores com o
// motivo de cada recusa. Emitir chama a Função Edge nfse-emitir; o resultado (emitida, recusada ou sem resposta certa)
// aparece na própria janela.
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData, fmtDataHora } from "@/lib/formato/datas";
import { formatarDocumento } from "@/lib/documento";
import { Carregando } from "@/components/ui/Carregando";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { emitirNfse, prepararNfse } from "../repositorio";
import { EXPLICA_AMBIENTE, formatarChaveNfse, formatarCodigoServico, formatarNbs, NOMES_AMBIENTE, REGIMES_APURACAO } from "../nfse";
import type { AmbienteNfse, Fatura, MensagemNfse, PreparoNfse, ResultadoEmissaoNfse } from "../tipos";

const SITUACAO_TENTATIVA = {
  enviando: { nome: "Enviando", tom: "azul" },
  emitida: { nome: "Emitida", tom: "verde" },
  rejeitada: { nome: "Recusada", tom: "vermelho" },
  erro: { nome: "Sem resposta certa", tom: "ambar" },
} as const;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-[var(--borda)] py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-[var(--texto-suave)]">{rotulo}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/** Faixa do ambiente: âmbar no teste, azul-marca na produção. Sempre à vista, no topo. */
export function FaixaAmbiente({ ambiente }: { ambiente: AmbienteNfse | null }) {
  if (!ambiente) return null;
  const teste = ambiente === "producao_restrita";
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border-2 p-3 text-sm ${
        teste ? "border-amber-400 bg-amber-50 text-amber-900" : "border-[var(--marca)] bg-[var(--fundo)] text-[var(--marca)]"
      }`}
    >
      <Icone nome={teste ? "alerta" : "escudo"} className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        <strong className="block text-base">{NOMES_AMBIENTE[ambiente]}</strong>
        {EXPLICA_AMBIENTE[ambiente]}
      </p>
    </div>
  );
}

function Mensagens({ lista }: { lista: MensagemNfse[] }) {
  if (!lista.length) return null;
  return (
    <ul className="mt-1 space-y-1">
      {lista.map((m, i) => (
        <li key={i}>
          {m.texto}
          {(m.codigo || m.descricao) && (
            <details className="text-xs opacity-80">
              <summary className="cursor-pointer select-none underline">Ver detalhes</summary>
              <span className="block break-words font-mono">
                {[m.codigo, m.descricao, m.complemento].filter(Boolean).join(" · ")}
              </span>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

export function JanelaEmitirNfse({
  fatura: f,
  cliente,
  podeGerir,
  aoVerNota,
  aoFechar,
}: {
  fatura: Fatura;
  cliente: string;
  podeGerir: boolean;
  /** Abre o espelho da nota que acabou de sair. */
  aoVerNota: (xmlCaminho: string, chave: string, numero: string | null) => void;
  /** `mudou` = a lista precisa recarregar. */
  aoFechar: (mudou: boolean) => void;
}) {
  const consulta = useConsulta(useCallback(() => prepararNfse(f.id), [f.id]));
  const p: PreparoNfse | undefined = consulta.dados;
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoEmissaoNfse | null>(null);
  const teste = p?.ambiente === "producao_restrita";

  async function emitir() {
    setErro("");
    setOcupado(true);
    try {
      const r = await emitirNfse(f.id);
      setResultado(r);
      consulta.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const regime = REGIMES_APURACAO.find((r) => r.id === p?.dps.prestador.regApTribSN)?.nome;
  const iss = p?.iss;

  return (
    <Modal
      titulo={`Emitir nota fiscal · Fatura ${f.numero}`}
      descricao={`${cliente} · ${brl(Number(f.valor))} · ${fmtCompetencia(f.competencia)}. Confira os dados: é isso que vai para o Emissor Nacional.`}
      aoFechar={() => aoFechar(!!resultado)}
      largura="2xl"
      celularCheio
    >
      {consulta.erro ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>
      ) : !p ? (
        <Carregando />
      ) : (
        <>
          <FaixaAmbiente ambiente={p.ambiente} />

          {resultado && (
            <div
              role="status"
              className={`rounded-xl border p-3 text-sm ${
                resultado.situacao === "emitida"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : resultado.situacao === "rejeitada"
                    ? "border-red-300 bg-red-50 text-red-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              {resultado.situacao === "emitida" ? (
                <>
                  <p className="font-semibold">
                    {resultado.teste ? "Nota de teste" : "Nota fiscal"} nº {resultado.numero ?? "—"} emitida
                    {resultado.recuperada ? " (o HUB achou a nota da tentativa anterior)" : ""}.
                  </p>
                  {resultado.chave && <p className="break-all font-mono text-xs">Chave: {formatarChaveNfse(resultado.chave)}</p>}
                  <p className="mt-1">
                    {resultado.teste
                      ? "Sem valor fiscal: a fatura continua esperando a nota de verdade."
                      : "A fatura foi marcada com a nota e o envio pelo Portal do Cliente foi liberado."}
                  </p>
                  {resultado.mensagem && <p className="mt-1">{resultado.mensagem}</p>}
                  {resultado.xml_caminho && resultado.chave && (
                    <button
                      className="btn mt-2"
                      onClick={() => aoVerNota(resultado.xml_caminho!, resultado.chave!, resultado.numero ?? null)}
                    >
                      <Icone nome="olho" className="h-4 w-4" />
                      Ver a nota
                    </button>
                  )}
                </>
              ) : resultado.situacao === "rejeitada" ? (
                <>
                  <p className="font-semibold">O Emissor Nacional recusou a nota. Corrija e tente de novo:</p>
                  <Mensagens lista={resultado.mensagens} />
                </>
              ) : (
                <>
                  <p className="font-semibold">Sem resposta certa do Emissor Nacional.</p>
                  <p>{resultado.mensagem}</p>
                  <p className="mt-1">Na próxima tentativa o HUB confere primeiro se a nota saiu, para não emitir duas vezes.</p>
                </>
              )}
            </div>
          )}

          {p.pendencias.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Falta ajustar antes de emitir:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {p.pendencias.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {podeGerir && p.pendencias.some((x) => /parâmetros|Configure a emissão/.test(x)) && (
                <Link className="btn mt-2" href="/contratos/nota-fiscal">
                  <Icone nome="engrenagem" className="h-4 w-4" />
                  Abrir os parâmetros da nota fiscal
                </Link>
              )}
            </div>
          )}

          <dl>
            <Linha rotulo="Quem emite (prestador)">
              <strong>{p.dps.prestador.nome ?? "MDC"}</strong> · CNPJ {formatarDocumento(p.dps.prestador.cnpj)}
              {p.dps.prestador.im ? ` · Inscrição municipal ${p.dps.prestador.im}` : " · sem inscrição municipal"}
              <span className="block text-xs text-[var(--texto-suave)]">Simples Nacional (ME/EPP){regime ? ` · ${regime}` : ""}</span>
            </Linha>
            <Linha rotulo="Cliente (tomador)">
              <strong>{p.dps.tomador.nome ?? cliente}</strong>
              {p.dps.tomador.documento ? ` · ${formatarDocumento(p.dps.tomador.documento)}` : " · sem CNPJ/CPF"}
              {p.dps.tomador.email && <span className="block text-xs text-[var(--texto-suave)]">{p.dps.tomador.email}</span>}
            </Linha>
            <Linha rotulo="Serviço">
              <span className="whitespace-pre-line">{p.dps.servico.descricao}</span>
            </Linha>
            <Linha rotulo="Código do serviço">
              <abbr title="Código de tributação nacional (item e subitem da LC 116/2003 + desdobro nacional)" className="no-underline">
                {formatarCodigoServico(p.dps.servico.cTribNac) || "—"}
              </abbr>
              {" · "}
              <abbr title="Nomenclatura Brasileira de Serviços" className="no-underline">
                NBS {formatarNbs(p.dps.servico.cNBS) || "—"}
              </abbr>
              {p.dps.cLocEmi ? ` · município ${p.dps.cLocEmi}` : ""}
            </Linha>
            <Linha rotulo="Valor da nota">
              <strong>{brl(Number(p.dps.valores.vServ))}</strong> · competência {fmtCompetencia(p.dps.dCompet)} · fatura vence em{" "}
              {fmtData(p.fatura.vencimento)}
            </Linha>
            <Linha rotulo="ISS">
              Recolhido no DAS do Simples Nacional, sem retenção pelo cliente: a alíquota não vai destacada na nota.
              {iss?.aliquota_referencia != null && (
                <span className="block text-xs text-[var(--texto-suave)]">
                  Referência do contrato: {String(iss.aliquota_referencia).replace(".", ",")}% ≈ {brl(Number(iss.valor_estimado ?? 0))}
                </span>
              )}
            </Linha>
            <Linha rotulo="Tributos aproximados">
              {p.dps.valores.pTotTribSN != null ? `${String(Number(p.dps.valores.pTotTribSN).toFixed(2)).replace(".", ",")}% (Simples Nacional, Lei 12.741/2012)` : "—"}
            </Linha>
            <Linha rotulo="Número da DPS">
              Série {p.dps.serie ?? "—"} · próximo número {p.dps.proximo_ndps}
              <span className="block text-xs text-[var(--texto-suave)]">
                DPS é a declaração que o HUB manda; o Emissor devolve a NFS-e com número e chave de acesso.
              </span>
            </Linha>
          </dl>

          {p.emissoes.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Tentativas anteriores</p>
              <ul className="divide-y divide-[var(--borda)] rounded-md border border-[var(--borda)]">
                {p.emissoes.map((e) => {
                  const s = SITUACAO_TENTATIVA[e.situacao];
                  return (
                    <li key={e.id} className="space-y-1 p-3 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <Chip tom={s.tom}>{s.nome}</Chip>
                        <span>
                          DPS {e.ndps} · {e.ambiente === "producao" ? "produção" : "teste"} · {fmtDataHora(e.enviado_em)}
                          {e.tentativas > 1 ? ` · ${e.tentativas} tentativas` : ""}
                          {e.numero_nfse ? ` · nota nº ${e.numero_nfse}` : ""}
                        </span>
                        {e.situacao === "emitida" && e.xml_caminho && e.chave_acesso && (
                          <button className="btn !min-h-8 !px-3" onClick={() => aoVerNota(e.xml_caminho!, e.chave_acesso!, e.numero_nfse)}>
                            <Icone nome="olho" className="h-4 w-4" />
                            Ver a nota
                          </button>
                        )}
                      </span>
                      {e.situacao !== "emitida" && (e.mensagens?.length ? <Mensagens lista={e.mensagens} /> : e.mensagem && <p>{e.mensagem}</p>)}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
          {!p.pode_emitir && (
            <p className="text-sm text-[var(--texto-suave)]">Só quem opera o módulo Contratos emite a nota. Se precisar, peça ao administrador.</p>
          )}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {p?.pode_emitir && resultado?.situacao !== "emitida" && (
          <button className="btn-primario" onClick={emitir} disabled={ocupado || !p.pronto}>
            <Icone nome="enviar" className="h-4 w-4" />
            {ocupado ? "Enviando ao Emissor…" : teste ? "Emitir nota de teste" : "Emitir nota fiscal"}
          </button>
        )}
        <button className="btn" onClick={() => aoFechar(!!resultado)}>
          {resultado ? "Fechar" : "Voltar"}
        </button>
      </div>
    </Modal>
  );
}
