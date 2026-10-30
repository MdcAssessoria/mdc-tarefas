-- =====================================================================
--  010 · Portal do Cliente
--  Usuário do cliente (não é membro da organização: não enxerga nada
--  da MDC além do que as funções e regras abaixo entregam), rotinas do
--  mês vindas do Tarefas, chat com a MDC, balancete publicado com DRE,
--  índices e fragilidades, e parecer técnico assinado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quem do cliente acessa o quê
-- permissões: demonstrativos, rotinas, chat, documentos, folha, societario
-- ---------------------------------------------------------------------
create table if not exists public.portal_usuarios (
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nome        text not null,
  email       text not null,
  permissoes  text[] not null default array['demonstrativos','rotinas','chat','documentos','societario'],
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  primary key (user_id, cliente_id)
);
create index if not exists portal_usuarios_cli on public.portal_usuarios (cliente_id);

create table if not exists public.portal_convites (
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  email       text not null,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nome        text,
  permissoes  text[] not null default array['demonstrativos','rotinas','chat','documentos','societario'],
  criado_em   timestamptz not null default now(),
  primary key (email, cliente_id)
);

alter table public.portal_usuarios enable row level security;
alter table public.portal_convites enable row level security;

-- cliente vê os próprios vínculos; equipe com Atendimento (ver) vê os da organização
create policy portal_usuarios_select on public.portal_usuarios for select to authenticated
  using (user_id = auth.uid() or app.hub_pode(org_id, 'atendimento', 'ver') or app.eh_gestor(org_id));
create policy portal_usuarios_write on public.portal_usuarios for all to authenticated
  using (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'))
  with check (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));
create policy portal_convites_all on public.portal_convites for all to authenticated
  using (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'))
  with check (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));

-- regra do cliente: vínculo ativo, permissão e cliente ativo (ou ainda dentro do mês de saída)
create or replace function app.portal_pode(p_cliente uuid, p_perm text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from portal_usuarios u join clientes c on c.id = u.cliente_id
     where u.user_id = auth.uid() and u.cliente_id = p_cliente and u.ativo
       and (p_perm is null or p_perm = any (u.permissoes))
       and (c.ativo or (c.inativo_em is not null and c.inativo_em >= date_trunc('month', app.hoje(c.org_id))::date)))
$$;

-- equipe da organização dona do cliente
create or replace function app.equipe_do_cliente(p_cliente uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.hub_pode(org_id, p_app, p_min) from clientes where id = p_cliente), false)
$$;

create or replace function public.portal_minhas_empresas()
returns table (cliente_id uuid, razao_social text, nome_fantasia text, cnpj text, regime text, uf text,
               org_id uuid, org_nome text, cor_primaria text, cor_destaque text, logo_url text, permissoes text[])
language sql stable security definer set search_path = public as $$
  select c.id, c.razao_social, c.nome_fantasia, c.cnpj, c.regime, c.uf,
         o.id, o.nome, o.cor_primaria, o.cor_destaque, o.logo_url, u.permissoes
    from portal_usuarios u
    join clientes c on c.id = u.cliente_id
    join organizacoes o on o.id = c.org_id
   where u.user_id = auth.uid() and u.ativo and app.portal_pode(c.id)
   order by coalesce(c.nome_fantasia, c.razao_social)
$$;

-- convite: pessoa com conta ganha acesso na hora; sem conta, ao se cadastrar com o mesmo e-mail
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
  if exists (select 1 from membros m join auth.users u on u.id = m.user_id where m.org_id = v_org and lower(u.email) = v_email) then
    raise exception 'Esse e-mail é de alguém da equipe; use outro e-mail para o acesso de cliente';
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

create or replace function app.aplicar_convites_portal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.portal_usuarios (org_id, user_id, cliente_id, nome, email, permissoes)
    select c.org_id, new.id, c.cliente_id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.permissoes
      from public.portal_convites c where c.email = lower(new.email)
    on conflict do nothing;
    delete from public.portal_convites where email = lower(new.email);
  exception when others then
    raise warning 'aplicar_convites_portal: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists aplicar_convites_portal_ao_cadastrar on auth.users;
create trigger aplicar_convites_portal_ao_cadastrar after insert on auth.users
  for each row execute function app.aplicar_convites_portal();

-- ---------------------------------------------------------------------
-- Rotinas do mês (vindas do MDC Tarefas)
-- ---------------------------------------------------------------------
alter table public.modelos_recorrentes add column if not exists visivel_cliente boolean not null default true;
alter table public.tarefas add column if not exists visivel_cliente boolean;          -- null = segue o modelo
alter table public.tarefas add column if not exists pendencia_cliente text;           -- o que o cliente precisa enviar

create or replace function public.portal_rotinas(p_cliente uuid, p_competencia date)
returns table (tarefa_id uuid, titulo text, situacao text, prazo date, concluida_em timestamptz,
               pendencia text, setor text, arquivos jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_comp date := date_trunc('month', p_competencia)::date;
begin
  if not (app.portal_pode(p_cliente, 'rotinas') or app.equipe_do_cliente(p_cliente, 'tarefas', 'ver')) then
    raise exception 'Sem acesso às rotinas desta empresa';
  end if;
  return query
  select t.id, t.titulo,
         case when t.status = 'concluida' then 'entregue'
              when t.status = 'aguardando' and t.pendencia_cliente is not null then 'aguardando_voce'
              else 'em_andamento' end,
         t.prazo, t.concluida_em, t.pendencia_cliente, s.nome,
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'caminho', a.caminho) order by a.enviado_em)
                     from hub_arquivos a where a.ref_id = t.id and a.visivel_cliente), '[]'::jsonb)
    from tarefas t
    left join modelos_recorrentes m on m.id = t.modelo_id
    left join setores s on s.id = t.setor_id
   where t.cliente_id = p_cliente
     and t.status <> 'cancelada'
     and coalesce(t.visivel_cliente, m.visivel_cliente, false)
     and (t.competencia = v_comp
          or (t.competencia is null and t.prazo >= v_comp and t.prazo < (v_comp + interval '1 month')))
   order by (t.status = 'concluida'), t.prazo nulls last, t.titulo;
end $$;

create or replace function public.portal_processos(p_cliente uuid)
returns table (processo_id uuid, numero int, tipo text, descricao text, status text, fase text, fase_status text,
               pedido_em date, previsao_em date, concluido_em date, eventos jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.portal_pode(p_cliente, 'societario') or app.equipe_do_cliente(p_cliente, 'societario', 'ver')) then
    raise exception 'Sem acesso aos processos desta empresa';
  end if;
  return query
  select p.id, p.numero, t.nome, p.descricao, p.status, f.nome, f.status, p.pedido_em, p.previsao_em, p.concluido_em,
         coalesce((select jsonb_agg(jsonb_build_object('em', e.em, 'texto', e.texto) order by e.em desc)
                     from soc_eventos e where e.processo_id = p.id and e.visivel_cliente), '[]'::jsonb)
    from soc_processos p
    join soc_tipos t on t.id = p.tipo_id
    left join soc_fases f on f.processo_id = p.id and f.ordem = p.fase_atual
   where p.cliente_id = p_cliente and p.visivel_cliente and p.status <> 'cancelado'
   order by (p.status = 'concluido'), p.pedido_em desc;
end $$;

-- ---------------------------------------------------------------------
-- Chat com a MDC (atendimentos)
-- ---------------------------------------------------------------------
create table if not exists public.portal_conversas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  assunto         text not null check (assunto in ('duvida','admissao_demissao','nota_fiscal','alteracao_contratual','documento','outro')),
  titulo          text not null,
  status          text not null default 'novo' check (status in ('novo','em_atendimento','aguardando_cliente','resolvido')),
  setor_id        uuid references public.setores(id) on delete set null,
  responsavel_id  uuid references auth.users(id) on delete set null,
  aberto_por      uuid references auth.users(id) on delete set null,
  prazo_resposta  timestamptz,
  respondida_em   timestamptz,
  resolvida_em    timestamptz,
  avaliacao       int check (avaliacao between 1 and 5),
  tarefa_id       uuid references public.tarefas(id) on delete set null,
  processo_id     uuid references public.soc_processos(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists portal_conversas_org on public.portal_conversas (org_id, status, atualizado_em desc);
create index if not exists portal_conversas_cli on public.portal_conversas (cliente_id, atualizado_em desc);

create table if not exists public.portal_mensagens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id  uuid not null references public.portal_conversas(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  autor_nome   text,
  autor_tipo   text not null default 'cliente' check (autor_tipo in ('cliente','equipe','sistema')),
  texto        text not null default '',
  anexo_id     uuid references public.hub_arquivos(id) on delete set null,
  interna      boolean not null default false,    -- nota da equipe, o cliente não vê
  criado_em    timestamptz not null default now()
);
create index if not exists portal_mensagens_conv on public.portal_mensagens (conversa_id, criado_em);

alter table public.portal_conversas enable row level security;
alter table public.portal_mensagens enable row level security;

create policy portal_conv_select on public.portal_conversas for select to authenticated
  using (app.hub_pode(org_id, 'atendimento', 'ver') or app.portal_pode(cliente_id, 'chat'));
create policy portal_conv_update on public.portal_conversas for update to authenticated
  using (app.hub_pode(org_id, 'atendimento', 'operar') or app.portal_pode(cliente_id, 'chat'))
  with check (app.hub_pode(org_id, 'atendimento', 'operar') or app.portal_pode(cliente_id, 'chat'));

create policy portal_msg_select on public.portal_mensagens for select to authenticated
  using (app.hub_pode(org_id, 'atendimento', 'ver')
         or (not interna and app.portal_pode((select cliente_id from portal_conversas c where c.id = conversa_id), 'chat')));
create policy portal_msg_insert on public.portal_mensagens for insert to authenticated
  with check (app.hub_pode(org_id, 'atendimento', 'operar')
              or (not interna and app.portal_pode((select cliente_id from portal_conversas c where c.id = conversa_id), 'chat')));

-- cliente só pode mudar a avaliação e reabrir; a equipe muda o resto
create or replace function app.tg_conversa_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.org_id := old.org_id; new.cliente_id := old.cliente_id; new.criado_em := old.criado_em;
  if not app.hub_pode(old.org_id, 'atendimento', 'operar') then
    new.assunto := old.assunto; new.titulo := old.titulo; new.setor_id := old.setor_id;
    new.responsavel_id := old.responsavel_id; new.prazo_resposta := old.prazo_resposta;
    new.tarefa_id := old.tarefa_id; new.processo_id := old.processo_id;
    if new.status is distinct from old.status and new.status not in ('resolvido', 'em_atendimento') then
      new.status := old.status;
    end if;
  end if;
  if new.status = 'resolvido' and old.status <> 'resolvido' then new.resolvida_em := now(); end if;
  if new.status <> 'resolvido' then new.resolvida_em := null; end if;
  return new;
end $$;
drop trigger if exists portal_conversas_antes on public.portal_conversas;
create trigger portal_conversas_antes before update on public.portal_conversas
  for each row execute function app.tg_conversa_antes();

-- cada mensagem: autor e tipo pelo login, status da conversa, sino para o outro lado
create or replace function app.tg_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare c portal_conversas; v_equipe boolean; v_nome text; u record; v_cli text;
begin
  select * into c from portal_conversas where id = new.conversa_id;
  new.org_id := c.org_id;
  -- mensagem de sistema só nasce dentro das funções do banco; o resto é identificado pelo login
  if not (new.autor_tipo = 'sistema' and current_user <> 'authenticated') then
    new.autor_id := auth.uid();
    v_equipe := exists (select 1 from membros where org_id = c.org_id and user_id = auth.uid() and ativo);
    new.autor_tipo := case when v_equipe then 'equipe' else 'cliente' end;
    if not v_equipe then new.interna := false; end if;
    select coalesce((select nome from membros where org_id = c.org_id and user_id = auth.uid()),
                    (select nome from portal_usuarios where user_id = auth.uid() and cliente_id = c.cliente_id))
      into v_nome;
    new.autor_nome := coalesce(v_nome, new.autor_nome);
  end if;
  new.criado_em := now();
  select coalesce(nome_fantasia, razao_social) into v_cli from clientes where id = c.cliente_id;

  if new.autor_tipo = 'cliente' then
    update portal_conversas set atualizado_em = now(),
           status = case when status in ('resolvido', 'aguardando_cliente') then 'em_atendimento' else status end
     where id = c.id;
    if c.responsavel_id is not null then
      perform app.notificar(c.org_id, c.responsavel_id, 'atendimento', 'Nova mensagem de ' || v_cli,
                            left(new.texto, 140), '/atendimento?c=' || c.id);
    else
      for u in select user_id from membros where org_id = c.org_id and ativo and papel in ('admin', 'gestor') loop
        perform app.notificar(c.org_id, u.user_id, 'atendimento', 'Nova mensagem de ' || v_cli,
                              left(new.texto, 140), '/atendimento?c=' || c.id);
      end loop;
    end if;
  elsif new.autor_tipo = 'equipe' and not new.interna then
    update portal_conversas set atualizado_em = now(), respondida_em = coalesce(respondida_em, now()),
           status = case when status = 'novo' then 'em_atendimento' else status end
     where id = c.id;
  end if;
  return new;
end $$;
drop trigger if exists portal_mensagens_antes on public.portal_mensagens;
create trigger portal_mensagens_antes before insert on public.portal_mensagens
  for each row execute function app.tg_mensagem();

-- abertura pelo cliente (ou pela equipe em nome dele): roteia para o responsável do setor
create or replace function public.portal_abrir_conversa(p_cliente uuid, p_assunto text, p_titulo text, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_setor uuid; v_resp uuid; v_id uuid; v_nome_setor text;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if not (app.portal_pode(p_cliente, 'chat') or app.hub_pode(v_org, 'atendimento', 'operar')) then
    raise exception 'Sem acesso ao chat desta empresa';
  end if;
  v_nome_setor := case p_assunto
    when 'admissao_demissao' then 'pessoal' when 'nota_fiscal' then 'fiscal'
    when 'alteracao_contratual' then 'societ' when 'duvida' then 'cont' when 'documento' then 'cont' else null end;
  if v_nome_setor is not null then
    select id into v_setor from setores where org_id = v_org and ativo
       and translate(lower(nome), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like '%' || v_nome_setor || '%' limit 1;
  end if;
  if v_setor is not null then
    select user_id into v_resp from cliente_responsaveis where cliente_id = p_cliente and setor_id = v_setor limit 1;
    if v_resp is null then
      select user_id into v_resp from membros where org_id = v_org and setor_id = v_setor and ativo
       order by (papel = 'gestor') desc limit 1;
    end if;
  end if;
  insert into portal_conversas (org_id, cliente_id, assunto, titulo, setor_id, responsavel_id, aberto_por, prazo_resposta)
  values (v_org, p_cliente, p_assunto, coalesce(nullif(trim(p_titulo), ''), left(p_texto, 80)), v_setor, v_resp, auth.uid(),
          now() + case p_assunto when 'admissao_demissao' then interval '4 hours' else interval '1 day' end)
  returning id into v_id;
  insert into portal_mensagens (conversa_id, org_id, texto) values (v_id, v_org, p_texto);
  return v_id;
end $$;

-- um clique: atendimento vira tarefa no MDC Tarefas
create or replace function public.portal_conversa_para_tarefa(p_conversa uuid, p_prazo date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c portal_conversas; v_tarefa uuid; v_texto text;
begin
  select * into c from portal_conversas where id = p_conversa;
  if not app.hub_pode(c.org_id, 'atendimento', 'operar') then raise exception 'Sem permissão'; end if;
  if c.tarefa_id is not null then return c.tarefa_id; end if;
  select string_agg(coalesce(autor_nome, autor_tipo) || ': ' || texto, E'\n' order by criado_em) into v_texto
    from portal_mensagens where conversa_id = p_conversa and not interna;
  insert into tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id, criado_por, status, prioridade, prazo, visivel_cliente)
  values (c.org_id, 'Atendimento: ' || c.titulo, v_texto, c.cliente_id, c.setor_id, coalesce(c.responsavel_id, auth.uid()),
          auth.uid(), 'a_fazer', 'media', coalesce(p_prazo, app.hoje(c.org_id) + 2), true)
  returning id into v_tarefa;
  update portal_conversas set tarefa_id = v_tarefa, status = 'em_atendimento' where id = p_conversa;
  insert into portal_mensagens (conversa_id, org_id, autor_tipo, autor_nome, texto)
  values (p_conversa, c.org_id, 'sistema', 'MDC', 'Seu pedido virou uma tarefa da equipe e já está em andamento.');
  return v_tarefa;
end $$;

-- ---------------------------------------------------------------------
-- Arquivos do cliente (entregáveis e envios)
-- ---------------------------------------------------------------------
create policy hub_arquivos_cliente_select on public.hub_arquivos for select to authenticated
  using (visivel_cliente and cliente_id is not null and app.portal_pode(cliente_id, 'documentos'));
create policy hub_arquivos_cliente_insert on public.hub_arquivos for insert to authenticated
  with check (app = 'portal' and visivel_cliente and cliente_id is not null
              and (app.portal_pode(cliente_id, 'documentos') or app.portal_pode(cliente_id, 'chat')));

-- caminho do cliente: <org>/portal/<cliente>/<arquivo>
create policy hub_storage_cliente_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hub-arquivos' and (storage.foldername(name))[2] = 'portal'
              and (app.portal_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'documentos')
                   or app.portal_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'chat')));
create policy hub_storage_cliente_select on storage.objects for select to authenticated
  using (bucket_id = 'hub-arquivos' and exists (
          select 1 from public.hub_arquivos a
           where a.caminho = name and a.visivel_cliente and app.portal_pode(a.cliente_id, 'documentos')));

-- envio do cliente avisa a equipe
create or replace function app.tg_arquivo_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli text; u record;
begin
  if new.app = 'portal' and not exists (select 1 from membros where org_id = new.org_id and user_id = auth.uid()) then
    new.enviado_por := auth.uid();
    select coalesce(nome_fantasia, razao_social) into v_cli from clientes where id = new.cliente_id;
    for u in select distinct r.user_id from cliente_responsaveis r where r.cliente_id = new.cliente_id loop
      perform app.notificar(new.org_id, u.user_id, 'portal', v_cli || ' enviou um arquivo', new.nome, '/atendimento');
    end loop;
    -- envio ligado a uma pendência: a tarefa sai de "aguardando você"
    if new.ref_id is not null then
      update tarefas set status = 'em_andamento'
       where id = new.ref_id and cliente_id = new.cliente_id and status = 'aguardando';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hub_arquivos_cliente on public.hub_arquivos;
create trigger hub_arquivos_cliente before insert on public.hub_arquivos
  for each row execute function app.tg_arquivo_cliente();

-- ---------------------------------------------------------------------
-- Demonstrativos: balancete do Domínio, mapa de contas, parecer
-- ---------------------------------------------------------------------
create table if not exists public.portal_balancetes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  competencia    date not null check (competencia = date_trunc('month', competencia)::date),
  status         text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  arquivo_nome   text,
  resumo         jsonb not null default '{}'::jsonb,   -- totais por grupo gerencial
  indices        jsonb not null default '{}'::jsonb,
  alertas        jsonb not null default '[]'::jsonb,
  conferencias   jsonb not null default '[]'::jsonb,
  comentario     text,                                 -- "o que aconteceu na sua empresa"
  importado_por  uuid references auth.users(id) on delete set null,
  importado_em   timestamptz not null default now(),
  publicado_por  uuid references auth.users(id) on delete set null,
  publicado_em   timestamptz,
  unique (cliente_id, competencia)
);

create table if not exists public.portal_balancete_linhas (
  id              bigint generated always as identity primary key,
  balancete_id    uuid not null references public.portal_balancetes(id) on delete cascade,
  org_id          uuid not null,
  codigo          text,
  classificacao   text not null,
  descricao       text not null,
  nivel           int not null default 1,
  analitica       boolean not null default true,
  saldo_anterior  numeric(16,2) not null default 0,   -- devedor positivo, credor negativo
  debitos         numeric(16,2) not null default 0,
  creditos        numeric(16,2) not null default 0,
  saldo_atual     numeric(16,2) not null default 0,
  grupo           text
);
create index if not exists portal_bal_linhas on public.portal_balancete_linhas (balancete_id, classificacao);

-- conta → grupo gerencial; cliente_id nulo = regra padrão da organização
create table if not exists public.portal_mapa_contas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id     uuid references public.clientes(id) on delete cascade,
  classificacao  text not null,         -- prefixo da classificação (ex.: 1.1.1)
  grupo          text not null,
  unique nulls not distinct (org_id, cliente_id, classificacao)
);

create table if not exists public.portal_pareceres (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  balancete_id   uuid not null references public.portal_balancetes(id) on delete cascade,
  versao         int not null default 1,
  status         text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  texto          text not null,                 -- markdown
  contador_nome  text,
  contador_crc   text,
  criado_por     uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  publicado_em   timestamptz,
  unique (balancete_id, versao)
);

alter table public.portal_balancetes        enable row level security;
alter table public.portal_balancete_linhas  enable row level security;
alter table public.portal_mapa_contas       enable row level security;
alter table public.portal_pareceres         enable row level security;

create policy bal_equipe_select on public.portal_balancetes for select to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
create policy bal_cliente_select on public.portal_balancetes for select to authenticated
  using (status = 'publicado' and app.portal_pode(cliente_id, 'demonstrativos'));
create policy bal_equipe_write on public.portal_balancetes for all to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'operar')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));

create policy bal_linhas_equipe on public.portal_balancete_linhas for all to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));
create policy bal_linhas_cliente on public.portal_balancete_linhas for select to authenticated
  using (exists (select 1 from portal_balancetes b where b.id = balancete_id and b.status = 'publicado'
                 and app.portal_pode(b.cliente_id, 'demonstrativos')));

create policy mapa_select on public.portal_mapa_contas for select to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
create policy mapa_write on public.portal_mapa_contas for all to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'operar')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));

create policy parecer_equipe on public.portal_pareceres for all to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));
create policy parecer_cliente on public.portal_pareceres for select to authenticated
  using (status = 'publicado' and app.portal_pode(cliente_id, 'demonstrativos'));

-- publicar: só quem gere Demonstrativos; avisa os usuários do cliente
create or replace function public.portal_publicar_balancete(p_balancete uuid, p_publicar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare b portal_balancetes; u record; v_mes text;
begin
  select * into b from portal_balancetes where id = p_balancete;
  if b.id is null then raise exception 'Balancete não encontrado'; end if;
  if not app.hub_pode(b.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Apenas quem gere Demonstrativos pode publicar para o cliente';
  end if;
  update portal_balancetes
     set status = case when p_publicar then 'publicado' else 'rascunho' end,
         publicado_por = case when p_publicar then auth.uid() end,
         publicado_em = case when p_publicar then now() end
   where id = p_balancete;
  perform app.registrar(b.org_id, 'demonstrativos', case when p_publicar then 'publicar' else 'despublicar' end,
                        p_balancete::text, null, null);
  if p_publicar then
    v_mes := to_char(b.competencia, 'MM/YYYY');
    for u in select user_id from portal_usuarios where cliente_id = b.cliente_id and ativo and 'demonstrativos' = any (permissoes) loop
      perform app.notificar(b.org_id, u.user_id, 'portal', 'Fechamento de ' || v_mes || ' publicado',
                            'Os demonstrativos do mês já estão no portal.', '/portal');
    end loop;
  end if;
end $$;

create or replace function public.portal_publicar_parecer(p_parecer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p portal_pareceres;
begin
  select * into p from portal_pareceres where id = p_parecer;
  if not app.hub_pode(p.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Apenas quem gere Demonstrativos pode publicar o parecer';
  end if;
  if coalesce(trim(p.contador_nome), '') = '' or coalesce(trim(p.contador_crc), '') = '' then
    raise exception 'Informe o contador responsável e o CRC antes de publicar';
  end if;
  update portal_pareceres set status = 'publicado', publicado_em = now() where id = p_parecer;
  perform app.registrar(p.org_id, 'demonstrativos', 'publicar_parecer', p_parecer::text, null, to_jsonb(p.versao));
end $$;

-- tempo real do chat
alter publication supabase_realtime add table public.portal_conversas;
alter publication supabase_realtime add table public.portal_mensagens;

grant execute on all functions in schema app to authenticated;
