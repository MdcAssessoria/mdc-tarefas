// Cor de cada módulo nos cartões do Início (05/11/2026). O menu lateral ficou sem cores (o Edvaldo achou confuso).
// Módulo novo: acrescente aqui. Classes escritas por inteiro para o Tailwind gerar.

export const COR_CARTAO: Record<string, { tile: string; borda: string }> = {
  padrao: { tile: "bg-[var(--fundo)] text-[var(--marca)]", borda: "hover:border-[var(--destaque-escuro)]" },
  tarefas: { tile: "bg-emerald-100 text-emerald-700", borda: "hover:border-emerald-400" },
  societario: { tile: "bg-sky-100 text-sky-700", borda: "hover:border-sky-400" },
  demonstrativos: { tile: "bg-violet-100 text-violet-700", borda: "hover:border-violet-400" },
  atendimento: { tile: "bg-teal-100 text-teal-700", borda: "hover:border-teal-400" },
  vencimentos: { tile: "bg-orange-100 text-orange-700", borda: "hover:border-orange-400" },
  comercial: { tile: "bg-rose-100 text-rose-700", borda: "hover:border-rose-400" },
  financeiro: { tile: "bg-lime-100 text-lime-700", borda: "hover:border-lime-500" },
  contratos: { tile: "bg-blue-100 text-blue-700", borda: "hover:border-blue-400" },
  relatorios: { tile: "bg-indigo-100 text-indigo-700", borda: "hover:border-indigo-400" },
  cadastros: { tile: "bg-cyan-100 text-cyan-700", borda: "hover:border-cyan-400" },
  centros_custo: { tile: "bg-yellow-100 text-yellow-700", borda: "hover:border-yellow-400" },
  plano_contas: { tile: "bg-stone-200 text-stone-700", borda: "hover:border-stone-400" },
};
