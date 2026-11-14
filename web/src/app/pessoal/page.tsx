// Entrada do MDC - Pessoal (075): tela própria, fora da moldura do HUB, com Entrar, Criar conta (cadastro aberto pela
// função pessoal-cadastro) e o passo "nome da família" para quem ainda não tem família (pessoal_criar_familia).
// Depois de tudo, abre o app com ?org=<slug da família>: a moldura mostra a marca e o menu do pessoal.
"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { supabase, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";
import { precisaTrocarSenha } from "@/lib/senhaProvisoria";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";
import { NOME_APP_PESSOAL, problemaCadastro, problemaNomeFamilia, sugerirNomeFamilia } from "@/dominios/pessoal/entrada";

type Modo = "entrar" | "criar" | "familia" | "recuperar" | "carregando";

const VANTAGENS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: "carteira", titulo: "Contas da casa em dia", texto: "A pagar, a receber, contas bancárias e extratos num lugar só." },
  { icone: "sino", titulo: "Resumo todo dia", texto: "O que vence hoje e nos próximos dias, e quanto entrou e saiu." },
  { icone: "pessoas", titulo: "Para a família toda", texto: "Convide quem mora com você para lançar ou só acompanhar." },
];

/** Família da conta logada (a primeira, se tiver mais de uma), ou null. */
async function minhaFamilia(userId: string): Promise<string | null> {
  const sb = supabase();
  const m = await sb.from("membros").select("org_id").eq("user_id", userId).eq("ativo", true);
  const ids = (m.data ?? []).map((x: { org_id: string }) => x.org_id);
  if (!ids.length) return null;
  const o = await sb.from("organizacoes").select("slug").in("id", ids).eq("tipo", "pessoal").eq("ativo", true).order("nome").limit(1);
  return (o.data?.[0] as { slug: string } | undefined)?.slug ?? null;
}

/** Código do convite que veio no link (/pessoal?convite=ABCD-EFGH), já em maiúsculas. */
function conviteDoLink(): string {
  const c = new URLSearchParams(window.location.search).get("convite") ?? "";
  return c.trim().toUpperCase().slice(0, 12);
}

function abrirApp(slug: string) {
  window.location.replace(caminho(`/?org=${encodeURIComponent(slug)}`));
}

export default function EntradaPessoal() {
  const [modo, setModo] = useState<Modo>("carregando");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [site, setSite] = useState(""); // campo escondido contra robôs
  const [familia, setFamilia] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [convite, setConvite] = useState(""); // código do convite do link, se veio

  const continuarLogado = useEffectEvent((id: string, nomePessoa: string, codigo: string) => depoisDeEntrar(id, nomePessoa, codigo));

  // já logado: vai direto para a família (ou para o passo de criar a família)
  useEffect(() => {
    void (async () => {
      const codigo = conviteDoLink();
      setConvite(codigo);
      const { data } = await supabase().auth.getSession();
      const s = data.session;
      if (!s) return setModo(codigo || new URLSearchParams(window.location.search).get("criar") ? "criar" : "entrar");
      if (precisaTrocarSenha(s)) return window.location.replace(caminho("/login?trocar=1"));
      await continuarLogado(s.user.id, String(s.user.user_metadata?.nome ?? ""), codigo);
    })();
  }, []);

  /** Depois do login: aceita o convite do link (se veio); senão abre a família ou pede o nome de uma nova. */
  async function depoisDeEntrar(userId: string, nomePessoa: string, codigo = convite) {
    if (codigo) {
      const { data, error } = await supabase().rpc("pessoal_aceitar_convite", { p_codigo: codigo });
      if (!error) return abrirApp(String(data));
      setConvite("");
      setErro(`${traduzirErro(error)}. Você ainda pode usar a sua própria família.`);
    }
    const slug = await minhaFamilia(userId);
    if (slug) return abrirApp(slug);
    setFamilia((f) => f || sugerirNomeFamilia(nomePessoa));
    setModo("familia");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const sb = supabase();
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
        if (precisaTrocarSenha(data.session)) return window.location.replace(caminho("/login?trocar=1"));
        await depoisDeEntrar(data.user.id, String(data.user.user_metadata?.nome ?? ""));
      } else if (modo === "criar") {
        const p = problemaCadastro({ nome, email, senha, confirma });
        if (p) return setErro(p);
        const r = await fetch(`${SUPABASE_URL}/functions/v1/pessoal-cadastro`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
          body: JSON.stringify({ nome: nome.trim(), email: email.trim(), senha, site }),
        });
        const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
        if (!r.ok) return setErro(corpo.erro ?? "Não foi possível criar a conta agora. Tente de novo em instantes.");
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
        await depoisDeEntrar(data.user.id, nome);
      } else if (modo === "familia") {
        const p = problemaNomeFamilia(familia);
        if (p) return setErro(p);
        const { data, error } = await sb.rpc("pessoal_criar_familia", { p_nome: familia.trim() });
        if (error) throw error;
        abrirApp(String(data));
      }
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setEnviando(false);
    }
  }

  const trocar = (m: Modo) => {
    setErro(null);
    setModo(m);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* capa */}
      <div className="relative flex flex-col justify-center overflow-hidden bg-[var(--marca)] px-6 py-10 text-[#C6D3CC] sm:px-10 lg:px-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(226,193,126,0.16),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <img src={caminho("/logo-mdc-dourado.png")} alt="MDC" className="h-12 w-auto sm:h-14" />
          <span className="border-l border-[var(--destaque)]/40 pl-4 font-display text-2xl text-white sm:text-3xl">Pessoal</span>
        </div>
        <h1 className="relative mt-8 max-w-xl font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
          As finanças e as tarefas da sua família, <span className="text-[var(--destaque)]">num lugar só</span>.
        </h1>
        <p className="relative mt-4 max-w-lg text-base sm:text-lg">Gratuito para clientes da MDC. Funciona no computador e no celular.</p>
        <ul className="relative mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {VANTAGENS.map((v) => (
            <li key={v.titulo} className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <Icone nome={v.icone} className="h-6 w-6 text-[var(--destaque)]" />
              <b className="mt-2 block text-white">{v.titulo}</b>
              <span className="text-sm">{v.texto}</span>
            </li>
          ))}
        </ul>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--destaque)]" />
      </div>

      {/* formulário */}
      <div className="grid place-items-center bg-white px-4 py-10 sm:px-6">
        {modo === "carregando" ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : (
          <form onSubmit={(e) => void enviar(e)} className="w-full max-w-sm space-y-4" noValidate>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--destaque-escuro)]">{NOME_APP_PESSOAL}</span>
              <h2 className="mt-1 text-2xl font-semibold text-[var(--marca)]">
                {
                  { entrar: "Entrar", criar: "Criar conta grátis", familia: "Dê um nome para a sua família", recuperar: "Esqueci a senha" }[
                    modo
                  ]
                }
              </h2>
              {convite && (modo === "entrar" || modo === "criar") ? (
                <p className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--destaque)]/40 bg-[var(--fundo)] p-3 text-sm text-neutral-700">
                  <Icone nome="pessoas" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--destaque-escuro)]" />
                  <span>
                    Você recebeu um convite para entrar numa família (código <b>{convite}</b>). Crie a sua conta ou entre com a que já tem:
                    o convite é aceito na hora.
                  </span>
                </p>
              ) : (
                modo === "criar" && (
                  <p className="mt-1 text-sm text-neutral-600">Leva menos de um minuto. Depois você convida quem quiser.</p>
                )
              )}
              {modo === "familia" && (
                <p className="mt-1 text-sm text-neutral-600">
                  É o nome que aparece no app e nos convites. Você pode trocar depois. Ex.: “Família Souza” ou “Casa da Ana”.
                </p>
              )}
            </div>

            {(modo === "entrar" || modo === "criar") && (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--fundo)] p-1 text-sm font-semibold" role="tablist">
                {(["entrar", "criar"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={modo === m}
                    onClick={() => trocar(m)}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 ${
                      modo === m ? "bg-white text-[var(--marca)] shadow-sm" : "text-neutral-600"
                    }`}
                  >
                    <Icone nome={m === "entrar" ? "seta-direita" : "mais"} className="h-4 w-4" />
                    {m === "entrar" ? "Já tenho conta" : "Criar conta"}
                  </button>
                ))}
              </div>
            )}

            {modo === "criar" && (
              <label className="campo">
                <span>Seu nome</span>
                <input required autoComplete="name" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
              </label>
            )}
            {(modo === "entrar" || modo === "criar") && (
              <>
                <label className="campo">
                  <span>E-mail</span>
                  <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="campo">
                  <span>{modo === "criar" ? "Crie uma senha (mínimo 8 caracteres)" : "Senha"}</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={modo === "criar" ? "new-password" : "current-password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </label>
              </>
            )}
            {modo === "criar" && (
              <>
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
                <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                  <label>
                    Não preencha
                    <input tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
                  </label>
                </div>
              </>
            )}
            {modo === "familia" && (
              <label className="campo">
                <span>Nome da família</span>
                <input required maxLength={80} value={familia} onChange={(e) => setFamilia(e.target.value)} placeholder="Família Souza" />
              </label>
            )}
            {modo === "recuperar" && (
              <div className="space-y-3 rounded-xl bg-[var(--fundo)] p-4 text-sm text-neutral-700">
                <p>Chame a MDC no WhatsApp: geramos uma senha provisória na hora e, ao entrar com ela, você cria uma senha nova.</p>
                <a
                  className="btn-primario w-full"
                  href="https://wa.me/5511988598041?text=Esqueci%20a%20senha%20do%20MDC%20Pessoal"
                  target="_blank"
                  rel="noopener"
                >
                  <Icone nome="chat" className="h-4 w-4" />
                  Pedir pelo WhatsApp
                </a>
              </div>
            )}

            {erro && (
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-[var(--perigo)]">
                {erro}
              </p>
            )}

            {modo !== "recuperar" && (
              <button className="btn-primario w-full" disabled={enviando}>
                <Icone nome={modo === "familia" ? "check" : modo === "criar" ? "mais" : "seta-direita"} className="h-4 w-4" />
                {enviando ? "Aguarde…" : { entrar: "Entrar", criar: "Criar minha conta", familia: "Começar a usar" }[modo]}
              </button>
            )}

            <div className="flex flex-wrap justify-between gap-2 text-sm">
              {modo === "entrar" && (
                <button type="button" className="btn-link" onClick={() => trocar("recuperar")}>
                  <Icone nome="info" className="h-4 w-4" />
                  Esqueci a senha
                </button>
              )}
              {modo === "recuperar" && (
                <button type="button" className="btn-link" onClick={() => trocar("entrar")}>
                  <Icone nome="voltar" className="h-4 w-4" />
                  Voltar para entrar
                </button>
              )}
              {modo === "familia" && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() =>
                    void supabase()
                      .auth.signOut()
                      .then(() => trocar("entrar"))
                  }
                >
                  <Icone nome="sair" className="h-4 w-4" />
                  Entrar com outra conta
                </button>
              )}
            </div>
            {modo === "criar" && (
              <p className="text-xs text-neutral-500">
                Ao criar a conta, você concorda que a MDC Assessoria guarde estes dados para o funcionamento do app (LGPD, Lei 13.709/2018).
                Seus lançamentos são só seus e de quem você convidar.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
