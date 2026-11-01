// Testes das peças das Funções Edge fiscais (sem rede). Como rodar (de supabase/functions/_fiscal):
//   deno test --allow-run --allow-read --allow-write --allow-env --config deno.json fiscal_test.ts
// Gera um certificado A1 FICTÍCIO com o openssl (e-CNPJ de teste, autoassinado) e confere a assinatura do evento com o
// `xmlsec1 --verify` (pacote xmlsec1). Sem o xmlsec1 instalado, esse passo é pulado com aviso.
import nodeAssert from "node:assert/strict";

// asserts mínimos sobre node:assert (o jsr.io nem sempre está acessível na máquina de teste)
const assert = (v: unknown, msg = "falhou") => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const assertMatch = (s: string, r: RegExp) => nodeAssert.match(s, r);
const assertStringIncludes = (s: string, t: string) => nodeAssert.ok(s.includes(t), `esperava encontrar ${t}`);
const assertThrows = (f: () => unknown, _tipo: unknown, msg: string) => nodeAssert.throws(f, (e: Error) => e.message.includes(msg));
import { abrirCertificado, conferirParaEmpresa } from "./certificado.ts";
import { eventoAssinado, eventoParaBanco, manifestar } from "./manifestacao.ts";
import { prepararAdn, prepararDfe } from "./captura.ts";
import { compactarDocZip, montarEnvioEventos } from "./nucleo/sefaz.ts";
import { CHAVE_NFE, CNPJ_EMPRESA, NFSE, PROC_NFE, RES_EVENTO_CANCELAMENTO, RES_NFE, RET_EVENTO } from "../../../web/src/dominios/notas/exemplosXml.ts";

const pasta = await Deno.makeTempDir({ prefix: "fiscal-teste-" });
const SENHA = "senha-de-teste";

async function rodar(cmd: string, args: string[]) {
  const r = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  return { ok: r.success, saida: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) };
}

async function gerarPfx(cn: string, cnpjSan: string, nome: string, dias = 365): Promise<Uint8Array> {
  const cfg = `${pasta}/${nome}.cnf`;
  await Deno.writeTextFile(
    cfg,
    `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nC=BR\nO=ICP-Brasil TESTE\nCN=${cn}\n` +
      `[ext]\nsubjectAltName=otherName:2.16.76.1.3.3;UTF8:${cnpjSan}\nkeyUsage=digitalSignature\n`,
  );
  const k = `${pasta}/${nome}.key`, c = `${pasta}/${nome}.pem`, p = `${pasta}/${nome}.pfx`;
  let r = await rodar("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", k, "-out", c, "-days", String(dias), "-config", cfg]);
  assert(r.ok, r.saida);
  // -legacy não existe em todas as versões; o PBE padrão (AES) é lido pelo node-forge 1.3
  r = await rodar("openssl", ["pkcs12", "-export", "-inkey", k, "-in", c, "-out", p, "-passout", `pass:${SENHA}`, "-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1"]);
  assert(r.ok, r.saida);
  return await Deno.readFile(p);
}

const pfx = await gerarPfx(`EMPRESA DE TESTE LTDA:${CNPJ_EMPRESA}`, CNPJ_EMPRESA, "empresa");

Deno.test("certificado: abre o PFX, lê titular, CNPJ do SAN e validade", () => {
  const c = abrirCertificado(pfx, SENHA);
  assertEquals(c.info.titular, "EMPRESA DE TESTE LTDA");
  assertEquals(c.info.cnpj, CNPJ_EMPRESA);
  assert(c.info.icp_brasil); // O=ICP-Brasil TESTE no emissor (autoassinado)
  assertStringIncludes(c.certPem, "BEGIN CERTIFICATE");
  assertStringIncludes(c.chavePem, "PRIVATE KEY");
  assertEquals(conferirParaEmpresa(c.info, "12.345.678/0002-76"), null); // filial: mesmo CNPJ raiz
  assertMatch(conferirParaEmpresa(c.info, "99.888.777/0001-30") ?? "", /outro CNPJ/);
  assertMatch(conferirParaEmpresa(c.info, null) ?? "", /Cadastre o CNPJ/);
  assertMatch(conferirParaEmpresa(c.info, CNPJ_EMPRESA, new Date("2099-01-01")) ?? "", /venceu/);
});

Deno.test("certificado: senha errada vira mensagem em português", () => {
  assertThrows(() => abrirCertificado(pfx, "errada"), Error, "Senha incorreta");
});

Deno.test("assinatura do evento confere no xmlsec1 e falha se o XML for alterado", async () => {
  const c = abrirCertificado(pfx, SENHA);
  const evento = eventoAssinado(
    { nota_id: "n1", chave: CHAVE_NFE, tipo: "nao_realizada", sequencia: 1, justificativa: "Mercadoria recusada na entrega & devolvida" },
    { ambiente: "homologacao", cnpj: CNPJ_EMPRESA, dhEvento: "2026-11-01T10:00:00-03:00" },
    { chave: c.chave, certBase64: c.certBase64 },
  );
  assertStringIncludes(evento, '<Reference URI="#ID2102403526101122233300018155001000001234112345678001">');
  const env = montarEnvioEventos("homologacao", "1", [evento]).corpo.match(/<envEvento[\s\S]*<\/envEvento>/)![0];
  const arq = `${pasta}/evento.xml`;
  await Deno.writeTextFile(arq, `<?xml version="1.0" encoding="UTF-8"?>${env}`);
  const tem = await rodar("sh", ["-c", "command -v xmlsec1"]);
  if (!tem.ok) {
    console.warn("xmlsec1 não instalado: verificação independente pulada (apt-get install xmlsec1)");
    return;
  }
  const args = ["--verify", "--pubkey-cert-pem", `${pasta}/empresa.pem`, "--id-attr:Id", "http://www.portalfiscal.inf.br/nfe:infEvento", arq];
  const ok = await rodar("xmlsec1", args);
  assert(ok.ok, ok.saida);
  await Deno.writeTextFile(arq, `<?xml version="1.0" encoding="UTF-8"?>${env.replace("<tpAmb>2</tpAmb>", "<tpAmb>1</tpAmb>")}`);
  const alterado = await rodar("xmlsec1", args);
  assert(!alterado.ok, "o xmlsec1 deveria recusar o XML alterado");
});

Deno.test("manifestar: lote, retorno com protocolo e procEventoNFe", async () => {
  const c = abrirCertificado(pfx, SENHA);
  let enviados = 0;
  const res = await manifestar(
    [{ nota_id: "n1", chave: CHAVE_NFE, tipo: "confirmada", sequencia: 1 }],
    {
      ambiente: "producao",
      cnpj: CNPJ_EMPRESA,
      agora: new Date("2026-11-01T13:00:00Z"),
      enviar: (r) => {
        enviados++;
        assertStringIncludes(r.corpo, "<descEvento>Confirmacao da Operacao</descEvento>");
        assertStringIncludes(r.corpo, "<dhEvento>2026-11-01T10:00:00-03:00</dhEvento>");
        return Promise.resolve(RET_EVENTO);
      },
    },
    { chave: c.chave, certBase64: c.certBase64 },
  );
  assertEquals(enviados, 1);
  assertEquals(res[0].aceito, true);
  assertEquals(res[0].protocolo, "891260000000123");
  assertMatch(res[0].xml, /^<procEventoNFe[\s\S]*<Signature[\s\S]*<retEvento/);
  assertEquals(eventoParaBanco(res[0]).tpEvento, "210200");
});

Deno.test("manifestar: falha de rede marca o pedido como não aceito, com o motivo", async () => {
  const c = abrirCertificado(pfx, SENHA);
  const res = await manifestar(
    [{ nota_id: "n1", chave: CHAVE_NFE, tipo: "ciencia", sequencia: 1 }],
    { ambiente: "producao", cnpj: CNPJ_EMPRESA, enviar: () => Promise.reject(new Error("Não foi possível falar com a SEFAZ")) },
    { chave: c.chave, certBase64: c.certBase64 },
  );
  assertEquals(res[0].aceito, false);
  assertMatch(res[0].xMotivo, /SEFAZ/);
});

Deno.test("captura: prepara notas e eventos, descarta NSU já guardado e documento desconhecido", async () => {
  const docs = [
    { nsu: 10, schema: "resNFe_v1.01.xsd", conteudo: await compactarDocZip(RES_NFE) },
    { nsu: 12, schema: "procNFe_v4.00.xsd", conteudo: await compactarDocZip(PROC_NFE) },
    { nsu: 11, schema: "resEvento_v1.01.xsd", conteudo: await compactarDocZip(RES_EVENTO_CANCELAMENTO) },
    { nsu: 13, schema: "outro.xsd", conteudo: await compactarDocZip("<outro/>") },
  ];
  const { gravacoes, ignorados } = await prepararDfe(docs, { org: "o", cliente: "c", ultNSU: 10 });
  assertEquals(gravacoes.map((g) => g.nsu), [11, 12]);
  assertEquals(gravacoes[0].caminho, `o/c/eventos/2026/10/${CHAVE_NFE}-110111-1.xml`);
  assertEquals(gravacoes[1].caminho, `o/c/nfe/2026/10/${CHAVE_NFE}.xml`);
  assertEquals((gravacoes[1].payload.nota as { itens: unknown[] }).itens.length, 2);
  assertEquals(ignorados.length, 1);
  const adn = await prepararAdn([{ nsu: 5, chave: null, tipo: "NFSE", conteudo: await compactarDocZip(NFSE), geradoEm: null }], {
    org: "o",
    cliente: "c",
    ultNSU: 0,
  });
  assertEquals(adn.gravacoes[0].payload.origem, "adn");
  assertStringIncludes(adn.gravacoes[0].caminho, "o/c/nfse/2026/10/");
});

Deno.test("captura: base64 inválido não derruba a rodada", async () => {
  const r = await prepararDfe([{ nsu: 1, schema: "resNFe_v1.01.xsd", conteudo: "@@@" }], { org: "o", cliente: "c", ultNSU: 0 });
  assertEquals(r.gravacoes.length, 0);
  assertEquals(r.ignorados.length, 1);
});
