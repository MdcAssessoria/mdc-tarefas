// PIN de 4 números das organizações pessoais (migração 080, 14/11/2026). Regras de tela e chamadas ao banco.
// O banco é quem decide: confere o PIN (5 erros travam 15 minutos), guarda só o resumo e barra mudanças em pessoas e
// acessos sem o PIN liberado. Aqui ficam só a validação de formato (para avisar antes de enviar) e as chamadas.
import { supabase } from "@/lib/supabase";

/** Depois de digitado, o PIN vale por este tempo (o banco usa o mesmo prazo). */
export const MINUTOS_LIBERADO = 30;

export interface SituacaoPin {
  definido: boolean;
  /** Até quando o PIN está liberado (ISO); null = trancado. */
  liberado_ate: string | null;
  /** Até quando está travado por erros seguidos (ISO); null = não travado. */
  bloqueado_ate: string | null;
}

export interface ResultadoPin {
  ok: boolean;
  liberado_ate?: string;
  bloqueado_ate?: string;
  restantes?: number;
}

const FACEIS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321"]);

/** Só números, no máximo 4 (o que o campo aceita enquanto a pessoa digita). */
export function limparPin(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, 4);
}

/** Mensagem de erro do PIN novo, ou null se está bom. Mesmas regras do banco (pin_definir). */
export function problemaPinNovo(pin: string, confirmacao: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "O PIN precisa ter exatamente 4 números.";
  if (FACEIS.has(pin)) return "Esse PIN é fácil de adivinhar. Escolha outros 4 números.";
  if (pin !== confirmacao) return "Os dois PINs digitados não são iguais.";
  return null;
}

/** Milissegundos até o fim do prazo (0 se já passou ou não há prazo). */
export function msAte(iso: string | null | undefined, agora = Date.now()): number {
  if (!iso) return 0;
  const fim = Date.parse(iso);
  return Number.isFinite(fim) ? Math.max(0, fim - agora) : 0;
}

/** Texto "em 12 minutos" / "em 1 minuto" para o prazo do travamento. */
export function textoMinutos(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60000));
  return min === 1 ? "1 minuto" : `${min} minutos`;
}

export async function situacaoPin(): Promise<SituacaoPin> {
  const { data, error } = await supabase().rpc("pin_situacao");
  if (error) throw error;
  return data as SituacaoPin;
}

export async function conferirPin(org: string, pin: string): Promise<ResultadoPin> {
  const { data, error } = await supabase().rpc("pin_conferir", { p_org: org, p_pin: pin });
  if (error) throw error;
  return data as ResultadoPin;
}

export async function definirPin(org: string, pin: string): Promise<SituacaoPin> {
  const { data, error } = await supabase().rpc("pin_definir", { p_org: org, p_pin_novo: pin });
  if (error) throw error;
  return data as SituacaoPin;
}

/** Tranca o PIN na hora (ao sair do HUB). Nunca lança erro: sair não pode falhar por causa disso. */
export async function trancarPin(): Promise<void> {
  try {
    await supabase().rpc("pin_trancar");
  } catch {
    /* sem conexão: o prazo de 30 minutos tranca sozinho */
  }
}
