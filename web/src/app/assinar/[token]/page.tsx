// Assinatura do contrato de licença pelo link (085), sem login: o cliente lê o contrato, informa nome e CPF (o CPF
// precisa ser o de quem a MDC indicou) e marca "Li e concordo". O banco grava data, hora, IP e navegador. Não aparece
// em buscadores e não manda o endereço (com o código) para outros sites.
import type { Metadata } from "next";
import { Assinar } from "./Assinar";

export const metadata: Metadata = {
  title: "Assinar contrato · MDC Assessoria",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PaginaAssinar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Assinar token={token} />;
}
