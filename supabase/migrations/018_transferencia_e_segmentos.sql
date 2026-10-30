-- =====================================================================
--  018 · Transferência de trabalho entre pessoas + rotinas por segmento e grupo
--  1) Quem tem trabalho em aberto (tarefas, carteira de clientes, processos,
--     atendimentos, vencimentos, oportunidades) não pode ser inativado nem
--     excluído; o administrador/gestor transfere tudo para outra pessoa antes.
--  2) Cliente ganha segmento (ramo) e grupos (etiquetas livres: grupo econômico,
--     "com empregados", "importador"...). Modelo de rotina pode filtrar por
--     segmentos e grupos, além dos regimes que já existiam (tudo opcional).
-- =====================================================================

-- ---------------------------------------------------------------- 1) pendências
create or replace function app.pendencias_membro(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tarefas',       (select count(*) from tarefas where org_id = p_org and responsavel_id = p_user and status in ('a_fazer','em_andamento','aguardando')),
    'carteira',      (select count(*) from cliente_responsaveis where org_id = p_org and user_id = p_user),
    'processos',     (select count(*) from soc_processos where org_id = p_org and responsavel_id = p_user and status = 'aberto'),
    'fases',         (select count(*) from soc_fases where org_id = p_org and responsavel_id = p_user and status not in ('concluida','dispensada')),
    'atendimentos',  (select count(*) from portal_conversas where org_id = p_org and responsavel_id = p_user and status <> 'resolvido'),
    'vencimentos',   (select count(*) from venc_itens where org_id = p_org and responsavel_id = p_user and status = 'ativo'),
    'oportunidades', (select count(*) from crm_oportunidades where org_id = p_org and responsavel_id = p_user and etapa not in ('ganho','perdido'))
  )
$$;

create or replace function public.hub_pendencias_membro(p_org uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.eh_gestor(p_org) then raise exception 'Apenas administradores e gestores'; end if;
  return app.pendencias_membro(p_org, p_user);
end $$;
revoke all on function public.hub_pendencias_membro(uuid, uuid) from public, anon;
grant execute on function public.hub_pendencias_membro(uuid, uuid) to authenticated;

-- transfere todo o trabalho em aberto de uma pessoa para outra (ativa, da mesma organização)
create or replace function public.hub_transferir_trabalho(p_org uuid, p_de uuid, p_para uuid, p_carteira boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; n int;
begin
  if not app.eh_gestor(p_org) then raise exception 'Apenas administradores e gestores transferem trabalho'; end if;
  if p_de = p_para then raise exception 'Escolha outra pessoa para receber'; end if;
  if not exists (select 1 from membros where org_id = p_org and user_id = p_para and ativo and papel <> 'tv') then
    raise exception 'Quem recebe precisa estar ativo na equipe';
  end if;

  update tarefas set responsavel_id = p_para
   where org_id = p_org and responsavel_id = p_de and status in ('a_fazer','em_andamento','aguardando');
  get diagnostics n = row_count; v := v || jsonb_build_object('tarefas', n);

  if p_carteira then
    update cliente_responsaveis set user_id = p_para where org_id = p_org and user_id = p_de;
    get diagnostics n = row_count; v := v || jsonb_build_object('carteira', n);
  end if;

  update soc_processos set responsavel_id = p_para where org_id = p_org and responsavel_id = p_de and status = 'aberto';
  get diagnostics n = row_count; v := v || jsonb_build_object('processos', n);
  update soc_fases set responsavel_id = p_para where org_id = p_org and responsavel_id = p_de and status not in ('concluida','dispensada');
  get diagnostics n = row_count; v := v || jsonb_build_object('fases', n);
  update portal_conversas set responsavel_id = p_para where org_id = p_org and responsavel_id = p_de and status <> 'resolvido';
  get diagnostics n = row_count; v := v || jsonb_build_object('atendimentos', n);
  update venc_itens set responsavel_id = p_para where org_id = p_org and responsavel_id = p_de and status = 'ativo';
  get diagnostics n = row_count; v := v || jsonb_build_object('vencimentos', n);
  update crm_oportunidades set responsavel_id = p_para where org_id = p_org and responsavel_id = p_de and etapa not in ('ganho','perdido');
  get diagnostics n = row_count; v := v || jsonb_build_object('oportunidades', n);

  perform app.registrar(p_org, 'hub', 'transferir_trabalho', p_de::text, to_jsonb(p_de), v || jsonb_build_object('para', p_para));
  perform app.notificar(p_org, p_para, 'tarefas', 'Você recebeu trabalho transferido',
                        format('%s tarefa(s) e demais itens em aberto passaram para você.', v ->> 'tarefas'), '/tarefas');
  return v;
end $$;
revoke all on function public.hub_transferir_trabalho(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.hub_transferir_trabalho(uuid, uuid, uuid, boolean) to authenticated;

-- trava: não inativa nem exclui quem ainda tem trabalho em aberto
create or replace function app.tg_membro_sem_pendencias()
returns trigger language plpgsql security definer set search_path = public as $$
declare p jsonb; total int;
begin
  if tg_op = 'UPDATE' and not (old.ativo and not new.ativo) then return new; end if;
  p := app.pendencias_membro(old.org_id, old.user_id);
  select coalesce(sum(value::int), 0) into total from jsonb_each_text(p);
  if total > 0 then
    raise exception 'Transfira o trabalho em aberto de % antes de inativar (tarefas: %, carteira de clientes: %, processos: %, atendimentos: %, vencimentos: %, oportunidades: %)',
      old.nome, p ->> 'tarefas', p ->> 'carteira', (p ->> 'processos')::int + (p ->> 'fases')::int, p ->> 'atendimentos', p ->> 'vencimentos', p ->> 'oportunidades';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists membros_sem_pendencias on public.membros;
create trigger membros_sem_pendencias before update of ativo or delete on public.membros
  for each row execute function app.tg_membro_sem_pendencias();

-- ---------------------------------------------------------------- 2) segmento e grupos
alter table public.clientes add column if not exists segmento text
  check (segmento in ('comercio','industria','servicos','construcao','agro','saude','educacao','transporte','holding','terceiro_setor','outro'));
alter table public.clientes add column if not exists grupos text[] not null default '{}';
create index if not exists clientes_grupos on public.clientes using gin (grupos);

alter table public.modelos_recorrentes add column if not exists segmentos text[];   -- nulo = todos
alter table public.modelos_recorrentes add column if not exists grupos text[];      -- nulo = todos; vale se o cliente tiver ALGUM dos grupos

create or replace function app.gerar_tarefas_recorrentes(p_competencia date default null, p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_comp date;
  v_qtd  int := 0;
  n      int;
  mo     public.modelos_recorrentes;
begin
  for mo in
    select m.* from public.modelos_recorrentes m
    join public.organizacoes o on o.id = m.org_id and o.ativo
    where m.ativo and (p_org is null or m.org_id = p_org)
  loop
    v_comp := date_trunc('month', coalesce(p_competencia,
                (app.hoje(mo.org_id) - interval '1 month')::date))::date;
    if mo.meses is not null and not (extract(month from v_comp)::int = any (mo.meses)) then
      continue;
    end if;

    if mo.por_cliente then
      insert into public.tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id,
                                  criado_por, prioridade, prazo, competencia, modelo_id)
      select mo.org_id,
             mo.titulo || ' — ' || to_char(v_comp, 'MM/YYYY'),
             mo.descricao, c.id, mo.setor_id, cr.user_id, null, mo.prioridade,
             app.vencimento(mo, v_comp), v_comp, mo.id
      from public.clientes c
      left join public.cliente_responsaveis cr on cr.cliente_id = c.id and cr.setor_id = mo.setor_id
      where c.org_id = mo.org_id
        and (c.ativo or (c.inativo_em is not null and v_comp <= date_trunc('month', c.inativo_em)::date))
        and (c.cliente_desde is null or v_comp >= date_trunc('month', c.cliente_desde)::date)
        and (mo.regimes is null or c.regime = any (mo.regimes))
        and (mo.segmentos is null or c.segmento = any (mo.segmentos))
        and (mo.grupos is null or c.grupos && mo.grupos)
      on conflict do nothing;
    else
      insert into public.tarefas (org_id, titulo, descricao, setor_id, criado_por, prioridade,
                                  prazo, competencia, modelo_id)
      values (mo.org_id, mo.titulo || ' — ' || to_char(v_comp, 'MM/YYYY'), mo.descricao, mo.setor_id,
              null, mo.prioridade, app.vencimento(mo, v_comp), v_comp, mo.id)
      on conflict do nothing;
    end if;
    get diagnostics n = row_count;
    v_qtd := v_qtd + n;
  end loop;
  return v_qtd;
end $$;
revoke execute on function app.gerar_tarefas_recorrentes(date, uuid) from public, anon, authenticated;

-- prévia: quantos clientes um modelo pegaria com os filtros escolhidos (para a tela)
create or replace function public.prever_rotina(p_org uuid, p_regimes text[], p_segmentos text[], p_grupos text[])
returns int language sql stable security definer set search_path = public as $$
  select case when app.papel(p_org) is null then 0 else (
    select count(*)::int from clientes c
     where c.org_id = p_org and c.ativo
       and (p_regimes is null or c.regime = any (p_regimes))
       and (p_segmentos is null or c.segmento = any (p_segmentos))
       and (p_grupos is null or c.grupos && p_grupos)) end
$$;
revoke all on function public.prever_rotina(uuid, text[], text[], text[]) from public, anon;
grant execute on function public.prever_rotina(uuid, text[], text[], text[]) to authenticated;
