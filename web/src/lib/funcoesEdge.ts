// Chamada às Funções Edge do Supabase (supabase/functions) com o login de quem usa a tela. Um lugar só para pegar a
// sessão, montar o pedido (JSON ou formulário com arquivo) e transformar qualquer falha em mensagem em português.
// As funções do HUB respondem erro como { erro: "texto em português" }; esse texto chega à pessoa como veio.
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "./supabase";
import { ErroApp, traduzirErro } from "./erros";

export interface OpcoesFuncao {
  /** Corpo em JSON (POST por padrão). */
  corpo?: unknown;
  /** Formulário com arquivo (não use junto com `corpo`). */
  form?: FormData;
  /** Método HTTP (padrão POST). */
  metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Parâmetros no endereço: objeto ({ cliente: id }) ou texto já montado ("?org=…"). */
  busca?: Record<string, string> | string;
}

const SEM_RESPOSTA = "Não foi possível falar com o servidor agora. Tente de novo em instantes.";

function endereco(nome: string, busca: OpcoesFuncao["busca"]): string {
  const q = !busca ? "" : typeof busca === "string" ? busca : `?${new URLSearchParams(busca).toString()}`;
  return `${SUPABASE_URL}/functions/v1/${nome}${q}`;
}

/**
 * Chama a função e devolve a resposta HTTP já conferida (status 2xx). Use quando a resposta não é JSON (ex.: PDF).
 * Falhas viram ErroApp com mensagem em português (sessão expirada, sem internet, erro devolvido pela função).
 */
export async function chamarFuncaoBruta(nome: string, o: OpcoesFuncao = {}): Promise<Response> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroApp("Sua sessão expirou. Entre de novo.");
  let r: Response;
  try {
    r = await fetch(endereco(nome, o.busca), {
      method: o.metodo ?? "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        ...(o.form || o.corpo === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: o.form ?? (o.corpo === undefined ? undefined : JSON.stringify(o.corpo)),
    });
  } catch (e) {
    throw new ErroApp(traduzirErro(e));
  }
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { erro?: unknown } | null;
    throw new ErroApp(typeof j?.erro === "string" && j.erro ? j.erro : SEM_RESPOSTA);
  }
  return r;
}

/** Chama a função e devolve o JSON da resposta. Ex.: `await chamarFuncao<{ ok: boolean }>("fiscal-captura", { corpo })`. */
export async function chamarFuncao<T>(nome: string, o: OpcoesFuncao = {}): Promise<T> {
  const r = await chamarFuncaoBruta(nome, o);
  return (await r.json().catch(() => ({}))) as T;
}

/** Função pública (sem login, ex.: "esqueci a senha"): só com a chave publicável. Falhas viram ErroApp em português. */
export async function chamarFuncaoPublica<T>(nome: string, corpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(endereco(nome, undefined), {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    throw new ErroApp(traduzirErro(e));
  }
  const j = (await r.json().catch(() => null)) as ({ erro?: unknown } & T) | null;
  if (!r.ok) throw new ErroApp(typeof j?.erro === "string" && j.erro ? j.erro : SEM_RESPOSTA);
  return (j ?? {}) as T;
}
