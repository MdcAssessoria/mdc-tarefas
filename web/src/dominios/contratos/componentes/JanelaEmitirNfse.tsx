// Nota fiscal de saída (046; ajustes desde a 065): janela da NFS-e da fatura antes de mandar ao Emissor Nacional, aberta
// em Notas fiscais › Saída (e pelo "Emitir nota" das faturas, que leva para lá). À esquerda, os AJUSTES desta nota
// (serviço, NBS pela tabela oficial, texto e tributos aproximados; vazio = segue o contrato e as regras fiscais); à
// direita, o AMBIENTE em destaque, a MDC (prestador), o cliente (tomador), o valor, o ISS (no Simples vai no DAS), o que
// falta ajustar e as tentativas anteriores com o motivo de cada recusa. Emitir salva os ajustes e chama a Função Edge
// nfse-emitir; o resultado (emitida, recusada ou sem resposta certa) aparece na própria janela.
"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
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
import { CampoServico } from "@/components/ui/CampoServico";
import { emitirNfse, prepararNfse, salvarNotaSaida } from "../repositorio";
import { CampoNbsLegal } from "./CampoNbsLegal";
import { EXPLICA_AMBIENTE, formatarChaveNfse, formatarCodigoServico, formatarNbs, NOMES_AMBIENTE, REGIMES_APURACAO } from "../nfse";
import type { AmbienteNfse, MensagemNfse, PreparoNfse, ResultadoEmissaoNfse } from "../tipos";

export const SITUACAO_TENTATIVA = {
  enviando: { nome: "Enviando", tom: "azul" },
  emitida: { nome: "Emitida", tom: "verde" },
  rejeitada: { nome: "Recusada", tom: "vermelho" },
  erro: { nome: "Sem resposta certa", tom: "ambar" },
} as const;

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
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

export function Mensagens({ lista }: { lista: MensagemNfse[] }) {
  if (!lista.length) return null;
  return (
    <ul className="mt-1 space-y-1">
      {lista.map((m, i) => (
        <li key={i}>
          {m.texto}
          {(m.codigo || m.descricao) && (
            <details className="text-xs opacity-80">
              <summary className="cursor-pointer select-none underline">Ver detalhes</summary>
              <span className="block break-words font-mono">{[m.codigo, m.descricao, m.complemento].filter(Boolean).join(" · ")}</span>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Fatura da nota (o que a janela precisa: da lista de faturas ou da lista de notas de saída). */
export interface FaturaDaNota {
  id: string;
  numero: string;
  valor: number | string;
  competencia: string;
}

const pct = (v: number | null | undefined) => (v == null ? "" : String(Number(v).toFixed(2)).replace(".", ","));
const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Ajustes da nota de saída (065): começa com o que está valendo (ajuste ou padrão); igual ao padrão = grava vazio. */
function useAjustes(p: PreparoNfse | undefined) {
  const n = p?.nota;
  const inicial = {
    servico: n ? (n.servico_codigo ?? n.padrao.servico_codigo ?? "") : "",
    nbs: n ? (n.nbs ?? n.padrao.nbs ?? "") : "",
    descricao: n ? (n.descricao ?? n.padrao.descricao) : "",
    ptot: n ? pct(n.p_tot_trib_sn ?? n.padrao.p_tot_trib_sn) : "",
  };
  const chave = n ? `${n.id}|${n.atualizado_em ?? ""}` : "";
  const [estado, setEstado] = useState({ chave, v: inicial });
  // nota recarregada (salvou, emitiu): volta ao que o banco tem
  if (estado.chave !== chave) setEstado({ chave, v: inicial });
  const v = estado.v;
  const mudar = (campo: keyof typeof inicial, valor: string) => setEstado((x) => ({ ...x, v: { ...x.v, [campo]: valor } }));
  const mudou =
    !!n &&
    (digitos(v.servico) !== digitos(inicial.servico) ||
      digitos(v.nbs) !== digitos(inicial.nbs) ||
      v.descricao.trim() !== inicial.descricao.trim() ||
      v.ptot.replace(",", ".") !== inicial.ptot.replace(",", "."));
  /** O que vai para nfse_nota_salvar: igual ao padrão = vazio (segue o contrato e as regras). */
  const paraSalvar = () => {
    const pad = n!.padrao;
    return {
      id: n!.id!,
      servico_codigo: digitos(v.servico) === digitos(pad.servico_codigo) ? "" : digitos(v.servico),
      nbs: digitos(v.nbs) === digitos(pad.nbs) ? "" : digitos(v.nbs),
      descricao: v.descricao.trim() === pad.descricao.trim() ? "" : v.descricao.trim(),
      p_tot_trib_sn: v.ptot.replace(",", ".") === pct(pad.p_tot_trib_sn).replace(",", ".") ? "" : v.ptot,
    };
  };
  return { v, mudar, mudou, paraSalvar };
}

export function JanelaEmitirNfse({
  fatura: f,
  cliente,
  podeGerir,
  aoVerNota,
  aoFechar,
}: {
  fatura: FaturaDaNota;
  cliente: string;
  podeGerir: boolean;
  /** Abre o espelho da nota que acabou de sair. */
  aoVerNota: (xmlCaminho: string, chave: string, numero: string | null) => void;
  /** `mudou` = a lista precisa recarregar. */
  aoFechar: (mudou: boolean) => void;
}) {
  const consulta = useConsulta(useCallback(() => prepararNfse(f.id), [f.id]));
  const p: PreparoNfse | undefined = consulta.dados;
  const [ocupado, setOcupado] = useState<"" | "salvar" | "emitir">("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [mexeu, setMexeu] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmissaoNfse | null>(null);
  const teste = p?.ambiente === "producao_restrita";
  const aj = useAjustes(p);
  const aberta = p?.emissoes.some((e) => e.situacao === "enviando" || e.situacao === "erro") ?? false;
  const editavel = !!p?.pode_emitir && !!p.nota?.id && p.fatura.nfse_situacao !== "emitida" && resultado?.situacao !== "emitida" && !aberta;

  async function salvar() {
    await salvarNotaSaida(aj.paraSalvar());
    setMexeu(true);
  }

  async function salvarSo() {
    setErro("");
    setAviso("");
    setOcupado("salvar");
    try {
      await salvar();
      setAviso("Ajustes salvos. Confira à direita e clique em Emitir quando estiver tudo certo.");
      consulta.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado("");
    }
  }

  async function emitir() {
    setErro("");
    setAviso("");
    setOcupado("emitir");
    try {
      if (editavel && aj.mudou) await salvar();
      const r = await emitirNfse(f.id);
      setResultado(r);
      setMexeu(true);
      consulta.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
      consulta.recarregar();
    } finally {
      setOcupado("");
    }
  }

  const regime = REGIMES_APURACAO.find((r) => r.id === p?.dps.prestador.regApTribSN)?.nome;
  const iss = p?.iss;
  const pad = p?.nota?.padrao;

  return (
    <Modal
      titulo={`Nota fiscal de saída · Fatura ${f.numero}`}
      descricao={`${cliente} · ${brl(Number(f.valor))} · ${fmtCompetencia(f.competencia)}. Ajuste o que precisar à esquerda e confira à direita: é isso que vai para o Emissor Nacional.`}
      aoFechar={() => aoFechar(mexeu)}
      largura="6xl"
      celularCheio
      avisoRodape={
        erro ? (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        ) : aviso ? (
          <p role="status" className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">
            {aviso}
          </p>
        ) : null
      }
      rodape={
        <>
          {p?.pode_emitir && resultado?.situacao !== "emitida" && p.fatura.nfse_situacao !== "emitida" && (
            <button className="btn-primario" onClick={emitir} disabled={!!ocupado || !p.pronto}>
              <Icone nome="enviar" className="h-4 w-4" />
              {ocupado === "emitir" ? "Enviando ao Emissor…" : teste ? "Emitir nota de teste" : "Emitir nota fiscal"}
            </button>
          )}
          {editavel && aj.mudou && (
            <button className="btn" onClick={salvarSo} disabled={!!ocupado}>
              <Icone nome="check" className="h-4 w-4" />
              {ocupado === "salvar" ? "Salvando…" : "Salvar ajustes"}
            </button>
          )}
          <button className="btn" onClick={() => aoFechar(mexeu)}>
            <Icone nome="voltar" className="h-4 w-4" />
            {resultado ? "Fechar" : "Voltar"}
          </button>
        </>
      }
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
                  <p className="font-semibold">O Emissor Nacional recusou a nota. Ajuste à esquerda e tente de novo:</p>
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

          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="min-w-0 space-y-3 rounded-xl border border-[var(--borda)] p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-[var(--marca)]">
                <Icone nome="editar" className="h-4 w-4 text-[var(--destaque-escuro)]" />
                Ajustes desta nota
              </legend>
              {!p.nota?.id ? (
                <p className="text-sm text-[var(--texto-suave)]">Esta fatura não emite nota fiscal.</p>
              ) : !editavel ? (
                <p className="text-sm text-[var(--texto-suave)]">
                  {p.fatura.nfse_situacao === "emitida" || resultado?.situacao === "emitida"
                    ? "Nota emitida: os dados não mudam mais."
                    : aberta
                      ? "A nota está sendo enviada ou ficou sem resposta certa: clique em Emitir para o HUB conferir antes de mudar os dados."
                      : "Só quem opera o módulo Contratos ajusta a nota."}
                </p>
              ) : (
                <p className="text-xs text-[var(--texto-suave)]">
                  Vale só para esta nota. Deixe como está para seguir o contrato e as regras fiscais.
                </p>
              )}
              <fieldset disabled={!editavel || !!ocupado} className="min-w-0 space-y-3">
                <CampoServico
                  rotulo="Serviço (código de tributação nacional)"
                  valor={aj.v.servico}
                  aoMudar={(c) => aj.mudar("servico", c)}
                />
                <CampoNbsLegal
                  servico={aj.v.servico}
                  valor={aj.v.nbs}
                  aoMudar={(x) => aj.mudar("nbs", x)}
                  desabilitado={!editavel}
                  rotulo="NBS"
                />
                <label className="campo">
                  <span>Texto da nota (discriminação do serviço)</span>
                  <textarea rows={4} maxLength={2000} value={aj.v.descricao} onChange={(e) => aj.mudar("descricao", e.target.value)} />
                  {pad && aj.v.descricao.trim() !== pad.descricao.trim() && (
                    <button
                      type="button"
                      className="btn !min-h-8 mt-1 self-start !px-3 text-xs"
                      onClick={() => aj.mudar("descricao", pad.descricao)}
                    >
                      <Icone nome="atualizar" className="h-4 w-4" />
                      Voltar ao texto do contrato
                    </button>
                  )}
                </label>
                <label className="campo">
                  <span>Tributos aproximados do Simples (%)</span>
                  <input inputMode="decimal" value={aj.v.ptot} onChange={(e) => aj.mudar("ptot", e.target.value)} placeholder="Ex.: 6,00" />
                  <small className="text-xs text-[var(--texto-suave)]">
                    Padrão das Regras fiscais: {pad?.p_tot_trib_sn != null ? `${pct(pad.p_tot_trib_sn)}%` : "não informado"} (Lei
                    12.741/2012).
                  </small>
                </label>
              </fieldset>
              {editavel && aj.mudou && (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                  Ajustes ainda não salvos. Emitir salva antes de enviar; o resumo à direita mostra o que está gravado.
                </p>
              )}
            </fieldset>

            <div className="min-w-0 space-y-3">
              {p.pendencias.length > 0 && (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Falta ajustar antes de emitir:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {p.pendencias.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  {podeGerir && p.pendencias.some((x) => /parâmetros|Configure a emissão|Regras fiscais/.test(x)) && (
                    <Link className="btn mt-2" href="/contratos/nota-fiscal">
                      <Icone nome="engrenagem" className="h-4 w-4" />
                      Abrir as regras fiscais
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
                <Linha rotulo="Códigos">
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
                  <span className="block text-xs text-[var(--texto-suave)]">
                    O valor é o da fatura; para mudar, cancele e gere a fatura de novo.
                  </span>
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
                  {p.dps.valores.pTotTribSN != null ? `${pct(p.dps.valores.pTotTribSN)}% (Simples Nacional, Lei 12.741/2012)` : "—"}
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
                              <button
                                className="btn !min-h-8 !px-3"
                                onClick={() => aoVerNota(e.xml_caminho!, e.chave_acesso!, e.numero_nfse)}
                              >
                                <Icone nome="olho" className="h-4 w-4" />
                                Ver a nota
                              </button>
                            )}
                          </span>
                          {e.situacao !== "emitida" &&
                            (e.mensagens?.length ? <Mensagens lista={e.mensagens} /> : e.mensagem && <p>{e.mensagem}</p>)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {!p.pode_emitir && (
                <p className="text-sm text-[var(--texto-suave)]">
                  Só quem opera o módulo Contratos emite a nota. Se precisar, peça ao administrador.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
