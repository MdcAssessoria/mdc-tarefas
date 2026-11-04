// Testes da Função fatura-enviar (Deno, sem rede: o fetch é falso). Rode:
//   cd supabase/functions/fatura-enviar && deno test --allow-read --allow-env --config deno.json envio_test.ts
import {
  assuntoEmail,
  corpoEmail,
  type Envio,
  falhaGraph,
  falhaWhatsapp,
  lerConfiguracao,
  numeroWhatsapp,
  parametrosWhatsapp,
  parametroWhatsapp,
} from "./mensagens.ts";
import { base64, enviarEmail, enviarWhatsapp, esquecerTokens, LIMITE_ANEXOS } from "./provedores.ts";
import { gerarFaturaPdf } from "./nucleo/faturaPdf.ts";

function igual(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}
function verdade(v: boolean, msg: string) {
  if (!v) throw new Error(msg);
}

const base = (): Envio => ({
  envio: 7,
  canal: "email",
  destino: "financeiro@gama.com.br",
  conteudo: ["nfse", "fatura", "boleto"],
  etapa: "principal",
  tentativa: 1,
  org: "org-1",
  cliente: "cli-1",
  logo_url: null,
  fatura: {
    id: "f1",
    numero: "2026/00012",
    emissao: "2026-11-01",
    vencimento: "2026-11-10",
    competencia: "2026-11-01",
    valor: 1260,
    descricao: "Honorários mensais · 11/2026",
    documento: "nfse",
    envio: "nf_fatura_boleto",
    situacao: "pronta",
    nfse_situacao: "emitida",
    nfse_numero: "9101",
    boleto_situacao: "gerado",
    servico_codigo: "17.19",
    iss_aliquota: 2,
    cancelamento_motivo: null,
  },
  contrato: "Assessoria contábil",
  tomador: { nome: "Gama <Comércio> Ltda", documento: "11222333000181", email: null, cidade: "Santos", uf: "SP" },
  nfse: { numero: "9101", chave: "3550", xml_caminho: "org-1/cli-1/nfse-emitidas/2026/11/n.xml" },
  boleto: { banco: "itau", linha_digitavel: "34191.79001 01043.510047", pix_copia_cola: "000201pix", vencimento: "2026-11-10", valor: 1260 },
});

Deno.test("configuração: canal só liga com todos os segredos; mostra os nomes que faltam, nunca valores", () => {
  const env: Record<string, string> = { GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: " ", GRAPH_REMETENTE: "hub@mdcassessoria.com", WHATSAPP_TOKEN: "x", WHATSAPP_NUMERO_ID: "1", WHATSAPP_MODELO: "fatura_mdc" };
  const c = lerConfiguracao((n) => env[n]);
  igual(c.email, null);
  igual(c.faltam.email, ["GRAPH_CLIENT_SECRET"]);
  igual([c.whatsapp?.idioma, c.whatsapp?.versao, c.whatsapp?.modelo], ["pt_BR", "v23.0", "fatura_mdc"]);
});

Deno.test("e-mail: assunto, valor, vencimento, linha digitável, Pix e NFS-e; nome escapado no HTML", () => {
  const e = base();
  igual(assuntoEmail(e), "Fatura 2026/00012 · MDC Assessoria Contábil · vence em 10/11/2026");
  const h = corpoEmail(e).replace(/\u00a0/g, " ");
  for (const t of ["R$ 1.260,00", "10/11/2026", "34191.79001 01043.510047", "000201pix", "NFS-e) nº <b>9101</b>", "consultapublica"]) verdade(h.includes(t), `faltou ${t}`);
  verdade(h.includes("Gama &lt;Comércio&gt; Ltda") && !h.includes("<Comércio>"), "nome não foi escapado");
});

Deno.test("e-mail da etapa boleto (boleto depois) e da fatura sem boleto avisa que o boleto vem em seguida", () => {
  const b = { ...base(), etapa: "boleto" as const, conteudo: ["fatura", "boleto"] };
  verdade(assuntoEmail(b).startsWith("Boleto da fatura 2026/00012"), "assunto do boleto");
  const p = { ...base(), conteudo: ["nfse", "fatura"], boleto: null, fatura: { ...base().fatura, envio: "nf_fatura", boleto_situacao: "a_definir" } };
  verdade(corpoEmail(p).includes("boleto para pagamento será enviado em seguida"), "aviso do boleto depois");
  igual(parametrosWhatsapp({ ...p, canal: "whatsapp" })[4], "o boleto chega em seguida, em outra mensagem");
});

Deno.test("WhatsApp: 5 parâmetros sem quebra de linha; número vira 55 + DDD", () => {
  const e = { ...base(), canal: "whatsapp" as const, tomador: { ...base().tomador, nome: "Gama\nLtda" } };
  igual(parametrosWhatsapp(e), ["Gama Ltda", "2026/00012", "R$ 1.260,00", "10/11/2026", "linha digitável 34191.79001 01043.510047"]);
  igual(parametroWhatsapp("a      b\t"), "a   b");
  igual(numeroWhatsapp("(13) 98888-7777"), "5513988887777");
  igual(numeroWhatsapp("+55 13 3222-1111"), "551332221111");
  igual(numeroWhatsapp("98888-7777"), null);
});

Deno.test("erros do Graph: senha do aplicativo = configuração; destinatário = definitivo; ocupado = tentar de novo", () => {
  verdade(falhaGraph(401, { error: "invalid_client", error_description: "AADSTS7000222 expired" }, true).configuracao, "senha vencida");
  verdade(falhaGraph(403, { error: { code: "ErrorAccessDenied" } }).configuracao, "sem Mail.Send na caixa");
  const d = falhaGraph(400, { error: { code: "ErrorInvalidRecipients", message: "x" } });
  igual([d.definitivo, d.configuracao], [true, false]);
  const t = falhaGraph(503, null);
  igual([t.definitivo, t.configuracao], [false, false]);
});

Deno.test("erros do WhatsApp: token e modelo = configuração; número sem WhatsApp = definitivo; limite = tentar de novo", () => {
  verdade(falhaWhatsapp(401, { error: { code: 190 } }).configuracao, "token");
  verdade(falhaWhatsapp(400, { error: { code: 132001 } }).configuracao, "modelo");
  igual(falhaWhatsapp(400, { error: { code: 131026 } }).definitivo, true);
  const l = falhaWhatsapp(429, { error: { code: 130429 } });
  igual([l.definitivo, l.configuracao], [false, false]);
});

const cfgEmail = { tenant: "ten", cliente: "cli", segredo: "seg", remetente: "hub@mdcassessoria.com" };
const cfgZap = { token: "tok", numeroId: "123", modelo: "fatura_mdc", idioma: "pt_BR", versao: "v23.0" };

/** fetch falso: guarda as chamadas e responde na ordem. */
function falso(respostas: Response[]) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const f = ((url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    return Promise.resolve(respostas.shift() ?? new Response("{}", { status: 500 }));
  }) as typeof fetch;
  return { f, chamadas };
}

Deno.test("Graph: pede o token e manda o sendMail com o PDF em base64 pela caixa do HUB", async () => {
  esquecerTokens();
  const { f, chamadas } = falso([Response.json({ access_token: "AT", expires_in: 3600 }), new Response(null, { status: 202 })]);
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const r = await enviarEmail(cfgEmail, { para: "a@b.com", assunto: "S", html: "<p>x</p>", anexos: [{ nome: "F.pdf", tipo: "application/pdf", bytes: pdf }], marca: "hub-envio-7-1" }, f);
  igual(r, { ok: true, id: "hub-envio-7-1" });
  verdade(chamadas[0].url.includes("/ten/oauth2/v2.0/token"), "url do token");
  verdade(String(chamadas[0].init?.body).includes("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default"), "escopo .default");
  igual(chamadas[1].url, "https://graph.microsoft.com/v1.0/users/hub%40mdcassessoria.com/sendMail");
  const corpo = JSON.parse(String(chamadas[1].init?.body));
  igual(corpo.message.attachments[0].contentBytes, base64(pdf));
  igual(corpo.message.toRecipients[0].emailAddress.address, "a@b.com");
  igual((chamadas[1].init?.headers as Record<string, string>).Authorization, "Bearer AT");
});

Deno.test("Graph: anexo acima de 3 MB nem tenta (erro definitivo)", async () => {
  const { f, chamadas } = falso([]);
  const r = await enviarEmail(cfgEmail, { para: "a@b.com", assunto: "S", html: "", anexos: [{ nome: "x", tipo: "x", bytes: new Uint8Array(LIMITE_ANEXOS + 1) }], marca: "m" }, f);
  igual([r.ok, !r.ok && r.definitivo, chamadas.length], [false, true, 0]);
});

Deno.test("WhatsApp: sobe o PDF e manda o modelo fatura_mdc em pt_BR com o documento no cabeçalho", async () => {
  const { f, chamadas } = falso([Response.json({ id: "MID" }), Response.json({ messages: [{ id: "wamid.1" }] })]);
  const r = await enviarWhatsapp(cfgZap, { para: "5513988887777", pdf: new Uint8Array([1]), arquivo: "Fatura-2026-00012.pdf", parametros: ["a", "b", "c", "d", "e"] }, f);
  igual(r, { ok: true, id: "wamid.1" });
  igual(chamadas[0].url, "https://graph.facebook.com/v23.0/123/media");
  const m = JSON.parse(String(chamadas[1].init?.body));
  igual([m.to, m.template.name, m.template.language.code], ["5513988887777", "fatura_mdc", "pt_BR"]);
  igual(m.template.components[0].parameters[0].document, { id: "MID", filename: "Fatura-2026-00012.pdf" });
  igual(m.template.components[1].parameters.length, 5);
});

Deno.test("WhatsApp: número sem WhatsApp volta como erro definitivo", async () => {
  const { f } = falso([Response.json({ id: "MID" }), Response.json({ error: { code: 131026, message: "undeliverable" } }, { status: 400 })]);
  const r = await enviarWhatsapp(cfgZap, { para: "5513988887777", pdf: new Uint8Array([1]), arquivo: "F.pdf", parametros: ["a", "b", "c", "d", "e"] }, f);
  igual([r.ok, !r.ok && r.definitivo, !r.ok && r.configuracao], [false, true, false]);
});

Deno.test("o PDF da fatura sai no servidor (mesmo desenho da tela)", async () => {
  const e = base();
  const bytes = await gerarFaturaPdf({ fatura: e.fatura as never, cliente: { nome: "Gama", documento: "11222333000181", cidade: "Santos/SP" }, contrato: e.contrato });
  igual(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
});
