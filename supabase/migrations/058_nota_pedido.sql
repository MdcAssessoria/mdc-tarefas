-- =====================================================================================================
--  058 · Entradas: nota de entrada e pedido de compra não lançam a mesma compra duas vezes (pedido do Edvaldo, 04/11/2026)
--
--  Antes: receber o pedido de compra gerava estoque e contas a pagar; lançar depois a nota da mesma compra (tipo de
--  entrada que gera conta e estoque) gerava tudo de novo. Agora:
--   1  fis_notas.pedido_id liga a nota ao pedido. app.fis_pedidos_candidatos(nota): pedidos de compra do mesmo
--      fornecedor (CPF/CNPJ do emitente) — aguardando entrega, ou recebidos sem nota que citam o número da nota ou têm o
--      mesmo total — dos 180 dias antes da emissão. public.fis_pedidos_da_nota mostra a lista na tela.
--   2  fis_processar_nota (036): com candidato, escolher é obrigatório (p.pedido = id ou "nenhum"). Ligada ao pedido, a
--      nota NÃO gera estoque nem conta: recebido = só liga; aguardando entrega = lançar a nota recebe o pedido
--      (app.est_pedido_lancar). Total diferente do pedido vira aviso. Sem candidato, nada muda.
--   3  fis_desfazer_lancamento (036) solta a nota do pedido (pedido_id = null).
--   4  Gatilho em est_pedidos: não cancela pedido ligado a nota lançada; não recebe pedido cujo documento cita uma nota
--      do mesmo fornecedor já lançada com contas ou estoque.
--
--  Testes: supabase/testes/125_base_058.sql e 126_nota_pedido_058.sql.
-- =====================================================================================================

alter table public.fis_notas add column if not exists pedido_id uuid references public.est_pedidos(id) on delete restrict;
create index if not exists fis_notas_pedido on public.fis_notas (pedido_id) where pedido_id is not null;
comment on column public.fis_notas.pedido_id is 'Pedido de compra desta nota (058): a nota ligada não gera estoque nem conta; valem os do pedido.';

/** "NF 001.234/1" cita a nota 1234? (primeiro número do documento, sem pontos de milhar e zeros à esquerda). */
create or replace function app.fis_doc_cita_nota(p_doc text, p_numero text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(ltrim(substring(regexp_replace(coalesce(p_doc, ''), '(\d)\.(\d{3})', '\1\2', 'g') from '\d+'), '0'), '')
      = nullif(ltrim(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '0'), ''), false)
$$;
revoke all on function app.fis_doc_cita_nota(text, text) from public, anon, authenticated;

/** Pedidos de compra que podem ser desta nota de entrada (mesmo fornecedor, ainda sem nota lançada). */
create or replace function app.fis_pedidos_candidatos(p_nota uuid)
returns table (id uuid, numero integer, situacao text, total numeric, documento text, data date, cita_nota boolean, mesmo_total boolean)
language sql stable security definer set search_path = public as $$
  select ep.id, ep.numero, ep.situacao, ep.total, ep.documento, ep.data,
         app.fis_doc_cita_nota(ep.documento, n.numero), abs(coalesce(ep.total, 0) - coalesce(n.valor_total, 0)) <= 0.01
    from fis_notas n
    join est_pedidos ep on ep.cliente_id = n.cliente_id and ep.tipo = 'compra' and ep.situacao in ('confirmado', 'recebido')
    join fin_pessoas pe on pe.id = ep.pessoa_id and pe.documento is not null and pe.documento = app.fis_digitos(n.emitente_doc)
   where n.id = p_nota and n.direcao = 'entrada'
     and ep.data >= coalesce((n.emissao at time zone 'America/Sao_Paulo')::date, current_date) - 180
     and not exists (select 1 from fis_notas o where o.pedido_id = ep.id and o.processada and o.id <> n.id)
     and (ep.situacao = 'confirmado' or app.fis_doc_cita_nota(ep.documento, n.numero)
          or abs(coalesce(ep.total, 0) - coalesce(n.valor_total, 0)) <= 0.01)
$$;
revoke all on function app.fis_pedidos_candidatos(uuid) from public, anon, authenticated;

create or replace function public.fis_pedidos_da_nota(p_nota uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n fis_notas;
begin
  select * into n from fis_notas where id = p_nota;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.gestao_pode(n.cliente_id, 'ver', array['entradas', 'financeiro']) then raise exception 'Sem permissão para ver as notas desta empresa'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero, 'situacao', c.situacao, 'total', c.total,
                     'documento', c.documento, 'data', c.data, 'cita_nota', c.cita_nota, 'mesmo_total', c.mesmo_total,
                     'sugerido', c.cita_nota or (c.mesmo_total and c.situacao = 'recebido'))
                     order by c.cita_nota desc, c.mesmo_total desc, c.data desc)
                     from app.fis_pedidos_candidatos(n.id) c), '[]');
end $$;
revoke all on function public.fis_pedidos_da_nota(uuid) from public, anon;
grant execute on function public.fis_pedidos_da_nota(uuid) to authenticated;
comment on function public.fis_pedidos_da_nota(uuid) is
  'Pedidos de compra que podem ser desta nota de entrada (mesmo fornecedor, sem nota lançada), para escolher ao lançar (058).';

-- ===================================================================================================== 2 lançar a nota
create or replace function public.fis_processar_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n fis_notas; regra record; v_tipo text := p->>'tipo_entrada'; v_pessoa uuid := app.uuid_campo(p->>'pessoa', 'fornecedor');
  v_cat uuid := app.uuid_campo(p->>'categoria', 'categoria'); v_local uuid := app.uuid_campo(p->>'local', 'estoque');
  v_data date; v_grupo uuid := gen_random_uuid(); v_movs bigint[] := '{}'; v_titulos uuid[] := '{}'; v_r jsonb;
  it jsonb; ni fis_nota_itens; v_item uuid; e est_itens; v_fator numeric; v_qtd numeric; v_custo numeric;
  v_parc jsonb; k int := 0; v_n int; v_soma numeric := 0; v_doc text; v_desc text; v_fin text;
  v_ped est_pedidos; v_escolha text := nullif(trim(coalesce(p->>'pedido', '')), ''); v_ligar boolean := false; v_aviso text;
  v_lista text;
begin
  select * into n from fis_notas where id = app.uuid_campo(p->>'nota', 'nota') for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.gestao_pode(n.cliente_id, 'operar', array['entradas', 'financeiro']) then raise exception 'Sem permissão para lançar notas desta empresa'; end if;
  if n.direcao <> 'entrada' then raise exception 'Só notas de entrada são lançadas aqui'; end if;
  if n.processada then raise exception 'Esta nota já foi lançada'; end if;
  if n.situacao <> 'autorizada' then raise exception 'Nota cancelada ou denegada não pode ser lançada'; end if;
  if n.conteudo <> 'completa' then raise exception 'Ainda não temos o XML completo desta nota; dê ciência e aguarde a próxima busca, ou envie o XML'; end if;
  if n.modelo = 'outro' then raise exception 'Tipo de documento não aceito para lançamento'; end if;
  if n.modelo = '55' and coalesce(n.manifestacao, '') <> 'confirmada' then
    raise exception 'Confirme a operação na SEFAZ antes de lançar (só nota confirmada gera conta a pagar e estoque)';
  end if;
  select * into regra from app.fis_tipo_efetivo(n.cliente_id, v_tipo);
  if regra.movimenta_estoque is null then raise exception 'Escolha o tipo de entrada'; end if;
  v_data := coalesce(app.data_campo(p->>'data_entrada', 'data de entrada'), (n.emissao at time zone 'America/Sao_Paulo')::date, app.hoje(n.org_id));
  v_doc := app.fis_digitos(n.emitente_doc);

  if v_pessoa is null and v_doc is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = n.cliente_id and documento = v_doc order by ativo desc limit 1;
  end if;
  if v_pessoa is null then
    insert into fin_pessoas (org_id, cliente_id, tipo, nome, documento, uf)
    values (n.org_id, n.cliente_id, case when v_tipo = 'devolucao_venda' then 'cliente' else 'fornecedor' end,
            coalesce(nullif(trim(n.emitente_nome), ''), 'Fornecedor ' || coalesce(v_doc, '')),
            case when length(v_doc) in (11, 14) then v_doc end, case when n.emitente_uf ~ '^[A-Z]{2}$' then n.emitente_uf end)
    returning id into v_pessoa;
  elsif not exists (select 1 from fin_pessoas where id = v_pessoa and cliente_id = n.cliente_id) then
    raise exception 'Fornecedor não encontrado nesta empresa';
  end if;

  -- 058: pedido de compra do mesmo fornecedor (aguardando entrega, ou recebido sem nota): escolher é obrigatório
  select string_agg(format('nº %s (%s)', c.numero, case c.situacao when 'recebido' then 'já recebido' else 'aguardando entrega' end), ', ' order by c.numero)
    into v_lista from app.fis_pedidos_candidatos(n.id) c;
  if v_escolha is null and v_lista is not null then
    raise exception 'Esta nota pode ser do pedido de compra %: escolha o pedido ou marque que a nota não tem pedido (para não lançar a compra duas vezes)', v_lista;
  end if;
  if v_escolha is not null and v_escolha <> 'nenhum' then
    select ep.* into v_ped from est_pedidos ep
     where ep.id = app.uuid_campo(v_escolha, 'pedido de compra') and ep.id in (select c.id from app.fis_pedidos_candidatos(n.id) c)
     for update;
    if v_ped.id is null then raise exception 'Pedido de compra não encontrado entre os pedidos em aberto deste fornecedor'; end if;
    v_ligar := true;
  end if;

  if regra.movimenta_estoque and v_local is null and not v_ligar then
    select id into v_local from est_locais where cliente_id = n.cliente_id and padrao and ativo;
  end if;
  for ni in select * from fis_nota_itens where nota_id = n.id order by numero loop
    select x into it from jsonb_array_elements(coalesce(p->'itens', '[]')) x where (x->>'id') = ni.id::text;
    v_item := app.uuid_campo(it->>'item', 'item do estoque');
    v_fator := coalesce(app.numero_campo(it->>'fator', 'fator'), ni.fator, 1);
    if v_fator <= 0 then raise exception 'Fator de unidade inválido no item %', ni.numero; end if;
    if v_item is null and it ? 'novo' and jsonb_typeof(it->'novo') = 'object' then
      insert into est_itens (org_id, cliente_id, codigo, nome, tipo, unidade, controla_estoque, ncm, custo)
      values (n.org_id, n.cliente_id, nullif(trim(it->'novo'->>'codigo'), ''),
              coalesce(nullif(trim(it->'novo'->>'nome'), ''), ni.descricao), 'produto',
              upper(left(coalesce(nullif(trim(it->'novo'->>'unidade'), ''), ni.unidade, 'UN'), 6)),
              coalesce((it->'novo'->>'controla_estoque')::boolean, regra.movimenta_estoque),
              case when coalesce(it->'novo'->>'ncm', ni.ncm) ~ '^\d{8}$' then coalesce(it->'novo'->>'ncm', ni.ncm) end,
              case when ni.quantidade > 0 then round(ni.valor_total / (ni.quantidade * v_fator), 4) end)
      returning id into v_item;
    end if;
    if v_item is null and ni.codigo is not null and v_doc is not null then
      select item_id, fator into v_item, v_fator from fis_depara_itens
       where cliente_id = n.cliente_id and fornecedor_doc = v_doc and codigo_fornecedor = ni.codigo;
      v_fator := coalesce(app.numero_campo(it->>'fator', 'fator'), v_fator, 1);
    end if;
    if v_item is not null then
      select * into e from est_itens where id = v_item and cliente_id = n.cliente_id;
      if e.id is null then raise exception 'Item do estoque não encontrado nesta empresa (item % da nota)', ni.numero; end if;
      update fis_nota_itens set item_id = v_item, fator = v_fator where id = ni.id;
      if coalesce((it->>'lembrar')::boolean, true) and ni.codigo is not null and length(v_doc) in (11, 14) then
        insert into fis_depara_itens (org_id, cliente_id, fornecedor_doc, codigo_fornecedor, item_id, fator)
        values (n.org_id, n.cliente_id, v_doc, ni.codigo, v_item, v_fator)
        on conflict (cliente_id, fornecedor_doc, codigo_fornecedor) do update set item_id = excluded.item_id, fator = excluded.fator;
      end if;
    end if;
    if regra.movimenta_estoque and not v_ligar then
      if v_item is null then raise exception 'Ligue o item % (%) a um item do estoque ou cadastre um novo', ni.numero, ni.descricao; end if;
      if e.controla_estoque and ni.quantidade > 0 then
        if v_local is null then raise exception 'Escolha o estoque (local) de entrada'; end if;
        v_qtd := round(ni.quantidade * v_fator, 4);
        v_custo := round((ni.valor_total + ni.frete + ni.seguro + ni.outros - ni.desconto + ni.ipi_valor + ni.icms_st_valor) / v_qtd, 4);
        v_movs := v_movs || app.est_gravar(v_item, v_local, v_data, 'entrada', v_qtd, greatest(v_custo, 0), 'nota_entrada', n.id::text,
                                           v_grupo, format('NF %s · %s', n.numero, left(coalesce(n.emitente_nome, ''), 60)));
      end if;
    end if;
    e := null;
  end loop;

  if regra.gera_pagar and not v_ligar then
    v_cat := coalesce(v_cat, regra.categoria_id);
    if v_cat is null then raise exception 'Escolha a categoria (despesa) desta compra'; end if;
    v_n := jsonb_array_length(coalesce(p->'parcelas', '[]'));
    if v_n = 0 then raise exception 'Informe ao menos uma parcela (vencimento e valor)'; end if;
    for v_parc in select * from jsonb_array_elements(p->'parcelas') loop
      v_soma := v_soma + coalesce(app.numero_campo(v_parc->>'valor', 'valor da parcela'), 0);
    end loop;
    if round(v_soma, 2) > n.valor_total + 0.01 then
      raise exception 'A soma das parcelas (%) passa do valor da nota (%)', round(v_soma, 2), n.valor_total;
    end if;
    v_desc := format('NF %s · %s', coalesce(n.numero, ''), left(coalesce(n.emitente_nome, ''), 80));
    for v_parc in select * from jsonb_array_elements(p->'parcelas') loop
      k := k + 1;
      v_r := app.fin_lancar_titulos(jsonb_build_object(
        'cliente', n.cliente_id, 'tipo', 'pagar', 'pessoa', v_pessoa, 'categoria', v_cat, 'centro', nullif(p->>'centro', ''),
        'conta_prevista', nullif(p->>'conta_prevista', ''),
        'descricao', v_desc || case when v_n > 1 then format(' (%s/%s)', k, v_n) else '' end,
        'documento', left(format('NF %s%s', coalesce(n.numero, ''), case when v_n > 1 then '/' || k else '' end), 60),
        'emissao', (n.emissao at time zone 'America/Sao_Paulo')::date, 'vencimento', v_parc->>'vencimento',
        'valor', v_parc->>'valor', 'parcelas', 1, 'observacao', nullif(trim(p->>'observacao'), '')));
      v_titulos := v_titulos || array(select jsonb_array_elements_text(v_r->'titulos')::uuid);
    end loop;
    v_fin := current_setting('app.fin_interno', true);
    perform set_config('app.fin_interno', '1', true);
    update fin_titulos set nota_id = n.id where id = any(v_titulos);
    perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  end if;

  -- 058: ligada ao pedido, as contas e o estoque são os do pedido (aguardando entrega: lançar a nota recebe o pedido)
  if v_ligar then
    if v_ped.situacao = 'confirmado' then
      update est_pedidos set documento = coalesce(nullif(trim(documento), ''), left('NF ' || coalesce(n.numero, ''), 60)) where id = v_ped.id;
      perform app.est_pedido_lancar(v_ped.id, v_data, null);
      update est_pedidos set situacao = 'recebido' where id = v_ped.id;
    end if;
    if abs(coalesce(v_ped.total, 0) - coalesce(n.valor_total, 0)) > 0.01 then
      v_aviso := format('O total da nota (%s) é diferente do total do pedido nº %s (%s): confira as contas a pagar do pedido',
                        app.brl(n.valor_total), v_ped.numero, app.brl(v_ped.total));
    end if;
  end if;

  update fis_notas set processada = true, processada_em = now(), processada_por = auth.uid(), tipo_entrada = v_tipo,
         data_entrada = v_data, pessoa_id = v_pessoa, titulos = v_titulos, pedido_id = case when v_ligar then v_ped.id end,
         estoque_grupo = case when cardinality(v_movs) > 0 then v_grupo end, atualizado_em = now()
   where id = n.id;
  perform app.registrar(n.org_id, 'financeiro', 'notas_lancar', n.id::text, null,
    p || jsonb_build_object('titulos', to_jsonb(v_titulos), 'movimentos', to_jsonb(v_movs), 'pedido_ligado', v_ped.id, 'aviso', v_aviso));
  return jsonb_build_object('titulos', to_jsonb(v_titulos), 'movimentos', to_jsonb(v_movs), 'pessoa', v_pessoa,
                            'pedido', case when v_ligar then jsonb_build_object('id', v_ped.id, 'numero', v_ped.numero) end, 'aviso', v_aviso);
end $$;

-- ===================================================================================================== 3 desfazer
create or replace function public.fis_desfazer_lancamento(p_nota uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare n fis_notas; m record; v_saldo numeric; v_neg boolean; v_fin text := current_setting('app.fin_interno', true); v_motivo text := trim(p_motivo);
begin
  select * into n from fis_notas where id = p_nota for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.gestao_pode(n.cliente_id, 'operar', array['entradas', 'financeiro']) then raise exception 'Sem permissão para desfazer o lançamento desta nota'; end if;
  if not n.processada then raise exception 'Esta nota não está lançada'; end if;
  if coalesce(v_motivo, '') = '' then raise exception 'Informe o motivo'; end if;
  perform 1 from fin_titulos where id = any(n.titulos) order by id for update;
  if exists (select 1 from fin_titulos where id = any(n.titulos) and (valor_pago > 0 or situacao = 'quitado')) then
    raise exception 'Uma conta a pagar desta nota já tem pagamento; estorne o pagamento antes';
  end if;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set situacao = 'cancelado', cancelado_motivo = 'Lançamento da nota desfeito: ' || v_motivo
   where id = any(n.titulos) and situacao = 'aberto';
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);

  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = n.cliente_id), false);
  -- trava os itens na ordem do item (duas operações ao mesmo tempo não se travam uma à outra)
  perform 1 from est_itens where id in (select item_id from est_movimentos where n.estoque_grupo is not null and grupo = n.estoque_grupo)
   order by id for update;
  for m in select * from est_movimentos where n.estoque_grupo is not null and grupo = n.estoque_grupo and origem = 'nota_entrada' and not estornado
            order by item_id, id loop
    if not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = m.item_id and local_id = m.local_id and not estornado;
      if v_saldo - m.quantidade < 0 then
        raise exception 'Desfazer deixaria o estoque negativo (item %, saldo atual %)', (select nome from est_itens where id = m.item_id), v_saldo;
      end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = 'Lançamento da nota desfeito: ' || v_motivo where id = m.id;
  end loop;
  for m in select item_id, min(data) as desde from est_movimentos
            where n.estoque_grupo is not null and grupo = n.estoque_grupo and origem = 'nota_entrada' group by item_id order by item_id loop
    perform app.est_recalcular(m.item_id, m.desde);
  end loop;
  -- 058: desfazer solta a nota do pedido (o pedido continua recebido, com as contas e o estoque dele)
  update fis_notas set processada = false, processada_em = null, processada_por = null, titulos = '{}', estoque_grupo = null, pedido_id = null,
         atualizado_em = now()
   where id = n.id;
  perform app.registrar(n.org_id, 'financeiro', 'notas_desfazer', n.id::text, to_jsonb(n), jsonb_build_object('motivo', v_motivo));
end $$;

/** Pedido ligado a nota lançada não cancela; pedido que cita nota já lançada (com contas/estoque) não é recebido. */
create or replace function app.tg_est_pedido_nota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nf text;
begin
  if new.tipo <> 'compra' or new.situacao is not distinct from old.situacao then return new; end if;
  if new.situacao = 'cancelado' then
    select numero into v_nf from fis_notas where pedido_id = new.id and processada limit 1;
    if found then
      raise exception 'Este pedido está ligado à NF %, já lançada: desfaça o lançamento da nota em Entradas › Lançar nota antes de cancelar', v_nf;
    end if;
  elsif new.situacao = 'recebido' then
    select n.numero into v_nf from fis_notas n join fin_pessoas pe on pe.id = new.pessoa_id
     where n.cliente_id = new.cliente_id and n.direcao = 'entrada' and n.processada and n.pedido_id is null
       and pe.documento is not null and app.fis_digitos(n.emitente_doc) = pe.documento
       and app.fis_doc_cita_nota(new.documento, n.numero)
       and (cardinality(n.titulos) > 0 or n.estoque_grupo is not null)
     limit 1;
    if found then
      raise exception 'A NF % deste fornecedor já foi lançada com contas a pagar e/ou estoque: receber o pedido lançaria a compra de novo. Desfaça o lançamento da nota e lance de novo escolhendo este pedido', v_nf;
    end if;
  end if;
  return new;
end $$;
revoke all on function app.tg_est_pedido_nota() from public, anon, authenticated;
drop trigger if exists est_pedido_nota on public.est_pedidos;
create trigger est_pedido_nota before update of situacao on public.est_pedidos for each row execute function app.tg_est_pedido_nota();

revoke all on function public.fis_processar_nota(jsonb) from public, anon;
grant execute on function public.fis_processar_nota(jsonb) to authenticated;
revoke all on function public.fis_desfazer_lancamento(uuid, text) from public, anon;
grant execute on function public.fis_desfazer_lancamento(uuid, text) to authenticated;
