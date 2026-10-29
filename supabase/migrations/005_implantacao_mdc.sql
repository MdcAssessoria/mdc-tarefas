-- =====================================================================
--  005 · Implantação automática da MDC + convites pré-aprovados
--  - Cria a organização MDC (setores e obrigações) sem depender de usuário.
--  - Tabela de convites: quem estiver convidado vira membro sozinho ao criar a conta.
--  - adicionar_membro passa a registrar convite quando a pessoa ainda não tem conta.
-- =====================================================================

create table if not exists app.convites (
  org_id    uuid not null references public.organizacoes(id) on delete cascade,
  email     text not null check (email = lower(trim(email))),
  nome      text,
  papel     public.papel_membro not null default 'analista',
  setor_id  uuid,
  criado_em timestamptz not null default now(),
  primary key (org_id, email)
);
revoke all on app.convites from public, anon, authenticated;

-- Ao criar conta: vincula a todas as organizações que convidaram esse e-mail.
create or replace function app.aplicar_convites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.membros (org_id, user_id, nome, email, papel, setor_id)
    select c.org_id, new.id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.papel, c.setor_id
      from app.convites c
     where c.email = lower(new.email)
    on conflict (org_id, user_id) do nothing;
    delete from app.convites where email = lower(new.email);
  exception when others then
    -- nunca impedir o cadastro por causa do convite
    raise warning 'aplicar_convites: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function app.aplicar_convites() from public, anon, authenticated;

drop trigger if exists aplicar_convites_ao_cadastrar on auth.users;
create trigger aplicar_convites_ao_cadastrar after insert on auth.users
  for each row execute function app.aplicar_convites();

-- adicionar_membro: se a pessoa ainda não tem conta, fica convidada.
create or replace function public.adicionar_membro(
  p_org uuid, p_email text, p_nome text,
  p_papel public.papel_membro default 'analista', p_setor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_email text := lower(trim(p_email));
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores podem adicionar membros';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido: %', p_email;
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into app.convites (org_id, email, nome, papel, setor_id)
    values (p_org, v_email, nullif(trim(p_nome), ''), p_papel, p_setor)
    on conflict (org_id, email) do update
      set nome = excluded.nome, papel = excluded.papel, setor_id = excluded.setor_id;
    return null; -- convite registrado; vira membro ao criar a conta
  end if;
  insert into public.membros (org_id, user_id, nome, email, papel, setor_id)
  values (p_org, v_user, coalesce(nullif(trim(p_nome), ''), split_part(v_email, '@', 1)), v_email, p_papel, p_setor)
  on conflict (org_id, user_id) do update
    set nome = excluded.nome, papel = excluded.papel, setor_id = excluded.setor_id, ativo = true;
  return v_user;
end $$;
grant execute on function public.adicionar_membro(uuid, text, text, public.papel_membro, uuid) to authenticated;

-- Convites pendentes visíveis para o admin da organização
create or replace function public.convites_pendentes(p_org uuid)
returns table (email text, nome text, papel public.papel_membro, setor_id uuid, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select c.email, c.nome, c.papel, c.setor_id, c.criado_em from app.convites c
   where c.org_id = p_org and app.papel(p_org) = 'admin' order by c.criado_em;
$$;
grant execute on function public.convites_pendentes(uuid) to authenticated;

create or replace function public.cancelar_convite(p_org uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores podem cancelar convites';
  end if;
  delete from app.convites where org_id = p_org and email = lower(trim(p_email));
end $$;
grant execute on function public.cancelar_convite(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Organização MDC
-- ---------------------------------------------------------------------
do $$
declare
  v_org uuid;
  s_fis uuid; s_con uuid; s_dp uuid; s_soc uuid;
begin
  insert into public.organizacoes (nome, slug, cnpj, logo_url, cor_primaria, cor_destaque)
  values ('MDC Assessoria', 'mdc', '48.140.121/0001-65',
          'https://mdcassessoria.com/wp-content/uploads/2024/07/Logo-MDC5.png', '#0B2820', '#E2C17E')
  on conflict (slug) do update set nome = excluded.nome
  returning id into v_org;

  insert into public.setores (org_id, nome, cor, ordem) values
    (v_org, 'Fiscal', '#E2C17E', 1), (v_org, 'Contábil', '#7FB3A0', 2),
    (v_org, 'Departamento Pessoal', '#9DB4E0', 3), (v_org, 'Societário', '#D9A6A6', 4)
  on conflict (org_id, nome) do nothing;

  select id into s_fis from public.setores where org_id = v_org and nome = 'Fiscal';
  select id into s_con from public.setores where org_id = v_org and nome = 'Contábil';
  select id into s_dp  from public.setores where org_id = v_org and nome = 'Departamento Pessoal';
  select id into s_soc from public.setores where org_id = v_org and nome = 'Societário';

  insert into app.convites (org_id, email, nome, papel) values
    (v_org, 'edvaldo@mdcassessoria.com', 'Edvaldo Ribeiro de Carvalho', 'admin'),
    (v_org, 'tv@mdcassessoria.com', 'Painel TV', 'tv')
  on conflict (org_id, email) do update set papel = excluded.papel;

  if not exists (select 1 from public.modelos_recorrentes where org_id = v_org) then
    insert into public.modelos_recorrentes
      (org_id, titulo, setor_id, prioridade, regimes, meses, dia_vencimento, meses_apos_competencia) values
      (v_org, 'Fechamento da folha',                  s_dp,  'alta',    null,                    null,          5,  1),
      (v_org, 'eSocial / DCTFWeb',                    s_dp,  'alta',    null,                    null,          12, 1),
      (v_org, 'EFD-Reinf',                            s_fis, 'alta',    array['presumido','real'], null,        12, 1),
      (v_org, 'PGDAS-D (Simples Nacional)',           s_fis, 'alta',    array['simples'],        null,          17, 1),
      (v_org, 'SPED Fiscal (EFD ICMS/IPI)',           s_fis, 'media',   array['presumido','real'], null,        17, 1),
      (v_org, 'EFD-Contribuições',                    s_fis, 'media',   array['presumido','real'], null,        8,  2),
      (v_org, 'Apuração IRPJ/CSLL trimestral',        s_fis, 'alta',    array['presumido','real'], array[3,6,9,12], 25, 1),
      (v_org, 'Conciliação e fechamento contábil',    s_con, 'media',   array['presumido','real'], null,        25, 1),
      (v_org, 'DEFIS',                                s_con, 'media',   array['simples'],        array[12],     20, 3),
      (v_org, 'ECD',                                  s_con, 'alta',    array['presumido','real'], array[12],   20, 6),
      (v_org, 'ECF',                                  s_con, 'alta',    array['presumido','real'], array[12],   20, 7);
  end if;
end $$;
