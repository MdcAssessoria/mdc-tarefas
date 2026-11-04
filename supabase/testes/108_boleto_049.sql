-- Testes da 049: boleto das faturas pelo Ledgra Link (Itaú e Santander): configuração por banco, preparo com o login de
-- quem pede, registro só pelo servidor, Portal que espera o boleto, envio do "boleto depois", aviso de pagamento com baixa
-- automática sem dobrar, pagamento parcial, boleto recusado que libera outro e "nada se apaga".
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2031-05-02';

\echo '=== P0 contratos com boleto (cliente com CNPJ): Itaú com Portal; Santander "boleto depois" com Portal; Itaú sem CNPJ é o da 048'
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e491",
  "descricao":"Honorários com boleto","valor":"1200","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2031-05-01",
  "envio":"fatura_boleto","boleto_banco":"itau","dia_geracao":1,"canais":["portal"],"cliente_carteira":"00000000-0000-0000-0000-0000000000c1"}'::jsonb)->>'id') as k_itau \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e491",
  "descricao":"Consultoria boleto depois","valor":"900","dia":25,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2031-05-01",
  "documento":"nfse","envio":"nf_fatura","boleto_banco":"santander","dia_geracao":1,"canais":["portal"],
  "cliente_carteira":"00000000-0000-0000-0000-0000000000c1","servico_descricao":"Consultoria","servico_codigo":"17.01.01","iss_aliquota":"2"}'::jsonb)->>'id') as k_sant \gset
reset role;
select id as f_itau from fin_faturas where recorrente_id = :'k_itau' and competencia = '2031-05-01' \gset
select id as f_sant from fin_faturas where recorrente_id = :'k_sant' and competencia = '2031-05-01' \gset
select id as f_sem from fin_faturas where recorrente_id = (select id from fin_recorrentes where descricao = 'Boleto Itaú') and situacao <> 'cancelada'
 order by competencia desc limit 1 \gset
select r.descricao, f.boleto_situacao, e.etapa, e.conteudo, e.situacao from fin_faturas f join fin_recorrentes r on r.id = f.recorrente_id
  left join fin_envios e on e.fatura_id = f.id where f.id in (:'f_itau', :'f_sant') order by 1;

\echo '--- P1 gerar boleto antes de configurar o Itaú (deve falhar)'
set role authenticated;
select fatura_boleto_preparar(:'f_itau');
\echo '--- P2 operador configura a conta do banco (deve falhar)'
select link_salvar_banco('{"banco":"itau","conta_link_id":"7d1b6f2e-1111-4a3c-9d1e-0000000000aa","fin_conta":"00000000-0000-0000-0000-00000000b401"}'::jsonb);
\echo '=== P3 quem gere Contratos configura Itaú e Santander'
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select (link_salvar_banco('{"banco":"Itau","conta_link_id":"7d1b6f2e-1111-4a3c-9d1e-0000000000aa","fin_conta":"00000000-0000-0000-0000-00000000b401"}'::jsonb))->>'codigo_compe' as itau_341;
select (link_salvar_banco('{"banco":"santander","conta_link_id":"7d1b6f2e-2222-4a3c-9d1e-0000000000bb","fin_conta":"00000000-0000-0000-0000-00000000b402","tipo":"boleto"}'::jsonb))->>'codigo_compe' as santander_033;
\echo '--- P3b banco que não é Itaú nem Santander (deve falhar)'
select link_salvar_banco('{"banco":"bradesco","conta_link_id":"7d1b6f2e-1111-4a3c-9d1e-0000000000aa","fin_conta":"00000000-0000-0000-0000-00000000b401"}'::jsonb);
\echo '--- P3c código da conta no Ledgra Link inválido (deve falhar)'
select link_salvar_banco('{"banco":"itau","conta_link_id":"abc","fin_conta":"00000000-0000-0000-0000-00000000b401"}'::jsonb);

\echo '--- P4 quem só vê Contratos prepara o boleto (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fatura_boleto_preparar(:'f_itau');
\echo '--- P5 cliente sem CNPJ/CPF (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fatura_boleto_preparar(:'f_sem');
\echo '=== P6 preparo do Itaú (esperado: itau, 341, 1200.00, FAT-<id>, tentativa 1, documento 45723174000110)'
select p->>'banco' as banco, p->>'codigo_compe' as compe, p->>'valor' as valor, p->>'ref_externa' = 'FAT-' || :'f_itau' as ref_ok,
       p->>'tentativa' as tentativa, p->'pagador'->>'documento' as documento
  from (select fatura_boleto_preparar(:'f_itau') as p) x;
\echo '--- P7 a tela grava o boleto direto (deve falhar)'
select fatura_boleto_registrar(:'f_itau', '00000000-0000-0000-0000-000000000e41', '{}'::jsonb);
\echo '--- P7b insert direto na tabela de boletos (deve falhar)'
insert into fin_fatura_boletos (org_id, cliente_id, fatura_id, banco, cobranca_link_id, tipo, valor, vencimento)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', :'f_itau', 'itau', gen_random_uuid(), 'boleto', 1, '2031-05-20');
reset role;

\echo '=== P8 o servidor registra (Itaú e Santander): fatura com boleto gerado, Portal publica a do Itaú; Santander ganha o envio do boleto'
select fatura_boleto_registrar(:'f_itau', '00000000-0000-0000-0000-000000000e41', jsonb_build_object('cobranca_link_id', '9e000000-0000-4000-8000-000000000001',
  'tipo', 'boleto_hibrido', 'banco', 'itau', 'valor', 1200, 'vencimento', '2031-05-20', 'linha_digitavel', '34191.79001 01043.510047 91020.150008 1 00000000120000',
  'pix_copia_cola', '00020126…', 'nosso_numero', '123', 'tentativa', 1))->>'fatura_situacao' as itau_situacao;
select fatura_boleto_registrar(:'f_sant', '00000000-0000-0000-0000-000000000e41', jsonb_build_object('cobranca_link_id', '9e000000-0000-4000-8000-000000000002',
  'tipo', 'boleto', 'banco', 'santander', 'valor', 900, 'vencimento', '2031-05-25', 'tentativa', 1)) is not null as santander_ok;
select r.descricao, f.boleto_situacao, e.etapa, e.conteudo, e.situacao from fin_faturas f join fin_recorrentes r on r.id = f.recorrente_id
  join fin_envios e on e.fatura_id = f.id where f.id in (:'f_itau', :'f_sant') order by 1, 3;
\echo '--- P9 gerar outro boleto para a mesma fatura (deve falhar)'
set role authenticated;
select fatura_boleto_preparar(:'f_itau');
reset role;

\echo '=== P10 aviso "paga" com R$ 5 de juros: baixa automática; repetido não aplica; outro aviso de pago não dobra (esperado: baixada, repetido, ja_baixada, 1 baixa)'
select link_aplicar_evento('5a000000-0000-4000-8000-000000000001', 'cobranca.paga',
  '{"cobranca_id":"9e000000-0000-4000-8000-000000000001","valor_pago":1205,"pago_em":"2031-05-19T14:00:00-03:00"}'::jsonb) as primeiro;
select link_aplicar_evento('5a000000-0000-4000-8000-000000000001', 'cobranca.paga',
  '{"cobranca_id":"9e000000-0000-4000-8000-000000000001","valor_pago":1205}'::jsonb) as mesmo_aviso;
select link_aplicar_evento('5a000000-0000-4000-8000-000000000002', 'cobranca.paga',
  '{"cobranca_id":"9e000000-0000-4000-8000-000000000001","valor_pago":1205}'::jsonb) as outro_aviso;
select t.situacao, t.valor_pago, (select count(*) from fin_baixas b where b.titulo_id = t.id) as baixas,
       (select b.juros from fin_baixas b where b.titulo_id = t.id) as juros, (select b.forma from fin_baixas b where b.titulo_id = t.id) as forma,
       (select b.conta_id = '00000000-0000-0000-0000-00000000b401' from fin_baixas b where b.titulo_id = t.id) as conta_itau,
       (select situacao from fin_fatura_boletos where fatura_id = :'f_itau') as boleto
  from fin_titulos t where t.id = (select titulo_id from fin_faturas where id = :'f_itau');

\echo '=== P11 pago a menos não baixa sozinho; boleto recusado libera outro (tentativa 2) (esperado: pagamento_parcial, 0 baixas; a_definir; 2 e FAT-<id>-2)'
select link_aplicar_evento('5a000000-0000-4000-8000-000000000003', 'cobranca.paga',
  '{"cobranca_id":"9e000000-0000-4000-8000-000000000002","valor_pago":100}'::jsonb) as parcial;
select (select count(*) from fin_baixas where titulo_id = (select titulo_id from fin_faturas where id = :'f_sant')) as baixas_0;
select link_aplicar_evento('5a000000-0000-4000-8000-000000000004', 'cobranca.cancelada',
  '{"cobranca_id":"9e000000-0000-4000-8000-000000000002"}'::jsonb) as cancelado_parcial_nao_muda;
-- outro boleto do Santander é recusado pelo banco: para provar a liberação, registra e recusa um boleto na fatura de junho
set teste.hoje = '2031-06-02';
select app.fin_recorrentes_rotina() is not null as rodou;
select id as f_sant6 from fin_faturas where recorrente_id = :'k_sant' and competencia = '2031-06-01' \gset
select fatura_boleto_registrar(:'f_sant6', null, jsonb_build_object('cobranca_link_id', '9e000000-0000-4000-8000-000000000006',
  'tipo', 'boleto', 'banco', 'santander', 'valor', 900, 'vencimento', '2031-06-25', 'tentativa', 1)) is not null as registrou;
select link_aplicar_evento('5a000000-0000-4000-8000-000000000005', 'cobranca.rejeitada',
  '{"cobranca_id":"9e000000-0000-4000-8000-000000000006"}'::jsonb) as rejeitada;
select boleto_situacao from fin_faturas where id = :'f_sant6';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select p->>'tentativa' as tentativa, p->>'ref_externa' = 'FAT-' || :'f_sant6' || '-2' as ref_nova from (select fatura_boleto_preparar(:'f_sant6') as p) x;
\echo '--- P11b cancelar a fatura de junho com o boleto (tentativa 2) registrado no banco (deve falhar)'
reset role;
select fatura_boleto_registrar(:'f_sant6', null, jsonb_build_object('cobranca_link_id', '9e000000-0000-4000-8000-000000000007',
  'tipo', 'boleto', 'banco', 'santander', 'valor', 900, 'vencimento', '2031-06-25', 'tentativa', 2)) is not null as registrou_2
\gset
set role authenticated;
select fin_fatura_cancelar(:'f_sant6', 'Cliente desistiu do mês');
\echo '--- P12 apagar um boleto (deve falhar)'
reset role;
delete from fin_fatura_boletos where fatura_id = :'f_sant6';
\echo '--- P13 mudar a cobrança de um boleto (deve falhar)'
update fin_fatura_boletos set cobranca_link_id = gen_random_uuid() where fatura_id = :'f_itau';
\echo '=== P14 aviso de cobrança que não existe (esperado: cobranca_desconhecida)'
select link_aplicar_evento('5a000000-0000-4000-8000-000000000009', 'cobranca.paga', '{"cobranca_id":"9e000000-0000-4000-8000-0000000000ff","valor_pago":1}'::jsonb);
