"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { caminho, enderecoHub } from "@/lib/caminho";

// Contas são criadas pelo administrador (convite por e-mail); aqui a pessoa entra,
// cria a senha pelo link do convite ou redefine a senha esquecida.
type Modo = "entrar" | "recuperar" | "nova" | "convite";

const TITULO: Record<Modo, string> = {
  entrar: "Entrar",
  recuperar: "Recuperar senha",
  nova: "Nova senha",
  convite: "Crie sua senha",
};

export default function Login() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [semSessao, setSemSessao] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const pedido: Modo | null = q.get("convite") || /type=invite/.test(hash) ? "convite" : q.get("redefinir") || /type=recovery/.test(hash) ? "nova" : null;
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
    if ((modo === "nova" || modo === "convite") && senha !== confirma) {
      setMsg({ tipo: "erro", texto: "As duas senhas não conferem." });
      return;
    }
    setEnviando(true);
    const sb = supabase();
    try {
      if (modo === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        window.location.replace(destino());
        return;
      }
      if (modo === "nova" || modo === "convite") {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        window.location.replace(caminho("/"));
        return;
      }
      if (modo === "recuperar") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: enderecoHub("/login?redefinir=1") });
        if (error) throw error;
        setMsg({ tipo: "ok", texto: "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." });
      }
    } catch (err) {
      setMsg({ tipo: "erro", texto: traduzirErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  const definindoSenha = modo === "nova" || modo === "convite";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      {/* capa */}
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[var(--marca)] px-8 py-12 text-[#C6D3CC] lg:py-0">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(226,193,126,0.14),transparent_62%)]" />
        <img
          src={caminho("/logo-mdc-dourado.png")}
          alt="MDC Assessoria"
          className="relative w-56 max-w-[70vw] sm:w-72 lg:w-[26rem]"
        />
        <div className="relative mt-8 h-px w-40 bg-gradient-to-r from-transparent via-[var(--destaque)] to-transparent lg:mt-10" />
        <p className="relative mt-6 text-center text-xs uppercase tracking-[0.3em] text-[var(--destaque)] sm:text-sm">
          Contábil · Tributária · Gestão Financeira
        </p>
        <p className="relative mt-4 hidden max-w-md text-center text-lg font-light leading-relaxed text-white/90 lg:block">
          Tarefas, societário, demonstrativos, atendimento e o Portal do Cliente em um só lugar.
        </p>
        <p className="relative mt-10 hidden text-xs text-[#C6D3CC]/70 lg:block">
          MDC Assessoria Ltda · CNPJ 48.140.121/0001-65 · Bragança Paulista/SP
        </p>
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
          </div>
          {!supabaseConfigurado && (
            <p className="text-sm text-[var(--alerta)]">Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_KEY antes de usar.</p>
          )}
          {definindoSenha && semSessao && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Este link expirou ou já foi usado. {modo === "convite" ? "Peça ao administrador para reenviar o convite" : "Peça um novo link em “Esqueci a senha”"}.
            </p>
          )}
          {!definindoSenha && (
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
              <input type="password" required minLength={8} autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
            </label>
          )}
          {msg && <p className={`text-sm ${msg.tipo === "erro" ? "text-[var(--perigo)]" : "text-[var(--sucesso)]"}`}>{msg.texto}</p>}
          <button className="btn-primario w-full" disabled={enviando || !supabaseConfigurado || (definindoSenha && semSessao)}>
            {enviando ? "Aguarde…" : { entrar: "Entrar", recuperar: "Enviar link", nova: "Salvar senha", convite: "Criar senha e entrar" }[modo]}
          </button>
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
              O acesso é liberado pela MDC. Ainda não recebeu o convite? Fale com o administrador do Hub.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
