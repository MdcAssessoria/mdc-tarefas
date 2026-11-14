// Entrada do MDC · Pessoal: o app instalado a partir daqui leva o nome e o ícone do Pessoal (manifesto próprio).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MDC · Pessoal",
  manifest: "/hub-mdc/manifest-pessoal.webmanifest",
};

export default function LayoutPessoal({ children }: { children: React.ReactNode }) {
  return children;
}
