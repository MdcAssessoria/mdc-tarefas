import type { Metadata, Viewport } from "next";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/bodoni-moda/500.css";
import "@fontsource/bodoni-moda/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HUB-MDC",
  applicationName: "HUB-MDC",
  description: "Hub de sistemas da MDC Assessoria Contábil: tarefas, societário, demonstrativos, atendimento e Portal do Cliente.",
  manifest: "/hub-mdc/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/hub-mdc/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/hub-mdc/icone-hub-mdc.svg", type: "image/svg+xml" },
      { url: "/hub-mdc/icone-hub-mdc-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/hub-mdc/icone-hub-mdc-180.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "HUB-MDC", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0B2820",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
