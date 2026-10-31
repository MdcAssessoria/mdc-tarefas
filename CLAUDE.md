# Regras do repositório HUB-MDC (para qualquer IA ou pessoa que for mexer aqui)

Projeto da MDC Assessoria Contábil (dono: Edvaldo Ribeiro de Carvalho). Leia `docs/README.md` antes de mudar algo.

1. **Português sempre:** código, comentários, commits, documentação e mensagens ao usuário.
2. **Público leigo:** toda tela segue `docs/08-convencoes.md` seção 8.3 (linguagem simples, filtros fáceis,
   exportação PDF/Excel, boa aparência, celular). Isso é obrigatório.
3. **Segurança no banco:** regra de acesso em RLS/funções `app.*`; nunca `service_role` no site; função
   `security definer` com `search_path` fixo e checagem de permissão. Detalhes em `docs/05-seguranca-e-acessos.md`.
4. **Verificar antes de publicar:** `cd web && npm run verificar && npm run telas`. Push na `main` publica o site.
5. **Banco:** migração nova numerada em `supabase/migrations/`, nunca editar migração aplicada; regenerar
   `web/src/lib/database.types.ts`; rodar os avisos de segurança do Supabase.
6. **Documentação junto com o código:** atualize o capítulo de `docs/` afetado no mesmo commit.
7. **Auditoria obrigatória:** ao terminar qualquer implementação, rode a skill `auditoria-hub`
   (`.claude/skills/auditoria-hub/SKILL.md`), que usa o agente independente `auditor-hub`, e grave o parecer em
   `docs/auditoria/`. Vale para todas as implementações até o HUB estar 100% em operação.
8. **Clientes de teste:** MDC e Grupo Greencore (grupo "Piloto HUB") validam toda novidade antes da carteira.
9. **Nunca** digite senhas, chaves ou tokens; o Edvaldo faz logins e informa segredos diretamente nos painéis.
