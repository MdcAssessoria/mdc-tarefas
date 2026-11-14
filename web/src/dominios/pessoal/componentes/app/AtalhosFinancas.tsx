// Cartão "Finanças da família" na tela Família: onde o dinheiro fica (contas e cartões), a lista completa das contas
// com PDF e Excel, importar extrato e o painel. No celular é a porta para o que não cabe na barra de baixo.
"use client";

import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";

const LINKS: { href: string; titulo: string; dica: string; icone: NomeIcone }[] = [
  { href: "/financeiro/bancos", titulo: "Contas e cartões", dica: "Onde o dinheiro fica: banco, carteira", icone: "banco" },
  { href: "/financeiro/pagar", titulo: "Lista completa de contas", dica: "Filtros, PDF e Excel", icone: "lista" },
  { href: "/financeiro/extratos", titulo: "Importar extrato", dica: "Arquivo do app do banco", icone: "importar" },
  { href: "/financeiro", titulo: "Painel das finanças", dica: "Gráficos do mês e do ano", icone: "grafico" },
];

export function AtalhosFinancas() {
  return (
    <section className="cartao p-0">
      <h2 className="border-b border-[var(--borda)] px-4 py-3 font-semibold text-[var(--marca)]">Finanças da família</h2>
      <ul>
        {LINKS.map((l) => (
          <li key={l.href} className="border-b border-[#EEEAE0] last:border-b-0">
            <Link href={l.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <Icone nome={l.icone} className="h-5 w-5 text-[var(--marca)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-neutral-900">{l.titulo}</span>
                <span className="block text-[12px] text-neutral-500">{l.dica}</span>
              </span>
              <Icone nome="expandir" className="h-4 w-4 text-neutral-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
