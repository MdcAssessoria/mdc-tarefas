// Tela de erro de todas as páginas (14/11/2026): no lugar da tela branca ou congelada, uma mensagem simples com
// "Recarregar". Se o erro for de arquivo da versão antiga que sumiu (sistema publicado com a aba aberta) e não houver
// nada digitado, recarrega sozinha uma única vez. Os rascunhos dos formulários continuam guardados (lib/rascunho.ts).
"use client";

import { useEffect } from "react";
import { Icone } from "@/components/ui/Icone";
import { recarregarUmaVez } from "@/components/shell/ProtecaoAtualizacao";
import { ehFalhaDeCarregamento } from "@/lib/atualizacao";
import { haAlteracoesNaoSalvas } from "@/lib/rascunho";

export default function ErroDaTela({ error, retry }: { error: unknown; retry: () => void }) {
  const atualizado = ehFalhaDeCarregamento(error);
  useEffect(() => {
    console.error(error);
    if (atualizado && !haAlteracoesNaoSalvas()) recarregarUmaVez();
  }, [error, atualizado]);

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="cartao max-w-md p-6 text-center">
        <Icone nome={atualizado ? "atualizar" : "alerta"} className="mx-auto h-8 w-8 text-[var(--marca)]" />
        <h1 className="mt-3 text-lg font-semibold text-[var(--marca)]">
          {atualizado ? "O sistema foi atualizado" : "Esta tela teve um problema"}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {atualizado
            ? "Clique em Recarregar para abrir a versão nova. O que você estava digitando nos formulários fica guardado e aparece para recuperar."
            : "Clique em Tentar de novo. Se continuar, clique em Recarregar ou avise o administrador do HUB."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn-primario" onClick={() => window.location.reload()}>
            <Icone nome="atualizar" className="h-4 w-4" />
            Recarregar
          </button>
          {!atualizado && (
            <button className="btn" onClick={() => retry()}>
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
