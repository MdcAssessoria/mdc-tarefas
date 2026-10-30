-- =====================================================================
--  017 · Editar, inativar e reativar pessoas da equipe pelo Hub
--  Uma função só (admin), com auditoria. Administrador = acesso total
--  (sem perfil); quem deixa de ser administrador volta a seguir um perfil.
-- =====================================================================

create or replace function public.hub_editar_membro(p_org uuid, p_user uuid, p_nome text, p_papel public.papel_membro,
                                                    p_setor uuid, p_perfil uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes membros;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores editam pessoas';
  end if;
  select * into v_antes from membros where org_id = p_org and user_id = p_user;
  if v_antes.user_id is null then raise exception 'Pessoa não pertence à organização'; end if;
  if p_user = auth.uid() and (p_papel is distinct from 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador nem se inativar';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome'; end if;
  if p_papel <> 'admin' and p_perfil is null and p_ativo then
    raise exception 'Escolha o perfil de acesso (ou marque como Administrador)';
  end if;
  if p_perfil is not null and not exists (select 1 from hub_perfis where id = p_perfil and org_id = p_org) then
    raise exception 'Perfil não encontrado';
  end if;
  if p_setor is not null and not exists (select 1 from setores where id = p_setor and org_id = p_org) then
    raise exception 'Setor não encontrado';
  end if;

  update membros
     set nome = trim(p_nome), papel = p_papel, setor_id = p_setor, ativo = p_ativo,
         perfil_id = case when p_papel = 'admin' then null else p_perfil end
   where org_id = p_org and user_id = p_user;

  perform app.registrar(p_org, 'hub',
    case when v_antes.ativo and not p_ativo then 'inativar' when not v_antes.ativo and p_ativo then 'reativar' else 'editar_pessoa' end,
    p_user::text,
    jsonb_build_object('nome', v_antes.nome, 'papel', v_antes.papel, 'setor', v_antes.setor_id, 'perfil', v_antes.perfil_id, 'ativo', v_antes.ativo),
    jsonb_build_object('nome', trim(p_nome), 'papel', p_papel, 'setor', p_setor, 'perfil', p_perfil, 'ativo', p_ativo));
end $$;
revoke all on function public.hub_editar_membro(uuid, uuid, text, public.papel_membro, uuid, uuid, boolean) from public, anon;
grant execute on function public.hub_editar_membro(uuid, uuid, text, public.papel_membro, uuid, uuid, boolean) to authenticated;

-- convite de equipe ainda sem conta pode ser cancelado pelo admin
create or replace function public.hub_cancelar_convite(p_org uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if app.papel(p_org) is distinct from 'admin' then raise exception 'Apenas administradores'; end if;
  delete from app.convites where org_id = p_org and email = lower(trim(p_email));
  perform app.registrar(p_org, 'hub', 'cancelar_convite', lower(trim(p_email)), null, null);
end $$;
revoke all on function public.hub_cancelar_convite(uuid, text) from public, anon;
grant execute on function public.hub_cancelar_convite(uuid, text) to authenticated;
