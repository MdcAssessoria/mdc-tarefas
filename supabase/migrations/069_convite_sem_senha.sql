-- 069: convite que "travou" volta a poder ser reenviado (12/11/2026).
-- O link do convite pode ser aberto e confirmar a conta sem que a pessoa chegue a criar a senha (link aberto no
-- navegador de outra pessoa, ou anulado por um envio de e-mail atrasado). Antes, conta confirmada ficava sem convite e
-- sem link para sempre. Agora "pendente" é a conta que ainda não tem senha; quem já criou a senha continua de fora.
-- Só muda o teste da conta; o resto (quem pode convidar, limite diário, registro na auditoria) é o mesmo da 036.

create or replace function public.hub_pode_ver_link_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_org uuid; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  -- conta que já criou a senha não recebe link; confirmada pelo link mas sem senha ainda pode (12/11/2026)
  if v_conta.id is not null and coalesce(v_conta.encrypted_password, '') <> '' then
    return false;
  end if;
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
  perform app.registrar(v_org, 'acessos', 'link_convite', v_email, null, jsonb_build_object('pedido_por', auth.uid()));
  return true;
end $$;

create or replace function public.hub_pode_enviar_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_ok boolean; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  -- conta que já criou a senha não recebe convite; convidada (confirmada ou não) e sem senha pode receber de novo
  if v_conta.id is not null and (v_conta.invited_at is null or coalesce(v_conta.encrypted_password, '') <> '') then
    return false;
  end if;
  v_equipe := exists (select 1 from app.convites c where c.email = v_email)
           or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id));
  if v_equipe then
    v_ok := not exists (select 1 from app.convites c where c.email = v_email and app.papel(c.org_id) is distinct from 'admin')
        and not (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id
                                                       and app.papel(m.org_id) is distinct from 'admin'));
  elsif v_conta.id is null then
    v_ok := exists (select 1 from portal_convites c where c.email = v_email and c.cancelado_em is null
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
