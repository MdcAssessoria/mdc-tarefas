// Quadro dos processos em andamento por fase. No computador: colunas lado a lado e o cartão se arrasta para uma
// coluna à frente. No celular: escolha da fase num seletor e os cartões empilhados, em largura cheia. Nos dois, o botão
// "Avançar" abre a janela que escolhe a fase de destino (arrastar não funciona no toque nem no teclado).
"use client";

import Link from "next/link";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { traduzirErro } from "@/lib/erros";
import { avancarProcesso } from "../leituras";
import { COLUNAS, DIAS_PARADO, destinosParaAvancar, nomeStatusFase, tomStatusFase } from "../processos";
import type { LinhaProcesso, SocFase } from "../processos";

type Avancar = { l: LinhaProcesso; destino?: string };

export function QuadroProcessos({
  linhas,
  fases,
  podeOperar,
  avisar,
  aoMudar,
}: {
  /** Só processos em andamento, já filtrados. */
  linhas: LinhaProcesso[];
  /** Todas as fases (para achar as do processo). */
  fases: SocFase[];
  podeOperar: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
  aoMudar: () => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [avancar, setAvancar] = useState<Avancar | null>(null);
  const [faseCelular, setFaseCelular] = useState("");

  const colunas = COLUNAS.map((c) => ({ ...c, linhas: linhas.filter((l) => l.f?.codigo === c.codigo) }));
  const fasesDe = (processoId: string) => fases.filter((f) => f.processo_id === processoId);

  function soltar(processoId: string, codigo: string) {
    setArrastando(null);
    setSobre(null);
    const l = linhas.find((x) => x.p.id === processoId);
    if (!l?.f || l.f.codigo === codigo) return;
    const destino = fasesDe(l.p.id).find((f) => f.codigo === codigo);
    if (!destino) return avisar(`O processo #${l.p.numero} não tem a fase "${COLUNAS.find((c) => c.codigo === codigo)?.nome}".`, "atencao");
    if (destino.ordem < l.f.ordem) return avisar("O quadro só anda para a frente. Para voltar uma fase, abra o processo.", "atencao");
    if (destino.status === "dispensada" || destino.status === "concluida")
      return avisar(`A fase "${destino.nome}" já está ${destino.status === "dispensada" ? "dispensada" : "concluída"} neste processo.`, "atencao");
    setAvancar({ l, destino: destino.id });
  }

  const cartao = (l: LinhaProcesso, celular = false) => (
    <CartaoProcesso
      key={l.p.id}
      l={l}
      podeOperar={podeOperar}
      arrastavel={!celular && podeOperar}
      aoArrastar={(id) => setArrastando(id)}
      aoAvancar={() => setAvancar({ l })}
    />
  );

  const visiveisCelular = colunas.filter((c) => (faseCelular ? c.codigo === faseCelular : c.linhas.length > 0));

  return (
    <>
      {/* computador: colunas com arrastar */}
      <div className="hidden gap-3 overflow-x-auto pb-3 sm:flex" aria-label="Quadro de processos por fase">
        {colunas.map((col) => (
          <section
            key={col.codigo}
            aria-label={`${col.nome}: ${col.linhas.length} processo(s)`}
            className={`flex w-72 shrink-0 flex-col rounded-xl border p-2 transition ${
              sobre === col.codigo
                ? "border-[var(--destaque-escuro)] bg-[#f3ead3]"
                : arrastando
                  ? "border-dashed border-[var(--destaque)] bg-[#efece2]"
                  : "border-transparent bg-[#efece2]"
            }`}
            onDragOver={(e) => {
              if (!podeOperar || !arrastando) return;
              e.preventDefault();
              setSobre(col.codigo);
            }}
            onDragLeave={() => setSobre((s) => (s === col.codigo ? null : s))}
            onDrop={(e) => soltar(e.dataTransfer.getData("text/plain"), col.codigo)}
          >
            <header className="mb-2 flex items-center justify-between gap-2 px-1.5 pt-0.5">
              <h3 className="text-[13px] font-semibold text-[var(--marca)]">{col.nome}</h3>
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-xs font-medium text-[var(--texto-suave)]">
                {col.linhas.length}
              </span>
            </header>
            <div className="min-h-24 flex-1 space-y-2">
              {col.linhas.map((l) => cartao(l))}
              {!col.linhas.length && (
                <p className="rounded-lg border border-dashed border-[#d9d3c2] px-3 py-6 text-center text-xs text-[var(--texto-suave)]">
                  Nenhum processo nesta fase
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* celular: escolha da fase e cartões empilhados */}
      <div className="space-y-4 sm:hidden">
        <label className="campo">
          <span>Ver a fase</span>
          <select value={faseCelular} onChange={(e) => setFaseCelular(e.target.value)}>
            <option value="">Todas as fases ({linhas.length})</option>
            {colunas.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nome} ({c.linhas.length})
              </option>
            ))}
          </select>
        </label>
        {visiveisCelular.map((col) => (
          <section key={col.codigo} aria-label={col.nome} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--marca)]">
              <span className="h-2 w-2 rounded-full bg-[var(--destaque)]" aria-hidden="true" />
              {col.nome}
              <span className="font-normal text-[var(--texto-suave)]">· {col.linhas.length}</span>
            </h3>
            {col.linhas.map((l) => cartao(l, true))}
            {!col.linhas.length && (
              <p className="rounded-lg border border-dashed border-[var(--borda)] px-3 py-6 text-center text-sm text-[var(--texto-suave)]">
                Nenhum processo nesta fase agora.
              </p>
            )}
          </section>
        ))}
      </div>

      {podeOperar && (
        <p className="flex items-start gap-2 text-xs text-[var(--texto-suave)]">
          <Icone nome="info" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="hidden sm:inline">Arraste um cartão para uma coluna à frente ou use </span>
            <span className="sm:hidden">Use </span>
            <b>Avançar</b>: a fase atual é concluída e as fases do meio que ainda estavam pendentes são dispensadas.
          </span>
        </p>
      )}

      {avancar && (
        <JanelaAvancar
          l={avancar.l}
          fasesDoProcesso={fasesDe(avancar.l.p.id)}
          destinoInicial={avancar.destino}
          aoFechar={() => setAvancar(null)}
          aoAvancar={(nome) => {
            setAvancar(null);
            avisar(`Processo #${avancar.l.p.numero} foi para "${nome}".`);
            aoMudar();
          }}
          aoFalhar={() => aoMudar()}
        />
      )}
    </>
  );
}

function CartaoProcesso({
  l,
  podeOperar,
  arrastavel,
  aoArrastar,
  aoAvancar,
}: {
  l: LinhaProcesso;
  podeOperar: boolean;
  arrastavel: boolean;
  aoArrastar: (id: string | null) => void;
  aoAvancar: () => void;
}) {
  const { p, f } = l;
  return (
    <article
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        aoArrastar(p.id);
      }}
      onDragEnd={() => aoArrastar(null)}
      className={`rounded-lg border border-[var(--borda)] bg-white p-3 text-sm shadow-sm transition hover:border-[var(--destaque-escuro)] ${
        arrastavel ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/societario/${p.id}`} className="alvo-toque font-medium leading-snug text-[var(--marca)] hover:underline" draggable={false}>
          {l.cliente}
        </Link>
        <span className="num shrink-0 text-xs text-[var(--texto-suave)]">#{p.numero}</span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--texto-suave)]">{l.tipo}</p>
      {f && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip tom={tomStatusFase(f.status)}>{nomeStatusFase(f.status)}</Chip>
          {l.prazo !== null && l.prazo < 0 && <Chip tom="vermelho">Atrasada {-l.prazo} dia(s)</Chip>}
          {l.naFase !== null && l.naFase >= DIAS_PARADO && <Chip tom="ambar">Parada há {l.naFase} dias</Chip>}
          {p.exigencias > 0 && <Chip tom="ambar">{p.exigencias} exigência(s)</Chip>}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--borda)] pt-2">
        <span className="flex min-w-0 items-center gap-1 text-xs text-[var(--texto-suave)]">
          <Icone nome="pessoas" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{l.responsavel}</span>
        </span>
        {podeOperar && (
          <button type="button" className="btn !min-h-8 shrink-0 !px-2.5 text-xs" onClick={aoAvancar} title="Levar o processo para a próxima fase">
            Avançar
            <Icone nome="expandir" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

/** Janela que escolhe a fase de destino e grava o avanço (conclui a atual e dispensa as do meio). */
function JanelaAvancar({
  l,
  fasesDoProcesso,
  destinoInicial,
  aoFechar,
  aoAvancar,
  aoFalhar,
}: {
  l: LinhaProcesso;
  fasesDoProcesso: SocFase[];
  destinoInicial?: string;
  aoFechar: () => void;
  aoAvancar: (nomeDestino: string) => void;
  aoFalhar: () => void;
}) {
  const atual = l.f;
  const destinos = atual ? destinosParaAvancar(fasesDoProcesso, atual) : [];
  const [destino, setDestino] = useState(destinoInicial ?? destinos[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const escolhida = destinos.find((f) => f.id === destino);
  const pulas = escolhida && atual ? destinos.filter((f) => f.ordem < escolhida.ordem) : [];

  async function confirmar() {
    if (!atual || !escolhida) return;
    setOcupado(true);
    setErro("");
    try {
      await avancarProcesso(fasesDoProcesso, atual, escolhida);
      aoAvancar(escolhida.nome);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
      aoFalhar();
    }
  }

  return (
    <Modal
      titulo={`Avançar o processo #${l.p.numero}`}
      descricao={`${l.cliente} · ${l.tipo}. Hoje está em "${atual?.nome ?? "—"}".`}
      aoFechar={aoFechar}
    >
      {!destinos.length ? (
        <p className="rounded-lg bg-[var(--fundo)] p-3 text-sm">
          Esta é a última fase pendente. Para terminar, abra o processo e use <b>Concluir processo</b>.
        </p>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Para qual fase?</legend>
          {destinos.map((f, i) => (
            <label
              key={f.id}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                destino === f.id ? "border-[var(--destaque-escuro)] bg-[#faf5ea]" : "border-[var(--borda)]"
              }`}
            >
              <input type="radio" className="accent-[var(--marca)]" name="destino" value={f.id} checked={destino === f.id} onChange={() => setDestino(f.id)} />
              <span className="flex-1">{f.nome}</span>
              {i === 0 && <span className="text-xs text-[var(--texto-suave)]">próxima</span>}
            </label>
          ))}
        </fieldset>
      )}
      {escolhida && (
        <p className="text-sm text-[var(--texto-suave)]">
          A fase &quot;{atual?.nome}&quot; fica concluída
          {pulas.length > 0 && <> e {pulas.length === 1 ? `"${pulas[0].nome}" fica dispensada` : `${pulas.length} fases do meio ficam dispensadas`}</>}.
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button className="btn" onClick={aoFechar} disabled={ocupado}>
          Voltar
        </button>
        {!!destinos.length && (
          <button className="btn-primario" onClick={confirmar} disabled={ocupado || !escolhida}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Aguarde…" : "Avançar"}
          </button>
        )}
      </div>
    </Modal>
  );
}
