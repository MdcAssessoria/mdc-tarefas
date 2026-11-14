-- 082 Lançar falando no MDC · Pessoal (pedido do Edvaldo, 14/11/2026).
--   A família fala "paguei a luz 230 ontem" e o app monta o lançamento; a pessoa confere e salva (nada é gravado sozinho).
--   O próprio app entende as frases simples. As que ele não entende vão para a IA pela Função Edge pessoal-voz, que
--   antes pergunta ao banco se pode (pessoal_voz_pode): só quem lança no Financeiro da família, e com limite de uso
--   (30 por hora e 150 por dia por pessoa) para a conta da IA não disparar.
--   Guarda só quem usou e quando (para o limite); nem o áudio nem o texto ficam no banco. Registros com mais de 2 dias saem.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

create table if not exists app.pessoal_voz_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  org_id uuid not null,
  em timestamptz not null default now()
);
create index if not exists pessoal_voz_uso_user on app.pessoal_voz_uso (user_id, em);
alter table app.pessoal_voz_uso enable row level security;
revoke all on app.pessoal_voz_uso from public, anon, authenticated;
comment on table app.pessoal_voz_uso is 'Quem pediu ajuda da IA para entender uma fala e quando (só para o limite de uso; 082).';

/** Pode mandar uma fala para a IA? Só quem lança no Financeiro da família, dentro do limite. Já conta o uso. */
create or replace function public.pessoal_voz_pode(p_org uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Entre na sua conta'; end if;
  if not app.org_pessoal(p_org) then raise exception 'Família não encontrada'; end if;
  if not app.hub_pode(p_org, 'financeiro', 'operar') then
    raise exception 'Você não tem permissão para lançar nas finanças desta família';
  end if;
  perform pg_advisory_xact_lock(hashtext('pessoal_voz:' || v_user::text));
  if (select count(*) from app.pessoal_voz_uso where user_id = v_user and em > now() - interval '1 hour') >= 30 then
    return 'limite_hora';
  end if;
  if (select count(*) from app.pessoal_voz_uso where user_id = v_user and em > now() - interval '1 day') >= 150 then
    return 'limite_dia';
  end if;
  insert into app.pessoal_voz_uso (user_id, org_id) values (v_user, p_org);
  delete from app.pessoal_voz_uso where em < now() - interval '2 days';
  return 'ok';
end $$;
revoke all on function public.pessoal_voz_pode(uuid) from public, anon;
grant execute on function public.pessoal_voz_pode(uuid) to authenticated;
comment on function public.pessoal_voz_pode(uuid) is
  'Lançar falando: confere se a pessoa lança no Financeiro da família e o limite da IA (30/hora, 150/dia). Devolve ok, limite_hora ou limite_dia (082).';
