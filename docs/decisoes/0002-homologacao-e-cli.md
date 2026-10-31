# 0002 · Supabase CLI e projeto de homologação antes do Financeiro

**Situação:** proposta (auditoria de 31/10/2026). Decidir antes da fase 2 do HUB Gestão.

**Contexto.** As migrações são aplicadas direto em produção; várias funções foram redefinidas em 2–3 migrações e
não há histórico confiável do que foi aplicado. Dados contábeis e fiscais não se "desfazem" com um `drop`.

**Proposta.**
1. `supabase init` + `supabase link`; marcar 001–020 como aplicadas (`migration repair`).
2. Criar um projeto Supabase de **homologação** (plano gratuito) e aplicar toda migração lá primeiro.
3. Gerar e versionar `supabase/estado-atual.sql` (`supabase db dump --schema public,app --schema-only`) a cada migração.
4. Testes de RLS com pgTAP em `supabase/tests/` (outra organização, analista sem acesso, cliente de outro CNPJ, TV).

**Custo.** Projeto de homologação gratuito; ~1 dia de configuração. Exige a senha do banco (fornecida pelo Edvaldo).
