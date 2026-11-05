-- =====================================================================================================
--  056 · Estoque › Itens: item de serviço com o código da Lei Complementar 116 (pedido do Edvaldo, 04/11/2026)
--
--  O cadastro de item só tinha NCM (mercadoria). Serviço agora guarda:
--   - servico_codigo: código de tributação nacional da NFS-e (cTribNac, 6 números = item + subitem da LC 116 +
--     desdobramento; ex.: 171901 = 17.19 Contabilidade, desdobramento 01);
--   - nbs: Nomenclatura Brasileira de Serviços (9 números), opcional;
--   - iss_aliquota: ISS do serviço (%), opcional, de 0 a 5 (teto da LC 116).
--  Produto nunca leva esses campos (o banco limpa). A tela escolhe o subitem numa lista da LC 116.
--  est_salvar_item (033) passa a gravar os três; o resto continua igual.
--
--  Testes: supabase/testes/121_base_056.sql e 122_item_servico_056.sql.
-- =====================================================================================================

alter table public.est_itens
  add column if not exists servico_codigo text,
  add column if not exists nbs text,
  add column if not exists iss_aliquota numeric(5, 2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'est_itens_servico_codigo') then
    alter table public.est_itens add constraint est_itens_servico_codigo check (servico_codigo is null or servico_codigo ~ '^\d{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'est_itens_nbs') then
    alter table public.est_itens add constraint est_itens_nbs check (nbs is null or nbs ~ '^\d{9}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'est_itens_iss') then
    alter table public.est_itens add constraint est_itens_iss check (iss_aliquota is null or (iss_aliquota >= 0 and iss_aliquota <= 5));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'est_itens_fiscal_so_servico') then
    alter table public.est_itens add constraint est_itens_fiscal_so_servico
      check (tipo = 'servico' or (servico_codigo is null and nbs is null and iss_aliquota is null));
  end if;
end $$;
comment on column public.est_itens.servico_codigo is 'Serviço: código de tributação nacional da NFS-e (cTribNac, 6 números: item, subitem da LC 116 e desdobramento) (056).';
comment on column public.est_itens.nbs is 'Serviço: código NBS (9 números), opcional (056).';
comment on column public.est_itens.iss_aliquota is 'Serviço: alíquota do ISS (%), opcional, de 0 a 5 (056).';

create or replace function public.est_salvar_item(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cliente uuid := (p->>'cliente')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_org uuid; v_antes jsonb;
  v_cod text := nullif(regexp_replace(coalesce(p->>'servico_codigo', ''), '\D', '', 'g'), '');
  v_nbs text := nullif(regexp_replace(coalesce(p->>'nbs', ''), '\D', '', 'g'), '');
  v_iss numeric := app.numero_campo(p->>'iss_aliquota', 'ISS');
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para cadastrar itens desta empresa'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Dê um nome ao item'; end if;
  if v_cod is not null and length(v_cod) <> 6 then
    raise exception 'Código do serviço na NFS-e: 6 números (item, subitem da LC 116 e desdobramento; ex.: 17.19.01)';
  end if;
  if v_nbs is not null and length(v_nbs) <> 9 then raise exception 'Código NBS: 9 números (ex.: 1.1302.10.00)'; end if;
  if v_iss is not null and (v_iss < 0 or v_iss > 5) then raise exception 'ISS do serviço: de 0%% a 5%% (teto da LC 116)'; end if;
  if v_id is not null then
    select to_jsonb(i) into v_antes from est_itens i where id = v_id and cliente_id = v_cliente;
    if v_antes is null then raise exception 'Item não encontrado nesta empresa'; end if;
  end if;
  perform set_config('app.fin_interno', '1', true);
  v_id := app.est_item_gravar(v_cliente, p, v_id, false);
  update est_itens
     set servico_codigo = case when tipo = 'servico' then v_cod end,
         nbs = case when tipo = 'servico' then v_nbs end,
         iss_aliquota = case when tipo = 'servico' then round(v_iss, 2) end
   where id = v_id
     and (servico_codigo, nbs, iss_aliquota) is distinct from
         (case when tipo = 'servico' then v_cod end, case when tipo = 'servico' then v_nbs end,
          case when tipo = 'servico' then round(v_iss, 2) end);
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(v_org, 'financeiro', case when v_antes is null then 'item_incluir' else 'item_alterar' end, v_id::text,
    v_antes, (select to_jsonb(i) from est_itens i where id = v_id));
  return v_id;
end $$;
revoke all on function public.est_salvar_item(jsonb) from public, anon;
grant execute on function public.est_salvar_item(jsonb) to authenticated;
comment on function public.est_salvar_item(jsonb) is
  'Cadastra ou altera um item (assistente/cadastro rápido), com grupo novo e saldo inicial na mesma transação; serviço com código da NFS-e, NBS e ISS (033/056).';
