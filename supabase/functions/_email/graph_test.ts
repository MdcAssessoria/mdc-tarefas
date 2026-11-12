// Testes do envio pelo Microsoft Graph e dos modelos (sem rede: fetch falso).
// Rode: cd supabase/functions && deno test _email/graph_test.ts
import { enviarPeloGraph, erroGraph, esquecerToken, lerGraph } from "./graph.ts";
import { htmlConvite, htmlSenha } from "./modelos.ts";

function assertEquals(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}
function assertStringIncludes(a: string, b: string) {
  if (!a.includes(b)) throw new Error(`"${b}" não está no texto`);
}
async function assertRejects(f: () => Promise<unknown>, _tipo: unknown, trecho: string) {
  try {
    await f();
  } catch (e) {
    if (!String((e as Error).message).includes(trecho)) throw new Error(`erro inesperado: ${(e as Error).message}`);
    return;
  }
  throw new Error("deveria ter falhado");
}

const CFG = { tenant: "t", cliente: "c", segredo: "s", remetente: "hub@mdcassessoria.com" };

Deno.test("sem todos os segredos não liga o Graph", () => {
  assertEquals(lerGraph(() => undefined), null);
  assertEquals(lerGraph((n) => (n === "GRAPH_CLIENT_SECRET" ? " " : "x")), null);
  assertEquals(lerGraph((n) => n.toLowerCase())?.remetente, "graph_remetente");
});

Deno.test("envia pela caixa do HUB com o token do aplicativo", async () => {
  esquecerToken();
  const chamadas: string[] = [];
  const falso = (async (url: string, init?: RequestInit) => {
    chamadas.push(String(url));
    if (String(url).includes("/token")) return new Response(JSON.stringify({ access_token: "TK", expires_in: 3600 }));
    const corpo = JSON.parse(String(init?.body));
    assertEquals(corpo.message.toRecipients[0].emailAddress.address, "pessoa@exemplo.com");
    assertEquals((init?.headers as Record<string, string>).Authorization, "Bearer TK");
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  await enviarPeloGraph(CFG, { para: " pessoa@exemplo.com ", assunto: "A", html: "<p>x</p>" }, falso);
  assertEquals(chamadas.length, 2);
  assertStringIncludes(chamadas[1], "/users/hub%40mdcassessoria.com/sendMail");
  // segundo envio reaproveita o token
  await enviarPeloGraph(CFG, { para: "pessoa@exemplo.com", assunto: "A", html: "" }, falso);
  assertEquals(chamadas.length, 3);
});

Deno.test("erro do Microsoft vira frase simples", async () => {
  esquecerToken();
  const falso = (async (url: string) =>
    String(url).includes("/token")
      ? new Response(JSON.stringify({ error: "invalid_client", error_description: "AADSTS7000215" }), { status: 401 })
      : new Response(null, { status: 202 })) as typeof fetch;
  await assertRejects(() => enviarPeloGraph(CFG, { para: "a@b.com", assunto: "", html: "" }, falso), Error, "recusou o aplicativo");
  assertEquals(erroGraph(403, { error: { code: "ErrorAccessDenied" } }).includes("Mail.Send"), true);
  assertEquals(erroGraph(503, {}).includes("ocupado"), true);
});

Deno.test("modelos levam o link escapado e o texto certo", () => {
  const link = 'https://x.supabase.co/auth/v1/verify?token=a&type=invite&redirect_to="x"';
  const c = htmlConvite(link);
  assertStringIncludes(c, "token=a&amp;type=invite&amp;redirect_to=&quot;x&quot;");
  assertStringIncludes(c, "Criar minha senha");
  assertStringIncludes(htmlSenha(link), "Criar nova senha");
});
