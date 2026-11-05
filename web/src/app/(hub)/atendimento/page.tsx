// Atendimento: conversas dos clientes pelo Portal. Lista com filtros à esquerda e a conversa aberta à direita
// (no celular, uma de cada vez com "Voltar"). Molde de tela em docs/08-convencoes.md (8.3/8.3.1).
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgora } from "@/lib/useAgora";
import { useConsulta } from "@/lib/useConsulta";
import { exigir } from "@/lib/exigir";
import { hojeISO } from "@/lib/datas";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { ASSUNTOS, STATUS_CONVERSA, nomeAssunto } from "@/dominios/atendimento/chat";
import type { Conversa } from "@/dominios/atendimento/chat";
import { ChatMensagens } from "@/dominios/atendimento/componentes/ChatMensagens";
import { NovaConversa } from "@/dominios/atendimento/componentes/NovaConversa";
import { ChipConversa, PainelConversas, VoltarConversas } from "@/dominios/atendimento/componentes/PainelConversas";
import { caminho } from "@/lib/caminho";
import { fmtDataHora } from "@/lib/formato/datas";
import { nomeCliente } from "@/dominios/clientes/nome";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { plural } from "@/lib/formato/numero";

export default function PaginaAtendimento() {
  return <Caixa />;
}

type Filtro = "abertas" | "minhas" | "novas" | "atrasadas" | "aguardando" | "resolvidas" | "todas";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "abertas", nome: "Abertas" },
  { id: "minhas", nome: "Minhas abertas" },
  { id: "novas", nome: "Novas (sem resposta)" },
  { id: "atrasadas", nome: "Resposta atrasada" },
  { id: "aguardando", nome: "Aguardando o cliente" },
  { id: "resolvidas", nome: "Resolvidas" },
  { id: "todas", nome: "Todas" },
];

function Caixa() {
  const { org, eu, membros, setores, clientePorId, nomeMembro, pode, clientes } = useOrg();
  const agora = useAgora();
  const { aviso, mostrar } = useAviso();
  // ?c=<id> (link do aviso de nova mensagem) já abre a conversa
  const [sel, setSel] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c"),
  );
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [assunto, setAssunto] = useState("");
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);
  const podeOperar = pode("atendimento", "operar");

  const consulta = useConsulta(
    useCallback(
      async () =>
        exigir(
          await supabase()
            .from("portal_conversas")
            .select("*")
            .eq("org_id", org.id)
            .order("atualizado_em", { ascending: false })
            .limit(500),
        ) as Conversa[],
      [org.id],
    ),
  );
  const { recarregar } = consulta;
  const conversas = useMemo(() => consulta.dados ?? [], [consulta.dados]);

  useEffect(() => {
    const sb = supabase();
    const canal = sb
      .channel(`atend-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_conversas", filter: `org_id=eq.${org.id}` }, recarregar)
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [org.id, recarregar]);

  const atrasada = useCallback(
    (c: Conversa) => !c.respondida_em && !!c.prazo_resposta && Date.parse(c.prazo_resposta) < agora && c.status !== "resolvido",
    [agora],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      const aberta = c.status !== "resolvido";
      if (filtro === "abertas" && !aberta) return false;
      if (filtro === "resolvidas" && aberta) return false;
      if (filtro === "minhas" && (c.responsavel_id !== eu.user_id || !aberta)) return false;
      if (filtro === "novas" && c.status !== "novo") return false;
      if (filtro === "atrasadas" && !atrasada(c)) return false;
      if (filtro === "aguardando" && c.status !== "aguardando_cliente") return false;
      if (assunto && c.assunto !== assunto) return false;
      if (q) {
        const cl = clientePorId(c.cliente_id);
        if (!`${c.titulo} ${cl?.razao_social} ${cl?.nome_fantasia}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [conversas, filtro, assunto, busca, eu.user_id, clientePorId, atrasada]);

  const atual = conversas.find((c) => c.id === sel);
  const contar = (f: (c: Conversa) => boolean) => conversas.filter(f).length;
  const novas = contar((c) => c.status === "novo");
  const atrasadas = contar(atrasada);
  const minhas = contar((c) => c.responsavel_id === eu.user_id && c.status !== "resolvido");

  async function atualizar(campos: Partial<Conversa>) {
    if (!atual) return;
    try {
      exigir(await supabase().from("portal_conversas").update(campos).eq("id", atual.id));
      mostrar("Atendimento atualizado.");
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
    recarregar();
  }

  async function virarTarefa() {
    if (!atual) return;
    try {
      exigir(await supabase().rpc("portal_conversa_para_tarefa", { p_conversa: atual.id, p_prazo: null }));
      mostrar("Tarefa criada no MDC Tarefas com o histórico da conversa.");
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
    recarregar();
  }

  const nomeCli = (id: string) => nomeCliente(clientePorId(id), "—");
  const nomeStatus = (s: Conversa["status"]) => STATUS_CONVERSA.find((x) => x.id === s)?.nome ?? s;
  const limpar = () => {
    setFiltro("abertas");
    setAssunto("");
    setBusca("");
  };
  const ativos: FiltroAtivo[] = [
    ...(filtro !== "abertas"
      ? [{ id: "f", rotulo: `Situação: ${FILTROS.find((f) => f.id === filtro)?.nome}`, aoTirar: () => setFiltro("abertas") }]
      : []),
    ...(assunto ? [{ id: "a", rotulo: `Assunto: ${nomeAssunto(assunto)}`, aoTirar: () => setAssunto("") }] : []),
    ...(busca.trim() ? [{ id: "b", rotulo: `Busca: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
  ];
  const alternar = (f: Filtro) => setFiltro((x) => (x === f ? "abertas" : f));

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Atendimento"
        descricao="Conversas dos clientes pelo Portal: responda, passe para o responsável certo ou transforme em tarefa."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Atendimentos",
                subtitulo: `${org.nome} · ${FILTROS.find((f) => f.id === filtro)?.nome} · ${plural(lista.length, "conversa")}`,
                arquivo: nomeArquivo("Atendimentos", hojeISO(org.fuso)),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Cliente", valor: (c: Conversa) => nomeCli(c.cliente_id), peso: 2.2, largura: 34 },
                  { titulo: "Resumo", valor: (c: Conversa) => c.titulo, peso: 2.6, largura: 40 },
                  { titulo: "Assunto", valor: (c: Conversa) => nomeAssunto(c.assunto), peso: 1.3, largura: 20 },
                  { titulo: "Situação", valor: (c: Conversa) => nomeStatus(c.status), peso: 1.2, largura: 18 },
                  { titulo: "Responsável", valor: (c: Conversa) => nomeMembro(c.responsavel_id), peso: 1.4, largura: 22 },
                  { titulo: "Aberta em", valor: (c: Conversa) => fmtDataHora(c.criado_em), peso: 1.2, largura: 18 },
                  {
                    titulo: "Última mudança",
                    valor: (c: Conversa) => (atrasada(c) ? "Resposta atrasada" : fmtDataHora(c.atualizado_em)),
                    peso: 1.3,
                    largura: 18,
                    alerta: atrasada,
                  },
                ],
              })}
            />
            {podeOperar && (
              <button className="btn-primario" onClick={() => setNova(true)}>
                <Icone nome="mais" className="h-4 w-4" />
                Nova conversa
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Novas, sem resposta"
          icone="chat"
          tom={novas ? "vermelho" : "neutro"}
          valor={String(novas)}
          ativo={filtro === "novas"}
          aoClicar={() => alternar("novas")}
        />
        <Indicador
          titulo="Resposta atrasada"
          icone="relogio"
          tom={atrasadas ? "ambar" : "neutro"}
          valor={String(atrasadas)}
          detalhe="passou do prazo de resposta"
          ativo={filtro === "atrasadas"}
          aoClicar={() => alternar("atrasadas")}
        />
        <Indicador
          titulo="Minhas abertas"
          icone="pessoas"
          tom="azul"
          valor={String(minhas)}
          ativo={filtro === "minhas"}
          aoClicar={() => alternar("minhas")}
        />
      </div>

      <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
        <label className="campo campo-largo">
          <span>Buscar cliente ou resumo</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Greencore" />
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            {FILTROS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Assunto</span>
          <select value={assunto} onChange={(e) => setAssunto(e.target.value)}>
            <option value="">Todos</option>
            {ASSUNTOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={6} />
      ) : !conversas.length ? (
        <EstadoVazio
          icone="chat"
          titulo="Nenhuma conversa ainda"
          acao={
            podeOperar && (
              <button className="btn-primario" onClick={() => setNova(true)}>
                <Icone nome="mais" className="h-4 w-4" />
                Iniciar conversa com um cliente
              </button>
            )
          }
        >
          Quando um cliente escrever em “Fale com a MDC”, no Portal, a conversa aparece aqui. Você também pode começar uma.
        </EstadoVazio>
      ) : (
        <PainelConversas
          aberta={!!atual}
          alturaComputador="lg:h-[max(520px,calc(100dvh-330px))]"
          lista={
            <ul className="flex-1 overflow-y-auto">
              {lista.length === 0 && (
                <li className="p-5 text-center text-sm text-neutral-500">
                  Nenhuma conversa neste filtro.
                  <button className="btn-link mt-1 block w-full" onClick={limpar}>
                    Limpar filtros
                  </button>
                </li>
              )}
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSel(c.id)}
                    aria-current={sel === c.id}
                    className={`block w-full border-b border-[var(--borda)] px-3 py-2.5 text-left text-sm hover:bg-[var(--fundo)] ${sel === c.id ? "bg-[var(--fundo)] shadow-[inset_3px_0_0_var(--destaque-escuro)]" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{nomeCli(c.cliente_id)}</span>
                      <ChipConversa status={c.status} nome={nomeStatus(c.status)} />
                    </div>
                    <div className="truncate text-neutral-700">{c.titulo}</div>
                    <div className="flex justify-between gap-2 text-xs text-neutral-500">
                      <span className="min-w-0 truncate">
                        {nomeAssunto(c.assunto)} · {nomeMembro(c.responsavel_id)}
                      </span>
                      <span className={`shrink-0 ${atrasada(c) ? "font-medium text-[var(--perigo)]" : ""}`}>
                        {atrasada(c) ? "resposta atrasada" : fmtDataHora(c.atualizado_em)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          }
          conversa={
            !atual ? (
              <div className="grid flex-1 place-items-center p-6 text-center text-sm text-neutral-500">
                <div>
                  <Icone nome="chat" className="mx-auto mb-2 h-8 w-8 text-[var(--marca)] opacity-40" />
                  Escolha uma conversa na lista para ler e responder.
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2 border-b border-[var(--borda)] p-3">
                  <div className="flex items-start gap-2">
                    <VoltarConversas aoVoltar={() => setSel(null)} />
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-semibold">{atual.titulo}</div>
                      <div className="text-xs text-neutral-500">
                        {nomeCli(atual.cliente_id)} · {nomeAssunto(atual.assunto)} · aberto em {fmtDataHora(atual.criado_em)}
                        {atual.avaliacao && (
                          <span className="inline-flex items-center gap-0.5" aria-label={`avaliação ${atual.avaliacao} de 5`}>
                            {" "}
                            · avaliação
                            {Array.from({ length: atual.avaliacao }, (_, k) => (
                              <Icone key={k} nome="estrela" className="h-3.5 w-3.5 fill-current text-[var(--destaque-escuro)]" />
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                    {!podeOperar && <ChipConversa status={atual.status} nome={nomeStatus(atual.status)} />}
                  </div>
                  {podeOperar && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="entrada !min-h-9 !py-1 text-sm"
                        value={atual.status}
                        onChange={(e) => atualizar({ status: e.target.value as Conversa["status"] })}
                        aria-label="Situação"
                      >
                        {STATUS_CONVERSA.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                      <select
                        className="entrada !min-h-9 !py-1 text-sm"
                        value={atual.responsavel_id ?? ""}
                        onChange={(e) => atualizar({ responsavel_id: e.target.value || null })}
                        aria-label="Responsável"
                      >
                        <option value="">Sem responsável</option>
                        {membros
                          .filter((m) => m.ativo)
                          .map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.nome}
                            </option>
                          ))}
                      </select>
                      <select
                        className="entrada !min-h-9 !py-1 text-sm"
                        value={atual.setor_id ?? ""}
                        onChange={(e) => atualizar({ setor_id: e.target.value || null })}
                        aria-label="Setor"
                      >
                        <option value="">Sem setor</option>
                        {setores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                      {atual.tarefa_id ? (
                        <a href={caminho("/tarefas")} className="btn !min-h-9 !py-1" title="Abrir o MDC Tarefas">
                          <Icone nome="check" className="h-4 w-4" />
                          Virou tarefa
                        </a>
                      ) : (
                        <button
                          className="btn !min-h-9 !py-1"
                          onClick={virarTarefa}
                          title="Cria uma tarefa no MDC Tarefas com o histórico da conversa"
                        >
                          <Icone nome="check" className="h-4 w-4" />
                          Virar tarefa
                        </button>
                      )}
                      {atual.assunto === "alteracao_contratual" && pode("societario", "operar") && !atual.processo_id && (
                        <a href={caminho("/societario")} className="btn !min-h-9 !py-1">
                          <Icone nome="pasta" className="h-4 w-4" />
                          Abrir no Societário
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  <ChatMensagens conversaId={atual.id} orgId={org.id} clienteId={atual.cliente_id} lado="equipe" />
                </div>
              </>
            )
          }
        />
      )}
      {nova && (
        <NovaConversa
          clientes={clientes.filter((c) => c.ativo)}
          descricao="A mensagem aparece para o cliente em “Fale com a MDC”, no Portal."
          aoFechar={() => setNova(false)}
          aoCriar={(id) => {
            setNova(false);
            recarregar();
            setSel(id);
            mostrar("Conversa aberta.");
          }}
        />
      )}
    </div>
  );
}
