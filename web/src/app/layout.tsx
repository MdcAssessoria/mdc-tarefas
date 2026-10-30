import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HUB-MDC",
  applicationName: "HUB-MDC",
  description: "Hub de sistemas da MDC Assessoria Contábil: tarefas, societário, demonstrativos, atendimento e Portal do Cliente.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icone-hub-mdc.svg", type: "image/svg+xml" },
      { url: "/icone-hub-mdc-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icone-hub-mdc-180.png", sizes: "180x180" }],
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
