-- 007b · importar_clientes ignora CNPJ já ligado a outro código do Domínio
create or replace function public.importar_clientes(p_org uuid, p_linhas jsonb, p_atualizar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_id uuid;
  v_doc text;
  v_cod text;
  v_ins int := 0; v_upd int := 0; v_ign int := 0; v_inat int := 0;
  v_erros jsonb := '[]'::jsonb;
  v_regime text;
  v_ativo boolean;
  v_inativo date;
begin
  if not app.eh_gestor(p_org) then
    raise exception 'Apenas gestores e administradores podem importar clientes';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 then
    raise exception 'Envie de 1 a 5000 linhas por vez';
  end if;

  for l in select * from jsonb_array_elements(p_linhas) loop
    begin
      if coalesce(trim(l ->> 'razao_social'), '') = '' then
        v_ign := v_ign + 1; continue;
      end if;
      v_doc := app.so_digitos(l ->> 'cnpj');
      v_cod := nullif(trim(l ->> 'codigo_dominio'), '');
      v_regime := nullif(l ->> 'regime', '');
      if v_regime is not null and v_regime not in ('simples','presumido','real','mei','imune_isenta','pf','outro') then
        v_regime := 'outro';
      end if;
      v_ativo := (l ->> 'ativo')::boolean;
      v_inativo := nullif(l ->> 'inativo_em', '')::date;
      if v_ativo = false and v_inativo is null then v_inativo := current_date; end if;
      if v_ativo is distinct from false then v_inativo := null; end if;

      v_id := null;
      if v_cod is not null then
        select id into v_id from clientes where org_id = p_org and codigo_dominio = v_cod;
      end if;
      if v_id is null and v_doc is not null then
        select id into v_id from clientes where org_id = p_org and app.so_digitos(cnpj) = v_doc
          order by (codigo_dominio is null) desc limit 1;
        -- mesmo CNPJ já ligado a outro código do Domínio: código duplicado no Domínio, não sobrescreve
        if v_id is not null and v_cod is not null and exists (
             select 1 from clientes where id = v_id and codigo_dominio is not null and codigo_dominio <> v_cod) then
          v_ign := v_ign + 1; continue;
        end if;
      end if;

      if v_id is null then
        insert into clientes (org_id, razao_social, nome_fantasia, cnpj, regime, codigo_dominio, cidade, uf,
                              inicio_em, cliente_desde, situacao_dominio, ativo, inativo_em, motivo_inativacao, importado_em)
        values (p_org, trim(l ->> 'razao_social'), nullif(trim(l ->> 'nome_fantasia'), ''), nullif(trim(l ->> 'cnpj'), ''),
                v_regime, v_cod, nullif(trim(l ->> 'cidade'), ''), nullif(upper(trim(l ->> 'uf')), ''),
                nullif(l ->> 'inicio_em', '')::date, nullif(l ->> 'cliente_desde', '')::date,
                nullif(trim(l ->> 'situacao_dominio'), ''),
                coalesce(v_ativo, true), v_inativo, nullif(trim(l ->> 'motivo_inativacao'), ''), now())
        returning id into v_id;
        v_ins := v_ins + 1;
      elsif p_atualizar then
        update clientes set
          razao_social     = trim(l ->> 'razao_social'),
          nome_fantasia    = coalesce(nullif(trim(l ->> 'nome_fantasia'), ''), nome_fantasia),
          cnpj             = coalesce(nullif(trim(l ->> 'cnpj'), ''), cnpj),
          regime           = coalesce(v_regime, regime),
          codigo_dominio   = coalesce(v_cod, codigo_dominio),
          cidade           = coalesce(nullif(trim(l ->> 'cidade'), ''), cidade),
          uf               = coalesce(nullif(upper(trim(l ->> 'uf')), ''), uf),
          inicio_em        = coalesce(nullif(l ->> 'inicio_em', '')::date, inicio_em),
          cliente_desde    = coalesce(nullif(l ->> 'cliente_desde', '')::date, cliente_desde),
          situacao_dominio = coalesce(nullif(trim(l ->> 'situacao_dominio'), ''), situacao_dominio),
          ativo            = coalesce(v_ativo, ativo),
          inativo_em       = case when v_ativo is null then inativo_em else v_inativo end,
          motivo_inativacao = case when v_ativo = false then coalesce(nullif(trim(l ->> 'motivo_inativacao'), ''), motivo_inativacao)
                                   when v_ativo = true then null else motivo_inativacao end,
          importado_em     = now()
        where id = v_id;
        v_upd := v_upd + 1;
      else
        v_ign := v_ign + 1; continue;
      end if;
      if v_ativo = false then
        v_inat := v_inat + 1;
        perform app.aplicar_inativacao(v_id);
      end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('razao_social', l ->> 'razao_social', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('inseridos', v_ins, 'atualizados', v_upd, 'ignorados', v_ign, 'inativos', v_inat, 'erros', v_erros);
end $$;
revoke all on function public.importar_clientes(uuid, jsonb, boolean) from public, anon;
grant execute on function public.importar_clientes(uuid, jsonb, boolean) to authenticated;
