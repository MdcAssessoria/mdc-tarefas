// Formulário em colunas dentro de uma janela larga (Modal "5xl"/"6xl"): duas (ou três) colunas lado a lado no
// computador e uma coluna só abaixo de 1024 px (notebook pequeno, tablet, celular). Dados principais na coluna da
// esquerda, valores e detalhes na da direita. Regra em docs/08-convencoes.md, seção 8.3.1.
//
//   <ColunasFormulario>
//     <ColunaFormulario>…tipo, nome, cliente…</ColunaFormulario>
//     <ColunaFormulario>…valor, faturamento…</ColunaFormulario>
//   </ColunasFormulario>

const GRADE = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", "2-3": "lg:grid-cols-2 2xl:grid-cols-3" } as const;
/** Duas colunas com a da esquerda mais larga (ex.: itens do pedido à esquerda, pagamento à direita). */
const ESQUERDA_LARGA = "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]";

export function ColunasFormulario({
  colunas = 2,
  esquerdaLarga = false,
  className = "",
  children,
}: {
  /** Quantas colunas no computador (a partir de 1024 px). "2-3": duas no notebook e três no monitor grande
   *  (a partir de 1536 px); a primeira coluna leva `className="lg:row-span-2 2xl:row-span-1"` para que, com duas,
   *  a segunda e a terceira fiquem uma embaixo da outra à direita. */
  colunas?: keyof typeof GRADE;
  /** Com duas colunas, a da esquerda fica com 60% da largura. */
  esquerdaLarga?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid items-start gap-x-6 gap-y-3 ${esquerdaLarga && colunas === 2 ? ESQUERDA_LARGA : GRADE[colunas]} ${className}`}>
      {children}
    </div>
  );
}

/** Uma coluna do formulário: os blocos ficam um embaixo do outro com o mesmo espaço da janela. */
export function ColunaFormulario({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`min-w-0 space-y-3 ${className}`}>{children}</div>;
}
