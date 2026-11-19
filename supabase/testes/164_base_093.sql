-- Base dos testes da 093 (roda depois da base e da migração 092): um cliente com código curto no Domínio.
-- O CNPJ dele tem o dígito 7 de propósito: a busca "7" não pode trazer quem só tem 7 no CNPJ.
insert into clientes (id, org_id, nome, razao_social, nome_fantasia, cnpj, regime, codigo_dominio, ativo, inicio_em) values
  ('00000000-0000-0000-0000-0000000093c1', '00000000-0000-0000-0000-0000000000a1', 'Zeta', 'ZETA 093 COMERCIO LTDA', null, '66777888000130', 'simples', '7', true, null),
  ('00000000-0000-0000-0000-0000000093c2', '00000000-0000-0000-0000-0000000000a1', 'Eta', 'ETA 093 INATIVA LTDA', null, '77888999000140', 'simples', '41', false, null)
on conflict do nothing;
