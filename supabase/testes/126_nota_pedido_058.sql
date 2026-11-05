-- Testes da 058: nota de entrada e pedido de compra não lançam a mesma compra duas vezes.
-- e51 = Financeiro + Entradas + Estoque (operar) na MDC (c41). Blocos "(deve falhar)" terminam em ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2027-04-10';
select id as nota from fis_notas where numero = '5678' and cliente_id = '00000000-0000-0000-0000-000000000c41' \gset
select id as forn from fin_pessoas where documento = '11222333000181' and cliente_id = '00000000-0000-0000-0000-000000000c41' order by criado_em limit 1 \gset
select id as item1 from fis_nota_itens where nota_id = :'nota' and numero = 1 \gset
select id as item2 from fis_nota_itens where nota_id = :'nota' and numero = 2 \gset
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e51';
set teste.membro = 'analista';

\echo '=== C1 pedido de compra do mesmo fornecedor, 10 parafusos (R$ 600 em 1 parcela), aguardando entrega (esperado: confirmado)'
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-000000000c41', 'tipo', 'compra', 'pessoa', :'forn',
  'categoria', '00000000-0000-0000-0000-00000000bdf9', 'local', '00000000-0000-0000-0000-00000000bd21',
  'itens', jsonb_build_array(jsonb_build_object('item', '00000000-0000-0000-0000-00000000bd11', 'quantidade', 10, 'preco_unitario', 60)),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2027-05-10', 'valor', 600)))))->>'id' as pedido \gset
select est_pedido_confirmar(:'pedido')->>'situacao' as situacao;
\echo '=== C2 a tela vê o pedido como possível desta nota (esperado: 1, confirmado)'
select jsonb_array_length(x) as candidatos, x->0->>'situacao' as situacao from (select fis_pedidos_da_nota(:'nota') x) y;

\echo '--- C3 lançar a nota sem escolher o pedido (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda', 'categoria', '00000000-0000-0000-0000-00000000bdf9',
  'parcelas', '[{"vencimento":"2027-04-20","valor":635}]'::jsonb,
  'itens', jsonb_build_array(jsonb_build_object('id', :'item1', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1),
                             jsonb_build_object('id', :'item2', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1))));
\echo '--- C4 escolher um pedido que não é deste fornecedor (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda', 'pedido', '00000000-0000-0000-0000-0000000000ff'));

\echo '=== C5 lançar escolhendo o pedido aguardando: a nota recebe o pedido, sem conta nem estoque próprios (esperado: 0, 0, 1, t)'
select jsonb_array_length(r->'titulos') as titulos_da_nota, jsonb_array_length(r->'movimentos') as movimentos_da_nota,
       (r->'pedido'->>'numero') is not null::int as tem_pedido, r->>'aviso' like 'O total da nota%' as avisa_total
  from (select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda', 'pedido', :'pedido',
          'itens', jsonb_build_array(jsonb_build_object('id', :'item1', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1),
                                     jsonb_build_object('id', :'item2', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1)))) r) x;
reset role;
\echo '=== C6 pedido recebido com as contas e o estoque dele; nota ligada (esperado: recebido, NF 5678, 1, 10, t)'
select situacao, documento,
       (select count(*) from est_pedido_titulos where pedido_id = :'pedido') as contas_do_pedido,
       (select sum(quantidade) from est_movimentos where origem = 'pedido_compra' and origem_id = :'pedido' and not estornado) as entrou,
       (select pedido_id = :'pedido' from fis_notas where id = :'nota') as nota_ligada
  from est_pedidos where id = :'pedido';
select count(*) as movimentos_da_nota_0 from est_movimentos where origem = 'nota_entrada' and origem_id = :'nota' and not estornado;
set role authenticated;

-- o estoque BD04 já ficou negativo em testes anteriores: libera o negativo só aqui, para a trava da 058 ser a que recusa
reset role;
select permite_negativo as negativo_antes from est_parametros where cliente_id = '00000000-0000-0000-0000-000000000c41' \gset
insert into est_parametros (cliente_id, org_id, permite_negativo) values ('00000000-0000-0000-0000-000000000c41', '00000000-0000-0000-0000-0000000000a1', true)
on conflict (cliente_id) do update set permite_negativo = true;
set role authenticated;
\echo '--- C7 cancelar o pedido ligado à nota lançada (deve falhar: "ligado à NF 5678")'
select est_pedido_cancelar(:'pedido', 'pedido em duplicidade');
reset role;
update est_parametros set permite_negativo = coalesce(nullif(:'negativo_antes', ''), 'false')::boolean where cliente_id = '00000000-0000-0000-0000-000000000c41';
set role authenticated;
\echo '=== C8 desfazer a nota solta do pedido; o pedido continua recebido (esperado: f, recebido)'
select fis_desfazer_lancamento(:'nota', 'teste da ligação com o pedido');
reset role;
select pedido_id is not null as ligada, (select situacao from est_pedidos where id = :'pedido') as pedido from fis_notas where id = :'nota';
set role authenticated;
\echo '=== C9 relançar escolhendo o pedido já recebido: só liga, nada novo (esperado: 0, 0, contas 1, entrou 10)'
select jsonb_array_length(r->'titulos') as titulos, jsonb_array_length(r->'movimentos') as movimentos
  from (select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda', 'pedido', :'pedido',
          'itens', jsonb_build_array(jsonb_build_object('id', :'item1', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1),
                                     jsonb_build_object('id', :'item2', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1)))) r) x;
reset role;
select (select count(*) from est_pedido_titulos where pedido_id = :'pedido') as contas,
       (select sum(quantidade) from est_movimentos where origem = 'pedido_compra' and origem_id = :'pedido' and not estornado) as entrou;
set role authenticated;

\echo '=== C10 nota lançada sem pedido ("nenhum") gera conta; outro pedido citando a NF 5678 não pode ser recebido'
select fis_desfazer_lancamento(:'nota', 'vai lançar sem o pedido');
select jsonb_array_length(fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda', 'pedido', 'nenhum',
  'categoria', '00000000-0000-0000-0000-00000000bdf9', 'parcelas', '[{"vencimento":"2027-04-20","valor":635}]'::jsonb,
  'itens', jsonb_build_array(jsonb_build_object('id', :'item1', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1),
                             jsonb_build_object('id', :'item2', 'item', '00000000-0000-0000-0000-00000000bd11', 'fator', 1))))->'titulos') as titulos_1;
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-000000000c41', 'tipo', 'compra', 'pessoa', :'forn',
  'categoria', '00000000-0000-0000-0000-00000000bdf9', 'local', '00000000-0000-0000-0000-00000000bd21',
  'itens', jsonb_build_array(jsonb_build_object('item', '00000000-0000-0000-0000-00000000bd11', 'quantidade', 5, 'preco_unitario', 60)),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2027-05-10', 'valor', 300)))))->>'id' as pedido2 \gset
\echo '--- C11 receber o pedido 2 citando a NF 5678 já lançada (deve falhar)'
select est_pedido_receber(:'pedido2', '{"documento":"NF 5678"}'::jsonb);
\echo '=== C12 o mesmo pedido citando outra nota recebe normal (esperado: recebido)'
select est_pedido_receber(:'pedido2', '{"documento":"NF 9999"}'::jsonb)->>'situacao' as situacao;
