-- Testes da 092: integração entre sistemas sem a chave de serviço do HUB (auditoria 19/11/2026, SEG-01).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== I1 o banco gerou o código do Ledgra (64 letras hexadecimais) (esperado: t)'
select exists (select 1 from vault.secrets where name = 'integracao_token_ledgra' and secret ~ '^[0-9a-f]{64}$') as gerado;
select secret as tk from vault.secrets where name = 'integracao_token_ledgra' \gset

set role service_role;
\echo '=== I2 a Função confere: certo = t, errado = f, vazio = f, outro sistema com o mesmo código = f, nome estranho = f'
select integracao_token_confere('ledgra', :'tk') as certo, integracao_token_confere('ledgra', repeat('0', 64)) as errado,
       integracao_token_confere('ledgra', null) as vazio, integracao_token_confere('exato', :'tk') as outro,
       integracao_token_confere('ledgra'' or 1=1', :'tk') as estranho;
\echo '=== I3 busca por nome: só ativos da MDC com CNPJ (esperado: ALFA; depois 0, 0, 0 para inativa, sem CNPJ e outra org)'
select razao_social, cnpj from integracao_clientes_buscar('092 industria');
select (select count(*) from integracao_clientes_buscar('gama 092')) as inativa,
       (select count(*) from integracao_clientes_buscar('delta 092')) as sem_cnpj,
       (select count(*) from integracao_clientes_buscar('eps 092')) as outra_org;
\echo '=== I4 busca por parte do CNPJ formatado (esperado: ALFA, cnpj só números 55666777000192, desde 2024-01-01)'
select razao_social, cnpj, cliente_desde from integracao_clientes_buscar('666.777');
\echo '=== I5 busca pelo código do Domínio, só números (esperado: BETA) e curta demais (esperado: 0 linhas)'
select razao_social from integracao_clientes_buscar('9202');
select count(*) as curta from integracao_clientes_buscar('ab');
\echo '=== I6 curinga do usuário não vira curinga do banco (esperado: 0 linhas para %%% e ___)'
select count(*) as porcento from integracao_clientes_buscar('%%%');
select count(*) as sublinhado from integracao_clientes_buscar('___');
\echo '=== I7 registro da chamada (esperado: 1 linha, ok = t)'
select integracao_registrar('ledgra', 'buscar_clientes', true, null);
reset role;
select sistema, acao, ok from app.integracao_chamadas;

set role anon;
\echo '--- I8 visitante sem login confere o código (deve falhar)'
select integracao_token_confere('ledgra', :'tk');
\echo '--- I9 visitante sem login busca clientes (deve falhar)'
select * from integracao_clientes_buscar('092');
reset role;
set role authenticated;
\echo '--- I10 usuário com login busca clientes (deve falhar)'
select * from integracao_clientes_buscar('092');
\echo '--- I11 usuário com login grava no registro (deve falhar)'
select integracao_registrar('ledgra', 'x', true, null);
\echo '--- I12 usuário com login lê o registro (deve falhar)'
select * from app.integracao_chamadas;
reset role;
set role service_role;
\echo '--- I13 a Função troca o código (deve falhar: só o SQL Editor troca)'
select integracao_token_girar('ledgra');
reset role;
\echo '=== I14 o SQL Editor troca o código: o antigo deixa de valer (esperado: t, f, t)'
select integracao_token_girar('ledgra') as trocou;
select integracao_token_confere('ledgra', :'tk') as antigo_vale,
       exists (select 1 from vault.secrets where name = 'integracao_token_ledgra' and secret <> :'tk' and secret ~ '^[0-9a-f]{64}$') as novo;
