// Edge Function nfse-automatica: emite sozinha a NFS-e das faturas no modo automático (Contratos › Nota fiscal).
//   POST { acao: "rodar" } com o cabeçalho x-agente-token — chamada pelo agendador do banco (pg_cron, 06h45 de Brasília,
//   migração 052). Publicada com verify_jwt = false: quem autoriza é o token interno do Vault, conferido no banco
//   (nfse_token_confere), como na fiscal-captura. Não existe caminho com login de usuário nem resposta com dados da nota.
// Para cada fatura de hoje (nfse_auto_pendentes: empresa da gestão, modo automático, NFS-e, sem nota e sem tentativa
// hoje) faz o mesmo que o botão "Emitir nota fiscal" (_fiscal/emitirFatura.ts: nDPS sem repetir, DPS assinada, mTLS,
// resultado gravado) e guarda a tentativa do dia (nfse_auto_registrar), que avisa no sino quando a nota não sai.
import { bancoServico, cabecalhos, resposta } from "../_fiscal/http.ts";
import { emitirFatura } from "../_fiscal/emitirFatura.ts";
import { resultadoAutomatico } from "../_fiscal/automatica.ts";

interface Pendente {
  fatura: string;
  numero: string;
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const token = req.headers.get("x-agente-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { erro: "Chamada não autorizada." });
  const sb = bancoServico();
  const ok = await sb.rpc("nfse_token_confere", { p_token: token });
  if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });

  const { data, error } = await sb.rpc("nfse_auto_pendentes");
  if (error) return json(500, { erro: error.message });
  const pendentes = (data ?? []) as Pendente[];
  const resultados: { numero: string; resultado: string }[] = [];
  for (const p of pendentes) {
    let r: { status: number; corpo: Record<string, unknown> };
    try {
      r = await emitirFatura(sb, p.fatura, null);
    } catch (e) {
      r = { status: 500, corpo: { erro: (e as Error).message } };
    }
    const { resultado, mensagem } = resultadoAutomatico(r.status, r.corpo);
    const g = await sb.rpc("nfse_auto_registrar", { p_fatura: p.fatura, p_resultado: resultado, p_mensagem: mensagem });
    if (g.error) console.error(`nfse_auto_registrar (fatura ${p.numero}): ${g.error.message}`);
    resultados.push({ numero: p.numero, resultado });
  }
  return json(200, { total: pendentes.length, resultados });
});
