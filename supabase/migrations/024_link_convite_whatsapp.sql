-- =====================================================================================================
--  024 · Link de convite para repassar pelo WhatsApp (equipe e clientes)
--
--  Pedido do Edvaldo em 01/11/2026: além do e-mail, gerar o link de criar senha para mandar pelo WhatsApp.
--  Quem pode pedir o link (mesma regra de quem pode convidar):
--    equipe  → administrador da organização;
--    cliente → administrador, gestor ou quem gere o Atendimento (portal).
--  Só para conta que ainda não entrou nenhuma vez (nunca para conta ativa: isso seria entrar no lugar da pessoa).
--  Cada link gerado fica na auditoria (quem pediu, para qual e-mail).
-- =====================================================================================================

create or replace function public.hub_pode_ver_link_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_org uuid;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  if v_conta.id is not null and (v_conta.email_confirmed_at is not null or v_conta.last_sign_in_at is not null) then
    return false; -- conta já ativa: nunca devolve link de acesso
  end if;
  -- convite da equipe: só administrador
  select c.org_id into v_org from app.convites c where c.email = v_email and app.papel(c.org_id) = 'admin' limit 1;
  if v_org is null and v_conta.id is not null then
    select m.org_id into v_org from membros m where m.user_id = v_conta.id and app.papel(m.org_id) = 'admin' limit 1;
  end if;
  -- acesso de cliente (portal): administrador, gestor ou quem gere o Atendimento
  if v_org is null then
    select c.org_id into v_org from portal_convites c
     where c.email = v_email and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')) limit 1;
  end if;
  if v_org is null and v_conta.id is not null then
    select p.org_id into v_org from portal_usuarios p
     where p.user_id = v_conta.id and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')) limit 1;
  end if;
  if v_org is null then return false; end if;
  perform app.registrar(v_org, 'acessos', 'link_convite', v_email, null, jsonb_build_object('pedido_por', auth.uid()));
  return true;
end $$;
revoke all on function public.hub_pode_ver_link_convite(text) from public, anon;
grant execute on function public.hub_pode_ver_link_convite(text) to authenticated;
comment on function public.hub_pode_ver_link_convite(text) is
  'A Função convite só devolve o link de criar senha (para WhatsApp) se esta função for verdadeira: equipe = administrador; cliente = administrador, gestor ou quem gere o Atendimento; só conta que nunca entrou. Registra na auditoria.';

/** Só para a Função convite (servidor): a conta já existe? Decide entre link de convite e link de criar senha. */
create or replace function public.hub_conta_existe(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users where lower(email) = lower(trim(p_email)))
$$;
revoke all on function public.hub_conta_existe(text) from public, anon, authenticated;
grant execute on function public.hub_conta_existe(text) to service_role;
