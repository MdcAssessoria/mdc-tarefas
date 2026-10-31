// Permissões do Portal do Cliente (áreas que cada pessoa do cliente vê) e os perfis prontos por função.
// ATENÇÃO: app/(hub)/atendimento/portal/page.tsx ainda tem uma cópia própria desta lista (achado A5).

export const PERMISSOES_PORTAL = [
  { id: "demonstrativos", nome: "Demonstrativos e parecer" },
  { id: "rotinas", nome: "Rotinas do mês" },
  { id: "chat", nome: "Chat com a MDC" },
  { id: "documentos", nome: "Documentos e vencimentos" },
  { id: "societario", nome: "Processos societários" },
  { id: "folha", nome: "Folha (DP)" },
];
// perfis de cliente prontos: o que cada função costuma ver no portal
export const PERFIS_CLIENTE: { id: string; nome: string; perms: string[] }[] = [
  { id: "socio", nome: "Sócio / diretor (tudo)", perms: PERMISSOES_PORTAL.map((p) => p.id) },
  { id: "financeiro", nome: "Financeiro", perms: ["demonstrativos", "rotinas", "chat", "documentos"] },
  { id: "rh", nome: "RH / Departamento Pessoal", perms: ["folha", "rotinas", "chat", "documentos"] },
  { id: "consulta", nome: "Só consulta de demonstrativos", perms: ["demonstrativos"] },
];
export const perfilDasPerms = (perms: string[]) =>
  PERFIS_CLIENTE.find((p) => p.perms.length === perms.length && p.perms.every((x) => perms.includes(x)))?.nome ?? "Personalizado";
