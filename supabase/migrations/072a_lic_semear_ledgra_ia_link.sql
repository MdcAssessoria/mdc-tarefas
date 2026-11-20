-- Licenças: produtos Ledgra IA e Ledgra Link no catálogo do Ledgra.
-- Aplicada direto em produção em 13/11/2026 como "lic_semear_ledgra_ia_link" (versão 20261113162128) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

CREATE OR REPLACE FUNCTION app.lic_semear_ledgra(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (p_org, 'ledgra-xml', 'Ledgra · XML', 'Captura e guarda dos XML das notas fiscais de entrada e saída', 'ledgra', 260),
    (p_org, 'ledgra-ia', 'Ledgra · IA', 'Agente de IA que observa, cataloga e executa as rotinas do escritório com supervisão', 'ledgra', 270),
    (p_org, 'ledgra-link', 'Ledgra · Link', 'Integração bancária: cobranças por boleto e Pix, retorno e baixa automáticos', 'ledgra', 280)
  on conflict (org_id, slug) do update set sistema = 'ledgra';
end $function$;