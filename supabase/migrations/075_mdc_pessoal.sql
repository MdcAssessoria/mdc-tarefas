-- =====================================================================================================
--  075 · MDC - Pessoal: finanças e tarefas da família dentro do HUB (pedido do Edvaldo, 14/11/2026)
--
--  O MDC - Pessoal é uma "tela separada" do HUB: mesmo banco e mesmo endereço, com entrada própria (/pessoal),
--  cadastro aberto, marca e menu próprios (Início, Tarefas, Finanças, Família). Cada família é uma organização com
--  tipo = 'pessoal'; o HUB da MDC mostra só as de tipo 'empresa' e o MDC - Pessoal só as de tipo 'pessoal'.
--
--  A família reaproveita o que o HUB já tem: a "empresa da Gestão" da organização (gestao_cliente_id) é a própria
--  família (cliente com regime 'pf'), então o Financeiro funciona igual; quem cria a família é administrador dela e
--  convida as outras pessoas por um convite com código (pessoal_convidar → pessoal_aceitar_convite), nunca pelos
--  convites do HUB ou do Portal. O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).
--
--  Regras (no banco):
--   - tipo da organização só muda por migração (gatilho barra a chamada direta);
--   - pessoal_criar_familia: qualquer pessoa logada, no máximo 3 famílias criadas por conta; já nasce com as
--     o plano de contas e as categorias de casa (moradia, mercado, saúde…), Tarefas e Finanças;
--   - pessoal_cadastro_tentativa: trava de cadastro aberto (no máximo 5 contas por hora por endereço de rede), só para a
--     função do servidor (pessoal-cadastro), que cria a conta com a chave de serviço.
-- =====================================================================================================

alter table public.organizacoes add column if not exists tipo text not null default 'empresa';
do $$ begin
  alter table public.organizacoes add constraint organizacoes_tipo_check check (tipo in ('empresa', 'pessoal'));
exception when duplicate_object then null; end $$;
alter table public.organizacoes add column if not exists criado_por uuid references auth.users(id) on delete set null;
comment on column public.organizacoes.tipo is
  'empresa = organização do HUB (escritório); pessoal = família do MDC - Pessoal (075). Só muda por migração.';

create or replace function app.tg_org_tipo_fixo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo is distinct from old.tipo and current_user in ('authenticated', 'anon') then
    raise exception 'O tipo da organização não pode ser trocado';
  end if;
  return new;
end $$;
revoke all on function app.tg_org_tipo_fixo() from public, anon, authenticated;
drop trigger if exists org_tipo_fixo on public.organizacoes;
create trigger org_tipo_fixo before update of tipo on public.organizacoes
  for each row execute function app.tg_org_tipo_fixo();

/* Famílias não recebem o que é do escritório (perfis da equipe, roteiros do Societário, produtos de licença e do
   Ledgra): os gatilhos de semente da organização passam a pular o tipo 'pessoal'. Mesmo corpo de antes para 'empresa'. */
create or replace function app.tg_org_semear()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pessoal' then return new; end if;
  perform app.semear_perfis(new.id);
  if to_regproc('app.semear_societario') is not null then
    execute 'select app.semear_societario($1)' using new.id;
  end if;
  return new;
end $$;
create or replace function app.tg_org_semear_licencas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pessoal' then return new; end if;
  perform app.lic_semear(new.id);
  return new;
end $$;
create or replace function app.tg_org_ledgra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pessoal' then return new; end if;
  perform app.lic_semear_ledgra(new.id);
  return new;
end $$;

/**
 * Plano de contas e categorias de casa com que toda família começa (o mesmo do financeiro pessoal montado em
 * 12/11/2026). Linha sintética = grupo; analítica = categoria (o Financeiro liga cada categoria a uma conta analítica).
 */
create or replace function app.pessoal_plano_padrao()
returns table (classificacao text, descricao text, analitica boolean) language sql immutable set search_path = '' as $$
  values
    ('1', 'RECEITAS', false),
    ('1.01', 'Salário e pró-labore', true), ('1.02', 'Distribuição de lucros', true), ('1.03', 'Aluguéis recebidos', true),
    ('1.04', 'Rendimentos de investimentos', true), ('1.05', 'Outras receitas', true),
    ('2', 'DESPESAS', false),
    ('2.01', 'Moradia', false),
    ('2.01.01', 'Aluguel ou financiamento', true), ('2.01.02', 'Condomínio', true), ('2.01.03', 'Energia elétrica', true),
    ('2.01.04', 'Água e gás', true), ('2.01.05', 'Internet e telefone', true), ('2.01.06', 'IPTU e manutenção da casa', true),
    ('2.02', 'Alimentação', false),
    ('2.02.01', 'Supermercado', true), ('2.02.02', 'Restaurantes e delivery', true),
    ('2.03', 'Transporte', false),
    ('2.03.01', 'Combustível', true), ('2.03.02', 'Manutenção do veículo', true), ('2.03.03', 'IPVA, seguro e licenciamento', true),
    ('2.04', 'Saúde', false),
    ('2.04.01', 'Plano de saúde', true), ('2.04.02', 'Consultas, exames e remédios', true),
    ('2.05', 'Educação', false),
    ('2.05.01', 'Escola, faculdade e cursos', true),
    ('2.06', 'Lazer', false),
    ('2.06.01', 'Lazer e viagens', true),
    ('2.07', 'Pessoais', false),
    ('2.07.01', 'Vestuário e cuidados pessoais', true), ('2.07.02', 'Assinaturas e aplicativos', true),
    ('2.08', 'Impostos e taxas', false),
    ('2.08.01', 'IRPF, impostos e taxas', true),
    ('2.09', 'Despesas financeiras', false),
    ('2.09.01', 'Tarifas bancárias e juros', true),
    ('2.10', 'Outras despesas', false),
    ('2.10.01', 'Outras despesas', true)
$$;
revoke all on function app.pessoal_plano_padrao() from public, anon, authenticated;


/* Trava do cadastro aberto: guarda só o resumo (hash) do endereço de rede, por uma hora. */
create table if not exists app.pessoal_cadastros (
  ip_hash   text not null,
  criado_em timestamptz not null default now()
);
create index if not exists pessoal_cadastros_ip on app.pessoal_cadastros (ip_hash, criado_em);
alter table app.pessoal_cadastros enable row level security;
revoke all on app.pessoal_cadastros from public, anon, authenticated;

/** Registra uma tentativa de cadastro e diz se ainda pode (5 por hora por endereço). Só a chave de serviço chama. */
create or replace function public.pessoal_cadastro_tentativa(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then raise exception 'Pedido inválido'; end if;
  delete from app.pessoal_cadastros where criado_em < now() - interval '1 day';
  select count(*) into v_n from app.pessoal_cadastros where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour';
  if v_n >= 5 then return false; end if;
  insert into app.pessoal_cadastros (ip_hash) values (p_ip_hash);
  return true;
end $$;
revoke all on function public.pessoal_cadastro_tentativa(text) from public, anon, authenticated;
grant execute on function public.pessoal_cadastro_tentativa(text) to service_role;

-- ===================================================================================================== Família: convite por código
/*
 * Segurança (cadastro aberto = qualquer pessoa é administradora da própria família): numa família ninguém entra pelos
 * convites do HUB (hub_convidar, adicionar_membro, Portal), que mexem com contas que já existem. Entra só quem
 * aceita um convite por código de uso único (pessoal_convidar → pessoal_aceitar_convite) ou quem criou a família.
 * O gatilho de membros confere a "porta de entrada" (app.pessoal_entradas, gravada pelas duas funções na mesma
 * transação). E a senha provisória do HUB não vale para quem está numa família (nem para o Portal de outra
 * organização): família redefine senha pelo suporte da MDC.
 */
create table if not exists app.pessoal_entradas (
  org_id    uuid not null references public.organizacoes(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  como      text not null check (como in ('criou', 'convite')),
  convite_id uuid,
  em        timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table app.pessoal_entradas enable row level security;
revoke all on app.pessoal_entradas from public, anon, authenticated;

create or replace function app.org_pessoal(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizacoes where id = p_org and tipo = 'pessoal')
$$;
revoke all on function app.org_pessoal(uuid) from public, anon;
grant execute on function app.org_pessoal(uuid) to authenticated;

create or replace function app.tg_pessoal_porta_membro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app.org_pessoal(new.org_id)
     and not exists (select 1 from app.pessoal_entradas e where e.org_id = new.org_id and e.user_id = new.user_id) then
    raise exception 'Na família só entra quem aceita o convite (código) enviado pelo responsável';
  end if;
  return new;
end $$;
revoke all on function app.tg_pessoal_porta_membro() from public, anon, authenticated;
drop trigger if exists pessoal_porta_membro on public.membros;
create trigger pessoal_porta_membro before insert on public.membros
  for each row execute function app.tg_pessoal_porta_membro();

create or replace function app.tg_pessoal_sem_convite_hub()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app.org_pessoal(new.org_id) then
    raise exception 'Família do MDC · Pessoal não usa convite do HUB nem Portal: use Família › Convidar';
  end if;
  return new;
end $$;
revoke all on function app.tg_pessoal_sem_convite_hub() from public, anon, authenticated;
drop trigger if exists pessoal_sem_convite on app.convites;
create trigger pessoal_sem_convite before insert on app.convites for each row execute function app.tg_pessoal_sem_convite_hub();
drop trigger if exists pessoal_sem_convite on public.portal_convites;
create trigger pessoal_sem_convite before insert on public.portal_convites for each row execute function app.tg_pessoal_sem_convite_hub();
drop trigger if exists pessoal_sem_convite on public.portal_usuarios;
create trigger pessoal_sem_convite before insert on public.portal_usuarios for each row execute function app.tg_pessoal_sem_convite_hub();

/**
 * Cria a família do MDC - Pessoal para quem está logado: organização tipo 'pessoal', a família como "empresa da
 * Gestão" (para o Financeiro), a pessoa como administradora (porta de entrada 'criou'), Tarefas e Finanças liberadas,
 * plano de contas e categorias de casa. Devolve o slug da família (o site abre o app com ?org=<slug>).
 */
create or replace function public.pessoal_criar_familia(p_nome text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_email text; v_pessoa text; v_org uuid; v_cli uuid; v_slug text;
begin
  if v_user is null then raise exception 'Entre na sua conta para criar a família'; end if;
  if v_nome is null or length(v_nome) < 3 then raise exception 'Dê um nome para a família (pelo menos 3 letras)'; end if;
  if length(v_nome) > 80 then raise exception 'O nome da família pode ter no máximo 80 letras'; end if;
  if (select count(*) from organizacoes where tipo = 'pessoal' and criado_por = v_user) >= 3 then
    raise exception 'Cada conta pode criar no máximo 3 famílias';
  end if;

  select lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1))
    into v_email, v_pessoa from auth.users u where u.id = v_user;

  v_slug := 'fam-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into organizacoes (nome, slug, tipo, plano, criado_por)
  values (v_nome, v_slug, 'pessoal', 'pessoal', v_user) returning id into v_org;

  insert into clientes (org_id, razao_social, regime) values (v_org, v_nome, 'pf') returning id into v_cli;
  update organizacoes set gestao_cliente_id = v_cli where id = v_org;

  insert into app.pessoal_entradas (org_id, user_id, como) values (v_org, v_user, 'criou');
  insert into membros (org_id, user_id, nome, email, papel) values (v_org, v_user, v_pessoa, v_email, 'admin');
  insert into hub_acessos (org_id, user_id, app, papel)
  select v_org, v_user, a.slug, 'gerir' from hub_apps a where a.slug in ('tarefas', 'financeiro')
  on conflict (org_id, user_id, app) do update set papel = excluded.papel;

  insert into fin_plano_contas (org_id, cliente_id, codigo, classificacao, descricao, analitica, nivel)
  select v_org, v_cli, row_number() over (order by string_to_array(p.classificacao, '.')::int[])::text,
         p.classificacao, p.descricao, p.analitica, array_length(string_to_array(p.classificacao, '.'), 1)
    from app.pessoal_plano_padrao() p;
  insert into fin_categorias (org_id, cliente_id, tipo, grupo, nome, conta_contabil_id)
  select v_org, v_cli, case when c.classificacao like '1%' then 'receita' else 'despesa' end,
         case when c.classificacao like '1%' then 'Receitas' else m.descricao end, c.descricao, c.id
    from fin_plano_contas c
    left join fin_plano_contas m on m.cliente_id = c.cliente_id and m.classificacao = regexp_replace(c.classificacao, '\.[0-9]+$', '')
   where c.cliente_id = v_cli and c.analitica;

  perform app.registrar(v_org, 'pessoal', 'familia_criar', v_org::text, null, jsonb_build_object('nome', v_nome));
  return v_slug;
end $$;
revoke all on function public.pessoal_criar_familia(text) from public, anon;
grant execute on function public.pessoal_criar_familia(text) to authenticated;
comment on function public.pessoal_criar_familia(text) is
  'MDC - Pessoal: cria a família (organização tipo pessoal) com a pessoa logada como administradora (075).';

create table if not exists public.pessoal_convites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizacoes(id) on delete cascade,
  nome         text not null check (length(trim(nome)) between 2 and 120),
  permissao    text not null check (permissao in ('lancar', 'consultar')),
  codigo_hash  text not null unique,
  criado_por   uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '7 days',
  usado_por    uuid references auth.users(id) on delete set null,
  usado_em     timestamptz,
  cancelado_em timestamptz
);
create index if not exists pessoal_convites_org on public.pessoal_convites (org_id, criado_em desc);
alter table public.pessoal_convites enable row level security;
drop policy if exists pessoal_convites_select on public.pessoal_convites;
create policy pessoal_convites_select on public.pessoal_convites for select to authenticated
  using ((select app.papel(org_id)) = 'admin');
revoke insert, update, delete on public.pessoal_convites from authenticated, anon;
grant select (id, org_id, nome, permissao, criado_em, expira_em, usado_por, usado_em, cancelado_em) on public.pessoal_convites to authenticated;
revoke select (codigo_hash) on public.pessoal_convites from authenticated;

create table if not exists app.pessoal_tentativas (user_id uuid not null, em timestamptz not null default now());
create index if not exists pessoal_tentativas_user on app.pessoal_tentativas (user_id, em);
alter table app.pessoal_tentativas enable row level security;
revoke all on app.pessoal_tentativas from public, anon, authenticated;

create or replace function app.pessoal_hash(p_codigo text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest('mdc-pessoal-convite:' || upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;
revoke all on function app.pessoal_hash(text) from public, anon, authenticated;

/** Acessos de Tarefas e Finanças de um membro da família conforme a permissão (lançar = operar; consultar = ver). */
create or replace function app.pessoal_aplicar_permissao(p_org uuid, p_user uuid, p_permissao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into hub_acessos (org_id, user_id, app, papel)
  select p_org, p_user, a.slug, case p_permissao when 'lancar' then 'operar' else 'ver' end
    from hub_apps a where a.slug in ('tarefas', 'financeiro')
  on conflict (org_id, user_id, app) do update set papel = excluded.papel;
end $$;
revoke all on function app.pessoal_aplicar_permissao(uuid, uuid, text) from public, anon, authenticated;

/**
 * Convite para a família: só o responsável (administrador). Devolve o código (8 letras/números, aparece uma vez) que
 * vai no link /pessoal?convite=<código>. Vale 7 dias e uma pessoa. No máximo 20 convites em aberto por família.
 */
create or replace function public.pessoal_convidar(p_org uuid, p_nome text, p_permissao text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_cod text := ''; v_i int;
begin
  if not app.org_pessoal(p_org) then raise exception 'Família não encontrada'; end if;
  if app.papel(p_org) is distinct from 'admin' then raise exception 'Só o responsável pela família convida pessoas'; end if;
  if p_permissao not in ('lancar', 'consultar') then raise exception 'Escolha se a pessoa pode lançar ou só consultar'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Digite o nome de quem vai entrar na família'; end if;
  if (select count(*) from pessoal_convites where org_id = p_org and usado_em is null and cancelado_em is null and expira_em > now()) >= 20 then
    raise exception 'Há muitos convites em aberto: cancele os que não vão ser usados';
  end if;
  for v_i in 1..8 loop
    v_cod := v_cod || substr(v_letras, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_letras)), 1);
  end loop;
  insert into pessoal_convites (org_id, nome, permissao, codigo_hash) values (p_org, trim(p_nome), p_permissao, app.pessoal_hash(v_cod));
  perform app.registrar(p_org, 'pessoal', 'convite_criar', trim(p_nome), null, jsonb_build_object('permissao', p_permissao));
  return substr(v_cod, 1, 4) || '-' || substr(v_cod, 5, 4);
end $$;

/** Aceita o convite pelo código (pessoa logada). No máximo 10 códigos errados por hora. Devolve o slug da família. */
create or replace function public.pessoal_aceitar_convite(p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); c pessoal_convites; v_email text; v_pessoa text;
begin
  if v_user is null then raise exception 'Entre na sua conta para aceitar o convite'; end if;
  if (select count(*) from app.pessoal_tentativas where user_id = v_user and em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitas tentativas com código errado. Espere uma hora ou peça um novo convite';
  end if;
  select * into c from pessoal_convites where codigo_hash = app.pessoal_hash(p_codigo) for update;
  if c.id is null then
    insert into app.pessoal_tentativas (user_id) values (v_user);
    raise exception 'Código de convite não encontrado. Confira as letras ou peça um novo convite';
  end if;
  if c.cancelado_em is not null then raise exception 'Este convite foi cancelado pelo responsável da família'; end if;
  if c.usado_em is not null then raise exception 'Este convite já foi usado. Peça um novo ao responsável da família'; end if;
  if c.expira_em < now() then raise exception 'Este convite venceu. Peça um novo ao responsável da família'; end if;
  if exists (select 1 from membros where org_id = c.org_id and user_id = v_user and ativo) then
    raise exception 'Você já faz parte desta família';
  end if;

  select lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), c.nome)
    into v_email, v_pessoa from auth.users u where u.id = v_user;
  insert into app.pessoal_entradas (org_id, user_id, como, convite_id) values (c.org_id, v_user, 'convite', c.id)
  on conflict (org_id, user_id) do update set como = 'convite', convite_id = excluded.convite_id, em = now();
  insert into membros (org_id, user_id, nome, email, papel) values (c.org_id, v_user, v_pessoa, v_email, 'analista')
  on conflict (org_id, user_id) do update set ativo = true, papel = 'analista';
  perform app.pessoal_aplicar_permissao(c.org_id, v_user, c.permissao);
  update pessoal_convites set usado_por = v_user, usado_em = now() where id = c.id;
  perform app.registrar(c.org_id, 'pessoal', 'convite_aceito', v_email, null, jsonb_build_object('convite', c.id));
  return (select slug from organizacoes where id = c.org_id);
end $$;

create or replace function public.pessoal_cancelar_convite(p_convite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c pessoal_convites;
begin
  select * into c from pessoal_convites where id = p_convite for update;
  if c.id is null or app.papel(c.org_id) is distinct from 'admin' then raise exception 'Convite não encontrado'; end if;
  if c.usado_em is not null then raise exception 'Este convite já foi usado'; end if;
  update pessoal_convites set cancelado_em = coalesce(cancelado_em, now()) where id = c.id;
  perform app.registrar(c.org_id, 'pessoal', 'convite_cancelar', c.nome, null, null);
end $$;

/** Responsável muda a permissão de alguém da família: responsavel (administrador), lancar ou consultar. */
create or replace function public.pessoal_definir_permissao(p_org uuid, p_user uuid, p_permissao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.org_pessoal(p_org) or app.papel(p_org) is distinct from 'admin' then
    raise exception 'Só o responsável pela família muda as permissões';
  end if;
  if p_permissao not in ('responsavel', 'lancar', 'consultar') then raise exception 'Permissão inválida'; end if;
  if p_user = auth.uid() then raise exception 'Você não pode mudar a sua própria permissão'; end if;
  if not exists (select 1 from membros where org_id = p_org and user_id = p_user and ativo) then
    raise exception 'Pessoa não encontrada na família';
  end if;
  update membros set papel = case p_permissao when 'responsavel' then 'admin' else 'analista' end::papel_membro
   where org_id = p_org and user_id = p_user;
  perform app.pessoal_aplicar_permissao(p_org, p_user, case p_permissao when 'responsavel' then 'lancar' else p_permissao end);
  perform app.registrar(p_org, 'pessoal', 'permissao', p_user::text, null, jsonb_build_object('permissao', p_permissao));
end $$;

/** Tira alguém da família (responsável) ou sai da família (a própria pessoa). O histórico continua. */
create or replace function public.pessoal_remover(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.org_pessoal(p_org) then raise exception 'Família não encontrada'; end if;
  if p_user is distinct from auth.uid() and app.papel(p_org) is distinct from 'admin' then
    raise exception 'Só o responsável pela família tira pessoas';
  end if;
  update membros set ativo = false where org_id = p_org and user_id = p_user and ativo;
  if not found then raise exception 'Pessoa não encontrada na família'; end if;
  delete from hub_acessos where org_id = p_org and user_id = p_user;
  perform app.registrar(p_org, 'pessoal', 'remover', p_user::text, null, null);
end $$;

/** Responsável troca o nome da família (o que aparece no app e nos convites). */
create or replace function public.pessoal_renomear(p_org uuid, p_nome text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text := nullif(trim(coalesce(p_nome, '')), '');
begin
  if not app.org_pessoal(p_org) or app.papel(p_org) is distinct from 'admin' then
    raise exception 'Só o responsável pela família troca o nome';
  end if;
  if v_nome is null or length(v_nome) < 3 then raise exception 'Dê um nome para a família (pelo menos 3 letras)'; end if;
  if length(v_nome) > 80 then raise exception 'O nome da família pode ter no máximo 80 letras'; end if;
  update organizacoes set nome = v_nome where id = p_org;
  update clientes set razao_social = v_nome where id = (select gestao_cliente_id from organizacoes where id = p_org);
  perform app.registrar(p_org, 'pessoal', 'familia_renomear', p_org::text, null, jsonb_build_object('nome', v_nome));
end $$;

revoke all on function public.pessoal_convidar(uuid, text, text), public.pessoal_aceitar_convite(text),
  public.pessoal_cancelar_convite(uuid), public.pessoal_definir_permissao(uuid, uuid, text), public.pessoal_remover(uuid, uuid),
  public.pessoal_renomear(uuid, text)
  from public, anon;
grant execute on function public.pessoal_convidar(uuid, text, text), public.pessoal_aceitar_convite(text),
  public.pessoal_cancelar_convite(uuid), public.pessoal_definir_permissao(uuid, uuid, text), public.pessoal_remover(uuid, uuid),
  public.pessoal_renomear(uuid, text)
  to authenticated;

/*
 * Senha provisória do HUB (071) endurecida para o cadastro aberto: não vale para quem entrou numa família (o
 * responsável da família não redefine senha de ninguém; a família pede ao suporte da MDC) nem para conta que tem
 * Portal numa organização que quem pede não administra. O resto da regra é a mesma da 071.
 */
create or replace function public.hub_pode_senha_provisoria(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_org uuid; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  if v_conta.id is not null and (
       exists (select 1 from membros m where m.user_id = v_conta.id and app.org_pessoal(m.org_id))
    or exists (select 1 from portal_usuarios p where p.user_id = v_conta.id
                and not (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')))) then
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
  if v_org is null or app.org_pessoal(v_org) then return false; end if;
  perform app.registrar(v_org, 'acessos', 'senha_provisoria', v_email, null, jsonb_build_object('pedido_por', auth.uid()));
  return true;
end $$;
revoke all on function public.hub_pode_senha_provisoria(text) from public, anon;
grant execute on function public.hub_pode_senha_provisoria(text) to authenticated;

comment on table app.pessoal_cadastros is 'MDC · Pessoal: contas criadas pelo cadastro aberto (só o resumo do IP), para o limite de 5 por hora.';
comment on table app.pessoal_entradas is 'MDC · Pessoal: porta de entrada de cada membro da família (criou ou aceitou convite). Sem ela o membro não entra.';
comment on table public.pessoal_convites is 'MDC · Pessoal: convites da família por código (só o resumo do código fica guardado; vale 7 dias e uma vez).';
comment on table app.pessoal_tentativas is 'MDC · Pessoal: códigos de convite errados por conta, para o limite de 10 por hora.';
comment on function public.pessoal_convidar(uuid, text, text) is 'MDC · Pessoal: o responsável gera um convite com código (devolvido uma vez).';
comment on function public.pessoal_aceitar_convite(text) is 'MDC · Pessoal: a pessoa logada entra na família do código; devolve o slug da família.';
comment on function public.pessoal_cancelar_convite(uuid) is 'MDC · Pessoal: o responsável cancela um convite ainda não usado.';
comment on function public.pessoal_definir_permissao(uuid, uuid, text) is 'MDC · Pessoal: o responsável muda a permissão de outra pessoa (responsavel, lancar, consultar).';
comment on function public.pessoal_remover(uuid, uuid) is 'MDC · Pessoal: o responsável tira alguém, ou a própria pessoa sai da família.';
comment on function public.pessoal_renomear(uuid, text) is 'MDC · Pessoal: o responsável troca o nome da família.';
comment on function public.pessoal_cadastro_tentativa(text) is 'MDC · Pessoal: limite do cadastro aberto (5 por hora por IP); só a Função Edge pessoal-cadastro chama.';
