// Edge Function ledgra-link-webhook: recebe os avisos do Ledgra Link (cobrança paga, baixada, cancelada…).
// Não tem login de usuário (quem chama é o Ledgra Link), por isso a defesa é a ASSINATURA: o corpo exato, o horário e
// o segredo do HUB geram o cabeçalho ledgra-link-assinatura; aviso adulterado ou com mais de 5 minutos é recusado.
// O aviso é aplicado pela função do banco link_aplicar_evento, uma vez só por id (o Ledgra Link repete até receber 200).
//
// Segredo (Edge Functions › Secrets): LEDGRA_LINK_SEGREDO_WEBHOOK (o "segredo" mostrado uma vez pelo Ledgra Link ao
// configurar o endereço deste webhook).
import { bancoServico } from "../_fiscal/http.ts";
import { ErroLedgraLink, LedgraLink } from "../_ledgra_link/ledgra-link-cliente.ts";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "Método não suportado." });
  const segredo = Deno.env.get("LEDGRA_LINK_SEGREDO_WEBHOOK");
  if (!segredo) return json(503, { erro: "Webhook do Ledgra Link não configurado." });

  // corpo BRUTO: a assinatura é sobre o texto exato que chegou
  const bruto = await req.text();
  if (bruto.length > 64_000) return json(413, { erro: "Aviso grande demais." });
  let evento;
  try {
    evento = LedgraLink.lerEvento(segredo, bruto, req.headers.get("ledgra-link-assinatura"));
  } catch (e) {
    return json(401, { erro: e instanceof ErroLedgraLink ? e.message : "Assinatura inválida." });
  }

  const { data, error } = await bancoServico().rpc("link_aplicar_evento", {
    p_evento: evento.id,
    p_tipo: evento.tipo,
    p_dados: evento.dados,
  });
  // erro do banco = 500: o Ledgra Link tenta de novo mais tarde (o id evita aplicar duas vezes)
  if (error) return json(500, { erro: "Não foi possível aplicar o aviso agora." });
  return json(200, { recebido: true, resultado: data });
});
