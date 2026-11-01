// Link de criar senha (convite) com três jeitos de repassar: WhatsApp, copiar ou abrir o e-mail.
// O WhatsApp abre com a mensagem pronta; a pessoa escolhe o contato no próprio WhatsApp.
"use client";

import { useState } from "react";

export function mensagemConvite(link: string, nome?: string) {
  return (
    `Olá${nome ? `, ${nome.split(" ")[0]}` : ""}! Seu acesso ao HUB da MDC Assessoria está pronto. ` +
    `Toque no link para criar sua senha (ele vale por pouco tempo e só uma vez; se expirar, peça outro):\n${link}`
  );
}

export function LinkCopiavel({ link, nome }: { link: string; nome?: string }) {
  const [copiado, setCopiado] = useState(false);
  const whats = `https://wa.me/?text=${encodeURIComponent(mensagemConvite(link, nome))}`;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <a className="btn-primario !min-h-8" href={whats} target="_blank" rel="noopener noreferrer">
          Enviar pelo WhatsApp
        </a>
        <button
          className="btn !min-h-8"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(mensagemConvite(link, nome));
              setCopiado(true);
            } catch {}
          }}
        >
          {copiado ? "Mensagem copiada" : "Copiar mensagem com o link"}
        </button>
      </div>
      <input
        readOnly
        value={link}
        className="entrada w-full !min-h-8 text-xs"
        onFocus={(e) => e.target.select()}
        aria-label="Link de criar senha"
      />
      <p className="text-xs text-neutral-600">Mande só para a própria pessoa: quem abrir o link cria a senha da conta dela.</p>
    </div>
  );
}
