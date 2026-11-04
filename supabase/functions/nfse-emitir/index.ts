// Edge Function nfse-emitir: emite a NFS-e de uma fatura de contrato pelo Emissor Nacional (API da Sefin Nacional),
// pedida pela tela Contratos › Faturas ("Emitir nota fiscal").
//   POST { fatura }   (com o login de quem usa a tela; publicada com verify_jwt = true)
// 1) Confere o login e a permissão NO BANCO: nfse_preparar com o login de quem chamou (pode_emitir = Contratos operar;
//    pronto = sem pendência: parâmetros, certificado, código do serviço, CNPJ do cliente…).
// 2) Reserva o nDPS (nfse_reservar, service_role): trava a fatura e a numeração, nunca repete; resultado incerto da
//    tentativa anterior volta como reenvio da MESMA DPS (a função confere no Emissor antes de mandar de novo).
// 3) Abre o certificado A1 da empresa no cofre (fis_cert_obter), monta e assina a DPS (_fiscal/emissao.ts) e envia com
//    mTLS para o ambiente configurado (produção restrita = teste sem valor fiscal, ou produção).
// 4) Guarda a DPS e o XML da NFS-e no bucket fiscal (<org>/<cliente>/nfse-emitidas/AAAA/MM/…) e grava o resultado
//    (nfse_registrar_resultado): emitida em produção → fatura emitida e Portal liberado; recusa → mensagens em português.
// Nunca escreve certificado, senha, chave privada nem o XML em log.
import { bancoServico, bancoUsuario, cabecalhos, resposta } from "../_fiscal/http.ts";
import { emitirFatura } from "../_fiscal/emitirFatura.ts";
import type { DadosBanco } from "../_fiscal/emitirFatura.ts";

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { erro: "Faça login." });
  const corpo = (await req.json().catch(() => ({}))) as { fatura?: string };
  const fatura = String(corpo.fatura ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(fatura)) return json(400, { erro: "Escolha a fatura." });

  // 1) login e permissão conferidos no banco, com o login de quem chamou
  const usuario = bancoUsuario(auth);
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { erro: "Sessão expirada. Entre de novo." });
  const prep = await usuario.rpc("nfse_preparar", { p_fatura: fatura });
  if (prep.error) return json(400, { erro: prep.error.message });
  const p = prep.data as DadosBanco;
  if (!p.pode_emitir) return json(403, { erro: "Sem permissão para emitir nota fiscal (módulo Contratos, nível operar)." });
  if (!p.pronto) return json(400, { erro: `Falta ajustar antes de emitir: ${p.pendencias.join("; ")}.`, pendencias: p.pendencias });

  // 2) a 4) reserva do nDPS, DPS assinada, envio e resultado (o mesmo caminho da emissão automática)
  const r = await emitirFatura(bancoServico(), fatura, u.user.id);
  return json(r.status, r.corpo);
});
