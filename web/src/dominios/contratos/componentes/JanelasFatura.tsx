// Janelas da tela de Faturas (043): detalhe da fatura (dados, nota fiscal, boleto e a fila de envio por canal) e
// "Gerar fatura agora" (um mês à mão, com motivo: mês que a rotina não gerou, adiantar o deste mês ou refazer depois
// de cancelar). O banco confere tudo (fin_fatura_gerar_agora) e não deixa duplicar.
"use client";

import { useMemo, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData, fmtDataHora } from "@/lib/formato/datas";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import {
  CANAIS_ENVIO,
  fmtWhatsapp,
  NOME_DOCUMENTO,
  OPCOES_ENVIO,
  SITUACOES_BOLETO,
  SITUACOES_ENVIO,
  SITUACOES_FATURA,
  SITUACOES_NFSE,
  textoConteudo,
  vencimentoDoMes,
} from "../faturamento";
import { gerarFaturaAgora } from "../repositorio";
import type { SituacaoNota } from "../nfse";
import type { EnvioDaFatura, Fatura, Recorrente } from "../tipos";
import { CampoMes } from "./ContratoFixo";

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-[var(--borda)] py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-[var(--texto-suave)]">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function DetalheFatura({
  fatura: f,
  envios,
  cliente,
  contrato,
  nomeCarteira,
  podeOperar,
  nota,
  aoEmitir,
  aoBaixar,
  aoCancelar,
  aoFechar,
}: {
  fatura: Fatura;
  envios: EnvioDaFatura[];
  cliente: string;
  contrato: string;
  nomeCarteira: (id: string) => string;
  podeOperar: boolean;
  /** Situação da nota fiscal em linguagem simples (046). */
  nota?: SituacaoNota;
  /** "Emitir nota fiscal" (só quando dá para emitir). */
  aoEmitir?: () => void;
  aoBaixar: () => void;
  aoCancelar: () => void;
  aoFechar: () => void;
}) {
  const s = SITUACOES_FATURA[f.situacao];
  const destino = (e: EnvioDaFatura) =>
    e.canal === "whatsapp" ? fmtWhatsapp(e.destino) : e.canal === "portal" ? nomeCarteira(e.destino) : e.destino;
  return (
    <Modal
      titulo={`Fatura ${f.numero}`}
      descricao={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tom={s.tom}>{s.nome}</Chip>
          <span>
            {cliente} · {contrato}
          </span>
        </span>
      }
      aoFechar={aoFechar}
      largura="2xl"
    >
      <dl>
        <Linha rotulo="Valor">
          <strong>{brl(Number(f.valor))}</strong> · vence em {fmtData(f.vencimento)}
        </Linha>
        <Linha rotulo="Mês (competência)">
          {fmtCompetencia(f.competencia)} · emitida em {fmtData(f.emissao)}
        </Linha>
        <Linha rotulo="Serviço">{f.descricao}</Linha>
        <Linha rotulo="Documento">
          {NOME_DOCUMENTO[f.documento]} · {nota ? nota.texto : SITUACOES_NFSE[f.nfse_situacao]}
          {!nota && f.nfse_numero ? ` nº ${f.nfse_numero}` : ""}
          {nota?.detalhe && (
            <span className={`block text-xs ${nota.tom === "vermelho" ? "text-[var(--perigo)]" : "text-[var(--texto-suave)]"}`}>{nota.detalhe}</span>
          )}
        </Linha>
        <Linha rotulo="O que vai ao cliente">
          {OPCOES_ENVIO.find((o) => o.id === f.envio)?.titulo} · {SITUACOES_BOLETO[f.boleto_situacao]}
        </Linha>
        {f.origem === "manual" && <Linha rotulo="Gerada à mão">{f.motivo_manual}</Linha>}
        {f.situacao === "cancelada" && (
          <Linha rotulo="Cancelada">
            {f.cancelada_em ? fmtDataHora(f.cancelada_em) : ""} · {f.cancelamento_motivo}
          </Linha>
        )}
      </dl>
      <div>
        <p className="mb-2 text-sm font-medium">Envio ao cliente</p>
        {!envios.length ? (
          <p className="rounded-md bg-[var(--fundo)] p-3 text-sm text-[var(--texto-suave)]">
            Nenhum canal marcado no contrato: baixe o PDF e mande ao cliente.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--borda)] rounded-md border border-[var(--borda)]">
            {envios.map((e) => {
              const c = CANAIS_ENVIO.find((x) => x.id === e.canal);
              const se = SITUACOES_ENVIO[e.situacao];
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <Icone nome={c?.icone ?? "enviar"} className="h-5 w-5 text-[var(--marca)]" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c?.nome}</span>
                    <span className="block truncate text-xs text-[var(--texto-suave)]">
                      {destino(e)} · {textoConteudo(e.conteudo)}
                    </span>
                  </span>
                  <Chip tom={se.tom}>{se.nome}</Chip>
                  {e.enviado_em && <span className="text-xs text-[var(--texto-suave)]">{fmtDataHora(e.enviado_em)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
        {podeOperar && f.situacao !== "cancelada" && (
          <button className="btn text-[var(--perigo)]" onClick={aoCancelar}>
            <Icone nome="cancelar" className="h-4 w-4" />
            Cancelar fatura
          </button>
        )}
        {aoEmitir && (
          <button className="btn" onClick={aoEmitir}>
            <Icone nome="enviar" className="h-4 w-4" />
            Emitir nota fiscal
          </button>
        )}
        <button className="btn-primario" onClick={aoBaixar}>
          <Icone nome="documento" className="h-4 w-4" />
          Baixar PDF
        </button>
      </div>
    </Modal>
  );
}

export function JanelaGerarFatura({
  contratos,
  nomePessoa,
  hoje,
  aoFechar,
  aoGerar,
}: {
  contratos: Recorrente[];
  nomePessoa: (k: Recorrente) => string;
  hoje: string;
  aoFechar: () => void;
  aoGerar: (msg: string) => void;
}) {
  const ativos = useMemo(() => contratos.filter((k) => k.situacao === "ativo" && k.gera_contas && k.tipo === "receber"), [contratos]);
  const [id, setId] = useState(ativos[0]?.id ?? "");
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const k = ativos.find((x) => x.id === id);
  const sugerido = k ? vencimentoDoMes(mes, "receber", k.dia_geracao, k.dia_vencimento) : "";
  const [venc, setVenc] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const anoAtual = Number(hoje.slice(0, 4));
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual];
  const vencimento = venc || sugerido;

  async function gerar() {
    setErro("");
    if (!k) return setErro("Escolha o contrato.");
    if (mes > hoje.slice(0, 7)) return setErro("Só dá para gerar até o mês atual; os próximos saem sozinhos no dia de gerar.");
    if (!motivo.trim()) return setErro("Escreva o motivo. Ele fica guardado no histórico do contrato.");
    setOcupado(true);
    try {
      const r = await gerarFaturaAgora(k.id, `${mes}-01`, motivo.trim(), venc || null);
      aoGerar(r.numero ? `Fatura ${r.numero} gerada (vence em ${fmtData(r.vencimento)}).` : "Conta do mês gerada.");
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Gerar fatura agora"
      descricao="Para o mês que não saiu (rotina parada), para adiantar a fatura deste mês ou para refazer depois de cancelar. O HUB não deixa gerar o mesmo mês duas vezes."
      aoFechar={aoFechar}
      largura="lg"
    >
      {!ativos.length ? (
        <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">Nenhum contrato a receber ativo que lance contas.</p>
      ) : (
        <>
          <label className="campo">
            <span>Contrato</span>
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setVenc("");
              }}
            >
              {ativos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.descricao} · {nomePessoa(x)}
                </option>
              ))}
            </select>
          </label>
          <CampoMes
            rotulo="Mês da fatura"
            valor={mes}
            anos={anos}
            aoMudar={(v) => {
              setMes(v);
              setVenc("");
            }}
            dica={mes < hoje.slice(0, 7) ? "Mês passado: confira o vencimento abaixo." : undefined}
          />
          <label className="campo">
            <span>Vencimento</span>
            <input type="date" value={vencimento} onChange={(e) => setVenc(e.target.value)} />
            <small className="text-xs text-[var(--texto-suave)]">
              Pela regra do contrato: {sugerido ? fmtData(sugerido) : "—"}
              {sugerido && sugerido < hoje ? ". Já passou: escolha uma data nova." : "."}
            </small>
          </label>
          <label className="campo">
            <span>Motivo</span>
            <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: a rotina não gerou fevereiro" />
          </label>
        </>
      )}
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={gerar} disabled={ocupado || !ativos.length}>
          <Icone nome="mais" className="h-4 w-4" />
          {ocupado ? "Gerando…" : "Gerar fatura"}
        </button>
      </div>
    </Modal>
  );
}
