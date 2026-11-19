-- Testes da 088: sistemas, licença por sistema (EXato), usuários incluídos, chave e validação por sistema, uso
-- informado pelo sistema e usuário adicional na mensalidade e na fatura da Gestão.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';

\echo '=== S1 sistemas semeados (esperado: hub, ledgra, exato vendendo; hub-team e acesso-remoto em_breve)'
select slug, prefixo, situacao from lic_sistemas where org_id = '00000000-0000-0000-0000-0000000000a1' order by ordem;
\echo '=== S2 módulos do EXato semeados (esperado: 12) e licenças antigas com sistema preenchido (esperado: 0 sem)'
select count(*) as modulos_exato from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' and sistema = 'exato';
select count(*) as sem_sistema from lic_contratos where sistema is null;

set teste.uid = '00000000-0000-0000-0000-0000000085e1';
set role authenticated;
\echo '--- S3 quem só vê cadastra sistema (deve falhar)'
select lic_sistema_salvar('{"org":"00000000-0000-0000-0000-0000000000a1","slug":"novo","nome":"Novo","prefixo":"NOV","situacao":"vendendo"}');
\echo '--- S4 gravar direto em lic_sistemas (deve falhar)'
update lic_sistemas set situacao = 'vendendo' where slug = 'hub-team';
\echo '--- S5 quem só vê informa uso ou gera chave do EXato (deve falhar)'
select lic_chave_gerar('00000000-0000-0000-0000-0000000000c3', 'exato');

set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '--- S6 licença de sistema ainda não à venda (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'sistema', 'hub-team', 'modalidade', 'full',
  'valor_mensal', 0, 'dia_vencimento', 10, 'inicio', current_date, 'reajuste_indice', 'nenhum'));
\echo '--- S7 licença do EXato com módulo do Ledgra (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'sistema', 'exato',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('exato-rs', 'ledgra-financeiro')),
  'valor_mensal', 0, 'dia_vencimento', 10, 'inicio', current_date, 'reajuste_indice', 'nenhum'));
\echo '=== S8 operar cadastra a licença do EXato com 10 usuários (valor vira o de tabela e o adicional fica zero sem gerir)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'sistema', 'exato',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('exato-rs', 'exato-crm')),
  'valor_mensal', 999, 'valor_usuario_adicional', 50, 'usuarios_incluidos', 10, 'excedente', 'cobrar',
  'dia_vencimento', 10, 'inicio', current_date - 40, 'reajuste_indice', 'nenhum')) is not null as cadastrou;
reset role;
select sistema, usuarios_incluidos, excedente, valor_usuario_adicional, valor_mensal from lic_contratos
 where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato';
set role authenticated;
\echo '--- S9 segunda licença ativa do EXato para o mesmo cliente (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'sistema', 'exato', 'modalidade', 'full',
  'valor_mensal', 0, 'dia_vencimento', 10, 'inicio', current_date, 'reajuste_indice', 'nenhum'));
\echo '=== S10 operar manda o contrato a receber da Gestão: o banco ignora (só gerir liga; esperado: t, sem vínculo t)'
select lic_salvar_contrato((select jsonb_build_object('id', id, 'produtos', (select jsonb_agg(produto_id) from lic_contrato_produtos where contrato_id = k.id),
  'valor_mensal', 0, 'dia_vencimento', 10, 'inicio', inicio, 'reajuste_indice', 'nenhum', 'usuarios_incluidos', 10,
  'recorrente', (select id from fin_recorrentes where tipo = 'receber' and situacao = 'ativo' limit 1))
  from lic_contratos k where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')) is not null as salvou;
select recorrente_id is null as sem_vinculo from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato';

\echo '=== S11 gerir põe o valor por usuário adicional'
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
select lic_salvar_contrato((select jsonb_build_object('id', id, 'produtos', (select jsonb_agg(produto_id) from lic_contrato_produtos where contrato_id = k.id),
  'valor_mensal', 300, 'valor_usuario_adicional', 25, 'dia_vencimento', 10, 'inicio', inicio, 'reajuste_indice', 'nenhum',
  'usuarios_incluidos', 10, 'excedente', 'cobrar')
  from lic_contratos k where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')) is not null as salvou;

\echo '=== S12 chave do EXato começa com EXA; a do Ledgra do mesmo cliente continua separada'
select left(lic_chave_gerar('00000000-0000-0000-0000-0000000000c3', 'exato'), 4) as prefixo;
reset role;
-- chave conhecida para os testes do servidor (gravada como o banco grava: só o hash)
update lic_ledgra_chaves set chave_hash = encode(digest('EXA-TESTE-00000', 'sha256'), 'hex')
 where cliente_id = '00000000-0000-0000-0000-0000000000c3' and sistema = 'exato' and revogada_em is null;

set role anon;
\echo '=== S13 o EXato confere a chave: ativa, módulos sem o prefixo, 10 usuários, cobrar'
select lic_validar('exato', 'EXA-TESTE-00000', '11.222.333/0001-81') - 'verificado_em' - 'cliente' - 'valido_ate' as r;
\echo '=== S14 chave do EXato no Ledgra = inválida; CNPJ de outro = cnpj_diferente'
select lic_validar('ledgra', 'EXA-TESTE-00000', '11222333000181')->>'situacao' as no_ledgra,
       lic_validar('exato', 'EXA-TESTE-00000', '99888777000130')->>'situacao' as outro_cnpj;
\echo '--- S15 informar uso com chave errada (deve falhar)'
select lic_uso_informar('exato', 'EXA-ERRADA', '11222333000181', 12);
\echo '--- S16 informar uso com CNPJ de outro (deve falhar)'
select lic_uso_informar('exato', 'EXA-TESTE-00000', '99888777000130', 12);
\echo '=== S17 informa 12 e depois 8: fica o maior do mês (esperado: 12 usuários, 2 adicionais)'
select lic_uso_informar('exato', 'EXA-TESTE-00000', '11222333000181', 12) - 'competencia' as r1;
select lic_uso_informar('exato', 'EXA-TESTE-00000', '11222333000181', 8) - 'competencia' as r2;
\echo '--- S18 anônimo lê lic_usos ou grava direto (deve falhar ou voltar 0 linhas)'
select count(*) as lidas from lic_usos;
insert into lic_usos (org_id, cliente_id, contrato_id, sistema, competencia, usuarios) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', gen_random_uuid(), 'exato', '2026-01-01', 1);
reset role;

\echo '=== S19 mensalidade do mês seguinte traz os 2 adicionais × R$ 25 (esperado: valor 350, 2 usuários, R$ 50)'
-- o uso informado fica no mês passado e a mensalidade deste mês leva o adicional
update lic_usos set competencia = (date_trunc('month', current_date) - interval '1 month')::date
 where cliente_id = '00000000-0000-0000-0000-0000000000c3';
delete from lic_cobrancas where contrato_id = (select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')
   and competencia = date_trunc('month', current_date)::date;
select app.lic_gerar('00000000-0000-0000-0000-0000000000a1', current_date,
  (select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')) as geradas;
select valor, usuarios_adicionais, valor_adicionais, descricao like 'Licença EXato %+ 2 usuário(s) adicional(is)%' as texto_ok
  from lic_cobrancas where contrato_id = (select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')
   and competencia = date_trunc('month', current_date)::date;

\echo '=== S20 excedente "bloquear" não cobra adicional (esperado: 0)'
update lic_contratos set excedente = 'bloquear' where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato';
select (app.lic_adicional((select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato'),
        (date_trunc('month', current_date) - interval '1 month')::date))->>'quantidade' as qtd;
update lic_contratos set excedente = 'cobrar' where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato';

\echo '=== S21 ligada à Gestão (gerir): a licença para de gerar mensalidade e a fatura do contrato leva o adicional'
-- contrato a receber da empresa da gestão (lido como o banco, antes de entrar como a pessoa)
select r.id as rec from fin_recorrentes r where r.tipo = 'receber' and r.situacao = 'ativo' and app.empresa_gestao(r.cliente_id)
   and r.descricao <> 'Contrato com categoria errada' and r.categoria_id is not null order by r.id limit 1 \gset
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
select lic_salvar_contrato((select jsonb_build_object('id', id, 'produtos', (select jsonb_agg(produto_id) from lic_contrato_produtos where contrato_id = k.id),
  'valor_mensal', 300, 'valor_usuario_adicional', 25, 'dia_vencimento', 10, 'inicio', inicio, 'reajuste_indice', 'nenhum',
  'usuarios_incluidos', 10, 'excedente', 'cobrar',
  'recorrente', :'rec'::uuid)
  from lic_contratos k where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')) is not null as ligou;
reset role;
select (select nome from fin_sistemas where id = r.sistema_id) as sistema_na_gestao
  from fin_recorrentes r join lic_contratos k on k.recorrente_id = r.id where k.cliente_id = '00000000-0000-0000-0000-0000000000c3' and k.situacao = 'ativo' and k.sistema = 'exato';
select app.lic_gerar('00000000-0000-0000-0000-0000000000a1', (date_trunc('month', current_date) + interval '1 month')::date,
  (select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato')) as mensalidades_novas;
-- uso de usuários em 02/2031 e lançamento de 03/2031 do contrato a receber ligado
insert into lic_usos (org_id, cliente_id, contrato_id, sistema, competencia, usuarios)
select org_id, cliente_id, id, 'exato', '2031-02-01', 13 from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c3' and situacao = 'ativo' and sistema = 'exato';
select (app.fin_recorrente_lancar_mes(k.recorrente_id, '2031-03-01') ? 'titulo') as lancou
  from lic_contratos k where k.cliente_id = '00000000-0000-0000-0000-0000000000c3' and k.situacao = 'ativo' and k.sistema = 'exato';
select f.valor - r.valor as acrescimo, f.descricao like '%+ 3 usuário(s) adicional(is) de 02/2031' as texto_ok
  from fin_faturas f join fin_recorrentes r on r.id = f.recorrente_id join lic_contratos k on k.recorrente_id = r.id
 where k.cliente_id = '00000000-0000-0000-0000-0000000000c3' and k.situacao = 'ativo' and k.sistema = 'exato' and f.competencia = '2031-03-01';

\echo '=== S22 o Ledgra continua igual: lic_ledgra_validar chama a nova (chave inválida = invalida)'
select lic_ledgra_validar('LDG-NADA', '11222333000181')->>'situacao' as ledgra;
\echo '=== S23 lic_uso_informar e lic_validar abertas ao anon; vincular só ao servidor (esperado: t, t, f)'
select has_function_privilege('anon', 'public.lic_uso_informar(text,text,text,int)', 'execute') as uso,
       has_function_privilege('anon', 'public.lic_validar(text,text,text)', 'execute') as validar,
       has_function_privilege('anon', 'public.lic_vincular_cnpj(text,text)', 'execute') as vincular;
