-- =====================================================================================================
--  041 · Módulo Contratos: contratos fixos (recorrentes), vigência, anexos e reajuste anual pelo índice do Banco Central
--
--  Decisão do Edvaldo (02/11/2026): o Financeiro do HUB passa a controlar a gestão da própria MDC, que tem contratos
--  que se repetem todo mês e são reajustados uma vez por ano. Até aqui o Financeiro só lançava parcelas com fim
--  definido (fin_lancar). Esta migração cria o CONTRATO FIXO:
--
--   1  fin_recorrentes: contrato a receber (honorários mensais dos clientes da MDC) ou a pagar (aluguel, sistemas,
--      serviços), com valor, dia de vencimento (1–31; 31 vira o último dia do mês), categoria, centro de custo e banco
--      previsto (opcionais como no lançamento normal), início, fim opcional e reajuste (IPCA, IGP-M, INPC, % fixo ou
--      sem reajuste) no mês escolhido. Situação: ativo, suspenso ou encerrado — sempre com motivo; nada se apaga.
--   2  fin_titulos ganha recorrente_id + competencia: cada mês de cada contrato vira UMA conta (índice único). As contas
--      nascem pelo caminho interno de sempre (app.fin_lancar_titulos, 036) e depois são contas normais (pagar,
--      receber, editar, cancelar). O vínculo com o contrato não muda pela tela.
--   3  Rotina diária (pg_cron financeiro-recorrentes, 06h30 de Brasília): lança a conta do mês de cada contrato ativo
--      (no dia 1; se a rotina falhar, o dia seguinte recupera — o mês atual e o anterior, sem duplicar), encerra os
--      contratos cujo fim passou e avisa no sino (administradores e quem tem Financeiro gerir) os reajustes do mês.
--   4  Reajuste: o HUB PROPÕE (acumulado de 12 meses do índice até o mês anterior ao do reajuste, produto de
--      (1 + %/100)) e a pessoa CONFIRMA (pode ajustar o %). Histórico em fin_recorrente_reajustes. Contas já lançadas
--      não mudam — salvo se a pessoa marcar, na confirmação, para atualizar as do próprio ciclo que ainda estão em
--      aberto e sem pagamento.
--   5  Índices: fin_indices guarda a série mensal (IPCA = SGS 433, INPC = 188, IGP-M = 189). A busca é feita pelo
--      próprio banco com pg_net (já usada nas rotinas do SharePoint e das notas): o job fin-indices-buscar (06h20)
--      pede a série dos últimos 24 meses à API SGS do Banco Central; a resposta chega sozinha em net._http_response e
--      é lida pela rotina das 06h30 (e sempre que alguém abre a proposta de reajuste). Sem pg_net nada quebra: a
--      busca só não acontece.
--
--   6  Módulo próprio "Contratos" (ajuste do Edvaldo, 02/11/2026): ferramenta `contratos` em hub_apps, no grupo Gestão,
--      com acesso próprio (ver/operar/gerir). Quem cria, edita, suspende, encerra, reajusta e anexa é
--      app.hub_pode(org, 'contratos', nível) (app.contratos_pode). O contrato guarda também número, objeto, vigência
--      (início, fim ou prazo indeterminado, renovação automática), aviso de fim/renovação X dias antes (sino), anexos
--      (hub_arquivos com app = 'contratos', ref_id = contrato) e o histórico (fin_recorrente_eventos). Contrato pode
--      não gerar contas (gera_contas = false: só guarda o documento e a vigência). As contas continuam nascendo no
--      Financeiro pelo caminho interno (app.fin_lancar_titulos). 'contratos' entra em app.modulos_gestao() (ler
--      fornecedores/clientes, categorias, centros e bancos para o cadastro), mas NÃO em app.modulos_operar(): o
--      módulo não grava cadastros compartilhados direto; o fornecedor/cliente digitado na hora nasce dentro da função.
--      As tabelas mantêm o prefixo fin_ porque cada contrato alimenta fin_titulos.
--
--  NÃO APLICAR pela frente: quem integra aplica. Testes: supabase/testes/95_base_041.sql e 96_recorrentes_041.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 tabelas
create table if not exists public.fin_recorrentes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tipo text not null check (tipo in ('pagar', 'receber')),
  pessoa_id uuid not null references public.fin_pessoas(id) on delete restrict,
  descricao text not null check (length(trim(descricao)) > 0),
  valor numeric(15, 2) not null check (valor > 0),
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  categoria_id uuid not null references public.fin_categorias(id) on delete restrict,
  centro_id uuid references public.fin_centros_custo(id) on delete restrict,
  conta_prevista_id uuid references public.fin_contas_bancarias(id) on delete restrict,
  inicio date not null check (inicio = date_trunc('month', inicio)::date),
  gerar_desde date not null check (gerar_desde = date_trunc('month', gerar_desde)::date),
  fim date check (fim is null or fim = date_trunc('month', fim)::date),
  indice text not null default 'nenhum' check (indice in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum')),
  percentual_fixo numeric(7, 4) check (percentual_fixo is null or percentual_fixo > -50 and percentual_fixo <= 100),
  mes_reajuste integer check (mes_reajuste between 1 and 12),
  situacao text not null default 'ativo' check (situacao in ('ativo', 'suspenso', 'encerrado')),
  situacao_motivo text,
  situacao_em timestamptz,
  situacao_por uuid,
  encerrado_em date,
  ultima_competencia date,
  mes_cadastro date not null check (mes_cadastro = date_trunc('month', mes_cadastro)::date),
  reajuste_avisado date,
  observacao text,
  numero text,
  objeto text,
  vigencia_inicio date not null,
  vigencia_fim date,
  renovacao_automatica boolean not null default false,
  aviso_dias integer not null default 30 check (aviso_dias between 0 and 365),
  aviso_fim_enviado date,
  gera_contas boolean not null default true,
  por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  check (inicio = date_trunc('month', vigencia_inicio)::date),
  check (indice = 'nenhum' or mes_reajuste is not null),
  check (indice <> 'fixo' or percentual_fixo is not null),
  check (fim is null or fim >= gerar_desde),
  check (situacao = 'ativo' or situacao_motivo is not null)
);
create index if not exists fin_recorrentes_cliente on public.fin_recorrentes (org_id, cliente_id, tipo, situacao);
comment on table public.fin_recorrentes is
  'Contratos fixos (recorrentes) do Financeiro: a conta de cada mês é lançada no dia 1 pela rotina financeiro-recorrentes. Grava só pelas funções fin_recorrente_*; nada se apaga (041).';
comment on column public.fin_recorrentes.inicio is 'Mês (dia 1) em que o contrato começou; marca o aniversário do reajuste.';
comment on column public.fin_recorrentes.gerar_desde is 'Primeiro mês (dia 1) que o HUB lança; nunca antes do mês do cadastro ou da reativação (meses passados não são lançados sozinhos).';
comment on column public.fin_recorrentes.fim is 'Último mês (dia 1) com conta; depois dele a rotina encerra o contrato.';
comment on column public.fin_recorrentes.mes_reajuste is 'Mês do ano (1–12) em que o reajuste vale; o acumulado é dos 12 meses anteriores a ele.';
comment on column public.fin_recorrentes.ultima_competencia is 'Último mês já lançado.';
comment on column public.fin_recorrentes.mes_cadastro is 'Mês em que o contrato entrou no HUB: o valor informado já vale neste ciclo; o primeiro reajuste cobrado é o de um mês posterior.';
comment on column public.fin_recorrentes.vigencia_fim is 'Fim da vigência (vazio = prazo indeterminado). Sem renovação automática, as contas param no mês do fim.';
comment on column public.fin_recorrentes.renovacao_automatica is 'No fim da vigência, a rotina renova por mais 12 meses (fica no histórico).';
comment on column public.fin_recorrentes.aviso_dias is 'Quantos dias antes do fim da vigência o sino avisa (uma vez por vigência).';
comment on column public.fin_recorrentes.gera_contas is 'false = o contrato só guarda o documento e a vigência; não lança contas no Financeiro.';
comment on column public.fin_recorrentes.reajuste_avisado is 'Mês de reajuste já avisado no sino (avisa uma vez por ciclo).';

create table if not exists public.fin_recorrente_reajustes (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  recorrente_id uuid not null references public.fin_recorrentes(id) on delete restrict,
  origem text not null check (origem in ('reajuste', 'edicao')),
  referencia date,
  indice text,
  percentual numeric(9, 4),
  percentual_proposto numeric(9, 4),
  valor_antes numeric(15, 2) not null,
  valor_depois numeric(15, 2) not null,
  titulos_atualizados integer not null default 0,
  observacao text,
  por uuid,
  em timestamptz not null default now(),
  check (origem = 'edicao' or referencia is not null)
);
create unique index if not exists fin_recorrente_reajustes_ciclo on public.fin_recorrente_reajustes (recorrente_id, referencia)
  where origem = 'reajuste';
create index if not exists fin_recorrente_reajustes_cliente on public.fin_recorrente_reajustes (cliente_id, em);
comment on table public.fin_recorrente_reajustes is
  'Histórico de valor dos contratos fixos: reajustes confirmados (índice, % proposto e aplicado, mês de referência) e mudanças de valor pela edição (041).';

create table if not exists public.fin_recorrente_eventos (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  recorrente_id uuid not null references public.fin_recorrentes(id) on delete restrict,
  tipo text not null check (tipo in ('criado', 'editado', 'valor', 'conta', 'reajuste', 'suspenso', 'reativado', 'encerrado',
                                     'renovado', 'aviso', 'anexo')),
  texto text not null,
  dados jsonb,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists fin_recorrente_eventos_contrato on public.fin_recorrente_eventos (recorrente_id, em);
comment on table public.fin_recorrente_eventos is
  'Histórico legível de cada contrato (criação, edição, contas lançadas, reajustes, suspensão, reativação, encerramento, renovação, avisos e anexos). Só o banco grava; nada se apaga (041).';

create table if not exists public.fin_indices (
  indice text not null check (indice in ('IPCA', 'IGP-M', 'INPC')),
  mes date not null check (mes = date_trunc('month', mes)::date),
  percentual numeric(9, 4) not null,
  fonte text not null default 'Banco Central (SGS)',
  atualizado_em timestamptz not null default now(),
  primary key (indice, mes)
);
comment on table public.fin_indices is
  'Variação mensal (%) dos índices de reajuste (IPCA = SGS 433, INPC = 188, IGP-M = 189), buscada no Banco Central pelo job fin-indices-buscar (041).';

-- pedidos feitos ao Banco Central pelo pg_net (a resposta chega depois em net._http_response)
create table if not exists app.fin_indices_pedidos (
  pedido bigint primary key,
  indice text not null,
  pedido_em timestamptz not null default now(),
  lido_em timestamptz,
  resultado text
);
comment on table app.fin_indices_pedidos is 'Pedidos de série ao Banco Central (id do pg_net) e o que foi feito com a resposta (041).';

-- conta ↔ contrato
alter table public.fin_titulos
  add column if not exists recorrente_id uuid references public.fin_recorrentes(id) on delete restrict,
  add column if not exists competencia date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_titulos_recorrente_competencia') then
    alter table public.fin_titulos add constraint fin_titulos_recorrente_competencia
      check ((recorrente_id is null) = (competencia is null));
  end if;
end $$;
create unique index if not exists fin_titulos_recorrente_mes on public.fin_titulos (recorrente_id, competencia)
  where recorrente_id is not null;
comment on column public.fin_titulos.recorrente_id is 'Contrato fixo que gerou esta conta (041). Muda só pelo banco.';
comment on column public.fin_titulos.competencia is 'Mês (dia 1) do contrato fixo a que esta conta se refere; um por contrato (041).';

-- ===================================================================================================== 6 módulo Contratos
insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem) values
  ('contratos', 'Contratos', 'Contratos fixos: cadastro, vigência, anexos, contas do mês e reajuste anual', 'documento', '/contratos', 'ativo', false, 42)
on conflict (slug) do nothing;

/** Módulos de gestão (dados compartilhados da empresa): entra 'contratos' (ler fornecedores/clientes, categorias, centros e bancos). */
create or replace function app.modulos_gestao()
returns text[] language sql immutable set search_path = '' as $$
  select array['financeiro', 'entradas', 'saidas', 'estoque', 'centros_custo', 'plano_contas', 'relatorios', 'contratos']
$$;
comment on function app.modulos_gestao() is 'Ferramentas/módulos de gestão (dados compartilhados da empresa); 041 acrescentou contratos.';

/** Quem mexe nos contratos da empresa: equipe com o módulo Contratos no nível pedido (o Portal não vê contratos). */
create or replace function app.contratos_pode(p_cliente uuid, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'contratos', p_min))
$$;
revoke all on function app.contratos_pode(uuid, text) from public, anon;
grant execute on function app.contratos_pode(uuid, text) to authenticated;
comment on function app.contratos_pode(uuid, text) is 'Equipe com o módulo Contratos no nível pedido (041).';

-- ===================================================================================================== segurança das tabelas
alter table public.fin_recorrentes enable row level security;
alter table public.fin_recorrente_reajustes enable row level security;
alter table public.fin_indices enable row level security;
alter table public.fin_recorrente_eventos enable row level security;

drop policy if exists fin_ver on public.fin_recorrentes;
create policy fin_ver on public.fin_recorrentes for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
drop policy if exists fin_ver on public.fin_recorrente_reajustes;
create policy fin_ver on public.fin_recorrente_reajustes for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
drop policy if exists fin_ver on public.fin_recorrente_eventos;
create policy fin_ver on public.fin_recorrente_eventos for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
drop policy if exists fin_indices_ver on public.fin_indices;
create policy fin_indices_ver on public.fin_indices for select to authenticated using (true);

-- gravação só pelas funções; nada se apaga
revoke insert, update, delete, truncate on public.fin_recorrentes, public.fin_recorrente_reajustes, public.fin_recorrente_eventos,
  public.fin_indices from anon, authenticated;
grant select on public.fin_recorrentes, public.fin_recorrente_reajustes, public.fin_recorrente_eventos, public.fin_indices to authenticated;
revoke all on app.fin_indices_pedidos from public, anon, authenticated;

drop trigger if exists nada_se_apaga on public.fin_recorrentes;
create trigger nada_se_apaga before delete on public.fin_recorrentes
  for each row execute function app.tg_nada_se_apaga('encerre ou suspenda o contrato (com motivo)');
drop trigger if exists nada_se_apaga on public.fin_recorrente_reajustes;
create trigger nada_se_apaga before delete on public.fin_recorrente_reajustes
  for each row execute function app.tg_nada_se_apaga('o histórico de reajustes é permanente');
drop trigger if exists nada_se_apaga on public.fin_recorrente_eventos;
create trigger nada_se_apaga before delete on public.fin_recorrente_eventos
  for each row execute function app.tg_nada_se_apaga('o histórico do contrato é permanente');
drop trigger if exists nada_se_apaga on public.fin_indices;
create trigger nada_se_apaga before delete on public.fin_indices
  for each row execute function app.tg_nada_se_apaga('a série de índices é permanente');
drop trigger if exists cliente_mesma_org on public.fin_recorrentes;
create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.fin_recorrentes
  for each row execute function app.tg_cliente_mesma_org();

/** Conta de contrato fixo: o vínculo (contrato e mês) só nasce e muda pelo banco (modo interno). */
create or replace function app.tg_fin_titulo_recorrente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.fin_interno', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' and (new.recorrente_id is not null or new.competencia is not null) then
    raise exception 'Conta de contrato fixo nasce só pelo próprio contrato';
  end if;
  if tg_op = 'UPDATE' and (new.recorrente_id is distinct from old.recorrente_id or new.competencia is distinct from old.competencia) then
    raise exception 'O contrato fixo e o mês desta conta não mudam';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_titulo_recorrente() from public, anon, authenticated;
drop trigger if exists fin_titulo_recorrente on public.fin_titulos;
create trigger fin_titulo_recorrente before insert or update on public.fin_titulos
  for each row execute function app.tg_fin_titulo_recorrente();

-- ===================================================================================================== 2 contas
/** Vencimento no mês: o dia do contrato dentro do próprio mês (31 vira o último dia; 30 em fevereiro, 28 ou 29). */
create or replace function app.fin_vencimento_no_mes(p_mes date, p_dia int)
returns date language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_mes)::int, extract(month from p_mes)::int,
                   least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int))
$$;
revoke all on function app.fin_vencimento_no_mes(date, int) from public, anon, authenticated;

/** Linha do histórico do contrato (quem fez = auth.uid(); nulo na rotina). */
create or replace function app.fin_recorrente_evento(p_contrato uuid, p_tipo text, p_texto text, p_dados jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into fin_recorrente_eventos (org_id, cliente_id, recorrente_id, tipo, texto, dados, por)
  select org_id, cliente_id, id, p_tipo, p_texto, p_dados, auth.uid() from fin_recorrentes where id = p_contrato
$$;
revoke all on function app.fin_recorrente_evento(uuid, text, text, jsonb) from public, anon, authenticated;

/** "R$ 1.234,56" (texto do histórico e dos avisos). */
create or replace function app.fin_brl(p numeric)
returns text language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(p, 'FM999,999,990.00'), ',.', '.,')
$$;
revoke all on function app.fin_brl(numeric) from public, anon, authenticated;

/**
 * Lança a conta do mês dos contratos ativos da organização (ou de um contrato). Idempotente: trava o contrato,
 * confere se o mês já tem conta (inclusive cancelada) e o índice único (recorrente_id, competencia) garante o resto.
 * Um contrato com problema não impede os outros: o erro vai para a auditoria (recorrente_falha).
 */
create or replace function app.fin_recorrentes_gerar(p_org uuid, p_mes date, p_contrato uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date; k fin_recorrentes; r jsonb; v_titulo uuid; n int := 0;
  v_fin text := current_setting('app.fin_interno', true);
begin
  for k in select * from fin_recorrentes
            where org_id = p_org and (p_contrato is null or id = p_contrato) and situacao = 'ativo' and gera_contas
              and gerar_desde <= v_mes and (fim is null or fim >= v_mes)
              and not exists (select 1 from fin_titulos t where t.recorrente_id = fin_recorrentes.id and t.competencia = v_mes)
            order by id
  loop
    begin
      -- trava e confere de novo (duas rotinas ao mesmo tempo não lançam o mesmo mês)
      select * into k from fin_recorrentes where id = k.id for update;
      continue when k.situacao <> 'ativo' or not k.gera_contas or exists (select 1 from fin_titulos t where t.recorrente_id = k.id and t.competencia = v_mes);
      r := app.fin_lancar_titulos(jsonb_build_object(
        'cliente', k.cliente_id, 'tipo', k.tipo, 'pessoa', k.pessoa_id, 'categoria', k.categoria_id,
        'centro', k.centro_id, 'conta_prevista', k.conta_prevista_id,
        'descricao', k.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'),
        'vencimento', app.fin_vencimento_no_mes(v_mes, k.dia_vencimento), 'valor', k.valor, 'parcelas', 1,
        'observacao', 'Lançada pelo contrato fixo'));
      v_titulo := (r->'titulos'->>0)::uuid;
      perform set_config('app.fin_interno', '1', true);
      update fin_titulos set recorrente_id = k.id, competencia = v_mes where id = v_titulo;
      update fin_recorrentes set ultima_competencia = greatest(ultima_competencia, v_mes) where id = k.id;
      perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
      perform app.registrar(k.org_id, 'financeiro', 'recorrente_gerar', k.id::text, null,
        jsonb_build_object('competencia', v_mes, 'titulo', v_titulo, 'valor', k.valor));
      perform app.fin_recorrente_evento(k.id, 'conta', format('Conta de %s lançada em %s (%s)', to_char(v_mes, 'MM/YYYY'),
        case when k.tipo = 'pagar' then 'Contas a pagar' else 'Contas a receber' end, app.fin_brl(k.valor)),
        jsonb_build_object('titulo', v_titulo, 'competencia', v_mes));
      n := n + 1;
    exception when others then
      perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
      perform app.registrar(k.org_id, 'financeiro', 'recorrente_falha', k.id::text, null,
        jsonb_build_object('competencia', v_mes, 'erro', sqlerrm));
    end;
  end loop;
  return n;
end $$;
revoke all on function app.fin_recorrentes_gerar(uuid, date, uuid) from public, anon, authenticated;
comment on function app.fin_recorrentes_gerar(uuid, date, uuid) is
  'Lança a conta do mês dos contratos fixos ativos (por app.fin_lancar_titulos). Idempotente; um contrato com erro vai para a auditoria e não para os outros (041).';

-- ===================================================================================================== 4 reajuste
/** Código da série no SGS do Banco Central. */
create or replace function app.fin_codigo_indice(p_indice text)
returns int language sql immutable set search_path = '' as $$
  select case p_indice when 'IPCA' then 433 when 'INPC' then 188 when 'IGP-M' then 189 end
$$;
revoke all on function app.fin_codigo_indice(text) from public, anon, authenticated;

/**
 * Acumulado de 12 meses do índice até o mês anterior ao reajuste: reajuste em 03/2027 usa 03/2026 a 02/2027.
 * Produto de (1 + %/100) menos 1. Faltando algum mês, o percentual vem nulo e a lista "faltam" diz quais.
 */
create or replace function app.fin_indice_acumulado(p_indice text, p_referencia date)
returns jsonb language sql stable security definer set search_path = public as $$
  with meses as (
    select (date_trunc('month', p_referencia) - make_interval(months => k))::date as mes from generate_series(1, 12) k
  ), achados as (
    select m.mes, i.percentual from meses m left join fin_indices i on i.indice = p_indice and i.mes = m.mes
  )
  select jsonb_build_object(
    'indice', p_indice,
    'de', min(mes), 'ate', max(mes),
    'meses', count(percentual),
    'faltam', coalesce(jsonb_agg(to_char(mes, 'MM/YYYY') order by mes) filter (where percentual is null), '[]'::jsonb),
    'percentual', case when count(percentual) = 12
                       then round((exp(sum(ln(1 + percentual / 100))) - 1) * 100, 4) end)
  from achados
$$;
revoke all on function app.fin_indice_acumulado(text, date) from public, anon, authenticated;
comment on function app.fin_indice_acumulado(text, date) is
  'Acumulado (%) de 12 meses do índice até o mês anterior à referência, por produto de (1 + %/100); nulo se faltar mês (041).';

/**
 * Mês de reajuste pendente do contrato (ou nulo): o último mês do reajuste que já chegou, desde que o contrato tenha
 * feito 12 meses até lá, que seja depois do mês em que o contrato entrou no HUB (o valor informado no cadastro já é o
 * do ciclo) e que esse ciclo ainda não tenha reajuste confirmado. Só contrato ativo com índice ou % fixo.
 */
create or replace function app.fin_reajuste_pendente(p_contrato uuid)
returns date language plpgsql stable security definer set search_path = public as $$
declare k fin_recorrentes; v_mes date; v_ref date;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null or k.situacao <> 'ativo' or k.indice = 'nenhum' or k.mes_reajuste is null then return null; end if;
  v_mes := date_trunc('month', app.hoje(k.org_id))::date;
  v_ref := make_date(extract(year from v_mes)::int, k.mes_reajuste, 1);
  if v_ref > v_mes then v_ref := (v_ref - interval '1 year')::date; end if;
  if v_ref < (k.inicio + interval '12 months')::date or v_ref <= k.mes_cadastro then return null; end if;
  if exists (select 1 from fin_recorrente_reajustes where recorrente_id = k.id and origem = 'reajuste' and referencia = v_ref) then
    return null;
  end if;
  return v_ref;
end $$;
revoke all on function app.fin_reajuste_pendente(uuid) from public, anon, authenticated;

/** Próximo mês de reajuste (o pendente, ou o próximo aniversário), para a tela mostrar "reajuste em 03/2027". */
create or replace function app.fin_reajuste_proximo(p_contrato uuid)
returns date language plpgsql stable security definer set search_path = public as $$
declare k fin_recorrentes; v_mes date; v_ref date;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null or k.indice = 'nenhum' or k.mes_reajuste is null then return null; end if;
  v_ref := app.fin_reajuste_pendente(k.id);
  if v_ref is not null then return v_ref; end if;
  v_mes := date_trunc('month', app.hoje(k.org_id))::date;
  v_ref := make_date(extract(year from v_mes)::int, k.mes_reajuste, 1);
  while v_ref <= v_mes or v_ref < (k.inicio + interval '12 months')::date or v_ref <= k.mes_cadastro loop
    v_ref := (v_ref + interval '1 year')::date;
  end loop;
  return v_ref;
end $$;
revoke all on function app.fin_reajuste_proximo(uuid) from public, anon, authenticated;

-- ===================================================================================================== 5 índices do Banco Central
/**
 * Grava a série no formato da API SGS do Banco Central: [{"data":"01/10/2026","valor":"0.56"}, ...] (valor em %).
 * Mês já gravado é atualizado (o BC às vezes revisa). Devolve quantos meses entraram ou mudaram.
 */
create or replace function app.fin_indices_gravar(p_indice text, p_serie jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare e jsonb; v_mes date; v_pct numeric; n int := 0; v_qtd int;
begin
  if app.fin_codigo_indice(p_indice) is null then raise exception 'Índice desconhecido: %', p_indice; end if;
  if p_serie is null or jsonb_typeof(p_serie) <> 'array' then raise exception 'Resposta do Banco Central fora do formato esperado'; end if;
  for e in select * from jsonb_array_elements(p_serie) loop
    v_mes := date_trunc('month', to_date(e->>'data', 'DD/MM/YYYY'))::date;
    v_pct := replace(e->>'valor', ',', '.')::numeric;
    insert into fin_indices (indice, mes, percentual) values (p_indice, v_mes, v_pct)
    on conflict (indice, mes) do update set percentual = excluded.percentual, atualizado_em = now()
      where fin_indices.percentual is distinct from excluded.percentual;
    get diagnostics v_qtd = row_count;
    n := n + v_qtd;
  end loop;
  return n;
end $$;
revoke all on function app.fin_indices_gravar(text, jsonb) from public, anon, authenticated;

/** Pede ao Banco Central (pg_net) os últimos 24 meses de IPCA, INPC e IGP-M. Sem pg_net, não faz nada. */
create or replace function app.fin_indices_pedir()
returns int language plpgsql security definer set search_path = public as $$
declare v_ind text; v_id bigint; n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net indisponível: índices não foram buscados';
    return 0;
  end if;
  foreach v_ind in array array['IPCA', 'INPC', 'IGP-M'] loop
    v_id := net.http_get(
      url := format('https://api.bcb.gov.br/dados/serie/bcdata.sgs.%s/dados?formato=json&dataInicial=%s&dataFinal=%s',
                    app.fin_codigo_indice(v_ind),
                    to_char(date_trunc('month', v_hoje) - interval '24 months', 'DD/MM/YYYY'), to_char(v_hoje, 'DD/MM/YYYY')),
      headers := jsonb_build_object('Accept', 'application/json'),
      timeout_milliseconds := 30000);
    insert into app.fin_indices_pedidos (pedido, indice) values (v_id, v_ind) on conflict (pedido) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.fin_indices_pedir() from public, anon, authenticated;

/** Lê as respostas que chegaram em net._http_response e grava em fin_indices. Pedido sem resposta em 1 hora expira. */
create or replace function app.fin_indices_ler()
returns int language plpgsql security definer set search_path = public as $$
declare p record; v_status int; v_corpo text; v_erro text; n int := 0; v_qtd int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  for p in select * from app.fin_indices_pedidos where lido_em is null order by pedido for update skip locked loop
    v_status := null;
    execute 'select status_code, content, error_msg from net._http_response where id = $1'
      into v_status, v_corpo, v_erro using p.pedido;
    if v_status is null and v_erro is null then
      if p.pedido_em < now() - interval '1 hour' then
        update app.fin_indices_pedidos set lido_em = now(), resultado = 'sem resposta' where pedido = p.pedido;
      end if;
      continue;
    end if;
    begin
      if v_status <> 200 then raise exception 'Banco Central respondeu % %', v_status, coalesce(v_erro, ''); end if;
      v_qtd := app.fin_indices_gravar(p.indice, v_corpo::jsonb);
      update app.fin_indices_pedidos set lido_em = now(), resultado = format('ok: %s mês(es) novos ou revistos', v_qtd) where pedido = p.pedido;
      n := n + v_qtd;
    exception when others then
      update app.fin_indices_pedidos set lido_em = now(), resultado = left('erro: ' || sqlerrm, 300) where pedido = p.pedido;
    end;
  end loop;
  return n;
end $$;
revoke all on function app.fin_indices_ler() from public, anon, authenticated;

-- ===================================================================================================== funções da tela
/** Confere os cadastros do contrato (mesma empresa, categoria do tipo certo e ativa) e devolve o fornecedor/cliente. */
create or replace function app.fin_recorrente_conferir(p_cliente uuid, p_org uuid, p_tipo text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pessoa uuid := app.uuid_campo(p->>'pessoa', 'fornecedor/cliente'); v_nome text := nullif(trim(p->>'pessoa_nome'), '');
  v_cat uuid := app.uuid_campo(p->>'categoria', 'categoria'); v_tipo_cat text;
begin
  select tipo into v_tipo_cat from fin_categorias where id = v_cat and cliente_id = p_cliente and ativo;
  if v_tipo_cat is null then raise exception 'Escolha uma categoria ativa desta empresa'; end if;
  if (p_tipo = 'pagar' and v_tipo_cat <> 'despesa') or (p_tipo = 'receber' and v_tipo_cat <> 'receita') then
    raise exception 'Contrato a pagar usa categoria de despesa; a receber, categoria de receita';
  end if;
  if app.uuid_campo(p->>'centro', 'centro de custo') is not null and not exists (
       select 1 from fin_centros_custo where id = app.uuid_campo(p->>'centro', 'centro de custo') and cliente_id = p_cliente) then
    raise exception 'Centro de custo não encontrado nesta empresa';
  end if;
  if app.uuid_campo(p->>'conta_prevista', 'banco previsto') is not null and not exists (
       select 1 from fin_contas_bancarias where id = app.uuid_campo(p->>'conta_prevista', 'banco previsto') and cliente_id = p_cliente) then
    raise exception 'Conta bancária não encontrada nesta empresa';
  end if;
  if v_pessoa is not null then
    if not exists (select 1 from fin_pessoas where id = v_pessoa and cliente_id = p_cliente) then
      raise exception 'Fornecedor/cliente não encontrado nesta empresa';
    end if;
  elsif v_nome is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = p_cliente and lower(nome) = lower(v_nome) order by ativo desc, criado_em limit 1;
    if v_pessoa is null then
      insert into fin_pessoas (org_id, cliente_id, tipo, nome)
      values (p_org, p_cliente, case when p_tipo = 'pagar' then 'fornecedor' else 'cliente' end, v_nome)
      returning id into v_pessoa;
    end if;
  else
    raise exception 'Informe o % do contrato', case when p_tipo = 'pagar' then 'fornecedor' else 'cliente' end;
  end if;
  return v_pessoa;
end $$;
revoke all on function app.fin_recorrente_conferir(uuid, uuid, text, jsonb) from public, anon, authenticated;

/**
 * Cria ou edita um contrato fixo (Financeiro: operar). p: id?, cliente, tipo (só ao criar), pessoa | pessoa_nome,
 * descricao, valor, dia, categoria, centro?, conta_prevista?, inicio (mês), gerar_desde? (mês; padrão o mês atual),
 * fim? (mês), indice, percentual_fixo?, mes_reajuste?, observacao?.
 * Criar já lança a conta do mês atual (se o contrato vale neste mês). Editar vale para as próximas contas: as já
 * lançadas não mudam (mude-as em Contas a pagar/receber). Mudança de valor fica no histórico do contrato.
 */
create or replace function public.fin_recorrente_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := app.uuid_campo(p->>'id', 'contrato'); k fin_recorrentes; v_cliente uuid; v_org uuid; v_tipo text;
  v_hoje date; v_mes date; v_pessoa uuid; v_valor numeric := round(app.numero_campo(p->>'valor', 'valor'), 2);
  v_dia int := app.numero_campo(p->>'dia', 'dia do vencimento')::int;
  v_vig_ini date := app.data_campo(coalesce(p->>'vigencia_inicio', p->>'inicio'), 'início da vigência');
  v_vig_fim date := app.data_campo(coalesce(p->>'vigencia_fim', p->>'fim'), 'fim da vigência');
  v_renova boolean := coalesce((p->>'renovacao_automatica')::boolean, false);
  v_aviso int := coalesce(app.numero_campo(p->>'aviso_dias', 'dias de aviso')::int, 30);
  v_gera boolean := coalesce((p->>'gera_contas')::boolean, true);
  v_inicio date := date_trunc('month', v_vig_ini)::date;
  v_fim date;
  v_desde date := date_trunc('month', app.data_campo(p->>'gerar_desde', 'primeira conta'))::date;
  v_indice text := coalesce(nullif(p->>'indice', ''), 'nenhum');
  v_fixo numeric := app.numero_campo(p->>'percentual_fixo', 'percentual fixo');
  v_mes_reaj int := app.numero_campo(p->>'mes_reajuste', 'mês do reajuste')::int;
  v_geradas int := 0;
begin
  if v_id is not null then
    select * into k from fin_recorrentes where id = v_id for update;
    if k.id is null then raise exception 'Contrato não encontrado'; end if;
    v_cliente := k.cliente_id; v_tipo := k.tipo;
  else
    v_cliente := app.uuid_campo(p->>'cliente', 'empresa');
    v_tipo := p->>'tipo';
  end if;
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'operar') then
    raise exception 'Sem permissão para cadastrar contratos desta empresa (módulo Contratos)';
  end if;
  if k.id is not null and k.situacao = 'encerrado' then raise exception 'Contrato encerrado não se edita'; end if;
  if v_tipo is null or v_tipo not in ('pagar', 'receber') then raise exception 'Escolha se o contrato é a pagar ou a receber'; end if;
  if coalesce(trim(p->>'descricao'), '') = '' then raise exception 'Escreva a descrição do contrato (ex.: Aluguel da sala)'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor mensal (maior que zero)'; end if;
  if v_dia is null or v_dia < 1 or v_dia > 31 then raise exception 'Dia do vencimento: de 1 a 31'; end if;
  if v_inicio is null then raise exception 'Informe o início da vigência do contrato'; end if;
  if v_vig_fim is not null and v_vig_fim < v_vig_ini then raise exception 'O fim da vigência precisa ser depois do início'; end if;
  if v_renova and v_vig_fim is null then raise exception 'Renovação automática precisa da data de fim da vigência'; end if;
  if v_aviso < 0 or v_aviso > 365 then raise exception 'Aviso antes do fim: de 0 a 365 dias'; end if;
  -- sem renovação automática, as contas param no mês do fim da vigência
  v_fim := case when v_vig_fim is not null and not v_renova then date_trunc('month', v_vig_fim)::date end;
  if v_indice not in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum') then raise exception 'Reajuste: IPCA, IGP-M, INPC, %% fixo ou sem reajuste'; end if;
  if v_indice = 'fixo' and (v_fixo is null or v_fixo <= -50 or v_fixo > 100) then
    raise exception 'Informe o percentual fixo do reajuste (de -50%% a 100%%)';
  end if;
  if v_indice <> 'nenhum' and (v_mes_reaj is null or v_mes_reaj < 1 or v_mes_reaj > 12) then
    raise exception 'Escolha o mês do reajuste';
  end if;
  v_hoje := app.hoje(v_org);
  v_mes := date_trunc('month', v_hoje)::date;
  v_pessoa := app.fin_recorrente_conferir(v_cliente, v_org, v_tipo, p);

  if k.id is null then
    v_desde := coalesce(v_desde, greatest(v_mes, v_inicio));
    if v_desde < v_mes then raise exception 'A primeira conta lançada pelo HUB é a deste mês ou de um mês futuro'; end if;
    if v_desde < v_inicio then raise exception 'A primeira conta não pode ser antes do início do contrato'; end if;
    if v_fim is not null and v_fim < v_desde then raise exception 'A vigência termina antes da primeira conta: confira as datas'; end if;
    insert into fin_recorrentes (org_id, cliente_id, tipo, pessoa_id, descricao, valor, dia_vencimento, categoria_id, centro_id,
                                 conta_prevista_id, inicio, gerar_desde, fim, mes_cadastro, indice, percentual_fixo, mes_reajuste, observacao,
                                 numero, objeto, vigencia_inicio, vigencia_fim, renovacao_automatica, aviso_dias, gera_contas, por)
    values (v_org, v_cliente, v_tipo, v_pessoa, trim(p->>'descricao'), v_valor, v_dia, app.uuid_campo(p->>'categoria', 'categoria'),
            app.uuid_campo(p->>'centro', 'centro de custo'), app.uuid_campo(p->>'conta_prevista', 'banco previsto'),
            v_inicio, v_desde, v_fim, v_mes, v_indice, case when v_indice = 'fixo' then v_fixo end,
            case when v_indice <> 'nenhum' then v_mes_reaj end, nullif(trim(p->>'observacao'), ''),
            nullif(trim(p->>'numero'), ''), nullif(trim(p->>'objeto'), ''), v_vig_ini, v_vig_fim, v_renova, v_aviso, v_gera, auth.uid())
    returning * into k;
    perform app.registrar(v_org, 'contratos', 'contrato_criar', k.id::text, null, to_jsonb(k));
    perform app.fin_recorrente_evento(k.id, 'criado', format('Contrato cadastrado: %s por mês%s', app.fin_brl(v_valor),
      case when v_gera then format(', primeira conta em %s', to_char(v_desde, 'MM/YYYY')) else ' (não lança contas)' end));
  else
    if p ? 'tipo' and p->>'tipo' is distinct from k.tipo then raise exception 'O tipo do contrato (a pagar/receber) não muda'; end if;
    -- primeira conta: só muda enquanto nada foi lançado
    if k.ultima_competencia is not null then
      v_desde := k.gerar_desde;
    else
      v_desde := coalesce(v_desde, k.gerar_desde);
      if v_desde < v_mes then raise exception 'A primeira conta lançada pelo HUB é a deste mês ou de um mês futuro'; end if;
    end if;
    if v_desde < v_inicio then raise exception 'A primeira conta não pode ser antes do início do contrato'; end if;
    if v_fim is not null and v_fim < greatest(v_desde, coalesce(k.ultima_competencia, v_desde)) then
      raise exception 'O fim da vigência não pode ser antes do último mês já lançado (%)', to_char(coalesce(k.ultima_competencia, v_desde), 'MM/YYYY');
    end if;
    update fin_recorrentes
       set pessoa_id = v_pessoa, descricao = trim(p->>'descricao'), valor = v_valor, dia_vencimento = v_dia,
           categoria_id = app.uuid_campo(p->>'categoria', 'categoria'), centro_id = app.uuid_campo(p->>'centro', 'centro de custo'),
           conta_prevista_id = app.uuid_campo(p->>'conta_prevista', 'banco previsto'), inicio = v_inicio, gerar_desde = v_desde,
           fim = v_fim, indice = v_indice, percentual_fixo = case when v_indice = 'fixo' then v_fixo end,
           mes_reajuste = case when v_indice <> 'nenhum' then v_mes_reaj end, observacao = nullif(trim(p->>'observacao'), ''),
           numero = nullif(trim(p->>'numero'), ''), objeto = nullif(trim(p->>'objeto'), ''), vigencia_inicio = v_vig_ini,
           vigencia_fim = v_vig_fim, renovacao_automatica = v_renova, aviso_dias = v_aviso, gera_contas = v_gera,
           aviso_fim_enviado = case when v_vig_fim is distinct from k.vigencia_fim then null else aviso_fim_enviado end,
           atualizado_em = now()
     where id = k.id;
    if v_valor <> k.valor then
      insert into fin_recorrente_reajustes (org_id, cliente_id, recorrente_id, origem, valor_antes, valor_depois, observacao, por)
      values (k.org_id, k.cliente_id, k.id, 'edicao', k.valor, v_valor, 'Valor alterado na edição do contrato', auth.uid());
      perform app.fin_recorrente_evento(k.id, 'valor', format('Valor mensal alterado na edição: %s → %s (vale para as próximas contas)',
        app.fin_brl(k.valor), app.fin_brl(v_valor)));
    end if;
    perform app.fin_recorrente_evento(k.id, 'editado', 'Dados do contrato editados');
    perform app.registrar(k.org_id, 'contratos', 'contrato_editar', k.id::text, to_jsonb(k),
      (select to_jsonb(x) from fin_recorrentes x where x.id = k.id));
  end if;

  -- a conta deste mês sai na hora (as próximas, no dia 1 de cada mês)
  if k.situacao = 'ativo' and v_gera then v_geradas := app.fin_recorrentes_gerar(v_org, v_mes, k.id); end if;
  return jsonb_build_object('id', k.id, 'geradas', v_geradas);
end $$;
comment on function public.fin_recorrente_salvar(jsonb) is
  'Cria ou edita contrato (Contratos: operar). Criar já lança a conta do mês atual; editar vale para as próximas contas; valor alterado fica no histórico (041).';

/** Suspende (para de lançar) com motivo. */
create or replace function public.fin_recorrente_suspender(p_contrato uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para suspender contratos'; end if;
  if k.situacao <> 'ativo' then raise exception 'Só contrato ativo pode ser suspenso'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da suspensão'; end if;
  update fin_recorrentes set situacao = 'suspenso', situacao_motivo = trim(p_motivo), situacao_em = now(), situacao_por = auth.uid(),
         atualizado_em = now() where id = k.id;
  perform app.registrar(k.org_id, 'contratos', 'contrato_suspender', k.id::text, to_jsonb(k), jsonb_build_object('motivo', trim(p_motivo)));
  perform app.fin_recorrente_evento(k.id, 'suspenso', 'Suspenso: ' || trim(p_motivo));
end $$;

/** Reativa contrato suspenso com motivo: volta a lançar a partir deste mês (os meses suspensos não são lançados). */
create or replace function public.fin_recorrente_reativar(p_contrato uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_mes date; n int;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para reativar contratos'; end if;
  if k.situacao <> 'suspenso' then raise exception 'Só contrato suspenso pode ser reativado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da reativação'; end if;
  v_mes := date_trunc('month', app.hoje(k.org_id))::date;
  if k.fim is not null and k.fim < v_mes then raise exception 'O fim deste contrato já passou: encerre-o ou mude o fim antes'; end if;
  update fin_recorrentes set situacao = 'ativo', situacao_motivo = trim(p_motivo), situacao_em = now(), situacao_por = auth.uid(),
         gerar_desde = greatest(gerar_desde, v_mes), atualizado_em = now() where id = k.id;
  perform app.registrar(k.org_id, 'contratos', 'contrato_reativar', k.id::text, to_jsonb(k), jsonb_build_object('motivo', trim(p_motivo)));
  perform app.fin_recorrente_evento(k.id, 'reativado', format('Reativado (volta a lançar em %s): %s', to_char(v_mes, 'MM/YYYY'), trim(p_motivo)));
  n := app.fin_recorrentes_gerar(k.org_id, v_mes, k.id);
  return jsonb_build_object('geradas', n);
end $$;

/** Encerra agora (com motivo): não lança mais nenhuma conta. A conta deste mês, se já lançada, continua como está. */
create or replace function public.fin_recorrente_encerrar(p_contrato uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_hoje date;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para encerrar contratos'; end if;
  if k.situacao = 'encerrado' then raise exception 'Este contrato já está encerrado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do encerramento'; end if;
  v_hoje := app.hoje(k.org_id);
  update fin_recorrentes
     set situacao = 'encerrado', situacao_motivo = trim(p_motivo), situacao_em = now(), situacao_por = auth.uid(), encerrado_em = v_hoje,
         fim = greatest(gerar_desde, least(coalesce(fim, date_trunc('month', v_hoje)::date), coalesce(ultima_competencia, gerar_desde))),
         atualizado_em = now()
   where id = k.id;
  perform app.registrar(k.org_id, 'contratos', 'contrato_encerrar', k.id::text, to_jsonb(k), jsonb_build_object('motivo', trim(p_motivo)));
  perform app.fin_recorrente_evento(k.id, 'encerrado', 'Encerrado: ' || trim(p_motivo));
end $$;

/**
 * Proposta de reajuste do contrato: lê antes as respostas do Banco Central que já chegaram. Devolve o mês de
 * referência (pendente ou o próximo), o acumulado (ou o % fixo), meses que faltam, valor atual e novo, e as contas
 * já lançadas do ciclo que ainda dá para atualizar (em aberto, sem pagamento).
 */
create or replace function public.fin_recorrente_proposta(p_contrato uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_ref date; v_pend boolean; v_acum jsonb; v_pct numeric; v_abertas jsonb;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null or not app.contratos_pode(k.cliente_id, 'ver') then raise exception 'Contrato não encontrado'; end if;
  if k.indice = 'nenhum' then raise exception 'Este contrato está marcado como sem reajuste'; end if;
  begin
    perform app.fin_indices_ler();
  exception when others then null;   -- a proposta sai com os índices que já existem
  end;
  v_ref := app.fin_reajuste_pendente(k.id);
  v_pend := v_ref is not null;
  v_ref := coalesce(v_ref, app.fin_reajuste_proximo(k.id));
  if k.indice = 'fixo' then
    v_pct := k.percentual_fixo;
    v_acum := jsonb_build_object('indice', 'fixo', 'meses', 12, 'faltam', '[]'::jsonb);
  else
    v_acum := app.fin_indice_acumulado(k.indice, v_ref);
    v_pct := (v_acum->>'percentual')::numeric;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'competencia', t.competencia, 'valor', t.valor) order by t.competencia), '[]')
    into v_abertas
    from fin_titulos t where t.recorrente_id = k.id and t.competencia >= v_ref and t.situacao = 'aberto' and t.valor_pago = 0;
  return v_acum || jsonb_build_object(
    'contrato', k.id, 'referencia', v_ref, 'pendente', v_pend, 'tipo', k.indice,
    'percentual', round(v_pct, 4), 'valor_atual', k.valor,
    'valor_novo', case when v_pct is not null then round(k.valor * (1 + v_pct / 100), 2) end,
    'contas_em_aberto', v_abertas,
    'indices_atualizados_em', (select max(atualizado_em) from fin_indices where indice = k.indice));
end $$;
comment on function public.fin_recorrente_proposta(uuid) is
  'Proposta de reajuste: acumulado de 12 meses do índice até o mês anterior ao reajuste (ou % fixo), valor atual e novo (041).';

/**
 * Confirma o reajuste do ciclo pendente (Financeiro: operar). O % vem da proposta, mas a pessoa pode ajustar
 * (fica gravado o proposto e o aplicado). As contas já lançadas não mudam, salvo p_atualizar_abertas: as do ciclo
 * (mês do reajuste em diante) ainda em aberto e sem pagamento passam para o valor novo.
 */
create or replace function public.fin_recorrente_reajustar(p_contrato uuid, p_percentual numeric, p_obs text default null,
                                                           p_atualizar_abertas boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_ref date; v_novo numeric; v_proposto numeric; n int := 0;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para reajustar contratos'; end if;
  if k.situacao <> 'ativo' then raise exception 'Só contrato ativo é reajustado'; end if;
  v_ref := app.fin_reajuste_pendente(k.id);
  if v_ref is null then raise exception 'Não há reajuste pendente para este contrato agora'; end if;
  if p_percentual is null or p_percentual <= -50 or p_percentual > 100 then
    raise exception 'Percentual de reajuste fora do esperado (de -50%% a 100%%)';
  end if;
  v_proposto := case when k.indice = 'fixo' then k.percentual_fixo
                     else (app.fin_indice_acumulado(k.indice, v_ref)->>'percentual')::numeric end;
  v_novo := round(k.valor * (1 + p_percentual / 100), 2);
  if v_novo <= 0 then raise exception 'O valor reajustado precisa ser maior que zero'; end if;
  if p_atualizar_abertas then
    update fin_titulos set valor = v_novo
     where recorrente_id = k.id and competencia >= v_ref and situacao = 'aberto' and valor_pago = 0 and valor <> v_novo;
    get diagnostics n = row_count;
  end if;
  insert into fin_recorrente_reajustes (org_id, cliente_id, recorrente_id, origem, referencia, indice, percentual, percentual_proposto,
                                        valor_antes, valor_depois, titulos_atualizados, observacao, por)
  values (k.org_id, k.cliente_id, k.id, 'reajuste', v_ref, k.indice, round(p_percentual, 4), round(v_proposto, 4),
          k.valor, v_novo, n, nullif(trim(p_obs), ''), auth.uid());
  update fin_recorrentes set valor = v_novo, atualizado_em = now() where id = k.id;
  perform app.fin_recorrente_evento(k.id, 'reajuste', format('Reajuste de %s (%s %s%%): %s → %s%s', to_char(v_ref, 'MM/YYYY'),
    case when k.indice = 'fixo' then 'fixo' else k.indice end, replace(round(p_percentual, 4)::text, '.', ','), app.fin_brl(k.valor),
    app.fin_brl(v_novo), case when n > 0 then format('; %s conta(s) em aberto atualizada(s)', n) else '' end));
  perform app.registrar(k.org_id, 'contratos', 'contrato_reajustar', k.id::text, jsonb_build_object('valor', k.valor),
    jsonb_build_object('valor', v_novo, 'referencia', v_ref, 'indice', k.indice, 'percentual', p_percentual,
                       'proposto', v_proposto, 'contas_atualizadas', n, 'obs', p_obs));
  return jsonb_build_object('valor', v_novo, 'referencia', v_ref, 'contas_atualizadas', n);
end $$;
comment on function public.fin_recorrente_reajustar(uuid, numeric, text, boolean) is
  'Confirma o reajuste do ciclo pendente (operar); grava o histórico. Contas já lançadas não mudam, salvo as em aberto do ciclo se pedido (041).';

/** Registra no histórico o anexo enviado (hub_arquivos com app 'contratos' e ref_id = contrato). */
create or replace function public.fin_recorrente_anexo(p_contrato uuid, p_arquivo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_nome text;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para anexar arquivos ao contrato'; end if;
  select nome into v_nome from hub_arquivos where id = p_arquivo and org_id = k.org_id and app = 'contratos' and ref_id = k.id;
  if v_nome is null then raise exception 'Arquivo não encontrado neste contrato'; end if;
  perform app.fin_recorrente_evento(k.id, 'anexo', 'Arquivo anexado: ' || v_nome, jsonb_build_object('arquivo', p_arquivo));
end $$;
comment on function public.fin_recorrente_anexo(uuid, uuid) is 'Anota no histórico do contrato o arquivo anexado (Contratos: operar) (041).';

/** "Buscar índices agora" (quem opera o Financeiro): pede ao Banco Central, no máximo uma vez a cada 10 minutos. */
create or replace function public.fin_indices_atualizar(p_cliente uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not app.contratos_pode(p_cliente, 'operar') then raise exception 'Sem permissão para buscar os índices'; end if;
  perform app.fin_indices_ler();
  if not exists (select 1 from app.fin_indices_pedidos where pedido_em > now() - interval '10 minutes') then
    n := app.fin_indices_pedir();
  end if;
  return jsonb_build_object('pedidos', n,
    'ultimos', (select jsonb_object_agg(indice, to_char(ultimo, 'MM/YYYY'))
                  from (select indice, max(mes) as ultimo from fin_indices group by indice) x));
end $$;
comment on function public.fin_indices_atualizar(uuid) is
  'Pede ao Banco Central os índices de reajuste (no máximo a cada 10 minutos) e lê o que já chegou (041).';

-- ===================================================================================================== 3 rotina diária
/**
 * Roda todo dia (pg_cron financeiro-recorrentes, 06h30 de Brasília): lê os índices que chegaram; lança a conta do mês
 * atual e do anterior (recuperação, sem duplicar); encerra os contratos cujo fim passou; avisa no sino os reajustes
 * que chegaram ao mês deles (uma vez por ciclo), para os administradores e quem tem Financeiro gerir.
 */
create or replace function app.fin_recorrentes_rotina()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record; k record; u record; v_mes date; v_ger int := 0; v_enc int := 0; v_avisos int := 0; v_ind int := 0;
  v_nomes text[]; v_ids uuid[]; v_refs date[]; v_hoje date; v_novo date; v_fins text[]; v_ren int := 0;
begin
  begin
    v_ind := app.fin_indices_ler();
  exception when others then
    raise notice 'Leitura dos índices falhou: %', sqlerrm;
  end;
  for o in select distinct org_id as id from fin_recorrentes where situacao <> 'encerrado' loop
    v_hoje := app.hoje(o.id);
    v_mes := date_trunc('month', v_hoje)::date;

    -- renovação automática: a vigência que acabou ganha mais 12 meses (quantas vezes precisar)
    for k in select * from fin_recorrentes where org_id = o.id and situacao <> 'encerrado' and renovacao_automatica
                and vigencia_fim is not null and vigencia_fim < v_hoje order by id for update loop
      v_novo := k.vigencia_fim;
      while v_novo < v_hoje loop v_novo := (v_novo + interval '12 months')::date; end loop;
      update fin_recorrentes set vigencia_fim = v_novo, aviso_fim_enviado = null, atualizado_em = now() where id = k.id;
      perform app.fin_recorrente_evento(k.id, 'renovado', format('Renovado automaticamente: vigência até %s', to_char(v_novo, 'DD/MM/YYYY')));
      perform app.registrar(o.id, 'contratos', 'contrato_renovar', k.id::text, jsonb_build_object('vigencia_fim', k.vigencia_fim),
        jsonb_build_object('vigencia_fim', v_novo, 'por', 'rotina diária'));
      v_ren := v_ren + 1;
    end loop;

    v_ger := v_ger + app.fin_recorrentes_gerar(o.id, v_mes) + app.fin_recorrentes_gerar(o.id, (v_mes - interval '1 month')::date);

    for k in select * from fin_recorrentes where org_id = o.id and situacao <> 'encerrado' and fim is not null and fim < v_mes
              order by id for update loop
      update fin_recorrentes set situacao = 'encerrado', situacao_motivo = 'Fim do prazo do contrato', situacao_em = now(),
             encerrado_em = (k.fim + interval '1 month - 1 day')::date, atualizado_em = now() where id = k.id;
      perform app.fin_recorrente_evento(k.id, 'encerrado', 'Encerrado pela rotina: fim do prazo do contrato');
      perform app.registrar(o.id, 'contratos', 'contrato_encerrar', k.id::text, to_jsonb(k),
        jsonb_build_object('motivo', 'Fim do prazo do contrato', 'por', 'rotina diária'));
      v_enc := v_enc + 1;
    end loop;

    select array_agg(descricao order by descricao), array_agg(id order by descricao), array_agg(ref order by descricao)
      into v_nomes, v_ids, v_refs
      from (select r.id, r.descricao, app.fin_reajuste_pendente(r.id) as ref from fin_recorrentes r
             where r.org_id = o.id and r.situacao = 'ativo' and r.indice <> 'nenhum') x
     where ref is not null and ref is distinct from (select reajuste_avisado from fin_recorrentes where id = x.id);
    if coalesce(cardinality(v_ids), 0) > 0 then
      for u in select m.user_id from membros m
                where m.org_id = o.id and m.ativo
                  and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id
                                                            and a.app = 'contratos' and a.papel = 'gerir'))
      loop
        perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: reajuste do mês',
          format('%s contrato(s) chegaram ao mês do reajuste: %s. Confira a proposta e confirme.', cardinality(v_ids),
                 array_to_string(v_nomes[1:5], ', ') || case when cardinality(v_ids) > 5 then '…' else '' end),
          '/contratos/reajustes');
        v_avisos := v_avisos + 1;
      end loop;
      for i in 1 .. cardinality(v_ids) loop
        update fin_recorrentes set reajuste_avisado = v_refs[i] where id = v_ids[i];
        perform app.fin_recorrente_evento(v_ids[i], 'aviso', format('Aviso no sino: reajuste de %s pendente', to_char(v_refs[i], 'MM/YYYY')));
      end loop;
    end if;

    -- aviso de fim (ou renovação) da vigência, X dias antes, uma vez por vigência
    select array_agg(id order by vigencia_fim), array_agg(format('%s (%s %s)', descricao,
             case when renovacao_automatica then 'renova em' else 'termina em' end, to_char(vigencia_fim, 'DD/MM/YYYY')) order by vigencia_fim)
      into v_ids, v_fins
      from fin_recorrentes
     where org_id = o.id and situacao <> 'encerrado' and vigencia_fim is not null and vigencia_fim >= v_hoje
       and vigencia_fim - aviso_dias <= v_hoje and aviso_fim_enviado is distinct from vigencia_fim;
    if coalesce(cardinality(v_ids), 0) > 0 then
      for u in select m.user_id from membros m
                where m.org_id = o.id and m.ativo
                  and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id
                                                            and a.app = 'contratos' and a.papel = 'gerir'))
      loop
        perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: fim de vigência chegando',
          format('%s contrato(s): %s.', cardinality(v_ids), array_to_string(v_fins[1:5], '; ') ||
                 case when cardinality(v_ids) > 5 then '…' else '' end), '/contratos');
        v_avisos := v_avisos + 1;
      end loop;
      for i in 1 .. cardinality(v_ids) loop
        update fin_recorrentes set aviso_fim_enviado = vigencia_fim where id = v_ids[i];
        perform app.fin_recorrente_evento(v_ids[i], 'aviso', 'Aviso no sino: fim da vigência chegando');
      end loop;
    end if;
  end loop;
  return jsonb_build_object('geradas', v_ger, 'encerrados', v_enc, 'renovados', v_ren, 'avisos', v_avisos, 'indices', v_ind);
end $$;
revoke all on function app.fin_recorrentes_rotina() from public, anon, authenticated;
comment on function app.fin_recorrentes_rotina() is
  'pg_cron financeiro-recorrentes (06h30 de Brasília): lê índices, renova vigências automáticas, lança as contas do mês (e recupera o anterior) sem duplicar, encerra contratos vencidos e avisa no sino reajustes e fins de vigência (041).';

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'fin-indices-buscar') then perform cron.unschedule('fin-indices-buscar'); end if;
    perform cron.schedule('fin-indices-buscar', '20 9 * * *', 'select app.fin_indices_pedir()');               -- 09:20 UTC = 06:20 Brasília
    if exists (select 1 from cron.job where jobname = 'financeiro-recorrentes') then perform cron.unschedule('financeiro-recorrentes'); end if;
    perform cron.schedule('financeiro-recorrentes', '30 9 * * *', 'select app.fin_recorrentes_rotina()');      -- 09:30 UTC = 06:30 Brasília
  else
    raise notice 'pg_cron indisponível: as rotinas fin-indices-buscar e financeiro-recorrentes não foram agendadas';
  end if;
end $$;

-- ===================================================================================================== permissões das funções
do $$
declare f text;
begin
  foreach f in array array['public.fin_recorrente_salvar(jsonb)', 'public.fin_recorrente_suspender(uuid, text)',
                           'public.fin_recorrente_reativar(uuid, text)', 'public.fin_recorrente_encerrar(uuid, text)',
                           'public.fin_recorrente_proposta(uuid)', 'public.fin_recorrente_reajustar(uuid, numeric, text, boolean)',
                           'public.fin_indices_atualizar(uuid)', 'public.fin_recorrente_anexo(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
