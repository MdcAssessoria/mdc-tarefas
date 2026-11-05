// Edge Function fiscal-tabelas: mantém a tabela oficial serviço × NBS (Anexo VIII da NFS-e Nacional) atualizada (062).
//   POST { acao: "conferir" } com o cabeçalho x-agente-token — chamada pelo agendador do banco (pg_cron, toda segunda,
//   07h10 de Brasília). Publicada com verify_jwt = false: quem autoriza é o token interno do Vault, conferido no banco
//   (fis_tabelas_token_confere), como na nfse-automatica. Não lê nem devolve dado de cliente.
// Abre a página da documentação técnica (RTC) no portal da NFS-e, acha a planilha do Anexo VIII de versão mais alta,
// compara com a carregada (fis_tabela_versao) e, se for mais nova, baixa, lê (_fiscal/anexoViii.ts) e troca a tabela de
// uma vez (fis_tabela_carregar, que avisa os administradores no sino). Sem versão nova ou com falha, só registra a
// conferência (fis_tabela_conferida) — a tabela antiga continua valendo.
import * as XLSX from "xlsx";
import { bancoServico, cabecalhos, resposta } from "../_fiscal/http.ts";
import { compararVersoes, linhasAnexoViii, linksAnexoViii } from "../_fiscal/anexoViii.ts";

const PORTAL = "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc";
/**
 * Cópia da planilha oficial (v1.02.00, 26/10/2026) num repositório público (MIT) que guarda os anexos do portal. Só é
 * usada na 1ª carga, se o portal não responder e a tabela ainda estiver vazia; depois vale sempre o portal.
 */
const RESERVA = {
  url: "https://raw.githubusercontent.com/romanymelo/nfse-consulta/main/dados/oficial/Anexo%20VIII%20-%20v1.02.00%20(26-10-2026).xlsx",
  versao: "1.02.00",
};
const TABELA = "anexo_viii";

async function baixar(url: string): Promise<Uint8Array> {
  for (const u of [url, `${url}/@@download/file`]) {
    const r = await fetch(u, { headers: { "User-Agent": "HUB-MDC (tabelas fiscais)" }, redirect: "follow" });
    if (!r.ok) continue;
    const tipo = r.headers.get("content-type") ?? "";
    if (tipo.includes("html")) continue; // o Plone devolveu a página de visualização, tenta o download direto
    return new Uint8Array(await r.arrayBuffer());
  }
  throw new Error(`Não consegui baixar a planilha (${url}).`);
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = resposta(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const token = req.headers.get("x-agente-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { erro: "Chamada não autorizada." });
  const sb = bancoServico();
  const ok = await sb.rpc("fis_tabelas_token_confere", { p_token: token });
  if (ok.data !== true) return json(401, { erro: "Chamada não autorizada." });

  const registrar = async (mensagem: string) => {
    const r = await sb.rpc("fis_tabela_conferida", { p_tabela: TABELA, p_mensagem: mensagem });
    if (r.error) console.error(`fis_tabela_conferida: ${r.error.message}`);
  };
  try {
    const carregada = (await sb.rpc("fis_tabela_versao", { p_tabela: TABELA })).data as string | null;
    const atual = carregada ?? "0.00.00";
    let novo: { url: string; versao: string };
    try {
      const pagina = await fetch(PORTAL, { headers: { "User-Agent": "HUB-MDC (tabelas fiscais)" } });
      if (!pagina.ok) throw new Error(`O portal da NFS-e respondeu ${pagina.status}.`);
      const links = linksAnexoViii(await pagina.text(), PORTAL);
      if (!links.length) throw new Error("Não achei a planilha do Anexo VIII na página do portal (o endereço pode ter mudado).");
      novo = links[0];
    } catch (e) {
      if (carregada) throw e; // já há tabela: fica a antiga e registra a falha
      console.error(`fiscal-tabelas: portal sem resposta na 1ª carga (${(e as Error).message}); usando a cópia de reserva`);
      novo = RESERVA;
    }
    if (compararVersoes(novo.versao, atual) <= 0) {
      await registrar(`Conferido: a versão do portal (${novo.versao}) é a mesma carregada.`);
      return json(200, { situacao: "em_dia", versao: atual });
    }
    const wb = XLSX.read(await baixar(novo.url), { type: "array" });
    const aba = wb.Sheets["tabela geral"] ?? wb.Sheets[wb.SheetNames[0]];
    const linhas = linhasAnexoViii(XLSX.utils.sheet_to_json(aba, { header: 1, defval: null, raw: false }) as unknown[][]);
    const r = await sb.rpc("fis_tabela_carregar", {
      p_tabela: TABELA,
      p_versao: novo.versao,
      p_publicada: null,
      p_fonte: novo.url,
      p_linhas: linhas,
    });
    if (r.error) throw new Error(r.error.message);
    return json(200, { situacao: "atualizada", de: atual, para: novo.versao, linhas: linhas.length });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`fiscal-tabelas: ${msg}`);
    await registrar(`Falha ao conferir: ${msg}`.slice(0, 500));
    return json(200, { situacao: "falha", erro: msg });
  }
});
