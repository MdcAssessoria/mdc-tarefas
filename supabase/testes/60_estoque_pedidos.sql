-- Testes da 033: custo médio, ficha (kardex), cadastro de item, importação, inventário e pedidos de venda e de compra.
-- Roda depois de 20_titulos.sql e 30_estoque.sql (usa as categorias d1/d2, a conta b1 e o fornecedor f1 de lá).
-- Linhas "(deve falhar)" precisam terminar em ERROR com mensagem em português.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'gerir';
select est_definir_negativo('00000000-0000-0000-0000-0000000000c1', false);
set teste.papel = 'operar';

-- itens desta bateria (ids 3x) no Depósito (21)
\echo '--- cadastro pelo assistente: grupo novo pelo nome, caixa com 12, saldo inicial 10 a R$ 5'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c1","nome":"Refrigerante lata","codigo":"R1","tipo":"produto","unidade":"un","unidade_compra":"cx","fator_compra":12,"grupo_nome":"Bebidas","preco_venda":8,"custo":5,"markup":60,"saldo_inicial":10,"local":"00000000-0000-0000-0000-000000000021"}'::jsonb) is not null as ok;
select nome, unidade, unidade_compra, fator_compra, custo, custo_medio, (select nome from est_grupos g where g.id = grupo_id) grupo from est_itens where codigo = 'R1';
\echo '--- código repetido (deve falhar)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c1","nome":"Outro","codigo":"R1"}'::jsonb);
\echo '--- digitar custo médio direto (deve falhar)'
update est_itens set custo_medio = 1 where codigo = 'R1';
\echo '--- serviço com saldo inicial (deve falhar)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c1","nome":"Frete","tipo":"servico","saldo_inicial":3}'::jsonb);
\echo '--- serviço e item que não controla estoque'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c1","nome":"Instalação","codigo":"S1","tipo":"servico","preco_venda":100}'::jsonb) is not null as ok;
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c1","nome":"Sacola","codigo":"N1","tipo":"produto","controla_estoque":false,"preco_venda":1}'::jsonb) is not null as ok;
select codigo, tipo, unidade, controla_estoque from est_itens where codigo in ('S1', 'N1') order by 1;

\echo '--- custo médio: entrada manual de 10 a R$ 8 → (10×5 + 10×8) / 20 = 6,50'
select est_movimentar(jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'local', '00000000-0000-0000-0000-000000000021', 'tipo', 'entrada', 'quantidade', 10, 'custo_unitario', 8)) is not null as ok;
select custo, custo_medio from est_itens where codigo = 'R1';
\echo '--- entrada com data passada recalcula a ficha na ordem das datas'
select est_movimentar(jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'local', '00000000-0000-0000-0000-000000000021', 'tipo', 'entrada', 'quantidade', 20, 'custo_unitario', 2, 'data', (current_date - 10)::text)) is not null as ok;
select data = current_date - 10 as passada, quantidade, custo_unitario, saldo_apos, custo_medio_apos from est_movimentos
 where item_id = (select id from est_itens where codigo = 'R1') and not estornado order by data, id;
\echo '--- estorno da entrada passada volta o custo médio para 6,50'
select est_estornar_movimento((select id from est_movimentos where item_id = (select id from est_itens where codigo = 'R1') and data = current_date - 10), 'lançado errado');
select custo_medio from est_itens where codigo = 'R1';

\echo '--- importação: atualiza R1 pelo código (só preço), cadastra 2 novos (um com saldo inicial, grupo novo)'
select est_importar_itens('00000000-0000-0000-0000-0000000000c1', '[
  {"codigo":"R1","preco_venda":9.5},
  {"codigo":"A1","nome":"Água 500ml","unidade":"UN","grupo_nome":"bebidas","custo":1.2,"preco_venda":3,"saldo_inicial":24},
  {"nome":"Copo descartável","unidade":"PC","grupo_nome":"Descartáveis","controla_estoque":false}
]'::jsonb);
select codigo, nome, preco_venda, custo_medio, (select nome from est_grupos g where g.id = grupo_id) grupo from est_itens where codigo in ('R1', 'A1') or nome = 'Copo descartável' order by nome;
select count(*) as grupos from est_grupos where cliente_id = '00000000-0000-0000-0000-0000000000c1';
\echo '--- importação com linha sem nome nem código (deve falhar, nada gravado)'
select est_importar_itens('00000000-0000-0000-0000-0000000000c1', '[{"codigo":"Z9","nome":"Novo Z"},{"preco_venda":1}]'::jsonb);
select count(*) as z9 from est_itens where codigo = 'Z9';

\echo '--- inventário guiado: R1 contado 18 (sistema 20), A1 contado 24 (igual, pula)'
select est_inventario(jsonb_build_object('local', '00000000-0000-0000-0000-000000000021', 'itens', jsonb_build_array(
  jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'contado', 18),
  jsonb_build_object('item', (select id from est_itens where codigo = 'A1'), 'contado', 24)))) - 'movimentos';
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'R1';

-- ------------------------------------------------------------------------------------- pedido de venda
\echo '--- venda: 5 R1 + 1 instalação (serviço) + 2 sacolas (não controla) em 2 parcelas, cliente novo pelo nome'
select est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda', 'pessoa_nome', 'Mercado Bom Preço',
  'categoria', '00000000-0000-0000-0000-0000000000d2', 'local', '00000000-0000-0000-0000-000000000021', 'frete', 10, 'desconto', 2,
  'itens', jsonb_build_array(
    jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'quantidade', 5, 'preco_unitario', 9.5),
    jsonb_build_object('item', (select id from est_itens where codigo = 'S1'), 'quantidade', 1, 'preco_unitario', 100),
    jsonb_build_object('item', (select id from est_itens where codigo = 'N1'), 'quantidade', 2, 'preco_unitario', 1)),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', current_date + 30, 'valor', 80), jsonb_build_object('vencimento', current_date + 60, 'valor', 77.5))))
  - 'id';
\echo '--- parcelas que não batem com o total (deve falhar)'
select est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'S1'), 'quantidade', 1, 'preco_unitario', 100)),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', current_date, 'valor', 90))));
\echo '--- pedido sem itens (deve falhar)'
select est_pedido_salvar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"venda","itens":[]}'::jsonb);
\echo '--- inserir pedido direto pela API (deve falhar)'
insert into est_pedidos (org_id, cliente_id, tipo, numero, data) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'venda', 99, current_date);
select numero, situacao, total_itens, total, jsonb_array_length(parcelas) parcelas, (select nome from fin_pessoas where id = pessoa_id) cliente from est_pedidos where tipo = 'venda';
\echo '--- confirmar: baixa só R1 (5), serviço e sacola passam; 2 contas a receber'
select est_pedido_confirmar((select id from est_pedidos where tipo = 'venda' and numero = 1)) ->> 'situacao' as situacao;
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'R1';
select count(*) as movimentos_sacola_servico from est_movimentos m join est_itens i on i.id = m.item_id where i.codigo in ('S1', 'N1');
select l.descricao, l.movimento_id is not null as baixou, l.custo_unitario from est_pedido_itens l join est_pedidos p on p.id = l.pedido_id
 where p.tipo = 'venda' and p.numero = 1 and not l.removido order by l.ordem;
select t.descricao, t.valor, t.vencimento - current_date as dias, t.situacao from fin_titulos t join est_pedido_titulos pt on pt.titulo_id = t.id order by t.vencimento;
select origem, observacao from est_movimentos where origem = 'pedido_venda';
\echo '--- alterar pedido confirmado (deve falhar)'
select est_pedido_salvar(jsonb_build_object('id', (select id from est_pedidos where tipo = 'venda' and numero = 1), 'cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'S1'), 'quantidade', 1, 'preco_unitario', 1))));
\echo '--- estornar pelo estoque um movimento do pedido (deve falhar)'
select est_estornar_movimento((select id from est_movimentos where origem = 'pedido_venda' limit 1), 'x');
\echo '--- faturar com o número da nota'
select est_pedido_faturar((select id from est_pedidos where tipo = 'venda' and numero = 1), '1234');
select situacao, documento from est_pedidos where tipo = 'venda' and numero = 1;

\echo '--- estoque insuficiente bloqueia a confirmação (deve falhar) e nada é gravado'
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda', 'categoria', '00000000-0000-0000-0000-0000000000d2',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'quantidade', 50, 'preco_unitario', 9.5))))) ->> 'numero' as numero;
select est_pedido_confirmar((select id from est_pedidos where tipo = 'venda' and numero = 2));
select situacao, (select count(*) from est_pedido_titulos where pedido_id = p.id) titulos from est_pedidos p where tipo = 'venda' and numero = 2;
\echo '--- venda sem categoria (deve falhar)'
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'S1'), 'quantidade', 1, 'preco_unitario', 50))))) ->> 'numero' as numero;
select est_pedido_confirmar((select id from est_pedidos where tipo = 'venda' and numero = 3));

\echo '--- cancelar com parcela recebida (deve falhar)'
select fin_baixar((select t.id from fin_titulos t join est_pedido_titulos pt on pt.titulo_id = t.id order by t.vencimento limit 1), current_date, 10, '00000000-0000-0000-0000-0000000000b1') ->> 'quitado' as quitado;
select est_pedido_cancelar((select id from est_pedidos where tipo = 'venda' and numero = 1), 'cliente desistiu');
\echo '--- estorna o recebimento e cancela: estoque volta e as duas parcelas ficam canceladas'
select fin_estornar_baixa((select max(id) from fin_baixas), 'teste');
select est_pedido_cancelar((select id from est_pedidos where tipo = 'venda' and numero = 1), 'cliente desistiu');
select situacao, cancelado_motivo from est_pedidos where tipo = 'venda' and numero = 1;
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'R1';
select t.situacao, t.cancelado_motivo from fin_titulos t join est_pedido_titulos pt on pt.titulo_id = t.id order by t.vencimento;
select estornado, estorno_motivo from est_movimentos where origem = 'pedido_venda';
\echo '--- cancelar de novo (deve falhar)'
select est_pedido_cancelar((select id from est_pedidos where tipo = 'venda' and numero = 1), 'de novo');

-- ------------------------------------------------------------------------------------- pedido de compra
\echo '--- compra: 2 CX de R1 (24 un) a R$ 48 a caixa + frete 12 - desconto 6 → custo 4,25/un; fornecedor f1; 30/60/90'
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'compra', 'pessoa', '00000000-0000-0000-0000-0000000000f1',
  'categoria', '00000000-0000-0000-0000-0000000000d1', 'frete', 12, 'desconto', 6, 'condicao', '30/60/90',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'quantidade', 2, 'preco_unitario', 48, 'em_unidade_compra', true)),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', current_date + 30, 'valor', 34), jsonb_build_object('vencimento', current_date + 60, 'valor', 34),
                                jsonb_build_object('vencimento', current_date + 90, 'valor', 34))))) - 'id';
select l.unidade, l.fator, l.quantidade, l.total from est_pedido_itens l join est_pedidos p on p.id = l.pedido_id where p.tipo = 'compra' and not l.removido;
\echo '--- confirmar a compra = aguardando entrega (sem mexer no estoque)'
select est_pedido_confirmar((select id from est_pedidos where tipo = 'compra' and numero = 1)) ->> 'situacao' as situacao;
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'R1';
\echo '--- receber: entra 24 un a 4,25; custo médio = (18×6,5 + 24×4,25)/42 = 5,2143; 3 contas a pagar'
select est_pedido_receber((select id from est_pedidos where tipo = 'compra' and numero = 1), jsonb_build_object('documento', 'NF 555')) ->> 'situacao' as situacao;
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'R1';
select custo, custo_medio from est_itens where codigo = 'R1';
select quantidade, custo_unitario, saldo_apos, custo_medio_apos, origem from est_movimentos where origem = 'pedido_compra';
select t.tipo, t.valor, t.documento, t.situacao from fin_titulos t join est_pedido_titulos pt on pt.titulo_id = t.id
 join est_pedidos p on p.id = pt.pedido_id where p.tipo = 'compra' order by t.vencimento;
\echo '--- receber de novo (deve falhar)'
select est_pedido_receber((select id from est_pedidos where tipo = 'compra' and numero = 1));
\echo '--- vende 30 de R1 (saldo 42) e tenta cancelar a compra (deve falhar: os produtos já saíram)'
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda', 'categoria', '00000000-0000-0000-0000-0000000000d2',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'R1'), 'quantidade', 30, 'preco_unitario', 9.5))))) ->> 'numero' as numero;
select est_pedido_confirmar((select id from est_pedidos where tipo = 'venda' and numero = 4)) ->> 'situacao' as situacao;
select est_pedido_cancelar((select id from est_pedidos where tipo = 'compra' and numero = 1), 'errado');
\echo '--- cancela a venda e depois a compra: estoque e custo médio voltam (18 un, 6,50)'
select est_pedido_cancelar((select id from est_pedidos where tipo = 'venda' and numero = 4), 'teste');
select est_pedido_cancelar((select id from est_pedidos where tipo = 'compra' and numero = 1), 'fornecedor errado');
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'R1';
select custo_medio from est_itens where codigo = 'R1';
select count(*) filter (where t.situacao = 'cancelado') as canceladas, count(*) as total from fin_titulos t join est_pedido_titulos pt on pt.titulo_id = t.id
 join est_pedidos p on p.id = pt.pedido_id where p.tipo = 'compra';

-- ------------------------------------------------------------------------------------- acesso
\echo '--- Portal com a permissão financeiro lança pedido da própria empresa'
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
set teste.papel = '';
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'S1'), 'quantidade', 1, 'preco_unitario', 10))))) ->> 'numero' as numero;
\echo '--- Portal em outra empresa (deve falhar)'
select est_pedido_salvar('{"cliente":"00000000-0000-0000-0000-0000000000c2","tipo":"venda","itens":[]}'::jsonb);
\echo '--- sem acesso nenhum não vê pedidos'
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select count(*) as pedidos_visiveis from est_pedidos;
\echo '--- sem acesso cancelar (deve falhar)'
select est_pedido_cancelar((select id from est_pedidos limit 1), 'x');
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'operar';
select count(*) > 0 as auditado from hub_auditoria where acao like 'pedido_%';
reset role;

-- ------------------------------------------------------------------------------------- concorrência
\echo '--- concorrência: duas vendas do último item ao mesmo tempo; a segunda espera a primeira e é recusada'
create extension if not exists dblink;
set role authenticated;
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c1","nome":"Peça única","codigo":"U1","custo":10,"saldo_inicial":1,"local":"00000000-0000-0000-0000-000000000021"}'::jsonb) is not null as ok;
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda', 'categoria', '00000000-0000-0000-0000-0000000000d2',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'U1'), 'quantidade', 1, 'preco_unitario', 20))))) ->> 'numero' as a;
select (est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1', 'tipo', 'venda', 'categoria', '00000000-0000-0000-0000-0000000000d2',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'U1'), 'quantidade', 1, 'preco_unitario', 20))))) ->> 'numero' as b;
reset role;
select dblink_connect('a', :'conexao') as conectou_a, dblink_connect('b', :'conexao') as conectou_b;
select dblink_exec('a', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-0000000000e1''; set teste.papel = ''operar''');
select dblink_exec('b', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-0000000000e1''; set teste.papel = ''operar''');
select dblink_exec('a', 'begin');
select x as primeira from dblink('a', format('select est_pedido_confirmar(%L) ->> ''situacao''',
  (select id from est_pedidos where tipo = 'venda' and numero = 6))) as t(x text);
select dblink_send_query('b', format('select est_pedido_confirmar(%L) ->> ''situacao''', (select id from est_pedidos where tipo = 'venda' and numero = 7))) as enviou;
select pg_sleep(0.5);
select dblink_is_busy('b') = 1 as segunda_esperando;
select dblink_exec('a', 'commit');
select * from dblink_get_result('b', false) as t(x text);
select dblink_error_message('b') like '%Estoque insuficiente%' as segunda_recusada;
select dblink_disconnect('a'), dblink_disconnect('b');
select numero, situacao from est_pedidos where tipo = 'venda' and numero in (6, 7) order by 1;
select s.saldo from est_saldos s join est_itens i on i.id = s.item_id where i.codigo = 'U1';
