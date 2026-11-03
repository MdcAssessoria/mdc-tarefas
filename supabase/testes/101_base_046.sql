\set ON_ERROR_STOP 1
-- Base para a 046 (emissão da NFS-e pelo Emissor Nacional; roda por último). Entram:
--  · tomadores da MDC (c41) com CNPJ e e-mail, que é o que a DPS precisa do cliente;
--  · o papel service_role já existe (99_base_043) e recebe as tabelas novas pelo "default privileges".
-- O certificado A1 da MDC (fis_certificados do c41, válido) e o CNPJ do c41 (48.140.121/0001-65) vêm das bases 042/045.
insert into fin_pessoas (id, org_id, cliente_id, tipo, nome, documento, email) values
  ('00000000-0000-0000-0000-00000000e461', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'cliente',
   'Ômega Comércio & Serviços Ltda', '12345678000195', 'Financeiro@Omega.com.br'),
  ('00000000-0000-0000-0000-00000000e462', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'cliente',
   'Corrida Um Ltda', '11222333000181', null),
  ('00000000-0000-0000-0000-00000000e463', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'cliente',
   'Corrida Dois Ltda', '99888777000130', null),
  ('00000000-0000-0000-0000-00000000e464', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'cliente',
   'Sem Documento ME', null, null);
