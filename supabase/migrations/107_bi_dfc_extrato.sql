-- 107 · BI de Gestão: fluxo de caixa pelo extrato do banco (decisão do Edvaldo, 21/11/2026).
-- Conferido em produção (106): em 105 de 105 pares conta × mês, a soma dos movimentos realizados do extrato do Omie é
-- exatamente saldo final − saldo anterior. As baixas de títulos (ListarMovimentos) não fecham com o banco (ex.: C6 da
-- Claratec em nov/2026: títulos +R$ 469 mil × extrato +R$ 33) e não têm os lançamentos direto na conta.
-- Regra: nos meses da conta corrente em que o extrato já foi gravado (omie_saldos.dados.extrato = true), o DFC sai do
-- extrato — "Conta Paga", "Conta Recebida", "Débito/Crédito em Conta Corrente", pela categoria do Omie —, sem as
-- transferências entre contas ("Débito/Crédito de Transferência") e sem os previstos. Nos meses ainda sem extrato, fica
-- a regra antiga (baixas dos títulos). Eliminação entre as empresas do grupo pelo CNPJ do movimento (cDocCliente).
-- A classificação passa a listar também as categorias dos débitos/créditos direto na conta.

create or replace function app.bi_fatos(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date, p_eliminar boolean)
returns table (cliente_id uuid, linha text, conta text, competencia date, valor numeric, origem text, ref text,
               data date, documento text, pessoa text, doc text, categoria text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid; v_cnpjs text[]; v_elim boolean;
begin
  select min(c.org_id::text)::uuid into v_org from clientes c where c.id = any (p_clientes);
  select array_agg(app.so_digitos(c.cnpj)) into v_cnpjs from clientes c where c.id = any (p_clientes);
  v_elim := p_eliminar and cardinality(p_clientes) > 1;

  return query
  with
  linhas as (
    select distinct on (l.codigo) l.codigo, l.natureza, l.soma
      from bi_linhas l where l.relatorio = p_relatorio and l.ativo and (l.org_id is null or l.org_id = v_org)
     order by l.codigo, (l.org_id is null)
  ),
  mov as (
    select m.* from omie_movimentos m
     where m.cliente_id = any (p_clientes)
       and coalesce(m.status, '') not ilike 'cancel%'
       and not (v_elim and app.so_digitos(coalesce(m.cnpj_cpf, '')) = any (v_cnpjs))
  ),
  -- extrato realizado (107): contas pagas/recebidas e débitos/créditos direto na conta; sem transferências entre contas
  -- e sem previstos. Só nos meses da conta em que o extrato foi gravado (saldo com extrato = true).
  ext as (
    select x.* from omie_extrato x
     where p_relatorio = 'dfc' and x.cliente_id = any (p_clientes)
       and x.origem in ('Conta Paga', 'Conta Recebida', 'Débito em Conta Corrente', 'Crédito em Conta Corrente')
       and coalesce(x.dados->>'cSituacao', '') <> 'Previsto' and coalesce(x.valor, 0) <> 0
       and x.data between p_inicio and p_fim
       and not (v_elim and app.so_digitos(coalesce(x.dados->>'cDocCliente', '')) = any (v_cnpjs))
  ),
  com_extrato as (
    select s.cliente_id, s.conta_corrente, s.mes from omie_saldos s
     where p_relatorio = 'dfc' and s.cliente_id = any (p_clientes) and (s.dados->>'extrato')::boolean is true
  ),
  cats as (
    select k.cliente_id, k.categoria_codigo, oc.descricao,
           app.bi_conta(v_org, k.cliente_id, k.categoria_codigo, oc.descricao) as conta
      from (select distinct m.cliente_id, m.categoria_codigo from mov m
            union
            select distinct x.cliente_id, x.categoria_codigo from ext x) k
      left join omie_categorias oc on oc.cliente_id = k.cliente_id and oc.codigo = k.categoria_codigo
  ),
  classe as (
    select c.cliente_id, c.categoria_codigo, c.descricao, c.conta, p.linha_dre, p.linha_dfc, p.linha_dfc_entrada, p.dre_por_titulo,
           (select mp from bi_mapa_categorias mp
             where mp.org_id = v_org and (mp.cliente_id is null or mp.cliente_id = c.cliente_id)
               and c.categoria_codigo like mp.prefixo || '%'
             order by (mp.cliente_id is null), length(mp.prefixo) desc limit 1) as regra
      from cats c
      left join lateral (select x.* from bi_plano x where x.codigo = c.conta and x.ativo and (x.org_id is null or x.org_id = v_org)
                          order by (x.org_id is null) limit 1) p on true
  ),
  base as (
    -- receita e devoluções pelas notas, por CFOP
    select n.cliente_id, r.linha_dre as linha,
           case when r.linha_dre = 'devolucoes' then '4.1.07'
                when c.cfop = 'SERV' then '3.2.01'
                when c.cfop in ('5124', '5125', '6124', '6125') then '3.2.02'
                else '3.1.01' end as conta,
           date_trunc('month', n.emissao)::date as comp, c.valor as v, null::text as nat_mov,
           'nota'::text as origem, n.modelo || ':' || n.id_omie as ref, n.emissao as data,
           coalesce(n.numero, '') || coalesce('/' || nullif(n.serie, ''), '') as documento,
           n.nome_dest as pessoa, n.cnpj_cpf_dest as doc, 'CFOP ' || c.cfop as categoria
      from omie_notas n
      join omie_nota_cfops c on c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie
      join bi_cfop_regras r on r.cfop = c.cfop
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and not (v_elim and app.so_digitos(coalesce(n.cnpj_cpf_dest, '')) = any (v_cnpjs))
    union all
    -- impostos destacados nas notas de venda, um fato por imposto
    select n.cliente_id, 'deducoes', i.conta, date_trunc('month', n.emissao)::date, i.v, null,
           'imposto', n.modelo || ':' || n.id_omie, n.emissao,
           coalesce(n.numero, '') || coalesce('/' || nullif(n.serie, ''), ''), n.nome_dest, n.cnpj_cpf_dest, i.nome
      from omie_notas n
      cross join lateral (values ('4.1.02', n.icms, 'ICMS'), ('4.1.03', n.pis, 'PIS'), ('4.1.04', n.cofins, 'COFINS'),
                                 ('4.1.05', n.iss, 'ISS')) i(conta, v, nome)
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim and i.v <> 0
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and app.so_digitos(coalesce(n.cnpj_cpf_dest, '')) = any (v_cnpjs))
    union all
    -- títulos (DRE pela emissão): conta do plano; sem conta, a regra antiga; sem nada, despesa em "Não classificado"
    select m.cliente_id,
           case when k.conta is not null then (case when k.dre_por_titulo then k.linha_dre end)
                when (k.regra).id is null then (case when m.natureza = 'P' then 'nao_classificado' end)
                when (k.regra).entra_dre then coalesce((k.regra).linha_dre, case when m.natureza = 'P' then 'nao_classificado' end)
           end,
           k.conta, date_trunc('month', coalesce(m.emissao, m.registro, m.vencimento))::date, m.valor_documento, m.natureza,
           'titulo', m.chave, coalesce(m.emissao, m.registro, m.vencimento), m.documento, m.nome, m.cnpj_cpf,
           coalesce(k.descricao, m.categoria_codigo)
      from (select distinct on (x.cliente_id, x.codigo_titulo, x.categoria_codigo) x.* from mov x
             order by x.cliente_id, x.codigo_titulo, x.categoria_codigo, x.valor_documento desc) m
      join classe k on k.cliente_id = m.cliente_id and k.categoria_codigo is not distinct from m.categoria_codigo
     where p_relatorio = 'dre' and coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim
    union all
    -- baixas (fluxo pela data do pagamento)
    select m.cliente_id,
           case when k.conta is not null then (case when m.natureza = 'R' and k.linha_dfc_entrada is not null
                                                      then k.linha_dfc_entrada else k.linha_dfc end)
                when (k.regra).id is null then 'nao_classificado'
                when (k.regra).entra_dfc then coalesce((k.regra).linha_dfc, 'nao_classificado') end,
           k.conta, date_trunc('month', m.pagamento)::date, m.valor_pago, m.natureza,
           'baixa', m.chave, m.pagamento, m.documento, m.nome, m.cnpj_cpf, coalesce(k.descricao, m.categoria_codigo)
      from mov m
      join classe k on k.cliente_id = m.cliente_id and k.categoria_codigo is not distinct from m.categoria_codigo
     where p_relatorio = 'dfc' and m.pagamento between p_inicio and p_fim and m.valor_pago <> 0
       and not exists (select 1 from com_extrato ce where ce.cliente_id = m.cliente_id and ce.conta_corrente = m.conta_corrente
                         and ce.mes = date_trunc('month', m.pagamento)::date)
    union all
    -- movimentos do extrato (107): sinal pelo valor (negativo = saída)
    select x.cliente_id,
           case when k.conta is not null then (case when x.valor > 0 and k.linha_dfc_entrada is not null
                                                      then k.linha_dfc_entrada else k.linha_dfc end)
                when (k.regra).id is null then 'nao_classificado'
                when (k.regra).entra_dfc then coalesce((k.regra).linha_dfc, 'nao_classificado') end,
           k.conta, date_trunc('month', x.data)::date, abs(x.valor), case when x.valor < 0 then 'P' else 'R' end,
           'extrato', x.conta_corrente || ':' || x.lancamento, x.data, coalesce(x.documento, x.dados->>'cNumero'),
           coalesce(x.pessoa, x.dados->>'cDesCliente'), x.dados->>'cDocCliente',
           coalesce(x.dados->>'cDesCategoria', k.descricao, x.categoria_codigo, x.origem)
      from ext x
      join classe k on k.cliente_id = x.cliente_id and k.categoria_codigo is not distinct from x.categoria_codigo
    union all
    select b.cliente_id,
           case when p_relatorio = 'dre' then b.linha_dre else b.linha_dfc end, null,
           case when p_relatorio = 'dre' then b.competencia else date_trunc('month', b.data_caixa)::date end,
           b.valor, 'X', 'complementar', b.id::text,
           case when p_relatorio = 'dre' then b.competencia else b.data_caixa end, null, null, null, b.historico
      from bi_complementares b
     where b.cliente_id = any (p_clientes) and b.cancelado_em is null
       and ((p_relatorio = 'dre' and b.linha_dre is not null and b.competencia between date_trunc('month', p_inicio) and p_fim)
         or (p_relatorio = 'dfc' and b.linha_dfc is not null and b.data_caixa between p_inicio and p_fim))
  )
  select b.cliente_id, b.linha, b.conta, b.comp,
         (case
            when l.natureza is null then case when b.nat_mov = 'P' then -b.v else b.v end
            when b.nat_mov is null or b.nat_mov = 'X' then case when l.natureza = 'P' then -b.v else b.v end
            when b.nat_mov = l.natureza then case when l.natureza = 'P' then -b.v else b.v end
            else case when l.natureza = 'P' then b.v else -b.v end
          end)::numeric(15,2),
         b.origem, b.ref, b.data, b.documento, b.pessoa, b.doc, b.categoria
    from base b join linhas l on l.codigo = b.linha
   where b.linha is not null and l.soma is null;
end $$;

create or replace function public.bi_classificacao_listar(p_clientes uuid[], p_inicio date, p_fim date)
returns table (cliente_id uuid, empresa text, categoria_codigo text, descricao text, conta text, conta_nome text,
               origem text, excecao_id uuid, a_conferir boolean, observacao text, alterado_em timestamptz,
               valor numeric, lancamentos integer)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_exigir_gestor(v_org);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'classificacao', p_inicio, p_fim);
  return query
  with usadas0 as (
    select m.cliente_id, m.categoria_codigo,
           sum(case when coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim
                    then case when m.natureza = 'P' then -m.valor_documento else m.valor_documento end else 0 end) as valor,
           count(*) filter (where coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim) as n
      from (select distinct on (x.cliente_id, x.codigo_titulo, x.categoria_codigo) x.*
              from omie_movimentos x
             where x.cliente_id = any (p_clientes) and coalesce(x.status, '') not ilike 'cancel%'
             order by x.cliente_id, x.codigo_titulo, x.categoria_codigo, x.valor_documento desc) m
     where m.categoria_codigo is not null
     group by m.cliente_id, m.categoria_codigo
     union all
     -- 107: categorias dos movimentos do extrato (débitos e créditos direto na conta entram só por aqui)
     select x.cliente_id, x.categoria_codigo,
            sum(case when x.data between p_inicio and p_fim then x.valor else 0 end),
            count(*) filter (where x.data between p_inicio and p_fim)
       from omie_extrato x
      where x.cliente_id = any (p_clientes) and x.categoria_codigo is not null
        and x.origem in ('Débito em Conta Corrente', 'Crédito em Conta Corrente')
        and coalesce(x.dados->>'cSituacao', '') <> 'Previsto'
      group by x.cliente_id, x.categoria_codigo
  ),
  usadas as (
    select u.cliente_id, u.categoria_codigo, sum(u.valor) as valor, sum(u.n) as n from usadas0 u group by 1, 2
  ),
  cats as (
    select oc.cliente_id, oc.codigo, oc.descricao, u.valor, u.n
      from omie_categorias oc
      left join usadas u on u.cliente_id = oc.cliente_id and u.categoria_codigo = oc.codigo
     where oc.cliente_id = any (p_clientes) and not coalesce(oc.totalizadora, false)
       and (u.cliente_id is not null
            or exists (select 1 from bi_plano_excecoes e where e.org_id = v_org and e.categoria_codigo = oc.codigo
                         and (e.cliente_id = oc.cliente_id or e.cliente_id is null)))
  ),
  exc as (
    select c.*, (select e from bi_plano_excecoes e
                  where e.org_id = v_org and e.categoria_codigo = c.codigo and (e.cliente_id = c.cliente_id or e.cliente_id is null)
                  order by (e.cliente_id is null) limit 1) as e,
           substring(coalesce(c.descricao, '') from '^\s*([0-9]\.[0-9]{1,2}\.[0-9]{1,2})\s*-') as cod
      from cats c
  ),
  res as (
    select x.*, app.bi_conta(v_org, x.cliente_id, x.codigo, x.descricao) as conta from exc x
  )
  select r.cliente_id, coalesce(nullif(cl.nome_fantasia, ''), cl.razao_social), r.codigo, r.descricao, r.conta,
         (select p.nome from bi_plano p where p.codigo = r.conta and (p.org_id is null or p.org_id = v_org)
           order by (p.org_id is null) limit 1),
         case when (r.e).id is not null then 'excecao'
              when r.codigo like '0.01.%' then 'transferencia'
              when r.conta is not null then 'codigo'
              else 'sem' end,
         (r.e).id, coalesce((r.e).a_conferir, false), (r.e).observacao, (r.e).alterado_em,
         coalesce(r.valor, 0)::numeric(15,2), coalesce(r.n, 0)::integer
    from res r join clientes cl on cl.id = r.cliente_id
   order by (r.conta is null) desc, coalesce((r.e).a_conferir, false) desc, abs(coalesce(r.valor, 0)) desc, r.codigo;
end $$;

do $$
begin
  revoke all on function app.bi_fatos(text, uuid[], date, date, boolean) from public, anon, authenticated;
  grant execute on function app.bi_fatos(text, uuid[], date, date, boolean) to service_role;
  revoke all on function public.bi_classificacao_listar(uuid[], date, date) from public, anon;
  grant execute on function public.bi_classificacao_listar(uuid[], date, date) to authenticated, service_role;
end $$;
