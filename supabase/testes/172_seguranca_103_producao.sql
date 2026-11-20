-- Testes da 103 (SEG-04 a SEG-07). Rodam NA PRODUÇÃO numa transação que termina em erro de propósito: o resultado
-- sai na mensagem do erro e nada fica gravado. Ensaio antes de aplicar: o texto da 103 + este arquivo na mesma chamada.
-- Usuário: Edvaldo (admin da MDC). Licença ativa do Ledgra; conta e chave de teste criadas aqui e desfeitas no fim.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------------------------------- SEG-04
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a103', 'authenticated', 'authenticated',
        'teste.103@exemplo.com', '$2a$10$provisoriaprovisoriaprovisoriaprovisoriaprovisori',
        '{"provider":"email","trocar_senha":true}', now(), now());
set local role service_role;
select public.hub_senha_provisoria_marcar('00000000-0000-0000-0000-00000000a103');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a103","role":"authenticated"}', true);
-- T1 avisar a troca sem trocar a senha — esperado: Crie a sua senha nova…
do $$ begin perform public.hub_senha_trocada(); insert into _r values ('t1_sem_trocar', 'TIROU A MARCA');
  exception when others then insert into _r values ('t1_sem_trocar', sqlerrm); end $$;
-- T2 logado não marca senha provisória — esperado: permission denied
do $$ begin perform public.hub_senha_provisoria_marcar('00000000-0000-0000-0000-00000000a103'); insert into _r values ('t2_marcar_logado', 'MARCOU');
  exception when others then insert into _r values ('t2_marcar_logado', sqlerrm); end $$;
reset role;
update auth.users set encrypted_password = '$2a$10$novanovanovanovanovanovanovanovanovanovanovanovanova'
 where id = '00000000-0000-0000-0000-00000000a103';
set local role authenticated;
-- T3 depois de trocar — esperado: ok e a marca sai
do $$ begin perform public.hub_senha_trocada(); insert into _r values ('t3_trocou', 'ok');
  exception when others then insert into _r values ('t3_trocou', sqlerrm); end $$;
reset role;
insert into _r select 't3_marca_saiu', (not (raw_app_meta_data ? 'trocar_senha'))::text from auth.users where id = '00000000-0000-0000-0000-00000000a103';

-- ---------------------------------------------------------------------------------------------------- SEG-05
-- T4 IP: o do proxy confiável, nunca o 1º do x-forwarded-for — esperado: 9.9.9.9 | 8.8.8.8 | 7.7.7.7
insert into _r select 't4_ip_cf', app.ip_da_requisicao('{"cf-connecting-ip":"9.9.9.9","x-forwarded-for":"1.1.1.1, 9.9.9.9"}');
insert into _r select 't4_ip_real', app.ip_da_requisicao('{"x-real-ip":"8.8.8.8","x-forwarded-for":"1.1.1.1"}');
insert into _r select 't4_ip_ultimo', app.ip_da_requisicao('{"x-forwarded-for":"1.1.1.1, 7.7.7.7"}');
-- T5 link aberto de contrato assinado: CPF mascarado, sem IP nem navegador — esperado: ***.***.***-NN | f | f
update lic_contrato_documentos set link_hash = encode(extensions.digest(repeat('ab', 24), 'sha256'), 'hex')
 where id = (select id from lic_contrato_documentos where assinatura->>'tipo' = 'eletronico' limit 1);
set local role anon;
insert into _r select 't5_cpf', coalesce(public.lic_assinatura_abrir(repeat('ab', 24))->'assinatura'->>'cpf', '(sem contrato assinado pelo link)');
insert into _r select 't5_tem_ip', coalesce((public.lic_assinatura_abrir(repeat('ab', 24))->'assinatura') ? 'ip', false)::text;
insert into _r select 't5_tem_navegador', coalesce((public.lic_assinatura_abrir(repeat('ab', 24))->'assinatura') ? 'navegador', false)::text;
reset role;

-- ---------------------------------------------------------------------------------------------------- SEG-06
update lic_contratos set usuarios_incluidos = 5 where id = '78c2e886-de69-4201-904f-9213de84fdc1';
update lic_ledgra_chaves set revogada_em = now(), revogada_por = '17391d29-62ee-4353-8818-8ee0edcdc0e9', revogada_motivo = 'ensaio 103' where cliente_id = '5d032ea3-9a6d-48a7-b485-92d0663c2469' and sistema = 'ledgra';
insert into lic_ledgra_chaves (org_id, cliente_id, chave_hash, prefixo, sistema)
select k.org_id, k.cliente_id, encode(extensions.digest('TESTE103CHAVE', 'sha256'), 'hex'), 'TESTE', 'ledgra'
  from lic_contratos k where k.id = '78c2e886-de69-4201-904f-9213de84fdc1';
delete from lic_usos where contrato_id = '78c2e886-de69-4201-904f-9213de84fdc1';
set local role anon;
-- T6 dentro do teto (até 25 com 5 incluídos) — esperado: usuarios 12
insert into _r select 't6_dentro', (public.lic_uso_informar('ledgra', 'TESTE103CHAVE', '62.806.952/0001-54', 12))->>'usuarios';
-- T7 chave vazada infla para 5000 — esperado: a cobrança fica no teto (25)
insert into _r select 't7_inflado', (public.lic_uso_informar('ledgra', 'TESTE103CHAVE', '62806952000154', 5000))->>'usuarios';
reset role;
insert into _r select 't7_a_conferir', a_conferir::text || ' ' || usuarios_informados from lic_usos where contrato_id = '78c2e886-de69-4201-904f-9213de84fdc1';
insert into _r select 't7_avisos', count(*)::text from hub_notificacoes where app = 'licencas' and titulo like 'Usuários a conferir:%' and criado_em > now() - interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
-- T8 conferir sem motivo — esperado: Escreva o motivo…
do $$ begin perform public.lic_uso_confirmar('78c2e886-de69-4201-904f-9213de84fdc1', current_date, false, 'x');
  insert into _r values ('t8_sem_motivo', 'CONFERIU'); exception when others then insert into _r values ('t8_sem_motivo', sqlerrm); end $$;
-- T9 manter o teto — esperado: 25 e sai de "a conferir"
insert into _r select 't9_manter', (public.lic_uso_confirmar('78c2e886-de69-4201-904f-9213de84fdc1', current_date, false, 'chave usada em teste'))->>'usuarios';
reset role;
set local role anon;
-- T10 o mesmo número de novo não volta a pedir conferência; um maior volta — esperado: f, depois t
select public.lic_uso_informar('ledgra', 'TESTE103CHAVE', '62806952000154', 5000);
reset role;
insert into _r select 't10_mesmo', a_conferir::text from lic_usos where contrato_id = '78c2e886-de69-4201-904f-9213de84fdc1';
set local role anon;
select public.lic_uso_informar('ledgra', 'TESTE103CHAVE', '62806952000154', 6000);
reset role;
insert into _r select 't10_maior', a_conferir::text from lic_usos where contrato_id = '78c2e886-de69-4201-904f-9213de84fdc1';
set local role authenticated;
-- T11 aceitar — esperado: 6000
insert into _r select 't11_aceitar', (public.lic_uso_confirmar('78c2e886-de69-4201-904f-9213de84fdc1', current_date, true, 'conferido com o cliente'))->>'usuarios';
reset role;
set local role anon;
-- T12 visitante não confere — esperado: permission denied
do $$ begin perform public.lic_uso_confirmar('78c2e886-de69-4201-904f-9213de84fdc1', current_date, true, 'tentativa');
  insert into _r values ('t12_anon', 'CONFERIU'); exception when others then insert into _r values ('t12_anon', sqlerrm); end $$;

-- ---------------------------------------------------------------------------------------------------- SEG-07
-- T13 lead novo cai na MDC; o mesmo e-mail no mesmo dia é ignorado — esperado: 1 | 1 | mdc
select public.crm_receber_lead('{"consentimento":true,"nome":"Teste 103","empresa":"Empresa Teste 103","email":"lead103@exemplo.com","id":"teste-103-a"}');
select public.crm_receber_lead('{"consentimento":true,"nome":"Teste 103","empresa":"Empresa Teste 103","email":"LEAD103@exemplo.com ","id":"teste-103-b"}');
reset role;
insert into _r select 't13_leads', count(*)::text from crm_oportunidades where email ilike 'lead103@exemplo.com%';
insert into _r select 't13_org', string_agg(distinct o.slug, ',') from crm_oportunidades c join organizacoes o on o.id = c.org_id where c.email ilike 'lead103@exemplo.com%';
insert into _r select 't13_outra_org', count(*)::text from crm_oportunidades c join organizacoes o on o.id = c.org_id where c.email ilike 'lead103@%' and o.slug <> 'mdc';

do $$ begin raise exception 'RESULTADO 103: %', (select string_agg(k || '=' || coalesce(v, '(nulo)'), ' ; ' order by k) from _r); end $$;
