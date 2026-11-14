// Rascunho automático de formulários e o controle de "alterações não salvas" (atualização sem perda de dados, 14/11/2026).
// - useRascunho: guarda o formulário neste navegador enquanto a pessoa digita e, se a página recarregar (sistema
//   atualizado, queda de internet, aba fechada), oferece "Recuperar" na próxima vez que o formulário abrir.
//   O rascunho só some quando a gravação no banco dá certo (limpar) ou quando a pessoa escolhe "Descartar".
// - haAlteracoesNaoSalvas: diz se há algo digitado e não salvo em qualquer janela ou formulário aberto. Usado para
//   nunca recarregar a página sozinho e para o navegador perguntar antes de sair (ProtecaoAtualizacao).
// Nunca guarde aqui senha, PIN, token ou dados de certificado. Chave: CHAVES.rascunho (armazenamentoLocal.ts).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAVES } from "./armazenamentoLocal";

/** Rascunho mais velho que isso é ignorado e apagado ao abrir o formulário. */
export const VALIDADE_RASCUNHO_MS = 7 * 24 * 60 * 60 * 1000;
const ESPERA_GRAVAR_MS = 500;

export interface Rascunho<T> {
  valor: T;
  /** Momento em que foi guardado (milissegundos). */
  em: number;
}

/** Lê o rascunho da chave; null se não houver, estiver estragado ou vencido (o vencido é apagado). */
export function lerRascunho<T>(chave: string, agora = Date.now()): Rascunho<T> | null {
  let texto: string | null = null;
  try {
    texto = localStorage.getItem(chave);
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    const r = JSON.parse(texto) as Rascunho<T>;
    if (typeof r?.em !== "number" || !("valor" in r)) return null;
    if (agora - r.em > VALIDADE_RASCUNHO_MS) {
      apagarRascunho(chave);
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

export function gravarRascunho<T>(chave: string, valor: T, agora = Date.now()): void {
  try {
    localStorage.setItem(chave, JSON.stringify({ valor, em: agora } satisfies Rascunho<T>));
  } catch {
    // navegador sem armazenamento (aba anônima): segue sem rascunho
  }
}

export function apagarRascunho(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* sem armazenamento */
  }
}

/** Dois valores de formulário são iguais (comparação pelo conteúdo). */
export function mesmoConteudo(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ----------------------------------------------------------------------------------------------- alterações não salvas
const comAlteracao = new Set<string>();

/** Marca (ou desmarca) um formulário como tendo alterações não salvas. */
export function marcarAlterado(id: string, alterado: boolean): void {
  if (alterado) comAlteracao.add(id);
  else comAlteracao.delete(id);
}

/** Atributo que a ProtecaoAtualizacao põe na janela/formulário onde a pessoa digitou algo. */
export const ATRIBUTO_ALTERADO = "data-alteracao-nao-salva";

/**
 * Há algo digitado e não salvo na tela: formulário com useRascunho alterado, ou qualquer janela/formulário ainda aberto
 * onde a pessoa digitou (marcado pela ProtecaoAtualizacao). Janela fechada some da tela e deixa de contar.
 */
export function haAlteracoesNaoSalvas(): boolean {
  if (comAlteracao.size > 0) return true;
  if (typeof document === "undefined") return false;
  return document.querySelector(`[${ATRIBUTO_ALTERADO}]`) !== null;
}

// ----------------------------------------------------------------------------------------------- hook
/** Rascunho guardado que vale a pena oferecer: existe e é diferente de como o formulário abriu. */
function rascunhoParaOferecer<T>(chave: string | null, original: T): Rascunho<T> | null {
  if (!chave) return null;
  const r = lerRascunho<T>(chave);
  return r && !mesmoConteudo(r.valor, original) ? r : null;
}

/**
 * Rascunho automático de um formulário.
 * @param contexto o que identifica o formulário e o registro, ex.: `tarefa:nova`, `tarefa:<id>`, `rotina:<id>`.
 *                 null = formulário fechado (nada é guardado).
 * @param usuario  quem está logado: o rascunho de uma pessoa nunca aparece para outra no mesmo computador.
 * @param valor    estado atual do formulário.
 * @param original como o formulário abriu (sem alteração não há rascunho).
 * @param aplicar  põe o rascunho recuperado de volta no formulário.
 */
export function useRascunho<T>(contexto: string | null, usuario: string, valor: T, original: T, aplicar: (v: T) => void) {
  const chave = contexto ? CHAVES.rascunho(usuario, contexto) : null;
  // por formulário aberto: como ele abriu e o rascunho encontrado (diferente do que abriu) para oferecer "Recuperar"
  const [aberto, setAberto] = useState(() => ({ chave, original, pendente: rascunhoParaOferecer(chave, original) }));
  if (aberto.chave !== chave) setAberto({ chave, original, pendente: rascunhoParaOferecer(chave, original) });
  const { pendente } = aberto;
  const aplicarRef = useRef(aplicar);
  useEffect(() => {
    aplicarRef.current = aplicar;
  });

  // enquanto digita: guarda (com uma pequena espera) ou apaga se voltou ao original
  const texto = JSON.stringify(valor);
  const textoOriginal = JSON.stringify(aberto.original);
  useEffect(() => {
    if (!chave || pendente) return;
    const alterado = texto !== textoOriginal;
    marcarAlterado(chave, alterado);
    const t = setTimeout(() => (alterado ? gravarRascunho(chave, JSON.parse(texto) as T) : apagarRascunho(chave)), ESPERA_GRAVAR_MS);
    return () => clearTimeout(t);
  }, [chave, texto, textoOriginal, pendente]);

  // formulário fechado: deixa de contar como "não salvo" (o rascunho continua guardado para a próxima vez)
  useEffect(() => {
    if (!chave) return;
    return () => marcarAlterado(chave, false);
  }, [chave]);

  const recuperar = useCallback(() => {
    if (!pendente) return;
    aplicarRef.current(pendente.valor);
    setAberto((a) => ({ ...a, pendente: null }));
  }, [pendente]);

  const descartar = useCallback(() => {
    if (chave) apagarRascunho(chave);
    setAberto((a) => ({ ...a, pendente: null }));
  }, [chave]);

  /** Chame depois de gravar no banco com sucesso. */
  const limpar = useCallback(() => {
    if (!chave) return;
    apagarRascunho(chave);
    marcarAlterado(chave, false);
  }, [chave]);

  return { pendente, recuperar, descartar, limpar };
}
