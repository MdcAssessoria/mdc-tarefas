-- =====================================================================================================
-- 094 · BI de Gestão: relatório em menos de 1 s e acesso conferido em todas as empresas pedidas
-- -----------------------------------------------------------------------------------------------------
-- A tela /bi-gestao (19/11/2026) parava em "O servidor demorou para responder": bi_relatorio era security invoker e a
-- RLS de omie_movimentos/omie_notas chamava app.bi_pode_ver(cliente_id) em cada linha (~10 mil movimentos do Grupo
-- Clara): 8,8 s com o usuário logado (limite de 8 s) contra 0,12 s sem a RLS.
--
-- O que muda (mesmo cálculo da versão aplicada direto em produção, que não estava no repositório — ALT-02):
--   · security definer com search_path fixo: a permissão é conferida UMA vez por empresa, antes do cálculo;
--   · a pessoa precisa poder ver TODAS as empresas pedidas (antes bastava uma delas para liberar a lista inteira);
--   · empresas de organizações diferentes na mesma chamada são recusadas;
--   · execução só para authenticated (anon e public não).
-- =====================================================================================================

create or replace function public.bi_relatorio(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date,
                                               p_eliminar boolean default true)
returns table (codigo text, nome text, ordem integer, subtotal boolean, natureza text, competencia date, valor numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid; v_cnpjs text[]; v_elim boolean; v_orgs int;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  if p_clientes is null or cardinality(p_clientes) = 0 then raise exception 'Escolha ao menos uma empresa.'; end if;
  -- acesso: cada empresa pedida existe e a pessoa pode vê-la (equipe com o BI ou Portal do Cliente com o BI)
  if exists (select 1 from unnest(p_clientes) x(id)
              where not exists (select 1 from clientes c where c.id = x.id)
                 or not app.bi_pode_ver(x.id)) then
    raise exception 'Sem acesso às empresas informadas.';
  end if;
  select count(distinct c.org_id), min(c.org_id::text)::uuid into v_orgs, v_org from clientes c where c.id = any (p_clientes);
  if v_orgs <> 1 then raise exception 'Escolha empresas de uma mesma organização.'; end if;
  select array_agg(regexp_replace(c.cnpj, '\D', '', 'g')) into v_cnpjs from clientes c where c.id = any (p_clientes);
  v_elim := p_eliminar and cardinality(p_clientes) > 1;

  return query
  with recursive
  linhas as (
    select distinct on (l.codigo) l.codigo, l.nome, l.ordem, l.natureza, l.soma
      from bi_linhas l where l.relatorio = p_relatorio and l.ativo and (l.org_id is null or l.org_id = v_org)
     order by l.codigo, (l.org_id is null)
  ),
  mov as (
    select m.*, (
      select mp from bi_mapa_categorias mp
       where mp.org_id = v_org and (mp.cliente_id is null or mp.cliente_id = m.cliente_id) and m.categoria_codigo like mp.prefixo || '%'
       order by (mp.cliente_id is null), length(mp.prefixo) desc limit 1) as regra
      from omie_movimentos m
     where m.cliente_id = any (p_clientes)
       and coalesce(m.status, '') not ilike 'cancel%'
       and not (v_elim and regexp_replace(coalesce(m.cnpj_cpf, ''), '\D', '', 'g') = any (v_cnpjs))
  ),
  base as (
    select r.linha_dre as linha, date_trunc('month', n.emissao)::date as comp, c.valor as v, null::text as nat_mov
      from omie_notas n
      join omie_nota_cfops c using (cliente_id, modelo, id_omie)
      join bi_cfop_regras r on r.cfop = c.cfop
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and not (v_elim and regexp_replace(coalesce(n.cnpj_cpf_dest, ''), '\D', '', 'g') = any (v_cnpjs))
    union all
    select 'deducoes', date_trunc('month', n.emissao)::date, (n.icms + n.pis + n.cofins + n.iss), null
      from omie_notas n
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and regexp_replace(coalesce(n.cnpj_cpf_dest, ''), '\D', '', 'g') = any (v_cnpjs))
    union all
    select case when (m.regra).id is null then (case when m.natureza = 'P' then 'nao_classificado' end)
                when (m.regra).entra_dre then coalesce((m.regra).linha_dre, case when m.natureza = 'P' then 'nao_classificado' end) end,
           date_trunc('month', coalesce(m.emissao, m.registro, m.vencimento))::date, m.valor_documento, m.natureza
      from (select distinct on (cliente_id, codigo_titulo, categoria_codigo) * from mov
             order by cliente_id, codigo_titulo, categoria_codigo, valor_documento desc) m
     where p_relatorio = 'dre' and coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim
    union all
    select case when (m.regra).id is null then 'nao_classificado'
                when (m.regra).entra_dfc then coalesce((m.regra).linha_dfc, 'nao_classificado') end,
           date_trunc('month', m.pagamento)::date, m.valor_pago, m.natureza
      from mov m
     where p_relatorio = 'dfc' and m.pagamento between p_inicio and p_fim and m.valor_pago <> 0
    union all
    select case when p_relatorio = 'dre' then b.linha_dre else b.linha_dfc end,
           case when p_relatorio = 'dre' then b.competencia else date_trunc('month', b.data_caixa)::date end,
           b.valor, 'X'
      from bi_complementares b
     where b.cliente_id = any (p_clientes) and b.cancelado_em is null
       and ((p_relatorio = 'dre' and b.linha_dre is not null and b.competencia between date_trunc('month', p_inicio) and p_fim)
         or (p_relatorio = 'dfc' and b.linha_dfc is not null and b.data_caixa between p_inicio and p_fim))
  ),
  com_sinal as (
    select b.linha, b.comp,
           case
             when l.natureza is null then case when b.nat_mov = 'P' then -b.v else b.v end
             when b.nat_mov is null or b.nat_mov = 'X' then case when l.natureza = 'P' then -b.v else b.v end
             when b.nat_mov = l.natureza then case when l.natureza = 'P' then -b.v else b.v end
             else case when l.natureza = 'P' then b.v else -b.v end
           end as v
      from base b join linhas l on l.codigo = b.linha
     where b.linha is not null and l.soma is null
  ),
  meses as (
    select generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month')::date as comp
  ),
  analiticas as (
    select l.codigo, ms.comp, coalesce(sum(s.v), 0)::numeric(15,2) as v
      from linhas l cross join meses ms
      left join com_sinal s on s.linha = l.codigo and s.comp = ms.comp
     where l.soma is null
     group by l.codigo, ms.comp
  ),
  arvore (raiz, folha) as (
    select l.codigo, x from linhas l, unnest(l.soma) x where l.soma is not null
    union
    select a.raiz, x from arvore a join linhas l on l.codigo = a.folha and l.soma is not null, unnest(l.soma) x
  ),
  subtotais as (
    select a.raiz as codigo, an.comp, sum(an.v)::numeric(15,2) as v
      from arvore a join analiticas an on an.codigo = a.folha
     group by a.raiz, an.comp
  ),
  tudo as (select * from analiticas union all select * from subtotais)
  select l.codigo, l.nome, l.ordem, l.soma is not null, l.natureza, t.comp, coalesce(t.v, 0)
    from linhas l join tudo t on t.codigo = l.codigo
   order by l.ordem, t.comp;
end $$;
revoke all on function public.bi_relatorio(text, uuid[], date, date, boolean) from public, anon;
grant execute on function public.bi_relatorio(text, uuid[], date, date, boolean) to authenticated, service_role;
comment on function public.bi_relatorio(text, uuid[], date, date, boolean) is
  'DRE/DFC gerencial do BI de Gestão (Omie + complementares), mês a mês. Confere app.bi_pode_ver em cada empresa '
  'pedida antes de calcular (094).';
