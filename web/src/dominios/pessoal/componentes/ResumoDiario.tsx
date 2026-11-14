// Cartão "Resumo diário" do Início da família (076) e a janela para ajustar: ligar/desligar, horário (5h a 22h) e o
// aviso no celular — no banco (pessoal_resumo_salvar) e neste aparelho (avisoCelular.ts). O aviso é por pessoa.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { HORARIOS, TEXTO_SITUACAO, desligarNoAparelho, lerSituacaoDoAparelho, ligarNoAparelho, textoHora } from "../avisoCelular";
import type { SituacaoAparelho } from "../avisoCelular";

interface Preferencia {
  ligado: boolean;
  hora: number;
  celular: boolean;
}
const PADRAO: Preferencia = { ligado: true, hora: 7, celular: true };

export function ResumoDiario() {
  const { org, eu } = useOrg();
  const [aberta, setAberta] = useState(false);
  const consulta = useConsulta(
    useCallback(async () => {
      const { data, error } = await supabase()
        .from("pessoal_resumo_preferencias")
        .select("ligado, hora, celular")
        .eq("org_id", org.id)
        .eq("user_id", eu.user_id)
        .maybeSingle();
      if (error) throw error;
      return (data as Preferencia | null) ?? PADRAO;
    }, [org.id, eu.user_id]),
  );
  const p = consulta.dados ?? PADRAO;

  return (
    <section className="cartao flex flex-wrap items-center gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--fundo)] text-[var(--marca)]">
        <Icone nome="sino" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-[var(--marca)]">Resumo diário</b>
        <span className="text-sm text-neutral-600">
          {p.ligado
            ? `Todo dia às ${textoHora(p.hora)}, no sino${p.celular ? " e no celular (onde você ligar)" : ""}, quando houver conta para contar.`
            : "Desligado: você não recebe o resumo das finanças."}
        </span>
      </div>
      <button className="btn" onClick={() => setAberta(true)}>
        <Icone nome="engrenagem" className="h-4 w-4" />
        Ajustar o resumo
      </button>
      {aberta && (
        <JanelaResumo
          inicial={p}
          aoFechar={(salvou) => {
            setAberta(false);
            if (salvou) consulta.recarregar();
          }}
        />
      )}
    </section>
  );
}

function JanelaResumo({ inicial, aoFechar }: { inicial: Preferencia; aoFechar: (salvou: boolean) => void }) {
  const { org } = useOrg();
  const [f, setF] = useState<Preferencia>(inicial);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aparelho, setAparelho] = useState<SituacaoAparelho | null>(null);
  const [mexendo, setMexendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    lerSituacaoDoAparelho().then(
      (s) => vivo && setAparelho(s),
      () => vivo && setAparelho("sem-suporte"),
    );
    return () => {
      vivo = false;
    };
  }, []);

  async function salvar() {
    setOcupado(true);
    setErro("");
    try {
      const { error } = await supabase().rpc("pessoal_resumo_salvar", {
        p_org: org.id,
        p_ligado: f.ligado,
        p_hora: f.hora,
        p_celular: f.celular,
      });
      if (error) throw error;
      aoFechar(true);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  async function aparelhoLigar(ligar: boolean) {
    setMexendo(true);
    setErro("");
    try {
      setAparelho(await (ligar ? ligarNoAparelho() : desligarNoAparelho()));
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setMexendo(false);
    }
  }

  const opcao = (marcado: boolean, titulo: string, texto: string, aoClicar: () => void) => (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={aoClicar}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left ${marcado ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-neutral-200"}`}
    >
      <Icone nome={marcado ? "check" : "traco"} className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
      <span>
        <b className="block text-[var(--marca)]">{titulo}</b>
        <span className="text-sm text-neutral-600">{texto}</span>
      </span>
    </button>
  );

  return (
    <Modal
      titulo="Resumo diário das finanças"
      descricao="Um aviso por dia com o que está atrasado, o que vence hoje e nos próximos 7 dias, o que vai entrar e o que foi pago e recebido ontem. Vale só para você."
      aoFechar={() => aoFechar(false)}
      largura="2xl"
      avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
      rodape={
        <>
          <button className="btn-primario" onClick={() => void salvar()} disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn" onClick={() => aoFechar(false)} disabled={ocupado}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {opcao(f.ligado, "Quero o resumo", "Recebo um aviso por dia quando houver conta para contar.", () => setF({ ...f, ligado: true }))}
        {opcao(!f.ligado, "Não quero", "Não recebo o resumo. O Início continua mostrando tudo.", () => setF({ ...f, ligado: false }))}
      </div>
      {f.ligado && (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="campo">
            <span>A partir de que horas</span>
            <select value={f.hora} onChange={(e) => setF({ ...f, hora: Number(e.target.value) })}>
              {HORARIOS.map((h) => (
                <option key={h} value={h}>
                  {textoHora(h)}
                </option>
              ))}
            </select>
            <small className="text-neutral-500">No horário da família. O aviso chega uns minutos depois da hora.</small>
          </label>
          <div className="space-y-2">
            {opcao(f.celular, "Avisar também no celular", "Além do sino do app, aparece na tela do celular ou do computador.", () =>
              setF({ ...f, celular: !f.celular }),
            )}
          </div>
        </div>
      )}
      {f.ligado && f.celular && (
        <div className="rounded-xl border border-dashed border-[var(--borda)] p-3">
          <b className="flex items-center gap-2 text-sm text-[var(--marca)]">
            <Icone nome="celular" className="h-4 w-4" />
            Este aparelho
          </b>
          <p className="mt-1 text-sm text-neutral-600">{aparelho ? TEXTO_SITUACAO[aparelho] : "Conferindo…"}</p>
          {aparelho === "desligado" && (
            <button type="button" className="btn-azul mt-2" onClick={() => void aparelhoLigar(true)} disabled={mexendo}>
              <Icone nome="sino" className="h-4 w-4" />
              {mexendo ? "Ligando…" : "Ligar aviso neste aparelho"}
            </button>
          )}
          {aparelho === "ligado" && (
            <button type="button" className="btn mt-2" onClick={() => void aparelhoLigar(false)} disabled={mexendo}>
              <Icone nome="cancelar" className="h-4 w-4" />
              {mexendo ? "Desligando…" : "Desligar neste aparelho"}
            </button>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Ligue em cada aparelho onde quer receber (celular, computador). O navegador vai pedir licença.
          </p>
        </div>
      )}
    </Modal>
  );
}
