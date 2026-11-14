// Cartão no Início do HUB para quem também tem família no MDC · Pessoal: "Suas finanças pessoais · Família X · Abrir".
// Abre o app da família em outra aba (o HUB continua aberto nesta). Some para quem não tem família.
"use client";

import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Icone } from "@/components/ui/Icone";
import { caminho } from "@/lib/caminho";

export function CartaoMinhaFamilia() {
  const { orgs } = useOrg();
  const familias = orgs.filter((o) => o.tipo === "pessoal");
  if (!familias.length) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[18px] bg-[var(--marca)] p-4 text-[#C6D3CC] sm:flex-nowrap">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-[var(--destaque)]">
        <Icone nome="carteira" className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-base text-white">Suas finanças pessoais · MDC · Pessoal</b>
        <span className="text-[13px]">{familias.map((f) => f.nome).join(" · ")}: contas da casa, tarefas e o resumo do dia.</span>
      </span>
      {familias.map((f) => (
        <a
          key={f.id}
          href={caminho(familias.length > 1 ? `/?org=${encodeURIComponent(f.slug)}` : "/pessoal")}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--destaque)] px-4 text-sm font-semibold text-[var(--marca)]"
        >
          <Icone nome="externo" className="h-4 w-4" />
          {familias.length > 1 ? `Abrir ${f.nome}` : "Abrir"}
        </a>
      ))}
    </section>
  );
}
