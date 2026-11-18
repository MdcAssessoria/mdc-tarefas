// Manual do HUB-MDC dentro do sistema, aberto a todos os usuários da equipe (link no pé do menu e na busca rápida):
// escolher a área, pesquisar a dúvida do seu jeito (em todo o manual ou na área aberta), dúvidas comuns com um toque,
// "Ir para a tela" em cada tela, abrir o manual inteiro e baixar em PDF (inteiro ou só a área). Texto em
// dominios/manual/conteudo.ts. Endereço direto: /manual?area=tarefas&tela=…; já pesquisando: /manual?busca=senha
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Inicio, IrParaTela, Resultados, TUDO, iconeDaArea } from "./_componentes/PartesManual";
import { BlocosManual } from "./_componentes/BlocosManual";
import { MANUAL_MD, VERSAO_MANUAL } from "@/dominios/manual/conteudo";
import { buscarNoManual, caminhoNoMenu, lerManual, nomeCurto, type AreaManual } from "@/dominios/manual/manual";
import { gerarManualPdf, imagemDoManualEmJpg } from "@/dominios/manual/manualPdf";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { caminho } from "@/lib/caminho";
import { traduzirErro } from "@/lib/erros";

export default function PaginaManual() {
  return (
    <Suspense>
      <Manual />
    </Suspense>
  );
}

function Manual() {
  const params = useSearchParams();
  const router = useRouter();
  const areas = useMemo(() => lerManual(MANUAL_MD), []);
  const [areaId, setAreaId] = useState<string | null>(() => params.get("area"));
  const [alvo, setAlvo] = useState<string | null>(() => params.get("tela"));
  const [busca, setBusca] = useState(() => params.get("busca") ?? "");
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const { aviso, mostrar } = useAviso();

  const area = areas.find((a) => a.id === areaId) ?? null;
  const resultados = useMemo(() => (busca.trim() ? buscarNoManual(areas, busca, area?.id ?? null) : []), [areas, busca, area]);

  // leva até a tela pedida (resultado da busca ou endereço direto) depois de desenhar a área
  useEffect(() => {
    if (!alvo) return;
    const t = setTimeout(() => document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(t);
  }, [alvo, areaId]);

  const abrir = (id: string | null, tela?: string) => {
    setBusca("");
    setAreaId(id);
    setAlvo(tela ?? null);
    router.replace(`/manual${id ? `?area=${id}${tela ? `&tela=${tela}` : ""}` : ""}`, { scroll: false });
    if (!tela) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const pesquisar = (texto: string) => {
    setAreaId(null);
    setBusca(texto);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function baixar(lista: AreaManual[], nome: string, subtitulo: string) {
    if (gerando) return;
    setGerando(true);
    setProgresso(0);
    try {
      const r = await fetch(caminho("/logo-mdc-dourado.png"));
      const logo = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      const bytes = await gerarManualPdf({
        areas: lista,
        titulo: "Manual do HUB-MDC",
        subtitulo,
        rodape: `MDC Assessoria Contábil · Manual do HUB-MDC · versão ${VERSAO_MANUAL.numero} · uso interno`,
        logo,
        imagem: (src) => imagemDoManualEmJpg(caminho(src)),
        aoAvancar: (feito, total) => setProgresso(Math.round((feito / total) * 100)),
      });
      baixarBytes(bytes, nome);
      mostrar("PDF do manual gerado.");
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      {aviso}
      <CabecalhoPagina
        titulo="Manual do HUB"
        descricao={`Passo a passo das telas (versão ${VERSAO_MANUAL.numero}, ${VERSAO_MANUAL.data}). Escreva sua dúvida do seu jeito, toque numa dúvida comum ou escolha a área.`}
        acoes={
          <button
            type="button"
            className="btn-primario"
            disabled={gerando}
            onClick={() =>
              void baixar(
                areas,
                `Manual-HUB-MDC-v${VERSAO_MANUAL.numero}.pdf`,
                `Versão ${VERSAO_MANUAL.numero} · ${VERSAO_MANUAL.data} · passo a passo das telas`,
              )
            }
          >
            <Icone nome="baixar" className="h-4 w-4" />
            {gerando ? `Gerando o PDF… ${progresso}%` : "Baixar o manual (PDF)"}
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Áreas do manual" className="hidden lg:block">
          <div className="cartao sticky top-4 max-h-[calc(100vh-2rem)] space-y-0.5 overflow-y-auto p-2">
            <ItemArea icone="casa" nome="Início do manual" ativo={!areaId} aoClicar={() => abrir(null)} />
            <ItemArea icone="documento" nome="Manual inteiro" ativo={areaId === TUDO} aoClicar={() => abrir(TUDO)} />
            <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Áreas</p>
            {areas.map((a) => (
              <ItemArea
                key={a.id}
                icone={iconeDaArea(a.id)}
                nome={a.titulo}
                qtd={a.telas.length}
                ativo={areaId === a.id}
                aoClicar={() => abrir(a.id)}
              />
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          <label className="campo lg:hidden">
            <span>Área do manual</span>
            <select value={areaId ?? ""} onChange={(e) => abrir(e.target.value || null)}>
              <option value="">Início do manual</option>
              <option value={TUDO}>Manual inteiro</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titulo}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Pesquisar no manual</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={area ? `Sua dúvida sobre ${area.titulo}…` : "Escreva sua dúvida (ex.: mesma tarefa para vários clientes)…"}
            />
          </label>
          {area && busca.trim() && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--texto-suave)]">
              Pesquisando só em <strong>{area.titulo}</strong>.
              <button type="button" className="btn" onClick={() => setAreaId(null)}>
                <Icone nome="busca" className="h-4 w-4" />
                Pesquisar em todo o manual
              </button>
            </p>
          )}

          {busca.trim() ? (
            <Resultados busca={busca} resultados={resultados} abrir={abrir} pesquisar={pesquisar} />
          ) : areaId === TUDO ? (
            areas.map((a) => <AreaCompleta key={a.id} area={a} />)
          ) : area ? (
            <>
              <AreaCompleta
                area={area}
                acoes={
                  <button
                    type="button"
                    className="btn"
                    disabled={gerando}
                    onClick={() => void baixar([area], `Manual-HUB-MDC-${area.id}.pdf`, `${area.titulo} · versão ${VERSAO_MANUAL.numero}`)}
                  >
                    <Icone nome="baixar" className="h-4 w-4" />
                    {gerando ? "Gerando…" : "Baixar esta área (PDF)"}
                  </button>
                }
                abrirTela={(t) => abrir(area.id, t)}
              />
              <Vizinhas areas={areas} atual={area} abrir={abrir} />
            </>
          ) : (
            <Inicio areas={areas} abrir={abrir} pesquisar={pesquisar} />
          )}
        </div>
      </div>
    </div>
  );
}

function ItemArea({
  icone,
  nome,
  qtd,
  ativo,
  aoClicar,
}: {
  icone: NomeIcone;
  nome: string;
  qtd?: number;
  ativo: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-current={ativo ? "page" : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
        ativo ? "bg-[var(--marca)] font-semibold text-white" : "text-[var(--texto)] hover:bg-[var(--fundo)]"
      }`}
    >
      <Icone nome={icone} className="h-4 w-4" />
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      {!!qtd && <span className={`text-xs ${ativo ? "text-white/80" : "text-[var(--texto-suave)]"}`}>{qtd}</span>}
    </button>
  );
}

function AreaCompleta({ area, acoes, abrirTela }: { area: AreaManual; acoes?: React.ReactNode; abrirTela?: (id: string) => void }) {
  return (
    <section className="space-y-4" aria-labelledby={`area-${area.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--destaque)] pb-2">
        <h2 id={`area-${area.id}`} className="flex items-center gap-2 text-xl font-semibold text-[var(--marca)]">
          <Icone nome={iconeDaArea(area.id)} />
          {area.titulo}
        </h2>
        {acoes}
      </div>
      {abrirTela && area.telas.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Telas desta área">
          {area.telas.map((t) => (
            <button
              key={t.id}
              type="button"
              className="rounded-full border border-[var(--borda)] bg-white px-3 py-1 text-[13px] hover:border-[var(--marca)]"
              onClick={() => abrirTela(t.id)}
            >
              {nomeCurto(t.titulo)}
            </button>
          ))}
        </div>
      )}
      {area.blocos.length > 0 && <BlocosManual blocos={area.blocos} />}
      {area.telas.map((t) => {
        const menu = caminhoNoMenu(t.titulo);
        return (
          <article key={t.id} id={t.id} className="cartao scroll-mt-4 space-y-3 p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-[var(--marca)]">{nomeCurto(t.titulo)}</h3>
              <span className="flex flex-wrap items-center gap-2">
                {menu && <span className="text-xs text-[var(--texto-suave)]">No menu: {menu}</span>}
                <IrParaTela titulo={t.titulo} />
              </span>
            </header>
            <BlocosManual blocos={t.blocos} />
          </article>
        );
      })}
    </section>
  );
}

function Vizinhas({ areas, atual, abrir }: { areas: AreaManual[]; atual: AreaManual; abrir: (id: string | null) => void }) {
  const i = areas.findIndex((a) => a.id === atual.id);
  const antes = areas[i - 1];
  const depois = areas[i + 1];
  return (
    <div className="flex flex-wrap justify-between gap-2 pt-2">
      {antes ? (
        <button type="button" className="btn" onClick={() => abrir(antes.id)}>
          <Icone nome="voltar" className="h-4 w-4" />
          {antes.titulo}
        </button>
      ) : (
        <span />
      )}
      {depois && (
        <button type="button" className="btn" onClick={() => abrir(depois.id)}>
          {depois.titulo}
          <Icone nome="expandir" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
