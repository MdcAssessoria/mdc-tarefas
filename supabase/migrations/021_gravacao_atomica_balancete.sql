-- =====================================================================================================
--  021 · Gravação do balancete numa transação só (achado M-N6 do parecer de 31/10/2026)
--
--  Antes a tela gravava o cabeçalho, apagava as contas e inseria as novas em pedidos separados: se a internet
--  caísse no meio, o balancete ficava sem parte das contas. Agora tudo vai num pedido só: ou grava inteiro,
--  ou não muda nada.
--
--  portal_gravar_balancete  · importação (um arquivo ou lote): cria ou substitui o rascunho do mês
--  portal_regravar_contas   · reprocessar: troca as contas e o cálculo de um rascunho
--
--  O cálculo (resumo, índices, demonstrações) ainda vem do navegador (decisão 0003 prevê levar para o servidor).
-- =====================================================================================================

/** Insere as contas de um balancete a partir do JSON enviado pela tela. */
create or replace function app.inserir_contas_balancete(p_balancete uuid, p_org uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_qtd integer;
begin
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'O balancete veio sem contas';
  end if;
  insert into portal_balancete_linhas
    (balancete_id, org_id, codigo, classificacao, descricao, nivel, analitica, saldo_anterior, debitos, creditos, saldo_atual, grupo)
  select p_balancete, p_org, l.codigo, l.classificacao, l.descricao, coalesce(l.nivel, 1), coalesce(l.analitica, true),
         coalesce(l.saldo_anterior, 0), coalesce(l.debitos, 0), coalesce(l.creditos, 0), coalesce(l.saldo_atual, 0), l.grupo
    from jsonb_to_recordset(p_linhas) as l(codigo text, classificacao text, descricao text, nivel integer, analitica boolean,
                                           saldo_anterior numeric, debitos numeric, creditos numeric, saldo_atual numeric, grupo text);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;
revoke all on function app.inserir_contas_balancete(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.portal_gravar_balancete(
  p_org uuid, p_cliente uuid, p_competencia date, p_arquivo text, p_analise jsonb, p_linhas jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text;
begin
  if not app.hub_pode(p_org, 'demonstrativos', 'operar') then raise exception 'Sem permissão para importar balancetes'; end if;
  if not exists (select 1 from clientes c where c.id = p_cliente and c.org_id = p_org) then
    raise exception 'Cliente não encontrado nesta organização';
  end if;
  if p_competencia <> date_trunc('month', p_competencia)::date then raise exception 'Competência inválida'; end if;

  -- trava o mês do cliente enquanto grava (duas importações ao mesmo tempo não se misturam)
  perform pg_advisory_xact_lock(hashtext(p_cliente::text || p_competencia::text));
  select id, status into v_id, v_status from portal_balancetes where cliente_id = p_cliente and competencia = p_competencia for update;
  if v_status = 'publicado' then
    raise exception 'Este mês já está publicado para o cliente. Despublique na tela do balancete antes de importar de novo.';
  end if;

  if v_id is null then
    insert into portal_balancetes (org_id, cliente_id, competencia, status, arquivo_nome, importado_por, importado_em,
                                   resumo, indices, alertas, conferencias, demonstracoes, periodo_inicio, periodo_fim)
    values (p_org, p_cliente, p_competencia, 'rascunho', p_arquivo, auth.uid(), now(),
            coalesce(p_analise->'resumo', '{}'), coalesce(p_analise->'indices', '{}'), coalesce(p_analise->'alertas', '[]'),
            coalesce(p_analise->'conferencias', '[]'), p_analise->'demonstracoes',
            (p_analise->>'periodo_inicio')::date, (p_analise->>'periodo_fim')::date)
    returning id into v_id;
  else
    update portal_balancetes
       set arquivo_nome = p_arquivo, importado_por = auth.uid(), importado_em = now(),
           resumo = coalesce(p_analise->'resumo', '{}'), indices = coalesce(p_analise->'indices', '{}'),
           alertas = coalesce(p_analise->'alertas', '[]'), conferencias = coalesce(p_analise->'conferencias', '[]'),
           demonstracoes = p_analise->'demonstracoes',
           periodo_inicio = (p_analise->>'periodo_inicio')::date, periodo_fim = (p_analise->>'periodo_fim')::date
     where id = v_id;
    delete from portal_balancete_linhas where balancete_id = v_id;
  end if;
  perform app.inserir_contas_balancete(v_id, p_org, p_linhas);
  return v_id;
end $$;
revoke all on function public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb) to authenticated;
comment on function public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb) is
  'Importa o balancete do mês (cria ou substitui o rascunho) com cabeçalho, cálculo e contas numa transação só. Mês publicado é recusado.';

create or replace function public.portal_regravar_contas(p_balancete uuid, p_analise jsonb, p_linhas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare b portal_balancetes;
begin
  select * into b from portal_balancetes where id = p_balancete for update;
  if b.id is null then raise exception 'Balancete não encontrado'; end if;
  if not app.hub_pode(b.org_id, 'demonstrativos', 'operar') then raise exception 'Sem permissão para reprocessar balancetes'; end if;
  if b.status = 'publicado' then raise exception 'Despublique o balancete antes de reprocessar.'; end if;
  delete from portal_balancete_linhas where balancete_id = b.id;
  perform app.inserir_contas_balancete(b.id, b.org_id, p_linhas);
  update portal_balancetes
     set resumo = coalesce(p_analise->'resumo', resumo), indices = coalesce(p_analise->'indices', indices),
         alertas = coalesce(p_analise->'alertas', alertas), conferencias = coalesce(p_analise->'conferencias', conferencias),
         demonstracoes = coalesce(p_analise->'demonstracoes', demonstracoes),
         periodo_inicio = coalesce((p_analise->>'periodo_inicio')::date, periodo_inicio),
         periodo_fim = coalesce((p_analise->>'periodo_fim')::date, periodo_fim)
   where id = b.id;
end $$;
revoke all on function public.portal_regravar_contas(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.portal_regravar_contas(uuid, jsonb, jsonb) to authenticated;
comment on function public.portal_regravar_contas(uuid, jsonb, jsonb) is
  'Reprocessar: troca as contas e o cálculo de um balancete em rascunho numa transação só.';
