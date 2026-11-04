-- Testes da 053: envio automático das faturas por e-mail e WhatsApp (fila com espera, canais, reenvio e teste).
-- Blocos "(deve falhar)" terminam em ERROR; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;

\echo '--- A1 equipe (authenticated) tenta reservar a fila (deve falhar)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
set teste.membro = 'analista';
select fin_envio_reservar(10);
\echo '--- A2 equipe tenta gravar resultado de envio (deve falhar)'
select fin_envio_resultado((select min(id) from fin_envios), '{"ok":true}');
\echo '--- A3 equipe tenta ligar o canal de e-mail (deve falhar)'
select fin_envio_canal_estado('email', true, 'falso');
\echo '--- A4 equipe tenta adivinhar o token do agendador (deve falhar)'
select fin_envio_token_confere(repeat('a', 64));
\echo '--- A5 equipe tenta ler a tabela de canais (deve falhar)'
select * from fin_envio_canais;
\echo '--- A6 anônimo tenta ver a situação dos envios (deve falhar)'
set role anon;
select fin_envio_situacao('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
\echo '=== A7 equipe tenta marcar envio como enviado direto na tabela (esperado: 0 linhas mudadas ou erro)'
update fin_envios set situacao = 'enviado', enviado_em = now() where canal = 'email';
\echo '--- A8 quem só vê Contratos (e42) tenta reenviar (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fin_envio_reenviar((select min(id) from fin_envios where canal = 'email'), 'cliente pediu de novo');
\echo '--- A9 quem opera Contratos (e41) tenta testar o envio (deve falhar: só quem gere)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'email', 'teste@exemplo.com.br');
\echo '--- A10 quem não tem Contratos (e46, Portal) pede a situação (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = '';
select fin_envio_situacao('00000000-0000-0000-0000-0000000000a1');

\echo '=== L1 canais desligados: a fila não entrega nada (esperado: 0)'
reset role;
set role service_role;
select jsonb_array_length(fin_envio_reservar(20)) as reservados_0;
\echo '=== L2 token: errado não confere, o do Vault confere (esperado: f, t)'
reset role;
select decrypted_secret as token from vault.decrypted_secrets where name = 'fatura_enviar_token' \gset
set role service_role;
select fin_envio_token_confere('errado') as errado_f, fin_envio_token_confere(:'token') as certo_t;
\echo '=== L3 liga o e-mail: os 4 e-mails passam de aguardando para pendente; WhatsApp continua aguardando (esperado: 4, pendente 4, whatsapp aguardando 3)'
select fin_envio_canal_estado('email', true, 'Microsoft 365 conferido', 'hub@mdcassessoria.com')->>'envios_mudados' as mudados_4;
select count(*) filter (where canal = 'email' and situacao = 'pendente') as email_pendente_4,
       count(*) filter (where canal = 'whatsapp' and situacao = 'aguardando_configuracao') as whatsapp_aguardando_3
  from fin_envios;
\echo '=== L4 reserva: só os 2 e-mails prontos (boleto gerado), com linha digitável e tomador; NFS-e a emitir fica (esperado: email_pronto_1 e email_pronto_2)'
select x->>'canal' as canal, (select nome from teste_053 where envio = (x->>'envio')::bigint) as escolhido, x->'boleto'->>'linha_digitavel' is not null as tem_linha,
       x->'tomador'->>'nome' is not null as tem_tomador, x->>'tentativa' as tentativa
  from jsonb_array_elements(fin_envio_reservar(20)) x order by 2;
\echo '=== L5 logo em seguida a reserva não entrega de novo os mesmos (esperado: 0)'
select jsonb_array_length(fin_envio_reservar(20)) as reservados_de_novo_0;
\echo '=== L6 sucesso do email_pronto_1: enviado, com id da mensagem, fatura vira enviada (esperado: enviado, enviada)'
select r->>'situacao' as envio, r->>'fatura_situacao' as fatura
  from fin_envio_resultado((select envio from teste_053 where nome = 'email_pronto_1'),
                           '{"ok":true,"mensagem_id":"graph-123"}') r;
select situacao, mensagem_id, enviado_em is not null as tem_data, proxima_tentativa_em is null as sem_proxima
  from fin_envios e where e.id = (select envio from teste_053 where nome = 'email_pronto_1');
\echo '=== L7 três falhas do email_pronto_2: espera cresce e na 3ª avisa no sino (esperado: falhas 3, próxima em ~2 h, avisos > 0)'
select fin_envio_resultado((select envio from teste_053 where nome = 'email_pronto_2'),
                           '{"ok":false,"erro":"Caixa do destinatário cheia."}')->>'falhas' as f1;
select count(*) as avisos_antes_0 from hub_notificacoes where titulo = 'Contratos: fatura não foi enviada';
select fin_envio_resultado((select envio from teste_053 where nome = 'email_pronto_2'),
                           '{"ok":false,"erro":"Caixa do destinatário cheia."}')->>'falhas' as f2;
select fin_envio_resultado((select envio from teste_053 where nome = 'email_pronto_2'),
                           '{"ok":false,"erro":"Caixa do destinatário cheia."}')->>'falhas' as f3;
select e.situacao, e.falhas, e.tentativas, e.proxima_tentativa_em between now() + interval '119 minutes' and now() + interval '121 minutes' as espera_2h,
       (select count(*) from hub_notificacoes where titulo = 'Contratos: fatura não foi enviada') > 0 as avisou
  from fin_envios e where e.id = (select envio from teste_053 where nome = 'email_pronto_2');
\echo '=== L8 erro definitivo para de tentar (esperado: proxima nula, reservar não pega)'
select fin_envio_resultado((select envio from teste_053 where nome = 'email_pronto_2'),
                           '{"ok":false,"erro":"O endereço de e-mail não existe.","definitivo":true}')->>'proxima' is null as parou;
select jsonb_array_length(fin_envio_reservar(20)) as reservados_0;
\echo '=== L9 resultado de envio já enviado é ignorado (esperado: ignorado true, continua enviado)'
select fin_envio_resultado((select envio from teste_053 where nome = 'email_pronto_1'),
                           '{"ok":false,"erro":"atrasado"}')->>'ignorado' as ignorado;
\echo '=== L10 envio novo de e-mail já nasce pendente com o canal ligado (esperado: pendente)'
reset role;
insert into fin_envios (org_id, cliente_id, fatura_id, canal, destino, conteudo, situacao, etapa)
select f.org_id, f.cliente_id, f.id, 'email', 'outro@exemplo.com.br', '{fatura}', 'aguardando_configuracao', 'boleto'
  from fin_faturas f where f.id = (select fatura from teste_053 where nome = 'email_pronto_1') returning situacao;

\echo '=== L11 quem vê Contratos (e42) vê canais, fila e o problema do email_pronto_2 (esperado: email ligado, 1 problema)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e42';
set teste.membro = 'analista';
select s->'canais'->'email'->>'configurado' as email_ligado, s->'fila'->>'email:erro' as erros,
       jsonb_array_length(s->'problemas') as problemas, s->'problemas'->0->>'envio' = (select envio::text from teste_053 where nome = 'email_pronto_2') as e_o_pronto_2
  from fin_envio_situacao('00000000-0000-0000-0000-0000000000a1') s;
\echo '--- L12 quem opera (e41) reenvia com motivo curto (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_envio_reenviar((select envio from teste_053 where nome = 'email_pronto_2'), 'ok');
\echo '=== L13 reenvia com motivo: volta para a fila agora, falhas zeradas (esperado: pendente, 0, reenvios 1)'
select fin_envio_reenviar((select envio from teste_053 where nome = 'email_pronto_2'),
                          'Cliente corrigiu o e-mail')->>'situacao' as situacao;
select e.situacao, e.falhas, e.reenvios, e.proxima_tentativa_em <= now() as ja_pode
  from fin_envios e where e.id = (select envio from teste_053 where nome = 'email_pronto_2');
\echo '--- L14 reenviar o que ainda está na fila (deve falhar)'
select fin_envio_reenviar((select envio from teste_053 where nome = 'email_pronto_2'),
                          'Cliente pediu de novo');
\echo '--- L15 reenviar fatura cancelada (deve falhar)'
reset role;
update fin_envios set situacao = 'erro' where id = (select envio from teste_053 where nome = 'zap_cancelada');
set role authenticated;
select fin_envio_reenviar((select envio from teste_053 where nome = 'zap_cancelada'),
                          'Cliente pediu de novo');
\echo '=== L16 quem gere (e43) registra teste de e-mail e de WhatsApp (esperado: destino normalizado)'
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'email', ' Teste@Exemplo.com.br ')->>'destino' as email;
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'whatsapp', '(11) 98888-7777')->>'destino' as whatsapp;
\echo '--- L17 WhatsApp sem DDD (deve falhar)'
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'whatsapp', '98888-7777');
\echo '--- L18 mais três testes passam e o sexto da mesma hora (deve falhar)'
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'email', 'a@exemplo.com.br');
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'email', 'b@exemplo.com.br');
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'email', 'c@exemplo.com.br');
select fin_envio_teste_registrar('00000000-0000-0000-0000-0000000000a1', 'email', 'd@exemplo.com.br');

\echo '=== L19 desliga o e-mail: o que estava pendente volta a aguardar; enviados ficam (esperado: aguardando > 0, enviado 1)'
reset role;
set role service_role;
select fin_envio_canal_estado('email', false, 'Faltam segredos: GRAPH_CLIENT_SECRET')->>'envios_mudados' as voltaram;
select count(*) filter (where situacao = 'aguardando_configuracao') > 0 as aguardando, count(*) filter (where situacao = 'enviado') as enviado_1
  from fin_envios where canal = 'email';
\echo '=== L20 WhatsApp ligado: o com NFS-e emitida e boleto sai; nota a emitir e cancelada não (esperado: só zap_pronto)'
select fin_envio_canal_estado('whatsapp', true, 'Número conferido')->>'configurado' as ligado;
select string_agg((select nome from teste_053 where envio = (x->>'envio')::bigint), ',') as escolhidos from jsonb_array_elements(fin_envio_reservar(20)) x;
\echo '=== L21 agendador registrado a cada 10 minutos (esperado: 1 */10 * * * *)'
reset role;
select count(*) as jobs, max(schedule) as quando from cron.job where jobname = 'fatura-enviar';
\echo '=== L22 auditoria: reenvio, testes, sucesso e falhas registrados (esperado: todos > 0)'
select count(*) filter (where acao = 'envio_reenviar') > 0 as reenvio, count(*) filter (where acao = 'envio_teste') > 0 as teste,
       count(*) filter (where acao = 'envio_enviado') > 0 as enviado, count(*) filter (where acao = 'envio_falhou') > 0 as falhou,
       count(*) filter (where acao = 'envio_canal') > 0 as canal
  from hub_auditoria where app = 'contratos';
