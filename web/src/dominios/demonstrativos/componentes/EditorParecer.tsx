// Aba "Parecer técnico" do balancete (lado da equipe): gera o rascunho com os números, edita, assina e publica.
// Ao lado, a prévia do que o cliente vê no Portal. Quem usa passa `key={parecer?.id}`: versão nova recomeça o editor.
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { VisaoParecer } from "./VisaoParecer";
import type { ParecerReg } from "../tipos";

export function EditorParecer({
  parecer,
  versoes,
  empresa,
  cnpj,
  podeOperar,
  podeGerir,
  aoGerar,
  aoMudar,
  aoErro,
  aoAviso,
}: {
  parecer?: ParecerReg;
  versoes: number;
  empresa: string;
  cnpj?: string | null;
  podeOperar: boolean;
  podeGerir: boolean;
  aoGerar: () => void;
  aoMudar: () => void;
  aoErro: (e: unknown) => void;
  aoAviso: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(parecer?.texto ?? "");
  const [nome, setNome] = useState(parecer?.contador_nome ?? "");
  const [crc, setCrc] = useState(parecer?.contador_crc ?? "");
  const [ocupado, setOcupado] = useState(false);

  if (!parecer)
    return (
      <EstadoVazio
        icone="escudo"
        titulo="Ainda não há parecer para este mês"
        acao={
          podeOperar && (
            <button className="btn-primario" onClick={aoGerar}>
              <Icone nome="documento" className="h-4 w-4" />
              Gerar rascunho do parecer
            </button>
          )
        }
      >
        O HUB monta o rascunho com os números, os índices e as fragilidades deste balancete. Você revisa, ajusta e assina antes de publicar
        para o cliente.
      </EstadoVazio>
    );

  const publicado = parecer.status === "publicado";
  const falta = /\[Revisar/.test(texto);

  async function salvar(avisar = true) {
    exigir(await supabase().from("portal_pareceres").update({ texto, contador_nome: nome, contador_crc: crc }).eq("id", parecer!.id));
    if (avisar) aoAviso("Rascunho do parecer salvo.");
  }

  async function executar(f: () => Promise<void>) {
    setOcupado(true);
    try {
      await f();
      aoMudar();
    } catch (e) {
      aoErro(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="min-w-0 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tom={publicado ? "verde" : "ambar"}>
            Versão {parecer.versao} · {publicado ? "publicada" : "rascunho"}
          </Chip>
          {versoes > 1 && <span className="text-xs text-neutral-500">{versoes} versões guardadas</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="campo">
            <span>Contador responsável</span>
            <input value={nome} disabled={publicado || !podeOperar} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>CRC</span>
            <input value={crc} disabled={publicado || !podeOperar} onChange={(e) => setCrc(e.target.value)} placeholder="1SP000000/O-0" />
          </label>
        </div>
        <label className="campo">
          <span>Texto do parecer</span>
          <textarea
            className="h-[420px] w-full font-mono text-[13px] lg:h-[560px]"
            value={texto}
            disabled={publicado || !podeOperar}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <p className="text-xs text-neutral-500">
          Como escrever: # título · ## seção · - item · **negrito**. Trechos entre colchetes [Revisar…] pedem a sua complementação.
        </p>
        {falta && (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <Icone nome="alerta" className="mt-px h-3.5 w-3.5 shrink-0" />
            Complete os trechos marcados com [Revisar…] antes de publicar.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!publicado && podeOperar && (
            <button className="btn" disabled={ocupado} onClick={() => executar(() => salvar())}>
              <Icone nome="check" className="h-4 w-4" />
              Salvar rascunho
            </button>
          )}
          {!publicado && podeGerir && (
            <button
              className="btn-primario"
              disabled={falta || ocupado}
              title={falta ? "Complete os trechos [Revisar…] primeiro" : "Assina com o nome e CRC acima e mostra ao cliente no Portal"}
              onClick={() =>
                executar(async () => {
                  await salvar(false);
                  exigir(await supabase().rpc("portal_publicar_parecer", { p_parecer: parecer!.id }));
                  aoAviso("Parecer assinado e publicado. O cliente já vê no Portal.");
                })
              }
            >
              <Icone nome="escudo" className="h-4 w-4" />
              Assinar e publicar
            </button>
          )}
          {publicado && podeOperar && (
            <button className="btn" onClick={aoGerar}>
              <Icone nome="atualizar" className="h-4 w-4" />
              Nova versão a partir dos números
            </button>
          )}
          <button className="btn" onClick={() => window.print()}>
            <Icone nome="imprimir" className="h-4 w-4" />
            Imprimir / salvar PDF
          </button>
        </div>
      </section>
      <div className="min-w-0">
        <VisaoParecer texto={texto} empresa={empresa} cnpj={cnpj} />
      </div>
    </div>
  );
}
