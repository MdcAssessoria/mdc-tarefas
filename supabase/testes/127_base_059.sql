-- Base para a 059 (roda DEPOIS da migração, porque usa a tabela nova): HUB enxuto e receita por sistema. Um sistema de OUTRA empresa (c1, que não é a empresa em gestão)
-- para provar que o contrato da MDC (c41) não aceita sistema alheio.
-- (a trava gestao_so_empresa recusaria; a base desliga os gatilhos só para montar o cenário)
set session_replication_role = replica;
insert into fin_sistemas (id, org_id, cliente_id, nome)
select '00000000-0000-0000-0000-0000000059f1', org_id, id, 'Sistema de outra empresa'
  from clientes where id = '00000000-0000-0000-0000-0000000000c1';
set session_replication_role = origin;
