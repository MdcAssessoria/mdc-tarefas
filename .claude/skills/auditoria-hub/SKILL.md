---
name: auditoria-hub
description: Roda a auditoria independente do HUB-MDC sobre o que mudou desde o último parecer e grava um novo parecer em docs/auditoria. Use ao terminar qualquer implementação no HUB, quando pedirem "rodar a auditoria do HUB" e na rotina semanal.
---

# Auditoria do HUB-MDC

Rotina obrigatória até o HUB estar 100% em operação (decisão do Edvaldo, 31/10/2026).
Quem implementou não se audita: a auditoria é feita pelo agente `auditor-hub` (`.claude/agents/auditor-hub.md`).

## Passos

1. **Escopo.** Descubra o último parecer em `docs/auditoria/README.md` (linha mais recente) e o commit dele.
   Liste o que mudou desde então: `git log --oneline <commit>..HEAD` e `git diff --stat <commit>..HEAD`.
   Se não houver mudança desde o último parecer, registre isso numa linha no índice e encerre.
2. **Disparar o auditor.** Chame o agente `auditor-hub` (ferramenta Agent, `subagent_type: "auditor-hub"`; se não
   estiver disponível, use um agente geral com modelo opus e o conteúdo de `.claude/agents/auditor-hub.md` como
   instrução). Passe: o escopo (commits e arquivos), o pedido de rodar `npm run verificar` e `npm run telas`, e o
   caminho dos pareceres anteriores para conferir se os achados antigos foram resolvidos. **Não** passe a sua
   opinião sobre o código: o auditor precisa ler sem viés.
3. **Banco.** Se houver migração nova, peça ao auditor para conferir também os avisos de segurança do Supabase
   (`get_advisors` tipo security, projeto `bulqqdgfrrpqquqvjjfa`) e a lista de funções do esquema `app` executáveis.
4. **Parecer.** Grave em `docs/auditoria/AAAA-MM-DD-parecer.md` com este formato:
   - Cabeçalho: data, escopo (commits), quem auditou, resultado das verificações automáticas.
   - **Veredito** em uma linha: Aprovado / Aprovado com ressalvas / Reprovado.
   - Achados por severidade (crítico, alto, médio, baixo) com evidência e correção proposta.
   - Situação dos achados de pareceres anteriores (resolvido / em aberto).
   - Recomendações para a próxima etapa.
5. **Índice.** Acrescente a linha no topo da tabela de `docs/auditoria/README.md` (data, commit auditado, veredito,
   críticos/altos em aberto, link).
6. **Correções.** Achado crítico ou alto: corrigir antes de liberar aos clientes; abrir as correções como tarefa
   e auditar de novo só o trecho corrigido.
7. **Entrega.** Commit do parecer (`docs: parecer de auditoria AAAA-MM-DD`) e push. Envie ao Edvaldo um resumo
   de até 10 linhas, em português e sem jargão: veredito, o que melhorou, o que precisa de atenção, próximo passo.
