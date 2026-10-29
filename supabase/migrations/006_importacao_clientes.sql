-- =====================================================================
--  006 · Importação de clientes (planilha / relatório do Domínio)
--  - Campos extras: código no Domínio, cidade, UF, data de início.
--  - RPC importar_clientes: insere ou atualiza em lote (casa por código
--    do Domínio, depois por CNPJ/CPF só dígitos) e devolve o resumo.
-- =====================================================================

alter table public.clientes
  add column if not exists codigo_dominio text,
  add column if not exists cidade text,
  add column if not exists uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  add column if not exists inicio_em date,
  add column if not exists importado_em timestamptz;

create unique index if not exists clientes_org_codigo_dominio_uk
  on public.clientes (org_id, codigo_dominio) where codigo_dominio is not null;

create or replace function app.so_digitos(t text) returns text
language sql immutable set search_path = '' as $$ select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '') $$;

create or replace function public.importar_clientes(p_org uuid, p_linhas jsonb, p_atualizar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_id uuid;
  v_doc text;
  v_cod text;
  v_ins int := 0; v_upd int := 0; v_ign int := 0;
  v_erros jsonb := '[]'::jsonb;
  v_regime text;
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

      v_id := null;
      if v_cod is not null then
        select id into v_id from clientes where org_id = p_org and codigo_dominio = v_cod;
      end if;
      if v_id is null and v_doc is not null then
        select id into v_id from clientes where org_id = p_org and app.so_digitos(cnpj) = v_doc limit 1;
      end if;

      if v_id is null then
        insert into clientes (org_id, razao_social, nome_fantasia, cnpj, regime, codigo_dominio, cidade, uf, inicio_em, ativo, importado_em)
        values (p_org, trim(l ->> 'razao_social'), nullif(trim(l ->> 'nome_fantasia'), ''), nullif(trim(l ->> 'cnpj'), ''),
                v_regime, v_cod, nullif(trim(l ->> 'cidade'), ''), nullif(upper(trim(l ->> 'uf')), ''),
                nullif(l ->> 'inicio_em', '')::date, coalesce((l ->> 'ativo')::boolean, true), now());
        v_ins := v_ins + 1;
      elsif p_atualizar then
        update clientes set
          razao_social   = trim(l ->> 'razao_social'),
          nome_fantasia  = coalesce(nullif(trim(l ->> 'nome_fantasia'), ''), nome_fantasia),
          cnpj           = coalesce(nullif(trim(l ->> 'cnpj'), ''), cnpj),
          regime         = coalesce(v_regime, regime),
          codigo_dominio = coalesce(v_cod, codigo_dominio),
          cidade         = coalesce(nullif(trim(l ->> 'cidade'), ''), cidade),
          uf             = coalesce(nullif(upper(trim(l ->> 'uf')), ''), uf),
          inicio_em      = coalesce(nullif(l ->> 'inicio_em', '')::date, inicio_em),
          ativo          = coalesce((l ->> 'ativo')::boolean, ativo),
          importado_em   = now()
        where id = v_id;
        v_upd := v_upd + 1;
      else
        v_ign := v_ign + 1;
      end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('razao_social', l ->> 'razao_social', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('inseridos', v_ins, 'atualizados', v_upd, 'ignorados', v_ign, 'erros', v_erros);
end $$;
revoke all on function public.importar_clientes(uuid, jsonb, boolean) from public, anon;
grant execute on function public.importar_clientes(uuid, jsonb, boolean) to authenticated;
