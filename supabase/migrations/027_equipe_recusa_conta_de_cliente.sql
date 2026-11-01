-- =====================================================================================================
--  027 · Equipe nunca reaproveita conta de cliente (reauditoria 01/11/2026, achado R-A1)
--
--  A 025 aceitava levar para a equipe uma conta que já tinha sido acesso de cliente, desde que o acesso estivesse
--  desativado e a conta já tivesse entrado. Isso ainda deixava um caminho: quem gere o Atendimento cadastra como
--  cliente o e-mail de um futuro funcionário, cria a senha pelo link, desativa o acesso e espera o administrador
--  colocar esse e-mail na equipe — e entra como o funcionário.
--
--  Regra nova (simples): conta que já foi acesso de cliente, ou e-mail com convite de cliente pendente, não entra na
--  equipe. Para a pessoa trabalhar na MDC, use outro e-mail (ex.: o e-mail corporativo).
--
--  A marca é permanente (app.ex_clientes): apagar o cliente ou o acesso não apaga a marca (revisão da auditoria A-1:
--  portal_usuarios some em cascata quando o cliente é apagado).
-- =====================================================================================================

create table if not exists app.ex_clientes (
  email text primary key,
  desde timestamptz not null default now()
);
revoke all on app.ex_clientes from public, anon, authenticated;
comment on table app.ex_clientes is 'E-mails que já foram acesso de cliente (convite ou conta). Nunca entram na equipe. Só funções do servidor leem e gravam.';

insert into app.ex_clientes (email)
select lower(email) from public.portal_usuarios where email is not null
union select lower(email) from public.portal_convites
union select lower(u.email) from public.portal_usuarios p join auth.users u on u.id = p.user_id
on conflict do nothing;

create or replace function app.tg_marcar_ex_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app.ex_clientes (email) values (lower(trim(new.email))) on conflict do nothing;
  if tg_table_name = 'portal_usuarios' then
    insert into app.ex_clientes (email) select lower(u.email) from auth.users u where u.id = new.user_id and u.email is not null
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function app.tg_marcar_ex_cliente() from public, anon, authenticated;
drop trigger if exists marcar_ex_cliente on public.portal_convites;
create trigger marcar_ex_cliente after insert or update of email on public.portal_convites
  for each row execute function app.tg_marcar_ex_cliente();
drop trigger if exists marcar_ex_cliente on public.portal_usuarios;
create trigger marcar_ex_cliente after insert or update on public.portal_usuarios
  for each row execute function app.tg_marcar_ex_cliente();

create or replace function public.adicionar_membro(p_org uuid, p_email text, p_nome text,
  p_papel papel_membro default 'analista'::papel_membro, p_setor uuid default null)
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
  if not exists (select 1 from membros m where m.org_id = p_org and m.user_id = v_user) then
    if exists (select 1 from app.ex_clientes x where x.email = v_email)
       or exists (select 1 from portal_convites c where c.email = v_email)
       or (v_user is not null and exists (select 1 from portal_usuarios p where p.user_id = v_user)) then
      raise exception 'Este e-mail é ou já foi acesso de cliente. Para a equipe, use outro e-mail (por exemplo, o corporativo)';
    end if;
  end if;
  if v_user is null then
    insert into app.convites (org_id, email, nome, papel, setor_id)
    values (p_org, v_email, nullif(trim(p_nome), ''), p_papel, p_setor)
    on conflict (org_id, email) do update
      set nome = excluded.nome, papel = excluded.papel, setor_id = excluded.setor_id;
    return null;
  end if;
  insert into public.membros (org_id, user_id, nome, email, papel, setor_id)
  values (p_org, v_user, coalesce(nullif(trim(p_nome), ''), split_part(v_email, '@', 1)), v_email, p_papel, p_setor)
  on conflict (org_id, user_id) do update
    set nome = excluded.nome, papel = excluded.papel, setor_id = excluded.setor_id, ativo = true;
  return v_user;
end $$;
