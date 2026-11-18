// Peças da tela do Manual do HUB: ícone de cada área, abertura com as dúvidas mais comuns (um toque já pesquisa),
// resultados da pesquisa (com aviso quando são aproximados) e o botão "Ir para a tela", que abre a tela de verdade a
// partir do caminho escrito no manual — só para quem pode abrir (mesma regra da Guarda: podeAbrirRota).
"use client";

import Link from "next/link";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { NAV, moduloDaRota, podeAbrirRota } from "@/components/shell/navegacao";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { buscarNoManual, caminhoNoMenu, nomeCurto, rotaDoCaminho, type AreaManual } from "@/dominios/manual/manual";
import { TextoManual } from "./BlocosManual";

const ICONE_DA_AREA: Record<string, NomeIcone> = {
  "como-usar-este-manual": "info",
  "primeiro-acesso": "escudo",
  "o-que-vale-em-todas-as-telas": "grade",
  tarefas: "check",
  societario: "pasta",
  demonstrativos: "planilha",
  atendimento: "chat",
  vencimentos: "relogio",
  "crm-comercial": "funil",
  contratos: "documento",
  "licencas-ledgra": "etiqueta",
  "pessoas-e-acessos": "pessoas",
  "duvidas-frequentes": "info",
  "controle-de-versoes": "relogio",
};
export const iconeDaArea = (id: string): NomeIcone => ICONE_DA_AREA[id] ?? "documento";
export const TUDO = "tudo";

/** Dúvidas que mais aparecem: um toque pesquisa no manual. */
export const DUVIDAS_COMUNS = [
  "Esqueci a senha",
  "Como dou acesso a uma pessoa",
  "Mesma tarefa para vários clientes",
  "Como cancelar uma tarefa",
  "Responsável de cada cliente",
  "Obrigações recorrentes",
  "Como baixar em Excel ou PDF",
  "Instalar o HUB no celular",
];

const SECOES = Object.values(NAV);

/** Botão que abre a tela descrita no manual, quando ela existe no menu e a pessoa pode abrir. */
export function IrParaTela({ titulo }: { titulo: string }) {
  const { pode, podeEditarCadastros, papel } = useOrg();
  const rota = rotaDoCaminho(caminhoNoMenu(titulo), SECOES);
  if (!rota || !podeAbrirRota(rota, moduloDaRota(rota), { pode, podeEditarCadastros, admin: papel === "admin" })) return null;
  return (
    <Link href={rota} className="btn" onClick={(e) => e.stopPropagation()}>
      <Icone nome="externo" className="h-4 w-4" />
      Ir para a tela
    </Link>
  );
}

function BotoesDuvidas({ pesquisar, quantas }: { pesquisar: (t: string) => void; quantas?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DUVIDAS_COMUNS.slice(0, quantas).map((d) => (
        <button
          key={d}
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--borda)] bg-white px-3 text-[13px] hover:border-[var(--marca)]"
          onClick={() => pesquisar(d)}
        >
          <Icone nome="busca" className="h-3.5 w-3.5" />
          {d}
        </button>
      ))}
    </div>
  );
}

export function Inicio({
  areas,
  abrir,
  pesquisar,
}: {
  areas: AreaManual[];
  abrir: (id: string | null, tela?: string) => void;
  pesquisar: (texto: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="cartao space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--destaque)]/40 text-[var(--marca)]">
            <Icone nome="busca" />
          </span>
          <div className="min-w-0 text-sm text-[var(--texto-suave)]">
            <p className="font-semibold text-[var(--texto)]">Qual é a sua dúvida?</p>
            <p>Escreva na pesquisa acima do seu jeito, como numa conversa, ou toque numa das dúvidas mais comuns:</p>
          </div>
        </div>
        <BotoesDuvidas pesquisar={pesquisar} />
      </div>
      <div className="cartao flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--destaque)]/40 text-[var(--marca)]">
          <Icone nome="documento" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-[var(--texto-suave)]">
          Prefere ler? Toque numa área para ver as telas dela, ou abra o manual inteiro do começo ao fim.
        </p>
        <button type="button" className="btn" onClick={() => abrir(TUDO)}>
          <Icone nome="olho" className="h-4 w-4" />
          Abrir o manual inteiro
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => abrir(a.id)}
              className="cartao flex h-full w-full flex-col gap-2 p-4 text-left hover:border-[var(--marca)]"
            >
              <span className="flex items-center gap-2 font-semibold text-[var(--marca)]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--destaque)]/40">
                  <Icone nome={iconeDaArea(a.id)} className="h-4 w-4" />
                </span>
                {a.titulo}
              </span>
              <span className="text-xs text-[var(--texto-suave)]">
                {a.telas.length > 0
                  ? a.telas
                      .slice(0, 5)
                      .map((t) => nomeCurto(t.titulo))
                      .join(" · ") + (a.telas.length > 5 ? ` e mais ${a.telas.length - 5}` : "")
                  : "Leitura rápida"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Resultados({
  busca,
  resultados,
  abrir,
  pesquisar,
}: {
  busca: string;
  resultados: ReturnType<typeof buscarNoManual>;
  abrir: (id: string | null, tela?: string) => void;
  pesquisar: (texto: string) => void;
}) {
  if (!resultados.length)
    return (
      <div className="space-y-3">
        <EstadoVazio icone="busca" titulo={`Nada encontrado para “${busca}”`}>
          Tente com menos palavras ou outra palavra (ex.: só “tarefa”, “senha” ou “cliente”).
        </EstadoVazio>
        <div className="flex justify-center">
          <BotoesDuvidas pesquisar={pesquisar} quantas={6} />
        </div>
      </div>
    );
  const aproximado = resultados[0].parcial;
  return (
    <div className="space-y-2">
      {aproximado ? (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--borda)] bg-white p-3 text-sm">
          <Icone nome="info" className="h-4 w-4 shrink-0" />
          <span>
            Não achei um trecho com tudo o que você escreveu. Estes são os mais parecidos; se não for nenhum, tente com menos palavras.
          </span>
        </p>
      ) : (
        <p className="text-sm text-[var(--texto-suave)]">
          {resultados.length} {resultados.length === 1 ? "lugar encontrado" : "lugares encontrados"} no manual. O mais provável vem
          primeiro; toque para ler.
        </p>
      )}
      <ul className="space-y-2">
        {resultados.slice(0, 40).map((r, i) => {
          const menu = r.tela ? caminhoNoMenu(r.tela.titulo) : null;
          return (
            <li key={r.tela?.id ?? r.area.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => abrir(r.area.id, r.tela?.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && abrir(r.area.id, r.tela?.id)}
                className={`cartao flex w-full cursor-pointer flex-col gap-2 p-3 text-left hover:border-[var(--marca)] sm:flex-row sm:items-start sm:gap-3 ${
                  i === 0 && !aproximado ? "border-[var(--marca)]" : ""
                }`}
              >
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--destaque)]/40 text-[var(--marca)]">
                    <Icone nome={iconeDaArea(r.area.id)} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--marca)]">
                      <TextoManual texto={r.tela ? `${r.area.titulo} › ${nomeCurto(r.tela.titulo)}` : r.area.titulo} busca={busca} />
                    </span>
                    {menu && <span className="mt-0.5 block text-xs text-[var(--texto-suave)]">No menu: {menu}</span>}
                    <span className="mt-1 block text-sm text-[var(--texto-suave)]">
                      <TextoManual texto={r.trecho} busca={busca} />
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-2 pl-11 sm:pl-0">
                  <span className="btn">
                    <Icone nome="documento" className="h-4 w-4" />
                    Ler no manual
                  </span>
                  {r.tela && <IrParaTela titulo={r.tela.titulo} />}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
