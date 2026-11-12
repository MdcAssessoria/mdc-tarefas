-- 071: senha provisória no lugar do e-mail de convite (12/11/2026, decisão do Edvaldo: o envio de e-mail pela Microsoft
-- ficou complexo). O administrador gera uma senha provisória diferente para cada pessoa (Função "convite", modo
-- senha_provisoria), manda pelo WhatsApp, e no primeiro acesso o HUB obriga a criar a própria senha.
--  * hub_pode_senha_provisoria: mesmas regras de quem pode gerar o link do convite (024/036/069), mas vale também para
--    quem já tem senha (serve de "redefinir senha" pelo administrador, já que o e-mail de recuperação não sai).
--  * hub_senha_trocada: a própria pessoa avisa que trocou a senha; tira a marca trocar_senha da conta.
--  * hub_situacao_contas: conta com senha provisória ainda aparece como "aguardando criar a senha".

create or replace function public.hub_pode_senha_provisoria(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_org uuid; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  v_equipe := exists (select 1 from app.convites c where c.email = v_email)
           or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id));
  if v_equipe then
    if exists (select 1 from app.convites c where c.email = v_email and app.papel(c.org_id) is distinct from 'admin')
       or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id
                                                 and app.papel(m.org_id) is distinct from 'admin')) then
      return false;
    end if;
    select coalesce(
      (select c.org_id from app.convites c where c.email = v_email limit 1),
      (select m.org_id from membros m where m.user_id = v_conta.id limit 1)) into v_org;
  else
    select c.org_id into v_org from portal_convites c
     where c.email = v_email and c.cancelado_em is null and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')) limit 1;
    if v_org is null and v_conta.id is not null then
      select p.org_id into v_org from portal_usuarios p
       where p.user_id = v_conta.id and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')) limit 1;
    end if;
  end if;
  if v_org is null then return false; end if;
  perform app.registrar(v_org, 'acessos', 'senha_provisoria', v_email, null, jsonb_build_object('pedido_por', auth.uid()));
  return true;
end $$;
revoke all on function public.hub_pode_senha_provisoria(text) from public, anon;
grant execute on function public.hub_pode_senha_provisoria(text) to authenticated;

create or replace function public.hub_senha_trocada()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'trocar_senha'
   where id = auth.uid() and raw_app_meta_data ? 'trocar_senha';
end $$;
revoke all on function public.hub_senha_trocada() from public, anon;
grant execute on function public.hub_senha_trocada() to authenticated;

create or replace function public.hub_situacao_contas(p_org uuid)
returns table (user_id uuid, confirmado boolean, ultimo_acesso timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(u.encrypted_password, '') <> '' and not coalesce((u.raw_app_meta_data ->> 'trocar_senha')::boolean, false),
         u.last_sign_in_at
    from membros m join auth.users u on u.id = m.user_id
   where m.org_id = p_org and app.papel(p_org) = 'admin'
$$;
revoke all on function public.hub_situacao_contas(uuid) from public, anon;
grant execute on function public.hub_situacao_contas(uuid) to authenticated;

-- id da conta pelo e-mail, só para a Função (service_role), que precisa dele para trocar a senha provisória
create or replace function public.hub_conta_id(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;
revoke all on function public.hub_conta_id(text) from public, anon, authenticated;
grant execute on function public.hub_conta_id(text) to service_role;
