-- =====================================================================================================
--  025 · Correção de segurança do link de convite (auditoria 01/11/2026, achado C-1)
--
--  Problema: quem gere o Atendimento conseguia o link de criar senha de uma pessoa convidada para a EQUIPE,
--  cadastrando o mesmo e-mail como acesso de cliente. Ao abrir o link, a conta era ligada à equipe (com o papel do
--  convite, podendo ser administrador) e quem pediu o link entrava no lugar dela.
--
--  Regra corrigida:
--    1. Se o e-mail tem convite de equipe pendente, ou a conta já é da equipe, o link só sai para administrador
--       daquela organização. O critério de cliente (gestor / Atendimento) nunca vale para esse e-mail.
--    2. O cadastro de acesso de cliente (portal_convidar) recusa e-mail com convite de equipe pendente.
--    3. O envio do convite por e-mail (hub_pode_enviar_convite) segue a mesma separação.
--    4. Ordem inversa (revisão da auditoria): o administrador não liga à equipe um e-mail que tem acesso de cliente
--       pendente, ativo ou nunca usado (a conta poderia ter sido criada por quem pediu o link do cliente).
--       Para transformar cliente em funcionário com o mesmo e-mail: desative o acesso de cliente e a pessoa precisa
--       já ter entrado ao menos uma vez com a própria senha.
--    5. A mesma recusa vale na tabela portal_convites (gatilho), não só na função.
-- =====================================================================================================

create or replace function public.hub_pode_ver_link_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_org uuid; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  if v_conta.id is not null and (v_conta.email_confirmed_at is not null or v_conta.last_sign_in_at is not null) then
    return false; -- conta já ativa: nunca devolve link de acesso
  end if;
  -- e-mail de equipe (convite pendente ou conta já ligada à equipe em qualquer organização)
  v_equipe := exists (select 1 from app.convites c where c.email = v_email)
           or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id));
  if v_equipe then
    -- só administrador de TODAS as organizações envolvidas
    if exists (select 1 from app.convites c where c.email = v_email and app.papel(c.org_id) is distinct from 'admin')
       or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id
                                                 and app.papel(m.org_id) is distinct from 'admin')) then
      return false;
    end if;
    select coalesce(
      (select c.org_id from app.convites c where c.email = v_email limit 1),
      (select m.org_id from membros m where m.user_id = v_conta.id limit 1)) into v_org;
  else
    -- acesso de cliente (portal): administrador, gestor ou quem gere o Atendimento
    select c.org_id into v_org from portal_convites c
     where c.email = v_email and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')) limit 1;
    if v_org is null and v_conta.id is not null then
      select p.org_id into v_org from portal_usuarios p
       where p.user_id = v_conta.id and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')) limit 1;
    end if;
  end if;
  if v_org is null then return false; end if;
  perform app.registrar(v_org, 'acessos', 'link_convite', v_email, null, jsonb_build_object('pedido_por', auth.uid()));
  return true;
end $$;
revoke all on function public.hub_pode_ver_link_convite(text) from public, anon;
grant execute on function public.hub_pode_ver_link_convite(text) to authenticated;
comment on function public.hub_pode_ver_link_convite(text) is
  'A Função convite só devolve o link de criar senha se esta função for verdadeira. E-mail de equipe (convite pendente ou membro): só administrador de todas as organizações envolvidas. Cliente: administrador, gestor ou quem gere o Atendimento. Só conta que nunca entrou. Registra na auditoria.';

create or replace function public.hub_pode_enviar_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_ok boolean; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  if v_conta.id is not null and not (v_conta.invited_at is not null and v_conta.email_confirmed_at is null
                                     and v_conta.last_sign_in_at is null) then
    return false;
  end if;
  v_equipe := exists (select 1 from app.convites c where c.email = v_email)
           or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id));
  if v_equipe then
    -- mesma regra do link: administrador de todas as organizações envolvidas
    v_ok := not exists (select 1 from app.convites c where c.email = v_email and app.papel(c.org_id) is distinct from 'admin')
        and not (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id
                                                       and app.papel(m.org_id) is distinct from 'admin'));
  elsif v_conta.id is null then
    v_ok := exists (select 1 from portal_convites c where c.email = v_email
                     and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')));
  else
    v_ok := exists (select 1 from portal_usuarios p where p.user_id = v_conta.id
                     and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')));
  end if;
  if not v_ok then return false; end if;
  if (select count(*) from app.convite_envios where user_id = auth.uid() and em > now() - interval '1 day') >= 40 then
    raise exception 'Limite diário de convites atingido. Tente amanhã.';
  end if;
  insert into app.convite_envios (user_id, email) values (auth.uid(), v_email);
  return true;
end $$;
revoke all on function public.hub_pode_enviar_convite(text) from public, anon;
grant execute on function public.hub_pode_enviar_convite(text) to authenticated;

create or replace function public.portal_convidar(p_cliente uuid, p_email text, p_nome text, p_permissoes text[] default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_user uuid; v_email text := lower(trim(p_email));
        v_perm text[] := coalesce(p_permissoes, array['demonstrativos','rotinas','chat','documentos','societario']);
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not (app.eh_gestor(v_org) or app.hub_pode(v_org, 'atendimento', 'gerir')) then
    raise exception 'Sem permissão para convidar usuários do cliente';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido: %', p_email; end if;
  if exists (select 1 from membros m join auth.users u on u.id = m.user_id where lower(u.email) = v_email)
     or exists (select 1 from app.convites c where c.email = v_email) then
    raise exception 'Este e-mail não pode receber acesso de cliente; use outro e-mail';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into portal_convites (org_id, email, cliente_id, nome, permissoes)
    values (v_org, v_email, p_cliente, nullif(trim(p_nome), ''), v_perm)
    on conflict (email, cliente_id) do update set nome = excluded.nome, permissoes = excluded.permissoes;
    return 'convite';
  end if;
  insert into portal_usuarios (org_id, user_id, cliente_id, nome, email, permissoes)
  values (v_org, v_user, p_cliente, coalesce(nullif(trim(p_nome), ''), split_part(v_email, '@', 1)), v_email, v_perm)
  on conflict (user_id, cliente_id) do update set permissoes = excluded.permissoes, ativo = true, nome = excluded.nome;
  perform app.registrar(v_org, 'portal', 'convite', p_cliente::text, null, to_jsonb(v_email));
  return 'liberado';
end $$;

-- ------------------------------------------------------------------------------------- ordem inversa
create or replace function public.adicionar_membro(p_org uuid, p_email text, p_nome text,
  p_papel papel_membro default 'analista'::papel_membro, p_setor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_email text := lower(trim(p_email)); v_conta auth.users;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores podem adicionar membros';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido: %', p_email;
  end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  v_user := v_conta.id;
  -- e-mail de cliente (portal) não vira equipe sem passar pelos cuidados abaixo (auditoria 01/11/2026)
  if not exists (select 1 from membros m where m.org_id = p_org and m.user_id = v_user) then
    if exists (select 1 from portal_convites c where c.email = v_email) then
      raise exception 'Este e-mail tem convite de cliente pendente. Cancele esse convite antes de colocá-lo na equipe';
    end if;
    if v_user is not null and exists (select 1 from portal_usuarios p where p.user_id = v_user and p.ativo) then
      raise exception 'Este e-mail tem acesso de cliente ativo. Desative o acesso de cliente antes de colocá-lo na equipe';
    end if;
    if v_user is not null and v_conta.last_sign_in_at is null and exists (select 1 from portal_usuarios p where p.user_id = v_user) then
      raise exception 'Esta conta de cliente nunca foi usada. A pessoa precisa entrar uma vez com a própria senha antes de ir para a equipe';
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
  if v_conta.last_sign_in_at is not null and exists (select 1 from portal_usuarios p where p.user_id = v_user) then
    perform app.registrar(p_org, 'hub', 'cliente_para_equipe', v_email, null, to_jsonb(p_papel));
  end if;
  return v_user;
end $$;

-- convite de cliente gravado direto na tabela também passa pela recusa
create or replace function app.tg_portal_convite_sem_conta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if exists (select 1 from auth.users where lower(email) = new.email) then
    raise exception 'Este e-mail já tem conta; libere o acesso pela tela de acessos do portal';
  end if;
  if exists (select 1 from app.convites c where c.email = new.email) then
    raise exception 'Este e-mail não pode receber acesso de cliente; use outro e-mail';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------------------------- M-8: pg_net fora do public
-- A extensão não pode ser movida (não é relocável); recria no esquema extensions. As funções dela continuam no
-- esquema net (net.http_post), que é o que o agendador 'agente-balancetes' usa; nada mais depende dela.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
