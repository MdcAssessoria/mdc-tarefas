// Janela "Liberar acesso de quem falta" (Pessoas e acessos): o administrador marca as pessoas e o HUB gera uma senha
// provisória para cada uma, em sequência, pela mesma função da senha individual (Função convite, 071). Depois mostra
// cada senha uma única vez, com "Enviar pelo WhatsApp" e "Copiar mensagem". No primeiro acesso a pessoa cria a própria.
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { enderecoHub } from "@/lib/caminho";
import { gerarSenhaProvisoria } from "@/dominios/acessos/convite";
import type { CandidatoAcesso } from "@/dominios/acessos/liberarAcessos";
import { mensagemSenha } from "./SenhaCopiavel";

interface Resultado {
  email: string;
  nome: string;
  senha?: string;
  endereco?: string;
  erro?: string;
}

export function LiberarAcessos({
  candidatos,
  aoFechar,
}: {
  candidatos: CandidatoAcesso[];
  /** Fecha a janela; `gerou` avisa a tela para recarregar a lista (convites viram contas). */
  aoFechar: (gerou: boolean) => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(candidatos.filter((c) => c.pendente).map((c) => c.email)));
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null);
  const [copiado, setCopiado] = useState("");

  const alternar = (email: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });

  async function gerar() {
    const escolhidos = candidatos.filter((c) => marcados.has(c.email));
    const feitos: Resultado[] = [];
    setAndamento({ feitos: 0, total: escolhidos.length });
    // um de cada vez: cada senha nova anula a anterior daquela pessoa e o servidor não fica sobrecarregado
    for (const c of escolhidos) {
      const r = await gerarSenhaProvisoria(c.email, c.nome);
      feitos.push(
        r.senha
          ? { email: c.email, nome: c.nome, senha: r.senha, endereco: r.endereco ?? enderecoHub("/login") }
          : { email: c.email, nome: c.nome, erro: r.erro ?? "Não foi possível gerar a senha agora." },
      );
      setAndamento({ feitos: feitos.length, total: escolhidos.length });
    }
    setResultados(feitos);
    setAndamento(null);
  }

  async function copiar(r: Resultado) {
    if (!r.senha) return;
    try {
      await navigator.clipboard.writeText(mensagemSenha({ nome: r.nome, email: r.email, senha: r.senha, endereco: r.endereco ?? "" }));
      setCopiado(r.email);
    } catch {
      setCopiado("");
    }
  }

  const gerou = Boolean(resultados?.some((r) => r.senha));
  const ok = resultados?.filter((r) => r.senha) ?? [];
  const falhas = resultados?.filter((r) => r.erro) ?? [];

  return (
    <Modal
      titulo={resultados ? "Senhas provisórias prontas" : "Liberar acesso de quem falta"}
      descricao={
        resultados
          ? "Mande cada senha agora: ela aparece só desta vez. No primeiro acesso o HUB pede para a pessoa criar a própria senha."
          : "Marque as pessoas. O HUB gera uma senha provisória para cada uma e você manda pelo WhatsApp. Quem já tinha senha passa a usar a nova."
      }
      largura="4xl"
      aoFechar={() => !andamento && aoFechar(gerou)}
      rodape={
        resultados ? (
          <button className="btn-primario" onClick={() => aoFechar(gerou)}>
            <Icone nome="check" className="h-4 w-4" />
            Concluir
          </button>
        ) : (
          <>
            <button className="btn-primario" disabled={!marcados.size || !!andamento} onClick={() => void gerar()}>
              <Icone nome="escudo" className="h-4 w-4" />
              {andamento ? `Gerando ${andamento.feitos} de ${andamento.total}…` : `Gerar ${marcados.size} senha(s)`}
            </button>
            <button className="btn" disabled={!!andamento} onClick={() => aoFechar(false)}>
              <Icone nome="voltar" className="h-4 w-4" />
              Voltar
            </button>
          </>
        )
      }
    >
      {!resultados ? (
        candidatos.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {candidatos.map((c) => {
              const marcado = marcados.has(c.email);
              return (
                <li key={c.email}>
                  <label
                    className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                      marcado ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"
                    }`}
                  >
                    <input type="checkbox" className="mt-1" checked={marcado} disabled={!!andamento} onChange={() => alternar(c.email)} />
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-800">{c.nome}</span>
                      <span className="block truncate text-xs text-neutral-500">{c.email}</span>
                      <span
                        className={`chip mt-1 inline-block ${c.pendente ? "bg-amber-50 text-amber-900" : "bg-neutral-100 text-neutral-700"}`}
                      >
                        {c.motivo}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-neutral-600">Todo mundo da equipe já tem acesso. Para cadastrar alguém, use “Cadastrar pessoa”.</p>
        )
      ) : (
        <div className="space-y-3">
          {falhas.length > 0 && (
            <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              <b>Não deu para gerar {falhas.length === 1 ? "esta senha" : "estas senhas"}:</b>
              <ul className="mt-1 list-disc pl-5">
                {falhas.map((r) => (
                  <li key={r.email}>
                    {r.nome}: {r.erro}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Tente de novo pela linha da pessoa em “Equipe MDC” (“Redefinir senha” ou “Gerar senha provisória”).</p>
            </div>
          )}
          <ul className="grid gap-2 lg:grid-cols-2">
            {ok.map((r) => (
              <li key={r.email} className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="font-medium text-neutral-800">{r.nome}</div>
                <div className="truncate text-xs text-neutral-500">{r.email}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-600">Senha</span>
                  <code className="select-all text-base font-semibold tracking-wider text-[var(--marca)]">{r.senha}</code>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    className="btn !min-h-8"
                    href={`https://wa.me/?text=${encodeURIComponent(
                      mensagemSenha({ nome: r.nome, email: r.email, senha: r.senha ?? "", endereco: r.endereco ?? "" }),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icone nome="enviar" className="h-4 w-4" />
                    Enviar pelo WhatsApp
                  </a>
                  <button className="btn !min-h-8" onClick={() => void copiar(r)}>
                    <Icone nome="copiar" className="h-4 w-4" />
                    {copiado === r.email ? "Mensagem copiada" : "Copiar mensagem"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
