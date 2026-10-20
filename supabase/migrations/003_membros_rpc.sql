-- =====================================================================
--  Adicionar membro por e-mail (a pessoa precisa ter criado a conta antes)
-- =====================================================================
create or replace function public.adicionar_membro(
  p_org uuid, p_email text, p_nome text,
  p_papel public.papel_membro default 'analista', p_setor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores podem adicionar membros';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nenhuma conta com o e-mail %. Peça para a pessoa criar a conta na tela de login e tente de novo.', p_email;
  end if;
  insert into public.membros (org_id, user_id, nome, email, papel, setor_id)
  values (p_org, v_user, coalesce(nullif(trim(p_nome), ''), split_part(p_email, '@', 1)),
          lower(trim(p_email)), p_papel, p_setor)
  on conflict (org_id, user_id) do update
    set nome = excluded.nome, papel = excluded.papel, setor_id = excluded.setor_id, ativo = true;
  return v_user;
end $$;
grant execute on function public.adicionar_membro(uuid, text, text, public.papel_membro, uuid) to authenticated;
