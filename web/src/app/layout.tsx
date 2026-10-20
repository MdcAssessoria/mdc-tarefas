import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MDC Tarefas",
  description: "Controle de tarefas e obrigações da equipe, com painel em tempo real para TV.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MDC Tarefas", statusBarStyle: "black-translucent" },
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
