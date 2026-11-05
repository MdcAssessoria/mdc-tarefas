// Ficha do contrato: dados, contas lançadas no Financeiro, anexos (contrato assinado, aditivos) e histórico.
"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData, fmtDataHora } from "@/lib/formato/datas";
import { abrirArquivo, fmtTamanho } from "@/lib/arquivos/armazenamento";
import { hojeISO } from "@/lib/datas";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Abas } from "@/components/ui/Abas";
import { Carregando } from "@/components/ui/Carregando";
import { Chip } from "@/components/ui/Chip";
import { BotaoVerCaminho } from "@/components/ui/BotaoVerCaminho";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { Valor } from "@/components/ui/Valor";
import { saldoDoTitulo, SITUACOES, situacaoDoTitulo } from "@/dominios/financeiro/regras";
import { lerAnexos, lerContasDoContrato, lerEventos } from "../leituras";
import { anexarArquivo } from "../repositorio";
import { SITUACOES_RECORRENTE, textoReajuste, textoVigencia } from "../regras";
import { CANAIS_ENVIO, fmtWhatsapp, NOME_DOCUMENTO, OPCOES_ENVIO, vencimentoDoMes } from "../faturamento";
import type { Recorrente } from "../tipos";

type AbaFicha = "dados" | "contas" | "anexos" | "historico";

const ICONE_EVENTO: Record<string, string> = {
  criado: "mais",
  editado: "editar",
  valor: "moeda",
  conta: "documento",
  reajuste: "tendencia",
  suspenso: "cancelar",
  reativado: "atualizar",
  encerrado: "fechar",
  renovado: "atualizar",
  aviso: "sino",
  anexo: "clipe",
  fatura: "arquivo",
};

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-[var(--borda)] py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-[var(--texto-suave)]">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function FichaContrato({
  contrato: k,
  pessoa,
  categoria,
  sistema,
  podeOperar,
  abaInicial = "dados",
  aoFechar,
  aoMudar,
  aoVerCaminho,
}: {
  contrato: Recorrente;
  pessoa: string;
  categoria: string;
  /** Nome do sistema vendido (059), quando o contrato a receber tem um. */
  sistema?: string;
  podeOperar: boolean;
  abaInicial?: AbaFicha;
  aoFechar: () => void;
  aoMudar: (msg: string) => void;
  /** Abre o "Ver caminho" do contrato (contas de cada mês e recebimentos/pagamentos). */
  aoVerCaminho?: () => void;
}) {
  const { org, clientes } = useOrg();
  const hoje = hojeISO(org.fuso);
  const [aba, setAba] = useState<AbaFicha>(abaInicial);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const contas = useConsulta(useCallback(() => (aba === "contas" ? lerContasDoContrato(k.id) : Promise.resolve(null)), [aba, k.id]));
  const anexos = useConsulta(useCallback(() => (aba === "anexos" ? lerAnexos(k.id) : Promise.resolve(null)), [aba, k.id]));
  const eventos = useConsulta(useCallback(() => (aba === "historico" ? lerEventos(k.id) : Promise.resolve(null)), [aba, k.id]));
  const s = SITUACOES_RECORRENTE[k.situacao];

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro("");
    setEnviando(true);
    try {
      for (const a of Array.from(arquivos)) await anexarArquivo(a, k);
      anexos.recarregar();
      aoMudar(arquivos.length > 1 ? `${arquivos.length} arquivos anexados.` : "Arquivo anexado.");
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  return (
    <Modal
      titulo={k.descricao}
      descricao={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tom={s.tom}>{s.nome}</Chip>
          <span>
            {k.tipo === "pagar" ? "A pagar a" : "A receber de"} {pessoa}
            {k.numero ? ` · nº ${k.numero}` : ""}
          </span>
        </span>
      }
      aoFechar={aoFechar}
      largura="4xl"
    >
      <div className="flex flex-wrap-reverse items-end gap-2">
        <div className="min-w-0 flex-1">
          <Abas
            rotulo="Partes da ficha"
            valor={aba}
            aoMudar={setAba}
            itens={[
              { id: "dados", nome: "Dados" },
              { id: "contas", nome: "Contas lançadas" },
              { id: "anexos", nome: "Anexos" },
              { id: "historico", nome: "Histórico" },
            ]}
          />
        </div>
        {aoVerCaminho && <BotaoVerCaminho aoClicar={aoVerCaminho} className="mb-1" />}
      </div>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}

      {aba === "dados" && (
        <dl>
          <Linha rotulo="Valor mensal">
            <strong>{brl(Number(k.valor))}</strong> · vence todo dia {k.dia_vencimento}
          </Linha>
          <Linha rotulo="Vigência">{textoVigencia(k)}</Linha>
          {k.vigencia_fim && <Linha rotulo="Aviso antes do fim">{k.aviso_dias} dia(s)</Linha>}
          <Linha rotulo="Contas no Financeiro">
            {k.gera_contas
              ? `Lança no dia ${k.tipo === "receber" ? k.dia_geracao : 1} em ${k.tipo === "pagar" ? "Contas a pagar" : "Contas a receber"} desde ${fmtCompetencia(k.gerar_desde)}` +
                (k.fim ? ` até ${fmtCompetencia(k.fim)}` : "") +
                (k.ultima_competencia ? ` · última: ${fmtCompetencia(k.ultima_competencia)}` : "")
              : "Não lança contas (só guarda o contrato)"}
          </Linha>
          {k.tipo === "receber" && k.gera_contas && (
            <>
              <Linha rotulo="Fatura">
                {NOME_DOCUMENTO[k.documento]} · {OPCOES_ENVIO.find((o) => o.id === k.envio)?.titulo}
                <span className="block text-xs text-[var(--texto-suave)]">
                  Gera todo dia {k.dia_geracao}; a deste mês vence em{" "}
                  {fmtData(vencimentoDoMes(hoje, "receber", k.dia_geracao, k.dia_vencimento))}
                </span>
              </Linha>
              <Linha rotulo="Envio ao cliente">
                {k.canais.length
                  ? k.canais
                      .map((c) => {
                        const nome = CANAIS_ENVIO.find((x) => x.id === c)?.nome ?? c;
                        if (c === "email") return `${nome}: ${k.email_envio}`;
                        if (c === "whatsapp") return `${nome}: ${fmtWhatsapp(k.whatsapp_envio)}`;
                        const cli = clientes.find((x) => x.id === k.cliente_carteira_id);
                        return `${nome}: ${cli ? cli.nome_fantasia || cli.razao_social : "cliente da carteira"}`;
                      })
                      .join(" · ")
                  : "Nenhum canal: baixe o PDF da fatura em Contratos › Faturas"}
              </Linha>
              {k.documento === "nfse" && (
                <Linha rotulo="Serviço (nota fiscal)">
                  {k.servico_descricao} · código {k.servico_codigo} · ISS {String(k.iss_aliquota ?? "").replace(".", ",")}%
                </Linha>
              )}
            </>
          )}
          <Linha rotulo="Reajuste">{textoReajuste(k)}</Linha>
          <Linha rotulo="Categoria">{categoria}</Linha>
          {sistema && <Linha rotulo="Sistema vendido">{sistema}</Linha>}
          {k.objeto && <Linha rotulo="Objeto">{k.objeto}</Linha>}
          {k.situacao !== "ativo" && k.situacao_motivo && (
            <Linha rotulo={k.situacao === "suspenso" ? "Motivo da suspensão" : "Motivo do encerramento"}>
              {k.situacao_motivo}
              {k.situacao_em ? ` · ${fmtDataHora(k.situacao_em)}` : ""}
            </Linha>
          )}
          {k.observacao && <Linha rotulo="Observação">{k.observacao}</Linha>}
        </dl>
      )}

      {aba === "contas" &&
        (!contas.dados ? (
          <Carregando />
        ) : !contas.dados.length ? (
          <p className="py-6 text-center text-sm text-[var(--texto-suave)]">
            Nenhuma conta lançada ainda.{" "}
            {k.gera_contas ? `A primeira sai em ${fmtCompetencia(k.gerar_desde)}.` : "Este contrato não lança contas."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela tabela-listrada w-full text-sm">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Vencimento</th>
                  <th className="text-right">Valor</th>
                  <th className="text-right">Falta</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {contas.dados.map((t) => {
                  const st = situacaoDoTitulo(t, hoje);
                  return (
                    <tr key={t.id}>
                      <td>{fmtCompetencia(t.competencia)}</td>
                      <td className="num">{fmtData(t.vencimento)}</td>
                      <td className="text-right">
                        <Valor v={Number(t.valor)} />
                      </td>
                      <td className="text-right">{st === "cancelado" ? "—" : <Valor v={saldoDoTitulo(t)} />}</td>
                      <td>
                        <Chip tom={SITUACOES[st].tom}>{SITUACOES[st].nome}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[var(--texto-suave)]">
              Para pagar, receber ou ajustar uma conta, use{" "}
              <Link className="underline" href={k.tipo === "pagar" ? "/financeiro/pagar" : "/financeiro/receber"}>
                Financeiro › {k.tipo === "pagar" ? "A pagar" : "A receber"}
              </Link>
              .
            </p>
          </div>
        ))}

      {aba === "anexos" && (
        <div className="space-y-3">
          {podeOperar && k.situacao !== "encerrado" && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={arquivoRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="sr-only"
                id={`anexo-${k.id}`}
                onChange={(e) => enviar(e.target.files)}
              />
              <label htmlFor={`anexo-${k.id}`} className={`btn cursor-pointer ${enviando ? "pointer-events-none opacity-60" : ""}`}>
                <Icone nome="clipe" className="h-4 w-4" />
                {enviando ? "Enviando…" : "Anexar arquivo"}
              </label>
              <span className="text-xs text-[var(--texto-suave)]">PDF do contrato assinado, aditivos, propostas.</span>
            </div>
          )}
          {!anexos.dados ? (
            <Carregando />
          ) : !anexos.dados.length ? (
            <p className="py-6 text-center text-sm text-[var(--texto-suave)]">
              Nenhum arquivo anexado. Guarde aqui o contrato assinado e os aditivos.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--borda)] rounded-md border border-[var(--borda)]">
              {anexos.dados.map((a) => (
                <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
                  <Icone nome="documento" className="h-5 w-5 shrink-0 text-[var(--texto-suave)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.nome}</span>
                    <span className="text-xs text-[var(--texto-suave)]">
                      {fmtDataHora(a.enviado_em)} {fmtTamanho(a.tamanho) && `· ${fmtTamanho(a.tamanho)}`}
                    </span>
                  </span>
                  <button
                    className="btn !min-h-8 !px-3"
                    onClick={() => abrirArquivo(a.caminho, a.nome).catch((e) => setErro(traduzirErro(e)))}
                  >
                    <Icone nome="baixar" className="h-4 w-4" />
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aba === "historico" &&
        (!eventos.dados ? (
          <Carregando />
        ) : !eventos.dados.length ? (
          <p className="py-6 text-center text-sm text-[var(--texto-suave)]">Sem histórico ainda.</p>
        ) : (
          <ol className="space-y-2">
            {eventos.dados.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 text-sm">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--fundo)]" aria-hidden="true">
                  <Icone nome={ICONE_EVENTO[ev.tipo] ?? "info"} className="h-4 w-4 text-[var(--marca)]" />
                </span>
                <span>
                  {ev.texto}
                  <span className="block text-xs text-[var(--texto-suave)]">
                    {fmtDataHora(ev.em)}
                    {ev.por ? "" : " · rotina automática"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ))}

      <div className="flex justify-end pt-1">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
