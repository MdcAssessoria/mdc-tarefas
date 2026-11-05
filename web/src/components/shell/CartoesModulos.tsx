// Início do HUB › "Seus módulos": um cartão por módulo liberado para a pessoa, com o ícone grande na cor do módulo
// (a mesma do menu lateral), o nome, para que serve e atalhos para as telas principais (com ícone). Pedido do Edvaldo
// (05/11/2026): sistema mais visual, reconhecer pelo desenho antes de ler o nome.
"use client";

import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Icone } from "@/components/ui/Icone";
import { COR_CARTAO } from "./coresModulos";
import { ehModuloGestao, filtrarLinks, podeModulo } from "./navegacao";
import type { Modulo } from "./navegacao";

interface Cartao {
  slug: string;
  nome: string;
  descricao: string;
  icone: string;
  rota: string;
  externo?: boolean;
}

/** Quantos atalhos cada cartão mostra (as primeiras telas do módulo, na ordem da barra de cima). */
const ATALHOS = 3;

export function CartoesModulos() {
  const { apps, pode, podeEditarCadastros } = useOrg();
  const ferramentas = apps.filter((a) => a.papel && a.status !== "em_breve");
  const gestao = ferramentas.filter((a) => ehModuloGestao(a.slug));
  // mesma ordem do menu: escritório, depois a Gestão (dia a dia, PN e cadastros de apoio)
  const apoio = ["centros_custo", "plano_contas"];
  const ordenadas = [
    ...ferramentas.filter((a) => !ehModuloGestao(a.slug)),
    ...gestao.filter((a) => !apoio.includes(a.slug)),
    ...gestao.filter((a) => apoio.includes(a.slug)),
  ];
  const cartoes: Cartao[] = ordenadas.map((a) => ({
    slug: a.slug,
    nome: a.slug === "comercial" ? "CRM Comercial" : a.nome,
    descricao: a.descricao ?? "",
    icone: a.icone,
    rota: a.rota,
    externo: a.externo,
  }));
  // PN - Parceiros de negócio: cadastro comum da Gestão (não é ferramenta do catálogo)
  if (gestao.some((a) => a.slug !== "licencas") && podeModulo("cadastros", pode)) {
    const i = cartoes.findLastIndex((c) => ehModuloGestao(c.slug) && !apoio.includes(c.slug));
    cartoes.splice(i + 1, 0, {
      slug: "cadastros",
      nome: "PN - Parceiros de negócio",
      descricao: "Clientes e fornecedores da MDC",
      icone: "pessoas",
      rota: "/cadastros/clientes",
    });
  }
  if (!cartoes.length) return null;

  return (
    <section aria-labelledby="seus-modulos">
      <h2 id="seus-modulos" className="mb-3 text-[17px] font-semibold text-[var(--marca)]">
        Seus módulos
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {cartoes.map((c) => {
          const cor = COR_CARTAO[c.slug] ?? COR_CARTAO.padrao;
          const atalhos = c.externo ? [] : filtrarLinks(c.slug as Modulo, { pode, podeEditarCadastros }).slice(0, ATALHOS);
          return (
            <li
              key={c.slug}
              className={`group flex flex-col rounded-2xl border border-[var(--borda)] bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${cor.borda}`}
            >
              <Link
                href={c.rota}
                target={c.externo ? "_blank" : undefined}
                rel={c.externo ? "noopener" : undefined}
                className="flex items-start gap-3"
              >
                <span aria-hidden="true" className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${cor.tile}`}>
                  <Icone nome={c.icone} className="h-7 w-7" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[16px] font-semibold text-[var(--marca)]">
                    {c.nome}
                    <Icone
                      nome={c.externo ? "externo" : "seta-direita"}
                      className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60"
                    />
                  </span>
                  {c.descricao && <span className="mt-0.5 block text-[13px] leading-snug text-[var(--texto-suave)]">{c.descricao}</span>}
                </span>
              </Link>
              {atalhos.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--borda)] pt-3">
                  {atalhos.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--borda)] px-2.5 py-1 text-[12px] text-[var(--texto)] transition-colors hover:border-[var(--destaque-escuro)] hover:text-[var(--marca)]"
                    >
                      {l.icone && <Icone nome={l.icone} className="h-3.5 w-3.5 text-[var(--destaque-escuro)]" />}
                      {l.nome}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
