// Lista das fragilidades encontradas no balancete, com nível de risco, evidência e recomendação.
import type { Alerta } from "@/lib/balancete";

/** Lista de fragilidades com evidência, risco e recomendação. */
export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return <p className="text-sm text-emerald-700">Nenhuma fragilidade relevante nas verificações deste balancete.</p>;
  return (
    <ul className="space-y-2">
      {alertas.map((a, k) => (
        <li
          key={k}
          className={`rounded-lg border p-3 text-sm ${a.nivel === "alto" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${a.nivel === "alto" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
              {a.nivel === "alto" ? "Risco alto" : "Atenção"}
            </span>
            <b>{a.texto}</b>
            <span className="text-xs text-neutral-500">{a.area}</span>
          </div>
          <div className="mt-1 text-neutral-700">Evidência: {a.evidencia}</div>
          <div className="text-neutral-700">Recomendação: {a.recomendacao}</div>
        </li>
      ))}
    </ul>
  );
}
