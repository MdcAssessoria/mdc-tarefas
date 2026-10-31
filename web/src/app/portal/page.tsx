"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { hojeISO, somarMeses } from "@/lib/datas";
import { abrirArquivo, enviarArquivo, fmtTamanho } from "@/lib/arquivos";
import type { Arquivo } from "@/lib/arquivos";
import { ASSUNTOS, STATUS_CONVERSA, nomeAssunto } from "@/lib/chat";
import type { Conversa } from "@/lib/chat";
import { ChatMensagens } from "@/components/ChatMensagens";
import { Icone } from "@/components/Icone";
import { ArvoreBalancete, GradeIndices, PainelResumo, VisaoParecer } from "@/components/demonstrativos/Painel";
import type { BalanceteReg, LinhaReg, ParecerReg } from "@/components/demonstrativos/Painel";
import { AbaDemonstracoes } from "@/components/demonstrativos/Demonstracoes";
import { BotaoPdf } from "@/components/demonstrativos/BotaoPdf";
import { caminho } from "@/lib/caminho";
import { fmtData, fmtDataHora, mesAno, mesExtenso } from "@/lib/formato/datas";
import { nomeCliente } from "@/lib/clientes";
import { CHAVES, gravarLocal, lerLocal } from "@/lib/armazenamentoLocal";
import { IDENTIDADE_MDC } from "@/lib/identidade";

interface Empresa {
  cliente_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  regime: string | null;
  uf: string | null;
  org_id: string;
  org_nome: string;
  cor_primaria: string;
  cor_destaque: string;
  logo_url: string | null;
  permissoes: string[];
}

type Aba = "inicio" | "demonstracoes" | "balancete" | "indices" | "parecer" | "rotinas" | "processos" | "chat" | "documentos";

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
];

export default function Portal() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [atual, setAtual] = useState<string>("");
  const [aba, setAba] = useState<Aba>("inicio");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) window.location.replace(caminho("/login?next=/portal"));
    if (!session) return;
    supabase()
      .rpc("portal_minhas_empresas")
      .then(({ data, error }) => {
        if (error) return setErro(traduzirErro(error));
        const l = (data as Empresa[]) ?? [];
        setEmpresas(l);
        const salva = lerLocal(CHAVES.empresaPortal) ?? "";
        setAtual(l.find((e) => e.cliente_id === salva)?.cliente_id ?? l[0]?.cliente_id ?? "");
      });
  }, [session]);

  const emp = empresas?.find((e) => e.cliente_id === atual);
  const abas = useMemo(() => ABAS.filter((a) => emp?.permissoes.includes(a.perm)), [emp]);
  useEffect(() => {
    if (emp && !abas.some((a) => a.id === aba) && abas[0]) setAba(abas[0].id);
  }, [emp, abas, aba]);

  if (erro) return <Centro titulo="Não foi possível abrir o portal">{erro}</Centro>;
  if (!session || empresas === null) return <Centro titulo="Carregando…" />;
  if (!empresas.length)
    return (
      <Centro titulo="Nenhuma empresa liberada para você">
        Peça à MDC para liberar o acesso de <b>{session.user.email}</b> no Portal do Cliente.{" "}
        <a href={caminho("/")} className="underline">
          Sou da equipe
        </a>{" "}
        ·{" "}
        <button className="underline" onClick={() => supabase().auth.signOut()}>
          Sair
        </button>
      </Centro>
    );
  if (!emp) return <Centro titulo="Carregando…" />;

  return (
    <div className="min-h-screen bg-[var(--fundo)]">
      <header className="bg-[var(--marca)] text-[#C6D3CC] print:hidden">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3">
          <img src={caminho("/icone-hub-mdc.svg")} alt="" className="h-8 w-8 rounded-md" />
          <div className="mr-auto">
            <div className="text-xs">Portal do Cliente · {emp.org_nome}</div>
            {empresas.length > 1 ? (
              <select
                className="rounded-md bg-white/10 px-2 py-0.5 font-semibold text-white"
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
              <div className="font-semibold text-[var(--destaque)]">{nomeCliente(emp)}</div>
            )}
          </div>
          <SinoCliente uid={session.user.id} />
          <button
            className="rounded-md border border-white/20 px-2.5 py-1 text-sm hover:text-white"
            onClick={async () => {
              await supabase().auth.signOut();
              window.location.replace(caminho("/login"));
            }}
          >
            Sair
          </button>
        </div>
        <nav className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-3 pb-2 text-sm">
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 ${aba === a.id ? "bg-white/15 text-white" : "hover:text-white"}`}
            >
              <Icone nome={a.icone} className="h-4 w-4" />
              {a.nome}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-5">
        {(aba === "inicio" || aba === "demonstracoes" || aba === "balancete" || aba === "indices" || aba === "parecer") && (
          <Demonstrativos emp={emp} aba={aba} />
        )}
        {aba === "rotinas" && <Rotinas emp={emp} />}
        {aba === "processos" && <Processos emp={emp} />}
        {aba === "chat" && <Chat emp={emp} />}
        {aba === "documentos" && <Documentos emp={emp} />}
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

function SinoCliente({ uid }: { uid: string }) {
  const [n, setN] = useState<{ id: string; titulo: string; texto: string | null; lida_em: string | null; criado_em: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      .from("hub_notificacoes")
      .select("id,titulo,texto,lida_em,criado_em")
      .eq("user_id", uid)
      .order("criado_em", { ascending: false })
      .limit(20)
      .then(({ data, error }) => (error ? setErro(traduzirErro(error)) : setN((data as typeof n) ?? [])));
  }, [uid]);
  const novas = n.filter((x) => !x.lida_em).length;
  return (
    <div className="relative">
      <button
        className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-white/10"
        onClick={async () => {
          setAberto((x) => !x);
          if (novas) {
            const agora = new Date().toISOString();
            const { error } = await supabase()
              .from("hub_notificacoes")
              .update({ lida_em: agora })
              .in(
                "id",
                n.filter((x) => !x.lida_em).map((x) => x.id),
              );
            setErro(error ? traduzirErro(error) : null);
          }
        }}
        aria-label="Avisos"
      >
        <Icone nome="sino" />
        {novas > 0 && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--destaque)]" />}
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-[var(--borda)] bg-white p-2 text-[var(--texto)] shadow-lg">
          {erro && <p className="m-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">{erro}</p>}
          {n.length === 0 && <p className="p-2 text-sm text-neutral-500">Sem avisos.</p>}
          {n.map((x) => (
            <div key={x.id} className="border-b border-[var(--borda)] p-2 text-sm last:border-0">
              <div className="font-medium">{x.titulo}</div>
              {x.texto && <div className="text-xs text-neutral-500">{x.texto}</div>}
              <div className="text-[11px] text-neutral-400">{fmtDataHora(x.criado_em)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- demonstrativos

function Demonstrativos({ emp, aba }: { emp: Empresa; aba: Aba }) {
  const [lista, setLista] = useState<BalanceteReg[] | null>(null);
  const [comp, setComp] = useState("");
  const [linhas, setLinhas] = useState<LinhaReg[]>([]);
  const [parecer, setParecer] = useState<ParecerReg | null>(null);

  useEffect(() => {
    setLista(null);
    supabase()
      .from("portal_balancetes")
      .select("*")
      .eq("cliente_id", emp.cliente_id)
      .eq("status", "publicado")
      .order("competencia")
      .then(({ data }) => {
        const l = (data as BalanceteReg[]) ?? [];
        setLista(l);
        setComp(l.at(-1)?.competencia ?? "");
      });
  }, [emp.cliente_id]);

  const atual = lista?.find((b) => b.competencia === comp);

  useEffect(() => {
    if (!atual) return;
    const sb = supabase();
    sb.from("portal_balancete_linhas")
      .select("*")
      .eq("balancete_id", atual.id)
      .order("classificacao")
      .limit(20000)
      .then(({ data }) => setLinhas((data as LinhaReg[]) ?? []));
    sb.from("portal_pareceres")
      .select("*")
      .eq("balancete_id", atual.id)
      .eq("status", "publicado")
      .order("versao", { ascending: false })
      .limit(1)
      .then(({ data }) => setParecer((data?.[0] as ParecerReg) ?? null));
  }, [atual]);

  const anteriores = useMemo(() => undefined as Map<string, number> | undefined, []);

  if (lista === null) return <p className="text-sm text-neutral-500">Carregando…</p>;
  if (!lista.length || !atual)
    return (
      <div className="cartao p-8 text-center">
        <h2 className="font-semibold text-[var(--marca)]">Fechamento em andamento</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Assim que a MDC concluir e publicar o fechamento contábil, os demonstrativos aparecem aqui.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm text-neutral-600">Mês:</span>
        <select className="entrada" value={comp} onChange={(e) => setComp(e.target.value)}>
          {[...lista].reverse().map((b) => (
            <option key={b.id} value={b.competencia}>
              {mesExtenso(b.competencia)}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <BotaoPdf balanceteId={atual.id} />
        </div>
      </div>
      {aba === "inicio" && <PainelResumo atual={atual} historico={lista} />}
      {aba === "demonstracoes" && <AbaDemonstracoes atual={atual} historico={lista} />}
      {aba === "balancete" && <ArvoreBalancete linhas={linhas} anteriores={anteriores} />}
      {aba === "indices" && <GradeIndices atual={atual} historico={lista} />}
      {aba === "parecer" &&
        (parecer ? (
          <VisaoParecer texto={parecer.texto} empresa={emp.razao_social} cnpj={emp.cnpj} />
        ) : (
          <div className="cartao p-8 text-center text-sm text-neutral-600">
            O parecer técnico de {mesExtenso(atual.competencia)} ainda está em elaboração.
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- rotinas

interface Rotina {
  tarefa_id: string;
  titulo: string;
  situacao: "entregue" | "em_andamento" | "aguardando_voce";
  prazo: string | null;
  concluida_em: string | null;
  pendencia: string | null;
  setor: string | null;
  arquivos: { id: string; nome: string; caminho: string }[];
}

function Rotinas({ emp }: { emp: Empresa }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [lista, setLista] = useState<Rotina[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase().rpc("portal_rotinas", { p_cliente: emp.cliente_id, p_competencia: mes + "-01" });
    if (error) {
      setErro(traduzirErro(error));
      return;
    }
    setLista(data as Rotina[]);
    // setErro é estável, mas o React Compiler o infere como dependência neste componente; listá-lo não muda nada
  }, [emp.cliente_id, mes, setErro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(hoje, -i));

  async function enviar(r: Rotina, arq: File) {
    try {
      await enviarArquivo(arq, { org: emp.org_id, app: "portal", ref: r.tarefa_id, cliente: emp.cliente_id, visivelCliente: true });
      void carregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  const entregues = lista?.filter((r) => r.situacao === "entregue").length ?? 0;
  const total = lista?.length ?? 0;
  const SIT = {
    entregue: { nome: "Entregue", cor: "bg-emerald-50 text-emerald-800" },
    em_andamento: { nome: "Em andamento", cor: "bg-sky-50 text-sky-800" },
    aguardando_voce: { nome: "Aguardando você", cor: "bg-amber-50 text-amber-900" },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Rotinas do mês</h1>
        <select className="entrada" value={mes} onChange={(e) => setMes(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>
              Competência {mesAno(m + "-01")}
            </option>
          ))}
        </select>
      </div>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {lista && total > 0 && (
        <div className="cartao p-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>
              <b>{entregues}</b> de {total} rotinas entregues
            </span>
            <span className="text-neutral-500">{Math.round((entregues / total) * 100)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--fundo)]">
            <div className="h-2.5 rounded-full bg-[#1B8263]" style={{ width: `${(entregues / total) * 100}%` }} />
          </div>
        </div>
      )}
      {lista
        ?.filter((r) => r.situacao === "aguardando_voce")
        .map((r) => (
          <div key={r.tarefa_id} className="cartao border-l-4 !border-l-amber-500 p-4">
            <div className="text-sm font-semibold">A MDC precisa de você: {r.titulo}</div>
            <div className="text-sm text-neutral-700">{r.pendencia}</div>
            <label className="btn mt-2 cursor-pointer">
              Enviar arquivo
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && enviar(r, e.target.files[0])} />
            </label>
          </div>
        ))}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Rotina</th>
              <th>Situação</th>
              <th>Previsão / vencimento</th>
              <th>Entregáveis</th>
            </tr>
          </thead>
          <tbody>
            {lista?.map((r) => (
              <tr key={r.tarefa_id}>
                <td>
                  <div className="font-medium">{r.titulo}</div>
                  {r.setor && <div className="text-xs text-neutral-500">{r.setor}</div>}
                </td>
                <td>
                  <span className={`chip ${SIT[r.situacao].cor}`}>{SIT[r.situacao].nome}</span>
                  {r.concluida_em && <div className="text-xs text-neutral-500">em {fmtData(r.concluida_em.slice(0, 10))}</div>}
                </td>
                <td>{fmtData(r.prazo)}</td>
                <td>
                  {r.arquivos.map((a) => (
                    <button
                      key={a.id}
                      className="block text-left text-sm text-[var(--destaque-escuro)] underline"
                      onClick={() => abrirArquivo(a.caminho, a.nome).catch((e) => setErro(traduzirErro(e)))}
                    >
                      {a.nome}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
            {lista && !lista.length && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-neutral-500">
                  Nenhuma rotina para esta competência.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- societário

interface Processo {
  processo_id: string;
  numero: number;
  tipo: string;
  descricao: string | null;
  status: string;
  fase: string | null;
  fase_status: string | null;
  pedido_em: string;
  previsao_em: string | null;
  concluido_em: string | null;
  eventos: { em: string; texto: string }[];
}

function Processos({ emp }: { emp: Empresa }) {
  const [lista, setLista] = useState<Processo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    supabase()
      .rpc("portal_processos", { p_cliente: emp.cliente_id })
      .then(({ data, error }) => (error ? setErro(traduzirErro(error)) : setLista(data as Processo[])));
  }, [emp.cliente_id]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--marca)]">Processos societários</h1>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {lista && !lista.length && <p className="text-sm text-neutral-500">Nenhum processo em andamento.</p>}
      {lista?.map((p) => (
        <section key={p.processo_id} className="cartao p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {p.tipo} <span className="text-sm font-normal text-neutral-500">#{p.numero}</span>
            </h2>
            {p.status === "concluido" ? (
              <span className="chip bg-emerald-50 text-emerald-800">Concluído em {fmtData(p.concluido_em)}</span>
            ) : (
              <span className="chip bg-sky-50 text-sky-800">
                {p.fase}
                {p.fase_status === "aguardando_cliente"
                  ? " · aguardando você"
                  : p.fase_status === "aguardando_orgao"
                    ? " · aguardando órgão"
                    : ""}
              </span>
            )}
          </div>
          {p.descricao && <p className="mt-1 text-sm text-neutral-700">{p.descricao}</p>}
          <p className="text-xs text-neutral-500">
            Pedido em {fmtData(p.pedido_em)}
            {p.previsao_em && ` · previsão ${fmtData(p.previsao_em)}`}
          </p>
          <ol className="mt-3 space-y-1.5 border-l-2 border-[var(--borda)] pl-3 text-sm">
            {p.eventos.map((e, i) => (
              <li key={i}>
                {e.texto} <span className="text-xs text-neutral-400">· {fmtDataHora(e.em)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- chat

function Chat({ emp }: { emp: Empresa }) {
  const [lista, setLista] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [assunto, setAssunto] = useState("duvida");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase()
      .from("portal_conversas")
      .select("*")
      .eq("cliente_id", emp.cliente_id)
      .order("atualizado_em", { ascending: false });
    setLista((data as Conversa[]) ?? []);
  }, [emp.cliente_id]);

  useEffect(() => {
    void carregar();
    const sb = supabase();
    const canal = sb
      .channel(`portal-conv-${emp.cliente_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portal_conversas", filter: `cliente_id=eq.${emp.cliente_id}` },
        carregar,
      )
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [emp.cliente_id, carregar]);

  const atual = lista.find((c) => c.id === sel);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase().rpc("portal_abrir_conversa", {
      p_cliente: emp.cliente_id,
      p_assunto: assunto,
      p_titulo: titulo,
      p_texto: texto,
    });
    if (error) return setErro(traduzirErro(error));
    setNova(false);
    setTitulo("");
    setTexto("");
    await carregar();
    setSel(data as string);
  }

  async function avaliar(nota: number) {
    if (!atual) return;
    await supabase().from("portal_conversas").update({ avaliacao: nota }).eq("id", atual.id);
    void carregar();
  }

  return (
    <div className="grid h-[calc(100vh-200px)] min-h-[460px] gap-3 md:grid-cols-[300px_1fr]">
      <aside className="cartao flex min-h-0 flex-col">
        <div className="border-b border-[var(--borda)] p-2">
          <button
            className="btn-primario w-full"
            onClick={() => {
              setNova(true);
              setSel(null);
            }}
          >
            Nova solicitação
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 && <p className="p-4 text-sm text-neutral-500">Você ainda não abriu nenhuma solicitação.</p>}
          {lista.map((c) => {
            const st = STATUS_CONVERSA.find((s) => s.id === c.status)!;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSel(c.id);
                  setNova(false);
                }}
                className={`block w-full border-b border-[var(--borda)] px-3 py-2 text-left text-sm hover:bg-[var(--fundo)] ${sel === c.id ? "bg-[var(--fundo)]" : ""}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{c.titulo}</span>
                  <span className={`chip shrink-0 ${st.cor}`}>{c.status === "aguardando_cliente" ? "Responder" : st.nome}</span>
                </div>
                <div className="text-[11px] text-neutral-500">
                  {nomeAssunto(c.assunto)} · {fmtDataHora(c.atualizado_em)}
                </div>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="cartao flex min-h-0 flex-col overflow-hidden">
        {nova ? (
          <form onSubmit={abrir} className="space-y-3 p-5">
            <h2 className="text-lg font-semibold text-[var(--marca)]">Nova solicitação para a MDC</h2>
            <label className="campo">
              <span>Assunto</span>
              <select value={assunto} onChange={(e) => setAssunto(e.target.value)}>
                {ASSUNTOS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Resumo</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Admissão da Maria em 10/11" />
            </label>
            <label className="campo">
              <span>Mensagem</span>
              <textarea required rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
            {erro && <p className="text-sm text-red-700">{erro}</p>}
            <p className="text-xs text-neutral-500">
              A mensagem chega direto ao responsável da MDC pelo assunto. Arquivos podem ser anexados na conversa.
            </p>
            <button className="btn-primario">Enviar</button>
          </form>
        ) : atual ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--borda)] p-3">
              <div className="mr-auto">
                <div className="font-semibold">{atual.titulo}</div>
                <div className="text-xs text-neutral-500">
                  {nomeAssunto(atual.assunto)} · aberta em {fmtDataHora(atual.criado_em)}
                </div>
              </div>
              {atual.status !== "resolvido" ? (
                <button
                  className="btn !min-h-8 !py-1"
                  onClick={async () => {
                    await supabase().from("portal_conversas").update({ status: "resolvido" }).eq("id", atual.id);
                    void carregar();
                  }}
                >
                  Marcar como resolvida
                </button>
              ) : (
                <div className="flex items-center gap-1 text-sm" title="Avalie o atendimento">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => avaliar(n)}
                      className={`text-lg ${(atual.avaliacao ?? 0) >= n ? "text-[var(--destaque-escuro)]" : "text-neutral-300"}`}
                      aria-label={`Nota ${n}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ChatMensagens
                conversaId={atual.id}
                orgId={emp.org_id}
                clienteId={emp.cliente_id}
                lado="cliente"
                fechada={atual.status === "resolvido"}
              />
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-sm text-neutral-500">
            Escolha uma conversa ou abra uma nova solicitação.
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- documentos

function Documentos({ emp }: { emp: Empresa }) {
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [venc, setVenc] = useState<{ id: string; tipo: string; descricao: string | null; vence_em: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, v] = await Promise.all([
      sb
        .from("hub_arquivos")
        .select("*")
        .eq("cliente_id", emp.cliente_id)
        .eq("visivel_cliente", true)
        .order("enviado_em", { ascending: false })
        .limit(300),
      sb.from("venc_itens").select("id,tipo,descricao,vence_em").eq("cliente_id", emp.cliente_id).eq("status", "ativo").order("vence_em"),
    ]);
    setArquivos((a.data as Arquivo[]) ?? []);
    setVenc((v.data as typeof venc) ?? []);
  }, [emp.cliente_id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomesTipo: Record<string, string> = {
    certificado_a1: "Certificado digital A1",
    certificado_a3: "Certificado digital A3",
    procuracao_ecac: "Procuração e-CAC",
    procuracao_outra: "Procuração",
    alvara: "Alvará",
    avcb: "AVCB",
    cetesb: "Licença CETESB",
    vigilancia: "Vigilância Sanitária",
    licenca_outra: "Licença",
    contrato: "Contrato",
    outro: "Vencimento",
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="cartao p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Documentos</h2>
          <label className="btn cursor-pointer">
            Enviar para a MDC
            <input
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                try {
                  for (const f of Array.from(e.target.files ?? []))
                    await enviarArquivo(f, { org: emp.org_id, app: "portal", cliente: emp.cliente_id, visivelCliente: true });
                  void carregar();
                } catch (er) {
                  setErro(traduzirErro(er));
                }
              }}
            />
          </label>
        </div>
        {erro && <p className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
        <ul className="divide-y divide-[var(--borda)] text-sm">
          {arquivos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <button
                className="truncate text-left hover:underline"
                onClick={() => abrirArquivo(a.caminho, a.nome).catch((er) => setErro(traduzirErro(er)))}
              >
                {a.nome}
              </button>
              <span className="shrink-0 text-xs text-neutral-500">
                {a.app === "portal" ? "enviado por você" : "da MDC"} · {fmtData(a.enviado_em.slice(0, 10))} {fmtTamanho(a.tamanho)}
              </span>
            </li>
          ))}
          {arquivos.length === 0 && <li className="py-6 text-center text-neutral-500">Nenhum documento ainda.</li>}
        </ul>
      </section>
      <section className="cartao h-fit p-4">
        <h2 className="mb-2 font-semibold">Próximos vencimentos</h2>
        {venc.length === 0 && <p className="text-sm text-neutral-500">Nada cadastrado.</p>}
        <ul className="space-y-2 text-sm">
          {venc.map((v) => {
            const d = Math.round((Date.parse(v.vence_em) - Date.parse(hojeISO())) / 864e5);
            return (
              <li key={v.id} className="flex justify-between gap-2">
                <span>
                  {nomesTipo[v.tipo] ?? v.tipo}
                  {v.descricao && <span className="block text-xs text-neutral-500">{v.descricao}</span>}
                </span>
                <span className={`shrink-0 ${d <= 30 ? "font-medium text-[var(--alerta)]" : "text-neutral-600"}`}>
                  {fmtData(v.vence_em)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
