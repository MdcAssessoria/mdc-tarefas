-- 109 · BI de Gestão: (0) correção da eliminação entre as empresas, (1) operações entre as empresas do grupo para
-- conferir a eliminação e (2) nome das pessoas nos títulos do Omie (decisão do Edvaldo, 21/11/2026).
--
-- (0) ERRO CORRIGIDO: o filtro "tirar as operações entre as empresas" era
--   not (v_elim and app.so_digitos(coalesce(doc, '')) = any (v_cnpjs))
-- e app.so_digitos('') devolve NULL; com a eliminação ligada, todo fato SEM CNPJ/CPF (tarifas, débitos em conta,
-- financiamentos lançados direto na conta) saía do relatório. Grupo Clara, out–nov/2026: R$ 123,5 mil a menos no fluxo
-- do grupo. Agora compara coalesce(app.so_digitos(doc), ''). Vale para app.bi_fatos e public.bi_indicadores; a troca é
-- feita sobre a definição em vigor (108 e 104) para não copiar as duas funções inteiras aqui.
--
-- (1) Com "tirar as operações entre as empresas", o fluxo de caixa do grupo deixa de fora os movimentos do extrato cujo
-- CNPJ/CPF da outra parte é de uma empresa do grupo. Se uma ponta foi lançada no Omie sem a empresa (ex.: "Débito em
-- conta corrente" sem cliente/fornecedor) ou com valor diferente, só a outra sai e o fluxo não fecha com os bancos.
-- public.bi_intragrupo devolve os movimentos entre empresas e os candidatos a par lançados sem a empresa
-- (mesmo valor, sinal contrário, até 7 dias); o pareamento é feito na tela (dominios/bi/intragrupo.ts, com teste).
--
-- (2) ListarMovimentos do Omie não traz o nome do cliente/fornecedor: os 8.862 títulos estavam só com o CNPJ/CPF. O nome
-- passa a vir de public.omie_pessoas (por organização e documento), alimentada pelo extrato (cDesCliente) e pelas notas
-- (nome do destinatário); um gatilho completa o nome do título na gravação e outro preenche os antigos.

-- ---------------------------------------------------------------- (0) eliminação sem perder o que não tem documento
do $$
declare d text; f regprocedure;
begin
  foreach f in array array['app.bi_fatos(text,uuid[],date,date,boolean)'::regprocedure,
                           'public.bi_indicadores(uuid[],date,date,boolean)'::regprocedure] loop
    d := regexp_replace(pg_get_functiondef(f),
           'app\.so_digitos\((coalesce\([^)]*\))\)(\s*=\s*any\s*\(v_cnpjs\))', 'coalesce(app.so_digitos(\1), '''')\2', 'g');
    if d ~ 'app\.so_digitos\(coalesce\([^)]*\)\)\s*=\s*any' then raise exception 'Sobrou o filtro antigo em %.', f; end if;
    execute d;
  end loop;
end $$;

-- ---------------------------------------------------------------- (2) nomes
create table if not exists public.omie_pessoas (
  org_id uuid not null,
  doc text not null check (doc ~ '^[0-9]{11,14}$'),
  nome text not null,
  origem text not null check (origem in ('extrato', 'nota')),
  atualizado_em timestamptz not null default now(),
  primary key (org_id, doc)
);
comment on table public.omie_pessoas is 'Nome de cada CNPJ/CPF visto no Omie (extrato e notas), para completar os títulos que vêm só com o documento (109). Gravado só por gatilho.';
alter table public.omie_pessoas enable row level security;
revoke all on public.omie_pessoas from anon, authenticated;

create index if not exists omie_mov_doc on public.omie_movimentos (org_id, cnpj_cpf);

-- extrato: o nome do extrato prevalece (é o cadastro do cliente/fornecedor no Omie)
create or replace function app.tg_omie_pessoas_extrato()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.omie_pessoas (org_id, doc, nome, origem)
  select n.org_id, app.so_digitos(n.dados->>'cDocCliente'), max(trim(n.dados->>'cDesCliente')), 'extrato'
    from novos n
   where length(app.so_digitos(coalesce(n.dados->>'cDocCliente', ''))) between 11 and 14
     and coalesce(trim(n.dados->>'cDesCliente'), '') <> ''
   group by 1, 2
  on conflict (org_id, doc) do update set nome = excluded.nome, origem = 'extrato', atualizado_em = now()
   where public.omie_pessoas.nome is distinct from excluded.nome;
  return null;
end $$;

-- notas: só preenche quem ainda não tem nome
create or replace function app.tg_omie_pessoas_notas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.omie_pessoas (org_id, doc, nome, origem)
  select n.org_id, app.so_digitos(n.cnpj_cpf_dest), max(trim(n.nome_dest)), 'nota'
    from novos n
   where length(app.so_digitos(coalesce(n.cnpj_cpf_dest, ''))) between 11 and 14 and coalesce(trim(n.nome_dest), '') <> ''
   group by 1, 2
  on conflict (org_id, doc) do nothing;
  return null;
end $$;

-- nome novo ou trocado: completa os títulos ainda sem nome
create or replace function app.tg_omie_pessoas_titulos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.omie_movimentos m set nome = p.nome
    from novos p
   where m.org_id = p.org_id and m.cnpj_cpf = p.doc and coalesce(m.nome, '') = '';
  return null;
end $$;

-- título gravado sem nome (a sincronização manda nome nulo): busca na tabela de nomes
create or replace function app.tg_omie_mov_nome()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.nome, '') = '' and new.cnpj_cpf is not null then
    new.nome := (select p.nome from public.omie_pessoas p where p.org_id = new.org_id and p.doc = new.cnpj_cpf);
  end if;
  return new;
end $$;

drop trigger if exists omie_extrato_pessoas_ins on public.omie_extrato;
create trigger omie_extrato_pessoas_ins after insert on public.omie_extrato
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_extrato();
drop trigger if exists omie_extrato_pessoas_upd on public.omie_extrato;
create trigger omie_extrato_pessoas_upd after update on public.omie_extrato
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_extrato();
drop trigger if exists omie_notas_pessoas_ins on public.omie_notas;
create trigger omie_notas_pessoas_ins after insert on public.omie_notas
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_notas();
drop trigger if exists omie_notas_pessoas_upd on public.omie_notas;
create trigger omie_notas_pessoas_upd after update on public.omie_notas
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_notas();
drop trigger if exists omie_pessoas_titulos_ins on public.omie_pessoas;
create trigger omie_pessoas_titulos_ins after insert on public.omie_pessoas
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_titulos();
drop trigger if exists omie_pessoas_titulos_upd on public.omie_pessoas;
create trigger omie_pessoas_titulos_upd after update on public.omie_pessoas
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_titulos();
drop trigger if exists omie_mov_nome on public.omie_movimentos;
create trigger omie_mov_nome before insert or update of nome, cnpj_cpf on public.omie_movimentos
  for each row execute function app.tg_omie_mov_nome();

-- carga do que já existe (o gatilho de omie_pessoas completa os títulos)
insert into public.omie_pessoas (org_id, doc, nome, origem)
select x.org_id, app.so_digitos(x.dados->>'cDocCliente'), max(trim(x.dados->>'cDesCliente')), 'extrato'
  from public.omie_extrato x
 where length(app.so_digitos(coalesce(x.dados->>'cDocCliente', ''))) between 11 and 14
   and coalesce(trim(x.dados->>'cDesCliente'), '') <> ''
 group by 1, 2
on conflict (org_id, doc) do nothing;
insert into public.omie_pessoas (org_id, doc, nome, origem)
select n.org_id, app.so_digitos(n.cnpj_cpf_dest), max(trim(n.nome_dest)), 'nota'
  from public.omie_notas n
 where length(app.so_digitos(coalesce(n.cnpj_cpf_dest, ''))) between 11 and 14 and coalesce(trim(n.nome_dest), '') <> ''
 group by 1, 2
on conflict (org_id, doc) do nothing;

-- ---------------------------------------------------------------- (1) operações entre as empresas
create or replace function public.bi_intragrupo(p_clientes uuid[], p_inicio date, p_fim date)
returns table (tipo text, empresa_id uuid, empresa text, ref text, data date, valor numeric, origem text,
               categoria text, documento text, pessoa text, contraparte_id uuid, contraparte text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  if cardinality(p_clientes) < 2 then return; end if;
  perform app.bi_registrar_acesso(v_org, p_clientes, 'intragrupo', p_inicio, p_fim);
  return query
  with emp as (
    select c.id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social) as nome, app.so_digitos(c.cnpj) as cnpj
      from clientes c where c.id = any (p_clientes)
  ),
  -- o mesmo recorte do fluxo de caixa pelo extrato (107/108): realizado, nos meses com o extrato gravado
  x as (
    select e.*, app.so_digitos(coalesce(e.dados->>'cDocCliente', '')) as dc
      from omie_extrato e
     where e.cliente_id = any (p_clientes)
       and exists (select 1 from omie_saldos s where s.cliente_id = e.cliente_id and s.conta_corrente = e.conta_corrente
                      and s.mes = e.mes and (s.dados->>'extrato')::boolean is true)
       and e.origem in ('Conta Paga', 'Conta Recebida', 'Débito em Conta Corrente', 'Crédito em Conta Corrente')
       and coalesce(e.dados->>'cSituacao', '') <> 'Previsto' and coalesce(e.valor, 0) <> 0
       and e.data between p_inicio and p_fim
  ),
  intra as (
    select x.*, o.id as cp_id, o.nome as cp_nome from x join emp o on o.cnpj = x.dc and o.id <> x.cliente_id
  )
  select 'intra', i.cliente_id, m.nome, i.conta_corrente || ':' || i.lancamento, i.data, i.valor, i.origem,
         coalesce(i.dados->>'cDesCategoria', i.categoria_codigo), coalesce(i.documento, i.dados->>'cNumero'),
         coalesce(i.pessoa, i.dados->>'cDesCliente'), i.cp_id, i.cp_nome
    from intra i join emp m on m.id = i.cliente_id
  union all
  -- candidatos: lançados sem a outra parte, com o mesmo valor (sinal contrário) de uma operação entre empresas da outra
  -- ponta, até 7 dias de distância
  select 'sem_doc', x.cliente_id, m.nome, x.conta_corrente || ':' || x.lancamento, x.data, x.valor, x.origem,
         coalesce(x.dados->>'cDesCategoria', x.categoria_codigo), coalesce(x.documento, x.dados->>'cNumero'),
         coalesce(x.pessoa, x.dados->>'cDesCliente'), null::uuid, null::text
    from x join emp m on m.id = x.cliente_id
   where coalesce(length(x.dc), 0) not between 11 and 14
     and exists (select 1 from intra i where i.cp_id = x.cliente_id and i.valor = -x.valor and abs(i.data - x.data) <= 7)
   order by 5, 3;
end $$;

revoke all on function public.bi_intragrupo(uuid[], date, date) from public, anon;
grant execute on function public.bi_intragrupo(uuid[], date, date) to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array['app.tg_omie_pessoas_extrato()', 'app.tg_omie_pessoas_notas()', 'app.tg_omie_pessoas_titulos()',
                           'app.tg_omie_mov_nome()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
