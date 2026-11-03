// Botão "Ver caminho" (ícone de ramificação): abre a árvore de um documento (ArvoreDocumento, no Financeiro) nas listas e
// nos detalhes de pedidos, notas, contas a pagar/receber e contratos. Mora aqui para os detalhes usarem sem importar a árvore.
import { Icone } from "./Icone";

/** Botão "Ver caminho" das listas e detalhes. `compacto` mostra só o ícone (o nome continua para leitores de tela). */
export function BotaoVerCaminho({
  aoClicar,
  compacto = false,
  className = "",
}: {
  aoClicar: () => void;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn !min-h-8 ${compacto ? "!px-2.5" : "!px-3"} ${className}`}
      onClick={aoClicar}
      aria-label={compacto ? "Ver caminho" : undefined}
      title="Ver caminho: de onde veio este documento e para onde foi (pedido, nota, contas e pagamentos)"
    >
      <Icone nome="ramificacao" className="h-4 w-4" />
      {!compacto && "Ver caminho"}
    </button>
  );
}
