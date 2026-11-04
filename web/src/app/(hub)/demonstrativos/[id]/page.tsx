// Demonstrativos › um balancete: painel, demonstrações, balancete com ajuste de grupos/DFC, índices, fragilidades e
// parecer. Daqui a equipe publica o mês para o cliente ver no Portal.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { GRUPOS } from "@/dominios/demonstrativos/balancete/classificacao";
import { rascunhoParecer } from "@/dominios/demonstrativos/parecer";
import { AbaDemonstracoes } from "@/dominios/demonstrativos/componentes/Demonstracoes";
import { BotaoPdf, estadoPdf } from "@/dominios/demonstrativos/componentes/BotaoPdf";
import { EditorParecer } from "@/dominios/demonstrativos/componentes/EditorParecer";
import type { Grupo } from "@/dominios/demonstrativos/balancete/tipos";
import { carregarMapaDfc, definirGrupo, definirLinhaDfc, lerLinhas, recalcular } from "@/dominios/demonstrativos/repositorio";
import { LINHAS_DFC, linhaDfc, linhaDfcAuto } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { MapaDfc } from "@/dominios/demonstrativos/calculosDemonstracoes";
import { REGIMES } from "@/dominios/clientes/tipos";
import { ArvoreBalancete } from "@/dominios/demonstrativos/componentes/ArvoreBalancete";
import { GradeIndices } from "@/dominios/demonstrativos/componentes/GradeIndices";
import { ListaAlertas } from "@/dominios/demonstrativos/componentes/ListaAlertas";
import { PainelResumo } from "@/dominios/demonstrativos/componentes/PainelResumo";
import { SeletorPeriodo, usePeriodo } from "@/dominios/demonstrativos/componentes/SeletorPeriodo";
import { ExportarPeriodo } from "@/dominios/demonstrativos/componentes/ExportarPeriodo";
import type { BalanceteReg, LinhaReg, ParecerReg } from "@/dominios/demonstrativos/tipos";
import { hojeISO, somarDias } from "@/lib/datas";
import { fmtDataHora, mesExtenso } from "@/lib/formato/datas";
import { nomeCliente } from "@/dominios/clientes/nome";
import { Abas } from "@/components/ui/Abas";
import { useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { useEscolha } from "@/components/ui/JanelaEscolha";

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
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [mapaDfc, setMapaDfc] = useState<MapaDfc>([]);
  const [dfcCliente, setDfcCliente] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const { aviso, mostrar } = useAviso();
  const [janelaConfirmar, confirmar] = useConfirmar();
  const [janelaEscolha, escolher] = useEscolha();
  const podeOperar = pode("demonstrativos", "operar");
  const podeGerir = pode("demonstrativos", "gerir");
  const falhar = useCallback((e: unknown) => mostrar(traduzirErro(e), "erro"), [mostrar]);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const a = await sb.from("portal_balancetes").select("*").eq("id", id).single();
    if (a.error) return setErroAbrir(traduzirErro(a.error));
    const atual = a.data as BalanceteReg;
    setB(atual);
    setComentario(atual.comentario ?? "");
    let h, l, p;
    try {
      [h, l, p] = await Promise.all([
        sb.from("portal_balancetes").select("*").eq("cliente_id", atual.cliente_id).order("competencia"),
        lerLinhas(id).then((data) => ({ data })),
        sb.from("portal_pareceres").select("*").eq("balancete_id", id).order("versao", { ascending: false }),
      ]);
    } catch (e) {
      return falhar(e);
    }
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
      const la = await lerLinhas(ant.id).then(
        (data) => ({ data }),
        () => ({ data: null }),
      );
      setAnteriores(
        new Map(((la.data as { classificacao: string; saldo_atual: number }[]) ?? []).map((x) => [x.classificacao, Number(x.saldo_atual)])),
      );
    } else setAnteriores(undefined);
  }, [id, falhar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const cliente = b ? clientePorId(b.cliente_id) : undefined;
  const nome = nomeCliente(cliente, "");
  const parecer = pareceres[0];
  const anterior = useMemo(() => (b ? historico.filter((x) => x.competencia < b.competencia).at(-1) : undefined), [b, historico]);
  const periodo = usePeriodo(historico, b?.competencia, id);
  // PDF completo: segue o período escolhido; fora do mês, o servidor usa só meses publicados
  const selPdf = periodo.sel;
  const pdfDoMes = !selPdf || selPdf.escolha.visao === "mensal";
  const situacao = useMemo(() => estadoPdf(historico, periodo.escolha), [historico, periodo.escolha]);

  if (erroAbrir && !b)
    return (
      <EstadoVazio
        icone="alerta"
        titulo="Não foi possível abrir este balancete"
        acao={
          <Link href="/demonstrativos" className="btn">
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar aos balancetes
          </Link>
        }
      >
        {erroAbrir}
      </EstadoVazio>
    );
  if (!b) return <Esqueleto indicadores={4} linhas={6} />;

  /** Executa uma gravação com o botão ocupado, mostra o aviso e recarrega; erro vira mensagem em português. */
  async function gravar(f: () => Promise<unknown>, ok?: string) {
    setOcupado(true);
    try {
      await f();
      if (ok) mostrar(ok);
      await carregar();
    } catch (e) {
      falhar(e);
    } finally {
      setOcupado(false);
    }
  }

  async function publicar(sim: boolean) {
    const pend = b!.conferencias.filter((c) => !c.ok);
    if (sim && pend.length) {
      const segue = await confirmar({
        titulo: "Publicar com conferências pendentes?",
        descricao: <>O cliente passa a ver este mês no Portal mesmo com: {pend.map((c) => `${c.nome} (${c.detalhe})`).join("; ")}.</>,
        botao: "Publicar mesmo assim",
      });
      if (!segue) return;
    }
    if (!sim) {
      const segue = await confirmar({
        titulo: "Voltar para rascunho?",
        descricao: "O cliente deixa de ver este mês no Portal até você publicar de novo.",
        botao: "Despublicar",
        perigo: true,
      });
      if (!segue) return;
    }
    await gravar(
      async () => exigir(await supabase().rpc("portal_publicar_balancete", { p_balancete: b!.id, p_publicar: sim })),
      sim ? "Publicado. Os usuários do cliente foram avisados no Portal." : "Voltou para rascunho; o cliente deixa de ver este mês.",
    );
  }

  /** Pergunta se a regra vale para todas as empresas ou só para esta; null = voltou sem escolher. */
  async function escopo(o: { titulo: string; descricao: string }) {
    return escolher({
      ...o,
      opcoes: [
        {
          id: "cliente",
          nome: `Só para ${nome || "esta empresa"}`,
          detalhe: "Vale apenas para os balancetes desta empresa.",
          principal: true,
        },
        {
          id: "padrao",
          nome: "Para todas as empresas (regra padrão da MDC)",
          detalhe: "Passa a valer para todas as empresas da carteira.",
        },
      ],
    });
  }

  async function mudarGrupo(l: LinhaReg, grupo: Grupo) {
    const r = await escopo({
      titulo: `Grupo da conta ${l.classificacao}`,
      descricao: `Usar “${GRUPOS.find((x) => x.id === grupo)?.nome}” para ${l.descricao ?? "esta conta"}.`,
    });
    if (!r) return;
    await gravar(
      () =>
        definirGrupo({
          org: org.id,
          cliente: r === "cliente" ? b!.cliente_id : null,
          balanceteId: b!.id,
          classificacao: l.classificacao,
          grupo,
        }),
      "Grupo alterado e números recalculados.",
    );
  }

  async function mudarLinhaDfc(l: LinhaReg, linha: string) {
    const auto = linhaDfcAuto(l);
    let r: string | null = "cliente";
    if (linha !== "") {
      r = await escopo({
        titulo: `Linha da DFC da conta ${l.classificacao}`,
        descricao: `Usar “${LINHAS_DFC.find((x) => x.id === linha)?.nome ?? linha}” no fluxo de caixa para ${l.descricao ?? "esta conta"}.`,
      });
      if (!r) return;
    }
    await gravar(
      () =>
        definirLinhaDfc({
          org: org.id,
          cliente: r === "padrao" ? null : b!.cliente_id,
          balanceteId: b!.id,
          classificacao: l.classificacao,
          linha: linha === "" || linha === auto ? null : linha,
        }),
      "DFC recalculada com a nova linha. Os demais meses usam a regra ao serem reprocessados.",
    );
  }

  async function salvarComentario() {
    await gravar(
      async () =>
        exigir(
          await supabase()
            .from("portal_balancetes")
            .update({ comentario: comentario.trim() || null })
            .eq("id", b!.id),
        ),
      "Comentário salvo. Ele aparece no topo do painel do cliente.",
    );
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
    await gravar(async () => {
      exigir(
        await supabase()
          .from("portal_pareceres")
          .insert({
            org_id: org.id,
            cliente_id: b!.cliente_id,
            balancete_id: b!.id,
            versao: (parecer?.versao ?? 0) + 1,
            texto,
            contador_nome: parecer?.contador_nome ?? eu.nome,
            contador_crc: parecer?.contador_crc ?? "",
          }),
      );
      setAba("parecer");
    }, "Rascunho do parecer criado. Revise os trechos [Revisar…].");
  }

  async function criarTarefas() {
    await gravar(async () => {
      const sb = supabase();
      const setor = (await sb.from("setores").select("id").eq("org_id", org.id).ilike("nome", "cont%").limit(1)).data?.[0]?.id ?? null;
      const resp =
        (setor
          ? (await sb.from("cliente_responsaveis").select("user_id").eq("cliente_id", b!.cliente_id).eq("setor_id", setor).limit(1))
              .data?.[0]?.user_id
          : null) ?? eu.user_id;
      const prazo = somarDias(hojeISO(org.fuso), 7);
      exigir(
        await sb.from("tarefas").insert(
          b!.alertas.map((a) => ({
            org_id: org.id,
            titulo: `${a.texto} — balancete ${mesExtenso(b!.competencia)}`,
            descricao: `Evidência: ${a.evidencia}\nRecomendação: ${a.recomendacao}`,
            cliente_id: b!.cliente_id,
            setor_id: setor,
            responsavel_id: resp,
            criado_por: eu.user_id,
            status: "a_fazer",
            prioridade: a.nivel === "alto" ? "alta" : "media",
            prazo,
            visivel_cliente: false,
          })),
        ),
      );
    }, `${b!.alertas.length} tarefa(s) criada(s) no MDC Tarefas para o responsável contábil.`);
  }

  const ABAS: { id: Aba; nome: string }[] = [
    { id: "painel", nome: "Painel" },
    { id: "demonstracoes", nome: "Balanço, DRE e DFC" },
    { id: "balancete", nome: "Balancete" },
    { id: "indices", nome: "Índices" },
    { id: "fragilidades", nome: `Fragilidades (${b.alertas.length})` },
    { id: "parecer", nome: "Parecer técnico" },
  ];
  const publicado = b.status === "publicado";
  const pendentes = b.conferencias.filter((c) => !c.ok);
  const comPeriodo = aba === "painel" || aba === "demonstracoes" || aba === "indices";

  return (
    <div className="space-y-5">
      {janelaConfirmar}
      {janelaEscolha}
      <div className="space-y-2 print:hidden">
        <Link href="/demonstrativos" className="alvo-toque inline-flex items-center gap-1 text-sm text-neutral-600 hover:underline">
          <Icone nome="voltar" className="h-4 w-4" />
          Balancetes
        </Link>
        <CabecalhoPagina
          titulo={`${nome} · ${mesExtenso(b.competencia)}`}
          descricao={
            <>
              {b.arquivo_nome} · importado em {fmtDataHora(b.importado_em)}
              {b.publicado_em && ` · publicado em ${fmtDataHora(b.publicado_em)}`}
            </>
          }
          acoes={
            <>
              <BotaoPdf
                balanceteId={b.id}
                periodo={periodo.escolha}
                rotulo={selPdf?.rotulo}
                rascunho={pdfDoMes && (selPdf?.base ?? b).status !== "publicado"}
                aviso={situacao.aviso}
                bloqueio={situacao.bloqueio}
              />
              {publicado
                ? podeGerir && (
                    <button className="btn" onClick={() => publicar(false)} disabled={ocupado}>
                      <Icone nome="cancelar" className="h-4 w-4" />
                      Despublicar
                    </button>
                  )
                : podeGerir && (
                    <button className="btn-primario" onClick={() => publicar(true)} disabled={ocupado}>
                      <Icone nome="enviar" className="h-4 w-4" />
                      Publicar para o cliente
                    </button>
                  )}
            </>
          }
        />
        <div>
          {publicado ? (
            <Chip tom="verde">Publicado: o cliente vê no Portal</Chip>
          ) : (
            <Chip tom="ambar">Rascunho: o cliente vê “Fechamento em andamento”</Chip>
          )}
        </div>
      </div>

      <div className="space-y-2 print:hidden">
        {aviso}
        {pendentes.length > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Conferências pendentes:</b> {pendentes.map((c) => `${c.nome} (${c.detalhe})`).join("; ")}.
            </span>
          </p>
        )}
      </div>

      <div className="print:hidden">
        <Abas itens={ABAS} valor={aba} aoMudar={setAba} rotulo="Partes do balancete" />
      </div>

      {comPeriodo && (
        <SeletorPeriodo historico={historico} periodo={periodo}>
          {periodo.sel && <ExportarPeriodo sel={periodo.sel} anterior={periodo.anterior} empresa={nome} />}
        </SeletorPeriodo>
      )}
      {comPeriodo && periodo.sel && periodo.sel.base.id !== b.id && (
        <p className="-mt-2 flex items-start gap-1.5 text-xs text-neutral-600 print:hidden">
          <Icone nome="info" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Você está vendo {periodo.sel.rotulo}. As abas Balancete, Fragilidades e Parecer continuam sendo do arquivo de{" "}
            {mesExtenso(b.competencia)}
            {periodo.sel.escolha.visao === "mensal" && (
              <>
                {" · "}
                <Link href={`/demonstrativos/${periodo.sel.base.id}`} className="underline">
                  abrir o balancete de {mesExtenso(periodo.sel.base.competencia)}
                </Link>
              </>
            )}
            .
          </span>
        </p>
      )}

      {aba === "painel" && periodo.sel && (
        <div className="space-y-5">
          {podeOperar && (
            <section className="cartao p-4 print:hidden">
              <h2 className="font-semibold text-[var(--marca)]">Comentário do contador para o cliente</h2>
              <p className="mb-2 text-xs text-neutral-500">
                Um parágrafo: o que aconteceu na empresa no mês. Aparece no topo do painel do cliente.
              </p>
              <textarea
                className="entrada w-full"
                rows={3}
                value={comentario}
                aria-label="Comentário do contador"
                onChange={(e) => setComentario(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button className="btn" onClick={salvarComentario} disabled={ocupado}>
                  <Icone nome="check" className="h-4 w-4" />
                  Salvar comentário
                </button>
              </div>
            </section>
          )}
          <PainelResumo sel={periodo.sel} anterior={periodo.anterior} historico={historico} />
        </div>
      )}

      {aba === "demonstracoes" && periodo.sel && <AbaDemonstracoes sel={periodo.sel} anterior={periodo.anterior} />}

      {aba === "balancete" && (
        <ArvoreBalancete
          linhas={linhas}
          anteriores={anteriores}
          editarGrupo={
            podeOperar && !publicado
              ? (l) => (
                  <select
                    className="entrada !min-h-7 !py-0.5 text-xs"
                    value={l.grupo ?? ""}
                    aria-label={`Grupo da conta ${l.classificacao}`}
                    disabled={ocupado}
                    onChange={(e) => {
                      const g = e.target.value as Grupo;
                      if (g) void mudarGrupo(l, g);
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
            podeOperar && !publicado
              ? (l) => {
                  const atualLinha = linhaDfc(l, mapaDfc);
                  const auto = linhaDfcAuto(l);
                  const manual = atualLinha !== auto || dfcCliente.has(l.classificacao);
                  return (
                    <select
                      className={`entrada !min-h-7 !py-0.5 text-xs ${manual ? "!border-[var(--destaque-escuro)] font-medium" : ""}`}
                      value={manual ? atualLinha : ""}
                      title={manual ? "Linha escolhida manualmente" : "Linha automática"}
                      aria-label={`Linha da DFC da conta ${l.classificacao}`}
                      disabled={ocupado}
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

      {aba === "indices" && periodo.sel && <GradeIndices sel={periodo.sel} historico={historico} />}

      {aba === "fragilidades" && (
        <div className="space-y-3">
          {b.alertas.length ? (
            <ListaAlertas alertas={b.alertas} />
          ) : (
            <EstadoVazio icone="check" titulo="Nenhuma fragilidade encontrada">
              As verificações automáticas não acharam sinais de alerta neste balancete. Se você ajustou grupos de contas, refaça as
              verificações.
            </EstadoVazio>
          )}
          <div className="flex flex-wrap gap-2">
            {podeOperar && b.alertas.length > 0 && pode("tarefas", "operar") && (
              <button className="btn-primario" onClick={criarTarefas} disabled={ocupado}>
                <Icone nome="check" className="h-4 w-4" />
                Criar tarefas internas
              </button>
            )}
            {podeOperar && (
              <button className="btn" onClick={() => gravar(() => recalcular(b.id), "Verificações refeitas.")} disabled={ocupado}>
                <Icone nome="atualizar" className="h-4 w-4" />
                Refazer verificações
              </button>
            )}
          </div>
        </div>
      )}

      {aba === "parecer" && (
        <EditorParecer
          key={parecer?.id ?? "novo"}
          parecer={parecer}
          versoes={pareceres.length}
          empresa={cliente?.razao_social ?? nome}
          cnpj={cliente?.cnpj}
          podeOperar={podeOperar}
          podeGerir={podeGerir}
          aoGerar={novoParecer}
          aoMudar={carregar}
          aoErro={falhar}
          aoAviso={mostrar}
        />
      )}
    </div>
  );
}
