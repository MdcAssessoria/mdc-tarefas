-- Base para a 058 (nota de entrada × pedido de compra): usa a nota 5678 da BD-04 (Fornecedor de Teste, CNPJ
-- 11222333000181, confirmada, lançada e desfeita no teste 114) e o item/estoque BD04 da MDC (c41).
select count(*) as nota_5678 from fis_notas where numero = '5678' and cliente_id = '00000000-0000-0000-0000-000000000c41';
