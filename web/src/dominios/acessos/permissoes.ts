// Regra de permissão da equipe NA TELA (o banco confere de novo com app.hub_pode; cap. 5). Função pura, testada em
// permissoes.test.ts, usada pelo pode() do OrgProvider. Só serve para esconder botões e telas: quem decide é o banco.
import { PESO_PAPEL_APP } from "./tipos";
import type { HubApp, PapelApp } from "./tipos";

/**
 * A pessoa pode usar a ferramenta `slug` no nível `minimo`?
 * - `papelNaOrg` "admin" pode tudo (igual ao banco);
 * - os demais precisam ter a ferramenta liberada (`apps`, vindos de hub_meus_apps) com nível igual ou maior.
 * A ferramenta é conferida pelo próprio nome: pedir "financeiro" NÃO aceita outro módulo de gestão. Telas cujo banco é
 * estrito (certificado digital, estoque negativo) dependem disso; as demais pedem a ferramenta do próprio módulo.
 */
export function podeNoApp(
  papelNaOrg: string,
  apps: readonly Pick<HubApp, "slug" | "papel">[],
  slug: string,
  minimo: PapelApp = "ver",
): boolean {
  if (papelNaOrg === "admin") return true;
  const papel = apps.find((a) => a.slug === slug)?.papel;
  return !!papel && PESO_PAPEL_APP[papel] >= PESO_PAPEL_APP[minimo];
}
