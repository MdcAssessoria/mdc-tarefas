// Comercial › Ficha da oportunidade: cabeçalho com contato e ações, etapas do funil, e duas abas —
// "Acompanhamento" (dados + histórico) e "Proposta e contrato". As partes moram em dominios/comercial/componentes/ficha.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { fmtData, fmtDataLocal } from "@/lib/formato/datas";
import { Abas } from "@/components/ui/Abas";
import { Aviso, useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { ETAPAS } from "@/dominios/comercial/crm";
import { lerFicha } from "@/dominios/comercial/leituras";
import { SITUACOES_CONTRATO, linkWhatsapp, nomeOrigem, retornoAtrasado } from "@/dominios/comercial/rotulos";
import { useAcoesOportunidade } from "@/dominios/comercial/componentes/useAcoesOportunidade";
import { DadosOportunidade } from "@/dominios/comercial/componentes/ficha/DadosOportunidade";
import { HistoricoOportunidade } from "@/dominios/comercial/componentes/ficha/HistoricoOportunidade";
import { SecaoContrato } from "@/dominios/comercial/componentes/ficha/SecaoContrato";
import { hojeISO } from "@/lib/datas";

export default function PaginaOportunidade() {
  return <Ficha />;
}

type Aba = "acompanhamento" | "contrato";

function Ficha() {
  const { id } = useParams<{ id: string }>();
  const { org, membros, pode } = useOrg();
  const podeOperar = pode("comercial", "operar");
  const podeGerir = pode("comercial", "gerir");
  const { aviso, mostrar } = useAviso();
  const [aba, setAba] = useState<Aba>("acompanhamento");
  const consulta = useConsulta(useCallback(() => lerFicha(id, org.id), [id, org.id]));
  const acoes = useAcoesOportunidade(consulta.recarregar, mostrar);
  const hoje = hojeISO(org.fuso);

  const voltar = (
    <Link href="/comercial" className="inline-flex items-center gap-1 text-sm text-[var(--texto-suave)] hover:underline">
      <Icone nome="voltar" className="h-4 w-4" />
      Voltar ao funil
    </Link>
  );

  if (!consulta.dados)
    return consulta.erro ? (
      <div className="space-y-3">
        {voltar}
        <Aviso>{consulta.erro}</Aviso>
      </div>
    ) : (
      <Esqueleto indicadores={0} linhas={8} />
    );

  const { o, atividades, contratos, modelo } = consulta.dados;
  const zap = linkWhatsapp(o.whatsapp);
  const etapaIdx = ETAPAS.findIndex((e) => e.id === o.etapa);
  const ultimo = contratos[0];
  const responsavel = membros.find((m) => m.user_id === o.responsavel_id)?.nome;
  const autorNome = (u: string | null) => membros.find((m) => m.user_id === u)?.nome ?? "";

  return (
    <div className="space-y-4">
      {voltar}
      <CabecalhoPagina
        titulo={o.empresa}
        descricao={
          <>
            {nomeOrigem(o.origem)} · entrou em {fmtDataLocal(o.criado_em)}
            {responsavel ? ` · responsável: ${responsavel}` : " · sem responsável"}
            {o.proximo_contato && (
              <span className={retornoAtrasado(o, hoje) ? "font-medium text-[var(--perigo)]" : ""}>
                {" "}
                · retorno {fmtData(o.proximo_contato)}
              </span>
            )}
          </>
        }
        acoes={
          <>
            {zap && (
              <a className="btn" href={zap} target="_blank" rel="noopener noreferrer">
                <Icone nome="chat" className="h-4 w-4" />
                WhatsApp
              </a>
            )}
            {o.email && (
              <a className="btn" href={`mailto:${o.email}`}>
                <Icone nome="enviar" className="h-4 w-4" />
                E-mail
              </a>
            )}
            {podeOperar && !o.arquivado_em && (
              <button className="btn" onClick={() => acoes.arquivar([o])}>
                <Icone nome="caixa" className="h-4 w-4" />
                Arquivar
              </button>
            )}
            {podeOperar && !o.cliente_id && !o.arquivado_em && (
              <button className="btn-primario" onClick={() => acoes.virarCliente(o)}>
                <Icone nome="check" className="h-4 w-4" />
                Fechou: virar cliente
              </button>
            )}
          </>
        }
      />

      {aviso}
      {acoes.janela}
      {o.cliente_id && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <Icone nome="check" className="h-4 w-4 shrink-0" />
          Já é cliente da carteira. Complete o código do Domínio e os responsáveis em Configurações.
        </p>
      )}
      {o.arquivado_em && (
        <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center">
          <span className="flex items-start gap-2">
            <Icone nome="caixa" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Arquivada em {fmtDataLocal(o.arquivado_em)}
              {o.motivo_arquivo ? ` (${o.motivo_arquivo})` : ""}. Não aparece no funil.
            </span>
          </span>
          {podeOperar && (
            <button className="btn sm:ml-auto" onClick={() => acoes.restaurar([o])}>
              <Icone nome="atualizar" className="h-4 w-4" />
              Voltar ao funil
            </button>
          )}
        </div>
      )}

      <nav aria-label="Etapa do funil" className="cartao p-3">
        <p className="mb-2 text-xs text-[var(--texto-suave)]">{podeOperar ? "Etapa do funil (toque para mudar):" : "Etapa do funil:"}</p>
        <ol className="flex flex-wrap gap-1.5">
          {ETAPAS.map((e, k) => {
            const atual = e.id === o.etapa;
            const feita = k < etapaIdx && o.etapa !== "perdido";
            return (
              <li key={e.id}>
                <button
                  disabled={!podeOperar}
                  aria-current={atual ? "step" : undefined}
                  title={e.dica}
                  onClick={() => acoes.mover(o, e.id)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-default ${
                    atual
                      ? e.id === "perdido"
                        ? "border-red-300 bg-red-50 font-medium text-red-800"
                        : "border-[var(--marca)] bg-[var(--marca)] font-medium text-white"
                      : feita
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 enabled:hover:border-emerald-400"
                        : "border-[var(--borda)] bg-white text-[var(--texto-suave)] enabled:hover:border-[var(--destaque-escuro)]"
                  }`}
                >
                  {feita && <Icone nome="check" className="h-3.5 w-3.5" />}
                  {e.nome}
                </button>
              </li>
            );
          })}
        </ol>
        {o.etapa === "perdido" && o.motivo_perda && <p className="mt-2 text-sm text-red-800">Motivo da perda: {o.motivo_perda}</p>}
      </nav>

      <Abas<Aba>
        rotulo="Partes da ficha"
        valor={aba}
        aoMudar={setAba}
        itens={[
          { id: "acompanhamento", nome: `Acompanhamento (${atividades.length})` },
          {
            id: "contrato",
            nome: (
              <span className="flex items-center gap-2">
                Proposta e contrato
                {ultimo && (
                  <span className="hidden sm:inline-flex">
                    <Chip tom={SITUACOES_CONTRATO[ultimo.status].tom}>{SITUACOES_CONTRATO[ultimo.status].nome}</Chip>
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />

      {aba === "acompanhamento" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <DadosOportunidade
            key={o.atualizado_em}
            o={o}
            podeOperar={podeOperar}
            membros={membros}
            aoSalvar={(msg, tom) => {
              mostrar(msg, tom);
              if (tom !== "erro") consulta.recarregar();
            }}
          />
          {/* no celular o histórico (o que mais se usa) vem antes dos dados */}
          <div className="order-first min-w-0 lg:order-none">
            <HistoricoOportunidade
              o={o}
              atividades={atividades}
              podeOperar={podeOperar}
              autorNome={autorNome}
              aoMudar={consulta.recarregar}
              avisar={mostrar}
            />
          </div>
        </div>
      ) : (
        <SecaoContrato
          key={ultimo ? `${ultimo.id}:${ultimo.status}` : "novo"}
          o={o}
          modelo={modelo}
          contratos={contratos}
          podeOperar={podeOperar}
          podeGerir={podeGerir}
          aoMudar={consulta.recarregar}
          avisar={mostrar}
        />
      )}
    </div>
  );
}
