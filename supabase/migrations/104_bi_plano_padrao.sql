-- 104 · BI de Gestão: plano de contas gerencial padrão (o plano unificado do Edvaldo, 95 contas + contas fora da DRE)
-- e classificação automática das categorias do Omie pelo código na frente da descrição ("6.1.01 - Salários").
--
-- Decisão do Edvaldo (20/11/2026): o plano dele vale como PADRÃO para todos os clientes com Omie. O plano veio do
-- "modelo B" (090d, gestao_plano/gestao_classificacao), apagado pela 101 por engano; o conteúdo estava no repositório.
--
-- Ordem da classificação de cada categoria (app.bi_conta):
--   1. exceção cadastrada (bi_plano_excecoes) da empresa, depois da organização;
--   2. transferência entre contas da própria empresa (categoria 0.01.*) fica fora da DRE e do fluxo;
--   3. código do plano na frente da descrição da categoria, se existir no plano (da organização ou padrão);
--   4. regra antiga por prefixo (bi_mapa_categorias), para quem ainda não usa a codificação;
--   5. nada: despesa cai em "Não classificado".
-- Cada conta do plano diz a linha da DRE e a do fluxo de caixa. Receita de venda, impostos sobre a venda e devoluções
-- vêm das notas (dre_por_titulo = false): o título dessas contas só entra no caixa.
-- Funções: app.bi_conta (classifica), app.bi_fatos (cada fato do relatório, com a origem), bi_relatorio (linhas),
-- bi_relatorio_contas (até a conta do plano) e bi_origem (as notas e títulos de um valor). Testes: supabase/testes/180.

create table if not exists public.bi_plano (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizacoes(id) on delete cascade,
  codigo text not null check (codigo ~ '^[0-9](\.[0-9]{1,2}){2}$'),
  nome text not null,
  tipo text not null check (tipo in ('RB', 'DED', 'CUS', 'PES', 'ADM', 'COM', 'TRI', 'RFI', 'DFI', 'IR', 'CX', 'FORA')),
  ordem integer not null,
  linha_dre text,
  linha_dfc text,
  dre_por_titulo boolean not null default true,
  ativo boolean not null default true
);
create unique index if not exists bi_plano_unico on public.bi_plano (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);
comment on table public.bi_plano is 'Plano de contas gerencial do BI (104). org_id nulo = padrão MDC (plano do Edvaldo). tipo: RB receita, DED deduções, CUS custos, PES pessoal, ADM administrativas, COM comerciais, TRI tributos, RFI/DFI financeiro, IR, CX caixa sem resultado (principal de dívidas), FORA fora da DRE (9.x e transferências). dre_por_titulo = falso quando a DRE vem das notas.';

alter table public.bi_plano enable row level security;
revoke all on public.bi_plano from anon, authenticated;
grant select on public.bi_plano to authenticated;
drop policy if exists bi_plano_ver on public.bi_plano;
create policy bi_plano_ver on public.bi_plano for select to authenticated
  using (org_id is null or app.hub_pode(org_id, 'bi_gestao', 'ver')
         or exists (select 1 from clientes c where c.org_id = bi_plano.org_id and app.portal_pode(c.id, 'bi_gestao')));

create table if not exists public.bi_plano_excecoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  categoria_codigo text not null,
  plano_codigo text not null,
  a_conferir boolean not null default false,
  origem text not null default 'tela' check (origem in ('tela', 'de_para_antigo', 'carga')),
  observacao text,
  alterado_por uuid default auth.uid(),
  alterado_em timestamptz not null default now()
);
create unique index if not exists bi_plano_exc_unica on public.bi_plano_excecoes
  (org_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria_codigo);
comment on table public.bi_plano_excecoes is 'Categoria do Omie sem código no nome (ou que precisa de outra conta) → conta do plano (104). cliente_id nulo = vale para todas as empresas da organização. a_conferir = veio de carga e espera a conferência da equipe.';

alter table public.bi_plano_excecoes enable row level security;
revoke all on public.bi_plano_excecoes from anon, authenticated;
grant select on public.bi_plano_excecoes to authenticated;
drop policy if exists bi_plano_exc_ver on public.bi_plano_excecoes;
create policy bi_plano_exc_ver on public.bi_plano_excecoes for select to authenticated
  using (app.hub_pode(org_id, 'bi_gestao', 'ver'));

-- ---------------------------------------------------------------- plano padrão
insert into public.bi_plano (org_id, codigo, nome, tipo, ordem)
select null, x.codigo, x.nome, x.tipo, x.ordem from (values
  ('3.1.01', 'Venda de Produção do Estabelecimento', 'RB', 10),
  ('3.2.01', 'Serviços de Manutenção e Usinagem (NFS-e)', 'RB', 20),
  ('3.2.02', 'Industrialização por Encomenda (NF-e)', 'RB', 30),
  ('3.3.01', 'Outras Receitas Operacionais', 'RB', 40),
  ('4.1.01', 'IPI sobre Faturamento', 'DED', 50),
  ('4.1.02', 'ICMS sobre Vendas', 'DED', 60),
  ('4.1.03', 'PIS sobre Faturamento', 'DED', 70),
  ('4.1.04', 'COFINS sobre Faturamento', 'DED', 80),
  ('4.1.05', 'ISS sobre Serviços', 'DED', 90),
  ('4.1.06', 'Simples Nacional (DAS devido no mês)', 'DED', 100),
  ('4.1.07', 'Devoluções, Cancelamentos e Abatimentos', 'DED', 110),
  ('4.1.08', 'Outros impostos sobre o faturamento / diferença notas × DRE Omie', 'DED', 120),
  ('5.0.01', 'Custo médio das vendas (CMC, apurado pelo estoque no Omie)', 'CUS', 130),
  ('5.1.01', 'Matéria-Prima', 'CUS', 140),
  ('5.1.02', 'Matéria-Prima Secundária, Gases e Consumíveis de Corte/Solda', 'CUS', 150),
  ('5.1.03', 'Serviços de Terceiros e Industrialização', 'CUS', 160),
  ('5.1.04', 'Materiais de Consumo Produtivo', 'CUS', 170),
  ('5.1.05', 'Mão de Obra Direta - Salários (Produção)', 'CUS', 180),
  ('5.1.06', 'Fretes sobre Compras', 'CUS', 190),
  ('5.1.07', 'EPI e Uniformes', 'CUS', 200),
  ('5.1.08', 'Embalagens', 'CUS', 210),
  ('5.1.09', '(−) Devoluções de Compras', 'CUS', 220),
  ('5.1.10', '(±) Variação de Estoques', 'CUS', 230),
  ('5.1.11', 'Encargos Sociais (INSS/FGTS) - Produção', 'CUS', 240),
  ('5.1.12', 'Benefícios (VT, VR, Saúde, Cesta Básica) - Produção', 'CUS', 250),
  ('5.1.13', 'Energia Elétrica - Produção', 'CUS', 260),
  ('5.1.14', 'Manutenção de Máquinas e Equipamentos - Produção', 'CUS', 270),
  ('5.1.15', 'Locação de Máquinas e Equipamentos - Produção', 'CUS', 280),
  ('6.1.01', 'Salários e Ordenados', 'PES', 290),
  ('6.1.02', 'Encargos Sociais (INSS/FGTS) - Administrativo', 'PES', 300),
  ('6.1.03', 'Pró-Labore', 'PES', 310),
  ('6.1.04', 'Benefícios (VT, VR, Saúde, Cesta Básica) - Administrativo', 'PES', 320),
  ('6.1.05', 'Serviços Administrativos', 'PES', 330),
  ('6.2.01', 'Honorários Contábeis', 'ADM', 340),
  ('6.2.02', 'Copa, Cozinha e Limpeza', 'ADM', 350),
  ('6.2.03', 'Aluguel e Condomínio', 'ADM', 360),
  ('6.2.04', 'Energia Elétrica', 'ADM', 370),
  ('6.2.05', 'Veículos e Combustíveis', 'ADM', 380),
  ('6.2.06', 'Seguros', 'ADM', 390),
  ('6.2.07', 'Software e Sistemas', 'ADM', 400),
  ('6.2.08', 'Outras Despesas Administrativas', 'ADM', 410),
  ('6.2.09', 'Manutenção Predial e Pequenas Obras', 'ADM', 420),
  ('6.2.10', 'Manutenção de Equipamentos', 'ADM', 430),
  ('6.2.11', 'Manutenção de Veículos', 'ADM', 440),
  ('6.2.12', 'Material de Escritório e Expediente', 'ADM', 450),
  ('6.2.13', 'Honorários Advocatícios - Consultivo', 'ADM', 460),
  ('6.2.14', 'Telefonia e Internet', 'ADM', 470),
  ('6.2.15', 'Plano de Saúde', 'ADM', 480),
  ('6.2.16', 'Informática e Licenças', 'ADM', 490),
  ('6.2.17', 'Água e Esgoto', 'ADM', 500),
  ('6.2.18', 'Honorários Advocatícios - Contencioso (processos judiciais)', 'ADM', 510),
  ('6.3.01', 'Comissões sobre Vendas', 'COM', 520),
  ('6.3.02', 'Bonificações e Brindes', 'COM', 530),
  ('6.3.03', 'Fretes sobre Vendas', 'COM', 540),
  ('6.3.04', 'Marketing e Propaganda', 'COM', 550),
  ('6.3.05', 'Despesas de Viagens', 'COM', 560),
  ('6.4.01', 'Taxas Estaduais e Municipais', 'TRI', 570),
  ('6.4.02', 'Outros Tributos e Contribuições', 'TRI', 580),
  ('7.1.01', 'Receitas Financeiras', 'RFI', 590),
  ('7.2.01', 'Juros e Multas Pagos', 'DFI', 600),
  ('7.2.02', 'Tarifas Bancárias', 'DFI', 610),
  ('7.2.03', 'Juros sobre Empréstimos e Financiamentos', 'DFI', 620),
  ('7.2.04', 'Caixa - GIROCAIXA', 'CX', 630),
  ('7.2.05', 'Caixa - Pronampe', 'CX', 640),
  ('7.2.06', 'Sicredi - Empréstimo 2731383838', 'CX', 650),
  ('7.2.07', 'Sicredi - CCB C43331588-8', 'CX', 660),
  ('7.2.08', 'Sicredi - CCB C43331584-5', 'CX', 670),
  ('7.2.09', 'Itaú - 2799395286', 'CX', 680),
  ('7.2.10', 'Sicoob - BNDES 34161030', 'CX', 690),
  ('7.2.11', 'Sicoob - CCB 2134815', 'CX', 700),
  ('7.2.12', 'Sicoob - CCB 1991571', 'CX', 710),
  ('7.2.13', 'Claratec - Sicredi BNDES C43320750-3', 'CX', 720),
  ('7.2.14', 'Claratec - Sicredi Pronampe C43330717-6', 'CX', 730),
  ('7.2.15', 'Juros - Itaú 2799395286', 'DFI', 740),
  ('7.2.16', 'Juros - Sicoob BNDES 34161030', 'DFI', 750),
  ('7.2.17', 'Juros - Sicoob CCB 2134815', 'DFI', 760),
  ('7.2.18', 'Juros - Sicoob CCB 1991571', 'DFI', 770),
  ('7.2.19', 'Juros - Claratec BNDES', 'DFI', 780),
  ('7.2.20', 'Juros - Claratec Pronampe', 'DFI', 790),
  ('7.2.21', 'Parcelamento - Samir (Ylusa)', 'CX', 800),
  ('7.2.22', 'Parcelamento - Impostos', 'CX', 810),
  ('7.2.23', 'Acordo Sicredi - renegociação judicial', 'CX', 820),
  ('7.2.24', 'Outras Despesas Financeiras', 'DFI', 830),
  ('7.2.25', 'Juros sobre Antecipações de Recebíveis', 'DFI', 840),
  ('7.2.26', 'Impostos - PGFN transação (Mecânica Clara)', 'CX', 850),
  ('7.2.27', 'Impostos - RFB / Simples parcelamento ordinário', 'CX', 860),
  ('7.2.28', 'Impostos - Refis Bragança (LC 1.033/2026)', 'CX', 870),
  ('7.2.29', 'Impostos - Acordo Paulista (ICMS)', 'CX', 880),
  ('7.2.30', 'Impostos - pagamentos à vista (FGTS, consignado, ISS vencido)', 'CX', 890),
  ('7.2.31', 'Impostos - RELP/PERT-SN em andamento', 'CX', 900),
  ('7.2.32', 'Impostos - parcelas em atraso RELP/PERT-SN', 'CX', 910),
  ('7.2.33', 'Acordo Sicoob - repactuação', 'CX', 920),
  ('7.2.34', 'Acordo Fornecedores - parcelamento', 'CX', 930),
  ('8.1.01', 'IRPJ', 'IR', 940),
  ('8.1.02', 'CSLL', 'IR', 950),
  ('9.1.01', 'Movimentos operacionais sem resultado (adiantamentos, cartão, duplicidades)', 'FORA', 2010),
  ('9.1.02', 'Impostos sobre o faturamento pagos (ICMS, IPI, PIS, COFINS, ISS, DAS)', 'FORA', 2020),
  ('9.2.01', 'Compra e venda de ativo imobilizado', 'FORA', 2030),
  ('9.2.02', 'Aplicações financeiras (aplicação e resgate)', 'FORA', 2040),
  ('9.3.01', 'Empréstimos bancários captados', 'FORA', 2050),
  ('9.3.02', 'Pagamento de empréstimos e financiamentos', 'FORA', 2060),
  ('9.3.04', 'Antecipação de recebíveis', 'FORA', 2070),
  ('9.3.05', 'Sócios (aportes e retiradas)', 'FORA', 2080),
  ('9.3.06', 'Consórcios', 'FORA', 2090),
  ('9.4.01', 'Empréstimos entre empresas do grupo', 'FORA', 2100),
  ('9.4.02', 'Juros de antecipação entre empresas do grupo', 'FORA', 2110),
  ('9.9.01', 'Estornos', 'FORA', 2120),
  ('9.9.02', 'Contas a classificar', 'FORA', 2130),
  ('0.0.01', 'Transferência entre contas da própria empresa', 'FORA', 2140)
) x(codigo, nome, tipo, ordem)
on conflict (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo)
  do update set nome = excluded.nome, tipo = excluded.tipo, ordem = excluded.ordem;

-- linha da DRE e do fluxo de cada conta do padrão
update public.bi_plano p set
  linha_dre = case
    when p.codigo like '3.1.%' or p.codigo like '3.2.%' then 'receita_bruta'
    when p.codigo like '3.3.%' then 'outras_receitas'
    when p.codigo = '4.1.07' then 'devolucoes'
    when p.codigo like '4.1.%' then 'deducoes'
    when p.codigo like '5.%' then 'custos'
    when p.codigo like '6.1.%' then 'despesas_pessoal'
    when p.codigo like '6.2.%' or p.codigo like '6.4.%' then 'despesas_administrativas'
    when p.codigo like '6.3.%' then 'despesas_comerciais'
    when p.codigo like '7.1.%' then 'receitas_financeiras'
    when p.tipo = 'DFI' then 'despesas_financeiras'
    when p.codigo like '8.1.%' then 'irpj_csll'
    when p.codigo = '9.9.02' then 'nao_classificado'
  end,
  linha_dfc = case
    when p.codigo like '3.1.%' or p.codigo like '3.2.%' or p.codigo = '4.1.07' then 'rec_clientes'
    when p.codigo like '3.3.%' or p.codigo like '7.1.%' then 'outros_recebimentos'
    when p.codigo like '4.1.%' or p.codigo like '6.4.%' or p.codigo like '8.1.%' or p.codigo = '9.1.02' then 'pag_impostos'
    when p.codigo in ('5.1.05', '5.1.11', '5.1.12') or p.codigo like '6.1.%' then 'pag_pessoal'
    when p.codigo like '5.%' or p.codigo = '7.2.34' then 'pag_fornecedores'
    when p.codigo like '6.2.%' or p.codigo like '6.3.%' or p.codigo in ('7.2.01', '7.2.02', '7.2.24', '9.1.01', '9.9.01') then 'pag_despesas'
    when p.codigo in ('7.2.22', '7.2.26', '7.2.27', '7.2.28', '7.2.29', '7.2.30', '7.2.31', '7.2.32') then 'pag_impostos'
    when p.codigo like '9.2.%' then 'investimentos'
    when p.codigo = '9.3.05' then 'socios'
    when p.tipo in ('DFI', 'CX') or p.codigo like '9.3.%' or p.codigo like '9.4.%' then 'financiamentos'
    when p.codigo = '9.9.02' then 'nao_classificado'
  end,
  dre_por_titulo = not (p.codigo like '3.1.%' or p.codigo like '3.2.%' or p.codigo in ('4.1.01', '4.1.02', '4.1.03', '4.1.04', '4.1.05', '4.1.07'))
where p.org_id is null;

-- ---------------------------------------------------------------- classificação
create or replace function app.bi_conta(p_org uuid, p_cliente uuid, p_categoria text, p_descricao text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.plano_codigo from bi_plano_excecoes e
      where e.org_id = p_org and e.categoria_codigo = p_categoria and (e.cliente_id = p_cliente or e.cliente_id is null)
      order by (e.cliente_id is null) limit 1),
    case when p_categoria like '0.01.%' then '0.0.01' end,
    (select p.codigo from bi_plano p
      where p.ativo and (p.org_id is null or p.org_id = p_org)
        and p.codigo = substring(coalesce(p_descricao, '') from '^\s*([0-9]\.[0-9]{1,2}\.[0-9]{1,2})\s*-')
      order by (p.org_id is null) limit 1))
$$;

create or replace function app.bi_plano_conta(p_org uuid, p_codigo text)
returns public.bi_plano language sql stable security definer set search_path = public as $$
  select p from bi_plano p where p.codigo = p_codigo and p.ativo and (p.org_id is null or p.org_id = p_org)
   order by (p.org_id is null) limit 1
$$;

-- a regra que os indicadores e o fluxo usam (097) passa a olhar o plano primeiro; mesmo formato de antes
create or replace function app.bi_regra(p_org uuid, p_cliente uuid, p_categoria text)
returns public.bi_mapa_categorias language plpgsql stable security definer set search_path = public as $$
declare v_conta text; v_p public.bi_plano; v_r public.bi_mapa_categorias;
begin
  v_conta := app.bi_conta(p_org, p_cliente, p_categoria,
                          (select oc.descricao from omie_categorias oc where oc.cliente_id = p_cliente and oc.codigo = p_categoria));
  if v_conta is not null then
    v_p := app.bi_plano_conta(p_org, v_conta);
    if v_p.id is not null then
      v_r.org_id := p_org; v_r.cliente_id := p_cliente; v_r.prefixo := p_categoria;
      v_r.linha_dre := v_p.linha_dre; v_r.entra_dre := v_p.linha_dre is not null and v_p.dre_por_titulo;
      v_r.linha_dfc := v_p.linha_dfc; v_r.entra_dfc := v_p.linha_dfc is not null;
      v_r.id := v_p.id; v_r.atualizado_em := now();
      return v_r;
    end if;
  end if;
  select mp into v_r from bi_mapa_categorias mp
   where mp.org_id = p_org and (mp.cliente_id is null or mp.cliente_id = p_cliente) and p_categoria like mp.prefixo || '%'
   order by (mp.cliente_id is null), length(mp.prefixo) desc limit 1;
  return v_r;
end $$;

-- ---------------------------------------------------------------- fatos do relatório (uso interno)
-- Um fato por nota × CFOP, imposto da nota, título (DRE, pela emissão) ou baixa (fluxo, pelo pagamento) e lançamento
-- complementar, já com a linha, a conta do plano e o sinal da linha (despesa negativa). Quem chama confere o acesso.
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
  cats as (
    select k.cliente_id, k.categoria_codigo, oc.descricao,
           app.bi_conta(v_org, k.cliente_id, k.categoria_codigo, oc.descricao) as conta
      from (select distinct m.cliente_id, m.categoria_codigo from mov m) k
      left join omie_categorias oc on oc.cliente_id = k.cliente_id and oc.codigo = k.categoria_codigo
  ),
  classe as (
    select c.cliente_id, c.categoria_codigo, c.descricao, c.conta, p.linha_dre, p.linha_dfc, p.dre_por_titulo,
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
           case when k.conta is not null then k.linha_dfc
                when (k.regra).id is null then 'nao_classificado'
                when (k.regra).entra_dfc then coalesce((k.regra).linha_dfc, 'nao_classificado') end,
           k.conta, date_trunc('month', m.pagamento)::date, m.valor_pago, m.natureza,
           'baixa', m.chave, m.pagamento, m.documento, m.nome, m.cnpj_cpf, coalesce(k.descricao, m.categoria_codigo)
      from mov m
      join classe k on k.cliente_id = m.cliente_id and k.categoria_codigo is not distinct from m.categoria_codigo
     where p_relatorio = 'dfc' and m.pagamento between p_inicio and p_fim and m.valor_pago <> 0
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

-- ---------------------------------------------------------------- relatório por linha (mesmo formato da 097)
create or replace function public.bi_relatorio(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date,
                                               p_eliminar boolean default true)
returns table (codigo text, nome text, ordem integer, subtotal boolean, natureza text, competencia date, valor numeric)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, p_relatorio, p_inicio, p_fim);

  return query
  with recursive
  linhas as (
    select distinct on (l.codigo) l.codigo, l.nome, l.ordem, l.natureza, l.soma
      from bi_linhas l where l.relatorio = p_relatorio and l.ativo and (l.org_id is null or l.org_id = v_org)
     order by l.codigo, (l.org_id is null)
  ),
  fatos as (select f.linha, f.competencia as comp, f.valor as v from app.bi_fatos(p_relatorio, p_clientes, p_inicio, p_fim, p_eliminar) f),
  meses as (
    select generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month')::date as comp
  ),
  analiticas as (
    select l.codigo, ms.comp, coalesce(sum(f.v), 0)::numeric(15,2) as v
      from linhas l cross join meses ms
      left join fatos f on f.linha = l.codigo and f.comp = ms.comp
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

-- ---------------------------------------------------------------- relatório até a conta do plano
-- Uma linha por linha do relatório × conta do plano × mês (só analíticas e com valor). Conta nula = sem conta do
-- plano (regra antiga, não classificado ou lançamento complementar).
create or replace function public.bi_relatorio_contas(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date,
                                                      p_eliminar boolean default true)
returns table (linha text, conta text, nome text, ordem integer, competencia date, valor numeric)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  return query
  select f.linha, f.conta,
         coalesce(p.nome, case when f.origem = 'complementar' then 'Lançamentos complementares' else 'Sem conta do plano' end),
         coalesce(p.ordem, 99999), f.competencia, sum(f.valor)::numeric(15,2)
    from app.bi_fatos(p_relatorio, p_clientes, p_inicio, p_fim, p_eliminar) f
    left join lateral (select x.nome, x.ordem from bi_plano x where x.codigo = f.conta and (x.org_id is null or x.org_id = v_org)
                        order by (x.org_id is null) limit 1) p on true
   group by f.linha, f.conta, 3, 4, f.competencia, (f.origem = 'complementar')
  having sum(f.valor) <> 0
   order by 4, f.conta, f.competencia;
end $$;

-- ---------------------------------------------------------------- de onde veio um valor (notas e títulos)
-- p_linha: linha analítica do relatório; p_conta: conta do plano (opcional; '-' = sem conta); p_mes: um mês (opcional).
create or replace function public.bi_origem(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date,
                                            p_eliminar boolean, p_linha text, p_conta text default null, p_mes date default null)
returns table (empresa text, origem text, data date, documento text, pessoa text, doc text, categoria text, conta text,
               valor numeric)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  if coalesce(p_linha, '') = '' then raise exception 'Escolha a linha do relatório.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'origem_' || p_relatorio || ':' || p_linha, p_inicio, p_fim);
  return query
  select coalesce(nullif(c.nome_fantasia, ''), c.razao_social), f.origem, f.data, f.documento, f.pessoa, f.doc,
         f.categoria, f.conta, f.valor
    from app.bi_fatos(p_relatorio, p_clientes, p_inicio, p_fim, p_eliminar) f
    join clientes c on c.id = f.cliente_id
   where f.linha = p_linha
     and (p_conta is null or (p_conta = '-' and f.conta is null) or f.conta = p_conta)
     and (p_mes is null or f.competencia = date_trunc('month', p_mes)::date)
   order by abs(f.valor) desc, f.data
   limit 5000;
end $$;

-- ---------------------------------------------------------------- categorias sem código: o de-para antigo do Edvaldo
-- Recuperado do 090d pelo nome da categoria; fica "a conferir" até a equipe confirmar na tela de classificação.
insert into public.bi_plano_excecoes (org_id, cliente_id, categoria_codigo, plano_codigo, a_conferir, origem, observacao, alterado_por)
select c.org_id, oc.cliente_id, oc.codigo, x.conta, true, 'de_para_antigo', 'Recuperado do de-para antigo (090d) pelo nome', null
  from omie_categorias oc
  join clientes c on c.id = oc.cliente_id
  join (values
    ('auditorias', '6.2.08'), ('aumento de capital', '9.3.05'), ('c/c socios', '9.3.05'),
    ('cartão de credito a pagar', '9.1.01'), ('demais despesas', '6.2.08'), ('devolução de venda de produtos', '4.1.07'),
    ('irrf s/aplicação financeira', '7.2.24'), ('materia prima para industrialização', '5.1.01'),
    ('prêmios de seguros / sinistros', '3.3.01'), ('protestos', '3.3.01'),
    ('reembolso de pagamento em duplicidade', '9.1.01'), ('reembolso prêmios de seguros (sinistros)', '3.3.01'),
    ('vale transporte', '6.1.04'), ('venda de participações', '9.2.01')
  ) x(nome, conta) on lower(trim(oc.descricao)) = x.nome
 where not coalesce(oc.totalizadora, false)
on conflict (org_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria_codigo) do nothing;

-- ---------------------------------------------------------------- permissões
do $$
declare f text;
begin
  foreach f in array array[
    'public.bi_relatorio(text, uuid[], date, date, boolean)',
    'public.bi_relatorio_contas(text, uuid[], date, date, boolean)',
    'public.bi_origem(text, uuid[], date, date, boolean, text, text, date)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'app.bi_conta(uuid, uuid, text, text)', 'app.bi_plano_conta(uuid, text)', 'app.bi_regra(uuid, uuid, text)',
    'app.bi_fatos(text, uuid[], date, date, boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
