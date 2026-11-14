// Versão publicada do HUB (14/11/2026). Cada aba aberta compara com a própria versão e, se mudou, avisa
// "Nova versão disponível" (components/shell/ProtecaoAtualizacao.tsx). Sem cache: sempre a versão no ar.
export function GET() {
  return Response.json({ versao: process.env.NEXT_PUBLIC_VERSAO_HUB ?? null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
