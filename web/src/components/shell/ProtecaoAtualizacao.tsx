// Proteção contra travamento quando o HUB é publicado com alguém usando (14/11/2026). Montada uma vez no layout raiz,
// vale para todas as telas (HUB, MDC · Pessoal, Portal, login e TV):
// 1. Pergunta a cada 3 minutos (e ao voltar para a aba) se saiu versão nova (/api/versao). Saiu: mostra um aviso
//    discreto "Nova versão disponível" e a pessoa escolhe a hora de atualizar. Nunca recarrega sozinho com algo
//    digitado e não salvo. Na TV (sem formulário) atualiza sozinha.
// 2. Se uma parte da tela não carrega porque os arquivos da versão antiga sumiram, recarrega uma única vez (sem loop)
//    quando não há nada digitado; com algo digitado, mostra o aviso para a pessoa salvar antes.
// 3. Marca as janelas e formulários onde a pessoa digitou e, ao sair ou recarregar a página com algo não salvo, o
//    navegador pergunta antes ("Sair do site? As alterações podem não ser salvas").
"use client";

import { useCallback, useEffect, useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { caminho } from "@/lib/caminho";
import {
  CHAVE_ULTIMA_RECARGA,
  INTERVALO_VERSAO_MS,
  VERSAO_ATUAL,
  ehArquivoDoSite,
  ehFalhaDeCarregamento,
  podeRecarregarSozinho,
  saiuVersaoNova,
} from "@/lib/atualizacao";
import { ATRIBUTO_ALTERADO, haAlteracoesNaoSalvas } from "@/lib/rascunho";

type Motivo = "versao" | "falha";

/** Recarrega a página, no máximo uma vez por minuto. Devolve false quando não recarregou. */
export function recarregarUmaVez(): boolean {
  let ultima: number | null = null;
  try {
    const v = sessionStorage.getItem(CHAVE_ULTIMA_RECARGA);
    ultima = v ? Number(v) : null;
  } catch {
    /* sem armazenamento */
  }
  if (!podeRecarregarSozinho(ultima)) return false;
  try {
    sessionStorage.setItem(CHAVE_ULTIMA_RECARGA, String(Date.now()));
  } catch {
    /* sem armazenamento: recarrega mesmo assim (o próximo erro não recarrega de novo nesta visita) */
  }
  window.location.reload();
  return true;
}

/** Elemento que guarda o que a pessoa digita: janela aberta ou formulário (a busca e os filtros não contam). */
function areaDoCampo(alvo: EventTarget | null): Element | null {
  if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement)) return null;
  if (alvo instanceof HTMLInputElement && ["search", "password", "file"].includes(alvo.type)) return null;
  const area = alvo.closest('[role="dialog"], form');
  if (!area || area.getAttribute("role") === "search" || area.hasAttribute("data-sem-protecao")) return null;
  return area;
}

export function ProtecaoAtualizacao() {
  const [aviso, setAviso] = useState<Motivo | null>(null);

  const naTv = () => window.location.pathname.includes("/tv");

  const conferirVersao = useCallback(async () => {
    if (!VERSAO_ATUAL || document.visibilityState === "hidden") return;
    try {
      const r = await fetch(caminho("/api/versao"), { cache: "no-store" });
      if (!r.ok) return;
      const { versao } = (await r.json()) as { versao?: string | null };
      if (!saiuVersaoNova(VERSAO_ATUAL, versao)) return;
      if (naTv() && !haAlteracoesNaoSalvas() && recarregarUmaVez()) return;
      setAviso((a) => a ?? "versao");
    } catch {
      // sem internet: tenta de novo na próxima vez
    }
  }, []);

  const falhaDeCarregamento = useCallback(() => {
    if (!haAlteracoesNaoSalvas() && recarregarUmaVez()) return;
    setAviso("falha");
  }, []);

  // 1. versão nova
  useEffect(() => {
    const t = setInterval(() => void conferirVersao(), INTERVALO_VERSAO_MS);
    const aoVoltar = () => document.visibilityState === "visible" && void conferirVersao();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [conferirVersao]);

  // 2. parte da tela que não carregou
  useEffect(() => {
    const aoErro = (e: Event) => {
      const alvo = e.target;
      const arquivo =
        alvo instanceof HTMLScriptElement ? alvo.src : alvo instanceof HTMLLinkElement && alvo.rel === "stylesheet" ? alvo.href : null;
      if ((arquivo && ehArquivoDoSite(arquivo)) || (e instanceof ErrorEvent && ehFalhaDeCarregamento(e.error ?? e.message)))
        falhaDeCarregamento();
    };
    const aoRejeitar = (e: PromiseRejectionEvent) => {
      if (ehFalhaDeCarregamento(e.reason)) falhaDeCarregamento();
    };
    window.addEventListener("error", aoErro, true);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      window.removeEventListener("error", aoErro, true);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, [falhaDeCarregamento]);

  // 3. o que foi digitado e não salvo
  useEffect(() => {
    const aoDigitar = (e: Event) => areaDoCampo(e.target)?.setAttribute(ATRIBUTO_ALTERADO, "");
    // formulário enviado: a tela decide (fecha a janela ao salvar; com erro a pessoa continua e digita de novo)
    const aoEnviar = (e: Event) => {
      if (e.target instanceof HTMLFormElement) e.target.removeAttribute(ATRIBUTO_ALTERADO);
    };
    const aoSair = (e: BeforeUnloadEvent) => {
      if (!haAlteracoesNaoSalvas()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("input", aoDigitar, true);
    document.addEventListener("change", aoDigitar, true);
    document.addEventListener("submit", aoEnviar, true);
    window.addEventListener("beforeunload", aoSair);
    return () => {
      document.removeEventListener("input", aoDigitar, true);
      document.removeEventListener("change", aoDigitar, true);
      document.removeEventListener("submit", aoEnviar, true);
      window.removeEventListener("beforeunload", aoSair);
    };
  }, []);

  if (!aviso) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-[var(--borda)] bg-white p-3 shadow-lg print:hidden sm:bottom-5"
    >
      <Icone nome={aviso === "falha" ? "alerta" : "atualizar"} className="h-5 w-5 shrink-0 text-[var(--marca)]" />
      <p className="min-w-0 flex-1 text-sm text-neutral-700">
        {aviso === "falha" ? (
          <>
            <b>O sistema foi atualizado</b> e parte desta tela não carregou. Salve o que está fazendo e clique em Atualizar.
          </>
        ) : (
          <>
            <b>Nova versão disponível.</b> Salve o que está fazendo e clique em Atualizar.
          </>
        )}
      </p>
      <div className="flex gap-2">
        <button className="btn-primario" onClick={() => window.location.reload()}>
          <Icone nome="atualizar" className="h-4 w-4" />
          Atualizar
        </button>
        <button className="btn" onClick={() => setAviso(null)}>
          Depois
        </button>
      </div>
    </div>
  );
}
