-- =====================================================================================================
--  054 · Comercial: excluir lead de vez (pedido do Edvaldo, 04/11/2026)
--
--  A 036 trocou o "excluir" do CRM por "arquivar" (nada se apaga). Lead de teste, duplicado ou que entrou por engano
--  enchia o funil e os Arquivados. Agora:
--   - crm_excluir(p_ids, p_motivo): apaga de vez as oportunidades escolhidas, com o histórico (atividades) e os
--     rascunhos de contrato delas. Só quem GERE o Comercial; motivo com 5 letras ou mais.
--   - Nunca exclui oportunidade que virou cliente da carteira ou tem contrato assinado (essas se arquivam).
--   - O retrato completo de cada uma (dados, atividades e contratos) fica na auditoria (hub_auditoria), para consulta.
--   - Continua proibido apagar direto pela tabela (sem grant de delete, gatilho nada_se_apaga): só por esta função.
--
--  Testes: supabase/testes/117_base_054.sql e 118_crm_excluir_054.sql.
-- =====================================================================================================

create or replace function public.crm_excluir(p_ids uuid[], p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_motivo text := trim(coalesce(p_motivo, '')); o crm_oportunidades; n int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Escolha ao menos uma oportunidade para excluir'; end if;
  select distinct org_id into v_org from crm_oportunidades where id = any (p_ids) limit 1;
  if v_org is null then raise exception 'Oportunidade não encontrada'; end if;
  if exists (select 1 from crm_oportunidades where id = any (p_ids) and org_id <> v_org) then
    raise exception 'Oportunidades de organizações diferentes';
  end if;
  if not app.hub_pode(v_org, 'comercial', 'gerir') then
    raise exception 'Só quem gere o Comercial pode excluir de vez. Arquive a oportunidade (sai do funil e pode voltar).';
  end if;
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo da exclusão (pelo menos 5 letras)';
  end if;

  for o in select * from crm_oportunidades where id = any (p_ids) order by empresa for update loop
    if o.cliente_id is not null then
      raise exception '% já virou cliente da carteira: arquive em vez de excluir', o.empresa;
    end if;
    if exists (select 1 from crm_contratos c where c.oportunidade_id = o.id and c.status = 'assinado') then
      raise exception '% tem contrato assinado: arquive em vez de excluir', o.empresa;
    end if;
    perform app.registrar(o.org_id, 'comercial', 'excluir_oportunidade', o.id::text,
      jsonb_build_object('oportunidade', to_jsonb(o),
        'atividades', coalesce((select jsonb_agg(to_jsonb(a) order by a.criado_em) from crm_atividades a where a.oportunidade_id = o.id), '[]'),
        'contratos', coalesce((select jsonb_agg(to_jsonb(c)) from crm_contratos c where c.oportunidade_id = o.id), '[]')),
      jsonb_build_object('motivo', v_motivo));
    perform set_config('app.pode_apagar', '1', true);
    delete from crm_oportunidades where id = o.id;
    perform set_config('app.pode_apagar', '', true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.crm_excluir(uuid[], text) from public, anon;
grant execute on function public.crm_excluir(uuid[], text) to authenticated;
comment on function public.crm_excluir(uuid[], text) is
  'Exclui de vez oportunidades do CRM com histórico e rascunhos (Comercial: gerir; motivo; nunca cliente ou contrato assinado; retrato na auditoria) (054).';
