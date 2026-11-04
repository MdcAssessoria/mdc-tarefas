// Sino de avisos do Portal do Cliente (fechamento publicado, parecer assinado, resposta da MDC…).
// Ao abrir, marca os avisos novos como lidos.
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";

interface AvisoCliente {
  id: string;
  titulo: string;
  texto: string | null;
  lida_em: string | null;
  criado_em: string;
}

export function SinoCliente({ uid }: { uid: string }) {
  const [n, setN] = useState<AvisoCliente[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void supabase()
      .from("hub_notificacoes")
      .select("id,titulo,texto,lida_em,criado_em")
      .eq("user_id", uid)
      .order("criado_em", { ascending: false })
      .limit(20)
      .then(({ data, error }) => (error ? setErro(traduzirErro(error)) : setN((data as AvisoCliente[]) ?? [])));
  }, [uid]);

  // fecha ao tocar fora ou com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const novas = n.filter((x) => !x.lida_em);
  return (
    <div className="relative" ref={caixa}>
      <button
        className="relative grid h-11 w-11 place-items-center sm:h-9 sm:w-9 rounded-md hover:bg-white/10"
        aria-expanded={aberto}
        aria-label={novas.length ? `Avisos (${novas.length} novo(s))` : "Avisos"}
        onClick={async () => {
          setAberto((x) => !x);
          if (!novas.length) return;
          const agora = new Date().toISOString();
          const { error } = await supabase()
            .from("hub_notificacoes")
            .update({ lida_em: agora })
            .in(
              "id",
              novas.map((x) => x.id),
            );
          if (error) setErro(traduzirErro(error));
          else setN((l) => l.map((x) => (x.lida_em ? x : { ...x, lida_em: agora })));
        }}
      >
        <Icone nome="sino" />
        {novas.length > 0 && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--destaque)]" />}
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 max-h-[70dvh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[var(--borda)] bg-white p-2 text-[var(--texto)] shadow-lg">
          {erro && <p className="m-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">{erro}</p>}
          {n.length === 0 && (
            <p className="p-3 text-center text-sm text-neutral-500">
              Nenhum aviso por enquanto. Quando a MDC publicar um fechamento ou responder você, o aviso aparece aqui.
            </p>
          )}
          {n.map((x) => (
            <div key={x.id} className="border-b border-[var(--borda)] p-2 text-sm last:border-0">
              <div className="font-medium">{x.titulo}</div>
              {x.texto && <div className="text-xs text-neutral-600">{x.texto}</div>}
              <div className="text-xs text-neutral-500">{fmtDataHora(x.criado_em)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
