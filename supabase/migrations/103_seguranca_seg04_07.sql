-- =====================================================================================================
-- 103 · Segurança: SEG-04 a SEG-07 da reauditoria de 19/11/2026
-- -----------------------------------------------------------------------------------------------------
-- SEG-04: a marca trocar_senha só sai se a senha mudou de fato. A Função `convite`, ao criar ou redefinir a senha
--         provisória, guarda o resumo (md5) do encrypted_password em app.senha_provisoria por
--         hub_senha_provisoria_marcar (só service_role); hub_senha_trocada recusa enquanto o resumo for o mesmo.
-- SEG-05: assinatura pelo link. O IP de prova passa a ser o do proxy confiável (cf-connecting-ip, depois x-real-ip,
--         depois o ÚLTIMO valor do x-forwarded-for) e a cadeia inteira fica guardada. Quem abre o link recebe a
--         assinatura com o CPF mascarado e sem IP nem navegador (estes ficam só no registro da MDC).
-- SEG-06: uso informado pela chave tem teto (3× os incluídos, no mínimo incluídos + 20). Acima dele o mês fica
--         "a conferir": a cobrança usa no máximo o teto até a MDC confirmar (lic_uso_confirmar, com motivo) e quem
--         cuida de licenças recebe aviso no sino.
-- SEG-07: crm_receber_lead e crm_raiox_conferir acham a MDC pelo slug 'mdc' (não pela organização mais antiga) e
--         o lead do Simulador ganha limite por e-mail/CNPJ (1 por dia; repetido é ignorado sem erro).
-- =====================================================================================================

-- ===================================================================================================== SEG-04
create table if not exists app.senha_provisoria (
  user_id uuid primary key references auth.users (id) on delete cascade,
  resumo text not null,
  criada_em timestamptz not null default now()
);
comment on table app.senha_provisoria is 'Resumo da senha provisória de cada conta com a marca trocar_senha (103, SEG-04).';
revoke all on app.senha_provisoria from public, anon, authenticated;

-- quem já está com a marca hoje: o resumo de agora é o da provisória que ainda vale
insert into app.senha_provisoria (user_id, resumo)
select u.id, md5(coalesce(u.encrypted_password, '')) from auth.users u where u.raw_app_meta_data ? 'trocar_senha'
on conflict (user_id) do update set resumo = excluded.resumo, criada_em = now();

/** A Função convite chama logo depois de criar ou redefinir a senha provisória. */
create or replace function public.hub_senha_provisoria_marcar(p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into app.senha_provisoria (user_id, resumo)
  select u.id, md5(coalesce(u.encrypted_password, '')) from auth.users u
   where u.id = p_user and u.raw_app_meta_data ? 'trocar_senha'
  on conflict (user_id) do update set resumo = excluded.resumo, criada_em = now();
  if not found then raise exception 'Conta sem senha provisória.'; end if;
end $$;
revoke all on function public.hub_senha_provisoria_marcar(uuid) from public, anon, authenticated;
grant execute on function public.hub_senha_provisoria_marcar(uuid) to service_role;

create or replace function public.hub_senha_trocada()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_resumo text; v_atual text; v_marca boolean;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  select u.raw_app_meta_data ? 'trocar_senha', md5(coalesce(u.encrypted_password, ''))
    into v_marca, v_atual from auth.users u where u.id = auth.uid();
  if not coalesce(v_marca, false) then return; end if;
  select s.resumo into v_resumo from app.senha_provisoria s where s.user_id = auth.uid();
  if v_resumo is null then
    raise exception 'Peça ao administrador uma senha provisória nova.';
  end if;
  if v_resumo = v_atual then
    raise exception 'Crie a sua senha nova antes de continuar.';
  end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'trocar_senha'
   where id = auth.uid();
  delete from app.senha_provisoria where user_id = auth.uid();
end $$;
revoke all on function public.hub_senha_trocada() from public, anon;
grant execute on function public.hub_senha_trocada() to authenticated;

-- ===================================================================================================== SEG-05
/** IP de prova: o do proxy confiável; nunca o primeiro valor do x-forwarded-for, que o navegador pode inventar. */
create or replace function app.ip_da_requisicao(p_cab json)
returns text language sql immutable set search_path = '' as $$
  select nullif(trim(coalesce(
    nullif(p_cab->>'cf-connecting-ip', ''),
    nullif(p_cab->>'x-real-ip', ''),
    (select x from unnest(string_to_array(coalesce(p_cab->>'x-forwarded-for', ''), ',')) with ordinality t(x, n)
      order by n desc limit 1))), '')
$$;
revoke all on function app.ip_da_requisicao(json) from public, anon, authenticated;

create or replace function public.lic_assinatura_aceitar(p_token text, p_nome text, p_cpf text, p_concordo boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d lic_contrato_documentos; v_cab json; v_ip text; v_cadeia text; v_ua text;
        v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then raise exception 'Link inválido. Peça um link novo à MDC.'; end if;
  select * into d from lic_contrato_documentos where link_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if d.id is null then raise exception 'Link inválido. Peça um link novo à MDC.'; end if;
  if d.situacao = 'assinado' then raise exception 'Este contrato já foi assinado.'; end if;
  if d.situacao <> 'enviado' then raise exception 'Este contrato não está mais esperando assinatura.'; end if;
  if d.link_expira_em < now() then raise exception 'O link venceu. Peça um link novo à MDC.'; end if;
  if d.link_tentativas >= 10 then raise exception 'Muitas tentativas com CPF errado. Peça um link novo à MDC.'; end if;
  if not coalesce(p_concordo, false) then raise exception 'Marque "Li e concordo" para assinar.'; end if;
  if array_length(regexp_split_to_array(trim(coalesce(p_nome, '')), '\s+'), 1) < 2 then raise exception 'Escreva o seu nome completo.'; end if;
  if v_cpf <> d.signatario->>'cpf' then
    -- devolve o erro em vez de levantar exceção, para a tentativa errada ficar gravada (exceção desfaria o update)
    update lic_contrato_documentos set link_tentativas = link_tentativas + 1 where id = d.id;
    return jsonb_build_object('ok', false, 'erro', 'O CPF não confere com o de quem foi indicado para assinar este contrato.',
                              'restam', greatest(0, 9 - d.link_tentativas));
  end if;
  begin v_cab := current_setting('request.headers', true)::json; exception when others then v_cab := null; end;
  v_ip := left(app.ip_da_requisicao(v_cab), 64);
  v_cadeia := left(nullif(concat_ws(' | ', 'cf=' || (v_cab->>'cf-connecting-ip'), 'real=' || (v_cab->>'x-real-ip'),
                                    'xff=' || (v_cab->>'x-forwarded-for')), ''), 500);
  v_ua := left(nullif(v_cab->>'user-agent', ''), 300);
  update lic_contrato_documentos
     set situacao = 'assinado', assinado_em = now(), link_expira_em = null,
         assinatura = jsonb_strip_nulls(jsonb_build_object('tipo', 'eletronico', 'nome', trim(p_nome), 'cpf', v_cpf,
                                         'ip', v_ip, 'ip_cadeia', v_cadeia, 'navegador', v_ua, 'em', now()))
   where id = d.id;
  perform app.registrar(d.org_id, 'licencas', 'assinatura_contrato', d.id::text, null,
    jsonb_build_object('numero', d.numero, 'tipo', 'eletronico', 'ip', v_ip));
  perform app.lic_avisar_assinatura(d.id);
  return jsonb_build_object('ok', true, 'numero', d.numero);
end $$;
revoke all on function public.lic_assinatura_aceitar(text, text, text, boolean) from public;
grant execute on function public.lic_assinatura_aceitar(text, text, text, boolean) to anon, authenticated;

create or replace function public.lic_assinatura_abrir(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d lic_contrato_documentos; v_cli text; v_ass jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('situacao', 'invalido'); end if;
  select * into d from lic_contrato_documentos where link_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if d.id is null then return jsonb_build_object('situacao', 'invalido'); end if;
  select c.razao_social into v_cli from lic_contratos k join clientes c on c.id = k.cliente_id where k.id = d.contrato_id;
  -- quem recebe o link encaminhado não vê o CPF inteiro, o IP nem o navegador
  v_ass := case when d.assinatura is null then null
                when d.assinatura->>'tipo' = 'eletronico' then jsonb_build_object(
                  'tipo', 'eletronico', 'nome', d.assinatura->>'nome', 'em', d.assinatura->'em',
                  'cpf', '***.***.***-' || right(coalesce(d.assinatura->>'cpf', ''), 2))
                else jsonb_build_object('tipo', d.assinatura->>'tipo', 'data', d.assinatura->'data') end;
  return jsonb_build_object(
    'situacao', case when d.situacao = 'enviado' and d.link_expira_em < now() then 'expirado'
                     when d.situacao = 'enviado' and d.link_tentativas >= 10 then 'travado' else d.situacao end,
    'numero', d.numero, 'cliente', v_cli, 'texto', d.texto, 'hash', d.hash,
    'signatario', d.signatario->>'nome',
    'cpf_final', right(d.signatario->>'cpf', 2),
    'assinado_em', d.assinado_em, 'assinatura', v_ass);
end $$;
revoke all on function public.lic_assinatura_abrir(text) from public;
grant execute on function public.lic_assinatura_abrir(text) to anon, authenticated;

-- ===================================================================================================== SEG-06
alter table public.lic_usos add column if not exists usuarios_informados int;
alter table public.lic_usos add column if not exists a_conferir boolean not null default false;
alter table public.lic_usos add column if not exists conferido_ate int;
alter table public.lic_usos add column if not exists conferido_por uuid;
alter table public.lic_usos add column if not exists conferido_em timestamptz;
alter table public.lic_usos add column if not exists conferido_motivo text;
update public.lic_usos set usuarios_informados = usuarios where usuarios_informados is null;
comment on column public.lic_usos.usuarios is 'Usuários que entram na cobrança: o maior informado no mês, limitado ao teto até a MDC conferir (103).';
comment on column public.lic_usos.usuarios_informados is 'Maior número informado pelo sistema no mês, mesmo acima do teto (103).';
comment on column public.lic_usos.a_conferir is 'Informado acima do que vale para a cobrança: espera a MDC conferir (103).';
comment on column public.lic_usos.conferido_ate is 'Maior número informado já visto pela MDC na conferência (aceito ou não) (103).';

/** Teto do uso informado pela chave antes de ir para "a conferir". Sem limite de usuários = sem teto. */
create or replace function app.lic_uso_teto(p_incluidos int)
returns int language sql immutable set search_path = '' as $$
  select case when p_incluidos is null then 100000 else greatest(p_incluidos * 3, p_incluidos + 20) end
$$;
revoke all on function app.lic_uso_teto(int) from public, anon, authenticated;

create or replace function public.lic_uso_informar(p_sistema text, p_chave text, p_cnpj text, p_usuarios integer)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v lic_ledgra_chaves; v_cli clientes; v_k lic_contratos; v_comp date; u lic_usos; v_teto int; v_antes boolean := false;
        v_dest uuid;
begin
  if p_usuarios is null or p_usuarios < 0 or p_usuarios > 100000 then raise exception 'Número de usuários inválido'; end if;
  v := app.lic_chave_achar(p_sistema, p_chave);
  if v.id is null then raise exception 'Chave inválida'; end if;
  select * into v_cli from clientes where id = v.cliente_id;
  if regexp_replace(coalesce(v_cli.cnpj, ''), '\D', '', 'g') <> regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g') then
    raise exception 'O CNPJ não é o da licença';
  end if;
  select * into v_k from lic_contratos where cliente_id = v.cliente_id and sistema = p_sistema and situacao = 'ativo';
  if v_k.id is null then raise exception 'Não há licença ativa deste sistema'; end if;
  v_comp := date_trunc('month', app.hoje(v.org_id))::date;
  v_teto := app.lic_uso_teto(v_k.usuarios_incluidos);

  insert into lic_usos (org_id, cliente_id, contrato_id, sistema, competencia, usuarios, usuarios_informados)
  values (v.org_id, v.cliente_id, v_k.id, p_sistema, v_comp, 0, 0)
  on conflict (contrato_id, competencia) do nothing;
  select * into u from lic_usos where contrato_id = v_k.id and competencia = v_comp for update;
  v_antes := u.a_conferir;

  update lic_usos l
     set usuarios_informados = greatest(coalesce(l.usuarios_informados, 0), p_usuarios),
         usuarios = greatest(l.usuarios, least(p_usuarios, v_teto)),
         informado_em = now()
   where l.id = u.id returning * into u;
  -- a conferir: o maior informado passa do que vale para a cobrança e do que a MDC já conferiu
  update lic_usos l set a_conferir = l.usuarios_informados > greatest(l.usuarios, coalesce(l.conferido_ate, 0))
   where l.id = u.id returning * into u;

  if u.a_conferir and not v_antes then
    for v_dest in select m.user_id from membros m where m.org_id = v.org_id and m.ativo
                    and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = v.org_id and a.user_id = m.user_id and a.app = 'licencas'))
    loop
      perform app.notificar(v.org_id, v_dest, 'licencas',
        'Usuários a conferir: ' || left(coalesce(v_cli.razao_social, ''), 80),
        u.usuarios_informados || ' usuários informados pelo sistema; a cobrança usa ' || u.usuarios || ' até você conferir.',
        '/licencas/contratos');
    end loop;
  end if;

  return jsonb_build_object('competencia', v_comp, 'usuarios', u.usuarios, 'usuarios_incluidos', v_k.usuarios_incluidos,
    'adicionais', greatest(u.usuarios - coalesce(v_k.usuarios_incluidos, u.usuarios), 0), 'excedente', v_k.excedente);
end $$;
revoke all on function public.lic_uso_informar(text, text, text, int) from public;
grant execute on function public.lic_uso_informar(text, text, text, int) to anon, authenticated;

/** A MDC confere o uso acima do teto: aceita o número informado (entra na cobrança) ou mantém o que estava. */
create or replace function public.lic_uso_confirmar(p_contrato uuid, p_competencia date, p_aceitar boolean, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare u lic_usos;
begin
  if auth.uid() is null then raise exception 'Faça login de novo.'; end if;
  select * into u from lic_usos where contrato_id = p_contrato and competencia = date_trunc('month', p_competencia)::date for update;
  if u.id is null then raise exception 'Uso não encontrado.'; end if;
  if not app.hub_pode(u.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para conferir o uso das licenças.'; end if;
  if not u.a_conferir then raise exception 'Este uso não está a conferir.'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escreva o motivo (pelo menos 5 letras).'; end if;
  update lic_usos
     set usuarios = case when coalesce(p_aceitar, false) then greatest(usuarios, usuarios_informados) else usuarios end,
         conferido_ate = usuarios_informados, a_conferir = false,
         conferido_por = auth.uid(), conferido_em = now(), conferido_motivo = left(trim(p_motivo), 300)
   where id = u.id returning * into u;
  perform app.registrar(u.org_id, 'licencas', 'uso_conferido', u.contrato_id::text, null,
    jsonb_build_object('competencia', u.competencia, 'aceito', coalesce(p_aceitar, false), 'usuarios', u.usuarios,
                       'informados', u.usuarios_informados, 'motivo', u.conferido_motivo));
  return jsonb_build_object('usuarios', u.usuarios);
end $$;
revoke all on function public.lic_uso_confirmar(uuid, date, boolean, text) from public, anon;
grant execute on function public.lic_uso_confirmar(uuid, date, boolean, text) to authenticated;

-- ===================================================================================================== SEG-07
/** Organização da MDC (dona do CRM que recebe os leads do Simulador e do Raio-X). */
create or replace function app.org_mdc()
returns uuid language sql stable security definer set search_path = '' as $$
  select o.id from public.organizacoes o where o.slug = 'mdc'
$$;
revoke all on function app.org_mdc() from public, anon, authenticated;

create or replace function public.crm_receber_lead(p jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_dest uuid; v_email text; v_cnpj text;
begin
  if coalesce((p->>'consentimento')::boolean, false) is not true then return; end if;
  if char_length(coalesce(p->>'nome','')) not between 2 and 120 or char_length(coalesce(p->>'empresa','')) not between 2 and 160 then return; end if;
  v_org := app.org_mdc();
  if v_org is null then raise exception 'Organização da MDC não encontrada.'; end if;
  -- trava curta por organização: a contagem e a gravação não se cruzam entre dois envios ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('crm_receber_lead:' || v_org::text));
  -- um lead por e-mail ou CNPJ a cada 24 horas (SEG-07); o repetido é ignorado sem erro
  v_email := nullif(lower(trim(coalesce(p->>'email', ''))), '');
  v_cnpj := nullif(regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g'), '');
  if exists (select 1 from crm_oportunidades o
              where o.org_id = v_org and o.origem = 'simulador' and o.criado_em > now() - interval '1 day'
                and ((v_email is not null and lower(trim(o.email)) = v_email)
                  or (length(v_cnpj) >= 11 and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = v_cnpj))) then
    return;
  end if;
  if (select count(*) from crm_oportunidades where org_id = v_org and origem = 'simulador' and criado_em > now() - interval '1 minute') >= 20 then
    raise exception 'Muitos envios em pouco tempo. Tente de novo em um minuto.';
  end if;
  insert into crm_oportunidades (org_id, empresa, razao_social, cnpj, contato_nome, email, whatsapp, cidade, uf, atividade,
                                 regime_atual, faturamento, origem, origem_ref, dados_origem)
  values (v_org, left(p->>'empresa', 160), left(p->>'razao_social', 200), left(p->>'cnpj', 18), left(p->>'nome', 120),
          left(p->>'email', 160), left(p->>'whatsapp', 20), left(p->>'cidade', 80), left(p->>'uf', 2), left(p->>'atividade', 20),
          left(p->>'regime_atual', 20), app.numero_campo(p->>'faturamento', 'faturamento'), 'simulador', coalesce(left(p->>'id', 60), gen_random_uuid()::text),
          jsonb_strip_nulls(jsonb_build_object(
            'melhor_regime', p->'melhor_regime', 'economia_estimada', p->'economia_estimada', 'carga_pct_melhor', p->'carga_pct_melhor',
            'folha', p->'folha', 'compras', p->'compras', 'margem', p->'margem', 'pct_b2b', p->'pct_b2b',
            'cnae', p->'cnae', 'cnae_descricao', p->'cnae_descricao', 'porte', p->'porte', 'situacao_cadastral', p->'situacao_cadastral',
            'origem', p->'origem', 'utm', p->'utm', 'criado_em_simulador', p->'created_at')))
  on conflict (org_id, origem, origem_ref) do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  for v_dest in select m.user_id from membros m where m.org_id = v_org and m.ativo
                  and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = v_org and a.user_id = m.user_id and a.app = 'comercial'))
  loop
    perform app.notificar(v_org, v_dest, 'comercial', 'Novo lead: ' || left(p->>'empresa', 80),
                          coalesce(p->>'nome', '') || coalesce(' · ' || (p->>'cidade'), ''), '/comercial/' || v_id);
  end loop;
end $$;

create or replace function public.crm_raiox_conferir(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_org uuid; v_cnpj text; v_raiz text; v_cli record; v_op uuid; v_dest uuid;
  v_raiox jsonb;
begin
  v_cnpj := regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g');
  if v_cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ inválido: informe os 14 dígitos.';
  end if;
  v_raiz := left(v_cnpj, 8);
  v_org := app.org_mdc();
  if v_org is null then raise exception 'Organização da MDC não encontrada.'; end if;

  -- 1) Cliente MDC (mesma raiz de CNPJ = matriz ou filial de cliente)
  select c.id, c.razao_social, c.ativo, regexp_replace(c.cnpj, '\D', '', 'g') = v_cnpj as mesmo_cnpj
    into v_cli
    from clientes c
   where c.org_id = v_org and left(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), 8) = v_raiz
   order by (regexp_replace(c.cnpj, '\D', '', 'g') = v_cnpj) desc, c.ativo desc
   limit 1;
  if found and v_cli.ativo then
    return jsonb_build_object('tipo', 'cliente', 'cliente_id', v_cli.id, 'razao_social', v_cli.razao_social,
                              'mesmo_cnpj', v_cli.mesmo_cnpj);
  end if;

  -- Sem consentimento LGPD não há lead
  if coalesce((p->>'consentimento')::boolean, false) is not true then
    return jsonb_build_object('tipo', 'sem_consentimento', 'ex_cliente_id', v_cli.id);
  end if;

  v_raiox := jsonb_strip_nulls(jsonb_build_object(
    'diagnostico_id', p->'diagnostico_id', 'status', coalesce(p->>'status', 'diagnostico_solicitado'),
    'valor_recuperavel', p->'valor_recuperavel', 'economia_projetada', p->'economia_projetada',
    'regime_recomendado', p->'regime_recomendado', 'atualizado_em', now(), 'ex_cliente_id', v_cli.id));

  perform pg_advisory_xact_lock(hashtext('crm_raiox:' || v_cnpj));

  -- 2) Lead já existente (qualquer origem, não arquivado): só atualiza
  select o.id into v_op
    from crm_oportunidades o
   where o.org_id = v_org and o.arquivado_em is null
     and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = v_cnpj
   order by o.atualizado_em desc nulls last
   limit 1;
  if v_op is not null then
    update crm_oportunidades
       set dados_origem = coalesce(dados_origem, '{}'::jsonb) || jsonb_build_object('raiox', v_raiox),
           atualizado_em = now()
     where id = v_op;
    return jsonb_build_object('tipo', 'lead_existente', 'oportunidade_id', v_op);
  end if;

  -- 3) Lead novo
  if (select count(*) from crm_oportunidades where org_id = v_org and origem = 'raiox' and criado_em > now() - interval '1 minute') >= 20 then
    raise exception 'Muitos cadastros em pouco tempo. Tente de novo em um minuto.';
  end if;
  if char_length(coalesce(p->>'empresa', p->>'razao_social', '')) < 2 then
    raise exception 'Informe o nome da empresa.';
  end if;

  insert into crm_oportunidades (org_id, empresa, razao_social, cnpj, contato_nome, email, whatsapp, cidade, uf,
                                 regime_atual, origem, origem_ref, dados_origem)
  values (v_org, left(coalesce(p->>'empresa', p->>'razao_social'), 160), left(p->>'razao_social', 200),
          v_cnpj, left(p->>'nome', 120), left(p->>'email', 160), left(p->>'whatsapp', 20),
          left(p->>'cidade', 80), left(p->>'uf', 2), left(p->>'regime_atual', 20),
          'raiox', v_cnpj, jsonb_build_object('raiox', v_raiox))
  on conflict (org_id, origem, origem_ref) do update
     set dados_origem = coalesce(crm_oportunidades.dados_origem, '{}'::jsonb) || excluded.dados_origem,
         atualizado_em = now()
  returning id into v_op;

  for v_dest in select m.user_id from membros m where m.org_id = v_org and m.ativo
                  and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = v_org and a.user_id = m.user_id and a.app = 'comercial'))
  loop
    perform app.notificar(v_org, v_dest, 'comercial', 'Novo lead do Raio-X: ' || left(coalesce(p->>'empresa', p->>'razao_social'), 80),
                          coalesce(p->>'nome', '') || coalesce(' · ' || (p->>'cidade'), ''), '/comercial/' || v_op);
  end loop;

  return jsonb_build_object('tipo', 'lead_novo', 'oportunidade_id', v_op);
end $$;
