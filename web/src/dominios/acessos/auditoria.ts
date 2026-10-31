// Histórico de Pessoas e acessos: transforma cada registro de auditoria numa frase em português.

import type { Auditoria, Perfil } from "@/dominios/acessos/tipos";

export function descrever(
  h: Auditoria,
  apps: { slug: string; nome: string }[],
  perfis: Perfil[],
  nomeMembro: (id: string | null) => string,
) {
  const nomePerfil = (v: unknown) => (v ? (perfis.find((p) => p.id === v)?.nome ?? "perfil removido") : "acesso manual");
  if (h.acao === "acesso") {
    const [app, user] = (h.alvo ?? "").split(":");
    const nomeApp = apps.find((a) => a.slug === app)?.nome ?? app;
    return h.depois
      ? `liberou ${nomeApp} (${String(h.depois)}) para ${nomeMembro(user ?? null)}`
      : `retirou ${nomeApp} de ${nomeMembro(user ?? null)}`;
  }
  if (h.acao === "vincular_perfil") return `colocou ${nomeMembro(h.alvo)} em ${nomePerfil(h.depois)}`;
  if (h.acao === "perfil") return `alterou o perfil ${h.alvo}`;
  if (h.acao === "convite") return `convidou ${h.alvo}`;
  if (h.acao === "transferir_trabalho") {
    const d = (h.depois ?? {}) as Record<string, string | number>;
    return `transferiu ${d.tarefas ?? 0} tarefa(s) de ${nomeMembro(h.alvo)} para ${nomeMembro(String(d.para ?? ""))}`;
  }
  if (h.acao === "inativar") return `inativou ${nomeMembro(h.alvo)}`;
  if (h.acao === "reativar") return `reativou ${nomeMembro(h.alvo)}`;
  if (h.acao === "editar_pessoa") return `editou os dados de ${nomeMembro(h.alvo)}`;
  return `${h.acao} ${h.alvo ?? ""}`;
}
