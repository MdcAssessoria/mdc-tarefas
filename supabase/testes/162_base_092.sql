-- Base dos testes da 092 (integração entre sistemas): colunas de clientes que o produto tem e a base simulada não,
-- a MDC com slug 'mdc' e clientes de exemplo (dois da MDC, um inativo, um sem CNPJ e um de outra organização (a2)).
alter table organizacoes add column if not exists slug text unique;
alter table clientes add column if not exists razao_social text, add column if not exists nome_fantasia text,
  add column if not exists cnpj text, add column if not exists regime text, add column if not exists cidade text,
  add column if not exists uf text, add column if not exists codigo_dominio text, add column if not exists inicio_em date,
  add column if not exists cliente_desde date, add column if not exists segmento text;
update organizacoes set slug = 'mdc' where id = '00000000-0000-0000-0000-0000000000a1' and slug is null;
insert into clientes (id, org_id, nome, razao_social, nome_fantasia, cnpj, regime, codigo_dominio, ativo, inicio_em) values
  ('00000000-0000-0000-0000-0000000092c1', '00000000-0000-0000-0000-0000000000a1', 'Alfa', 'ALFA 092 INDUSTRIA LTDA', 'Alfa', '55.666.777/0001-92', 'real', '9201', true, '2024-01-01'),
  ('00000000-0000-0000-0000-0000000092c2', '00000000-0000-0000-0000-0000000000a1', 'Beta', 'BETA 092 SERVICOS LTDA', null, '22333444000155', 'simples', '9202', true, null),
  ('00000000-0000-0000-0000-0000000092c3', '00000000-0000-0000-0000-0000000000a1', 'Gama', 'GAMA 092 INATIVA LTDA', null, '33444555000110', 'real', '9203', false, null),
  ('00000000-0000-0000-0000-0000000092c4', '00000000-0000-0000-0000-0000000000a1', 'Delta', 'DELTA 092 SEM CNPJ', null, null, 'real', '9204', true, null),
  ('00000000-0000-0000-0000-0000000092c5', '00000000-0000-0000-0000-0000000000a2', 'Eps', 'EPS 092 DE OUTRA ORG', null, '44555666000120', 'real', '9205', true, null)
on conflict do nothing;
