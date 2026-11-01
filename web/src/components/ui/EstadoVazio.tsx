// Mensagem para lista vazia: diz o que está acontecendo e, se houver, qual é o próximo passo.
// Com `icone` (e opcionalmente `titulo`) vira o estado vazio ilustrado do molde de lista (docs/08-convencoes.md 8.3.1).
import { Icone } from "./Icone";

export function EstadoVazio({
  children,
  acao,
  icone,
  titulo,
}: {
  children: React.ReactNode;
  acao?: React.ReactNode;
  icone?: string;
  titulo?: React.ReactNode;
}) {
  if (!icone && !titulo)
    return (
      <div className="py-6 text-center text-sm text-neutral-500">
        <p>{children}</p>
        {acao && <div className="mt-3">{acao}</div>}
      </div>
    );
  return (
    <div className="cartao flex flex-col items-center px-6 py-10 text-center">
      {icone && (
        <span className="relative mb-4 grid h-16 w-16 place-items-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-2xl bg-[var(--fundo)]" />
          <span className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border-2 border-white bg-[var(--destaque)]" />
          <Icone nome={icone} className="relative h-8 w-8 text-[var(--marca)]" />
        </span>
      )}
      {titulo && <p className="text-[15px] font-semibold text-[var(--marca)]">{titulo}</p>}
      <p className="mt-1 max-w-md text-sm text-[var(--texto-suave)]">{children}</p>
      {acao && <div className="mt-4 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}
