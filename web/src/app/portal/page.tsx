// Portal do Cliente: a casca (topo com a empresa, avisos e as abas liberadas). Cada aba mora em
// dominios/portal/componentes (Resumo/demonstrativos, Rotinas, Societário, Fale com a MDC, Documentos).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { precisaTrocarSenha } from "@/lib/senhaProvisoria";
import { caminho } from "@/lib/caminho";
import { nomeCliente } from "@/dominios/clientes/nome";
import { CHAVES, gravarLocal, lerLocal } from "@/lib/armazenamentoLocal";
import { IDENTIDADE_MDC } from "@/lib/identidade";
import { AvisoBloqueioPortal } from "@/dominios/licencas/componentes/AvisoPortal";
import type { EmpresaPortal } from "@/dominios/portal/tipos";
import { PortalDemonstrativos } from "@/dominios/portal/componentes/PortalDemonstrativos";
import type { AbaDemonstrativo } from "@/dominios/portal/componentes/PortalDemonstrativos";
import { PortalRotinas } from "@/dominios/portal/componentes/PortalRotinas";
import { PortalProcessos } from "@/dominios/portal/componentes/PortalProcessos";
import { PortalChat } from "@/dominios/portal/componentes/PortalChat";
import { PortalDocumentos } from "@/dominios/portal/componentes/PortalDocumentos";
import { PortalFaturas } from "@/dominios/portal/componentes/PortalFaturas";
import { SinoCliente } from "@/dominios/portal/componentes/SinoCliente";

type Aba = AbaDemonstrativo | "rotinas" | "processos" | "chat" | "documentos" | "faturas";

const ABAS: { id: Aba; nome: string; perm: string; icone: string }[] = [
  { id: "inicio", nome: "Resumo", perm: "demonstrativos", icone: "grafico" },
  { id: "rotinas", nome: "Rotinas do mês", perm: "rotinas", icone: "check" },
  { id: "chat", nome: "Fale com a MDC", perm: "chat", icone: "chat" },
  { id: "demonstracoes", nome: "Balanço, DRE e DFC", perm: "demonstrativos", icone: "grafico" },
  { id: "balancete", nome: "Balancete", perm: "demonstrativos", icone: "documento" },
  { id: "indices", nome: "Índices", perm: "demonstrativos", icone: "alvo" },
  { id: "parecer", nome: "Parecer técnico", perm: "demonstrativos", icone: "escudo" },
  { id: "processos", nome: "Societário", perm: "societario", icone: "pasta" },
  { id: "documentos", nome: "Documentos", perm: "documentos", icone: "clipe" },
  { id: "faturas", nome: "Faturas da MDC", perm: "documentos", icone: "moeda" },
];
const DEMONSTRATIVOS: Aba[] = ["inicio", "demonstracoes", "balancete", "indices", "parecer"];

export default function Portal() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [empresas, setEmpresas] = useState<EmpresaPortal[] | null>(null);
  const [atual, setAtual] = useState<string>("");
  const [abaEscolhida, setAba] = useState<Aba>("inicio");
  const [erro, setErro] = useState<string | null>(null);
  const abaAtiva = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sb = supabase();
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) window.location.replace(caminho("/login?next=/portal"));
    else if (precisaTrocarSenha(session)) window.location.replace(caminho("/login?trocar=1&next=/portal"));
    if (!session) return;
    supabase()
      .rpc("portal_minhas_empresas")
      .then(({ data, error }) => {
        if (error) return setErro(traduzirErro(error));
        const l = (data as EmpresaPortal[]) ?? [];
        setEmpresas(l);
        const salva = lerLocal(CHAVES.empresaPortal) ?? "";
        setAtual(l.find((e) => e.cliente_id === salva)?.cliente_id ?? l[0]?.cliente_id ?? "");
      });
  }, [session]);

  const emp = empresas?.find((e) => e.cliente_id === atual);
  const abas = useMemo(() => ABAS.filter((a) => emp?.permissoes.includes(a.perm)), [emp]);
  // a aba escolhida pode não existir na outra empresa: aí vale a primeira liberada
  const aba: Aba = abas.some((a) => a.id === abaEscolhida) ? abaEscolhida : (abas[0]?.id ?? "inicio");
  // no celular as abas rolam de lado: mantém a escolhida à vista
  useEffect(() => {
    abaAtiva.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aba]);

  if (erro) return <Centro titulo="Não foi possível abrir o portal">{erro}</Centro>;
  if (!session || empresas === null) return <Centro titulo="Carregando…" />;
  if (!empresas.length)
    return (
      <Centro titulo="Nenhuma empresa liberada para você">
        Peça à MDC para liberar o acesso de <b>{session.user.email}</b> no Portal do Cliente.
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href={caminho("/")} className="btn">
            <Icone nome="casa" className="h-4 w-4" />
            Sou da equipe MDC
          </a>
          <button className="btn" onClick={() => supabase().auth.signOut()}>
            <Icone nome="sair" className="h-4 w-4" />
            Sair
          </button>
        </div>
      </Centro>
    );
  if (!emp) return <Centro titulo="Carregando…" />;
  const irAoChat = abas.some((a) => a.id === "chat") ? () => setAba("chat") : undefined;

  return (
    <div className="min-h-screen bg-[var(--fundo)]">
      <header className="bg-[var(--marca)] text-[#C6D3CC] print:hidden">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3">
          <img src={caminho("/icone-hub-mdc.svg")} alt="" className="h-8 w-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs">Portal do Cliente · {emp.org_nome}</div>
            {empresas.length > 1 ? (
              <select
                className="alvo-toque max-w-full truncate rounded-md bg-white/10 px-2 py-0.5 font-semibold text-white"
                aria-label="Empresa"
                value={atual}
                onChange={(e) => {
                  setAtual(e.target.value);
                  gravarLocal(CHAVES.empresaPortal, e.target.value);
                }}
              >
                {empresas.map((e) => (
                  <option key={e.cliente_id} value={e.cliente_id} className="text-black">
                    {nomeCliente(e)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="truncate font-semibold text-[var(--destaque)]">{nomeCliente(emp)}</div>
            )}
          </div>
          <SinoCliente uid={session.user.id} />
          <button
            className="alvo-toque flex shrink-0 items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1 text-sm hover:text-white"
            onClick={async () => {
              await supabase().auth.signOut();
              window.location.replace(caminho("/login"));
            }}
          >
            <Icone nome="sair" className="h-4 w-4" />
            Sair
          </button>
        </div>
        <nav
          aria-label="Partes do portal"
          className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-3 pb-2 text-sm [scrollbar-width:none]"
        >
          {abas.map((a) => (
            <button
              key={a.id}
              ref={aba === a.id ? abaAtiva : undefined}
              onClick={() => setAba(a.id)}
              aria-current={aba === a.id ? "page" : undefined}
              className={`alvo-toque flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 ${aba === a.id ? "bg-white/15 text-white" : "hover:text-white"}`}
            >
              <Icone nome={a.icone} className="h-4 w-4" />
              {a.nome}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1200px] space-y-4 px-4 py-5">
        <AvisoBloqueioPortal cliente={emp.cliente_id} telefone={IDENTIDADE_MDC.telefone} aoFalar={irAoChat} />
        {DEMONSTRATIVOS.includes(aba) && <PortalDemonstrativos emp={emp} aba={aba as AbaDemonstrativo} />}
        {aba === "rotinas" && <PortalRotinas emp={emp} />}
        {aba === "processos" && <PortalProcessos emp={emp} aoFalar={irAoChat} />}
        {aba === "chat" && <PortalChat emp={emp} />}
        {aba === "documentos" && <PortalDocumentos emp={emp} />}
        {aba === "faturas" && <PortalFaturas emp={emp} />}
      </main>
      <footer className="mx-auto max-w-[1200px] px-4 pb-6 text-xs text-neutral-500 print:hidden">
        {IDENTIDADE_MDC.nomeComercial} · {IDENTIDADE_MDC.telefone} · {IDENTIDADE_MDC.site}
      </footer>
    </div>
  );
}

function Centro({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--fundo)] p-6">
      <div className="max-w-md text-center">
        <img src={caminho("/icone-hub-mdc.svg")} alt="" className="mx-auto mb-3 h-12 w-12 rounded-lg" />
        <h1 className="text-lg font-semibold text-[var(--marca)]">{titulo}</h1>
        {children && <div className="mt-2 text-sm text-neutral-600">{children}</div>}
      </div>
    </div>
  );
}
