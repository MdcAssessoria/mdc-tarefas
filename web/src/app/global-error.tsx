// Erro na moldura principal do site (layout raiz), quando nem a tela de erro comum (app/error.tsx) consegue aparecer.
// Precisa montar o próprio <html>; usa os mesmos estilos do HUB. Mesmas regras do app/error.tsx.
"use client";

import "./globals.css";
import ErroDaTela from "./error";

export default function ErroGeral({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-full bg-[var(--fundo)]">
        <title>HUB-MDC</title>
        <ErroDaTela error={error} retry={retry} />
      </body>
    </html>
  );
}
