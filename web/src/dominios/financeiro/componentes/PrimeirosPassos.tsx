// Primeiros passos de uma empresa nova no Financeiro (aparece no painel enquanto faltar algum): importar o plano do
// Domínio, cadastrar o banco, cadastrar despesas e receitas e lançar a primeira conta. A ordem importa: cada passo
// depende do anterior (banco e categorias se ligam a contas do plano).
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import type { PassoInicial } from "../painel";

const TEXTOS: Record<PassoInicial["id"], { titulo: string; texto: string; href: string; botao: string }> = {
  plano: {
    titulo: "Importe o plano de contas",
    texto: "No Domínio, exporte o plano da empresa em Excel e traga para cá. Ele liga o Financeiro à contabilidade.",
    href: "/plano-contas",
    botao: "Importar o plano",
  },
  banco: {
    titulo: "Cadastre o banco",
    texto: "Informe as contas bancárias e o saldo de um dia. Depois é só importar o extrato.",
    href: "/financeiro/bancos",
    botao: "Cadastrar banco",
  },
  categorias: {
    titulo: "Cadastre despesas e receitas",
    texto: "Aluguel, energia, vendas… Cada uma ligada a uma conta do plano, para o lançamento já sair classificado.",
    href: "/plano-contas/categorias",
    botao: "Cadastrar categorias",
  },
  lancar: {
    titulo: "Lance a primeira conta",
    texto: "Uma conta a pagar ou a receber. A partir dela o painel mostra vencimentos e o fluxo de caixa.",
    href: "/financeiro/pagar?nova=1",
    botao: "Lançar conta",
  },
};

export function PrimeirosPassos({ passos, podeOperar }: { passos: PassoInicial[]; podeOperar: boolean }) {
  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.find((p) => !p.feito)?.id;
  return (
    <section className="cartao overflow-hidden" aria-label="Primeiros passos">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--borda)] p-4 sm:p-5">
        <div className="mr-auto">
          <h2 className="font-semibold text-[var(--marca)]">Primeiros passos</h2>
          <p className="text-sm text-[var(--texto-suave)]">Quatro passos para o Financeiro desta empresa começar a trabalhar sozinho.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--texto-suave)]">
          <span className="num">
            {feitos} de {passos.length}
          </span>
          <span className="h-2 w-28 rounded-full bg-[var(--fundo)]">
            <span className="block h-2 rounded-full bg-[var(--destaque-escuro)]" style={{ width: `${(feitos / passos.length) * 100}%` }} />
          </span>
        </div>
      </div>
      <ol className="grid divide-y divide-[var(--borda)] md:grid-cols-4 md:divide-x md:divide-y-0">
        {passos.map((p, i) => {
          const t = TEXTOS[p.id];
          const eProximo = p.id === proximo;
          return (
            <li key={p.id} className={`flex flex-col gap-2 p-4 sm:p-5 ${eProximo ? "bg-[#fbf7ee]" : ""}`}>
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
                  p.feito
                    ? "bg-emerald-50 text-emerald-700"
                    : eProximo
                      ? "bg-[var(--marca)] text-[var(--destaque)]"
                      : "bg-[var(--fundo)] text-[var(--texto-suave)]"
                }`}
                aria-hidden="true"
              >
                {p.feito ? <Icone nome="check" className="h-4 w-4" /> : i + 1}
              </span>
              <h3
                className={`text-[15px] font-semibold ${p.feito ? "text-[var(--texto-suave)] line-through decoration-1" : "text-[var(--marca)]"}`}
              >
                {t.titulo}
                <span className="sr-only">{p.feito ? " (feito)" : " (falta)"}</span>
              </h3>
              <p className="text-sm text-[var(--texto-suave)]">{t.texto}</p>
              {!p.feito && podeOperar && (
                <Link href={t.href} className={`${eProximo ? "btn-primario" : "btn"} mt-auto self-start`}>
                  {t.botao}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
