// Testes da emissão da NFS-e (sem rede). Como rodar (de supabase/functions/_fiscal):
//   deno test --allow-run --allow-read --allow-write --allow-env --config deno.json nfse_test.ts
// Gera um certificado A1 FICTÍCIO (openssl, autoassinado, CNPJ da MDC no SAN), assina a DPS e confere:
//  - a assinatura no `xmlsec1 --verify` (pacote xmlsec1) e que ela quebra se o XML for alterado;
//  - o XML contra os esquemas OFICIAIS do leiaute 1.01 (supabase/testes/esquemas/nfse-1.01) no `xmllint` (libxml2-utils);
//  - o fluxo de emitirNfse com um transporte falso: emitida, recusa, sem conexão e reenvio que confere antes.
// Sem xmlsec1/xmllint instalados, a conferência independente é pulada com aviso.
import nodeAssert from "node:assert/strict";
import { abrirCertificado } from "./certificado.ts";
import { dpsAssinada, emitirNfse } from "./emissao.ts";
import type { TransporteJson } from "./http.ts";
import { compactarDocZip, descompactarDocZip } from "./nucleo/sefaz.ts";
import { dataHoraBrasilia } from "./nucleo/dps.ts";
import type { DadosDps } from "./nucleo/dps.ts";

const assert = (v: unknown, msg = "falhou") => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const assertMatch = (s: string, r: RegExp) => nodeAssert.match(s, r);

const pasta = await Deno.makeTempDir({ prefix: "nfse-teste-" });
const ESQUEMAS = new URL("../../testes/esquemas/nfse-1.01/", import.meta.url).pathname;
const SENHA = "senha-de-teste";
const CNPJ_MDC = "48140121000165";

async function rodar(cmd: string, args: string[]) {
  const r = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  return { ok: r.success, saida: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) };
}
const tem = async (cmd: string) => (await rodar("sh", ["-c", `command -v ${cmd}`])).ok;

async function gerarPfx(): Promise<Uint8Array> {
  const cfg = `${pasta}/mdc.cnf`;
  await Deno.writeTextFile(
    cfg,
    `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nC=BR\nO=ICP-Brasil TESTE\nCN=MDC ASSESSORIA LTDA:${CNPJ_MDC}\n` +
      `[ext]\nsubjectAltName=otherName:2.16.76.1.3.3;UTF8:${CNPJ_MDC}\nkeyUsage=digitalSignature\n`,
  );
  let r = await rodar("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${pasta}/mdc.key`, "-out", `${pasta}/mdc.pem`, "-days", "30", "-config", cfg]);
  assert(r.ok, r.saida);
  r = await rodar("openssl", [
    "pkcs12", "-export", "-inkey", `${pasta}/mdc.key`, "-in", `${pasta}/mdc.pem`, "-out", `${pasta}/mdc.pfx`, "-passout", `pass:${SENHA}`,
    "-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1",
  ]);
  assert(r.ok, r.saida);
  return await Deno.readFile(`${pasta}/mdc.pfx`);
}

const cert = abrirCertificado(await gerarPfx(), SENHA);
const assinante = { chave: cert.chave, certBase64: cert.certBase64 };

const DADOS: DadosDps = {
  ambiente: "producao_restrita",
  dhEmi: dataHoraBrasilia(new Date("2026-11-03T12:15:00Z")),
  serie: "1",
  nDps: 27,
  dCompet: "2026-11-01",
  cLocEmi: "3507605",
  prestador: { cnpj: CNPJ_MDC, im: "12345", opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" },
  tomador: { documento: "12345678000195", nome: "Ômega Comércio & Serviços Ltda", email: "financeiro@omega.com.br" },
  servico: {
    cLocPrestacao: "3507605",
    cTribNac: "171901",
    descricao: "Serviços de contabilidade · 11/2026 · Fatura 2026/00005 · Vencimento 05/12/2026\nEscrituração <fiscal> & folha",
    cNBS: "113021000",
  },
  valores: { vServ: 1850.5, pTotTribSN: 6 },
};
const ID = "DPS3507605248140121000165" + "00001" + "000000000000027";
const CHAVE = "35076052248140121000165" + "0000000000027" + "2611" + "123456789" + "1";
const NFSE = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${CHAVE}"><nNFSe>27</nNFSe></infNFSe></NFSe>`;

Deno.test("DPS assinada confere no xmlsec1, valida no XSD oficial 1.01 e quebra se alterada", async () => {
  const xml = dpsAssinada(DADOS, assinante);
  assertMatch(xml, new RegExp(`^<\\?xml[^>]*\\?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${ID}">`));
  assertMatch(xml, new RegExp(`</infDPS><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">.*<Reference URI="#${ID}">.*</Signature></DPS>$`));
  const arq = `${pasta}/dps.xml`;
  await Deno.writeTextFile(arq, xml);
  if (await tem("xmllint")) {
    const v = await rodar("xmllint", ["--noout", "--nonet", "--schema", `${ESQUEMAS}DPS_v1.01.xsd`, arq]);
    assert(v.ok, `a DPS não passou no XSD oficial:\n${v.saida}`);
  } else console.warn("xmllint não instalado: validação no XSD pulada (apt-get install libxml2-utils)");
  if (!(await tem("xmlsec1"))) return console.warn("xmlsec1 não instalado: conferência da assinatura pulada (apt-get install xmlsec1)");
  const args = ["--verify", "--pubkey-cert-pem", `${pasta}/mdc.pem`, "--id-attr:Id", "http://www.sped.fazenda.gov.br/nfse:infDPS", arq];
  const ok = await rodar("xmlsec1", args);
  assert(ok.ok, ok.saida);
  await Deno.writeTextFile(arq, xml.replace("<vServ>1850.50</vServ>", "<vServ>1.00</vServ>"));
  const alterado = await rodar("xmlsec1", args);
  assert(!alterado.ok, "o xmlsec1 deveria recusar a DPS alterada");
});

/** Transporte falso: guarda as chamadas e responde pela URL. */
function falso(respostas: Record<string, { status: number; corpo: unknown } | Error>) {
  const chamadas: { metodo: string; url: string; corpo?: unknown }[] = [];
  const responder = (metodo: string, url: string, corpo?: unknown) => {
    chamadas.push({ metodo, url, corpo });
    const chave = Object.keys(respostas).find((k) => `${metodo} ${url}`.endsWith(k));
    const r = chave ? respostas[chave] : { status: 404, corpo: null };
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const t: TransporteJson = { postarJson: (url, corpo) => responder("POST", url, corpo), obterJson: (url) => responder("GET", url) };
  return { t, chamadas };
}

Deno.test("emitir: POST /nfse com a DPS em gzip+base64; 201 vira nota emitida com número e chave", async () => {
  const { t, chamadas } = falso({ "POST https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse": { status: 201, corpo: { chaveAcesso: CHAVE, nfseXmlGZipB64: await compactarDocZip(NFSE), idDps: ID } } });
  const r = await emitirNfse(DADOS, { reenvio: false, transporte: t }, assinante);
  assertEquals(r.situacao, "emitida");
  if (r.situacao !== "emitida") return;
  assertEquals([r.chave, r.numero, r.recuperada], [CHAVE, "27", false]);
  assertEquals(chamadas.length, 1);
  const enviado = await descompactarDocZip((chamadas[0].corpo as { dpsXmlGZipB64: string }).dpsXmlGZipB64);
  assertEquals(enviado, r.dpsAssinada);
  assertMatch(enviado, /<SignatureValue>[A-Za-z0-9+/=]+<\/SignatureValue>/);
});

Deno.test("emitir: recusa 400 traz as mensagens traduzidas; sem conexão fica 'erro' com a DPS guardada", async () => {
  const recusa = falso({ "/nfse": { status: 400, corpo: { erros: [{ codigo: "E0712", descricao: "indTotTrib não pode ser informado" }] } } });
  const r = await emitirNfse(DADOS, { reenvio: false, transporte: recusa.t }, assinante);
  assertEquals(r.situacao, "rejeitada");
  if (r.situacao === "rejeitada") {
    assertEquals(r.mensagens[0].codigo, "E0712");
    assertMatch(r.mensagem, /percentual do Simples.*\(E0712\)/);
  }
  const semRede = falso({ "/nfse": new Error("connection reset") });
  const e = await emitirNfse(DADOS, { reenvio: false, transporte: semRede.t }, assinante);
  assertEquals(e.situacao, "erro");
  assert(e.situacao === "erro" && e.dpsAssinada?.includes(ID));
});

Deno.test("reenvio: confere antes; a nota que já saiu é só recuperada (sem POST)", async () => {
  const { t, chamadas } = falso({
    [`GET https://sefin.producaorestrita.nfse.gov.br/SefinNacional/dps/${ID}`]: { status: 200, corpo: { chaveAcesso: CHAVE } },
    [`GET https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse/${CHAVE}`]: { status: 200, corpo: { nfseXmlGZipB64: await compactarDocZip(NFSE) } },
  });
  const r = await emitirNfse(DADOS, { reenvio: true, transporte: t }, assinante);
  assertEquals(r.situacao, "emitida");
  assert(r.situacao === "emitida" && r.recuperada && r.dpsAssinada === null);
  assertEquals(chamadas.map((c) => c.metodo), ["GET", "GET"]);
});

Deno.test("reenvio: não saiu (404) → manda a mesma DPS; não deu para conferir → não manda", async () => {
  const naoSaiu = falso({
    [`/dps/${ID}`]: { status: 404, corpo: { erros: [{ codigo: "E2404" }] } },
    "POST https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse": { status: 201, corpo: { chaveAcesso: CHAVE, nfseXmlGZipB64: await compactarDocZip(NFSE) } },
  });
  const r = await emitirNfse(DADOS, { reenvio: true, transporte: naoSaiu.t }, assinante);
  assertEquals(r.situacao, "emitida");
  assertEquals(naoSaiu.chamadas.map((c) => c.metodo), ["GET", "POST"]);
  const incerto = falso({ [`/dps/${ID}`]: { status: 503, corpo: null } });
  const e = await emitirNfse(DADOS, { reenvio: true, transporte: incerto.t }, assinante);
  assertEquals(e.situacao, "erro");
  assertEquals(incerto.chamadas.map((c) => c.metodo), ["GET"]);
});

Deno.test("dados com problema não chegam a ser enviados", async () => {
  const { t, chamadas } = falso({});
  let erro = "";
  try {
    await emitirNfse({ ...DADOS, servico: { ...DADOS.servico, cTribNac: "1719" } }, { reenvio: false, transporte: t }, assinante);
  } catch (e) {
    erro = (e as Error).message;
  }
  assertMatch(erro, /6 números/);
  assertEquals(chamadas.length, 0);
});
