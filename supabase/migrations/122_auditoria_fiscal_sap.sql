-- 122 · Demonstrativos › Auditoria fiscal (SAP) (pedido do Edvaldo, 26/11/2026). A equipe envia o relatório fiscal de
-- entradas e saídas exportado do SAP; a Função Edge `ledgra-auditoria` manda o arquivo ao Ledgra Auditor
-- (POST /api/public/hub/auditoria-erp), que confere com as regras R01–R36, as utilizações × CFOP × impostos, as regras
-- próprias e o XML do fornecedor guardado no Ledgra XML, e grava a conferência no Ledgra. O HUB guarda aqui o resultado
-- (contagem por regra e até 1.000 achados) e o link da conferência completa.
--   1  auditorias_erp: uma linha por envio. Lê quem tem Demonstrativos (ver); grava só a Função (chave de serviço).
--   2  auditoria_erp_pode(org): a Função confere com o login de quem pediu (Demonstrativos, operar).
--   3  integracao_token_ler(sistema): a Função lê o código do Ledgra no Vault para chamar o Ledgra (só service_role).
--      É o mesmo código que o Ledgra usa para chamar o HUB (092); nada é digitado por ninguém.

create table if not exists public.auditorias_erp (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id    uuid references public.clientes(id) on delete set null,
  cnpj          text not null check (cnpj ~ '^\d{14}$'),
  empresa       text,
  arquivo_nome  text not null,
  regime        text not null default '' check (regime in ('', 'NAO CUMULATIVO', 'CUMULATIVO', 'SIMPLES')),
  ledgra_id     text not null,
  link          text not null check (link ~ '^https://'),
  linhas        integer not null default 0,
  fora          integer not null default 0,
  resumo        jsonb not null default '{}'::jsonb,
  por_regra     jsonb not null default '[]'::jsonb,
  achados       jsonb not null default '[]'::jsonb,
  solicitado_por uuid not null,
  criado_em     timestamptz not null default now()
);
create index if not exists ix_auditorias_erp_org on public.auditorias_erp (org_id, criado_em desc);
create index if not exists ix_auditorias_erp_cliente on public.auditorias_erp (cliente_id);
alter table public.auditorias_erp enable row level security;
drop policy if exists "ler auditorias_erp" on public.auditorias_erp;
create policy "ler auditorias_erp" on public.auditorias_erp for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.auditorias_erp from anon, authenticated;
grant select on public.auditorias_erp to authenticated;
grant all on public.auditorias_erp to service_role;
comment on table public.auditorias_erp is
  'Auditoria fiscal do relatório do SAP feita pelo Ledgra Auditor (122). Grava só a Função ledgra-auditoria.';

create or replace function public.auditoria_erp_pode(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and app.hub_pode(p_org, 'demonstrativos', 'operar')
$$;
revoke all on function public.auditoria_erp_pode(uuid) from public, anon;
grant execute on function public.auditoria_erp_pode(uuid) to authenticated;

create or replace function public.integracao_token_ler(p_sistema text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só as Funções do HUB leem o código de integração.'; end if;
  if p_sistema !~ '^[a-z][a-z0-9-]{1,30}$' then raise exception 'Sistema inválido.'; end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.name = 'integracao_token_' || p_sistema;
  return v;
end $$;
revoke all on function public.integracao_token_ler(text) from public, anon, authenticated;
grant execute on function public.integracao_token_ler(text) to service_role;
comment on function public.integracao_token_ler(text) is
  'A Função ledgra-auditoria lê o código do Ledgra para chamar o Ledgra (122). Nunca devolvido ao navegador.';

-- teste
do $$
begin
  if has_function_privilege('authenticated', 'public.integracao_token_ler(text)', 'execute') then
    raise exception 'o código de integração não pode ser lido por usuário logado';
  end if;
  if has_function_privilege('anon', 'public.auditoria_erp_pode(uuid)', 'execute') then
    raise exception 'anon não pode consultar a permissão';
  end if;
  if has_table_privilege('authenticated', 'public.auditorias_erp', 'insert') then
    raise exception 'usuário logado não pode gravar auditoria direto';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.auditorias_erp'::regclass) then
    raise exception 'auditorias_erp sem RLS';
  end if;
end $$;
