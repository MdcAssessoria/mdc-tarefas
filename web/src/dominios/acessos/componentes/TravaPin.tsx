// Trava de PIN das organizações pessoais (080, 14/11/2026): ao entrar numa organização marcada com "exige_pin"
// (Financeiro pessoal — Edvaldo, Família Carvalho), pede o PIN de 4 números antes de mostrar qualquer tela. Depois de
// digitado vale 30 minutos; acabou o prazo, a tela tranca sozinha e pede de novo. Primeira vez: cria o PIN.
// Esqueceu: entra de novo com a senha do HUB e cria outro. O banco confere tudo de novo (pessoas e acessos só mudam
// com o PIN liberado), então esta tela é a porta, não a única trava.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { Aviso } from "@/components/ui/Aviso";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { conferirPin, definirPin, limparPin, msAte, problemaPinNovo, situacaoPin, textoMinutos, trancarPin } from "../pin";
import type { SituacaoPin } from "../pin";

type Etapa = "carregando" | "criar" | "digitar" | "esqueci" | "liberado";

export function TravaPin({ children }: { children: React.ReactNode }) {
  const { org, orgs, session, trocarOrg } = useOrg();
  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [liberadoAte, setLiberadoAte] = useState<string | null>(null);
  const [bloqueadoAte, setBloqueadoAte] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aplicar = useCallback((s: SituacaoPin) => {
    setLiberadoAte(s.liberado_ate);
    setBloqueadoAte(s.bloqueado_ate);
    setPin("");
    setConfirmacao("");
    setEtapa(!s.definido ? "criar" : msAte(s.liberado_ate) > 0 ? "liberado" : "digitar");
  }, []);

  const conferirSituacao = useCallback(async () => {
    try {
      aplicar(await situacaoPin());
    } catch (e) {
      setErro(traduzirErro(e));
      setEtapa("digitar");
    }
  }, [aplicar]);

  useEffect(() => {
    void conferirSituacao();
  }, [conferirSituacao, org.id]);

  // acabou o prazo de 30 minutos: tranca a tela e pede o PIN de novo
  useEffect(() => {
    if (etapa !== "liberado") return;
    const t = setTimeout(() => void conferirSituacao(), msAte(liberadoAte) + 1000);
    return () => clearTimeout(t);
  }, [etapa, liberadoAte, conferirSituacao]);

  if (etapa === "liberado") return <>{children}</>;

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await conferirPin(org.id, pin);
      if (r.ok) {
        setLiberadoAte(r.liberado_ate ?? null);
        setEtapa("liberado");
      } else if (r.bloqueado_ate) {
        setBloqueadoAte(r.bloqueado_ate);
        setErro(`PIN travado por erros seguidos. Tente de novo em ${textoMinutos(msAte(r.bloqueado_ate))} ou use "Esqueci meu PIN".`);
      } else {
        setErro(`PIN incorreto. ${r.restantes === 1 ? "Resta 1 tentativa" : `Restam ${r.restantes} tentativas`} antes de travar.`);
      }
    } catch (e2) {
      setErro(traduzirErro(e2));
    }
    setPin("");
    setEnviando(false);
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const problema = problemaPinNovo(pin, confirmacao);
    if (problema) return setErro(problema);
    setErro(null);
    setEnviando(true);
    try {
      aplicar(await definirPin(org.id, pin));
    } catch (e2) {
      setErro(traduzirErro(e2));
    }
    setEnviando(false);
  }

  async function confirmarSenha(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase().auth.signInWithPassword({ email: session.user.email ?? "", password: senha });
    setEnviando(false);
    setSenha("");
    if (error) return setErro(traduzirErro(error));
    // entrou agora com a senha: nos próximos 5 minutos o banco deixa criar um PIN novo sem o atual
    setPin("");
    setConfirmacao("");
    setEtapa("criar");
  }

  async function sair() {
    await trancarPin();
    await supabase().auth.signOut();
    window.location.replace(caminho("/login"));
  }

  const outraOrg = orgs.find((o) => o.id !== org.id && !o.exige_pin && o.tipo !== "pessoal");
  const travado = msAte(bloqueadoAte) > 0;

  const campoPin = (valor: string, mudar: (v: string) => void, rotulo: string, foco = false) => (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        maxLength={4}
        required
        autoFocus={foco}
        value={valor}
        onChange={(e) => mudar(limparPin(e.target.value))}
        className="text-center text-2xl tracking-[0.6em]"
        aria-label={rotulo}
      />
    </label>
  );

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--fundo)] p-4">
      <div className="cartao w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <Icone nome="escudo" className="mx-auto h-9 w-9 text-[var(--marca)]" />
          <h1 className="mt-2 text-lg font-semibold text-[var(--marca)]">{org.nome}</h1>
          <p className="text-sm text-neutral-600">
            {etapa === "criar"
              ? "Crie um PIN de 4 números para proteger esta área. Ele vai ser pedido sempre que você entrar aqui."
              : etapa === "esqueci"
                ? "Digite a senha que você usa para entrar no HUB. Depois você cria um PIN novo."
                : "Esta área é protegida. Digite seu PIN de 4 números. Ele fica liberado por 30 minutos."}
          </p>
        </div>

        {etapa === "carregando" && <p className="text-center text-sm text-neutral-500">Carregando…</p>}

        {etapa === "digitar" && (
          <form onSubmit={entrar} className="space-y-3" data-sem-protecao>
            {campoPin(pin, setPin, "PIN", true)}
            {erro && <Aviso>{erro}</Aviso>}
            <button className="btn-primario w-full justify-center" disabled={enviando || travado || pin.length !== 4}>
              <Icone nome="escudo" className="h-4 w-4" />
              {enviando ? "Conferindo…" : "Entrar"}
            </button>
            <div className="text-center">
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setErro(null);
                  setEtapa("esqueci");
                }}
              >
                Esqueci meu PIN
              </button>
            </div>
          </form>
        )}

        {etapa === "criar" && (
          <form onSubmit={criar} className="space-y-3" data-sem-protecao>
            {campoPin(pin, setPin, "PIN novo", true)}
            {campoPin(confirmacao, setConfirmacao, "Repita o PIN")}
            {erro && <Aviso>{erro}</Aviso>}
            <button className="btn-primario w-full justify-center" disabled={enviando}>
              <Icone nome="check" className="h-4 w-4" />
              {enviando ? "Salvando…" : "Criar PIN"}
            </button>
          </form>
        )}

        {etapa === "esqueci" && (
          <form onSubmit={confirmarSenha} className="space-y-3" data-sem-protecao>
            <label className="campo">
              <span>Senha do HUB ({session.user.email})</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>
            {erro && <Aviso>{erro}</Aviso>}
            <button className="btn-primario w-full justify-center" disabled={enviando || !senha}>
              <Icone nome="check" className="h-4 w-4" />
              {enviando ? "Conferindo…" : "Confirmar senha"}
            </button>
            <button
              type="button"
              className="btn w-full justify-center"
              onClick={() => {
                setErro(null);
                setEtapa("digitar");
              }}
            >
              <Icone nome="voltar" className="h-4 w-4" />
              Voltar
            </button>
          </form>
        )}

        <div className="flex flex-wrap justify-center gap-2 border-t border-[var(--borda)] pt-3">
          {outraOrg && (
            <button className="btn" onClick={() => trocarOrg(outraOrg.id)}>
              <Icone nome="casa" className="h-4 w-4" />
              Ir para {outraOrg.nome}
            </button>
          )}
          <button className="btn" onClick={() => void sair()}>
            <Icone nome="sair" className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
