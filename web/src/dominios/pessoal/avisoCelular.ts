// MDC · Pessoal (076): ligar e desligar o aviso do resumo diário NESTE aparelho (Web Push). Registra o service worker
// (public/sw-avisos.js), pede a permissão do navegador, pega a chave pública na Função pessoal-aviso e grava o aparelho
// no banco (pessoal_push_inscrever). As partes puras (conversão da chave, horários, situação) têm teste.
import { supabase, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { caminho } from "@/lib/caminho";

/** Horários que a pessoa pode escolher para o resumo (5h a 22h). */
export const HORARIOS = Array.from({ length: 18 }, (_, i) => i + 5);
export const textoHora = (h: number) => `${String(h).padStart(2, "0")}h`;

/** Chave em base64 de URL (como o Web Push manda) para os bytes que o navegador pede. */
export function base64UrlParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  const preenchido = (texto + "=".repeat((4 - (texto.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(preenchido);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export type SituacaoAparelho = "sem-suporte" | "precisa-instalar" | "bloqueado" | "ligado" | "desligado";

/** Situação do aviso neste aparelho, a partir do que o navegador informa. */
export function situacaoDoAparelho(o: {
  temPush: boolean;
  iphone: boolean;
  instalado: boolean;
  permissao: NotificationPermission | "indisponivel";
  inscrito: boolean;
}): SituacaoAparelho {
  if (o.iphone && !o.instalado) return "precisa-instalar"; // no iPhone o aviso só funciona com o app na tela de início
  if (!o.temPush || o.permissao === "indisponivel") return "sem-suporte";
  if (o.permissao === "denied") return "bloqueado";
  return o.inscrito && o.permissao === "granted" ? "ligado" : "desligado";
}

export const TEXTO_SITUACAO: Record<SituacaoAparelho, string> = {
  "sem-suporte": "Este navegador não mostra avisos. Use o Chrome no Android ou no computador, ou o app instalado no iPhone.",
  "precisa-instalar":
    "No iPhone, primeiro instale o app: toque em Compartilhar e em “Adicionar à Tela de Início”. Depois abra por ele e ligue aqui.",
  bloqueado: "Os avisos estão bloqueados neste navegador. Libere nas configurações do site (cadeado ao lado do endereço) e tente de novo.",
  ligado: "Este aparelho recebe o aviso do resumo.",
  desligado: "Este aparelho ainda não recebe o aviso.",
};

const temPush = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registro() {
  return navigator.serviceWorker.register(caminho("/sw-avisos.js"), { scope: caminho("/") });
}

/** Lê a situação deste aparelho (sem pedir nada à pessoa). */
export async function lerSituacaoDoAparelho(): Promise<SituacaoAparelho> {
  const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const instalado =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  let inscrito = false;
  if (temPush()) {
    const r = await navigator.serviceWorker.getRegistration(caminho("/"));
    inscrito = Boolean(await r?.pushManager.getSubscription());
  }
  return situacaoDoAparelho({
    temPush: temPush(),
    iphone,
    instalado: Boolean(instalado),
    permissao: "Notification" in window ? Notification.permission : "indisponivel",
    inscrito,
  });
}

/** Liga o aviso neste aparelho. Devolve a nova situação. */
export async function ligarNoAparelho(): Promise<SituacaoAparelho> {
  if (!temPush()) return "sem-suporte";
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desligado";
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/pessoal-aviso`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ acao: "chave" }),
  });
  const corpo = (await r.json().catch(() => ({}))) as { publica?: string; erro?: string };
  if (!r.ok || !corpo.publica) throw new Error(corpo.erro ?? "Não foi possível ligar o aviso agora. Tente de novo em instantes.");
  const reg = await registro();
  await navigator.serviceWorker.ready;
  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaBytes(corpo.publica) }));
  const j = inscricao.toJSON();
  const { error } = await sb.rpc("pessoal_push_inscrever", {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_aparelho: navigator.userAgent.slice(0, 120),
  });
  if (error) throw error;
  return "ligado";
}

/** Desliga o aviso neste aparelho. */
export async function desligarNoAparelho(): Promise<SituacaoAparelho> {
  if (!temPush()) return "sem-suporte";
  const r = await navigator.serviceWorker.getRegistration(caminho("/"));
  const inscricao = await r?.pushManager.getSubscription();
  if (inscricao) {
    await supabase().rpc("pessoal_push_remover", { p_endpoint: inscricao.endpoint });
    await inscricao.unsubscribe();
  }
  return "desligado";
}
