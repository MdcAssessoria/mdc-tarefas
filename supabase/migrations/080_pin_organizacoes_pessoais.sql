-- 080 PIN das organizações pessoais (pedido do Edvaldo, 14/11/2026).
--   Organizações marcadas com "exige_pin" (Financeiro pessoal — Edvaldo e Família Carvalho) pedem um PIN de 4 números
--   ao entrar. Depois de digitado, o PIN fica liberado por 30 minutos para aquela pessoa; acabou o prazo, ou a pessoa
--   saiu do HUB, pede de novo.
--   O banco também confere o PIN: cadastrar, convidar, alterar ou tirar pessoas e mudar acessos nessas organizações
--   só funciona com o PIN liberado. Assim ninguém cadastra pessoa errada pela conta deixada aberta.
--   O PIN fica guardado só como resumo (bcrypt), nunca o número. 5 erros seguidos travam por 15 minutos.
--   Esqueceu o PIN: a pessoa entra de novo com a senha do HUB e, nos 5 minutos seguintes, cria um PIN novo.
--   Toda tentativa (certa ou errada) vai para o registro de auditoria (hub_auditoria, app "acessos").
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- ================================================================================ marcação da organização
alter table public.organizacoes add column if not exists exige_pin boolean not null default false;
comment on column public.organizacoes.exige_pin is
  'Pede PIN de 4 números para entrar e para mexer em pessoas e acessos (080). Muda só por org_definir_exige_pin.';

-- as duas organizações pessoais do Edvaldo
update public.organizacoes set exige_pin = true
 where id in ('7947cb7a-c841-42ef-96cd-361262959cbb',   -- Financeiro pessoal — Edvaldo
              'c96fc062-0006-40c9-8809-2b8dff71bd2a');  -- Família Carvalho

create or replace function app.org_exige_pin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select exige_pin from public.organizacoes where id = p_org), false)
$$;
revoke all on function app.org_exige_pin(uuid) from public, anon;

-- ================================================================================ PIN de cada pessoa
create table if not exists app.pin_usuarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  erros int not null default 0,
  bloqueado_ate timestamptz,
  liberado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table app.pin_usuarios enable row level security;
revoke all on app.pin_usuarios from public, anon, authenticated;
comment on table app.pin_usuarios is 'PIN de 4 números por pessoa (080): só o resumo bcrypt, erros seguidos e até quando está liberado.';

/** A pessoa logada digitou o PIN há menos de 30 minutos. */
create or replace function app.pin_liberado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.pin_usuarios where user_id = auth.uid() and liberado_ate > now())
$$;
revoke all on function app.pin_liberado() from public, anon;

/** Situação do PIN de quem está logado: se já criou, até quando está liberado e se está travado por erros. */
create or replace function public.pin_situacao()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p app.pin_usuarios;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  select * into p from app.pin_usuarios where user_id = auth.uid();
  return jsonb_build_object(
    'definido', p.user_id is not null,
    'liberado_ate', case when p.liberado_ate > now() then p.liberado_ate end,
    'bloqueado_ate', case when p.bloqueado_ate > now() then p.bloqueado_ate end);
end $$;
revoke all on function public.pin_situacao() from public, anon;
grant execute on function public.pin_situacao() to authenticated;

/**
 * Cria ou troca o PIN. Primeira vez: só o PIN novo. Troca: com o PIN liberado (digitado nos últimos 30 minutos, pela
 * conferência que conta os erros) ou depois de entrar com a senha do HUB nos últimos 5 minutos ("Esqueci meu PIN").
 * Não aceita "PIN atual" aqui: sem contador de erros, isso permitiria testar os 10 mil números. Já deixa liberado.
 */
create or replace function public.pin_definir(p_org uuid, p_pin_novo text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid := auth.uid();
  p app.pin_usuarios;
  v_login_recente boolean;
begin
  if v_user is null then raise exception 'Faça login.'; end if;
  if app.papel(p_org) is null then raise exception 'Organização não encontrada'; end if;
  if coalesce(p_pin_novo, '') !~ '^[0-9]{4}$' then raise exception 'O PIN precisa ter exatamente 4 números.'; end if;
  if p_pin_novo in ('0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321') then
    raise exception 'Esse PIN é fácil de adivinhar. Escolha outros 4 números.';
  end if;
  select * into p from app.pin_usuarios where user_id = v_user for update;
  if p.user_id is not null then
    select last_sign_in_at > now() - interval '5 minutes' into v_login_recente from auth.users where id = v_user;
    if not coalesce(v_login_recente, false) and not coalesce(p.liberado_ate > now(), false) then
      raise exception 'Para trocar o PIN, digite o PIN atual antes ou use "Esqueci meu PIN".';
    end if;
  end if;
  insert into app.pin_usuarios (user_id, pin_hash, erros, bloqueado_ate, liberado_ate, atualizado_em)
  values (v_user, extensions.crypt(p_pin_novo, extensions.gen_salt('bf', 8)), 0, null, now() + interval '30 minutes', now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, erros = 0, bloqueado_ate = null,
        liberado_ate = excluded.liberado_ate, atualizado_em = now();
  perform app.registrar(p_org, 'acessos', case when p.user_id is null then 'pin_criar' else 'pin_trocar' end, null, null, null);
  return public.pin_situacao();
end $$;
revoke all on function public.pin_definir(uuid, text) from public, anon;
grant execute on function public.pin_definir(uuid, text) to authenticated;

/**
 * Confere o PIN digitado ao entrar na organização. Não lança erro no PIN errado (o contador de erros precisa ser
 * gravado): devolve ok=false e quantas tentativas restam. 5 erros seguidos travam por 15 minutos.
 */
create or replace function public.pin_conferir(p_org uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid := auth.uid();
  p app.pin_usuarios;
  v_max constant int := 5;
begin
  if v_user is null then raise exception 'Faça login.'; end if;
  if app.papel(p_org) is null then raise exception 'Organização não encontrada'; end if;
  select * into p from app.pin_usuarios where user_id = v_user for update;
  if p.user_id is null then raise exception 'Crie seu PIN antes de entrar.'; end if;
  if p.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'bloqueado_ate', p.bloqueado_ate, 'restantes', 0);
  end if;
  if coalesce(p_pin, '') ~ '^[0-9]{4}$' and extensions.crypt(p_pin, p.pin_hash) = p.pin_hash then
    update app.pin_usuarios set erros = 0, bloqueado_ate = null, liberado_ate = now() + interval '30 minutes'
     where user_id = v_user;
    perform app.registrar(p_org, 'acessos', 'pin_ok', null, null, null);
    return jsonb_build_object('ok', true, 'liberado_ate', now() + interval '30 minutes');
  end if;
  if p.erros + 1 >= v_max then
    update app.pin_usuarios set erros = 0, bloqueado_ate = now() + interval '15 minutes', liberado_ate = null
     where user_id = v_user;
    perform app.registrar(p_org, 'acessos', 'pin_travado', null, null, jsonb_build_object('erros', v_max));
    return jsonb_build_object('ok', false, 'bloqueado_ate', now() + interval '15 minutes', 'restantes', 0);
  end if;
  update app.pin_usuarios set erros = p.erros + 1 where user_id = v_user;
  perform app.registrar(p_org, 'acessos', 'pin_erro', null, null, jsonb_build_object('erros', p.erros + 1));
  return jsonb_build_object('ok', false, 'restantes', v_max - (p.erros + 1));
end $$;
revoke all on function public.pin_conferir(uuid, text) from public, anon;
grant execute on function public.pin_conferir(uuid, text) to authenticated;

/** Tranca o PIN na hora (botão "Trancar" e ao sair do HUB). */
create or replace function public.pin_trancar()
returns void language sql security definer set search_path = public as $$
  update app.pin_usuarios set liberado_ate = null where user_id = auth.uid()
$$;
revoke all on function public.pin_trancar() from public, anon;
grant execute on function public.pin_trancar() to authenticated;

/** Liga ou desliga o PIN de uma organização: só administrador, e desligar exige o PIN liberado. */
create or replace function public.org_definir_exige_pin(p_org uuid, p_ligado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if app.papel(p_org) is distinct from 'admin' then raise exception 'Só o administrador muda o PIN da organização.'; end if;
  if not p_ligado and app.org_exige_pin(p_org) and not app.pin_liberado() then
    raise exception 'Digite seu PIN de 4 números antes de desligar o PIN desta organização.';
  end if;
  perform set_config('app.exige_pin_pela_funcao', '1', true);
  update public.organizacoes set exige_pin = p_ligado where id = p_org;
  perform app.registrar(p_org, 'acessos', case when p_ligado then 'pin_ligar' else 'pin_desligar' end, null, null, null);
end $$;
revoke all on function public.org_definir_exige_pin(uuid, boolean) from public, anon;
grant execute on function public.org_definir_exige_pin(uuid, boolean) to authenticated;

/** A marcação exige_pin não muda por gravação direta na tabela (só pela função acima, ou sem login, no SQL Editor). */
create or replace function app.tg_org_exige_pin_fixo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.exige_pin is distinct from old.exige_pin and auth.uid() is not null
     and coalesce(current_setting('app.exige_pin_pela_funcao', true), '') <> '1' then
    raise exception 'O PIN da organização só muda pela tela de segurança.';
  end if;
  return new;
end $$;
drop trigger if exists org_exige_pin_fixo on public.organizacoes;
create trigger org_exige_pin_fixo before update of exige_pin on public.organizacoes
  for each row execute function app.tg_org_exige_pin_fixo();

-- ================================================================================ trava no banco
/**
 * Barra mudanças em pessoas e acessos das organizações com PIN quando o PIN da pessoa logada não está liberado.
 * Não barra: rotinas sem login (cron, funções com chave de serviço) nem a própria pessoa mexendo no próprio cadastro
 * (aceitar convite, primeiro acesso).
 */
create or replace function app.tg_exige_pin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_alvo uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    v_org := old.org_id;
  else
    v_org := new.org_id;
  end if;
  if tg_table_name in ('membros', 'hub_acessos') then
    v_alvo := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    if v_alvo = auth.uid() then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
  end if;
  if app.org_exige_pin(v_org) and not app.pin_liberado() then
    raise exception 'Para mexer nas pessoas e acessos desta organização, digite seu PIN de 4 números.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function app.tg_exige_pin() from public, anon, authenticated;

drop trigger if exists exige_pin on public.membros;
create trigger exige_pin before insert or update or delete on public.membros
  for each row execute function app.tg_exige_pin();
drop trigger if exists exige_pin on public.hub_acessos;
create trigger exige_pin before insert or update or delete on public.hub_acessos
  for each row execute function app.tg_exige_pin();
drop trigger if exists exige_pin on app.convites;
create trigger exige_pin before insert on app.convites
  for each row execute function app.tg_exige_pin();
drop trigger if exists exige_pin on public.pessoal_convites;
create trigger exige_pin before insert on public.pessoal_convites
  for each row execute function app.tg_exige_pin();
