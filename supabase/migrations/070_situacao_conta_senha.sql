-- 070: na lista de Acessos, conta "ativa" é a que já criou a senha (12/11/2026).
-- Antes contava o primeiro login; quem abria o link do convite sem criar a senha aparecia como ativa e perdia os botões
-- "Reenviar convite" e "Link para WhatsApp" (par com a 069). O último acesso continua o mesmo.
create or replace function public.hub_situacao_contas(p_org uuid)
returns table (user_id uuid, confirmado boolean, ultimo_acesso timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(u.encrypted_password, '') <> '', u.last_sign_in_at
    from membros m join auth.users u on u.id = m.user_id
   where m.org_id = p_org and app.papel(p_org) = 'admin'
$$;
revoke all on function public.hub_situacao_contas(uuid) from public, anon;
grant execute on function public.hub_situacao_contas(uuid) to authenticated;
