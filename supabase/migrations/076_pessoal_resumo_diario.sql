-- 076 MDC · Pessoal: resumo diário das finanças da família, com aviso no sino e no celular (pedido do Edvaldo em 14/11/2026).
--
-- Como funciona:
--   1. Cada pessoa da família que vê as Finanças recebe, uma vez por dia, depois da hora escolhida (padrão 7h, no fuso
--      da família), um aviso no sino com o que está atrasado, o que vence hoje, o que vence nos próximos 7 dias e o que
--      entra; e o que foi pago e recebido ontem. Sem nada a contar, não avisa. Cada pessoa liga, desliga e escolhe a hora
--      (pessoal_resumo_salvar); a mesma divisão do Início (web/src/dominios/pessoal/resumo.ts).
--   2. Quem ligou "avisar no celular" e deixou o navegador avisar (Web Push) recebe o mesmo texto no celular: o banco
--      põe o aviso numa fila e a Função Edge pessoal-aviso entrega. As chaves do Web Push (VAPID) são geradas pela própria
--      função na primeira vez e guardadas no Vault: ninguém digita chave.
--   3. O agendador (pg_cron) roda a cada hora (minuto 3) e só chama a função quando há aviso na fila.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- ====================================================================================================== 1 preferências
create table if not exists public.pessoal_resumo_preferencias (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ligado boolean not null default true,
  hora smallint not null default 7 check (hora between 5 and 22),
  celular boolean not null default true,
  ultimo_dia date,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.pessoal_resumo_preferencias enable row level security;
drop policy if exists pessoal_resumo_pref_ler on public.pessoal_resumo_preferencias;
create policy pessoal_resumo_pref_ler on public.pessoal_resumo_preferencias for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.pessoal_resumo_preferencias from anon, authenticated;
grant select on public.pessoal_resumo_preferencias to authenticated;
comment on table public.pessoal_resumo_preferencias is
  'MDC · Pessoal: resumo diário de cada pessoa em cada família (ligado, hora no fuso da família, aviso no celular, último dia avisado). Muda só por pessoal_resumo_salvar.';

-- ===================================================================================================== 2 celular (Web Push)
create table if not exists public.pessoal_push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  aparelho text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz,
  falhas int not null default 0
);
alter table public.pessoal_push_inscricoes enable row level security;
revoke all on public.pessoal_push_inscricoes from anon, authenticated;
comment on table public.pessoal_push_inscricoes is
  'MDC · Pessoal: aparelhos que deixaram o navegador avisar (Web Push). Sem leitura pela tela; grava só por pessoal_push_inscrever/remover.';

create table if not exists app.pessoal_push_fila (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  texto text not null,
  link text not null default '/',
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas int not null default 0
);
create index if not exists pessoal_push_fila_pendente on app.pessoal_push_fila (criado_em) where enviado_em is null;
comment on table app.pessoal_push_fila is 'MDC · Pessoal: avisos para o celular esperando a Função pessoal-aviso (3 tentativas, depois desiste).';

-- =========================================================================================================== 3 o texto
/** Valor em reais no jeito brasileiro (1.234,56). */
create or replace function app.pessoal_brl(v numeric) returns text language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999G999G999G990D00'), ',.', '.,') $$;

/**
 * Resumo do dia de uma família: {tem, titulo, texto}. Mesma divisão do Início: a pagar atrasado, a pagar hoje, a pagar
 * nos próximos 7 dias, a receber até 7 dias (inclui atrasado); mais o que foi pago e recebido no dia anterior.
 */
create or replace function app.pessoal_resumo_texto(p_org uuid, p_hoje date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cli uuid;
  a_qt int; a_vl numeric; h_qt int; h_vl numeric; p_qt int; p_vl numeric; r_qt int; r_vl numeric;
  o_pago numeric; o_rec numeric;
  partes text[] := '{}';
begin
  select o.gestao_cliente_id into v_cli from public.organizacoes o where o.id = p_org;
  if v_cli is null then return jsonb_build_object('tem', false); end if;

  with abertos as (
    select t.tipo, t.vencimento, greatest(t.valor - t.valor_pago, 0) as falta
      from public.fin_titulos t
     where t.org_id = p_org and t.cliente_id = v_cli and t.situacao = 'aberto' and t.vencimento <= p_hoje + 7
  )
  select count(*) filter (where tipo = 'pagar' and vencimento < p_hoje and falta > 0),
         coalesce(sum(falta) filter (where tipo = 'pagar' and vencimento < p_hoje), 0),
         count(*) filter (where tipo = 'pagar' and vencimento = p_hoje and falta > 0),
         coalesce(sum(falta) filter (where tipo = 'pagar' and vencimento = p_hoje), 0),
         count(*) filter (where tipo = 'pagar' and vencimento > p_hoje and falta > 0),
         coalesce(sum(falta) filter (where tipo = 'pagar' and vencimento > p_hoje), 0),
         count(*) filter (where tipo = 'receber' and falta > 0),
         coalesce(sum(falta) filter (where tipo = 'receber'), 0)
    into a_qt, a_vl, h_qt, h_vl, p_qt, p_vl, r_qt, r_vl
    from abertos;

  select coalesce(sum(b.total) filter (where t.tipo = 'pagar'), 0), coalesce(sum(b.total) filter (where t.tipo = 'receber'), 0)
    into o_pago, o_rec
    from public.fin_baixas b join public.fin_titulos t on t.id = b.titulo_id
   where b.org_id = p_org and b.cliente_id = v_cli and b.data = p_hoje - 1 and not b.estornada;

  if h_qt > 0 then partes := partes || format('Vence%s hoje: %s conta%s (%s).', case when h_qt > 1 then 'm' else '' end,
                                               h_qt, case when h_qt > 1 then 's' else '' end, app.pessoal_brl(h_vl)); end if;
  if a_qt > 0 then partes := partes || format('Atrasada%s: %s (%s).', case when a_qt > 1 then 's' else '' end, a_qt, app.pessoal_brl(a_vl)); end if;
  if p_qt > 0 then partes := partes || format('Próximos 7 dias: %s a pagar (%s).', p_qt, app.pessoal_brl(p_vl)); end if;
  if r_qt > 0 then partes := partes || format('A receber: %s (%s).', r_qt, app.pessoal_brl(r_vl)); end if;
  if o_pago > 0 or o_rec > 0 then
    partes := partes || format('Ontem: entrou %s e saiu %s.', app.pessoal_brl(o_rec), app.pessoal_brl(o_pago));
  end if;

  if cardinality(partes) = 0 then return jsonb_build_object('tem', false); end if;
  return jsonb_build_object(
    'tem', true,
    'titulo', case when a_qt > 0 or h_qt > 0 then 'Finanças de hoje: tem conta para pagar' else 'Resumo das finanças de hoje' end,
    'texto', array_to_string(partes, ' '));
end $$;
comment on function app.pessoal_resumo_texto(uuid, date) is 'MDC · Pessoal: texto do resumo diário de uma família (mesma divisão do Início).';

-- ====================================================================================================== 4 a rodada
/**
 * Rodada do agendador: para cada família ativa e cada pessoa ativa que vê as Finanças, com o resumo ligado e já
 * passada a hora escolhida (no fuso da família), avisa uma vez por dia no sino e, se pediu, põe na fila do celular.
 * Devolve quantos avisos criou.
 */
create or replace function app.pessoal_resumo_rodar(p_agora timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_hoje date;
  v_hora int;
  v_res jsonb;
  n int := 0;
begin
  for r in
    select o.id as org_id, coalesce(o.fuso, 'America/Sao_Paulo') as fuso, m.user_id,
           coalesce(p.ligado, true) as ligado, coalesce(p.hora, 7) as hora, coalesce(p.celular, true) as celular, p.ultimo_dia
      from public.organizacoes o
      join public.membros m on m.org_id = o.id and m.ativo
      left join public.pessoal_resumo_preferencias p on p.org_id = o.id and p.user_id = m.user_id
     where o.tipo = 'pessoal' and o.ativo
       and (m.papel = 'admin' or exists (select 1 from public.hub_acessos a
                                          where a.org_id = o.id and a.user_id = m.user_id and a.app = 'financeiro'))
  loop
    v_hoje := (p_agora at time zone r.fuso)::date;
    v_hora := extract(hour from (p_agora at time zone r.fuso))::int;
    continue when not r.ligado or v_hora < r.hora or r.ultimo_dia is not distinct from v_hoje;

    v_res := app.pessoal_resumo_texto(r.org_id, v_hoje);
    insert into public.pessoal_resumo_preferencias (org_id, user_id, ultimo_dia)
    values (r.org_id, r.user_id, v_hoje)
    on conflict (org_id, user_id) do update set ultimo_dia = excluded.ultimo_dia;
    continue when not coalesce((v_res ->> 'tem')::boolean, false);

    insert into public.hub_notificacoes (org_id, user_id, app, titulo, texto, link)
    values (r.org_id, r.user_id, 'financeiro', v_res ->> 'titulo', v_res ->> 'texto', '/');
    if r.celular and exists (select 1 from public.pessoal_push_inscricoes i where i.user_id = r.user_id) then
      insert into app.pessoal_push_fila (user_id, titulo, texto, link) values (r.user_id, v_res ->> 'titulo', v_res ->> 'texto', '/');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
comment on function app.pessoal_resumo_rodar(timestamptz) is 'MDC · Pessoal: rodada do resumo diário (agendador, a cada hora). Uma vez por dia por pessoa e família.';
revoke all on function app.pessoal_resumo_rodar(timestamptz), app.pessoal_resumo_texto(uuid, date) from public, anon, authenticated;

-- ============================================================================================ 5 funções da tela (logado)
/** A pessoa ajusta o próprio resumo na família: ligado, hora (5 a 22) e aviso no celular. */
create or replace function public.pessoal_resumo_salvar(p_org uuid, p_ligado boolean, p_hora int, p_celular boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membros m join public.organizacoes o on o.id = m.org_id
                  where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and o.tipo = 'pessoal') then
    raise exception 'Família não encontrada';
  end if;
  if p_hora is null or p_hora not between 5 and 22 then raise exception 'Escolha um horário entre 5h e 22h'; end if;
  insert into public.pessoal_resumo_preferencias (org_id, user_id, ligado, hora, celular, atualizado_em)
  values (p_org, auth.uid(), coalesce(p_ligado, true), p_hora, coalesce(p_celular, true), now())
  on conflict (org_id, user_id) do update
    set ligado = excluded.ligado, hora = excluded.hora, celular = excluded.celular, atualizado_em = now();
end $$;
comment on function public.pessoal_resumo_salvar(uuid, boolean, int, boolean) is 'MDC · Pessoal: a pessoa liga/desliga o resumo diário, escolhe a hora e o aviso no celular.';

/** Guarda o aparelho que deixou o navegador avisar (o mesmo endereço passa para a conta logada). */
create or replace function public.pessoal_push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
  if (select count(*) from public.pessoal_push_inscricoes where user_id = auth.uid()) >= 10
     and not exists (select 1 from public.pessoal_push_inscricoes where endpoint = p_endpoint) then
    raise exception 'Você já tem 10 aparelhos com aviso; desligue o aviso em um deles';
  end if;
  insert into public.pessoal_push_inscricoes (user_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_aparelho, 120))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho, falhas = 0;
end $$;
comment on function public.pessoal_push_inscrever(text, text, text, text) is 'MDC · Pessoal: liga o aviso no celular deste aparelho (Web Push).';

/** Tira o aviso deste aparelho (só o dono). */
create or replace function public.pessoal_push_remover(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.pessoal_push_inscricoes where endpoint = p_endpoint and user_id = auth.uid() $$;
comment on function public.pessoal_push_remover(text) is 'MDC · Pessoal: desliga o aviso no celular deste aparelho.';

/** Quantos aparelhos da pessoa logada recebem aviso (para a tela mostrar). */
create or replace function public.pessoal_push_aparelhos()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.pessoal_push_inscricoes where user_id = auth.uid() $$;
comment on function public.pessoal_push_aparelhos() is 'MDC · Pessoal: quantos aparelhos da pessoa logada recebem aviso no celular.';

revoke all on function public.pessoal_resumo_salvar(uuid, boolean, int, boolean), public.pessoal_push_inscrever(text, text, text, text),
  public.pessoal_push_remover(text), public.pessoal_push_aparelhos() from public, anon;
grant execute on function public.pessoal_resumo_salvar(uuid, boolean, int, boolean), public.pessoal_push_inscrever(text, text, text, text),
  public.pessoal_push_remover(text), public.pessoal_push_aparelhos() to authenticated;

-- ======================================================================================= 6 funções só do servidor
-- token do agendador (gerado pelo banco, no Vault; a Função confere) — mesmo jeito da fatura-enviar (053)
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'pessoal_aviso_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pessoal_aviso_token',
      'Token do agendador para a Função pessoal-aviso (MDC · Pessoal, 076)');
  end if;
end $$;

create or replace function public.pessoal_aviso_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) between 32 and 200, false)
     and exists (select 1 from vault.decrypted_secrets
                  where name = 'pessoal_aviso_token'
                    and sha256(convert_to(decrypted_secret, 'UTF8')) = sha256(convert_to(p_token, 'UTF8'))) $$;

/** Chaves do Web Push: devolve as guardadas; na primeira vez grava as que a Função gerou. */
create or replace function public.pessoal_vapid(p_publica text default null, p_privada text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_pub text; v_pri text;
begin
  select decrypted_secret into v_pub from vault.decrypted_secrets where name = 'pessoal_vapid_publica';
  select decrypted_secret into v_pri from vault.decrypted_secrets where name = 'pessoal_vapid_privada';
  if (v_pub is null or v_pri is null) and p_publica is not null and p_privada is not null then
    perform vault.create_secret(p_publica, 'pessoal_vapid_publica', 'Chave pública do Web Push do MDC · Pessoal (076)');
    perform vault.create_secret(p_privada, 'pessoal_vapid_privada', 'Chave privada do Web Push do MDC · Pessoal (076)');
    return jsonb_build_object('publica', p_publica, 'privada', p_privada);
  end if;
  return jsonb_build_object('publica', v_pub, 'privada', v_pri);
end $$;

/** Reserva até 50 avisos da fila com os aparelhos de cada um (tentativa + 1). */
create or replace function public.pessoal_push_reservar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  with escolhidos as (
    select f.id from app.pessoal_push_fila f
     where f.enviado_em is null and f.tentativas < 3 and f.criado_em > now() - interval '1 day'
     order by f.criado_em limit 50 for update skip locked
  ), marcados as (
    update app.pessoal_push_fila f set tentativas = f.tentativas + 1 from escolhidos e where f.id = e.id
    returning f.id, f.user_id, f.titulo, f.texto, f.link
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'titulo', m.titulo, 'texto', m.texto, 'link', m.link,
           'aparelhos', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth)), '[]'::jsonb)
                           from public.pessoal_push_inscricoes i where i.user_id = m.user_id))), '[]'::jsonb)
    into v from marcados m;
  return v;
end $$;

/** Resultado da entrega: marca enviado e esquece os aparelhos que não existem mais (410/404). */
create or replace function public.pessoal_push_resultado(p_id bigint, p_ok boolean, p_mortos text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ok then update app.pessoal_push_fila set enviado_em = now() where id = p_id; end if;
  delete from public.pessoal_push_inscricoes where endpoint = any (coalesce(p_mortos, '{}'));
  update public.pessoal_push_inscricoes i set ultimo_envio = now(), falhas = 0
   where p_ok and i.user_id = (select user_id from app.pessoal_push_fila where id = p_id);
end $$;

revoke all on function public.pessoal_aviso_token_confere(text), public.pessoal_vapid(text, text), public.pessoal_push_reservar(),
  public.pessoal_push_resultado(bigint, boolean, text[]) from public, anon, authenticated;
grant execute on function public.pessoal_aviso_token_confere(text), public.pessoal_vapid(text, text), public.pessoal_push_reservar(),
  public.pessoal_push_resultado(bigint, boolean, text[]) to service_role;
comment on function public.pessoal_vapid(text, text) is 'MDC · Pessoal: chaves do Web Push no Vault (geradas pela Função na primeira vez). Só o servidor.';
comment on function public.pessoal_push_reservar() is 'MDC · Pessoal: reserva avisos da fila para a Função pessoal-aviso. Só o servidor.';
comment on function public.pessoal_push_resultado(bigint, boolean, text[]) is 'MDC · Pessoal: resultado da entrega no celular. Só o servidor.';
comment on function public.pessoal_aviso_token_confere(text) is 'MDC · Pessoal: confere o token do agendador. Só o servidor.';

-- ===================================================================================================== 7 agendamento
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pessoal-resumo') then perform cron.unschedule('pessoal-resumo'); end if;
    perform cron.schedule('pessoal-resumo', '3 * * * *', $cron$
      select app.pessoal_resumo_rodar();
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/pessoal-aviso',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'pessoal_aviso_token')),
        body := '{"acao":"rodar"}'::jsonb,
        timeout_milliseconds := 60000)
      where exists (select 1 from app.pessoal_push_fila where enviado_em is null and tentativas < 3);
    $cron$);
  end if;
end $$;
