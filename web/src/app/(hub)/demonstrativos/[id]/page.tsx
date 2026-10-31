"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { GRUPOS } from "@/lib/balancete";
import { rascunhoParecer } from "@/lib/parecer";
import { AbaDemonstracoes } from "@/components/demonstrativos/Demonstracoes";
import { BotaoPdf } from "@/components/demonstrativos/BotaoPdf";
import type { Grupo } from "@/lib/balancete";
import { carregarMapaDfc, definirGrupo, definirLinhaDfc, recalcular } from "@/lib/demonstrativos";
import { LINHAS_DFC, linhaDfc, linhaDfcAuto } from "@/lib/demonstracoes";
import type { MapaDfc } from "@/lib/demonstracoes";
import { REGIMES } from "@/lib/types";
import { ArvoreBalancete } from "@/components/demonstrativos/ArvoreBalancete";
import { GradeIndices } from "@/components/demonstrativos/GradeIndices";
import { ListaAlertas } from "@/components/demonstrativos/ListaAlertas";
import { PainelResumo } from "@/components/demonstrativos/PainelResumo";
import { VisaoParecer } from "@/components/demonstrativos/VisaoParecer";
import type { BalanceteReg, LinhaReg, ParecerReg } from "@/dominios/demonstrativos/tipos";
import { hojeISO, somarDias } from "@/lib/datas";
import { mesExtenso } from "@/lib/formato/datas";
import { nomeCliente } from "@/lib/clientes";

export default function PaginaBalancete() {
  return <Detalhe />;
}

type Aba = "painel" | "demonstracoes" | "balancete" | "indices" | "fragilidades" | "parecer";

function Detalhe() {
  const { id } = useParams<{ id: string }>();
  const { org, eu, clientePorId, pode } = useOrg();
  const [b, setB] = useState<BalanceteReg | null>(null);
  const [historico, setHistorico] = useState<BalanceteReg[]>([]);
  const [linhas, setLinhas] = useState<LinhaReg[]>([]);
  const [anteriores, setAnteriores] = useState<Map<string, number> | undefined>();
  const [pareceres, setPareceres] = useState<ParecerReg[]>([]);
  const [aba, setAba] = useState<Aba>("painel");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [mapaDfc, setMapaDfc] = useState<MapaDfc>([]);
  const [dfcCliente, setDfcCliente] = useState<Set<string>>(new Set());
  const podeOperar = pode("demonstrativos", "operar");
  const podeGerir = pode("demonstrativos", "gerir");

  const carregar = useCallback(async () => {
    const sb = supabase();
    const a = await sb.from("portal_balancetes").select("*").eq("id", id).single();
    if (a.error) return setErro(traduzirErro(a.error));
    const atual = a.data as BalanceteReg;
    setB(atual);
    setComentario(atual.comentario ?? "");
    const [h, l, p] = await Promise.all([
      sb.from("portal_balancetes").select("*").eq("cliente_id", atual.cliente_id).order("competencia"),
      sb.from("portal_balancete_linhas").select("*").eq("balancete_id", id).order("classificacao").limit(20000),
      sb.from("portal_pareceres").select("*").eq("balancete_id", id).order("versao", { ascending: false }),
    ]);
    const hist = (h.data as BalanceteReg[]) ?? [];
    const md = await carregarMapaDfc(atual.org_id, atual.cliente_id);
    setMapaDfc(md);
    const cli = await sb.from("portal_mapa_dfc").select("classificacao").eq("cliente_id", atual.cliente_id);
    setDfcCliente(new Set(((cli.data as { classificacao: string }[]) ?? []).map((x) => x.classificacao)));
    setHistorico(hist);
    setLinhas((l.data as LinhaReg[]) ?? []);
    setPareceres((p.data as ParecerReg[]) ?? []);
    const ant = hist.filter((x) => x.competencia < atual.competencia).at(-1);
    if (ant) {
      const la = await sb.from("portal_balancete_linhas").select("classificacao,saldo_atual").eq("balancete_id", ant.id).limit(20000);
      setAnteriores(
        new Map(((la.data as { classificacao: string; saldo_atual: number }[]) ?? []).map((x) => [x.classificacao, Number(x.saldo_atual)])),
      );
    } else setAnteriores(undefined);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const cliente = b ? clientePorId(b.cliente_id) : undefined;
  const nome = nomeCliente(cliente, "");
  const parecer = pareceres[0];
  const anterior = useMemo(() => (b ? historico.filter((x) => x.competencia < b.competencia).at(-1) : undefined), [b, historico]);

  if (erro && !b) return <p className="text-sm text-red-700">{erro}</p>;
  if (!b) return <p className="text-sm text-neutral-500">Carregando…</p>;

  async function publicar(sim: boolean) {
    setErro(null);
    if (sim && b!.conferencias.some((c) => !c.ok) && !confirm("Há conferências pendentes. Publicar mesmo assim?")) return;
    const { error } = await supabase().rpc("portal_publicar_balancete", { p_balancete: b!.id, p_publicar: sim });
    if (error) return setErro(traduzirErro(error));
    setAviso(
      sim ? "Publicado. Os usuários do cliente foram avisados no portal." : "Voltou para rascunho; o cliente deixa de ver este mês.",
    );
    void carregar();
  }

  async function salvarComentario() {
    const { error } = await supabase()
      .from("portal_balancetes")
      .update({ comentario: comentario.trim() || null })
      .eq("id", b!.id);
    if (error) return setErro(traduzirErro(error));
    setAviso("Comentário salvo.");
    void carregar();
  }

  async function mudarGrupo(l: LinhaReg, grupo: Grupo, escopo: "cliente" | "padrao") {
    setErro(null);
    try {
      await definirGrupo({
        org: org.id,
        cliente: escopo === "cliente" ? b!.cliente_id : null,
        balanceteId: b!.id,
        classificacao: l.classificacao,
        grupo,
      });
      await carregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  async function mudarLinhaDfc(l: LinhaReg, linha: string) {
    setErro(null);
    const auto = linhaDfcAuto(l);
    const padrao =
      linha !== "" &&
      confirm(
        `Usar esta linha da DFC para a conta ${l.classificacao} em TODAS as empresas?\n\nOK = regra padrão da MDC · Cancelar = só para ${nome}`,
      );
    try {
      await definirLinhaDfc({
        org: org.id,
        cliente: padrao ? null : b!.cliente_id,
        balanceteId: b!.id,
        classificacao: l.classificacao,
        linha: linha === "" || linha === auto ? null : linha,
      });
      setAviso("DFC recalculada com a nova linha. Os demais meses usam a regra ao serem reprocessados.");
      await carregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  async function novoParecer() {
    const texto = rascunhoParecer({
      empresa: cliente?.razao_social ?? nome,
      cnpj: cliente?.cnpj ?? null,
      competencia: b!.competencia,
      demo: b!.demonstracoes ?? null,
      regime: REGIMES.find((r) => r.id === cliente?.regime)?.nome ?? null,
      r: b!.resumo,
      i: b!.indices,
      alertas: b!.alertas,
      anterior: anterior?.resumo ?? null,
      contador: parecer?.contador_nome ?? eu.nome,
      crc: parecer?.contador_crc ?? "",
    });
    const { error } = await supabase()
      .from("portal_pareceres")
      .insert({
        org_id: org.id,
        cliente_id: b!.cliente_id,
        balancete_id: b!.id,
        versao: (parecer?.versao ?? 0) + 1,
        texto,
        contador_nome: parecer?.contador_nome ?? eu.nome,
        contador_crc: parecer?.contador_crc ?? "",
      });
    if (error) return setErro(traduzirErro(error));
    setAba("parecer");
    void carregar();
  }

  const ABAS: { id: Aba; nome: string }[] = [
    { id: "painel", nome: "Painel" },
    { id: "demonstracoes", nome: "Balanço, DRE e DFC" },
    { id: "balancete", nome: "Balancete" },
    { id: "indices", nome: "Índices" },
    { id: "fragilidades", nome: `Fragilidades (${b.alertas.length})` },
    { id: "parecer", nome: "Parecer técnico" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3 print:hidden">
        <div className="mr-auto">
          <Link href="/demonstrativos" className="text-sm text-neutral-500 hover:underline">
            ← Balancetes
          </Link>
          <h1 className="text-xl font-semibold text-[var(--marca)]">
            {nome} · {mesExtenso(b.competencia)}
          </h1>
          <p className="text-sm text-neutral-600">
            {b.arquivo_nome} · importado em {new Date(b.importado_em).toLocaleString("pt-BR")}
            {b.publicado_em && ` · publicado em ${new Date(b.publicado_em).toLocaleString("pt-BR")}`}
          </p>
        </div>
        <BotaoPdf balanceteId={b.id} rascunho={b.status !== "publicado"} />
        {b.status === "publicado" ? (
          <>
            <span className="chip bg-emerald-50 text-emerald-800">Publicado para o cliente</span>
            {podeGerir && (
              <button className="btn" onClick={() => publicar(false)}>
                Despublicar
              </button>
            )}
          </>
        ) : (
          <>
            <span className="chip bg-amber-50 text-amber-800">Rascunho: o cliente vê “Fechamento em andamento”</span>
            {podeGerir && (
              <button className="btn-primario" onClick={() => publicar(true)}>
                Publicar para o cliente
              </button>
            )}
          </>
        )}
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800 print:hidden">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden">{aviso}</p>}

      {b.conferencias.some((c) => !c.ok) && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
          Conferências pendentes:{" "}
          {b.conferencias
            .filter((c) => !c.ok)
            .map((c) => `${c.nome} (${c.detalhe})`)
            .join("; ")}
          .
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-[var(--borda)] print:hidden">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? "border-[var(--marca)] font-medium text-[var(--marca)]" : "border-transparent text-neutral-600"}`}
          >
            {a.nome}
          </button>
        ))}
      </nav>

      {aba === "painel" && (
        <div className="space-y-5">
          {podeOperar && (
            <section className="cartao p-4 print:hidden">
              <h2 className="font-semibold">Comentário do contador para o cliente</h2>
              <p className="mb-2 text-xs text-neutral-500">
                Um parágrafo: o que aconteceu na empresa no mês. Aparece no topo do painel do cliente.
              </p>
              <textarea className="entrada w-full" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
              <div className="mt-2 flex justify-end">
                <button className="btn" onClick={salvarComentario}>
                  Salvar comentário
                </button>
              </div>
            </section>
          )}
          <PainelResumo atual={b} historico={historico} />
        </div>
      )}

      {aba === "demonstracoes" && <AbaDemonstracoes atual={b} historico={historico} />}

      {aba === "balancete" && (
        <ArvoreBalancete
          linhas={linhas}
          anteriores={anteriores}
          editarGrupo={
            podeOperar
              ? (l) => (
                  <select
                    className="entrada !min-h-7 !py-0.5 text-xs"
                    value={l.grupo ?? ""}
                    onChange={(e) => {
                      const g = e.target.value as Grupo;
                      if (!g) return;
                      const padrao = confirm(
                        `Usar "${GRUPOS.find((x) => x.id === g)?.nome}" para a conta ${l.classificacao} em TODAS as empresas?\n\nOK = regra padrão da MDC · Cancelar = só para ${nome}`,
                      );
                      void mudarGrupo(l, g, padrao ? "padrao" : "cliente");
                    }}
                  >
                    <option value="">—</option>
                    {GRUPOS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                )
              : undefined
          }
          editarDfc={
            podeOperar
              ? (l) => {
                  const atualLinha = linhaDfc(l, mapaDfc);
                  const auto = linhaDfcAuto(l);
                  const manual = atualLinha !== auto || dfcCliente.has(l.classificacao);
                  return (
                    <select
                      className={`entrada !min-h-7 !py-0.5 text-xs ${manual ? "!border-[var(--destaque-escuro)] font-medium" : ""}`}
                      value={manual ? atualLinha : ""}
                      title={manual ? "Linha escolhida manualmente" : "Linha automática"}
                      onChange={(e) => mudarLinhaDfc(l, e.target.value)}
                    >
                      <option value="">Automático · {LINHAS_DFC.find((x) => x.id === auto)?.nome ?? auto}</option>
                      {LINHAS_DFC.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome}
                        </option>
                      ))}
                    </select>
                  );
                }
              : undefined
          }
        />
      )}

      {aba === "indices" && <GradeIndices atual={b} historico={historico} />}

      {aba === "fragilidades" && (
        <div className="space-y-3">
          <ListaAlertas alertas={b.alertas} />
          {podeOperar && b.alertas.length > 0 && pode("tarefas", "operar") && (
            <button
              className="btn-primario mr-2"
              onClick={async () => {
                const sb = supabase();
                const setor =
                  (await sb.from("setores").select("id").eq("org_id", org.id).ilike("nome", "cont%").limit(1)).data?.[0]?.id ?? null;
                const resp =
                  (setor
                    ? (
                        await sb
                          .from("cliente_responsaveis")
                          .select("user_id")
                          .eq("cliente_id", b.cliente_id)
                          .eq("setor_id", setor)
                          .limit(1)
                      ).data?.[0]?.user_id
                    : null) ?? eu.user_id;
                const prazo = somarDias(hojeISO(org.fuso), 7);
                const { error } = await sb.from("tarefas").insert(
                  b.alertas.map((a) => ({
                    org_id: org.id,
                    titulo: `${a.texto} — balancete ${mesExtenso(b.competencia)}`,
                    descricao: `Evidência: ${a.evidencia}\nRecomendação: ${a.recomendacao}`,
                    cliente_id: b.cliente_id,
                    setor_id: setor,
                    responsavel_id: resp,
                    criado_por: eu.user_id,
                    status: "a_fazer",
                    prioridade: a.nivel === "alto" ? "alta" : "media",
                    prazo,
                    visivel_cliente: false,
                  })),
                );
                if (error) setErro(traduzirErro(error));
                else setAviso(`${b.alertas.length} tarefa(s) criada(s) no MDC Tarefas para o responsável contábil.`);
              }}
            >
              Criar tarefas internas
            </button>
          )}
          {podeOperar && (
            <button
              className="btn"
              onClick={async () => {
                await recalcular(b.id).catch((e) => setErro(traduzirErro(e)));
                void carregar();
              }}
            >
              Refazer verificações
            </button>
          )}
        </div>
      )}

      {aba === "parecer" && (
        <EditorParecer
          parecer={parecer}
          versoes={pareceres.length}
          empresa={cliente?.razao_social ?? nome}
          cnpj={cliente?.cnpj}
          podeOperar={podeOperar}
          podeGerir={podeGerir}
          aoGerar={novoParecer}
          aoMudar={carregar}
          aoErro={(e) => setErro(traduzirErro(e))}
        />
      )}
    </div>
  );
}

function EditorParecer({
  parecer,
  versoes,
  empresa,
  cnpj,
  podeOperar,
  podeGerir,
  aoGerar,
  aoMudar,
  aoErro,
}: {
  parecer?: ParecerReg;
  versoes: number;
  empresa: string;
  cnpj?: string | null;
  podeOperar: boolean;
  podeGerir: boolean;
  aoGerar: () => void;
  aoMudar: () => void;
  aoErro: (e: unknown) => void;
}) {
  const [texto, setTexto] = useState(parecer?.texto ?? "");
  const [nome, setNome] = useState(parecer?.contador_nome ?? "");
  const [crc, setCrc] = useState(parecer?.contador_crc ?? "");
  useEffect(() => {
    setTexto(parecer?.texto ?? "");
    setNome(parecer?.contador_nome ?? "");
    setCrc(parecer?.contador_crc ?? "");
  }, [parecer]);

  if (!parecer)
    return (
      <div className="cartao p-6 text-center">
        <p className="text-sm text-neutral-600">
          O Hub monta o rascunho com os números, os índices e as fragilidades deste balancete. Você revisa, ajusta e assina antes de
          publicar.
        </p>
        {podeOperar && (
          <button className="btn-primario mt-4" onClick={aoGerar}>
            Gerar rascunho do parecer
          </button>
        )}
      </div>
    );

  const publicado = parecer.status === "publicado";

  async function salvar() {
    const { error } = await supabase()
      .from("portal_pareceres")
      .update({ texto, contador_nome: nome, contador_crc: crc })
      .eq("id", parecer!.id);
    if (error) return aoErro(error);
    aoMudar();
  }

  async function publicar() {
    await salvar();
    const { error } = await supabase().rpc("portal_publicar_parecer", { p_parecer: parecer!.id });
    if (error) return aoErro(error);
    aoMudar();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${publicado ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            Versão {parecer.versao} · {publicado ? "publicada" : "rascunho"}
          </span>
          {versoes > 1 && <span className="text-xs text-neutral-500">{versoes} versões guardadas</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="campo">
            <span>Contador responsável</span>
            <input value={nome} disabled={publicado || !podeOperar} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>CRC</span>
            <input value={crc} disabled={publicado || !podeOperar} onChange={(e) => setCrc(e.target.value)} placeholder="1SP000000/O-0" />
          </label>
        </div>
        <textarea
          className="entrada h-[560px] w-full font-mono text-[13px]"
          value={texto}
          disabled={publicado || !podeOperar}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p className="text-xs text-neutral-500">
          # título · ## seção · - item · **negrito**. Trechos entre colchetes [Revisar…] pedem sua complementação.
        </p>
        <div className="flex flex-wrap gap-2">
          {!publicado && podeOperar && (
            <button className="btn" onClick={salvar}>
              Salvar rascunho
            </button>
          )}
          {!publicado && podeGerir && (
            <button className="btn-primario" onClick={publicar} disabled={/\[Revisar/.test(texto)}>
              Assinar e publicar
            </button>
          )}
          {publicado && podeOperar && (
            <button className="btn" onClick={aoGerar}>
              Nova versão a partir dos números
            </button>
          )}
          <button className="btn" onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        </div>
        {/\[Revisar/.test(texto) && (
          <p className="text-xs text-amber-800">Complete os trechos marcados com [Revisar…] antes de publicar.</p>
        )}
      </section>
      <VisaoParecer texto={texto} empresa={empresa} cnpj={cnpj} />
    </div>
  );
}
