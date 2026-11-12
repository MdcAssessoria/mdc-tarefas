// Senha provisória recém-gerada: mostra uma vez, com a mensagem pronta para o WhatsApp (endereço, e-mail e senha).
// No primeiro acesso o HUB obriga a pessoa a criar a própria senha (login › trocar).
"use client";

import { useState } from "react";
import { Icone } from "@/components/ui/Icone";

export function mensagemSenha(p: { nome?: string; email: string; senha: string; endereco: string }) {
  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return (
    `${saudacao}${p.nome ? `, ${p.nome.split(" ")[0]}` : ""}! Seu acesso ao HUB da MDC Assessoria está pronto.\n` +
    `Endereço: ${p.endereco}\nE-mail: ${p.email}\nSenha provisória: ${p.senha}\n` +
    `No primeiro acesso o sistema pede para você criar a sua própria senha.`
  );
}

export function SenhaCopiavel(p: { nome?: string; email: string; senha: string; endereco: string }) {
  const [copiado, setCopiado] = useState<"" | "mensagem" | "senha">("");
  const texto = mensagemSenha(p);
  const whats = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  async function copiar(o: "mensagem" | "senha") {
    try {
      await navigator.clipboard.writeText(o === "mensagem" ? texto : p.senha);
      setCopiado(o);
    } catch {
      setCopiado("");
    }
  }
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-white px-3 py-2">
        <span className="text-xs text-neutral-600">Senha provisória</span>
        <code className="select-all text-lg font-semibold tracking-wider text-[var(--marca)]">{p.senha}</code>
        <button className="btn !min-h-8" onClick={() => copiar("senha")}>
          <Icone nome="copiar" className="h-4 w-4" />
          {copiado === "senha" ? "Senha copiada" : "Copiar senha"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn-primario !min-h-8" href={whats} target="_blank" rel="noopener noreferrer">
          <Icone nome="enviar" className="h-4 w-4" />
          Enviar pelo WhatsApp
        </a>
        <button className="btn !min-h-8" onClick={() => copiar("mensagem")}>
          <Icone nome="copiar" className="h-4 w-4" />
          {copiado === "mensagem" ? "Mensagem copiada" : "Copiar mensagem"}
        </button>
      </div>
      <p className="text-xs text-neutral-600">
        Anote ou mande agora: a senha não aparece de novo. Se perder, gere outra (a anterior deixa de valer).
      </p>
    </div>
  );
}
