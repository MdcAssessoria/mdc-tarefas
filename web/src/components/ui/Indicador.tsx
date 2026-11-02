// Cartão de número em destaque com ícone e tom (molde 8.3.1). Com `aoClicar` vira filtro da lista ("Filtrando").
import { Icone } from "./Icone";
import type { NomeIcone } from "./Icone";
import { TONS } from "./Tons";
import type { Tom } from "./Tons";

export function Indicador({
  titulo,
  valor,
  detalhe,
  tom = "neutro",
  icone,
  ativo,
  aoClicar,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  tom?: Tom;
  /** Obrigatório: o ícone ajuda quem lê pouco a achar o número certo. */
  icone: NomeIcone;
  ativo?: boolean;
  aoClicar?: () => void;
}) {
  const t = TONS[tom];
  const corpo = (
    <div className="flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.icone}`} aria-hidden="true">
        <Icone nome={icone} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-[var(--texto-suave)]">{titulo}</p>
        <p className={`num text-xl font-semibold tracking-tight ${t.valor}`}>{valor}</p>
        {detalhe && <p className="text-xs text-[var(--texto-suave)]">{detalhe}</p>}
      </div>
      {aoClicar && (
        <span className={`ml-auto text-[11px] ${ativo ? "text-[var(--destaque-escuro)]" : "text-transparent"}`}>Filtrando</span>
      )}
    </div>
  );
  return aoClicar ? (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={!!ativo}
      title={ativo ? "Clique para tirar o filtro" : "Clique para ver só estes"}
      className={`cartao p-4 text-left transition hover:border-[var(--destaque-escuro)] ${ativo ? "border-[var(--destaque-escuro)] ring-2 ring-[var(--destaque)]" : ""}`}
    >
      {corpo}
    </button>
  ) : (
    <div className="cartao p-4">{corpo}</div>
  );
}
