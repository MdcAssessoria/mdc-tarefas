// Quadro do padrão de demonstrativo da MDC (estilo .demo em globals.css): rolagem própria, cabeçalho verde preso no topo e
// 1ª coluna presa à esquerda. Usado pelo BI de Gestão e pelo módulo Demonstrativos (balancete, BP, DRE, DFC).
export function QuadroDemonstrativo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="demo-quadro" tabIndex={0} role="region" aria-label={rotulo}>
      <table className="demo">{children}</table>
    </div>
  );
}
