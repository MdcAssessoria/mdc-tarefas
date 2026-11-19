// Rodapé do sino: liga ou desliga os avisos NESTE aparelho (Web Push), para o lembrete de compromisso das tarefas
// (10 min antes e na hora, 089) chegar no celular ou no computador mesmo com o HUB fechado. Usa as mesmas peças do
// resumo do MDC · Pessoal (dominios/pessoal/avisoCelular.ts).
"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { traduzirErro } from "@/lib/erros";
import { desligarNoAparelho, lerSituacaoDoAparelho, ligarNoAparelho } from "@/dominios/pessoal/avisoCelular";
import type { SituacaoAparelho } from "@/dominios/pessoal/avisoCelular";

const TEXTO: Record<SituacaoAparelho, string> = {
  "sem-suporte": "Este navegador não mostra avisos. Use o Chrome ou o Edge no computador ou no Android, ou o app instalado no iPhone.",
  "precisa-instalar": "No iPhone, instale o HUB (Compartilhar › Adicionar à Tela de Início), abra por ele e ative aqui.",
  bloqueado: "Os avisos estão bloqueados neste navegador. Libere no cadeado ao lado do endereço e tente de novo.",
  ligado: "Este aparelho recebe os lembretes dos seus compromissos, mesmo com o HUB fechado.",
  desligado: "Ative para receber o lembrete dos compromissos (10 min antes e na hora) mesmo com o HUB fechado.",
};

export function AvisosAparelho() {
  const [situacao, setSituacao] = useState<SituacaoAparelho | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    lerSituacaoDoAparelho()
      .then((s) => vivo && setSituacao(s))
      .catch(() => vivo && setSituacao("sem-suporte"));
    return () => {
      vivo = false;
    };
  }, []);

  async function trocar() {
    setOcupado(true);
    setErro(null);
    try {
      setSituacao(situacao === "ligado" ? await desligarNoAparelho() : await ligarNoAparelho());
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!situacao) return null;
  const podeTrocar = situacao === "ligado" || situacao === "desligado";
  return (
    <div className="space-y-1.5 border-t border-[var(--borda)] bg-[var(--fundo)] px-3 py-2 text-xs">
      <p className="flex items-start gap-1.5 text-[var(--texto-suave)]">
        <Icone nome={situacao === "ligado" ? "check" : "sino"} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {TEXTO[situacao]}
      </p>
      {podeTrocar && (
        <button
          className={situacao === "ligado" ? "btn !min-h-8 !py-1 text-xs" : "btn-primario !min-h-8 !py-1 text-xs"}
          disabled={ocupado}
          onClick={() => void trocar()}
        >
          <Icone nome={situacao === "ligado" ? "fechar" : "sino"} className="h-3.5 w-3.5" />
          {ocupado ? "Aguarde…" : situacao === "ligado" ? "Desligar avisos neste aparelho" : "Ativar avisos neste aparelho"}
        </button>
      )}
      {erro && <p className="rounded bg-red-50 p-1.5 text-red-800">{erro}</p>}
    </div>
  );
}
