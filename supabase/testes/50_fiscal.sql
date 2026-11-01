-- Testes da migração 032 (notas fiscais de entrada). Como rodar: docs/07, seção Testes SQL.
-- Dados FICTÍCIOS: empresa 12.345.678/0001-95, fornecedor 11.222.333/0001-81.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
-- base (superusuário)
update clientes set cnpj = '12.345.678/0001-95', uf = 'SP', regime = 'real' where id = '00000000-0000-0000-0000-0000000000c1';
update clientes set cnpj = '99.888.777/0001-30', uf = 'SP' where id = '00000000-0000-0000-0000-0000000000c2';
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','despesa','Compras de mercadorias','00000000-0000-0000-0000-000000000001');
-- o estoque padrão (Depósito) da empresa vem de 30_estoque.sql
grant usage on schema public to service_role;
grant select on all tables in schema public to service_role; -- no Supabase a chave de serviço lê tudo

\echo '--- certificado gravado pelo serviço: parâmetros, controle e vencimento'
set role service_role;
select fis_cert_salvar('00000000-0000-0000-0000-0000000000c1', null, 'UEZY', 'senha-ficticia',
  '{"titular":"EMPRESA DE TESTE LTDA","cnpj":"12345678000195","emissor":"AC Teste","icp_brasil":false,"valido_de":"2026-01-01T00:00:00Z","valido_ate":"2027-01-01T00:00:00Z"}');
reset role;
select (select count(*) from fis_dfe_controle) as controles, (select count(*) from fis_parametros) as parametros,
       (select vence_em from venc_itens where descricao like 'Notas fiscais%' and status = 'ativo') as vence;
select (select pfx from fis_cert_obter('00000000-0000-0000-0000-0000000000c1')) = 'UEZY' as cofre_ok;

set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'operar';
\echo '--- a tela não lê o cofre (deve falhar)'
select * from fis_cert_obter('00000000-0000-0000-0000-0000000000c1');
\echo '--- a tela não grava documento capturado (deve falhar)'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-0000000000c1","nota":{}}');
\echo '--- a tela não grava direto em fis_notas (deve falhar)'
insert into fis_notas (org_id, cliente_id, direcao, modelo, chave, origem) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','entrada','55','35261011222333000181550010000012341123456780','upload');

\echo '--- captura: reserva, conclui com 137 e não reserva de novo antes de 1 hora'
reset role;
set role service_role;
select fonte, ult_nsu, cnpj, uf, ambiente from fis_captura_reservar(5) order by fonte;
select count(*) as reservadas_de_novo from fis_captura_reservar(5);
select fis_captura_concluir('00000000-0000-0000-0000-0000000000c1', 'nfe', '{"ult_nsu":120,"max_nsu":120,"cstat":"137","documentos":3}');
select fis_captura_concluir('00000000-0000-0000-0000-0000000000c1', 'nfe', '{"ult_nsu":100,"cstat":"137"}');
select ult_nsu, documentos_recebidos, proxima_consulta_em > now() + interval '50 minutes' as espera_1h, em_execucao_ate is null as livre
  from fis_dfe_controle where fonte = 'nfe';

\echo '--- evento de cancelamento de OUTRA nota chega antes dela'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-0000000000c1","origem":"dfe","evento":{"chave":"35261011222333000181550010000099991123456781","tpEvento":"110111","protocolo":"135000000000009","registrado_em":"2026-10-21T09:00:05-03:00"}}');
\echo '--- resumo (resNFe) e depois a nota completa (procNFe)'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-0000000000c1","origem":"dfe","nsu":121,
  "nota":{"modelo":"55","chave":"35261011222333000181550010000012341123456780","conteudo":"resumo","numero":"1234","serie":"1",
  "emissao":"2026-10-20T10:15:00-03:00","autorizacao":"2026-10-20T10:16:02-03:00","situacao":"autorizada","tipo_nf":"1",
  "emitente_doc":"11222333000181","emitente_nome":"Fornecedor de Teste","valor_total":635,"itens":[]}}') ? 'nota' as resumo_ok;
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-0000000000c1","origem":"dfe","nsu":122,"caminho":"a1/c1/nfe/2026/10/x.xml",
  "nota":{"modelo":"55","chave":"35261011222333000181550010000012341123456780","conteudo":"completa","numero":"1234","serie":"1",
  "emissao":"2026-10-20T10:15:00-03:00","autorizacao":"2026-10-20T10:16:02-03:00","situacao":"autorizada","tipo_nf":"1",
  "emitente_doc":"11222333000181","emitente_nome":"Fornecedor de Teste","emitente_uf":"SP","destinatario_doc":"12345678000195",
  "valor_total":635,"valor_produtos":600,"icms_valor":91.8,"ipi_valor":25,"pis_valor":8.25,"cofins_valor":38,"cfop_principal":"5102",
  "duplicatas":[{"numero":"001","vencimento":"2026-11-20","valor":317.5},{"numero":"002","vencimento":"2026-12-20","valor":317.5}],
  "itens":[{"numero":1,"codigo":"ABC-1","descricao":"Parafuso cx 100","ncm":"73181500","cfop":"5102","unidade":"CX","quantidade":10,
            "valor_unitario":50,"valor_total":500,"frete":20,"desconto":10,"icms_valor":91.8,"ipi_valor":25,"pis_cst":"01","pis_valor":8.25},
           {"numero":2,"codigo":"XYZ-9","descricao":"Óleo 1L","ncm":"27101932","cfop":"5405","unidade":"UN","quantidade":4,
            "valor_unitario":25,"valor_total":100,"pis_cst":"04"}]}}') ? 'nota' as completa_ok;
select conteudo, direcao, nsu, xml_caminho, (select count(*) from fis_nota_itens) as itens from fis_notas;
\echo '--- nota de outro CNPJ (deve falhar)'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-0000000000c1","origem":"dfe","nota":{"modelo":"55","chave":"35261099999999000191550010000000011123456789","conteudo":"completa","emitente_doc":"99999999000191","destinatario_doc":"88888888000191","itens":[]}}');
\echo '--- a nota cancelada antes de chegar já entra cancelada'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-0000000000c1","origem":"dfe","nota":{"modelo":"55","chave":"35261011222333000181550010000099991123456781","conteudo":"resumo","emitente_doc":"11222333000181","valor_total":10,"itens":[]}}') ? 'nota' as ok;
select situacao from fis_notas where chave = '35261011222333000181550010000099991123456781';

reset role;
set role authenticated;
\echo '--- lançar sem confirmar na SEFAZ (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '1234'), 'tipo_entrada', 'revenda'));

\echo '--- manifestação recusada pela SEFAZ não muda a nota; aceita confirma'
reset role;
set role service_role;
select fis_registrar_evento('00000000-0000-0000-0000-0000000000c1','{"chave":"35261011222333000181550010000012341123456780","tpEvento":"210200","cStat":"573","motivo":"Duplicidade de evento"}', '<x/>', null) > 0 as gravou;
select manifestacao from fis_notas where numero = '1234';
select fis_registrar_evento('00000000-0000-0000-0000-0000000000c1','{"chave":"35261011222333000181550010000012341123456780","tpEvento":"210200","cStat":"135","protocolo":"891260000000123","registrado_em":"2026-11-01T10:05:00-03:00"}', '<procEventoNFe/>', null) > 0 as gravou;
\echo '--- ciência depois da confirmação não volta a situação'
select fis_registrar_evento('00000000-0000-0000-0000-0000000000c1','{"chave":"35261011222333000181550010000012341123456780","tpEvento":"210210","cStat":"135","protocolo":"891260000000124"}', null, null) > 0 as gravou;
select manifestacao, manifestacao_protocolo, (select count(*) from fis_eventos where nota_id = n.id) as eventos from fis_notas n where numero = '1234';

reset role;
set role authenticated;
\echo '--- lançar sem ligar os itens ao estoque (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '1234'), 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-0000000000f1', 'parcelas', '[{"vencimento":"2026-11-20","valor":635}]'::jsonb));
\echo '--- parcelas acima do valor da nota (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '1234'), 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-0000000000f1', 'parcelas', '[{"vencimento":"2026-11-20","valor":700}]'::jsonb,
  'itens', jsonb_build_array(
     jsonb_build_object('id', (select id from fis_nota_itens where numero = 1), 'novo', '{"nome":"Parafuso unidade","unidade":"UN"}'::jsonb, 'fator', 100),
     jsonb_build_object('id', (select id from fis_nota_itens where numero = 2), 'novo', '{"nome":"Óleo 1L"}'::jsonb))));
\echo '--- lança como revenda: 2 contas a pagar, entrada no estoque (10 cx × 100 = 1000 un), fornecedor cadastrado'
select jsonb_array_length(r->'titulos') as titulos, jsonb_array_length(r->'movimentos') as movimentos from (
  select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '1234'), 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-0000000000f1',
  'parcelas', '[{"vencimento":"2026-11-20","valor":317.5},{"vencimento":"2026-12-20","valor":317.5}]'::jsonb,
  'itens', jsonb_build_array(
     jsonb_build_object('id', (select id from fis_nota_itens where numero = 1), 'novo', '{"nome":"Parafuso unidade","unidade":"UN"}'::jsonb, 'fator', 100),
     jsonb_build_object('id', (select id from fis_nota_itens where numero = 2), 'novo', '{"nome":"Óleo 1L"}'::jsonb)))) r) x;
select descricao, documento, valor, vencimento, nota_id is not null as ligado from fin_titulos where nota_id is not null order by vencimento;
select i.nome, m.quantidade, m.custo_unitario, m.origem from est_movimentos m join est_itens i on i.id = m.item_id where m.origem = 'nota_entrada' order by 1;
select nome, documento, tipo from fin_pessoas where documento = '11222333000181';
select codigo_fornecedor, fator from fis_depara_itens order by 1;
\echo '--- lançar de novo (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '1234'), 'tipo_entrada', 'revenda'));

\echo '--- desfazer: cancela as contas e estorna o estoque; relançar usa o de-para lembrado'
select fis_desfazer_lancamento((select id from fis_notas where numero = '1234'), 'tipo errado');
select situacao, count(*) from fin_titulos where nota_id is not null group by 1;
select count(*) filter (where estornado) as estornados from est_movimentos where origem = 'nota_entrada';
select jsonb_array_length(r->'movimentos') as movimentos from (
  select fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '1234'), 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-0000000000f1', 'parcelas', '[{"vencimento":"2026-11-20","valor":635}]'::jsonb)) r) x;
select sum(quantidade) filter (where not estornado) as saldo_parafuso from est_movimentos m join est_itens i on i.id = m.item_id where i.nome = 'Parafuso unidade';
\echo '--- desfazer com conta já paga (deve falhar)'
reset role;
insert into fin_contas_bancarias (id, org_id, cliente_id, nome) values ('00000000-0000-0000-0000-0000000000b9','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Banco teste');
set role authenticated;
select fin_baixar((select id from fin_titulos where nota_id is not null and situacao = 'aberto' limit 1), '2026-11-20', 100, '00000000-0000-0000-0000-0000000000b9') ? 'baixa' as pagou;
select fis_desfazer_lancamento((select id from fis_notas where numero = '1234'), 'teste');

\echo '--- upload: caminho de outra empresa (deve falhar) e nota de outro CNPJ (deve falhar)'
select fis_registrar_upload('{"cliente":"00000000-0000-0000-0000-0000000000c1","caminho":"00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c2/upload/n.xml","nota":{"chave":"35034012112223330001810000000000000526100000000001"}}');
select fis_registrar_upload('{"cliente":"00000000-0000-0000-0000-0000000000c1","caminho":"00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1/upload/n.xml","nota":{"modelo":"nfse","chave":"35034012112223330001810000000000000526100000000001","conteudo":"completa","emitente_doc":"11222333000181","destinatario_doc":"55444333000122","itens":[]}}');
\echo '--- upload de NFS-e tomada e lançamento como serviço (sem manifestação, sem estoque)'
select fis_registrar_upload('{"cliente":"00000000-0000-0000-0000-0000000000c1","caminho":"00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1/upload/nfse-52.xml",
  "nota":{"modelo":"nfse","chave":"35034012112223330001810000000000000526100000000001","conteudo":"completa","numero":"52","emissao":"2026-10-15T13:59:00-03:00",
  "emitente_doc":"11222333000181","emitente_nome":"Consultoria de Teste","destinatario_doc":"12345678000195","valor_total":2000,"iss_valor":40,"retencoes":143,
  "itens":[{"numero":1,"descricao":"Assessoria em gestão","quantidade":1,"valor_total":2000}]}}') ? 'nota' as enviou;
\echo '--- mesma nota de novo (deve falhar)'
select fis_registrar_upload('{"cliente":"00000000-0000-0000-0000-0000000000c1","caminho":"00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1/upload/nfse-52b.xml",
  "nota":{"modelo":"nfse","chave":"35034012112223330001810000000000000526100000000001","conteudo":"completa","emitente_doc":"11222333000181","destinatario_doc":"12345678000195","itens":[]}}');
select jsonb_array_length(fis_processar_nota(jsonb_build_object('nota', (select id from fis_notas where numero = '52'), 'tipo_entrada', 'servico',
  'categoria', '00000000-0000-0000-0000-0000000000f1', 'parcelas', '[{"vencimento":"2026-11-10","valor":1857}]'::jsonb))->'titulos') as titulos;

\echo '--- Storage: envio só na pasta upload da empresa'
insert into storage.objects (bucket_id, name) values ('fiscal', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1/upload/2026/11/a.xml');
\echo '--- Storage: fora da pasta upload (deve falhar)'
insert into storage.objects (bucket_id, name) values ('fiscal', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1/nfe/2026/11/a.xml');

\echo '--- tipo de entrada da empresa só com gerir (deve falhar com operar)'
select fis_salvar_tipo_entrada('{"cliente":"00000000-0000-0000-0000-0000000000c1","codigo":"revenda","categoria":"00000000-0000-0000-0000-0000000000f1"}');
set teste.papel = 'gerir';
select fis_salvar_tipo_entrada('{"cliente":"00000000-0000-0000-0000-0000000000c1","codigo":"remessa","gera_pagar":true,"categoria":"00000000-0000-0000-0000-0000000000f1"}') is not null as ok;
reset role;
select * from app.fis_tipo_efetivo('00000000-0000-0000-0000-0000000000c1', 'remessa');
select * from app.fis_tipo_efetivo('00000000-0000-0000-0000-0000000000c2', 'remessa');
set role authenticated;

\echo '--- acesso: cliente no Portal vê as notas; quem não tem acesso não vê nada'
set teste.papel = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select count(*) as notas_portal, (select count(*) from fis_regras_credito) > 0 as ve_regras from fis_notas;
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select count(*) as notas_sem_acesso, (select count(*) from fis_certificados) as certificados from fis_notas;
\echo '--- sem acesso não lança (deve falhar)'
select fis_desfazer_lancamento((select id from fis_notas limit 1), 'x');
reset role;
select count(*) as regras, count(*) filter (where vigencia_fim is not null) as encerradas from fis_regras_credito;
select jobname, schedule from cron.job where jobname = 'fiscal-captura';
