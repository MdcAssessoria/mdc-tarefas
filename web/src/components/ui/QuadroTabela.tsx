// Quadro padrão de lista: tabela com cabeçalho fixo, linhas zebradas suaves e, no celular, cada linha vira um cartão
// (as células precisam de data-rotulo="Coluna"; a principal leva className="celula-titulo" e a de botões "celula-acoes").
// O CSS está em app/globals.css ("molde de lista"); o molde, em docs/08-convencoes.md (8.3.1).

export function QuadroTabela({
  children,
  rodape,
  rotulo,
  cartoes = true,
}: {
  /** <thead>, <tbody> e <tfoot> da tabela. */
  children: React.ReactNode;
  /** Texto abaixo da tabela (ex.: "Mostrando 500 de 812"). */
  rodape?: React.ReactNode;
  /** Nome da lista para leitores de tela. */
  rotulo?: string;
  /** false mantém a tabela no celular (para listas de 2 colunas, como o resultado de caixa). Padrão: vira cartões. */
  cartoes?: boolean;
}) {
  return (
    // tabIndex: o quadro rola de lado; pelo teclado, a pessoa foca nele e usa as setas (WCAG 2.1.1)
    <div className="quadro-tabela" tabIndex={0} role="region" aria-label={rotulo ?? "Tabela"}>
      <table className={`tabela tabela-listrada ${cartoes ? "tabela-cartoes" : ""}`} aria-label={rotulo}>
        {children}
      </table>
      {rodape && <p className="border-t border-[var(--borda)] p-3 text-xs text-[var(--texto-suave)]">{rodape}</p>}
    </div>
  );
}
