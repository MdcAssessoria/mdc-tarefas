-- Testes da 043: Cobrança Ledgra pelo Ledgra Link (configuração, emissão, aviso de pagamento com baixa automática).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
-- duas mensalidades em aberto para os testes (as primeiras por vencimento)
select id as cob1 from lic_cobrancas where situacao = 'aberta' order by vencimento, id limit 1 \gset
select id as cob2 from lic_cobrancas where situacao = 'aberta' and id <> :'cob1' order by vencimento, id limit 1 \gset

set role authenticated;
\echo '--- L1 analista sem Licenças configura o Ledgra Link (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = 'analista';
select link_salvar_config('00000000-0000-0000-0000-0000000000a1', '{"ativo":true,"conta_link_id":"11111111-1111-1111-1111-111111111111"}');

set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
\echo '--- L2 ligar sem informar a conta da MDC no Ledgra Link (deve falhar)'
select link_salvar_config('00000000-0000-0000-0000-0000000000a1', '{"ativo":true}');
\echo '--- L3 multa acima de 2% (deve falhar)'
select link_salvar_config('00000000-0000-0000-0000-0000000000a1', '{"ativo":true,"conta_link_id":"11111111-1111-1111-1111-111111111111","multa_percentual":5}');
\echo '=== L4 administrador liga com a conta (esperado: ativo t, boleto_hibrido, multa 2, juros 1)'
select link_salvar_config('00000000-0000-0000-0000-0000000000a1', '{"ativo":true,"conta_link_id":"11111111-1111-1111-1111-111111111111"}');
select ativo, tipo_padrao, multa_percentual, juros_mensal_percentual from link_config;

\echo '=== L5 pode emitir mensalidade em aberto (esperado: t)'
select link_pode_emitir(:'cob1') as aberta;
\echo '=== L6 analista sem Licenças não pode emitir (esperado: f) e não vê as emissões'
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = 'analista';
select link_pode_emitir(:'cob1') as pode;

\echo '--- L7 usuário logado chama a gravação do servidor (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select link_registrar_emissao(:'cob1', '00000000-0000-0000-0000-0000000000e1',
  '{"cobranca_link_id":"22222222-2222-2222-2222-222222222221","tipo":"boleto_hibrido"}');
\echo '--- L8 usuário logado aplica um aviso falso de pagamento (deve falhar)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333330', 'cobranca.paga', '{"cobranca_id":"22222222-2222-2222-2222-222222222221","valor_pago":999}');

reset role;
set role service_role;
\echo '=== L9 servidor registra a emissão das duas mensalidades (esperado: sem erro)'
select link_registrar_emissao(:'cob1', '00000000-0000-0000-0000-0000000000e1',
  '{"cobranca_link_id":"22222222-2222-2222-2222-222222222221","tipo":"boleto_hibrido","linha_digitavel":"03399.12345 67890.123456 78901.234567 8 12340000015000","pix_copia_cola":"00020126...6304ABCD"}');
select link_registrar_emissao(:'cob2', '00000000-0000-0000-0000-0000000000e1',
  '{"cobranca_link_id":"22222222-2222-2222-2222-222222222222","tipo":"pix_vencimento","pix_copia_cola":"00020126...6304EFGH"}');
\echo '--- L10 emitir de novo uma mensalidade com boleto válido (deve falhar)'
select link_registrar_emissao(:'cob1', '00000000-0000-0000-0000-0000000000e1',
  '{"cobranca_link_id":"22222222-2222-2222-2222-222222222229","tipo":"boleto_hibrido"}');

\echo '=== L11 aviso de pagamento: baixa automática (esperado: baixada)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333331', 'cobranca.paga',
  jsonb_build_object('cobranca_id', '22222222-2222-2222-2222-222222222221',
    'valor_pago', (select valor from lic_cobrancas where id = :'cob1') + 3.5, 'pago_em', now()));
\echo '=== L12 a mensalidade ficou paga, com juros = 3,50 e forma Ledgra Link (esperado: paga, 1 baixa, 3.50)'
select c.situacao, count(b.id) as baixas, max(b.juros) as juros, max(b.forma) as forma
  from lic_cobrancas c left join lic_baixas b on b.cobranca_id = c.id and not b.estornada where c.id = :'cob1' group by c.situacao;
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
\echo '=== L12b depois de paga, não pode emitir de novo (esperado: f)'
select link_pode_emitir(:'cob1') as pode;
reset role;
set role service_role;
\echo '=== L13 o banco reenvia o MESMO aviso (esperado: repetido; continua 1 baixa)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333331', 'cobranca.paga', '{"cobranca_id":"22222222-2222-2222-2222-222222222221","valor_pago":1}');
select count(*) as baixas from lic_baixas where cobranca_id = :'cob1' and not estornada;
\echo '=== L14 outro aviso de pagamento da mesma mensalidade (esperado: ja_baixada; continua 1 baixa)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333332', 'cobranca.paga',
  jsonb_build_object('cobranca_id', '22222222-2222-2222-2222-222222222221', 'valor_pago', 10000));
select count(*) as baixas from lic_baixas where cobranca_id = :'cob1' and not estornada;
\echo '=== L15 pagamento menor que a mensalidade não baixa sozinho (esperado: pagamento_parcial; mensalidade aberta)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333333', 'cobranca.paga',
  jsonb_build_object('cobranca_id', '22222222-2222-2222-2222-222222222222', 'valor_pago', 1));
select situacao from lic_cobrancas where id = :'cob2';
\echo '=== L16 aviso de cobrança que o HUB não conhece (esperado: cobranca_desconhecida)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333334', 'cobranca.paga', '{"cobranca_id":"99999999-9999-9999-9999-999999999999","valor_pago":10}');
\echo '=== L17 aviso de certificado vencendo não mexe em cobrança (esperado: ignorado)'
select link_aplicar_evento('33333333-3333-3333-3333-333333333335', 'certificado.vencendo', '{"dias_para_vencer":15}');
\echo '=== L18 cada aviso registrado uma vez só — o repetido não conta (esperado: 5)'
select count(*) as avisos from link_eventos;

reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
\echo '=== L19 a baixa automática pode ser desfeita pela tela, como qualquer baixa (esperado: aberta)'
select lic_desfazer_baixa(:'cob1', 'Teste: cliente pediu estorno');
select situacao from lic_cobrancas where id = :'cob1';
\echo '=== L20 administrador vê as emissões; analista sem Licenças não vê (esperado: 2 e 0)'
select count(*) as admin_ve from link_cobrancas;
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = 'analista';
select count(*) as analista_ve from link_cobrancas;
\echo '--- L21 tela grava direto na tabela de emissões (deve falhar)'
insert into link_cobrancas (lic_cobranca_id, org_id, cobranca_link_id, tipo)
  values (:'cob2', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'boleto');
reset role;
