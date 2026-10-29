-- =====================================================================
--  007 · Inativação de clientes (saída do escritório)
--  Regra: cliente inativo a partir da data D.
--   - Competências até o mês de D continuam sendo do escritório.
--   - Tarefas abertas de competência posterior a D (ou avulsas com prazo após D)
--     são canceladas e marcadas como "cancelada por inativação".
--   - A geração automática não cria tarefas de competências após D.
--   - Reativar devolve para "a fazer" as tarefas canceladas pela inativação.
-- =====================================================================

alter table public.clientes
  add column if not exists inativo_em date,
  add column if not exists motivo_inativacao text check (motivo_inativacao is null or char_length(motivo_inativacao) <= 300),
  add column if not exists situacao_dominio text,
  add column if not exists cliente_desde date;

alter table public.tarefas
  add column if not exists cancelada_por_inativacao boolean not null default false;

-- clientes já marcados inativos sem data: usa hoje como referência
update public.clientes set inativo_em = coalesce(inativo_em, current_date) where not ativo and inativo_em is null;

create or replace function app.aplicar_inativacao(p_cliente uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c public.clientes; n int;
begin
  select * into c from clientes where id = p_cliente;
  if c.id is null or c.ativo or c.inativo_em is null then return 0; end if;
  update tarefas t set status = 'cancelada', cancelada_por_inativacao = true
   where t.cliente_id = c.id
     and t.status not in ('concluida', 'cancelada')
     and ((t.competencia is not null and t.competencia > date_trunc('month', c.inativo_em)::date)
       or (t.competencia is null and t.prazo is not null and t.prazo > c.inativo_em));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.aplicar_inativacao(uuid) from public, anon, authenticated;

create or replace function public.inativar_cliente(p_cliente uuid, p_data date, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; n int;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.eh_gestor(v_org) then raise exception 'Apenas gestores e administradores podem inativar clientes'; end if;
  if p_data is null then raise exception 'Informe a data em que o cliente passou a ser inativo'; end if;
  update clientes set ativo = false, inativo_em = p_data, motivo_inativacao = nullif(trim(p_motivo), '')
   where id = p_cliente;
  n := app.aplicar_inativacao(p_cliente);
  return jsonb_build_object('tarefas_canceladas', n);
end $$;
grant execute on function public.inativar_cliente(uuid, date, text) to authenticated;

create or replace function public.reativar_cliente(p_cliente uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; n int;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.eh_gestor(v_org) then raise exception 'Apenas gestores e administradores podem reativar clientes'; end if;
  update clientes set ativo = true, inativo_em = null, motivo_inativacao = null where id = p_cliente;
  update tarefas set status = 'a_fazer', cancelada_por_inativacao = false
   where cliente_id = p_cliente and cancelada_por_inativacao and status = 'cancelada';
  get diagnostics n = row_count;
  return jsonb_build_object('tarefas_restauradas', n);
end $$;
grant execute on function public.reativar_cliente(uuid) to authenticated;

-- Geração recorrente: inclui inativos só nas competências até o mês da saída
create or replace function app.gerar_tarefas_recorrentes(p_competencia date default null, p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_comp date;
  v_qtd  int := 0;
  n      int;
  mo     public.modelos_recorrentes;
begin
  for mo in
    select m.* from public.modelos_recorrentes m
    join public.organizacoes o on o.id = m.org_id and o.ativo
    where m.ativo and (p_org is null or m.org_id = p_org)
  loop
    v_comp := date_trunc('month', coalesce(p_competencia,
                (app.hoje(mo.org_id) - interval '1 month')::date))::date;
    if mo.meses is not null and not (extract(month from v_comp)::int = any (mo.meses)) then
      continue;
    end if;

    if mo.por_cliente then
      insert into public.tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id,
                                  criado_por, prioridade, prazo, competencia, modelo_id)
      select mo.org_id,
             mo.titulo || ' — ' || to_char(v_comp, 'MM/YYYY'),
             mo.descricao, c.id, mo.setor_id, cr.user_id, null, mo.prioridade,
             app.vencimento(mo, v_comp), v_comp, mo.id
      from public.clientes c
      left join public.cliente_responsaveis cr on cr.cliente_id = c.id and cr.setor_id = mo.setor_id
      where c.org_id = mo.org_id
        and (c.ativo or (c.inativo_em is not null and v_comp <= date_trunc('month', c.inativo_em)::date))
        and (c.cliente_desde is null or v_comp >= date_trunc('month', c.cliente_desde)::date)
        and (mo.regimes is null or c.regime = any (mo.regimes))
      on conflict do nothing;
    else
      insert into public.tarefas (org_id, titulo, descricao, setor_id, criado_por, prioridade,
                                  prazo, competencia, modelo_id)
      values (mo.org_id, mo.titulo || ' — ' || to_char(v_comp, 'MM/YYYY'), mo.descricao, mo.setor_id,
              null, mo.prioridade, app.vencimento(mo, v_comp), v_comp, mo.id)
      on conflict do nothing;
    end if;
    get diagnostics n = row_count;
    v_qtd := v_qtd + n;
  end loop;
  return v_qtd;
end $$;
revoke execute on function app.gerar_tarefas_recorrentes(date, uuid) from public, authenticated;

-- Importação: aceita situação, data de inativação e "cliente desde"
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
revoke all on function public.inativar_cliente(uuid, date, text), public.reativar_cliente(uuid) from public, anon;
grant execute on function public.inativar_cliente(uuid, date, text), public.reativar_cliente(uuid) to authenticated;
