// Nível de acesso numa ferramenta (ver, operar, gerir): cor do selo, nome e o valor especial de administrador.

import { PAPEIS_APP } from "@/dominios/acessos/tipos";
import type { PapelApp } from "@/dominios/acessos/tipos";

export const COR_NIVEL: Record<PapelApp, string> = {
  ver: "bg-neutral-100 text-neutral-700",
  operar: "bg-sky-50 text-sky-800",
  gerir: "bg-[#F6EEDC] text-[#6B5220]",
};
export const ADMIN = "__admin";
export const nomeNivel = (p: PapelApp) => PAPEIS_APP.find((x) => x.id === p)?.nome ?? p;
