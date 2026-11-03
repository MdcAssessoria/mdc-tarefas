-- Testes da 042: gestão só da MDC (empresa própria c41), Contratos sem ler a gestão toda, Storage e anexos por
-- módulo, NaN recusado. Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2027-04-02';

\echo '=== G1 a migração achou a empresa da MDC pelo CNPJ (esperado: c41)'
select gestao_cliente_id from organizacoes where id = '00000000-0000-0000-0000-0000000000a1';

\echo '=== G2 administrador: só a MDC aparece na gestão (esperado: outras = 0 e mdc > 0)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select count(*) filter (where cliente_id <> '00000000-0000-0000-0000-000000000c41') as outras,
       count(*) filter (where cliente_id = '00000000-0000-0000-0000-000000000c41') as mdc from fin_titulos;
select count(*) as notas_outras from fis_notas where cliente_id <> '00000000-0000-0000-0000-000000000c41';
select count(*) as estoque_outras from est_movimentos where cliente_id <> '00000000-0000-0000-0000-000000000c41';
select count(*) as plano_outras from fin_plano_contas where cliente_id <> '00000000-0000-0000-0000-000000000c41';

\echo '--- G3 lançar fornecedor em outra empresa (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e44';
set teste.membro = 'analista';
insert into fin_pessoas (org_id, cliente_id, tipo, nome)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'fornecedor', 'Outro');
\echo '=== G4 na MDC pode (esperado: 1 linha)'
insert into fin_pessoas (org_id, cliente_id, tipo, nome)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'fornecedor', 'Papelaria Bragança') returning nome;
reset role;
\echo '--- G5 nem o serviço interno grava gestão de outra empresa (deve falhar)'
update fin_titulos set cliente_id = '00000000-0000-0000-0000-0000000000c1'
 where cliente_id = '00000000-0000-0000-0000-000000000c41' and id = (select id from fin_titulos where cliente_id = '00000000-0000-0000-0000-000000000c41' limit 1);
set role authenticated;
\echo '--- G6 contrato fixo de outra empresa (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","pessoa_nome":"X",
  "descricao":"X","valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d401","inicio":"2027-04-01"}'::jsonb);

\echo '=== S1 só Contratos (ver): lê os cadastros e as contas dos contratos, nada mais (esperado: titulos_avulsos 0, baixas 0, notas 0, estoque 0, plano 0; pessoas e contratos > 0)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select (select count(*) from fin_titulos where recorrente_id is null) as titulos_avulsos,
       (select count(*) from fin_titulos where recorrente_id is not null) as titulos_contratos,
       (select count(*) from fin_baixas) as baixas, (select count(*) from fis_notas) as notas,
       (select count(*) from est_movimentos) as estoque, (select count(*) from fin_plano_contas) as plano,
       (select count(*) from fin_pessoas) as pessoas, (select count(*) from fin_categorias) as categorias;

\echo '=== S3 só Tarefas: não vê o anexo de contrato (esperado: só o do Portal, que Tarefas vê pela regra da 039)'
set teste.uid = '00000000-0000-0000-0000-000000000e45';
select (storage.foldername(name))[2] as pasta from storage.objects where bucket_id = 'hub-arquivos';
\echo '--- S3b gravar na pasta de Contratos (deve falhar)'
insert into storage.objects (bucket_id, name, owner_id)
  values ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/contratos/k1/falso.pdf', '00000000-0000-0000-0000-000000000e45');
\echo '=== S3c gravar na pasta de Tarefas pode (esperado: 1 linha)'
insert into storage.objects (bucket_id, name, owner_id)
  values ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/tarefas/t1/meu.pdf', '00000000-0000-0000-0000-000000000e45') returning name;

\echo '--- S4 registrar o balancete do cliente c1 como anexo visível ao cliente c3 (deve falhar)'
insert into hub_arquivos (org_id, app, nome, caminho, cliente_id, visivel_cliente)
  values ('00000000-0000-0000-0000-0000000000a1', 'tarefas', 'balancete.pdf',
          '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/balancete.pdf', '00000000-0000-0000-0000-0000000000c3', true);
\echo '--- S4b registrar arquivo de Tarefas enviado por outra pessoa (deve falhar)'
reset role;
insert into storage.objects (bucket_id, name, owner_id)
  values ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/tarefas/t1/do-admin.pdf', '00000000-0000-0000-0000-0000000000e1');
set role authenticated;
insert into hub_arquivos (org_id, app, nome, caminho)
  values ('00000000-0000-0000-0000-0000000000a1', 'tarefas', 'do-admin.pdf', '00000000-0000-0000-0000-0000000000a1/tarefas/t1/do-admin.pdf');
\echo '=== S4c o próprio arquivo, na pasta certa: registra e "enviado_por" é quem enviou (esperado: e45)'
insert into hub_arquivos (org_id, app, nome, caminho, enviado_por)
  values ('00000000-0000-0000-0000-0000000000a1', 'tarefas', 'meu.pdf', '00000000-0000-0000-0000-0000000000a1/tarefas/t1/meu.pdf',
          '00000000-0000-0000-0000-0000000000e1') returning enviado_por;
\echo '=== S4d continua sem ver o de contrato nem o do administrador (esperado: portal e tarefas/meu.pdf)'
select (storage.foldername(name))[2] as pasta, name like '%meu.pdf' as meu from storage.objects where bucket_id = 'hub-arquivos' order by 1;
\echo '--- S4e trocar o módulo do anexo depois (deve falhar)'
update hub_arquivos set app = 'contratos' where caminho like '%/tarefas/t1/meu.pdf';

\echo '--- N1 número NaN no campo (deve falhar)'
reset role;
select app.numero_campo('NaN', 'Valor');
\echo '--- N2 conta com valor NaN direto na tabela (deve falhar)'
update fin_titulos set valor = 'NaN' where id = (select id from fin_titulos limit 1);
\echo '--- N3 movimento de estoque infinito (deve falhar)'
update est_movimentos set quantidade = 'Infinity' where id = (select id from est_movimentos limit 1);
\echo '=== N4 número comum continua valendo (esperado: 12.5)'
select app.numero_campo(' 12.5 ', 'Valor');
