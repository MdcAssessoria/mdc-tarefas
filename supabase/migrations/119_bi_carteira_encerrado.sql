-- 119 · Carteira de pedidos: pedido encerrado na Omie (cabeçalho "encerrado" = S, fechado sem faturar) sai da carteira.
-- Visto na primeira carga da Indústria Mecânica Clara (24/11/2026): pedidos na etapa 50 encerrados e não faturados
-- apareceriam para sempre como atrasados. Coluna própria (preenchida pela função omie-sincronizar e, para o que já
-- foi gravado, a partir do JSON do pedido) e a mesma função bi_carteira com o filtro.
alter table public.omie_pedidos add column if not exists encerrado boolean not null default false;
comment on column public.omie_pedidos.encerrado is 'Pedido encerrado na Omie sem faturar (cabecalho.encerrado = S): fora da carteira (119).';
update public.omie_pedidos set encerrado = true where coalesce(dados->'cabecalho'->>'encerrado', '') = 'S' and not encerrado;

create or replace function public.bi_carteira(p_clientes uuid[], p_inicio date, p_fim date)
returns table (cliente_id uuid, empresa text, codigo_pedido text, numero text, numero_cliente text, cliente_doc text,
               cliente_nome text, etapa text, etapa_nome text, inclusao date, previsao date, faturado boolean,
               faturamento date, valor numeric, quantidade numeric, itens integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'carteira', p_inicio, p_fim);

  return query
  select p.cliente_id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social), p.codigo_pedido, p.numero, p.numero_cliente,
         doc.doc, coalesce(pe.nome, nt.nome, case when p.codigo_cliente is not null then 'Cliente ' || p.codigo_cliente end),
         p.etapa, p.etapa_nome, p.inclusao, p.previsao, p.faturado, p.faturamento, p.valor, p.quantidade, p.itens
    from public.omie_pedidos p
    join public.clientes c on c.id = p.cliente_id
    left join lateral (
      select nullif(app.so_digitos(m.cnpj_cpf), '') as doc from public.omie_movimentos m
       where m.cliente_id = p.cliente_id and m.dados->'detalhes'->>'nCodCliente' = p.codigo_cliente
         and coalesce(m.cnpj_cpf, '') <> ''
       limit 1) doc on true
    left join public.omie_pessoas pe on pe.cliente_id = p.cliente_id and pe.doc = doc.doc
    left join lateral (
      select n.nome_dest as nome from public.omie_notas n
       where n.cliente_id = p.cliente_id and n.cnpj_cpf_dest = doc.doc and coalesce(n.nome_dest, '') <> ''
       limit 1) nt on pe.nome is null
   where p.cliente_id = any (p_clientes)
     and not p.cancelado
     and (p.faturado or not p.encerrado)
     and (not p.faturado
          or p.faturamento between p_inicio and p_fim
          or p.inclusao between p_inicio and p_fim);
end $$;
revoke all on function public.bi_carteira(uuid[], date, date) from public, anon;
grant execute on function public.bi_carteira(uuid[], date, date) to authenticated;
