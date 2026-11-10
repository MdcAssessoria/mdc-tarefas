// DPS (Declaração de Prestação de Serviço) da NFS-e Nacional, para o HUB emitir a nota das faturas pelo Emissor Nacional
// (API da Sefin Nacional): Id de 45 posições, XML do leiaute 1.01 já na forma canônica (C14N) para assinar, datas no
// fuso de Brasília, endereços da API e leitura do retorno (nota emitida, recusa com os códigos traduzidos, falta de
// resposta). Código puro (sem rede): a Função Edge nfse-emitir faz a chamada com o certificado A1 (mTLS) e assina.
// Vai para as Funções Edge pela cópia em supabase/functions/_fiscal/nucleo (scripts/sync-funcoes.sh).
//
// Fontes (03/11/2026):
//  - Esquemas oficiais DPS_v1.01.xsd, tiposComplexos_v1.01.xsd e tiposSimples_v1.01.xsd (gov.br/nfse, Anexo I –
//    Leiautes e Regras de Negócio da DPS), copiados em supabase/testes/esquemas/nfse-1.01 para validar nos testes.
//  - API: POST {Sefin}/nfse com {"dpsXmlGZipB64": "<DPS assinada em gzip + base64>"}; GET {Sefin}/dps/{Id} (chave da
//    NFS-e gerada a partir da DPS); GET {Sefin}/nfse/{chave} (XML da NFS-e) — Manual dos Contribuintes, Emissor Público
//    API, v1.2 (out/2025). Endereços como nos projetos abertos Rainzart/nfse-nacional e brans-nfe.
//  - Simples ME/EPP (opSimpNac 3): regApTribSN obrigatório (E0166); com ISS pelo Simples o regime especial é 0 (E0175);
//    sem retenção (tpRetISSQN 1) a alíquota NÃO vai na DPS (E0625/E0631 — o ISS está no DAS); totTrib não aceita
//    indTotTrib (E0712): vai pTotTribSN. Série 1–49999 = aplicativo próprio (E0010). nDPS sem zeros à esquerda no XML
//    e com 15 posições no Id (E0004).
//  - IBS/CBS: o grupo IBSCBS é opcional no 1.01 e o Simples não preenche em 2026 (LC 214/2025, art. 348).
import { escaparXml, lerXml, txt, descendente } from "./xml";
import { compactarDocZip, descompactarDocZip } from "./sefaz";

export type AmbienteNfse = "producao_restrita" | "producao";

export const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
export const VERSAO_DPS = "1.01";
export const VERSAO_APLICATIVO = "HUB-MDC 1.0";

/** API da Sefin Nacional (emissão). Produção restrita = ambiente de teste, sem valor fiscal. */
export const URLS_SEFIN: Record<AmbienteNfse, string> = {
  producao_restrita: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  producao: "https://sefin.nfse.gov.br/SefinNacional",
};

export const NOMES_AMBIENTE: Record<AmbienteNfse, string> = {
  producao_restrita: "Ambiente de teste (sem valor fiscal)",
  producao: "Produção (nota com valor fiscal)",
};

export const tpAmbNfse = (a: AmbienteNfse) => (a === "producao" ? "1" : "2");

const so = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Dados da DPS (vêm de nfse_preparar/nfse_reservar no banco). */
export interface DadosDps {
  ambiente: AmbienteNfse;
  /** AAAA-MM-DDThh:mm:ss-03:00 (dataHoraBrasilia). */
  dhEmi: string;
  verAplic?: string;
  serie: string | number;
  nDps: string | number;
  /** AAAA-MM-DD */
  dCompet: string;
  /** Código IBGE do município emissor (7). */
  cLocEmi: string;
  prestador: {
    cnpj: string;
    im?: string | null;
    opSimpNac: "1" | "2" | "3";
    regApTribSN?: "1" | "2" | "3" | null;
    regEspTrib: string;
  };
  tomador: { documento: string; nome: string; email?: string | null };
  servico: { cLocPrestacao: string; cTribNac: string; descricao: string; cNBS: string };
  valores: { vServ: number; pTotTribSN?: number | null };
}

/** "DPS" + município (7) + tipo de inscrição (1 = CPF, 2 = CNPJ) + inscrição (14) + série (5) + nDPS (15). */
export function idDps(cLocEmi: string, inscricao: string, serie: string | number, nDps: string | number): string {
  const doc = so(inscricao);
  const tipo = doc.length === 11 ? "1" : "2";
  const id = `DPS${so(cLocEmi)}${tipo}${doc.padStart(14, "0")}${so(serie).padStart(5, "0")}${so(nDps).padStart(15, "0")}`;
  if (!/^DPS[0-9]{42}$/.test(id)) throw new Error("Não deu para montar a identificação da DPS: confira município, CNPJ, série e número.");
  return id;
}

/** Data e hora no fuso de Brasília (UTC−3, sem horário de verão desde 2019), como o leiaute pede. */
export function dataHoraBrasilia(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19) + "-03:00";
}

/** Valor com duas casas e ponto (TSDec15V2: 1500.00; zero = 0.00). */
export const valorNfse = (v: number) => {
  if (!Number.isFinite(v) || v < 0) throw new Error("Valor inválido para a nota.");
  return (Math.round(v * 100) / 100).toFixed(2);
};

const TROCAS: Record<string, string> = {
  "–": "-",
  "—": "-",
  "−": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "•": "-",
  " ": " ",
  "\t": " ",
};

/**
 * Texto aceito pelo leiaute (TSString: de "!" a "ÿ", sem espaço nas pontas): troca traços e aspas tipográficas, tira o
 * que passa de U+00FF, junta espaços e corta no tamanho. `quebras` mantém as quebras de linha (xDescServ).
 */
export function textoNfse(s: string | null | undefined, max: number, quebras = false): string {
  const t = [...(s ?? "").normalize("NFC").replace(/\r\n?/g, "\n")]
    .map((c) => TROCAS[c] ?? c)
    .join("")
    .replace(quebras ? /[^\n\x20-\x7E¡-ÿ]/g : /[^\x20-\x7E¡-ÿ]/g, " ");
  const linhas = (quebras ? t.split("\n") : [t]).map((l) => l.replace(/ {2,}/g, " ").trim());
  return linhas
    .filter((l, i, a) => l || (i > 0 && a[i - 1]))
    .join("\n")
    .trim()
    .slice(0, max)
    .trim();
}

/** Problemas que impedem montar a DPS (em português), na ordem do leiaute. Lista vazia = pode montar. */
export function conferirDps(d: DadosDps): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:00$/.test(d.dhEmi)) p.push("Data e hora da emissão fora do formato.");
  const serie = Number(so(d.serie) || "0");
  const numero = Number(so(d.nDps) || "0");
  if (!(serie >= 1 && serie <= 49999)) p.push("Série da DPS: de 1 a 49999.");
  if (!(numero >= 1 && numero <= 999_999_999_999_999)) p.push("Número da DPS inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dCompet)) p.push("Competência da nota fora do formato.");
  if (so(d.cLocEmi).length !== 7) p.push("Código do município emissor: 7 números do IBGE.");
  if (so(d.prestador.cnpj).length !== 14) p.push("CNPJ da empresa (prestador) inválido.");
  if (d.prestador.opSimpNac !== "3") p.push("Por enquanto o HUB emite nota só para empresa ME/EPP do Simples Nacional.");
  if (d.prestador.opSimpNac === "3" && !d.prestador.regApTribSN) p.push("Informe o regime de apuração do Simples.");
  if (d.prestador.regApTribSN === "1" && d.prestador.regEspTrib !== "0") p.push('Com o ISS pelo Simples, o regime especial é "Nenhum".');
  const doc = so(d.tomador.documento);
  if (doc.length !== 11 && doc.length !== 14) p.push("CNPJ ou CPF do cliente (tomador) inválido.");
  if (!textoNfse(d.tomador.nome, 300)) p.push("Nome do cliente (tomador) vazio.");
  if (so(d.servico.cLocPrestacao).length !== 7) p.push("Código do município da prestação: 7 números do IBGE.");
  if (so(d.servico.cTribNac).length !== 6) p.push("Código de tributação nacional: 6 números (ex.: 17.19.01).");
  if (so(d.servico.cNBS).length !== 9) p.push("Código NBS: 9 números.");
  if (!textoNfse(d.servico.descricao, 2000, true)) p.push("Descrição do serviço vazia.");
  if (!(d.valores.vServ > 0)) p.push("Valor do serviço precisa ser maior que zero.");
  if (d.valores.pTotTribSN == null || !(d.valores.pTotTribSN >= 0 && d.valores.pTotTribSN < 100))
    p.push("Percentual aproximado dos tributos do Simples: de 0 a 99,99.");
  return p;
}

/**
 * Leiaute da NT 009 (SE/CGNFS-e, v1.01): na produção restrita desde 20/10/2026 e na produção a partir de 01/12/2026.
 * Muda duas coisas no que o HUB manda: `finNFSe` (0 = NFS-e regular) entre `tpEmit` e `cLocEmi`, e no `cServ` o
 * `cNBS` passa a vir antes do `xDescServ`. Sem isso a Sefin recusa com E1235 (falha no esquema).
 */
export const INICIO_NT009_PRODUCAO = "2026-12-01";
export const leiauteNt009 = (ambiente: AmbienteNfse, dhEmi: string) =>
  ambiente !== "producao" || dhEmi.slice(0, 10) >= INICIO_NT009_PRODUCAO;

/**
 * infDPS do leiaute 1.01. Com `comNamespace`, na forma canônica (C14N) do subconjunto — a declaração xmlns herdada do
 * <DPS> aparece no elemento —, que é o texto do DigestValue. Sem, é o texto que vai dentro do <DPS>.
 * Tags vazias não são enviadas; a ordem é a do esquema.
 */
export function montarInfDps(d: DadosDps, comNamespace = false): string {
  const problemas = conferirDps(d);
  if (problemas.length) throw new Error(problemas.join(" "));
  const t = (nome: string, valor: string | null | undefined) => (valor ? `<${nome}>${escaparXml(valor)}</${nome}>` : "");
  const doc = so(d.tomador.documento);
  const email = d.tomador.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.tomador.email.trim()) ? textoNfse(d.tomador.email, 80) : null;
  const id = idDps(d.cLocEmi, d.prestador.cnpj, d.serie, d.nDps);
  const ns = comNamespace ? ` xmlns="${NS_NFSE}"` : "";
  const nt009 = leiauteNt009(d.ambiente, d.dhEmi);
  const descricao = t("xDescServ", textoNfse(d.servico.descricao, 2000, true));
  const nbs = t("cNBS", so(d.servico.cNBS));
  return (
    `<infDPS${ns} Id="${id}">` +
    t("tpAmb", tpAmbNfse(d.ambiente)) +
    t("dhEmi", d.dhEmi) +
    t("verAplic", textoNfse(d.verAplic ?? VERSAO_APLICATIVO, 20)) +
    t("serie", String(Number(so(d.serie)))) +
    t("nDPS", String(Number(so(d.nDps)))) +
    t("dCompet", d.dCompet) +
    t("tpEmit", "1") +
    (nt009 ? "<finNFSe>0</finNFSe>" : "") +
    t("cLocEmi", so(d.cLocEmi)) +
    `<prest>${t("CNPJ", so(d.prestador.cnpj))}${t("IM", d.prestador.im ? textoNfse(d.prestador.im, 15) : null)}` +
    `<regTrib>${t("opSimpNac", d.prestador.opSimpNac)}${t("regApTribSN", d.prestador.opSimpNac === "3" ? d.prestador.regApTribSN : null)}` +
    `${t("regEspTrib", d.prestador.regEspTrib)}</regTrib></prest>` +
    `<toma>${t(doc.length === 11 ? "CPF" : "CNPJ", doc)}${t("xNome", textoNfse(d.tomador.nome, 300))}${t("email", email)}</toma>` +
    `<serv><locPrest>${t("cLocPrestacao", so(d.servico.cLocPrestacao))}</locPrest>` +
    `<cServ>${t("cTribNac", so(d.servico.cTribNac))}${nt009 ? nbs + descricao : descricao + nbs}</cServ></serv>` +
    `<valores><vServPrest>${t("vServ", valorNfse(d.valores.vServ))}</vServPrest>` +
    // ISS do Simples sem retenção: tributável, não retido e SEM alíquota (vai no DAS); total aproximado pelo % do Simples
    `<trib><tribMun>${t("tribISSQN", "1")}${t("tpRetISSQN", "1")}</tribMun>` +
    `<totTrib>${t("pTotTribSN", valorNfse(d.valores.pTotTribSN ?? 0))}</totTrib></trib></valores>` +
    `</infDPS>`
  );
}

/** DPS completa: infDPS + assinatura (a assinatura vem pronta da Função Edge). */
export const montarDps = (infDps: string, assinatura: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS_NFSE}" versao="${VERSAO_DPS}">${infDps}${assinatura}</DPS>`;

/** Corpo do POST /nfse: a DPS assinada em gzip + base64. */
export async function corpoEnvioDps(dpsAssinada: string): Promise<{ dpsXmlGZipB64: string }> {
  return { dpsXmlGZipB64: await compactarDocZip(dpsAssinada) };
}

export const urlEmitir = (a: AmbienteNfse) => `${URLS_SEFIN[a]}/nfse`;
export const urlConsultarDps = (a: AmbienteNfse, id: string) => `${URLS_SEFIN[a]}/dps/${encodeURIComponent(id)}`;
export const urlConsultarNfse = (a: AmbienteNfse, chave: string) => `${URLS_SEFIN[a]}/nfse/${so(chave)}`;

// ------------------------------------------------------------------------------------------------ retorno da API

/** Uma mensagem do Emissor: código e texto como vieram, e `texto` em português simples para a tela. */
export interface MensagemSefin {
  codigo: string;
  descricao: string;
  complemento: string | null;
  texto: string;
}

export type RetornoSefin =
  | { tipo: "emitida"; chave: string; nfseXmlGZipB64: string; idDps: string | null; alertas: MensagemSefin[] }
  /** Recusa: nada foi criado no Emissor; a próxima tentativa usa outro número de DPS. */
  | { tipo: "rejeitada"; mensagens: MensagemSefin[]; mensagem: string }
  /** Sem resposta certa (rede, demora, erro do servidor): a nota pode ter saído; conferir antes de reenviar. */
  | { tipo: "erro"; mensagem: string };

/** Códigos de recusa comuns em linguagem simples (Anexo I; os demais mostram a descrição oficial). */
export const REJEICOES: Record<string, string> = {
  E0004: "A identificação da DPS não confere com os dados enviados. Avise a equipe MDC (ajuste no sistema).",
  E0010: "A série da DPS não é da faixa de sistema próprio (1 a 49999). Ajuste a série em Contratos › Nota fiscal.",
  E0016: "A data de competência é anterior à entrada do município no Emissor Nacional.",
  E0084: "O município emissor não é o do cadastro do CNPJ da MDC. Confira o código do município em Contratos › Nota fiscal.",
  E0160: "A opção pelo Simples Nacional informada não bate com o cadastro do Simples nesta competência. Confira o regime em Contratos › Nota fiscal.",
  E0162: "O regime de apuração do Simples só vai para ME/EPP. Confira o regime em Contratos › Nota fiscal.",
  E0166: "Falta o regime de apuração do Simples (ME/EPP). Confira em Contratos › Nota fiscal.",
  E0175: 'Com o ISS apurado pelo Simples, o regime especial precisa ser "Nenhum".',
  E0595: "A alíquota do ISS não pode passar de 5%.",
  E0600: "MEI não informa alíquota do ISS.",
  E0617: "A alíquota do ISS não vai na nota neste caso (o município está no Emissor Nacional).",
  E0619: "O município exige a alíquota do ISS na nota. Avise a equipe MDC.",
  E0621: "Com ISS retido pelo cliente, a alíquota é obrigatória. Avise a equipe MDC.",
  E0625: "Para ME/EPP do Simples sem retenção, a alíquota do ISS não vai na nota (o ISS está no DAS).",
  E0628: "O município ainda não está ativo no Emissor Nacional e, com ISS retido, a alíquota é obrigatória. Avise a equipe MDC.",
  E0631: "Para ME/EPP do Simples sem retenção, a alíquota do ISS não vai na nota.",
  E0635: "Com o ISS fora do Simples, a alíquota vem do município e não vai na nota.",
  E0640: "O município não está ativo no Emissor Nacional e exige a alíquota do ISS. Avise a equipe MDC.",
  E0712: "Para ME/EPP o total aproximado de tributos vai como percentual do Simples. Confira o percentual em Contratos › Nota fiscal.",
  E0713: "Este total de tributos não vale para empresa fora do Simples. Confira o regime em Contratos › Nota fiscal.",
  E0714: "A assinatura digital da nota foi recusada. Confira se o certificado A1 da MDC está válido; se continuar, avise a equipe MDC.",
  E999: "O Emissor Nacional teve um erro sem explicação. Tente de novo em alguns minutos.",
  E9999: "O Emissor Nacional teve um erro sem explicação. Tente de novo em alguns minutos.",
};

/** Texto simples de uma mensagem do Emissor (a descrição oficial fica guardada junto). */
export function traduzirMensagem(codigo: string, descricao: string): string {
  const c = (codigo || "").trim().toUpperCase();
  return REJEICOES[c] ?? (descricao ? `O Emissor Nacional recusou: ${descricao.trim()}` : "O Emissor Nacional recusou a nota sem dizer o motivo.");
}

type Obj = Record<string, unknown>;
const campo = (o: unknown, ...nomes: string[]): unknown => {
  if (!o || typeof o !== "object") return undefined;
  for (const n of nomes) {
    const v = (o as Obj)[n] ?? (o as Obj)[n.charAt(0).toUpperCase() + n.slice(1)];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};
const texto = (v: unknown) => (v == null ? "" : String(v)).trim();

/** Lê as mensagens de erro/alerta da resposta: aceita "erros"/"Erros"/"erro" (lista ou objeto) e codigo/Codigo. */
export function lerMensagens(corpo: unknown, chaves = ["erros", "erro"]): MensagemSefin[] {
  const bruto = campo(corpo, ...chaves);
  const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
  return lista.map((m) => {
    const codigo = texto(campo(m, "codigo"));
    const descricao = texto(campo(m, "descricao", "mensagem"));
    const complemento = texto(campo(m, "complemento")) || null;
    return { codigo, descricao, complemento, texto: traduzirMensagem(codigo, descricao) };
  });
}

/** Resumo de uma lista de mensagens para a tela ("texto (E0625)"; várias separadas por ponto e vírgula). */
export const resumoMensagens = (ms: MensagemSefin[]) =>
  ms.length ? ms.map((m) => (m.codigo ? `${m.texto} (${m.codigo})` : m.texto)).join("; ") : "O Emissor Nacional recusou a nota sem dizer o motivo.";

/**
 * Resposta do POST /nfse. 2xx com chaveAcesso e nfseXmlGZipB64 = emitida; 4xx = recusa (nada criado); 5xx ou corpo
 * estranho = sem resposta certa (conferir no Emissor antes de reenviar).
 */
export function lerRetornoEmissao(status: number, corpo: unknown): RetornoSefin {
  const chave = so(texto(campo(corpo, "chaveAcesso")));
  const xml = texto(campo(corpo, "nfseXmlGZipB64"));
  if (status >= 200 && status < 300 && chave.length === 50 && xml) {
    return { tipo: "emitida", chave, nfseXmlGZipB64: xml, idDps: texto(campo(corpo, "idDps", "idDPS")) || null, alertas: lerMensagens(corpo, ["alertas"]) };
  }
  if (status >= 400 && status < 500) {
    const mensagens = lerMensagens(corpo);
    if (!mensagens.length) {
      const msg =
        status === 401 || status === 403
          ? "O Emissor Nacional não aceitou o certificado digital da MDC. Confira se é o e-CNPJ A1 (ICP-Brasil) e está válido."
          : `O Emissor Nacional recusou a nota (resposta ${status}).`;
      return { tipo: "rejeitada", mensagens: [{ codigo: String(status), descricao: texto(corpo && JSON.stringify(corpo)).slice(0, 300), complemento: null, texto: msg }], mensagem: msg };
    }
    return { tipo: "rejeitada", mensagens, mensagem: resumoMensagens(mensagens) };
  }
  if (status >= 200 && status < 300)
    return { tipo: "erro", mensagem: "O Emissor Nacional respondeu sem a nota. O HUB confere no Emissor antes de tentar de novo." };
  return { tipo: "erro", mensagem: `O Emissor Nacional não respondeu direito (resposta ${status}). O HUB confere no Emissor antes de tentar de novo.` };
}

/**
 * Resposta do GET /dps/{Id}: a nota já saiu (chave), não saiu (404) ou não deu para saber.
 */
export function lerConsultaDps(status: number, corpo: unknown): { tipo: "existe"; chave: string } | { tipo: "nao_existe" } | { tipo: "incerto"; mensagem: string } {
  const chave = so(texto(campo(corpo, "chaveAcesso")));
  if (status >= 200 && status < 300 && chave.length === 50) return { tipo: "existe", chave };
  if (status === 404) return { tipo: "nao_existe" };
  return { tipo: "incerto", mensagem: `Não deu para conferir no Emissor Nacional se a nota saiu (resposta ${status}). Tente de novo em alguns minutos.` };
}

/** Resposta do GET /nfse/{chave}: o XML da NFS-e em gzip + base64, ou null se não veio. */
export function lerConsultaNfse(status: number, corpo: unknown): string | null {
  const xml = texto(campo(corpo, "nfseXmlGZipB64"));
  return status >= 200 && status < 300 && xml ? xml : null;
}

/** XML da NFS-e (gzip + base64 da resposta) com o número e a chave lidos de infNFSe. */
export async function lerNfseEmitida(nfseXmlGZipB64: string): Promise<{ xml: string; numero: string | null; chave: string }> {
  const xml = await descompactarDocZip(nfseXmlGZipB64);
  const inf = descendente(lerXml(xml), "infNFSe");
  if (!inf) throw new Error("O Emissor Nacional devolveu um XML que não é NFS-e.");
  const chave = so(inf.atributos.Id);
  if (chave.length !== 50) throw new Error("A NFS-e devolvida não tem a chave de acesso de 50 números.");
  return { xml, numero: txt(inf, "nNFSe"), chave };
}

/** Caminho no bucket fiscal das notas emitidas pelo HUB (Contratos com "ver" lê esta pasta). */
export function caminhoNfseEmitida(org: string, cliente: string, dia: string, arquivo: string): string {
  const [ano, mes] = dia.slice(0, 7).split("-");
  return `${org}/${cliente}/nfse-emitidas/${ano}/${mes}/${arquivo}`;
}
