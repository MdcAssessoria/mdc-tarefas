-- Testes da migração 031 (licenças e cobrança). Rodam depois de 20_titulos e 30_estoque (mesma base).
-- Cada bloco "(deve falhar)" precisa terminar em ERROR com a mensagem em português; os demais, sem erro.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
-- equipe: e1 administrador, e3 analista com a ferramenta Licenças (recebem o aviso diário)
insert into membros values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Edvaldo', 'admin', true),
                           ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3', 'Analista', 'analista', true),
                           ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e4', 'Sem licenças', 'analista', true);
insert into hub_acessos values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3', 'licencas', 'operar');

\echo '--- 7 módulos e o plano Gestão completa semeados ao criar a organização'
select slug, preco from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' order by ordem;
select nome, (select count(*) from lic_plano_produtos pp where pp.plano_id = p.id) as modulos from lic_planos p;

set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = '';
\echo '--- sem a ferramenta: não vê nada'
select count(*) as contratos_visiveis from lic_contratos;
set teste.papel = 'ver';
\echo '--- só ver: cadastrar módulo (deve falhar)'
select lic_salvar_produto('{"org":"00000000-0000-0000-0000-0000000000a1","slug":"crm","nome":"CRM","preco":50}'::jsonb);
set teste.papel = 'gerir';
\echo '--- preço do Financeiro'
select lic_salvar_produto(jsonb_build_object('id', (select id from lic_produtos where slug = 'financeiro'), 'nome', 'Financeiro', 'preco', 120)) is not null as ok;
\echo '--- código inválido (deve falhar)'
select lic_salvar_produto('{"org":"00000000-0000-0000-0000-0000000000a1","slug":"CRM X","nome":"CRM"}'::jsonb);
\echo '--- plano sem módulo (deve falhar)'
select lic_salvar_plano('{"org":"00000000-0000-0000-0000-0000000000a1","nome":"Vazio","preco":10,"produtos":[]}'::jsonb);

\echo '--- contrato do cliente 2: plano Gestão completa, vence dia 31, proporcional, começou dia 16 do mês passado'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c2',
  'plano', (select id from lic_planos where nome = 'Gestão completa'), 'valor_mensal', 300, 'dia_vencimento', 31,
  'inicio', (date_trunc('month', current_date) - interval '1 month' + interval '15 days')::date,
  'proporcional', true, 'reajuste_indice', 'IPCA', 'reajuste_mes', 1)) is not null as ok;
select count(*) as modulos_do_contrato from lic_contrato_produtos cp join lic_contratos k on k.id = cp.contrato_id
 where k.cliente_id = '00000000-0000-0000-0000-0000000000c2';
\echo '--- ao salvar, já gerou a mensalidade deste mês (cheia; vencimento no último dia do mês)'
select valor, vencimento = (date_trunc('month', current_date) + interval '1 month - 1 day')::date as venc_ultimo_dia
  from lic_cobrancas where cliente_id = '00000000-0000-0000-0000-0000000000c2';
\echo '--- mesmo módulo em outro contrato ativo do cliente (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c2',
  'produtos', jsonb_build_array((select id from lic_produtos where slug = 'financeiro')), 'valor_mensal', 50, 'dia_vencimento', 10,
  'inicio', current_date, 'reajuste_indice', 'nenhum'));
\echo '--- reajuste sem mês (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1',
  'produtos', jsonb_build_array((select id from lic_produtos where slug = 'relatorios')), 'valor_mensal', 50, 'dia_vencimento', 10,
  'inicio', current_date, 'reajuste_indice', 'IPCA'));

set teste.papel = 'operar';
\echo '--- operar: contrato novo (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c2',
  'produtos', jsonb_build_array((select id from lic_produtos where slug = 'relatorios')), 'valor_mensal', 50, 'dia_vencimento', 10,
  'inicio', current_date, 'reajuste_indice', 'nenhum'));
\echo '--- gerar mensalidades deste mês: só a do cliente 1 é nova; repetir não duplica'
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', current_date) as geradas_1a;
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', current_date) as geradas_2a;
\echo '--- mês passado (cliente 2 proporcional desde o dia 16) e meses atrasados do cliente 1'
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', (current_date - interval '1 month')::date) as geradas_mes_passado;
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', (current_date - interval '2 months')::date) as geradas_2_meses;
select valor = round(300.0 * (extract(day from (date_trunc('month', current_date) - interval '1 day')) - 15)
                     / extract(day from (date_trunc('month', current_date) - interval '1 day')), 2) as proporcional_certo
  from lic_cobrancas where cliente_id = '00000000-0000-0000-0000-0000000000c2' and competencia = (date_trunc('month', current_date) - interval '1 month')::date;
select count(*) as total_mensalidades, count(distinct (contrato_id, competencia)) as sem_repetir from lic_cobrancas;
\echo '--- gerar 3 meses à frente (deve falhar)'
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', (current_date + interval '3 months')::date);

\echo '--- baixa da mensalidade do mês passado do cliente 2 com juros 5 e desconto 1'
select (lic_baixar_cobranca((select id from lic_cobrancas where cliente_id = '00000000-0000-0000-0000-0000000000c2'
   and competencia = (date_trunc('month', current_date) - interval '1 month')::date), current_date, 'Pix', 5, 1))->>'total' is not null as ok;
select situacao, valor_pago = valor + 4 as total_certo from lic_cobrancas
 where cliente_id = '00000000-0000-0000-0000-0000000000c2' and competencia = (date_trunc('month', current_date) - interval '1 month')::date;
\echo '--- baixa de novo (deve falhar)'
select lic_baixar_cobranca((select id from lic_cobrancas where situacao = 'paga' limit 1), current_date);
\echo '--- baixa com data no futuro (deve falhar)'
select lic_baixar_cobranca((select id from lic_cobrancas where situacao = 'aberta' limit 1), current_date + 1);
\echo '--- desfazer baixa sem motivo (deve falhar)'
select lic_desfazer_baixa((select id from lic_cobrancas where situacao = 'paga' limit 1), ' ');
\echo '--- desfazer baixa com motivo: reabre e guarda a baixa marcada'
select lic_desfazer_baixa((select id from lic_cobrancas where situacao = 'paga' limit 1), 'Pix era de outro cliente');
select count(*) filter (where situacao = 'paga') as pagas from lic_cobrancas;
select count(*) as baixas, count(*) filter (where estornada) as desfeitas from lic_baixas;
\echo '--- cancelar a mensalidade deste mês do cliente 1 (cortesia) e gerar de novo: não volta'
select lic_cancelar_cobranca((select id from lic_cobrancas where cliente_id = '00000000-0000-0000-0000-0000000000c1'
   and competencia = date_trunc('month', current_date)::date), 'Cortesia de implantação');
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', current_date) as geradas_depois_de_cancelar;
\echo '--- cancelar de novo (deve falhar)'
select lic_cancelar_cobranca((select id from lic_cobrancas where situacao = 'cancelada' limit 1), 'x');

\echo '--- inadimplência: mensalidades em aberto e vencidas por cliente'
select cliente_id = '00000000-0000-0000-0000-0000000000c1' as cliente1, count(*) as vencidas, max(current_date - vencimento) > 0 as em_atraso
  from lic_cobrancas where situacao = 'aberta' and vencimento < current_date group by cliente_id order by 1 desc;

\echo '--- operar: bloquear (deve falhar)'
select lic_bloquear('00000000-0000-0000-0000-0000000000c1', 'Inadimplência');
set teste.papel = 'gerir';
\echo '--- bloquear sem motivo (deve falhar)'
select lic_bloquear('00000000-0000-0000-0000-0000000000c1', '');
\echo '--- bloquear o cliente 1 por inadimplência'
select lic_bloquear('00000000-0000-0000-0000-0000000000c1', 'Inadimplência: 3 meses') is not null as ok;
\echo '--- bloquear de novo (deve falhar)'
select lic_bloquear('00000000-0000-0000-0000-0000000000c1', 'de novo');

\echo '--- Portal bloqueado: não vê nem lança no Financeiro; situação mostra bloqueado sem o motivo'
set teste.papel = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'ver') as portal_pode_ver;
select count(*) as titulos_portal, (select count(*) from fin_contas_bancarias) as contas_portal from fin_titulos;
select portal_licenca_situacao('00000000-0000-0000-0000-0000000000c1') as situacao_portal;
\echo '--- portal lança bloqueado (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"Luz","vencimento":"2026-03-10","valor":80}'::jsonb);
\echo '--- portal vê a situação de empresa que não é dele (deve falhar)'
select portal_licenca_situacao('00000000-0000-0000-0000-0000000000c2');
\echo '--- equipe MDC continua acessando o Financeiro do cliente bloqueado'
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'ver';
select count(*) > 0 as equipe_ve from fin_titulos where cliente_id = '00000000-0000-0000-0000-0000000000c1';
set teste.papel = 'gerir';
\echo '--- desbloquear sem motivo (deve falhar)'
select lic_desbloquear('00000000-0000-0000-0000-0000000000c1', null);
\echo '--- desbloquear: Portal volta a ver'
select lic_desbloquear('00000000-0000-0000-0000-0000000000c1', 'Pagou as três mensalidades');
set teste.papel = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'operar') as portal_pode_lancar, count(*) > 0 as titulos_portal from fin_titulos;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'gerir';
select motivo, motivo_desbloqueio, desbloqueado_em is not null as fechado from lic_bloqueios;

\echo '--- reajuste de 4,5% no contrato do cliente 2 (300 → 313,50) e histórico'
select lic_reajustar_contrato((select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c2'), 4.5, 'IPCA 12 meses') as novo_valor;
select indice, percentual, valor_antes, valor_depois from lic_reajustes;
\echo '--- reajuste absurdo (deve falhar)'
select lic_reajustar_contrato((select id from lic_contratos where cliente_id = '00000000-0000-0000-0000-0000000000c2'), 500);

\echo '--- encerrar o contrato do cliente 1 hoje: cancela a mensalidade do mês que vem e o Portal perde o Financeiro'
select lic_gerar_cobrancas('00000000-0000-0000-0000-0000000000a1', (current_date + interval '1 month')::date) as geradas_mes_que_vem;
select lic_encerrar_contrato('00000000-0000-0000-0000-00000000c0a1', current_date, 'Cliente saiu do escritório') as canceladas;
\echo '--- editar contrato encerrado (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c0a1', 'valor_mensal', 1, 'dia_vencimento', 1,
  'inicio', current_date, 'reajuste_indice', 'nenhum', 'produtos', jsonb_build_array((select id from lic_produtos where slug = 'financeiro'))));
set teste.papel = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'ver') as portal_depois_de_encerrar;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'gerir';
\echo '--- contrato com prazo que acabou ontem (a rotina diária encerra)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c1',
  'produtos', jsonb_build_array((select id from lic_produtos where slug = 'relatorios')), 'valor_mensal', 40, 'dia_vencimento', 5,
  'inicio', (current_date - interval '2 months')::date, 'fim', current_date - 1, 'reajuste_indice', 'nenhum')) is not null as ok;
\echo '--- nada se apaga nem muda por fora das funções'
delete from lic_cobrancas;
update lic_contratos set valor_mensal = 1;
\echo '--- bloqueio gravado direto (deve falhar)'
insert into lic_bloqueios (org_id, cliente_id, motivo) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 'direto');
\echo '--- nada mudou: as mensalidades continuam e nenhum contrato foi alterado'
select count(*) as mensalidades, (select count(*) from lic_contratos where valor_mensal = 1) as alterados from lic_cobrancas;
reset role;

\echo '--- rotina diária: encerra o contrato vencido, avisa 2 pessoas (admin e quem tem Licenças); 2a vez não repete'
insert into lic_cobrancas (org_id, cliente_id, contrato_id, competencia, vencimento, descricao, valor)
select org_id, cliente_id, id, '2020-01-01', current_date - 1, 'Venceu ontem', 99 from lic_contratos
 where cliente_id = '00000000-0000-0000-0000-0000000000c2' and situacao = 'ativo' and fim is null;
select app.lic_rotina_diaria() as primeira;
select app.lic_rotina_diaria() as segunda;
select count(*) as avisos, count(distinct user_id) as pessoas, min(texto) like '%venceram ontem%' as texto_ok from hub_notificacoes where app = 'licencas';
select situacao, encerrado_motivo from lic_contratos where fim = current_date - 1;
select acao, count(*) from hub_auditoria where app = 'licencas' group by acao order by 1;
