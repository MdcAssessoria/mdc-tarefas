// Peças comuns do Financeiro. As peças de tela (botões PDF/Excel, filtro de período, indicador, chip, valor e janela de
// motivo) moraram aqui até 02/11/2026 e agora ficam em components/ui/ (docs/08-convencoes.md, 8.3.1).
import type { PropsTelaEmpresa } from "@/dominios/organizacao/componentes/EmpresaEmGestao";

// Reexportações temporárias para não quebrar trabalho paralelo: remover depois da integração (importe de components/ui).
export { BotoesExportar } from "@/components/ui/BotoesExportar";
export { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
export { Indicador } from "@/components/ui/Indicador";
export { Chip } from "@/components/ui/Chip";
export { Valor } from "@/components/ui/Valor";
export { JanelaMotivo } from "@/components/ui/JanelaMotivo";
export { TONS } from "@/components/ui/Tons";
export type { Tom } from "@/components/ui/Tons";

/** O que toda tela de cadastro (pessoas, categorias, centros) recebe da página (o mesmo da TelaEmpresa). */
export type PropsAba = PropsTelaEmpresa;
