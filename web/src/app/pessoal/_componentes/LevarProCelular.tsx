// Entrada do MDC · Pessoal: no computador, um QR code para abrir no celular com a câmera (e o endereço curto para
// digitar); no celular, a faixa "Instalar" que põe o ícone na tela inicial (some quando já roda instalado).
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BotaoInstalarApp } from "@/components/shell/InstalarApp";
import { ENDERECO_PESSOAL, ENDERECO_PESSOAL_TEXTO } from "@/dominios/pessoal/entrada";

/** Cartão do QR code (só no computador, na capa). */
export function QrParaCelular() {
  const [imagem, setImagem] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(ENDERECO_PESSOAL, { margin: 1, width: 360, color: { dark: "#0B2820", light: "#FFFFFF" } })
      .then(setImagem)
      .catch(() => setImagem(null));
  }, []);
  if (!imagem) return null;
  return (
    <div className="relative mt-8 hidden max-w-md items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 lg:flex">
      <img src={imagem} alt={`QR code para abrir ${ENDERECO_PESSOAL_TEXTO} no celular`} className="h-28 w-28 shrink-0 rounded-lg bg-white p-1" />
      <div className="text-sm">
        <b className="block text-base text-white">Leve para o celular</b>
        Aponte a câmera do celular para o código e toque no link. Depois, toque em <b className="text-[var(--destaque)]">Instalar</b> para ter o
        ícone na tela.
        <span className="mt-1.5 block text-[13px]">
          Ou digite: <b className="text-white">{ENDERECO_PESSOAL_TEXTO}</b>
        </span>
      </div>
    </div>
  );
}

/** Faixa "Instalar" no topo do formulário (só no celular). */
export function InstalarNoCelular() {
  return (
    <div className="mb-5 w-full max-w-sm lg:hidden">
      <BotaoInstalarApp variante="faixa" />
    </div>
  );
}
