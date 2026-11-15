// "Excluir minha conta" do MDC · Pessoal (083): página pública, exigida pela Google Play (link fora do app) e direito do
// titular pela LGPD. Sem login, explica e leva a entrar; com login, pede a palavra EXCLUIR e chama a Função Edge
// pessoal-excluir-conta (apaga as famílias em que a pessoa está sozinha, tira das outras e apaga o login).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { caminho } from "@/lib/caminho";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { PaginaSimples, Secao } from "../_componentes/PaginaSimples";

type Estado = { tipo: "carregando" } | { tipo: "sem-login" } | { tipo: "logado"; email: string } | { tipo: "excluida" };

export default function ExcluirConta() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [palavra, setPalavra] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!vivo) return;
        const email = data.session?.user.email;
        setEstado(email ? { tipo: "logado", email } : { tipo: "sem-login" });
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function excluir(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (palavra.trim().toUpperCase() !== "EXCLUIR") return setErro("Para confirmar, escreva EXCLUIR no campo.");
    setEnviando(true);
    setErro(null);
    try {
      await chamarFuncao("pessoal-excluir-conta", { corpo: { confirmacao: palavra } });
      await supabase()
        .auth.signOut()
        .catch(() => undefined);
      setEstado({ tipo: "excluida" });
    } catch (e2) {
      setErro(traduzirErro(e2));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaSimples titulo="Excluir minha conta">
      {estado.tipo === "excluida" ? (
        <div className="space-y-3 text-center">
          <Icone nome="check" className="mx-auto h-10 w-10 text-emerald-700" />
          <p className="text-lg font-semibold text-[var(--marca)]">Sua conta foi excluída.</p>
          <p>Os seus dados foram apagados. Se quiser voltar um dia, é só criar uma conta nova.</p>
        </div>
      ) : (
        <>
          <Secao titulo="O que acontece">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>Família em que só você está:</b> é apagada inteira, com todas as contas, lançamentos, extratos e tarefas.
              </li>
              <li>
                <b>Família com outras pessoas:</b> você sai e os lançamentos continuam com elas. Se você era o único responsável, a pessoa mais
                antiga da família passa a ser.
              </li>
              <li>
                <b>Seu login</b> (nome, e-mail e senha), avisos no celular e a autorização de contato da MDC são apagados.
              </li>
              <li>
                <b>Não dá para desfazer.</b> Se quiser guardar alguma coisa, exporte em Excel ou PDF antes.
              </li>
            </ul>
          </Secao>

          {estado.tipo === "carregando" && <p className="text-sm text-neutral-500">Carregando…</p>}

          {estado.tipo === "sem-login" && (
            <div className="space-y-3 rounded-xl bg-[#F1EEE5] p-4">
              <p>Para excluir, entre primeiro na sua conta. Depois você volta para esta página.</p>
              <a className="btn-primario inline-flex" href={caminho(`/login?next=${encodeURIComponent("/pessoal/excluir-conta")}`)}>
                <Icone nome="seta-direita" className="h-4 w-4" />
                Entrar para excluir
              </a>
              <p className="text-sm text-neutral-600">
                Não consegue entrar? Peça a exclusão pelo e-mail ou WhatsApp que estão na{" "}
                <Link href="/pessoal/privacidade" className="font-semibold text-[#8A6A2A] underline">
                  Política de privacidade
                </Link>
                .
              </p>
            </div>
          )}

          {estado.tipo === "logado" && (
            <form onSubmit={(e) => void excluir(e)} className="space-y-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
              <p>
                Você está na conta <b>{estado.email}</b>.
              </p>
              <label className="campo">
                <span>Para confirmar, escreva EXCLUIR</span>
                <input value={palavra} onChange={(e) => setPalavra(e.target.value)} autoComplete="off" autoCapitalize="characters" required />
              </label>
              {erro && (
                <p className="rounded-md bg-red-100 p-2 text-sm text-red-800" role="alert">
                  {erro}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-perigo" disabled={enviando}>
                  <Icone nome="lixeira" className="h-4 w-4" />
                  {enviando ? "Excluindo…" : "Excluir minha conta"}
                </button>
                <Link href="/pessoal" className="btn">
                  <Icone nome="voltar" className="h-4 w-4" />
                  Voltar
                </Link>
              </div>
            </form>
          )}
        </>
      )}
    </PaginaSimples>
  );
}
