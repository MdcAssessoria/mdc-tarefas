-- =====================================================================================================
--  072 · Ledgra Legislação e Ledgra XML como módulos próprios da licença do Ledgra (pedido do Edvaldo, 13/11/2026)
--
--  A base de legislação (pesquisa, biblioteca, códigos, NCM/TIPI, tabelas de ICMS, consultas e novidades) saiu do
--  Ledgra Auditor e virou o produto ledgra-legislacao (módulo "legislacao" na chave do Ledgra). O Auditor fica com
--  SPED, conferência fiscal, créditos e agenda; quem contrata o Auditor continua usando a Legislação (o Ledgra libera
--  junto, porque as ocorrências citam a lei). Entra também o ledgra-xml (módulo "xml": captura e guarda dos XML), que
--  o Ledgra já aceitava e ainda não estava em Produtos e planos.
--  lic_ledgra_validar não muda: devolve o slug sem "ledgra-" (legislacao, xml).
-- =====================================================================================================

create or replace function app.lic_semear_ledgra(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into lic_produtos (org_id, slug, nome, descricao, sistema, ordem)
  values
    (p_org, 'ledgra-financeiro', 'Ledgra · Financeiro', 'Contas a pagar e a receber, bancos, conciliação do extrato e resultados', 'ledgra', 200),
    (p_org, 'ledgra-compras', 'Ledgra · Compras e notas de entrada', 'Solicitação, cotação, pedido com aprovação, recebimento e XML das notas de compra', 'ledgra', 210),
    (p_org, 'ledgra-vendas', 'Ledgra · Vendas e notas de saída', 'Pedido de venda e emissão de NF-e e NFS-e', 'ledgra', 220),
    (p_org, 'ledgra-estoque', 'Ledgra · Estoque', 'Depósitos, lotes e validade, transferências e posição do estoque', 'ledgra', 230),
    (p_org, 'ledgra-producao', 'Ledgra · Produção', 'Estrutura de produto, ordens de produção e baixa da produção com IA', 'ledgra', 240),
    (p_org, 'ledgra-auditor', 'Ledgra · Auditor', 'Auditoria de SPED, conferência fiscal, recuperação de créditos e agenda de obrigações (inclui a Legislação)', 'ledgra', 250),
    (p_org, 'ledgra-legislacao', 'Ledgra · Legislação', 'Pesquisa de legislação, NCM/TIPI, tabelas de ICMS, códigos fiscais e consultas', 'ledgra', 255),
    (p_org, 'ledgra-xml', 'Ledgra · XML', 'Captura e guarda dos XML das notas fiscais de entrada e saída', 'ledgra', 260)
  on conflict (org_id, slug) do update set sistema = 'ledgra';
end $$;
revoke all on function app.lic_semear_ledgra(uuid) from public, anon, authenticated;

select app.lic_semear_ledgra(id) from public.organizacoes;

-- a descrição antiga do Auditor dizia "Base de legislação"; troca só se a MDC não tiver mudado o texto
update public.lic_produtos
   set descricao = 'Auditoria de SPED, conferência fiscal, recuperação de créditos e agenda de obrigações (inclui a Legislação)'
 where slug = 'ledgra-auditor' and descricao = 'Base de legislação, NCM/TIPI e auditoria de SPED';
