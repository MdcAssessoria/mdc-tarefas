-- Base para a 085 (contrato de licença): no banco real o pgcrypto fica no esquema extensions; aqui, no public.
create schema if not exists extensions;
create or replace function extensions.digest(text, text) returns bytea language sql immutable as $$ select public.digest($1, $2) $$;
create or replace function extensions.gen_random_bytes(int) returns bytea language sql volatile as $$ select public.gen_random_bytes($1) $$;
-- quem só vê Licenças, quem opera e quem gere
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000085e1', 'licencas', 'ver'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000085e2', 'licencas', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000085e3', 'licencas', 'gerir')
on conflict do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000085e1', 've.licencas@exemplo.com'),
  ('00000000-0000-0000-0000-0000000085e2', 'opera.licencas@exemplo.com'),
  ('00000000-0000-0000-0000-0000000085e3', 'gere.licencas@exemplo.com')
on conflict do nothing;
-- uma licença ativa do cliente 2 e uma encerrada do cliente 3
insert into lic_contratos (id, org_id, cliente_id, valor_mensal, dia_vencimento, inicio) values
  ('00000000-0000-0000-0000-0000000085c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 390, 10, current_date);
insert into lic_contratos (id, org_id, cliente_id, valor_mensal, dia_vencimento, inicio, situacao, encerrado_em, encerrado_motivo) values
  ('00000000-0000-0000-0000-0000000085c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 100, 10,
   current_date - 60, 'encerrado', current_date - 1, 'teste de encerrada');
-- texto e signatário de exemplo usados nos testes
create or replace function public.t085_texto() returns text language sql immutable as $$
  select '# Contrato {{numero}}' || chr(10) || repeat('Cláusula de teste do contrato de licença. ', 10) || chr(10) || '{{numero}}' $$;
create or replace function public.t085_sig() returns jsonb language sql immutable as $$
  select '{"nome":"Maria da Silva","cpf":"529.982.247-25","cargo":"sócia","email":"Maria@Ex.com"}'::jsonb $$;
