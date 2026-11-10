// Retransmissor da NFS-e (066, 10/11/2026): leva ao Emissor Nacional (Sefin) a DPS já montada e assinada pela Função
// nfse-emitir. Existe porque o servidor da Sefin (IIS) pede o certificado da empresa por renegociação TLS 1.2, que o
// Deno das Funções não faz ("Connection reset by peer"); o Node faz. Regras:
//  - só atende quem traz o código interno do banco (x-relay-token), conferido por nfse_relay_confere (nada de chave de
//    serviço no site);
//  - só fala com os endereços da Sefin Nacional (produção e produção restrita) e só nos caminhos da emissão e consulta;
//  - não grava nem escreve em log o certificado, a chave ou a nota; responde { status, texto } da Sefin.
import { request } from "node:https";
import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { enderecoSefin } from "@/lib/fiscal/enderecoSefin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJETO_URL = "https://bulqqdgfrrpqquqvjjfa.supabase.co";
const SEM_CACHE = { "cache-control": "no-store" };

const responder = (status: number, corpo: unknown) => Response.json(corpo, { status, headers: SEM_CACHE });

async function codigoConfere(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const url = process.env.NEXT_PUBLIC_MDC_SUPABASE_URL || PROJETO_URL;
  const chave = process.env.NEXT_PUBLIC_MDC_SUPABASE_KEY;
  if (!chave) return false;
  const r = await fetch(`${url}/rest/v1/rpc/nfse_relay_confere`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
    cache: "no-store",
  }).catch(() => null);
  return !!r?.ok && (await r.json().catch(() => false)) === true;
}

function chamarSefin(u: URL, metodo: "GET" | "POST", corpo: string | null, cert: string, chave: string) {
  return new Promise<{ status: number; texto: string }>((ok, falha) => {
    const req = request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: metodo,
        cert,
        key: chave,
        headers: {
          Accept: "application/json",
          ...(corpo != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) } : {}),
        },
        timeout: 55_000,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c: Buffer) => partes.push(c));
        res.on("end", () => ok({ status: res.statusCode ?? 0, texto: Buffer.concat(partes).toString("utf8") }));
        res.on("error", falha);
      },
    );
    req.on("timeout", () => req.destroy(new Error("o Emissor demorou mais de 55 segundos")));
    req.on("error", falha);
    if (corpo != null) req.write(corpo);
    req.end();
  });
}

export async function POST(req: Request) {
  if (!(await codigoConfere(req.headers.get("x-relay-token") ?? ""))) return responder(401, { erro: "Código interno inválido." });
  const b = (await req.json().catch(() => null)) as {
    metodo?: string;
    url?: string;
    corpo?: unknown;
    cert?: string;
    chave?: string;
  } | null;
  if (!b) return responder(400, { erro: "Pedido sem corpo." });
  const u = enderecoSefin(b.url);
  if (!u) return responder(400, { erro: "Endereço fora do Emissor Nacional." });
  if (b.metodo !== "GET" && b.metodo !== "POST") return responder(400, { erro: "Método inválido." });
  if (typeof b.cert !== "string" || typeof b.chave !== "string") return responder(400, { erro: "Certificado ausente." });
  try {
    // confere que o par é válido (sem guardar nada)
    new X509Certificate(b.cert);
    if (
      createPublicKey(createPrivateKey(b.chave)).export({ format: "pem", type: "spki" }) !==
      createPublicKey(b.cert).export({ format: "pem", type: "spki" })
    )
      return responder(400, { erro: "A chave não é do certificado." });
  } catch {
    return responder(400, { erro: "Certificado em formato inválido." });
  }
  try {
    const r = await chamarSefin(u, b.metodo, b.metodo === "POST" ? JSON.stringify(b.corpo ?? null) : null, b.cert, b.chave);
    return responder(200, r);
  } catch (e) {
    // só a mensagem técnica da conexão (sem dados da nota nem do certificado)
    const m = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("nfse-relay: falha ao falar com a Sefin:", m);
    return responder(502, { erro: m });
  }
}
