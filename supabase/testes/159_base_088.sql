-- Base para a 088 (Sistemas): no banco real a licença do Ledgra (067, 068, 072, 074, 083, 084, 087) já está aplicada;
-- aqui ela entra antes da 088. CNPJ e nome fantasia nos clientes de teste e um contrato a receber da MDC (c41) que lança.
alter table clientes add column if not exists nome_fantasia text;
update clientes set cnpj = '11222333000181' where id = '00000000-0000-0000-0000-0000000000c3';
update clientes set cnpj = '99888777000130' where id = '00000000-0000-0000-0000-0000000000c2' and coalesce(cnpj, '') = '';
-- os testes anteriores deixaram vários contratos ativos do cliente 2 (no banco real há um por cliente); a 088 exige um
-- ativo por cliente e sistema, então os demais ficam encerrados (sem gatilhos, como dado antigo)
set session_replication_role = replica;
update lic_contratos set situacao = 'encerrado', encerrado_em = current_date, encerrado_motivo = 'Encerrado para a base da 088'
 where situacao = 'ativo' and id <> '00000000-0000-0000-0000-0000000085c1'
   and cliente_id in (select cliente_id from lic_contratos where situacao = 'ativo' group by 1 having count(*) > 1);
set session_replication_role = origin;
