-- =====================================================================
--  009 · Gerenciador Societário
--  Processo (abertura, alteração, filial, transformação, baixa…) com
--  fases por tipo, protocolos, exigências, taxas e linha do tempo.
--  Cada fase aberta vira uma tarefa no MDC Tarefas para o responsável.
-- =====================================================================

create table if not exists public.soc_tipos (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizacoes(id) on delete cascade,
  codigo  text not null,
  nome    text not null,
  fases   jsonb not null,           -- [{"codigo":"documentos","nome":"…","prazo_dias":5}, …]
  ativo   boolean not null default true,
  ordem   int not null default 0,
  unique (org_id, codigo)
);

create table if not exists public.soc_processos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  numero          int not null,
  tipo_id         uuid not null references public.soc_tipos(id),
  cliente_id      uuid references public.clientes(id) on delete set null,
  futuro_cliente  text,
  cnpj            text,
  uf              text,
  descricao       text,               -- o que muda (endereço, sócios, capital…)
  responsavel_id  uuid references auth.users(id) on delete set null,
  status          text not null default 'aberto' check (status in ('aberto', 'concluido', 'cancelado')),
  fase_atual      int not null default 1,
  exigencias      int not null default 0,
  visivel_cliente boolean not null default true,
  pedido_em       date not null default current_date,
  previsao_em     date,
  concluido_em    date,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (org_id, numero),
  check (cliente_id is not null or futuro_cliente is not null)
);
create index if not exists soc_processos_org on public.soc_processos (org_id, status);

create table if not exists public.soc_fases (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  processo_id     uuid not null references public.soc_processos(id) on delete cascade,
  ordem           int not null,
  codigo          text not null,
  nome            text not null,
  status          text not null default 'a_fazer'
                  check (status in ('a_fazer', 'em_andamento', 'aguardando_cliente', 'aguardando_orgao', 'concluida', 'dispensada')),
  responsavel_id  uuid references auth.users(id) on delete set null,
  prazo_dias      int,
  inicio_em       date,
  prazo_em        date,
  fim_em          date,
  mudou_em        timestamptz not null default now(),
  tarefa_id       uuid references public.tarefas(id) on delete set null,
  unique (processo_id, ordem)
);
create index if not exists soc_fases_proc on public.soc_fases (processo_id, ordem);

create table if not exists public.soc_protocolos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizacoes(id) on delete cascade,
  processo_id  uuid not null references public.soc_processos(id) on delete cascade,
  orgao        text not null,
  numero       text not null,
  data         date not null default current_date,
  link         text,
  criado_em    timestamptz not null default now()
);

create table if not exists public.soc_exigencias (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  processo_id     uuid not null references public.soc_processos(id) on delete cascade,
  data            date not null default current_date,
  orgao           text not null,
  texto           text not null,
  resposta        text,
  reprotocolo_em  date,
  criado_em       timestamptz not null default now()
);

create table if not exists public.soc_taxas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizacoes(id) on delete cascade,
  processo_id  uuid not null references public.soc_processos(id) on delete cascade,
  descricao    text not null,          -- DARE Junta, GRU, taxa municipal…
  valor        numeric(14,2),
  vencimento   date,
  pago_por     text check (pago_por in ('cliente', 'mdc')),
  pago_em      date,
  criado_em    timestamptz not null default now()
);

create table if not exists public.soc_eventos (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizacoes(id) on delete cascade,
  processo_id  uuid not null references public.soc_processos(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  tipo         text not null,          -- comentario, fase, protocolo, exigencia, taxa, documento, status
  texto        text not null,
  visivel_cliente boolean not null default false,
  em           timestamptz not null default now()
);
create index if not exists soc_eventos_proc on public.soc_eventos (processo_id, em desc);

alter table public.soc_eventos alter column user_id set default auth.uid();
alter table public.hub_arquivos alter column enviado_por set default auth.uid();

-- ---------------------------------------------------------------------
-- RLS: ver = consulta; operar = movimenta processos; gerir = tipos e exclusões
-- ---------------------------------------------------------------------
alter table public.soc_tipos       enable row level security;
alter table public.soc_processos   enable row level security;
alter table public.soc_fases       enable row level security;
alter table public.soc_protocolos  enable row level security;
alter table public.soc_exigencias  enable row level security;
alter table public.soc_taxas       enable row level security;
alter table public.soc_eventos     enable row level security;

create policy soc_tipos_select on public.soc_tipos for select to authenticated using (app.hub_pode(org_id, 'societario', 'ver'));
create policy soc_tipos_write  on public.soc_tipos for all to authenticated
  using (app.hub_pode(org_id, 'societario', 'gerir')) with check (app.hub_pode(org_id, 'societario', 'gerir'));

do $$
declare t text;
begin
  foreach t in array array['soc_processos', 'soc_fases', 'soc_protocolos', 'soc_exigencias', 'soc_taxas', 'soc_eventos'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (app.hub_pode(org_id, ''societario'', ''ver''))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (app.hub_pode(org_id, ''societario'', ''operar''))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (app.hub_pode(org_id, ''societario'', ''operar'')) with check (app.hub_pode(org_id, ''societario'', ''operar''))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (app.hub_pode(org_id, ''societario'', ''gerir''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------
create or replace function app.soc_evento(p_proc uuid, p_tipo text, p_texto text, p_visivel boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into soc_eventos (org_id, processo_id, user_id, tipo, texto, visivel_cliente)
  select org_id, id, auth.uid(), p_tipo, p_texto, p_visivel from soc_processos where id = p_proc
$$;

-- abre a tarefa da fase no MDC Tarefas (setor Societário) e guarda o vínculo
create or replace function app.soc_tarefa_da_fase(p_fase uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare f soc_fases; p soc_processos; v_setor uuid; v_tarefa uuid; v_nome text;
begin
  select * into f from soc_fases where id = p_fase;
  select * into p from soc_processos where id = f.processo_id;
  if f.tarefa_id is not null then return f.tarefa_id; end if;
  select id into v_setor from setores where org_id = p.org_id and nome ilike 'societ%' limit 1;
  v_nome := coalesce((select coalesce(nome_fantasia, razao_social) from clientes where id = p.cliente_id), p.futuro_cliente);
  insert into tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id, criado_por, status, prioridade, prazo)
  values (p.org_id,
          'Societário #' || p.numero || ' · ' || f.nome,
          (select nome from soc_tipos where id = p.tipo_id) || ' — ' || v_nome || coalesce(E'\n' || p.descricao, ''),
          p.cliente_id, v_setor, coalesce(f.responsavel_id, p.responsavel_id), coalesce(auth.uid(), p.criado_por),
          'a_fazer', 'media', f.prazo_em)
  returning id into v_tarefa;
  update soc_fases set tarefa_id = v_tarefa where id = p_fase;
  return v_tarefa;
end $$;

-- inicia a fase de ordem p_ordem (calcula prazo e cria a tarefa)
create or replace function app.soc_iniciar_fase(p_proc uuid, p_ordem int)
returns void language plpgsql security definer set search_path = public as $$
declare f soc_fases; v_hoje date;
begin
  select * into f from soc_fases where processo_id = p_proc and ordem = p_ordem;
  if f.id is null then return; end if;
  select app.hoje(org_id) into v_hoje from soc_processos where id = p_proc;
  update soc_fases set status = 'em_andamento', inicio_em = coalesce(inicio_em, v_hoje),
         prazo_em = coalesce(prazo_em, v_hoje + coalesce(prazo_dias, 5)), fim_em = null, mudou_em = now()
   where id = f.id;
  update soc_processos set fase_atual = p_ordem, atualizado_em = now() where id = p_proc;
  perform app.soc_tarefa_da_fase(f.id);
end $$;

create or replace function public.soc_abrir_processo(
  p_org uuid, p_tipo uuid, p_cliente uuid, p_futuro text, p_cnpj text, p_uf text,
  p_descricao text, p_responsavel uuid, p_previsao date, p_dispensar text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int; t soc_tipos; f jsonb; i int := 0; v_uf text;
begin
  if not app.hub_pode(p_org, 'societario', 'operar') then
    raise exception 'Sem permissão para abrir processos societários';
  end if;
  select * into t from soc_tipos where id = p_tipo and org_id = p_org;
  if t.id is null then raise exception 'Tipo de processo não encontrado'; end if;
  if p_cliente is null and coalesce(trim(p_futuro), '') = '' then
    raise exception 'Informe o cliente ou o nome da empresa a abrir';
  end if;
  perform pg_advisory_xact_lock(hashtext('soc_num' || p_org::text));
  select coalesce(max(numero), 0) + 1 into v_num from soc_processos where org_id = p_org;
  v_uf := coalesce(nullif(upper(trim(p_uf)), ''), (select uf from clientes where id = p_cliente));
  insert into soc_processos (org_id, numero, tipo_id, cliente_id, futuro_cliente, cnpj, uf, descricao,
                             responsavel_id, previsao_em, criado_por, pedido_em)
  values (p_org, v_num, p_tipo, p_cliente, nullif(trim(p_futuro), ''),
          coalesce(nullif(trim(p_cnpj), ''), (select cnpj from clientes where id = p_cliente)), v_uf,
          nullif(trim(p_descricao), ''), coalesce(p_responsavel, auth.uid()), p_previsao, auth.uid(), app.hoje(p_org))
  returning id into v_id;

  for f in select * from jsonb_array_elements(t.fases) loop
    i := i + 1;
    insert into soc_fases (org_id, processo_id, ordem, codigo, nome, prazo_dias, status, responsavel_id)
    values (p_org, v_id, i, f ->> 'codigo',
            -- Junta conforme a UF do cliente
            replace(f ->> 'nome', 'Junta Comercial', 'Junta Comercial (' || case v_uf when 'MG' then 'JUCEMG' when 'RJ' then 'JUCERJA' when 'PR' then 'JUCEPAR' else 'JUCESP' end || ')'),
            nullif(f ->> 'prazo_dias', '')::int,
            case when (f ->> 'codigo') = any (p_dispensar) or (f ->> 'codigo') = 'exigencias' then 'dispensada' else 'a_fazer' end,
            coalesce(p_responsavel, auth.uid()));
  end loop;

  perform app.soc_evento(v_id, 'status', 'Processo aberto: ' || t.nome, true);
  perform app.soc_iniciar_fase(v_id, (select min(ordem) from soc_fases where processo_id = v_id and status <> 'dispensada'));
  return v_id;
end $$;

-- muda o status de uma fase; concluir avança para a próxima fase não dispensada
create or replace function public.soc_mudar_fase(p_fase uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare f soc_fases; p soc_processos; v_prox int; v_hoje date;
begin
  select * into f from soc_fases where id = p_fase;
  if f.id is null then raise exception 'Fase não encontrada'; end if;
  if not app.hub_pode(f.org_id, 'societario', 'operar') then raise exception 'Sem permissão'; end if;
  select * into p from soc_processos where id = f.processo_id;
  if p.status <> 'aberto' then raise exception 'O processo não está aberto'; end if;
  v_hoje := app.hoje(f.org_id);

  if p_status = 'em_andamento' or p_status like 'aguardando%' then
    if f.status in ('a_fazer', 'dispensada', 'concluida') then
      perform app.soc_iniciar_fase(p.id, f.ordem);
    end if;
    update soc_fases set status = p_status, mudou_em = now() where id = p_fase;
    perform app.soc_evento(p.id, 'fase', f.nome || ': ' || replace(replace(p_status, '_', ' '), 'orgao', 'órgão'),
                           p_status like 'aguardando%');
    return;
  end if;

  update soc_fases set status = p_status, fim_em = case when p_status = 'concluida' then v_hoje end, mudou_em = now()
   where id = p_fase;
  if f.tarefa_id is not null then
    update tarefas set status = case when p_status = 'concluida' then 'concluida' else 'cancelada' end::status_tarefa
     where id = f.tarefa_id and status not in ('concluida', 'cancelada');
  end if;
  perform app.soc_evento(p.id, 'fase', f.nome || case p_status when 'concluida' then ' concluída' else ' dispensada' end,
                         p_status = 'concluida');

  if f.ordem = p.fase_atual then
    select min(ordem) into v_prox from soc_fases
     where processo_id = p.id and ordem > f.ordem and status not in ('concluida', 'dispensada');
    if v_prox is null then
      perform public.soc_concluir_processo(p.id);
    else
      perform app.soc_iniciar_fase(p.id, v_prox);
    end if;
  end if;
end $$;

-- exigência: registra, conta e reabre a fase de exigências
create or replace function public.soc_registrar_exigencia(p_proc uuid, p_orgao text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare p soc_processos; v_fase soc_fases;
begin
  select * into p from soc_processos where id = p_proc;
  if not app.hub_pode(p.org_id, 'societario', 'operar') then raise exception 'Sem permissão'; end if;
  insert into soc_exigencias (org_id, processo_id, orgao, texto, data)
  values (p.org_id, p_proc, p_orgao, p_texto, app.hoje(p.org_id));
  update soc_processos set exigencias = exigencias + 1, atualizado_em = now() where id = p_proc;
  select * into v_fase from soc_fases where processo_id = p_proc and codigo = 'exigencias';
  if v_fase.id is not null then
    -- antes das exigências (ex.: protocolo): a fase atual se encerra; depois (ex.: deferimento): volta a aguardar
    update tarefas set status = 'cancelada'
     where id = (select tarefa_id from soc_fases where processo_id = p_proc and ordem = p.fase_atual)
       and status not in ('concluida', 'cancelada') and p.fase_atual <> v_fase.ordem;
    update soc_fases
       set status = case when ordem < v_fase.ordem then 'concluida' else 'a_fazer' end,
           fim_em = case when ordem < v_fase.ordem then app.hoje(p.org_id) end,
           tarefa_id = case when ordem < v_fase.ordem then tarefa_id end,
           inicio_em = case when ordem < v_fase.ordem then inicio_em end,
           prazo_em = case when ordem < v_fase.ordem then prazo_em end,
           mudou_em = now()
     where processo_id = p_proc and ordem = p.fase_atual and ordem <> v_fase.ordem;
    update soc_fases set status = 'a_fazer', tarefa_id = null, inicio_em = null, prazo_em = null, fim_em = null
     where id = v_fase.id;
    perform app.soc_iniciar_fase(p_proc, v_fase.ordem);
  end if;
  perform app.soc_evento(p_proc, 'exigencia', 'Exigência ' || p_orgao || ': ' || left(p_texto, 300), true);
end $$;

create or replace function public.soc_concluir_processo(p_proc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p soc_processos; t soc_tipos; v_cli uuid; v_hoje date;
begin
  select * into p from soc_processos where id = p_proc;
  if not app.hub_pode(p.org_id, 'societario', 'operar') then raise exception 'Sem permissão'; end if;
  select * into t from soc_tipos where id = p.tipo_id;
  v_hoje := app.hoje(p.org_id);
  update soc_processos set status = 'concluido', concluido_em = v_hoje, atualizado_em = now() where id = p_proc;
  update tarefas set status = 'cancelada'
   where id in (select tarefa_id from soc_fases where processo_id = p_proc and status not in ('concluida', 'dispensada'))
     and status not in ('concluida', 'cancelada');
  update soc_fases set status = 'dispensada', mudou_em = now()
   where processo_id = p_proc and status not in ('concluida', 'dispensada');

  if t.codigo = 'abertura' and p.cliente_id is null then
    -- a empresa aberta nasce no cadastro único
    insert into clientes (org_id, razao_social, cnpj, uf, ativo, cliente_desde)
    values (p.org_id, p.futuro_cliente, p.cnpj, p.uf, true, date_trunc('month', v_hoje)::date)
    returning id into v_cli;
    update soc_processos set cliente_id = v_cli where id = p_proc;
    perform app.soc_evento(p_proc, 'status', 'Cliente cadastrado no Hub: ' || p.futuro_cliente, false);
  elsif t.codigo = 'baixa' and p.cliente_id is not null then
    -- baixa = saída do cliente em todos os módulos
    update clientes set ativo = false, inativo_em = v_hoje,
           motivo_inativacao = coalesce(motivo_inativacao, 'Baixa/encerramento (Societário #' || p.numero || ')')
     where id = p.cliente_id and ativo;
    perform app.aplicar_inativacao(p.cliente_id);
    perform app.soc_evento(p_proc, 'status', 'Cliente inativado por baixa', false);
  end if;
  perform app.soc_evento(p_proc, 'status', 'Processo concluído', true);
end $$;

create or replace function public.soc_cancelar_processo(p_proc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare p soc_processos;
begin
  select * into p from soc_processos where id = p_proc;
  if not app.hub_pode(p.org_id, 'societario', 'gerir') then raise exception 'Apenas quem gere o Societário pode cancelar processos'; end if;
  update soc_processos set status = 'cancelado', atualizado_em = now() where id = p_proc;
  update tarefas set status = 'cancelada'
   where id in (select tarefa_id from soc_fases where processo_id = p_proc) and status not in ('concluida', 'cancelada');
  perform app.soc_evento(p_proc, 'status', 'Processo cancelado' || coalesce(': ' || p_motivo, ''), true);
end $$;

-- tarefa da fase concluída no MDC Tarefas → fase concluída no Societário
create or replace function app.tg_tarefa_fase_societario()
returns trigger language plpgsql security definer set search_path = public as $$
declare f soc_fases;
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    select * into f from soc_fases where tarefa_id = new.id and status not in ('concluida', 'dispensada');
    if f.id is not null and app.hub_pode(f.org_id, 'societario', 'operar') then
      perform public.soc_mudar_fase(f.id, 'concluida');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tarefas_fase_societario on public.tarefas;
create trigger tarefas_fase_societario after update of status on public.tarefas
  for each row execute function app.tg_tarefa_fase_societario();

-- ---------------------------------------------------------------------
-- Tipos de processo e fases padrão (prazos internos em dias, a validar)
-- ---------------------------------------------------------------------
create or replace function app.soc_fases_padrao(p_codigos text[])
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_agg(f.j0::jsonb order by f.ord)
    from (values
      (1,  'documentos',  '{"codigo":"documentos","nome":"Solicitação e coleta de documentos","prazo_dias":5}'),
      (2,  'viabilidade', '{"codigo":"viabilidade","nome":"Viabilidade / consulta prévia","prazo_dias":3}'),
      (3,  'dbe',         '{"codigo":"dbe","nome":"DBE / coleta na Receita (REDESIM)","prazo_dias":2}'),
      (4,  'elaboracao',  '{"codigo":"elaboracao","nome":"Elaboração do contrato ou alteração","prazo_dias":3}'),
      (5,  'aprovacao',   '{"codigo":"aprovacao","nome":"Revisão e aprovação do cliente","prazo_dias":3}'),
      (6,  'assinaturas', '{"codigo":"assinaturas","nome":"Assinaturas (gov.br ou certificado)","prazo_dias":3}'),
      (7,  'protocolo',   '{"codigo":"protocolo","nome":"Protocolo na Junta Comercial","prazo_dias":1}'),
      (8,  'exigencias',  '{"codigo":"exigencias","nome":"Exigências","prazo_dias":3}'),
      (9,  'deferimento', '{"codigo":"deferimento","nome":"Deferimento e registro (NIRE)","prazo_dias":7}'),
      (10, 'cnpj',        '{"codigo":"cnpj","nome":"CNPJ emitido ou atualizado","prazo_dias":3}'),
      (11, 'inscricoes',  '{"codigo":"inscricoes","nome":"Inscrições estadual e municipal e licenças","prazo_dias":15}'),
      (12, 'entrega',     '{"codigo":"entrega","nome":"Atualizações internas e entrega ao cliente","prazo_dias":3}')
    ) as f(ord, cod, j0)
   where f.cod = any (p_codigos)
$$;

create or replace function app.semear_societario(p_org uuid)
returns void language sql security definer set search_path = public as $f$
insert into soc_tipos (org_id, codigo, nome, fases, ordem)
select p_org, t.codigo, t.nome, app.soc_fases_padrao(t.fases), t.ordem
  from (values
    ('alteracao',     'Alteração contratual', array['documentos','viabilidade','dbe','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','cnpj','inscricoes','entrega'], 1),
    ('abertura',      'Abertura de empresa',  array['documentos','viabilidade','dbe','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','cnpj','inscricoes','entrega'], 2),
    ('filial',        'Abertura de filial',   array['documentos','viabilidade','dbe','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','cnpj','inscricoes','entrega'], 3),
    ('baixa_filial',  'Baixa de filial',      array['documentos','dbe','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','cnpj','entrega'], 4),
    ('transformacao', 'Transformação de tipo jurídico', array['documentos','dbe','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','cnpj','entrega'], 5),
    ('consolidacao',  'Consolidação contratual', array['documentos','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','entrega'], 6),
    ('baixa',         'Baixa / encerramento', array['documentos','dbe','elaboracao','aprovacao','assinaturas','protocolo','exigencias','deferimento','cnpj','inscricoes','entrega'], 7)
  ) as t(codigo, nome, fases, ordem)
on conflict (org_id, codigo) do nothing;
$f$;
select app.semear_societario(id) from public.organizacoes;

grant execute on all functions in schema app to authenticated;
