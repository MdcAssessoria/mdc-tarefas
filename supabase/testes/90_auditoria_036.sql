-- Testes da 036 (auditoria independente de 02/11/2026). Roda por último, com a 035 e a 036 aplicadas (regras reais).
-- As provas P1–P12 da auditoria viraram testes de regressão: cada exploração termina em ERROR com mensagem em
-- português e está marcada "(deve falhar)". Os blocos sem a marca são os fluxos normais e não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
-- ---------------------------------------------------------------- cenário: cliente c3 com CNPJ, outra org, pessoas
insert into clientes (id, org_id, nome, cnpj) values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'Cliente 3', '11222333000181');
insert into organizacoes (id, nome) values ('00000000-0000-0000-0000-0000000000a2', 'Outra org');
insert into fin_plano_contas (id, org_id, cliente_id, classificacao, descricao, analitica) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', '4.1.01', 'Compras', true),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', '3.1.01', 'Vendas', true),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', '1.1.01', 'Banco', true);
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
  ('00000000-0000-0000-0000-000000000d31', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'despesa', 'Compras', '00000000-0000-0000-0000-000000000301'),
  ('00000000-0000-0000-0000-000000000d32', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'receita', 'Vendas', '00000000-0000-0000-0000-000000000302');
insert into fin_contas_bancarias (id, org_id, cliente_id, nome, conta_contabil_id) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'Banco C3', '00000000-0000-0000-0000-000000000303');
insert into est_locais (id, org_id, cliente_id, nome, padrao) values ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'Depósito', true);
-- Portal: e3 com financeiro; contrato do c3 SÓ com Relatórios (cortesia)
insert into portal_usuarios (user_id, cliente_id, org_id, ativo, permissoes) values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', true, array['financeiro']);
insert into lic_contratos (id, org_id, cliente_id, valor_mensal, dia_vencimento, inicio)
values ('00000000-0000-0000-0000-00000000c0c3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 0, 10, current_date - 30);
insert into lic_contrato_produtos (contrato_id, produto_id, org_id)
select '00000000-0000-0000-0000-00000000c0c3', id, org_id from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' and slug = 'relatorios';
-- Equipe: e9 só Relatórios (gerir); e10 Entradas (operar); e11 Financeiro (operar); e12 Atendimento (gerir); e1 administrador
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e9', 'relatorios', 'gerir'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e10', 'entradas', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e11', 'financeiro', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e12', 'atendimento', 'gerir');
insert into membros (org_id, user_id, nome, papel, ativo) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Admin', 'admin', true);
-- chaves de acesso com dígito verificador certo (emitente 99888777000166)
select b || app.fis_dv_chave(b) as k65 from (select '352611' || '99888777000166' || '65' || '001' || lpad('123', 9, '0') || '1' || '12345678' as b) x \gset
select b || app.fis_dv_chave(b) as k55 from (select '352611' || '99888777000166' || '55' || '001' || lpad('200', 9, '0') || '1' || '12345678' as b) x \gset
select b || app.fis_dv_chave(b) as k99 from (select '352611' || '99888777000166' || '99' || '001' || lpad('300', 9, '0') || '1' || '12345678' as b) x \gset

\echo '=== P1 equipe só com Relatórios: só lê (esperado: f, f, t, f)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
set teste.membro = 'analista';
select app.hub_pode('00000000-0000-0000-0000-0000000000a1', 'financeiro', 'gerir') as financeiro_gerir,
       fis_pode_certificado('00000000-0000-0000-0000-0000000000c3') as certificado,
       app.fin_pode('00000000-0000-0000-0000-0000000000c3', 'ver') as le,
       app.fin_pode('00000000-0000-0000-0000-0000000000c3', 'operar') as grava;
select count(*) >= 0 as relatorios_le_plano from fin_plano_contas where cliente_id = '00000000-0000-0000-0000-0000000000c3';
\echo '--- P1 Relatórios libera estoque negativo (deve falhar)'
select est_definir_negativo('00000000-0000-0000-0000-0000000000c3', true);
\echo '--- P1 Relatórios muda regra de tipo de entrada (deve falhar)'
select fis_salvar_tipo_entrada('{"org":"00000000-0000-0000-0000-0000000000a1","codigo":"revenda","gera_pagar":false}'::jsonb);
\echo '--- P1 Relatórios cadastra item (deve falhar)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c3","nome":"Hack"}'::jsonb);

\echo '=== P2 Portal com contrato só de Relatórios: lê, não grava (esperado: t, f)'
set teste.uid = '00000000-0000-0000-0000-0000000000e3';
set teste.membro = '';
select app.fin_pode('00000000-0000-0000-0000-0000000000c3', 'ver') as le, app.fin_pode('00000000-0000-0000-0000-0000000000c3', 'operar') as grava;
\echo '--- P2 Portal lança título só com Relatórios (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c3","tipo":"pagar","categoria":"00000000-0000-0000-0000-000000000d31","descricao":"Despesa via Relatórios","vencimento":"2026-12-01","valor":50}'::jsonb);

\echo '=== Equipe com Entradas (operar): cadastra item e envia XML'
set teste.uid = '00000000-0000-0000-0000-000000000e10';
set teste.membro = 'analista';
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-0000000000c3","nome":"Produto X","codigo":"PX","custo":10,"saldo_inicial":10,"local":"00000000-0000-0000-0000-000000000031"}'::jsonb) is not null as item_ok;
\echo '--- P3 XML com dígito verificador errado (deve falhar)'
select fis_registrar_upload(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'caminho', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c3/upload/2026/11/x.xml',
  'nota', jsonb_build_object('chave', '35261199888777000166550010000001231000001234', 'modelo', '55', 'conteudo', 'completa',
     'numero', '123', 'emitente_doc', '99888777000166', 'destinatario_doc', '11222333000181', 'valor_total', 1000)));
\echo '--- P3 CNPJ do emitente diferente do da chave (deve falhar)'
select fis_registrar_upload(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'caminho', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c3/upload/2026/11/x.xml',
  'nota', jsonb_build_object('chave', :'k55', 'modelo', '55', 'conteudo', 'completa',
     'numero', '200', 'emitente_doc', '55444333000122', 'destinatario_doc', '11222333000181', 'valor_total', 1000)));
\echo '--- P3 modelo de documento fora da lista, pela chave (deve falhar)'
select fis_registrar_upload(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'caminho', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c3/upload/2026/11/x.xml',
  'nota', jsonb_build_object('chave', :'k99', 'modelo', '55', 'conteudo', 'completa',
     'numero', '300', 'emitente_doc', '99888777000166', 'destinatario_doc', '11222333000181', 'valor_total', 1)));
\echo '--- P3 modelo "outro" informado pela tela (deve falhar)'
select fis_registrar_upload(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'caminho', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c3/upload/2026/11/x.xml',
  'nota', jsonb_build_object('chave', :'k55', 'modelo', 'outro', 'conteudo', 'completa',
     'numero', '200', 'emitente_doc', '99888777000166', 'destinatario_doc', '11222333000181', 'valor_total', 1000)));
\echo '--- envio válido: a tela diz 65, o modelo vem da chave (55)'
select fis_registrar_upload(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'caminho', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c3/upload/2026/11/a.xml',
  'nota', jsonb_build_object('chave', :'k55', 'modelo', '65', 'conteudo', 'completa',
     'numero', '200', 'emitente_doc', '99888777000166', 'emitente_nome', 'Forjado', 'destinatario_doc', '11222333000181', 'valor_total', 1000,
     'itens', jsonb_build_array(jsonb_build_object('numero', 1, 'codigo', 'F1', 'descricao', 'Produto', 'quantidade', 10, 'valor_total', 1000))))) ? 'nota' as ok;
select modelo as modelo_da_chave, origem from fis_notas where numero = '200';
\echo '--- P3 NF-e sem Confirmação da operação não é lançada (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '200'), 'tipo_entrada', 'uso_consumo',
  'categoria', '00000000-0000-0000-0000-000000000d31', 'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 1000))));
\echo '--- código inválido vira mensagem em português (deve falhar)'
select fis_processar_nota('{"nota":"abc"}'::jsonb);

\echo '=== P4 Entradas lança NFC-e (65) com estoque e desfaz: custo médio volta a 10'
select fis_registrar_upload(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'caminho', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c3/upload/2026/11/b.xml',
  'nota', jsonb_build_object('chave', :'k65', 'conteudo', 'completa', 'numero', '123', 'emitente_doc', '99888777000166',
     'emitente_nome', 'Fornecedor Real', 'destinatario_doc', '11222333000181', 'valor_total', 1000,
     'itens', jsonb_build_array(jsonb_build_object('numero', 1, 'codigo', 'F1', 'descricao', 'Produto', 'quantidade', 10, 'valor_total', 1000, 'unidade', 'UN'))))) ? 'nota' as ok;
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '123'), 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-000000000d31', 'local', '00000000-0000-0000-0000-000000000031',
  'itens', jsonb_build_array(jsonb_build_object('id', (select ni.id from fis_nota_itens ni join fis_notas n on n.id = ni.nota_id where n.numero = '123'),
     'item', (select id from est_itens where codigo = 'PX'))),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 1000)))) ? 'titulos' as entradas_lancou_nota;
select custo_medio as cm_55 from est_itens where codigo = 'PX';
select fis_desfazer_lancamento((select id from fis_notas where numero = '123'), 'teste') is not null as desfeito;
select i.custo_medio as cm_volta_10,
       (select saldo_apos from est_movimentos where item_id = i.id and not estornado order by data desc, id desc limit 1) as ficha_10,
       (select situacao from fin_titulos where nota_id = (select id from fis_notas where numero = '123')) as titulo_cancelado
  from est_itens i where codigo = 'PX';
\echo '--- relança a nota 123 (para P5b e P6)'
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '123'), 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-000000000d31', 'local', '00000000-0000-0000-0000-000000000031',
  'itens', jsonb_build_array(jsonb_build_object('id', (select ni.id from fis_nota_itens ni join fis_notas n on n.id = ni.nota_id where n.numero = '123'),
     'item', (select id from est_itens where codigo = 'PX'))),
  'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 1000)))) ? 'titulos' as ok;

\echo '=== P5 nota da SEFAZ substitui a enviada à mão ainda não lançada (esperado: dfe, 37.50, 1 item)'
reset role;
set role service_role;
select fis_gravar_documento(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'origem', 'dfe', 'caminho', 'real.xml',
  'nota', jsonb_build_object('chave', :'k55', 'modelo', '55', 'conteudo', 'completa', 'numero', '200', 'emitente_nome', 'Fornecedor Real',
     'emitente_doc', '99888777000166', 'destinatario_doc', '11222333000181', 'valor_total', 37.5,
     'itens', jsonb_build_array(jsonb_build_object('numero', 1, 'descricao', 'Real', 'quantidade', 1, 'valor_total', 37.5))))) ? 'nota' as captura_ok;
reset role;
select origem, valor_total, xml_caminho, (select count(*) from fis_nota_itens where nota_id = n.id) as itens from fis_notas n where numero = '200';
select count(*) as auditoria_substituida from hub_auditoria where acao = 'notas_upload_substituida';
\echo '=== P5b nota já lançada: não substitui, avisa (esperado: upload, 1000, 1 aviso)'
set role service_role;
select fis_gravar_documento(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'origem', 'dfe', 'caminho', 'real65.xml',
  'nota', jsonb_build_object('chave', :'k65', 'modelo', '65', 'conteudo', 'completa', 'numero', '123',
     'emitente_doc', '99888777000166', 'destinatario_doc', '11222333000181', 'valor_total', 999))) ? 'nota' as captura_ok;
reset role;
select origem, valor_total from fis_notas where numero = '123';
select count(*) as avisos_divergencia from hub_auditoria where acao = 'notas_upload_divergencia';

\echo '=== P6 nota lançada cancelada pelo emitente: auditoria e sino dos administradores'
set role service_role;
select fis_gravar_documento(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3',
  'evento', jsonb_build_object('chave', :'k65', 'tpEvento', '110111', 'cStat', '135', 'protocolo', '999'))) ? 'evento' as cancelamento_gravado;
reset role;
select (select count(*) from hub_auditoria where acao = 'notas_cancelada_apos_lancamento') as auditoria,
       (select count(*) from hub_notificacoes where user_id = '00000000-0000-0000-0000-0000000000e1' and titulo like 'Nota lançada%') as sino_admin;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e11';
set teste.membro = 'analista';
\echo '--- P6 pagar conta de nota cancelada (deve falhar)'
select fin_baixar((select id from fin_titulos where nota_id = (select id from fis_notas where numero = '123') and situacao = 'aberto'), current_date, 1000, '00000000-0000-0000-0000-0000000000b3');
\echo '--- P6 Financeiro não cancela conta de nota pelo título avulso (deve falhar)'
select fin_cancelar_titulo((select id from fin_titulos where nota_id = (select id from fis_notas where numero = '123') and situacao = 'aberto'), 'avulso');
\echo '--- Entradas desfaz o lançamento da nota cancelada'
set teste.uid = '00000000-0000-0000-0000-000000000e10';
select fis_desfazer_lancamento((select id from fis_notas where numero = '123'), 'nota cancelada pelo emitente') is not null as desfeito;

\echo '=== Portal com contrato de Financeiro opera'
reset role;
insert into lic_contratos (id, org_id, cliente_id, valor_mensal, dia_vencimento, inicio)
values ('00000000-0000-0000-0000-00000000c1c3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 0, 10, current_date - 30);
insert into lic_contrato_produtos (contrato_id, produto_id, org_id)
select '00000000-0000-0000-0000-00000000c1c3', id, org_id from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' and slug = 'financeiro';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e3';
set teste.membro = '';
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c3","tipo":"pagar","categoria":"00000000-0000-0000-0000-000000000d31","descricao":"Avulso","vencimento":"2026-12-01","valor":50}'::jsonb) ? 'titulos' as portal_lancou;
\echo '--- data inválida vira mensagem em português (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c3","tipo":"pagar","categoria":"00000000-0000-0000-0000-000000000d31","descricao":"x","vencimento":"31/31/2026","valor":50}'::jsonb);
\echo '--- P7 trocar a data de criação / quem lançou de um título (deve falhar)'
update fin_titulos set criado_em = '2000-01-01', por = null where descricao = 'Avulso';
\echo '--- venda pelo Portal (Financeiro libera Saídas)'
select est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'tipo', 'venda', 'pessoa_nome', 'Comprador',
  'categoria', '00000000-0000-0000-0000-000000000d32', 'local', '00000000-0000-0000-0000-000000000031',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'PX'), 'quantidade', 2, 'preco_unitario', 50)))) ->> 'numero' as pedido;
select est_pedido_confirmar((select id from est_pedidos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and tipo = 'venda' and numero = 1)) ->> 'situacao' as sit;
\echo '--- P7 editar valor e vencimento do título do pedido (deve falhar)'
update fin_titulos set valor = 1, vencimento = '2030-01-01' where id in (select titulo_id from est_pedido_titulos);
\echo '--- P7 apontar o título do pedido para uma nota (deve falhar)'
update fin_titulos set nota_id = (select id from fis_notas where numero = '123') where id in (select titulo_id from est_pedido_titulos);
\echo '--- P7 cancelar título do pedido pelo Financeiro avulso (deve falhar)'
select fin_cancelar_titulo((select titulo_id from est_pedido_titulos limit 1), 'avulso');
select p.total as pedido_100, t.valor as titulo_100, t.situacao from est_pedidos p join est_pedido_titulos pt on pt.pedido_id = p.id
  join fin_titulos t on t.id = pt.titulo_id where p.cliente_id = '00000000-0000-0000-0000-0000000000c3';
\echo '--- P8 Portal fatura a venda'
select est_pedido_faturar((select id from est_pedidos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and tipo = 'venda' and numero = 1), '77') is not null as faturado;
\echo '--- P8 Portal cancela venda faturada (deve falhar)'
select est_pedido_cancelar((select id from est_pedidos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and tipo = 'venda' and numero = 1), 'desisti');
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
\echo '--- P8 administrador cancela venda faturada sem citar a nota (deve falhar)'
select est_pedido_cancelar((select id from est_pedidos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and tipo = 'venda' and numero = 1), 'desisti');
\echo '--- administrador cancela citando a nota'
select est_pedido_cancelar((select id from est_pedidos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and tipo = 'venda' and numero = 1), 'NF 77 cancelada na SEFAZ') is not null as cancelado;
select situacao from est_pedidos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and tipo = 'venda' and numero = 1;
\echo '--- Estoque (operar) não faz pedido de venda (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e7';
set teste.membro = 'analista';
select est_pedido_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'tipo', 'venda', 'categoria', '00000000-0000-0000-0000-000000000d32',
  'itens', jsonb_build_array(jsonb_build_object('item', (select id from est_itens where codigo = 'PX'), 'quantidade', 1, 'preco_unitario', 50))));

\echo '=== Estoque (operar) movimenta o estoque'
select est_movimentar(jsonb_build_object('item', (select id from est_itens where codigo = 'PX'), 'local', '00000000-0000-0000-0000-000000000031',
  'tipo', 'entrada', 'quantidade', 1, 'custo_unitario', 10)) ? 'movimentos' as estoque_movimentou;
\echo '--- P9 saída com data passada deixaria a ficha negativa (deve falhar)'
select est_movimentar(jsonb_build_object('item', (select id from est_itens where codigo = 'PX'), 'local', '00000000-0000-0000-0000-000000000031',
  'tipo', 'saida', 'quantidade', 10, 'data', (current_date - 400)::text));
\echo '--- saída de hoje dentro do saldo continua valendo'
select est_movimentar(jsonb_build_object('item', (select id from est_itens where codigo = 'PX'), 'local', '00000000-0000-0000-0000-000000000031',
  'tipo', 'saida', 'quantidade', 1)) ? 'movimentos' as ok;

\echo '=== P10 fotos de item: pasta da própria organização vale'
set teste.uid = '00000000-0000-0000-0000-0000000000e3';
set teste.membro = '';
insert into storage.objects (bucket_id, name) values ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/estoque/00000000-0000-0000-0000-0000000000c3/certa.png');
\echo '--- P10 Portal grava foto na pasta de OUTRA organização (deve falhar)'
insert into storage.objects (bucket_id, name) values ('hub-arquivos', '00000000-0000-0000-0000-0000000000a2/estoque/00000000-0000-0000-0000-0000000000c3/x.png');
\echo '--- P10 Portal envia documento na pasta de OUTRA organização (deve falhar)'
insert into storage.objects (bucket_id, name) values ('hub-arquivos', '00000000-0000-0000-0000-0000000000a2/portal/00000000-0000-0000-0000-0000000000c3/x.pdf');

\echo '=== P11 Portal só leitura (financeiro_ver): vê, não grava (esperado: t, f)'
reset role;
set teste.uid = '';
insert into portal_usuarios (user_id, cliente_id, org_id, ativo, permissoes) values ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', true, array['financeiro_ver']);
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e4';
select app.fin_pode('00000000-0000-0000-0000-0000000000c3', 'ver') as ve, app.fin_pode('00000000-0000-0000-0000-0000000000c3', 'operar') as grava;
select count(*) > 0 as ve_titulos from fin_titulos;
\echo '--- P11 só leitura lança título (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c3","tipo":"pagar","categoria":"00000000-0000-0000-0000-000000000d31","descricao":"x","vencimento":"2026-12-01","valor":5}'::jsonb);

\echo '=== S-01 permissões do Portal (Atendimento gerir convida; Financeiro só com gerir no Financeiro)'
set teste.uid = '00000000-0000-0000-0000-000000000e12';
set teste.membro = 'analista';
select portal_convidar('00000000-0000-0000-0000-0000000000c3', 'cliente.novo@exemplo.com', 'Novo', array['chat', 'documentos']) as convite_ok;
\echo '--- S-01 Atendimento libera Financeiro no Portal (deve falhar)'
select portal_convidar('00000000-0000-0000-0000-0000000000c3', 'outro@exemplo.com', 'Outro', array['financeiro']);
\echo '--- S-01 permissão inventada (deve falhar)'
select portal_convidar('00000000-0000-0000-0000-0000000000c3', 'outro@exemplo.com', 'Outro', array['admin']);
\echo '--- S-01 gravação direta dá Financeiro a um acesso (deve falhar)'
update portal_usuarios set permissoes = array['financeiro'] where user_id = '00000000-0000-0000-0000-0000000000e4';
\echo '--- S-01 convite gravado direto com permissão inventada (deve falhar)'
insert into portal_convites (org_id, email, cliente_id, nome, permissoes) values ('00000000-0000-0000-0000-0000000000a1', 'x@exemplo.com', '00000000-0000-0000-0000-0000000000c3', 'X', array['tudo']);
\echo '--- cancelar convite do Portal com motivo'
select portal_cancelar_convite('00000000-0000-0000-0000-0000000000c3', 'cliente.novo@exemplo.com', 'saiu da empresa') is not null as cancelado;
select cancelado_motivo from portal_convites where email = 'cliente.novo@exemplo.com';
\echo '--- apagar convite do Portal (deve falhar)'
delete from portal_convites where email = 'cliente.novo@exemplo.com';
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select portal_convidar('00000000-0000-0000-0000-0000000000c3', 'financeiro@exemplo.com', 'Fin', array['financeiro', 'financeiro_ver']) as admin_libera_financeiro;
select permissoes from portal_convites where email = 'financeiro@exemplo.com';

\echo '=== S-02 cliente bloqueado não envia certificado nem vê notas no Portal (esperado: t, t antes; f, f bloqueado)'
reset role;
insert into lic_contrato_produtos (contrato_id, produto_id, org_id)
select '00000000-0000-0000-0000-00000000c1c3', id, org_id from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' and slug = 'entradas';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e3';
set teste.membro = '';
select fis_pode_certificado('00000000-0000-0000-0000-0000000000c3') as envia, app.fis_org_visivel('00000000-0000-0000-0000-0000000000a1') as ve_regras;
reset role;
insert into lic_bloqueios (org_id, cliente_id, motivo) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'inadimplência');
set role authenticated;
select fis_pode_certificado('00000000-0000-0000-0000-0000000000c3') as envia_bloqueado, app.fis_org_visivel('00000000-0000-0000-0000-0000000000a1') as ve_bloqueado;
reset role;
update lic_bloqueios set desbloqueado_em = now(), motivo_desbloqueio = 'pagou' where cliente_id = '00000000-0000-0000-0000-0000000000c3' and desbloqueado_em is null;

\echo '=== B-06 módulo inativo não libera o Portal (esperado: t, f)'
select app.cliente_tem_modulo('00000000-0000-0000-0000-0000000000c3', 'relatorios') as antes;
update lic_produtos set ativo = false where slug = 'relatorios';
select app.cliente_tem_modulo('00000000-0000-0000-0000-0000000000c3', 'relatorios') as inativo;
update lic_produtos set ativo = true where slug = 'relatorios';

\echo '=== B-04 desfazer extrato marca, não apaga; reimportar volta a gravar'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select fin_importar_extrato('00000000-0000-0000-0000-0000000000b3', 'ex.ofx', 'ofx', current_date - 5, current_date, 100,
  '[{"data":"2026-11-01","valor":10,"descricao":"A","chave":"k1"},{"data":"2026-11-02","valor":-5,"descricao":"B","chave":"k2"}]'::jsonb) ->> 'novas' as novas_2;
\echo '--- desfazer sem motivo (deve falhar)'
select fin_desfazer_lote((select id from fin_extrato_lotes where arquivo = 'ex.ofx'), '');
select fin_desfazer_lote((select id from fin_extrato_lotes where arquivo = 'ex.ofx'), 'arquivo errado') ->> 'desfeitas' as desfeitas_2;
select count(*) as linhas_guardadas, count(*) filter (where situacao = 'desfeita') as desfeitas from fin_extrato_linhas where conta_id = '00000000-0000-0000-0000-0000000000b3';
select fin_importar_extrato('00000000-0000-0000-0000-0000000000b3', 'ex2.ofx', 'ofx', current_date - 5, current_date, 100,
  '[{"data":"2026-11-01","valor":10,"descricao":"A","chave":"k1"},{"data":"2026-11-02","valor":-5,"descricao":"B","chave":"k2"}]'::jsonb) ->> 'novas' as reimportou_2;
select id as lote2 from fin_extrato_lotes where arquivo = 'ex2.ofx' \gset
\echo '--- Entradas desfaz importação de extrato (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e10';
set teste.membro = 'analista';
select fin_desfazer_lote(:'lote2', 'x');
reset role;

\echo '=== B-05 rotina diária: avisa o atraso de bloqueio uma vez só e registra o encerramento'
insert into lic_cobrancas (org_id, cliente_id, contrato_id, competencia, vencimento, descricao, valor)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000c1c3', '2019-01-01', current_date - 45, 'Atrasada', 10);
select count(*) as sugestoes_antes from hub_notificacoes where texto like '%avalie o bloqueio%' \gset
update lic_parametros set ultimo_aviso = null;
select app.lic_rotina_diaria() is not null as rodou_1;
select count(*) - :sugestoes_antes as pessoas_avisadas from hub_notificacoes where texto like '%avalie o bloqueio%';
update lic_parametros set ultimo_aviso = null;
select app.lic_rotina_diaria() is not null as rodou_2;
select count(*) - :sugestoes_antes as mesmas_pessoas_sem_repetir from hub_notificacoes where texto like '%avalie o bloqueio%';
select aviso_bloqueio_em is not null as marcada from lic_cobrancas where descricao = 'Atrasada';
update lic_contratos set fim = current_date - 1 where id = '00000000-0000-0000-0000-00000000c0c3';
select app.lic_rotina_diaria() ->> 'encerrados' as encerrados_1;
select count(*) as encerramento_auditado from hub_auditoria where acao = 'encerrar_contrato' and alvo = '00000000-0000-0000-0000-00000000c0c3';

\echo '=== S-08 Simulador: 20 leads por minuto passam'
set role anon;
do $$ begin for k in 1..20 loop
  perform crm_receber_lead(jsonb_build_object('consentimento', true, 'nome', 'Lead ' || k, 'empresa', 'Empresa ' || k, 'id', 'lead-' || k));
end loop; end $$;
\echo '--- S-08 21º lead no mesmo minuto (deve falhar)'
select crm_receber_lead('{"consentimento":true,"nome":"Lead 21","empresa":"Empresa 21","id":"lead-21"}'::jsonb);
reset role;
select count(*) as leads_20 from crm_oportunidades where origem = 'simulador';

\echo '=== S-10 clientes'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e5';
set teste.membro = 'gestor';
\echo '--- S-10 gestor apaga cliente (deve falhar)'
delete from clientes where id = '00000000-0000-0000-0000-0000000000c3';
\echo '--- S-10 gestor troca o CNPJ de cliente com notas (deve falhar)'
update clientes set cnpj = '99999999000191' where id = '00000000-0000-0000-0000-0000000000c3';
set teste.membro = 'admin';
update clientes set cnpj = '99999999000191' where id = '00000000-0000-0000-0000-0000000000c3';
update clientes set cnpj = '11222333000181' where id = '00000000-0000-0000-0000-0000000000c3';
reset role;
select count(*) as cnpj_auditado_2 from hub_auditoria where acao = 'mudar_cnpj';

\echo '=== 15 nada se apaga: cancelar, encerrar, inativar com motivo'
reset role;
insert into tarefas (id, org_id, titulo) values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000a1', 'Tarefa');
insert into venc_itens (id, org_id, tipo, descricao, vence_em) values ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000000a1', 'alvara', 'Alvará', current_date + 90);
insert into feriados (id, org_id, data, descricao) values ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-0000000000a1', '2026-12-08', 'Padroeira');
insert into hub_perfis (id, org_id, nome, apps) values ('00000000-0000-0000-0000-00000000aa04', '00000000-0000-0000-0000-0000000000a1', 'Fiscal', '{}');
update membros set perfil_id = '00000000-0000-0000-0000-00000000aa04' where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into crm_oportunidades (id, org_id, empresa) values ('00000000-0000-0000-0000-00000000aa05', '00000000-0000-0000-0000-0000000000a1', 'Lead');
insert into hub_acessos (org_id, user_id, app, papel) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', 'vencimentos', 'gerir'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', 'comercial', 'gerir');
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e5';
set teste.membro = 'gestor';
\echo '--- apagar tarefa (deve falhar)'
delete from tarefas where id = '00000000-0000-0000-0000-00000000aa01';
\echo '--- apagar vencimento (deve falhar)'
delete from venc_itens where id = '00000000-0000-0000-0000-00000000aa02';
\echo '--- apagar feriado (deve falhar)'
delete from feriados where id = '00000000-0000-0000-0000-00000000aa03';
\echo '--- apagar oportunidade do CRM (deve falhar)'
delete from crm_oportunidades where id = '00000000-0000-0000-0000-00000000aa05';
\echo '--- apagar perfil de acesso (deve falhar)'
delete from hub_perfis where id = '00000000-0000-0000-0000-00000000aa04';
\echo '--- cancelar sem motivo (deve falhar)'
select tarefa_cancelar('00000000-0000-0000-0000-00000000aa01', ' ');
\echo '--- cancelar, encerrar e inativar com motivo'
select tarefa_cancelar('00000000-0000-0000-0000-00000000aa01', 'duplicada') is not null as tarefa,
       venc_encerrar('00000000-0000-0000-0000-00000000aa02', 'empresa mudou de endereço') is not null as vencimento,
       feriado_inativar('00000000-0000-0000-0000-00000000aa03', 'cadastrado por engano') is not null as feriado;
select status, cancelado_motivo from tarefas where id = '00000000-0000-0000-0000-00000000aa01';
select status, encerrado_motivo from venc_itens where id = '00000000-0000-0000-0000-00000000aa02';
select ativo, inativado_motivo from feriados where id = '00000000-0000-0000-0000-00000000aa03';
\echo '--- gestor inativa perfil (deve falhar: só administrador)'
select hub_inativar_perfil('00000000-0000-0000-0000-00000000aa04', 'não usamos mais');
set teste.membro = 'admin';
select hub_inativar_perfil('00000000-0000-0000-0000-00000000aa04', 'não usamos mais') as pessoas_soltas;
select ativo, nome like 'Fiscal (inativo em%' as nome_livre from hub_perfis where id = '00000000-0000-0000-0000-00000000aa04';
\echo '--- pôr pessoa em perfil inativo (deve falhar)'
reset role;
update membros set perfil_id = '00000000-0000-0000-0000-00000000aa04' where user_id = '00000000-0000-0000-0000-0000000000e1';
\echo '--- o banco recusa apagar mesmo fora da API (deve falhar)'
delete from tarefas where id = '00000000-0000-0000-0000-00000000aa01';
\echo '--- feriado inativo não conta no dia útil (08/12/2026 é terça)'
select app.dia_util('00000000-0000-0000-0000-0000000000a1', '2026-12-08', 'posterga') as continua_dia_8;

\echo '=== B-07 índices novos (esperado: 7)'
select count(*) as indices from pg_indexes where indexname in ('lic_contratos_cliente_ativo', 'fin_extrato_linhas_lote', 'fin_titulos_pessoa',
  'fin_titulos_categoria', 'est_pedido_itens_movimento', 'fis_nota_itens_item', 'est_pedidos_pessoa');

\echo '=== P12 corrida: dois contratos ao mesmo tempo com o mesmo módulo para o mesmo cliente'
insert into clientes (id, org_id, nome) values ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a1', 'Cliente 4');
create extension if not exists dblink;
select dblink_connect('a', :'conexao') as a, dblink_connect('b', :'conexao') as b;
select dblink_exec('a', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-0000000000e1''; set teste.membro = ''admin''') as a,
       dblink_exec('b', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-0000000000e1''; set teste.membro = ''admin''') as b;
select dblink_exec('a', 'begin') as a, dblink_exec('b', 'begin') as b;
select x is not null as primeiro_gravou from dblink('a', format('select lic_salvar_contrato(%L)::text', jsonb_build_object('cliente','00000000-0000-0000-0000-0000000000c4','produtos', jsonb_build_array((select id from lic_produtos where slug='saidas' and org_id='00000000-0000-0000-0000-0000000000a1')),'valor_mensal',10,'dia_vencimento',5,'inicio',current_date,'reajuste_indice','nenhum'))) t(x text);
select dblink_send_query('b', format('select lic_salvar_contrato(%L)::text', jsonb_build_object('cliente','00000000-0000-0000-0000-0000000000c4','produtos', jsonb_build_array((select id from lic_produtos where slug='saidas' and org_id='00000000-0000-0000-0000-0000000000a1')),'valor_mensal',20,'dia_vencimento',5,'inicio',current_date,'reajuste_indice','nenhum'))) as enviado;
select dblink_exec('a', 'commit') as a_commit;
\echo '--- P12 segundo contrato com o mesmo módulo, ao mesmo tempo (deve falhar)'
select * from dblink_get_result('b') as t(x text);
\echo '--- limpa a conexão b'
select count(*) as fim_do_resultado from dblink_get_result('b') as t(x text);
select dblink_exec('b', 'rollback') as b_rollback;
select dblink_disconnect('a'), dblink_disconnect('b');
select count(*) as contratos_ativos_1 from lic_contratos k join lic_contrato_produtos cp on cp.contrato_id = k.id join lic_produtos p on p.id = cp.produto_id
 where k.cliente_id = '00000000-0000-0000-0000-0000000000c4' and k.situacao = 'ativo' and p.slug = 'saidas';
