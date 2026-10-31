# 0001 · Site 100% no navegador + Supabase com RLS

**Situação:** aceita (desde o início do projeto, 2026).

**Contexto.** Equipe pequena, sem servidor próprio para manter. O HUB precisa de login, banco, arquivos, tempo real
e separação rígida entre organizações e entre clientes.

**Decisão.** O site Next.js roda inteiro no navegador ("use client"), publicado na Vercel. Todo dado vem do
Supabase. A segurança fica no banco: RLS em todas as tabelas, funções `app.hub_pode` (equipe) e `app.portal_pode`
(cliente), funções RPC `security definer` para operações com regra de negócio. Funções Edge só para o que exige
segredo.

**Alternativas.** Servidor próprio (Node/Django) com API: mais controle, mas mais infraestrutura para manter.
Server Components/Server Actions do Next: possível no futuro para telas pesadas, sem mudar a regra de segurança.

**Consequências.** Qualquer chamada da API com o login da pessoa respeita as mesmas regras da tela; por isso
**toda** regra de acesso precisa estar no banco. Cálculos feitos no navegador não são confiáveis para documentos
oficiais (ver 0003).
