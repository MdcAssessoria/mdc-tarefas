-- =====================================================================================================
--  060 · Cobrança Ledgra fora do menu e grupo Gestão reorganizado
--
--  Decisão do Edvaldo (05/11/2026): o Ledgra cuida dos clientes dele e tem a própria cobrança. No HUB fica o controle
--  das licenças vendidas (Contratos › Receita por sistema, 059). Por isso:
--
--   1  A Cobrança Ledgra (ferramenta `licencas`) fica "desligada" no catálogo: sai do menu, a Guarda barra as rotas.
--      Nada se apaga (tabelas lic_*, link_* e as regras do banco continuam); para religar, volte o status para 'ativo'.
--   2  Ordem do grupo Gestão: Financeiro, Contratos e Relatórios (o dia a dia) e depois os cadastros de apoio (Centros
--      de custo e Plano de contas; Fornecedores e clientes entra entre os dois blocos, pela tela). Os módulos
--      desligados vão para o fim da lista.
--
--  Só dados (hub_apps); nenhuma função muda.
-- =====================================================================================================

update public.hub_apps set status = 'desligado' where slug = 'licencas' and status <> 'desligado';

update public.hub_apps a set ordem = x.ordem
  from (values ('financeiro', 35), ('contratos', 36), ('relatorios', 37), ('centros_custo', 38), ('plano_contas', 39),
               ('entradas', 91), ('saidas', 92), ('estoque', 93), ('licencas', 94)) as x(slug, ordem)
 where a.slug = x.slug and a.ordem is distinct from x.ordem;
