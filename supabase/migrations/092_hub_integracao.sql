-- =====================================================================================================
--  092 · Integração entre sistemas sem a chave de serviço do HUB (auditoria 19/11/2026, SEG-01)
--
--  Antes: o servidor do Ledgra guardava a service_role do HUB (Vercel) para três consultas. Essa chave passa por cima de
--  toda a RLS e alcança o cofre de certificados. Agora o Ledgra fala só com a Função Edge hub-integracao, com um código
--  próprio do sistema, e a Função expõe só três ações:
--    vincular_cnpj   → lic_ledgra_vincular_cnpj (chave nova da licença ativa daquele CNPJ)
--    buscar_clientes → integracao_clientes_buscar (clientes ativos da MDC, só os campos da busca)
--    raiox_conferir  → crm_raiox_conferir (cliente MDC? senão cria ou atualiza o lead)
--
--   1  segredo 'integracao_token_<sistema>' no Vault, gerado pelo próprio banco (ninguém digita). O Edvaldo copia o
--      valor no SQL Editor e cola na Vercel do sistema (HUB_INTEGRACAO_TOKEN).
--   2  integracao_token_confere(sistema, token): a Função confere o código (só service_role).
--   3  integracao_token_girar(sistema): troca o código (só no SQL Editor; o sistema para até receber o novo).
--   4  integracao_chamadas: registro de cada chamada (sistema, ação, resultado), para conferência.
--  Depois de publicado o Ledgra novo: gerar nova service_role do HUB e apagar HUB_SUPABASE_SERVICE_ROLE_KEY da Vercel.
--  Testes: supabase/testes/163_integracao_092.sql (base em 162_base_092.sql).
-- =====================================================================================================

-- ------------------------------------------------------------------------------------------- código do Ledgra
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'integracao_token_ledgra') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'integracao_token_ledgra',
      'Código gerado pelo banco: o servidor do Ledgra usa para chamar a Função hub-integracao (092). Vai na Vercel do '
      'Ledgra como HUB_INTEGRACAO_TOKEN.');
  end if;
end $$;

create or replace function public.integracao_token_confere(p_sistema text, p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_sistema ~ '^[a-z][a-z0-9-]{1,30}$'
     and p_token is not null and length(p_token) = 64
     and exists (select 1 from vault.decrypted_secrets s
                  where s.name = 'integracao_token_' || p_sistema and s.decrypted_secret = p_token)
$$;
revoke all on function public.integracao_token_confere(text, text) from public, anon, authenticated;
grant execute on function public.integracao_token_confere(text, text) to service_role;
comment on function public.integracao_token_confere(text, text) is
  'A Função hub-integracao confere o código do sistema que chama; devolve só verdadeiro ou falso (092).';

/** Troca o código de um sistema (SQL Editor, pelo Edvaldo). Devolve só se trocou: o valor novo se lê no Vault. */
create or replace function public.integracao_token_girar(p_sistema text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_sistema !~ '^[a-z][a-z0-9-]{1,30}$' then raise exception 'Sistema inválido'; end if;
  select id into v_id from vault.secrets where name = 'integracao_token_' || p_sistema;
  if v_id is null then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'integracao_token_' || p_sistema,
      'Código gerado pelo banco para o sistema ' || p_sistema || ' chamar a Função hub-integracao (092).');
  else
    perform vault.update_secret(v_id, encode(extensions.gen_random_bytes(32), 'hex'));
  end if;
  return true;
end $$;
revoke all on function public.integracao_token_girar(text) from public, anon, authenticated, service_role;
comment on function public.integracao_token_girar(text) is
  'Troca o código de integração do sistema (só no SQL Editor; nenhum papel do site executa) (092).';

-- ------------------------------------------------------------------------------------------- registro
create table if not exists app.integracao_chamadas (
  id       bigint generated always as identity primary key,
  sistema  text not null,
  acao     text not null,
  ok       boolean not null,
  detalhe  text,
  em       timestamptz not null default now()
);
create index if not exists integracao_chamadas_em on app.integracao_chamadas (em desc);
alter table app.integracao_chamadas enable row level security;
revoke all on app.integracao_chamadas from public, anon, authenticated;
comment on table app.integracao_chamadas is
  'Cada chamada de outro sistema à Função hub-integracao: sistema, ação e resultado, sem os dados (092).';

create or replace function public.integracao_registrar(p_sistema text, p_acao text, p_ok boolean, p_detalhe text)
returns void language sql security definer set search_path = '' as $$
  insert into app.integracao_chamadas (sistema, acao, ok, detalhe)
  values (left(p_sistema, 40), left(p_acao, 40), coalesce(p_ok, false), left(p_detalhe, 300))
$$;
revoke all on function public.integracao_registrar(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.integracao_registrar(text, text, boolean, text) to service_role;

-- ------------------------------------------------------------------------------------------- busca de clientes
/**
 * Busca de clientes ativos da MDC para o "Nova empresa" do Ledgra. Mesma regra que o Ledgra fazia direto na tabela:
 * organização 'mdc', ativos, com CNPJ de 14 dígitos; sem letras, por parte do CNPJ (3 dígitos ou mais) ou pelo código do
 * Domínio; com letras, por nome, fantasia ou código do Domínio. Até 15 linhas e só os campos da tela.
 */
create or replace function public.integracao_clientes_buscar(p_busca text)
returns table (id uuid, razao_social text, nome_fantasia text, cnpj text, regime text, cidade text, uf text,
               codigo_dominio text, cliente_desde date, segmento text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_busca  text := btrim(regexp_replace(left(coalesce(p_busca, ''), 60), '\s+', ' ', 'g'));
  v_dig    text := regexp_replace(v_busca, '\D', '', 'g');
  v_cnpj   boolean := v_busca !~ '[[:alpha:]]' and length(v_dig) >= 3;
  v_padrao text := '%' || replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_org    uuid;
begin
  if length(v_busca) < 3 then return; end if;
  select o.id into v_org from organizacoes o where o.slug = 'mdc';
  if v_org is null then return; end if;
  return query
    select c.id, c.razao_social, c.nome_fantasia, regexp_replace(c.cnpj, '\D', '', 'g'), c.regime::text, c.cidade,
           c.uf, c.codigo_dominio, coalesce(c.cliente_desde, c.inicio_em), c.segmento::text
      from clientes c
     where c.org_id = v_org and c.ativo
       and length(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')) = 14
       and case when v_cnpj then regexp_replace(c.cnpj, '\D', '', 'g') like '%' || v_dig || '%' or c.codigo_dominio = v_busca
                else c.razao_social ilike v_padrao or c.nome_fantasia ilike v_padrao or c.codigo_dominio = v_busca end
     order by c.razao_social
     limit 15;
end $$;
revoke all on function public.integracao_clientes_buscar(text) from public, anon, authenticated;
grant execute on function public.integracao_clientes_buscar(text) to service_role;
comment on function public.integracao_clientes_buscar(text) is
  'Busca de clientes ativos da MDC para outro sistema, pela Função hub-integracao (só service_role) (092).';
