-- 111 · BI de Gestão: public.bi_indicadores rápida (achado A-01 do parecer de 21/11/2026). No Grupo Clara, de 01/01 a
-- 21/11/2026, a função levava 13,3 s e o banco corta em 8 s o que vem do site: as abas Indicadores e Parecer não
-- abriam. Duas causas: app.bi_regra rodava uma vez por movimento (todo o histórico) e o saldo em aberto de cada título
-- somava as baixas numa subconsulta repetida sobre um CTE sem índice. Agora a classe sai uma vez por (empresa,
-- categoria) e as baixas são somadas por título de uma vez só. Mesmo resultado (conferido em produção antes de aplicar).
-- Texto completo da função (também resolve, para esta função, o M-07: a 109 a tinha reescrito por expressão regular).

create or replace function public.bi_indicadores(p_clientes uuid[], p_inicio date, p_fim date, p_eliminar boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_cnpjs text[]; v_elim boolean; v_corte date; v jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'indicadores', p_inicio, p_fim);
  select array_agg(app.so_digitos(c.cnpj)) into v_cnpjs from clientes c where c.id = any (p_clientes);
  v_elim := p_eliminar and cardinality(p_clientes) > 1;
  v_corte := least(p_fim, app.hoje(v_org));

  with base as materialized (
    select m.cliente_id, m.categoria_codigo, m.codigo_titulo, m.natureza, m.status, m.vencimento, m.emissao, m.registro,
           m.pagamento, m.valor_documento, m.valor_pago, m.cnpj_cpf, m.nome, m.chave like '%|0|0|%' as titulo
      from omie_movimentos m
     where m.cliente_id = any (p_clientes)
       -- 109: fato sem CNPJ/CPF não sai na eliminação entre as empresas
       and not (v_elim and coalesce(app.so_digitos(coalesce(m.cnpj_cpf, '')), '') = any (v_cnpjs))
  ),
  -- a classe (linha do fluxo) uma vez por empresa e categoria, não por movimento
  classes as materialized (
    select k.cliente_id, k.categoria_codigo, (app.bi_regra(v_org, k.cliente_id, k.categoria_codigo)).linha_dfc as classe
      from (select distinct cliente_id, categoria_codigo from base) k
  ),
  mov as (
    select b.*, k.classe from base b
      join classes k on k.cliente_id = b.cliente_id and k.categoria_codigo is not distinct from b.categoria_codigo
  ),
  tit as (select * from mov where titulo and coalesce(status, '') not in ('CANCELADO', 'PREVISAO')),
  bx as (select * from mov where not titulo and valor_pago <> 0),
  -- baixas até o corte somadas por título de uma vez
  pago as (
    select cliente_id, codigo_titulo, categoria_codigo, sum(valor_pago) as pago
      from bx where pagamento <= v_corte group by 1, 2, 3
  ),
  saldo as (
    select t.natureza, t.classe, t.vencimento, t.valor_documento - coalesce(p.pago, 0) as aberto
      from tit t
      left join pago p on p.cliente_id = t.cliente_id and p.codigo_titulo = t.codigo_titulo
                      and p.categoria_codigo = t.categoria_codigo
     where coalesce(t.emissao, t.registro) <= v_corte
  ),
  abertos as (
    select case when natureza = 'R' and classe = 'rec_clientes' then 'receber'
                when natureza = 'P' and classe in ('pag_fornecedores', 'pag_despesas', 'pag_impostos', 'pag_pessoal') then 'pagar' end as lado,
           aberto, greatest(v_corte - vencimento, 0) as atraso
      from saldo where aberto > 0.01
  ),
  posicao as (
    select lado,
           sum(aberto) as aberto,
           sum(aberto) filter (where atraso > 0) as vencido,
           sum(aberto) filter (where atraso between 1 and 30) as a30,
           sum(aberto) filter (where atraso between 31 and 60) as a60,
           sum(aberto) filter (where atraso between 61 and 90) as a90,
           sum(aberto) filter (where atraso > 90) as mais90
      from abertos where lado is not null group by lado
  ),
  prazos as (
    select sum(valor_pago * greatest(pagamento - emissao, 0)) filter (where natureza = 'R' and classe = 'rec_clientes')
             / nullif(sum(valor_pago) filter (where natureza = 'R' and classe = 'rec_clientes'), 0) as pmr,
           sum(valor_pago * greatest(pagamento - emissao, 0)) filter (where natureza = 'P' and classe in ('pag_fornecedores', 'pag_despesas'))
             / nullif(sum(valor_pago) filter (where natureza = 'P' and classe in ('pag_fornecedores', 'pag_despesas')), 0) as pmp
      from bx where pagamento between p_inicio and p_fim and emissao is not null
  ),
  clientes_top as (
    select app.so_digitos(n.cnpj_cpf_dest) as doc, max(n.nome_dest) as nome, sum(n.valor_total) as valor
      from omie_notas n
     where n.cliente_id = any (p_clientes) and n.situacao = 'autorizada' and n.emissao between p_inicio and p_fim
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and coalesce(app.so_digitos(coalesce(n.cnpj_cpf_dest, '')), '') = any (v_cnpjs))
     group by 1
  ),
  fornecedores_top as (
    select app.so_digitos(t.cnpj_cpf) as doc, max(t.nome) as nome, sum(t.valor_documento) as valor
      from tit t
     where t.natureza = 'P' and t.classe in ('pag_fornecedores', 'pag_despesas')
       and coalesce(t.emissao, t.registro) between p_inicio and p_fim
     group by 1
  ),
  liquidez as (
    select distinct on (b.cliente_id) b.cliente_id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social) as empresa,
           b.competencia, b.indices
      from portal_balancetes b join clientes c on c.id = b.cliente_id
     where b.cliente_id = any (p_clientes) and b.status = 'publicado' and b.competencia <= p_fim
       and b.indices ? 'liquidez_corrente'
     order by b.cliente_id, b.competencia desc
  )
  select jsonb_build_object(
    'corte', v_corte,
    'pmr', (select round(pmr, 1) from prazos),
    'pmp', (select round(pmp, 1) from prazos),
    'receber', coalesce((select to_jsonb(p) - 'lado' from posicao p where lado = 'receber'), '{}'::jsonb),
    'pagar', coalesce((select to_jsonb(p) - 'lado' from posicao p where lado = 'pagar'), '{}'::jsonb),
    'clientes_total', (select coalesce(sum(valor), 0) from clientes_top),
    'clientes', coalesce((select jsonb_agg(jsonb_build_object('doc', doc, 'nome', nome, 'valor', round(valor, 2)) order by valor desc)
                            from (select * from clientes_top order by valor desc limit 10) x), '[]'::jsonb),
    'fornecedores_total', (select coalesce(sum(valor), 0) from fornecedores_top),
    'fornecedores', coalesce((select jsonb_agg(jsonb_build_object('doc', doc, 'nome', nome, 'valor', round(valor, 2)) order by valor desc)
                                from (select * from fornecedores_top order by valor desc limit 10) x), '[]'::jsonb),
    'liquidez', coalesce((select jsonb_agg(jsonb_build_object(
                             'empresa', empresa, 'competencia', competencia,
                             'corrente', indices->'liquidez_corrente', 'seca', indices->'liquidez_seca',
                             'imediata', indices->'liquidez_imediata', 'geral', indices->'liquidez_geral'))
                            from liquidez), '[]'::jsonb)
  ) into v;
  return v;
end $$;
