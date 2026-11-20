-- CRM: conferência do Raio-X.
-- Aplicada direto em produção em 04/11/2026 como "crm_raiox_conferir" (versão 20261104175411) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

-- Ledgra Raio-X -> HUB: confere se o CNPJ é cliente MDC; se não for, cria ou atualiza o lead no CRM.
-- Chamada só pelo servidor do Ledgra (service_role). Não altera a etapa do funil: o andamento do Raio-X fica em dados_origem.raiox.
create index if not exists crm_op_raiox_recentes on public.crm_oportunidades (org_id, criado_em) where origem = 'raiox';

create or replace function public.crm_raiox_conferir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_cnpj text; v_raiz text; v_cli record; v_op uuid; v_dest uuid;
  v_raiox jsonb;
begin
  v_cnpj := regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g');
  if v_cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ inválido: informe os 14 dígitos.';
  end if;
  v_raiz := left(v_cnpj, 8);
  select id into v_org from organizacoes order by criado_em limit 1;

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

revoke all on function public.crm_raiox_conferir(jsonb) from public, anon, authenticated;
grant execute on function public.crm_raiox_conferir(jsonb) to service_role;
comment on function public.crm_raiox_conferir(jsonb) is 'Ledgra Raio-X: cliente -> só retorna; lead existente -> atualiza dados_origem.raiox; senão cria lead origem raiox. Só service_role.';
