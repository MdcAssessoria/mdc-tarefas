-- Testes da 065: nota fiscal de saída de cada fatura com NFS-e (nasce sozinha, ajustes antes de emitir, lista).
-- Usuários (95_base_041): e41 Contratos operar, e42 só ver, e43 gerir, e44 só Financeiro. "Hoje" = 10/05/2028.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2028-05-10';
\set mdc '00000000-0000-0000-0000-000000000c41'

\echo '=== S1 toda fatura com NFS-e que já existia ganhou a sua nota de saída (esperado: t)'
select not exists (select 1 from fin_faturas f where f.documento = 'nfse' and not exists (select 1 from nfse_notas n where n.fatura_id = f.id)) as todas;
\echo '=== S2 fatura só "fatura" não tem nota de saída (esperado: t)'
select not exists (select 1 from nfse_notas n join fin_faturas f on f.id = n.fatura_id where f.documento <> 'nfse') as nenhuma;

\echo '=== S3 contrato novo com NFS-e: a fatura já nasce com a nota de saída (esperado: t)'
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e461",
  "descricao":"Honorários Saída","valor":"700","dia":25,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"servico_descricao":"Serviços de contabilidade","servico_codigo":"17.19.01",
  "iss_aliquota":"2","boleto_banco":"itau"}'::jsonb)->>'id') as ks \gset
reset role;
select f.id as fs, n.id as ns from fin_faturas f join nfse_notas n on n.fatura_id = f.id where f.recorrente_id = :'ks' \gset
select :'ns' is not null as nasceu;

\echo '=== S4 sem ajuste, a DPS segue o contrato (esperado: 171901, texto da fatura, padrão igual)'
set role authenticated;
select x->'dps'->'servico'->>'cTribNac' as codigo, x->'dps'->'servico'->>'descricao' like '% · Fatura % · Vencimento %' as texto_padrao,
       x->'nota'->'padrao'->>'servico_codigo' as padrao
  from (select nfse_preparar(:'fs') x) y;

\echo '=== S5 quem opera ajusta NBS, texto e tributos: a DPS sai com os ajustes (esperado: 113022100, texto novo, 5.49)'
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'nbs', '1.1302.21.00', 'descricao', 'Honorários de maio/2028 – escrita fiscal',
  'p_tot_trib_sn', '5,49'))->>'nbs' as salvo;
select x->'dps'->'servico'->>'cNBS' as nbs, x->'dps'->'servico'->>'descricao' as texto, x->'dps'->'valores'->>'pTotTribSN' as ptot,
       x->'nota'->>'descricao' is not null as marcada
  from (select nfse_preparar(:'fs') x) y;

\echo '=== S6 a lista mostra a nota ajustada e para emitir (esperado: para_emitir, t, Honorários de maio)'
select x->>'situacao' as situacao, (x->>'ajustada')::boolean as ajustada, x->>'descricao' as texto
  from jsonb_array_elements(nfse_saidas(:'mdc', '2028-05-01', '2028-05-31')) x where x->>'id' = :'ns';

\echo '=== S7 campo vazio volta ao padrão (esperado: t, t)'
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'nbs', '', 'descricao', '  ')) is not null as salvo;
select x->'nota'->>'nbs' is null as sem_ajuste, x->'dps'->'servico'->>'descricao' like '% · Fatura % · Vencimento %' as texto_padrao
  from (select nfse_preparar(:'fs') x) y;

\echo '--- S8 código do serviço com 5 números (deve falhar)'
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'servico_codigo', '17190'));
\echo '--- S9 NBS com 8 números (deve falhar)'
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'nbs', '11302210'));
\echo '--- S10 tributos de 120% (deve falhar)'
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'p_tot_trib_sn', '120'));
\echo '--- S11 quem só vê Contratos ajusta (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'nbs', '113022100'));
\echo '=== S12 quem só vê Contratos lê a lista (esperado: t)'
select jsonb_array_length(nfse_saidas(:'mdc')) > 0 as le;
\echo '--- S13 quem só tem o Financeiro lê a lista (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select nfse_saidas(:'mdc');
\echo '--- S14 usuário do site grava direto na tabela (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
update nfse_notas set nbs = '113022100' where id = :'ns';

\echo '--- S15 nota de fatura cancelada não muda (deve falhar)'
select fin_fatura_cancelar(:'fs', 'teste da nota de saída cancelada') is not null as cancelou;
select nfse_nota_salvar(jsonb_build_object('id', :'ns', 'nbs', '113022100'));
\echo '=== S16 na lista ela aparece como cancelada (esperado: cancelada)'
select x->>'situacao' as situacao from jsonb_array_elements(nfse_saidas(:'mdc')) x where x->>'id' = :'ns';

\echo '--- S17 nota já emitida em produção não muda (deve falhar)'
reset role;
select n.id as ne from nfse_notas n join fin_faturas f on f.id = n.fatura_id where f.nfse_situacao = 'emitida' limit 1 \gset
set role authenticated;
select nfse_nota_salvar(jsonb_build_object('id', :'ne', 'nbs', '113022100'));
\echo '=== S18 na lista a emitida mostra número e chave (esperado: emitida, t, t)'
select x->>'situacao' as situacao, x->>'numero_nfse' is not null as tem_numero, x->>'chave_acesso' is not null as tem_chave
  from jsonb_array_elements(nfse_saidas(:'mdc')) x where x->>'id' = :'ne';

\echo '--- S19 apagar a nota de saída (deve falhar)'
reset role;
delete from nfse_notas where id = :'ns';
