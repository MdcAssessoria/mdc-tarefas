"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";
import { LINHA_EMPRESA } from "@/lib/identidade";
import { precisaTrocarSenha } from "@/lib/senhaProvisoria";

// Contas são criadas pelo administrador. Desde 12/11/2026 o acesso vai por senha provisória (WhatsApp): quem entra com
// ela cai no modo "trocar" e precisa criar a própria senha antes de usar o HUB (marca trocar_senha, migração 071).
// Os links antigos de convite e de nova senha (e-mail) continuam funcionando ("convite" e "nova").
type Modo = "entrar" | "recuperar" | "nova" | "convite" | "trocar";

const TITULO: Record<Modo, string> = {
  entrar: "Entrar",
  recuperar: "Recuperar senha",
  nova: "Nova senha",
  convite: "Crie sua senha",
  trocar: "Crie sua senha",
};

export default function Login() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [semSessao, setSemSessao] = useState(false);

  // chegou com ?trocar=1 (o HUB mandou trocar a senha provisória): só vale com sessão aberta
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("trocar")) return;
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (precisaTrocarSenha(data.session)) setModo("trocar");
      });
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const pedido: Modo | null =
      q.get("convite") || /type=invite/.test(hash) ? "convite" : q.get("redefinir") || /type=recovery/.test(hash) ? "nova" : null;
    if (!pedido) return;
    setModo(pedido);
    // o link do e-mail abre a sessão; sem ela o link expirou ou já foi usado
    const sb = supabase();
    const t = setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) setSemSessao(true);
    }, 1200);
    const { data } = sb.auth.onAuthStateChange((_e, s) => s && setSemSessao(false));
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, []);

  function destino() {
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? caminho(n) : caminho("/");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if ((modo === "nova" || modo === "convite" || modo === "trocar") && senha !== confirma) {
      setMsg({ tipo: "erro", texto: "As duas senhas não conferem." });
      return;
    }
    setEnviando(true);
    const sb = supabase();
    try {
      if (modo === "entrar") {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        if (precisaTrocarSenha(data.session)) {
          // senha provisória: cria a própria antes de entrar
          setSenha("");
          setConfirma("");
          setModo("trocar");
          return;
        }
        window.location.replace(destino());
        return;
      }
      if (modo === "trocar") {
        // a sessão aberta com a provisória precisa existir; se caiu (aba antiga, outro aparelho), a pessoa entra de novo
        const { data: atual } = await sb.auth.getSession();
        if (!atual.session) {
          setModo("entrar");
          throw new Error("Sua sessão com a senha provisória terminou. Entre de novo com o e-mail e a senha provisória.");
        }
        const emailConta = atual.session.user.email ?? email;
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        const { error: eMarca } = await sb.rpc("hub_senha_trocada");
        if (eMarca) throw eMarca;
        // renova a sessão sem a marca trocar_senha; se a renovação falhar, entra de novo com a senha nova
        const { data: renovada, error: eRenovar } = await sb.auth.refreshSession();
        if (eRenovar || !renovada.session) {
          const { error: eEntrar } = await sb.auth.signInWithPassword({ email: emailConta, password: senha });
          if (eEntrar) {
            setModo("entrar");
            throw new Error("Senha criada. Entre de novo com o seu e-mail e a senha nova.");
          }
        }
        window.location.replace(destino());
        return;
      }
      if (modo === "nova" || modo === "convite") {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        window.location.replace(caminho("/"));
        return;
      }
    } catch (err) {
      setMsg({ tipo: "erro", texto: traduzirErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  const definindoSenha = modo === "nova" || modo === "convite" || modo === "trocar";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      {/* capa */}
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[var(--marca)] px-8 py-12 text-[#C6D3CC] lg:py-0">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(226,193,126,0.14),transparent_62%)]" />
        <img src={caminho("/logo-mdc-dourado.png")} alt="MDC Assessoria" className="relative w-56 max-w-[70vw] sm:w-72 lg:w-[26rem]" />
        <div className="relative mt-8 h-px w-40 bg-gradient-to-r from-transparent via-[var(--destaque)] to-transparent lg:mt-10" />
        <p className="relative mt-6 text-center text-xs uppercase tracking-[0.3em] text-[var(--destaque)] sm:text-sm">
          Contábil · Tributária · Gestão Financeira
        </p>
        <p className="relative mt-4 hidden max-w-md text-center text-lg font-light leading-relaxed text-white/90 lg:block">
          Tarefas, societário, demonstrativos, atendimento e o Portal do Cliente em um só lugar.
        </p>
        <p className="relative mt-10 hidden text-xs text-[#C6D3CC]/70 lg:block">{LINHA_EMPRESA}</p>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--destaque)]" />
      </div>

      {/* formulário */}
      <div className="grid place-items-center bg-white p-6">
        <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--destaque-escuro)]">HUB-MDC</span>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--marca)]">{TITULO[modo]}</h1>
            {modo === "convite" && (
              <p className="mt-1 text-sm text-neutral-600">Você foi convidado pela MDC. Defina a senha que vai usar para entrar.</p>
            )}
            {modo === "trocar" && (
              <p className="mt-1 text-sm text-neutral-600">
                Você entrou com uma senha provisória. Crie a sua senha para continuar; a provisória deixa de valer.
              </p>
            )}
          </div>
          {modo === "recuperar" && (
            <p className="rounded-md bg-[var(--fundo)] p-3 text-sm text-neutral-700">
              Peça ao administrador da MDC uma <b>senha provisória</b>. Ele gera na hora e manda pelo WhatsApp; ao entrar com ela, o HUB
              pede para você criar uma senha nova.
            </p>
          )}
          {definindoSenha && semSessao && modo !== "trocar" && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Este link expirou ou já foi usado.{" "}
              {modo === "convite" ? "Peça ao administrador para reenviar o convite" : "Peça um novo link em “Esqueci a senha”"}.
            </p>
          )}
          {!definindoSenha && modo !== "recuperar" && (
            <label className="campo">
              <span>E-mail</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {modo !== "recuperar" && (
            <label className="campo">
              <span>{definindoSenha ? "Nova senha (mínimo 8 caracteres)" : "Senha"}</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>
          )}
          {definindoSenha && (
            <label className="campo">
              <span>Repita a senha</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </label>
          )}
          {msg && <p className={`text-sm ${msg.tipo === "erro" ? "text-[var(--perigo)]" : "text-[var(--sucesso)]"}`}>{msg.texto}</p>}
          {modo !== "recuperar" && (
            <button className="btn-primario w-full" disabled={enviando || (definindoSenha && semSessao && modo !== "trocar")}>
              {enviando
                ? "Aguarde…"
                : {
                    entrar: "Entrar",
                    recuperar: "",
                    nova: "Salvar senha",
                    convite: "Criar senha e entrar",
                    trocar: "Salvar senha e entrar",
                  }[modo]}
            </button>
          )}
          <div className="flex justify-between text-sm">
            {modo !== "entrar" ? (
              <button type="button" className="btn-link" onClick={() => setModo("entrar")}>
                Voltar para entrar
              </button>
            ) : (
              <button type="button" className="btn-link" onClick={() => setModo("recuperar")}>
                Esqueci a senha
              </button>
            )}
          </div>
          {modo === "entrar" && (
            <p className="pt-2 text-xs text-neutral-500">
              O acesso é liberado pela MDC. Ainda não recebeu a sua senha? Fale com o administrador do Hub.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
