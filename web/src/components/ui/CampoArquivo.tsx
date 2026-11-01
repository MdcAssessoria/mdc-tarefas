"use client";
// Campo de envio de arquivo do HUB: área de arrastar e soltar com ícone, texto em linguagem simples, formatos aceitos
// e o nome do arquivo escolhido. Clicar em qualquer ponto abre a janela do computador; funciona com teclado (Enter ou
// espaço) e no celular. Use no lugar de <input type="file"> visível.
import { useId, useRef, useState } from "react";
import { Icone } from "./Icone";

export function CampoArquivo({
  aoEscolher,
  accept,
  multiplo = false,
  desabilitado = false,
  titulo,
  dica,
  escolhido,
  compacto = false,
  ocupado = false,
}: {
  /** Recebe os arquivos escolhidos (um só quando `multiplo` é falso). */
  aoEscolher: (arquivos: File[]) => void;
  /** Extensões aceitas, como no input: ".xls,.xlsx,.csv". */
  accept?: string;
  multiplo?: boolean;
  desabilitado?: boolean;
  /** Texto principal (padrão: "Arraste o arquivo aqui ou clique para escolher"). */
  titulo?: React.ReactNode;
  /** Linha de ajuda abaixo; padrão: os formatos aceitos. */
  dica?: React.ReactNode;
  /** Nome do arquivo já escolhido (mostra a etiqueta verde). */
  escolhido?: string | null;
  /** Versão baixa, para janelas e formulários. */
  compacto?: boolean;
  /** Mostra "Lendo o arquivo…" e bloqueia novos envios. */
  ocupado?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const bloqueado = desabilitado || ocupado;
  const formatos = accept
    ?.split(",")
    .map((x) => x.trim())
    .filter((x) => x.startsWith("."))
    .map((x) => x.slice(1).toUpperCase())
    .join(", ");

  function entregar(lista: FileList | null | undefined) {
    const arquivos = Array.from(lista ?? []);
    if (!arquivos.length || bloqueado) return;
    aoEscolher(multiplo ? arquivos : arquivos.slice(0, 1));
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        tabIndex={bloqueado ? -1 : 0}
        aria-disabled={bloqueado}
        onKeyDown={(e) => {
          if (!bloqueado && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            ref.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!bloqueado) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          entregar(e.dataTransfer.files);
        }}
        className={`group flex items-center gap-4 rounded-xl border-2 border-dashed transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--destaque)] ${
          compacto ? "px-4 py-3" : "flex-col justify-center px-6 py-8 text-center sm:py-10"
        } ${
          bloqueado
            ? "cursor-not-allowed border-[var(--borda)] bg-neutral-50 opacity-60"
            : arrastando
              ? "cursor-copy border-[var(--destaque-escuro)] bg-amber-50/70"
              : "cursor-pointer border-[var(--borda)] bg-white hover:border-[var(--destaque-escuro)] hover:bg-[var(--fundo)]"
        }`}
      >
        <span
          className={`grid shrink-0 place-items-center rounded-full bg-[var(--marca)] text-white shadow-sm transition group-hover:scale-105 ${
            compacto ? "h-10 w-10" : "h-14 w-14"
          } ${ocupado ? "animate-pulse" : ""}`}
        >
          <Icone nome="enviar" className={compacto ? "h-5 w-5" : "h-7 w-7"} />
        </span>
        <span className={`min-w-0 ${compacto ? "text-left" : ""}`}>
          <span className="block font-medium text-[var(--marca)]">
            {ocupado
              ? "Lendo o arquivo…"
              : (titulo ??
                (multiplo ? "Arraste os arquivos aqui ou clique para escolher" : "Arraste o arquivo aqui ou clique para escolher"))}
          </span>
          <span className="block text-xs text-[var(--texto-suave)]">
            {dica ?? (formatos ? `Formatos aceitos: ${formatos}` : "Qualquer arquivo")}
            {multiplo && !dica ? " · pode escolher vários" : ""}
          </span>
        </span>
        <input
          ref={ref}
          id={id}
          type="file"
          accept={accept}
          multiple={multiplo}
          disabled={bloqueado}
          className="sr-only"
          onChange={(e) => {
            entregar(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {escolhido && (
        <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
          <Icone nome="arquivo" className="h-4 w-4 shrink-0" />
          <span className="truncate">{escolhido}</span>
          <Icone nome="check" className="h-4 w-4 shrink-0" />
        </p>
      )}
    </div>
  );
}
