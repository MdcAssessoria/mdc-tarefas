// Sino de notificações do HUB: lista as últimas 30, atualiza em tempo real e marca como lidas ao abrir.
"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as EventoMouse } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { caminho } from "@/lib/caminho";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";

/** Fecha o painel ao clicar fora dele. */
function useFora(aberto: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fechar();
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [aberto, fechar]);
  return ref;
}

interface Notificacao {
  id: string;
  titulo: string;
  texto: string | null;
  link: string | null;
  lida_em: string | null;
  criado_em: string;
}

export function Sino() {
  const { session } = useOrg();
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useFora(aberto, () => setAberto(false));
  const uid = session.user.id;

  useEffect(() => {
    const sb = supabase();
    const carregar = () =>
      sb
        .from("hub_notificacoes")
        .select("id,titulo,texto,link,lida_em,criado_em")
        .eq("user_id", uid)
        .order("criado_em", { ascending: false })
        .limit(30)
        .then(({ data, error }) => {
          if (error) setErro(traduzirErro(error));
          else setLista((data as Notificacao[]) ?? []);
        });
    void carregar();
    const canal = sb
      .channel(`sino-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hub_notificacoes", filter: `user_id=eq.${uid}` }, carregar)
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [uid]);

  const novas = lista.filter((n) => !n.lida_em).length;

  /** Marca como lidas na tela na hora; se o banco recusar, desfaz e mostra o motivo. */
  async function marcarLidas(ids: string[]) {
    if (!ids.length) return;
    const agora = new Date().toISOString();
    setLista((l) => l.map((n) => (ids.includes(n.id) && !n.lida_em ? { ...n, lida_em: agora } : n)));
    const { error } = await supabase().from("hub_notificacoes").update({ lida_em: agora }).in("id", ids);
    if (error) {
      setErro(traduzirErro(error));
      setLista((l) => l.map((n) => (ids.includes(n.id) && n.lida_em === agora ? { ...n, lida_em: null } : n)));
    } else setErro(null);
  }

  // A gravação precisa terminar antes de sair da página; senão o navegador cancela a requisição.
  async function abrir(e: EventoMouse, n: Notificacao) {
    if (n.lida_em) return;
    // Ctrl/Cmd/Shift-clique abre em outra aba: esta página continua viva e a gravação termina sozinha
    if (e.ctrlKey || e.metaKey || e.shiftKey) return void marcarLidas([n.id]);
    e.preventDefault();
    await marcarLidas([n.id]);
    if (n.link) window.location.assign(caminho(n.link));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative grid h-9 w-9 place-items-center rounded-lg text-[var(--texto-suave)] hover:bg-[var(--fundo)] hover:text-[var(--marca)]"
        onClick={() => setAberto((x) => !x)}
        aria-label={`Notificações${novas ? ` (${novas} novas)` : ""}`}
        title="Notificações"
      >
        <Icone nome="sino" />
        {novas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--perigo)] px-1 text-[10px] font-semibold text-white">
            {novas > 9 ? "9+" : novas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="surgir absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[var(--borda)] bg-white text-[var(--texto)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--borda)] px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            {novas > 0 && (
              <button className="btn-link" onClick={() => void marcarLidas(lista.filter((n) => !n.lida_em).map((n) => n.id))}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {erro && <p className="m-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">{erro}</p>}
            {lista.length === 0 && <p className="p-4 text-sm text-neutral-500">Nada por aqui.</p>}
            {lista.map((n) => (
              <a
                key={n.id}
                href={n.link ? caminho(n.link) : "#"}
                onClick={(e) => void abrir(e, n)}
                className={`block border-b border-[var(--borda)] px-3 py-2 text-sm last:border-0 hover:bg-[var(--fundo)] ${
                  n.lida_em ? "text-neutral-500" : ""
                }`}
              >
                <div className={n.lida_em ? "" : "font-medium"}>{n.titulo}</div>
                {n.texto && <div className="line-clamp-2 text-xs text-neutral-500">{n.texto}</div>}
                <div className="mt-0.5 text-[11px] text-neutral-400">{fmtDataHora(n.criado_em)}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
