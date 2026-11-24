-- Base mínima para aplicar no Postgres temporário as migrações do BI de Gestão e do Omie (090 a 111), que até aqui só
-- tinham teste rodando na produção (achados TST-03 e ARQ-01 da auditoria de 21/11/2026). Traz só o que as migrações
-- usam e que o rodar.sh ainda não carregou; o resto vem das próprias migrações do repositório.

-- 006: comparar CNPJ só pelos dígitos
create or replace function app.so_digitos(t text) returns text
language sql immutable set search_path = '' as $$ select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '') $$;

-- 001: responsável de cada cliente por setor (a 097 libera o BI para o responsável); sem as chaves estrangeiras de
-- setores e membros, que a base simulada não tem
create table if not exists public.cliente_responsaveis (
  org_id uuid not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  setor_id uuid not null,
  user_id uuid not null,
  primary key (cliente_id, setor_id)
);

-- 010: balancetes publicados no Portal (bi_indicadores lê a liquidez corrente deles); só as colunas que o BI usa
create table if not exists public.portal_balancetes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  indices jsonb not null default '{}'::jsonb
);
