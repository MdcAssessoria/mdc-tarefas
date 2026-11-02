\set ON_ERROR_STOP 1
-- (031) O Portal só usa o Financeiro com contrato ativo do módulo: o cliente 1 recebe um contrato do Financeiro
-- vigente desde 3 meses atrás, para os testes do Portal em 20_titulos e 30_estoque continuarem valendo.
insert into lic_contratos (id, org_id, cliente_id, valor_mensal, dia_vencimento, inicio)
values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
        150, 10, (date_trunc('month', current_date) - interval '3 months')::date);
insert into lic_contrato_produtos (contrato_id, produto_id, org_id)
select '00000000-0000-0000-0000-00000000c0a1', id, org_id from lic_produtos
 where org_id = '00000000-0000-0000-0000-0000000000a1' and slug = 'financeiro';
