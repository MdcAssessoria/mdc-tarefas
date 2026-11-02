// Chip de situação com bolinha de cor (mesmo desenho em todas as listas). Tons e significados em Tons.ts.
import { TONS } from "./Tons";
import type { Tom } from "./Tons";

export function Chip({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return (
    <span className={`chip ${TONS[tom].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONS[tom].ponto}`} aria-hidden="true" />
      {children}
    </span>
  );
}
