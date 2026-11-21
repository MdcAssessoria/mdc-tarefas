-- 110 · BI de Gestão: ajustes da 109 apontados na revisão de segurança da Vercel (PR #36, 21/11/2026).
--
-- (1) Nome das pessoas POR CLIENTE. Na 109 o nome de cada CNPJ/CPF ficava por organização: o Omie de um cliente da MDC
-- podia dar (ou trocar) o nome que aparece nos títulos de outro cliente. Agora omie_pessoas é por (cliente_id, doc) e os
-- gatilhos só usam nomes vindos do próprio cliente. Os nomes gravados pela 109 são apagados dos títulos e preenchidos de
-- novo só com os do próprio cliente (antes da 109 os títulos não tinham nome nenhum). Cobertura: 96% dos títulos.
--
-- (2) public.bi_intragrupo com ordem estável (data, empresa, ref) para a tela ler em páginas: a API devolve no máximo
-- 1.000 linhas por chamada e um período longo passaria disso.

-- ---------------------------------------------------------------- (1) nomes por cliente
drop trigger if exists omie_pessoas_titulos_ins on public.omie_pessoas;
drop trigger if exists omie_pessoas_titulos_upd on public.omie_pessoas;
drop table if exists public.omie_pessoas;

create table public.omie_pessoas (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  doc text not null check (doc ~ '^[0-9]{11,14}$'),
  nome text not null,
  origem text not null check (origem in ('extrato', 'nota')),
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, doc)
);
comment on table public.omie_pessoas is 'Nome de cada CNPJ/CPF no Omie de cada cliente (extrato e notas), para completar os títulos que vêm só com o documento (109/110). Gravado só por gatilho; um cliente nunca dá nome aos títulos de outro.';
alter table public.omie_pessoas enable row level security;
revoke all on public.omie_pessoas from anon, authenticated;

drop index if exists public.omie_mov_doc;
create index if not exists omie_mov_cliente_doc on public.omie_movimentos (cliente_id, cnpj_cpf);

create or replace function app.tg_omie_pessoas_extrato()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.omie_pessoas (cliente_id, doc, nome, origem)
  select n.cliente_id, app.so_digitos(n.dados->>'cDocCliente'), max(trim(n.dados->>'cDesCliente')), 'extrato'
    from novos n
   where length(app.so_digitos(coalesce(n.dados->>'cDocCliente', ''))) between 11 and 14
     and coalesce(trim(n.dados->>'cDesCliente'), '') <> ''
   group by 1, 2
  on conflict (cliente_id, doc) do update set nome = excluded.nome, origem = 'extrato', atualizado_em = now()
   where public.omie_pessoas.nome is distinct from excluded.nome;
  return null;
end $$;

create or replace function app.tg_omie_pessoas_notas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.omie_pessoas (cliente_id, doc, nome, origem)
  select n.cliente_id, app.so_digitos(n.cnpj_cpf_dest), max(trim(n.nome_dest)), 'nota'
    from novos n
   where length(app.so_digitos(coalesce(n.cnpj_cpf_dest, ''))) between 11 and 14 and coalesce(trim(n.nome_dest), '') <> ''
   group by 1, 2
  on conflict (cliente_id, doc) do nothing;
  return null;
end $$;

create or replace function app.tg_omie_pessoas_titulos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.omie_movimentos m set nome = p.nome
    from novos p
   where m.cliente_id = p.cliente_id and m.cnpj_cpf = p.doc and coalesce(m.nome, '') = '';
  return null;
end $$;

create or replace function app.tg_omie_mov_nome()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.nome, '') = '' and new.cnpj_cpf is not null then
    new.nome := (select p.nome from public.omie_pessoas p where p.cliente_id = new.cliente_id and p.doc = new.cnpj_cpf);
  end if;
  return new;
end $$;

create trigger omie_pessoas_titulos_ins after insert on public.omie_pessoas
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_titulos();
create trigger omie_pessoas_titulos_upd after update on public.omie_pessoas
  referencing new table as novos for each statement execute function app.tg_omie_pessoas_titulos();

-- refaz os nomes: tira os da 109 (vinham de qualquer cliente da organização) e preenche só com os do próprio cliente
alter table public.omie_movimentos disable trigger omie_mov_nome;
update public.omie_movimentos set nome = null where nome is not null;
alter table public.omie_movimentos enable trigger omie_mov_nome;

insert into public.omie_pessoas (cliente_id, doc, nome, origem)
select x.cliente_id, app.so_digitos(x.dados->>'cDocCliente'), max(trim(x.dados->>'cDesCliente')), 'extrato'
  from public.omie_extrato x
 where length(app.so_digitos(coalesce(x.dados->>'cDocCliente', ''))) between 11 and 14
   and coalesce(trim(x.dados->>'cDesCliente'), '') <> ''
 group by 1, 2
on conflict (cliente_id, doc) do nothing;
insert into public.omie_pessoas (cliente_id, doc, nome, origem)
select n.cliente_id, app.so_digitos(n.cnpj_cpf_dest), max(trim(n.nome_dest)), 'nota'
  from public.omie_notas n
 where length(app.so_digitos(coalesce(n.cnpj_cpf_dest, ''))) between 11 and 14 and coalesce(trim(n.nome_dest), '') <> ''
 group by 1, 2
on conflict (cliente_id, doc) do nothing;

do $$
declare f text;
begin
  foreach f in array array['app.tg_omie_pessoas_extrato()', 'app.tg_omie_pessoas_notas()', 'app.tg_omie_pessoas_titulos()',
                           'app.tg_omie_mov_nome()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- (2) ordem estável para ler em páginas
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
  select 'sem_doc', x.cliente_id, m.nome, x.conta_corrente || ':' || x.lancamento, x.data, x.valor, x.origem,
         coalesce(x.dados->>'cDesCategoria', x.categoria_codigo), coalesce(x.documento, x.dados->>'cNumero'),
         coalesce(x.pessoa, x.dados->>'cDesCliente'), null::uuid, null::text
    from x join emp m on m.id = x.cliente_id
   where coalesce(length(x.dc), 0) not between 11 and 14
     and exists (select 1 from intra i where i.cp_id = x.cliente_id and i.valor = -x.valor and abs(i.data - x.data) <= 7)
   order by 5, 2, 4, 1;
end $$;
