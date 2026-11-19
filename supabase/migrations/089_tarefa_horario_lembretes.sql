-- 089 Tarefas: horário e lembretes (pedido do Edvaldo em 19/11/2026).
--
-- "Ao criar uma tarefa, se existisse a opção de adicionar um horário, e emitisse uma notificação 10 min antes (como
-- lembrança) e no horário do compromisso, seria útil. Para quando existe uma reunião ou uma tarefa agendada."
--
-- Como funciona:
--   1. tarefas.hora (opcional, só com prazo): o compromisso é o dia do prazo + a hora, no fuso da organização.
--   2. A rodada app.tarefa_lembretes_rodar (agendador, a cada minuto) avisa o responsável (sem responsável: quem criou)
--      duas vezes: "Em 10 minutos" (de 10 min antes até a hora) e "Agora" (da hora até 30 min depois). Avisa no sino
--      (hub_notificacoes) e, se a pessoa ligou o aviso no aparelho, no celular/computador (Web Push, a mesma fila e a
--      mesma Função pessoal-aviso do resumo diário da 076). Tarefa concluída ou cancelada não avisa.
--   3. app.tarefa_lembretes guarda o que já foi avisado (tarefa, tipo, momento): mudar a hora ou o dia gera momento
--      novo e avisa de novo; a tarefa não é tocada (nada de "atualizado em" nem histórico por causa do aviso).
--   4. Aviso de lembrete vale só 15 minutos (pessoal_push_fila.validade_seg): celular desligado não recebe
--      "Em 10 minutos" horas depois.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- =========================================================================================================== 1 o horário
alter table public.tarefas add column if not exists hora time;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tarefas_hora_com_prazo') then
    alter table public.tarefas add constraint tarefas_hora_com_prazo check (hora is null or prazo is not null);
  end if;
end $$;
comment on column public.tarefas.hora is 'Horário do compromisso (reunião, tarefa agendada) no dia do prazo, no fuso da organização. Com hora, o responsável recebe lembrete 10 min antes e na hora (089).';
create index if not exists tarefas_com_hora on public.tarefas (prazo) where hora is not null;

-- ================================================================================================= 2 o que já avisou
create table if not exists app.tarefa_lembretes (
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  tipo text not null check (tipo in ('antes', 'hora')),
  momento timestamptz not null,
  user_id uuid references auth.users(id) on delete set null,
  avisado_em timestamptz not null default now(),
  primary key (tarefa_id, tipo, momento)
);
comment on table app.tarefa_lembretes is 'Tarefas: lembretes já dados (10 min antes e na hora), por momento do compromisso. Só a rodada grava (089).';

-- validade do aviso no celular (o resumo diário continua 6 h; o lembrete, 15 min)
alter table app.pessoal_push_fila add column if not exists validade_seg int not null default 21600
  check (validade_seg between 60 and 86400);

-- ============================================================================================================ 3 a rodada
/**
 * Rodada do agendador (a cada minuto): para cada tarefa aberta com hora, avisa "Em N minutos" de 10 min antes até a
 * hora e "Agora" da hora até 30 min depois, uma vez cada por momento. Devolve quantos avisos criou.
 */
create or replace function app.tarefa_lembretes_rodar(p_agora timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_tipo text;
  v_quem uuid;
  v_titulo text;
  v_texto text;
  v_min int;
  n int := 0;
begin
  for r in
    select x.* from (
      select t.id, t.org_id, t.titulo, coalesce(t.responsavel_id, t.criado_por) as quem, t.hora,
             ((t.prazo + t.hora) at time zone coalesce(o.fuso, 'America/Sao_Paulo')) as momento,
             c.razao_social as cliente
        from public.tarefas t
        join public.organizacoes o on o.id = t.org_id and o.ativo
        left join public.clientes c on c.id = t.cliente_id
       where t.hora is not null
         and t.prazo between (p_agora at time zone 'UTC')::date - 1 and (p_agora at time zone 'UTC')::date + 1
         and t.status not in ('concluida', 'cancelada')
    ) x
     where p_agora >= x.momento - interval '10 minutes' and p_agora < x.momento + interval '30 minutes'
  loop
    v_tipo := case when p_agora < r.momento then 'antes' else 'hora' end;
    v_quem := r.quem;
    continue when v_quem is null
      or not exists (select 1 from public.membros m where m.org_id = r.org_id and m.user_id = v_quem and m.ativo);
    -- já avisou este tipo (ou, na hora, já passou da hora sem ter dado o "antes": dá só o "Agora")
    continue when exists (select 1 from app.tarefa_lembretes l
                           where l.tarefa_id = r.id and l.momento = r.momento and (l.tipo = v_tipo or l.tipo = 'hora'));

    insert into app.tarefa_lembretes (tarefa_id, tipo, momento, user_id) values (r.id, v_tipo, r.momento, v_quem)
    on conflict do nothing;
    if not found then continue; end if;

    if v_tipo = 'antes' then
      v_min := greatest(1, ceil(extract(epoch from (r.momento - p_agora)) / 60.0)::int);
      v_titulo := format('Em %s minuto%s: %s', v_min, case when v_min > 1 then 's' else '' end, r.titulo);
    else
      v_titulo := 'Agora: ' || r.titulo;
    end if;
    v_texto := 'Às ' || to_char(r.hora, 'HH24:MI') || coalesce(' · ' || r.cliente, '');

    insert into public.hub_notificacoes (org_id, user_id, app, titulo, texto, link)
    values (r.org_id, v_quem, 'tarefas', left(v_titulo, 200), v_texto, '/tarefas?tarefa=' || r.id);
    if exists (select 1 from public.pessoal_push_inscricoes i where i.user_id = v_quem) then
      insert into app.pessoal_push_fila (user_id, titulo, texto, link, validade_seg)
      values (v_quem, left(v_titulo, 200), v_texto, '/tarefas?tarefa=' || r.id, 900);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
comment on function app.tarefa_lembretes_rodar(timestamptz) is 'Tarefas: lembretes de compromisso (10 min antes e na hora) no sino e no aparelho. Agendador, a cada minuto (089).';
revoke all on function app.tarefa_lembretes_rodar(timestamptz) from public, anon, authenticated;

-- ======================================================== 4 a fila respeita a validade (mesma função da 076, com o TTL)
/** Reserva até 50 avisos da fila ainda válidos com os aparelhos de cada um (tentativa + 1) e o tempo de vida. */
create or replace function public.pessoal_push_reservar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  with escolhidos as (
    select f.id from app.pessoal_push_fila f
     where f.enviado_em is null and f.tentativas < 3 and f.criado_em > now() - interval '1 day'
       and f.criado_em > now() - make_interval(secs => f.validade_seg)
     order by f.criado_em limit 50 for update skip locked
  ), marcados as (
    update app.pessoal_push_fila f set tentativas = f.tentativas + 1 from escolhidos e where f.id = e.id
    returning f.id, f.user_id, f.titulo, f.texto, f.link, f.validade_seg, f.criado_em
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'titulo', m.titulo, 'texto', m.texto, 'link', m.link,
           'ttl', greatest(60, m.validade_seg - extract(epoch from (now() - m.criado_em))::int),
           'aparelhos', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth)), '[]'::jsonb)
                           from public.pessoal_push_inscricoes i where i.user_id = m.user_id))), '[]'::jsonb)
    into v from marcados m;
  return v;
end $$;
comment on function public.pessoal_push_reservar() is 'Avisos no aparelho (076/089): reserva os avisos válidos da fila para a Função pessoal-aviso. Só o servidor.';
revoke all on function public.pessoal_push_reservar() from public, anon, authenticated;
grant execute on function public.pessoal_push_reservar() to service_role;

-- ===================================================================================================== 5 agendamento
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'tarefas-lembretes') then perform cron.unschedule('tarefas-lembretes'); end if;
    perform cron.schedule('tarefas-lembretes', '* * * * *', $cron$
      select app.tarefa_lembretes_rodar();
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/pessoal-aviso',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'pessoal_aviso_token')),
        body := '{"acao":"rodar"}'::jsonb,
        timeout_milliseconds := 30000)
      where exists (select 1 from app.pessoal_push_fila
                     where enviado_em is null and tentativas < 3 and validade_seg < 21600
                       and criado_em > now() - make_interval(secs => validade_seg));
    $cron$);
  end if;
end $$;
