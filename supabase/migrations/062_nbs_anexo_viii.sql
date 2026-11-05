-- =====================================================================================================
--  062 · Tabela oficial serviço × NBS (Anexo VIII da NFS-e Nacional) e atualização automática
--
--  Pedido do Edvaldo (05/11/2026): o campo NBS precisa trazer só os códigos que a legislação permite para o serviço e
--  conversar com o governo para atualizar sozinho quando sair versão nova.
--
--   1  fis_lc116_nbs: cada par item da LC 116 × NBS permitido, com a atividade do Simples (COD_ATIV_SN: diz o anexo,
--      III, IV ou Fator R) e o indicador de operação. A carga é sempre pela Função (a 1ª logo depois de publicada; a
--      v1.02.00 de 26/10/2026 tem 997 pares em 208 itens). Leitura aberta a quem tem login (tabela pública da
--      legislação); só a Função grava.
--   2  fis_tabelas: versão carregada, data, fonte e a última conferência com o portal da NFS-e.
--   3  fis_nbs_do_servico(código): NBS permitidos para o código de tributação nacional (ou item 17.19).
--   4  Atualização: a Função Edge fiscal-tabelas (toda segunda, 07h10 de Brasília, pg_cron) procura no portal da
--      NFS-e (gov.br/nfse › RTC) o Anexo VIII mais novo; se a versão for maior, baixa a planilha, troca a tabela de uma
--      vez (fis_tabela_carregar) e avisa os administradores no sino. Token interno gerado pelo banco (Vault), como a
--      nfse-automatica; as funções de carga só executam com a chave de serviço (dentro da Função), nunca pelo site.
-- =====================================================================================================

create table if not exists public.fis_tabelas (
  tabela text primary key check (tabela in ('anexo_viii')),
  versao text not null,
  publicada_em date,
  fonte text,
  carregada_em timestamptz not null default now(),
  conferida_em timestamptz,
  ultima_mensagem text
);
comment on table public.fis_tabelas is 'Tabelas oficiais da NFS-e carregadas no HUB: versão, fonte e última conferência com o portal (062).';

create table if not exists public.fis_lc116_nbs (
  -- item da LC 116 (17.19) ou código completo de 6 números, quando a tabela traz um só (99.03.01, operações com imóveis)
  item text not null check (item ~ '^\d{2}\.\d{2}(\.\d{2})?$'),
  item_descricao text,
  nbs text not null check (nbs ~ '^\d{9}$'),
  nbs_descricao text,
  ativ_sn text,
  ativ_sn_descricao text,
  indop text,
  versao text not null,
  primary key (item, nbs)
);
create index if not exists fis_lc116_nbs_nbs on public.fis_lc116_nbs (nbs);
comment on table public.fis_lc116_nbs is
  'Anexo VIII da NFS-e Nacional: NBS permitidos para cada item da LC 116, com a atividade do Simples (COD_ATIV_SN) (062).';

alter table public.fis_tabelas enable row level security;
alter table public.fis_lc116_nbs enable row level security;
drop policy if exists fis_ver on public.fis_tabelas;
create policy fis_ver on public.fis_tabelas for select to authenticated using (true);
drop policy if exists fis_ver on public.fis_lc116_nbs;
create policy fis_ver on public.fis_lc116_nbs for select to authenticated using (true);
revoke all on public.fis_tabelas, public.fis_lc116_nbs from anon;
revoke insert, update, delete, truncate on public.fis_tabelas, public.fis_lc116_nbs from authenticated;
grant select on public.fis_tabelas, public.fis_lc116_nbs to authenticated;

/**
 * NBS permitidos para o serviço (código de tributação nacional "171901", "17.19.01" ou item "17.19"). Procura primeiro
 * o código completo (99.03.01) e, se a tabela não tiver, o item da LC 116 (17.19).
 */
create or replace function public.fis_nbs_do_servico(p_servico text)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (
    select regexp_replace(coalesce(p_servico, ''), '\D', '', 'g') as d
  ), i as (
    select coalesce(
             (select n.item from fis_lc116_nbs n, d
               where length(d.d) = 6 and n.item = substr(d.d, 1, 2) || '.' || substr(d.d, 3, 2) || '.' || substr(d.d, 5, 2) limit 1),
             (select case when length(d.d) >= 4 then substr(d.d, 1, 2) || '.' || substr(d.d, 3, 2) end from d)) as item
  )
  select jsonb_build_object(
    'item', i.item,
    'item_descricao', (select max(item_descricao) from fis_lc116_nbs where item = i.item),
    'versao', t.versao, 'publicada_em', t.publicada_em, 'conferida_em', t.conferida_em,
    'nbs', coalesce((select jsonb_agg(jsonb_build_object('nbs', n.nbs, 'descricao', n.nbs_descricao, 'ativ_sn', n.ativ_sn,
                                                          'ativ_sn_descricao', n.ativ_sn_descricao) order by n.nbs)
                       from fis_lc116_nbs n where n.item = i.item), '[]'::jsonb))
    from i left join fis_tabelas t on t.tabela = 'anexo_viii'
   where auth.uid() is not null
$$;
revoke all on function public.fis_nbs_do_servico(text) from public, anon;
grant execute on function public.fis_nbs_do_servico(text) to authenticated;
comment on function public.fis_nbs_do_servico(text) is 'NBS que o Anexo VIII da NFS-e Nacional permite para o serviço (062).';

-- token do agendador (gerado pelo banco, guardado no Vault; a Função confere pelo banco)
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'fiscal_tabelas_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fiscal_tabelas_token',
      'Token interno gerado pelo banco: o pg_cron usa para chamar a Função Edge fiscal-tabelas.');
  end if;
end $$;
create or replace function public.fis_tabelas_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_token is not null and length(p_token) = 64
     and exists (select 1 from vault.decrypted_secrets where name = 'fiscal_tabelas_token' and decrypted_secret = p_token)
$$;
revoke all on function public.fis_tabelas_token_confere(text) from public, anon, authenticated;
grant execute on function public.fis_tabelas_token_confere(text) to service_role;

/** Registra a conferência com o portal (sem versão nova, ou falha ao consultar). Só a Função (chave de serviço). */
create or replace function public.fis_tabela_conferida(p_tabela text, p_mensagem text)
returns void language sql security definer set search_path = public as $$
  update fis_tabelas set conferida_em = now(), ultima_mensagem = left(p_mensagem, 500) where tabela = p_tabela
$$;
revoke all on function public.fis_tabela_conferida(text, text) from public, anon, authenticated;
grant execute on function public.fis_tabela_conferida(text, text) to service_role;

/**
 * Troca a tabela pela versão nova de uma vez (transação). p_linhas: [{item, item_descricao, nbs, nbs_descricao, ativ_sn,
 * ativ_sn_descricao, indop}]. Recusa versão igual ou menor e carga pequena demais (planilha mudou de formato). Avisa os
 * administradores de cada organização no sino. Só a Função (chave de serviço).
 */
create or replace function public.fis_tabela_carregar(p_tabela text, p_versao text, p_publicada date, p_fonte text, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_atual text; v_n int; o record;
begin
  if p_tabela <> 'anexo_viii' then raise exception 'Tabela desconhecida: %', p_tabela; end if;
  if coalesce(p_versao, '') !~ '^\d+\.\d+\.\d+$' then raise exception 'Versão inválida: %', p_versao; end if;
  select versao into v_atual from fis_tabelas where tabela = p_tabela;
  if v_atual is not null and string_to_array(p_versao, '.')::int[] <= string_to_array(v_atual, '.')::int[] then
    raise exception 'A versão % não é mais nova que a carregada (%)', p_versao, v_atual;
  end if;
  v_n := jsonb_array_length(coalesce(p_linhas, '[]'));
  if v_n < 500 then raise exception 'A planilha nova veio com só % linhas: o formato pode ter mudado; nada foi trocado', v_n; end if;
  delete from fis_lc116_nbs;
  insert into fis_lc116_nbs (item, item_descricao, nbs, nbs_descricao, ativ_sn, ativ_sn_descricao, indop, versao)
  select distinct on (x->>'item', regexp_replace(x->>'nbs', '\D', '', 'g'))
         x->>'item', x->>'item_descricao', regexp_replace(x->>'nbs', '\D', '', 'g'), x->>'nbs_descricao', x->>'ativ_sn',
         x->>'ativ_sn_descricao', x->>'indop', p_versao
    from jsonb_array_elements(p_linhas) x
   where x->>'item' ~ '^\d{2}\.\d{2}(\.\d{2})?$' and regexp_replace(x->>'nbs', '\D', '', 'g') ~ '^\d{9}$';
  get diagnostics v_n = row_count;
  insert into fis_tabelas (tabela, versao, publicada_em, fonte, carregada_em, conferida_em, ultima_mensagem)
  values (p_tabela, p_versao, p_publicada, p_fonte, now(), now(), format('Versão %s carregada (%s pares serviço × NBS)', p_versao, v_n))
  on conflict (tabela) do update set versao = excluded.versao, publicada_em = excluded.publicada_em, fonte = excluded.fonte,
         carregada_em = now(), conferida_em = now(), ultima_mensagem = excluded.ultima_mensagem;
  for o in select id from organizacoes where gestao_cliente_id is not null loop
    perform app.avisar_admins(o.id, 'contratos', 'Tabela NBS atualizada',
      format('O governo publicou a versão %s do Anexo VIII da NFS-e (serviço × NBS). O HUB já atualizou: confira o NBS das regras fiscais.', p_versao),
      '/contratos/nota-fiscal');
  end loop;
  return jsonb_build_object('versao', p_versao, 'linhas', v_n);
end $$;
revoke all on function public.fis_tabela_carregar(text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.fis_tabela_carregar(text, text, date, text, jsonb) to service_role;

/** Versão carregada (a Função compara com a do portal). */
create or replace function public.fis_tabela_versao(p_tabela text)
returns text language sql stable security definer set search_path = public as $$
  select versao from fis_tabelas where tabela = p_tabela
$$;
revoke all on function public.fis_tabela_versao(text) from public, anon, authenticated;
grant execute on function public.fis_tabela_versao(text) to service_role;

-- carga inicial: feita pela própria Função fiscal-tabelas logo depois de publicada (baixa o Anexo VIII mais novo do
-- portal); os 997 pares da v1.02.00 ficam em supabase/testes/132_base_062.sql só para os testes.

-- agendamento: toda segunda, 07h10 de Brasília (10h10 UTC)
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'fiscal-tabelas') then perform cron.unschedule('fiscal-tabelas'); end if;
    perform cron.schedule('fiscal-tabelas', '10 10 * * 1', $cron$
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/fiscal-tabelas',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'fiscal_tabelas_token')),
        body := '{"acao":"conferir"}'::jsonb,
        timeout_milliseconds := 140000)
    $cron$);
  end if;
end $$;
