"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";

type Modo = "entrar" | "criar" | "recuperar" | "nova";

export default function Login() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("redefinir")) setModo("nova");
  }, []);

  function destino() {
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/tarefas";
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    const sb = supabase();
    try {
      if (modo === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        window.location.replace(destino());
        return;
      }
      if (modo === "criar") {
        const { data, error } = await sb.auth.signUp({
          email,
          password: senha,
          options: { data: { nome }, emailRedirectTo: window.location.origin + "/tarefas" },
        });
        if (error) throw error;
        if (data.session) window.location.replace(destino());
        else setMsg({ tipo: "ok", texto: "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre." });
      }
      if (modo === "nova") {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        window.location.replace("/tarefas");
        return;
      }
      if (modo === "recuperar") {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/login?redefinir=1",
        });
        if (error) throw error;
        setMsg({ tipo: "ok", texto: "Se o e-mail existir, você receberá um link para redefinir a senha." });
      }
    } catch (err) {
      setMsg({ tipo: "erro", texto: traduzirErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-[var(--marca)] p-12 text-[#C6D3CC]">
        <div className="flex items-center gap-3">
          <img src="/icone.svg" alt="" className="h-10 w-10" />
          <span className="text-[var(--destaque)] text-xl font-semibold tracking-wide">MDC Tarefas</span>
        </div>
        <div>
          <p className="text-3xl leading-snug text-white font-light max-w-md">
            Prazos, obrigações e rotinas da equipe em um só lugar, com o painel da TV atualizando sozinho.
          </p>
        </div>
        <p className="text-sm">MDC Assessoria · Assessoria Contábil, Tributária e Gestão Financeira</p>
      </div>

      <div className="grid place-items-center p-6">
        <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <img src="/icone.svg" alt="" className="h-8 w-8" />
            <span className="font-semibold text-[var(--marca)]">MDC Tarefas</span>
          </div>
          <h1 className="text-2xl font-semibold text-[var(--marca)]">
            {
              { entrar: "Entrar", criar: "Criar conta", recuperar: "Recuperar senha", nova: "Nova senha" }[modo]
            }
          </h1>
          {!supabaseConfigurado && (
            <p className="text-sm text-[var(--alerta)]">
              Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_KEY antes de usar.
            </p>
          )}
          {modo === "criar" && (
            <label className="campo">
              <span>Seu nome</span>
              <input required value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
          )}
          {modo !== "nova" && (
          <label className="campo">
            <span>E-mail</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          )}
          {modo !== "recuperar" && (
            <label className="campo">
              <span>Senha</span>
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
          {msg && (
            <p className={`text-sm ${msg.tipo === "erro" ? "text-[var(--perigo)]" : "text-[var(--sucesso)]"}`}>
              {msg.texto}
            </p>
          )}
          <button className="btn-primario w-full" disabled={enviando || !supabaseConfigurado}>
            {enviando
              ? "Aguarde…"
              : { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link", nova: "Salvar senha" }[modo]}
          </button>
          <div className="flex justify-between">
            {modo !== "entrar" ? (
              <button type="button" className="btn-link" onClick={() => setModo("entrar")}>
                Já tenho conta
              </button>
            ) : (
              <button type="button" className="btn-link" onClick={() => setModo("criar")}>
                Criar conta
              </button>
            )}
            {modo === "entrar" && (
              <button type="button" className="btn-link" onClick={() => setModo("recuperar")}>
                Esqueci a senha
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
