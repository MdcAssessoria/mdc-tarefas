\set ON_ERROR_STOP 1
-- Base para a 049 (boleto das faturas pelo Ledgra Link; roda por último): um cliente com CNPJ (o boleto precisa do
-- documento do pagador) e uma segunda conta bancária da MDC (Santander). "Hoje" continua em teste.hoje.
insert into fin_pessoas (id, org_id, cliente_id, tipo, nome, documento) values
  ('00000000-0000-0000-0000-00000000e491', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'cliente',
   'Cliente Boleto SA', '45723174000110')
on conflict do nothing;
insert into fin_contas_bancarias (id, org_id, cliente_id, nome, conta_contabil_id) values
  ('00000000-0000-0000-0000-00000000b402', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'Santander MDC',
   '00000000-0000-0000-0000-000000004103')
on conflict do nothing;
