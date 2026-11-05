-- =====================================================================================================
--  061 · "Notas fiscais" de volta ao menu (antigo Entradas)
--
--  O Edvaldo não achou onde ver as notas emitidas contra o CNPJ da MDC (05/11/2026): elas estavam em Entradas, que a
--  059 desligou. A ferramenta `entradas` volta, com o nome "Notas fiscais", só com as notas recebidas (NF-e e NFS-e,
--  busca automática), o lançamento no Financeiro, a carga tributária e o certificado (as abas ficam em navegacao.ts;
--  Pedidos de compra continua fora, junto com o Estoque). Ordem do grupo Gestão: Financeiro, Contratos, Notas
--  fiscais, Relatórios, (PN), Centros de custo, Plano de contas.
--
--  Só dados (hub_apps); nenhuma função muda.
-- =====================================================================================================

update public.hub_apps
   set status = 'ativo', nome = 'Notas fiscais',
       descricao = 'Notas emitidas contra o CNPJ da MDC (NF-e e NFS-e) e lançamento no Financeiro'
 where slug = 'entradas';

update public.hub_apps a set ordem = x.ordem
  from (values ('financeiro', 35), ('contratos', 36), ('entradas', 37), ('relatorios', 38), ('centros_custo', 39),
               ('plano_contas', 40)) as x(slug, ordem)
 where a.slug = x.slug and a.ordem is distinct from x.ordem;
