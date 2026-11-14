// Janela "Convidar alguém" da tela Família (075): o responsável dá um nome e escolhe a permissão; o banco
// (pessoal_convidar) devolve o código, que aparece UMA vez com o link, "Copiar mensagem" e "Enviar pelo WhatsApp".
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { BASE } from "@/lib/caminho";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { PERMISSOES, linkConvite, mensagemConvite, whatsappDe } from "../familia";

type Escolha = "lancar" | "consultar";

export function JanelaConvidar({ orgId, familia, aoFechar }: { orgId: string; familia: string; aoFechar: (criou: boolean) => void }) {
  const [nome, setNome] = useState("");
  const [permissao, setPermissao] = useState<Escolha>("lancar");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro("Escreva o nome de quem você vai convidar");
    setOcupado(true);
    setErro("");
    try {
      const { data, error } = await supabase().rpc("pessoal_convidar", { p_org: orgId, p_nome: nome.trim(), p_permissao: permissao });
      if (error) throw error;
      setCodigo(String(data));
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setOcupado(false);
    }
  }

  if (codigo) {
    const link = linkConvite(window.location.origin, BASE, codigo);
    const mensagem = mensagemConvite(familia, link, codigo);
    const copiar = async () => {
      try {
        await navigator.clipboard.writeText(mensagem);
        setCopiado(true);
      } catch {
        setErro("Não deu para copiar: selecione o texto e copie com o dedo ou o mouse");
      }
    };
    return (
      <Modal
        titulo={`Convite para ${nome.trim()} pronto`}
        descricao="Mande agora: por segurança o código aparece só desta vez. Vale por 7 dias e para uma pessoa."
        aoFechar={() => aoFechar(true)}
        largura="lg"
        avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
        rodape={
          <>
            <a className="btn-primario" href={whatsappDe(mensagem)} target="_blank" rel="noopener noreferrer">
              <Icone nome="enviar" className="h-4 w-4" />
              Enviar pelo WhatsApp
            </a>
            <button type="button" className="btn" onClick={() => void copiar()}>
              <Icone nome={copiado ? "check" : "copiar"} className="h-4 w-4" />
              {copiado ? "Mensagem copiada" : "Copiar mensagem"}
            </button>
            <button type="button" className="btn" onClick={() => aoFechar(true)}>
              <Icone nome="voltar" className="h-4 w-4" />
              Voltar
            </button>
          </>
        }
      >
        <div className="rounded-xl bg-[var(--fundo)] p-4 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--texto-suave)]">Código do convite</span>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-[var(--marca)]">{codigo}</p>
        </div>
        <p className="whitespace-pre-line break-words rounded-lg border border-neutral-200 p-3 text-sm text-neutral-700">{mensagem}</p>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Convidar alguém para a família"
      descricao="Quem você convidar cria a própria conta e a própria senha. Você pode mudar a permissão depois."
      aoFechar={() => aoFechar(false)}
      largura="xl"
      avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
      rodape={
        <>
          <button type="submit" form="form-convidar" className="btn-primario" disabled={ocupado}>
            <Icone nome="mais" className="h-4 w-4" />
            {ocupado ? "Gerando…" : "Gerar convite"}
          </button>
          <button type="button" className="btn" onClick={() => aoFechar(false)} disabled={ocupado}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-convidar" onSubmit={(e) => void gerar(e)} className="space-y-4">
        <label className="campo">
          <span>Nome de quem vai entrar</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Bia, Pedro, Mãe" required />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-700">O que essa pessoa pode fazer</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSOES.filter((p) => p.valor !== "responsavel").map((p) => {
              const marcado = permissao === p.valor;
              return (
                <button
                  key={p.valor}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => setPermissao(p.valor as Escolha)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left ${
                    marcado ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-neutral-200 bg-white"
                  }`}
                >
                  <Icone
                    nome={marcado ? "check" : p.valor === "lancar" ? "editar" : "olho"}
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]"
                  />
                  <span>
                    <b className="block text-[var(--marca)]">{p.nome}</b>
                    <span className="text-sm text-neutral-600">{p.explica}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
