\set ON_ERROR_STOP 1
-- Base para a 073 (acervo de documentos do Societário): o mínimo das tabelas reais que a 073 usa e que a base simulada
-- não tinha — processos e linha do tempo do Societário (com a função de evento) — e os arquivos do teste.
create table if not exists public.soc_processos (id uuid primary key default gen_random_uuid(), org_id uuid, numero int,
  cliente_id uuid, futuro_cliente text, status text default 'aberto');
create table if not exists public.soc_eventos (id bigint generated always as identity primary key, org_id uuid, processo_id uuid,
  user_id uuid, tipo text, texto text, visivel_cliente boolean default false, em timestamptz default now());
create or replace function app.soc_evento(p_proc uuid, p_tipo text, p_texto text, p_visivel boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into soc_eventos (org_id, processo_id, user_id, tipo, texto, visivel_cliente)
  select org_id, id, auth.uid(), p_tipo, p_texto, p_visivel from soc_processos where id = p_proc $$;
insert into public.soc_processos (id, org_id, numero, cliente_id, futuro_cliente) values
  ('00000000-0000-0000-0000-0000000073a1', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000c1', null),
  ('00000000-0000-0000-0000-0000000073a2', '00000000-0000-0000-0000-0000000000a1', 2, null, 'Empresa nova');
-- f1: enviado no acervo do cliente c1; f2: anexo do processo 1 (sem cliente no arquivo); f3: do cliente c3; f4: anexo do processo 2
insert into public.hub_arquivos (id, org_id, app, nome, caminho, cliente_id, ref_id) values
  ('00000000-0000-0000-0000-0000000073f1', '00000000-0000-0000-0000-0000000000a1', 'societario', 'contrato-social.pdf', 'a1/societario/c1/contrato.pdf', '00000000-0000-0000-0000-0000000000c1', null),
  ('00000000-0000-0000-0000-0000000073f2', '00000000-0000-0000-0000-0000000000a1', 'societario', '3a-alteracao.pdf', 'a1/societario/p1/alteracao.pdf', null, '00000000-0000-0000-0000-0000000073a1'),
  ('00000000-0000-0000-0000-0000000073f3', '00000000-0000-0000-0000-0000000000a1', 'societario', 'cartao-c3.pdf', 'a1/societario/c3/cartao.pdf', '00000000-0000-0000-0000-0000000000c3', null),
  ('00000000-0000-0000-0000-0000000073f4', '00000000-0000-0000-0000-0000000000a1', 'societario', 'dbe.pdf', 'a1/societario/p2/dbe.pdf', null, '00000000-0000-0000-0000-0000000073a2');
-- quem só vê o Societário e quem opera
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000073e1', 'societario', 'ver'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000073e2', 'societario', 'operar');
-- as pessoas do teste existem em auth.users (quem guardou fica registrado na ficha)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000073e1', 've.societario@exemplo.com'),
  ('00000000-0000-0000-0000-0000000073e2', 'opera.societario@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'admin.073@exemplo.com')
on conflict do nothing;
