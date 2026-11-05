-- Testes da 057: regra fiscal por tipo de serviço (NBS, ISS, retenção, IBS/CBS) amarrada à nota da fatura.
-- Usuários (95_base_041): e41 Contratos operar, e42 só ver, e43 gerir, e44 só Financeiro. "Hoje" = 10/05/2028.
-- Blocos "(deve falhar)" terminam em ERROR; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2028-05-10';
set role authenticated;
set teste.membro = 'analista';

\echo '--- F1 quem só opera Contratos cria regra (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"17.19.01","nome":"Contabilidade"}'::jsonb);
set teste.uid = '00000000-0000-0000-0000-000000000e43';
\echo '--- F2 regra sem tipo de serviço (deve falhar)'
select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"17.19","nome":"Contabilidade"}'::jsonb);
\echo '--- F3 retém em municípios sem dizer quais (deve falhar)'
select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"17.19.01","nome":"Contabilidade",
  "iss_retencao":"municipios"}'::jsonb);
\echo '--- F4 município sem UF (deve falhar)'
select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"17.19.01","nome":"Contabilidade",
  "iss_retencao":"municipios","iss_retencao_municipios":["Atibaia"]}'::jsonb);
\echo '--- F5 ISS de 7% (deve falhar)'
select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"17.19.01","nome":"Contabilidade","iss_aliquota":"7"}'::jsonb);
\echo '--- F6 gravar a regra direto na tabela (deve falhar)'
insert into fis_regras_servico (org_id, cliente_id, servico_codigo, nome)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '171901', 'Hack');

\echo '=== F7 quem gere cria a regra da contabilidade sem retenção, com NBS próprio e IBS/CBS (esperado: 171901, 113031000, nao, 000001)'
select r->>'servico_codigo' as codigo, r->>'nbs' as nbs, r->>'iss_retencao' as retencao, r->>'cclasstrib' as cclasstrib
  from (select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"17.19.01",
          "nome":"Honorários contábeis","nbs":"1.1303.10.00","iss_aliquota":"2","cclasstrib":"000001","cindop":"020101",
          "descricao_nota":"Serviços de contabilidade"}'::jsonb) r) x;
select id as regra from fis_regras_servico where servico_codigo = '171901' and ativo \gset
\echo '--- F8 segunda regra ativa para o mesmo serviço (deve falhar)'
select fis_regra_servico_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","servico_codigo":"171901","nome":"Outra"}'::jsonb);

\echo '=== F9 contrato de 17.19.01: a nota usa o NBS da regra (não o padrão 113021000) e não acusa retenção (esperado: 113031000, f)'
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e461",
  "descricao":"Honorários Regra","valor":"900","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"servico_descricao":"Serviços de contabilidade","servico_codigo":"17.19.01",
  "iss_aliquota":"2","boleto_banco":"itau"}'::jsonb)->>'id') as kr \gset
reset role;
select id as fr from fin_faturas where recorrente_id = :'kr' \gset
set role authenticated;
select x->'dps'->'servico'->>'cNBS' as nbs, (x->'iss'->>'retido')::boolean as retido, x->'regra'->>'nome' as regra
  from (select nfse_preparar(:'fr') x) y;

\echo '=== F10 regra passa a reter em Atibaia/SP (cidade do cliente, sem acento e caixa): a nota vira pendência (esperado: t, t)'
select fis_regra_servico_salvar(jsonb_build_object('id', :'regra', 'cliente', '00000000-0000-0000-0000-000000000c41',
  'servico_codigo', '171901', 'nome', 'Honorários contábeis', 'nbs', '113031000', 'iss_aliquota', '2',
  'iss_retencao', 'municipios', 'iss_retencao_municipios', jsonb_build_array('ATIBAIA/sp', 'Bragança Paulista/SP'))) is not null as salvo;
select (x->'iss'->>'retido')::boolean as retido,
       exists (select 1 from jsonb_array_elements_text(x->'pendencias') p where p like '%ISS desta nota é retido%') as pendencia_retencao
  from (select nfse_preparar(:'fr') x) y;
reset role;
select iss_retencao_municipios from fis_regras_servico where id = :'regra';
set role authenticated;

\echo '--- F11 inativar sem motivo (deve falhar)'
select fis_regra_servico_salvar(jsonb_build_object('id', :'regra', 'cliente', '00000000-0000-0000-0000-000000000c41',
  'servico_codigo', '171901', 'nome', 'Honorários contábeis', 'ativo', false));
\echo '=== F12 inativada com motivo, a nota volta ao NBS padrão e sem retenção (esperado: f, f)'
select fis_regra_servico_salvar(jsonb_build_object('id', :'regra', 'cliente', '00000000-0000-0000-0000-000000000c41',
  'servico_codigo', '171901', 'nome', 'Honorários contábeis', 'ativo', false, 'motivo', 'trocada pela nova regra')) is not null as inativa;
select (x->'iss'->>'retido')::boolean as retido, x->'regra' is not null and jsonb_typeof(x->'regra') <> 'null' as tem_regra
  from (select nfse_preparar(:'fr') x) y;
\echo '--- F13 apagar a regra (deve falhar)'
reset role;
delete from fis_regras_servico where id = :'regra';
\echo '=== F14 quem só tem o Financeiro lê as regras; auditoria registrou (esperado: t, t)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select count(*) >= 1 as financeiro_le from fis_regras_servico;
reset role;
select count(*) >= 3 as auditado from hub_auditoria where acao like 'regra_fiscal_%';
\echo '=== F15 item de serviço guarda só o tipo (NBS e ISS saíram do item) (esperado: f, f)'
select exists (select 1 from information_schema.columns where table_name = 'est_itens' and column_name = 'nbs') as tem_nbs,
       exists (select 1 from information_schema.columns where table_name = 'est_itens' and column_name = 'iss_aliquota') as tem_iss;
