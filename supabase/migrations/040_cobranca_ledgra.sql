-- =====================================================================================================
--  040 · Licenças vira Cobrança Ledgra
--
--  Decisão do Edvaldo (02/11/2026): o HUB deixa de vender módulos aos clientes; o produto para os clientes passa a ser
--  o Ledgra, desenvolvido do zero (sistema à parte). Os módulos de gestão (Financeiro, Entradas, Saídas, Estoque,
--  Centros de custo, Plano de contas, Relatórios) continuam ativos, mas só para a gestão da própria MDC.
--  Do Ledgra, só a cobrança dos assinantes fica no HUB, no grupo Gestão: é o antigo módulo Licenças (contratos,
--  mensalidades, baixas e inadimplentes), com os produtos e planos do Ledgra cadastrados em Produtos e planos.
--
--  Só dados: muda o nome e a descrição do módulo (o código "licencas" e as regras de acesso não mudam) e tira das vendas
--  novas os produtos que eram os módulos do HUB (inativar, nada se apaga; não há contrato com eles).
-- =====================================================================================================

update public.hub_apps
   set nome = 'Cobrança Ledgra',
       descricao = 'Assinaturas do Ledgra: contratos, mensalidades, recebimentos e inadimplentes',
       status = 'ativo'
 where slug = 'licencas';

update public.lic_produtos set ativo = false
 where slug in ('financeiro', 'entradas', 'saidas', 'estoque', 'centros_custo', 'plano_contas', 'relatorios')
   and ativo
   and not exists (select 1 from public.lic_contrato_produtos cp join public.lic_contratos k on k.id = cp.contrato_id
                    where cp.produto_id = lic_produtos.id and k.situacao = 'ativo');
update public.lic_planos set ativo = false
 where ativo and not exists (select 1 from public.lic_contratos k where k.plano_id = lic_planos.id and k.situacao = 'ativo');
