-- Testes da 112 (ficha de abertura). Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Esperado: ok_* = 'ok'; bloqueio_* = mensagem em português do impedimento; t_cliente = cliente nasce com a ficha.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
do $$
declare v_proc uuid; v_socio uuid; v_cli record;
begin
  v_proc := public.soc_abrir_processo('224d1feb-deb6-4fd1-a2c6-a63140d8426e', '0d942101-b390-4da3-a0cc-327d9f5a3b42',
             null, 'TESTE 112 LTDA', null, 'SP', null, null, null, '{}');
  -- legítimo: Simples + software (permitido) + secundário do Anexo VII (só aviso)
  perform public.soc_abertura_salvar(v_proc, jsonb_build_object('regime','simples','natureza','ltda','porte','me',
    'razao_social','EMPRESA TESTE 112 LTDA','nome_fantasia','Teste','cnae_principal','6201501',
    'cnaes_secundarios', jsonb_build_array(jsonb_build_object('codigo','8299799','descricao','Outras')),
    'cep','12900-000','municipio','Bragança Paulista','municipio_ibge','3507605','uf','sp','capital_social',10000,'valor_quota',1));
  insert into _r values ('ok_ficha', 'ok');
  v_socio := public.soc_abertura_socio_salvar(v_proc, null, jsonb_build_object('nome','Sócio Um','documento','111.444.777-35',
    'percentual',60,'administrador',true,'estado_civil','casado','regime_bens','comunhao_parcial'));
  perform public.soc_abertura_socio_salvar(v_proc, null, jsonb_build_object('nome','Sócio Dois','percentual',40));
  insert into _r values ('ok_socios', 'ok');
  begin perform public.soc_abertura_salvar(v_proc, jsonb_build_object('cnaes_secundarios',
          jsonb_build_array(jsonb_build_object('codigo','6810202','descricao','Aluguel'))));
  exception when others then insert into _r values ('bloqueio_anexo_vi', sqlerrm); end;
  begin perform public.soc_abertura_salvar(v_proc, jsonb_build_object('regime','presumido','cnae_principal','6491300'));
  exception when others then insert into _r values ('bloqueio_presumido_factoring', sqlerrm); end;
  begin perform public.soc_abertura_salvar(v_proc, jsonb_build_object('porte','demais'));
  exception when others then insert into _r values ('bloqueio_porte', sqlerrm); end;
  begin perform public.soc_abertura_socio_salvar(v_proc, null, jsonb_build_object('nome','Holding X','tipo','pj','percentual',0));
  exception when others then insert into _r values ('bloqueio_socio_pj', sqlerrm); end;
  begin perform public.soc_abertura_socio_salvar(v_proc, v_socio, jsonb_build_object('nome','Sócio Um','percentual',70));
  exception when others then insert into _r values ('bloqueio_soma_100', sqlerrm); end;
  begin perform public.soc_abertura_salvar(v_proc, jsonb_build_object('cep','123'));
  exception when others then insert into _r values ('bloqueio_cep', sqlerrm); end;
  -- Real aceita o que o Simples recusa
  perform public.soc_abertura_salvar(v_proc, jsonb_build_object('regime','real','cnaes_secundarios',
          jsonb_build_array(jsonb_build_object('codigo','6810202','descricao','Aluguel'))));
  insert into _r values ('ok_real_aceita', 'ok');
  perform public.soc_concluir_processo(v_proc);
  select c.razao_social, c.nome_fantasia, c.regime, c.cidade, c.uf into v_cli
    from public.clientes c join public.soc_processos p on p.cliente_id = c.id where p.id = v_proc;
  insert into _r values ('t_cliente', concat_ws(' | ', v_cli.razao_social, v_cli.nome_fantasia, v_cli.regime, v_cli.cidade, v_cli.uf));
  begin perform public.soc_abertura_salvar(v_proc, jsonb_build_object('nome_fantasia','x'));
  exception when others then insert into _r values ('bloqueio_concluido', sqlerrm); end;
end $$;
reset role;
-- ataque: anon não executa
insert into _r select 'anon_executa', has_function_privilege('anon', 'public.soc_abertura_salvar(uuid,jsonb)', 'execute')::text;
insert into _r select 'restricoes', string_agg(regime || '/' || nivel || '=' || n, ' ') from
  (select regime, nivel, count(*) n from public.cnae_restricoes group by 1, 2 order by 1, 2) x;
select k, v from _r order by k;
