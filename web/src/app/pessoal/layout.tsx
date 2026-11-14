// Entrada do MDC · Pessoal: o app instalado a partir daqui leva o nome e o ícone do Pessoal (manifesto próprio).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MDC · Pessoal",
  manifest: "/hub-mdc/manifest-pessoal.webmanifest",
  // ícone do Pessoal: o oval com as três barras "///" do logo da MDC, dourado sobre o verde
  icons: {
    icon: [{ url: "/hub-mdc/icone-pessoal-64.png", sizes: "64x64", type: "image/png" }],
    apple: [{ url: "/hub-mdc/icone-pessoal-180.png", sizes: "180x180" }],
  },
};

export default function LayoutPessoal({ children }: { children: React.ReactNode }) {
  return children;
}
