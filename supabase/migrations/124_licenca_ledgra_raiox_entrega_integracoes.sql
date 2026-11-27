-- =====================================================================================================
--  124 · Ledgra Raio-X, Ledgra Entrega e Ledgra Integrações como módulos próprios da licença do Ledgra
--        (fase 1.1 do plano da Fase 1 do Ledgra, issue #212 do ledgra-mdc; liberada pelo Edvaldo em 27/11/2026)
--
--  Os três passam a ser vendidos à parte, como XML, Auditor e Legislação: entram em Produtos e planos como
--  ledgra-raiox, ledgra-entrega e ledgra-integracoes (módulos "raiox", "entrega" e "integracoes" na chave do Ledgra;
--  lic_ledgra_validar não muda: devolve o slug sem "ledgra-"). Contrato "Ledgra full" recebe os três, como todo módulo
--  novo do Ledgra. Par no Ledgra: migração 20261732 (PR #219).
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
    (p_org, 'ledgra-xml', 'Ledgra · XML', 'Captura e guarda dos XML das notas fiscais de entrada e saída', 'ledgra', 260),
    (p_org, 'ledgra-ia', 'Ledgra · IA', 'Agente de IA que observa, cataloga e executa as rotinas do escritório com supervisão', 'ledgra', 270),
    (p_org, 'ledgra-link', 'Ledgra · Link', 'Integração bancária: cobranças por boleto e Pix, retorno e baixa automáticos', 'ledgra', 280),
    (p_org, 'ledgra-ponto', 'Ledgra · Ponto', 'Registro de ponto REP-P (Portaria 671): celular, navegador ou quiosque, comprovante e arquivo AFD; vendido também sem o DP', 'ledgra', 290),
    (p_org, 'ledgra-dp', 'Ledgra · DP', 'Departamento Pessoal operado pela empresa: ficha, admissão com eSocial e, nas próximas fases, folha e guias', 'ledgra', 300),
    (p_org, 'ledgra-juridico', 'Ledgra · Jurídico', 'Processos da empresa (ré ou autora), prazos e audiências, valores e provisões pelo CPC 25 na contabilidade', 'ledgra', 310),
    (p_org, 'ledgra-raiox', 'Ledgra · Raio-X', 'Diagnóstico tributário com os dados oficiais da Receita (Integra Contador): o que a empresa paga hoje e como fica com a reforma', 'ledgra', 320),
    (p_org, 'ledgra-entrega', 'Ledgra · Entrega', 'Agenda das obrigações, transmissão pelo Integra Contador, recibos e guias de cada empresa num lugar só', 'ledgra', 330),
    (p_org, 'ledgra-integracoes', 'Ledgra · Integrações', 'Traz os dados de outros sistemas (Domínio, SAP Business One) para o Ledgra, com o de-para guardado por sistema', 'ledgra', 340)
  on conflict (org_id, slug) do update set sistema = 'ledgra';
end $$;
revoke all on function app.lic_semear_ledgra(uuid) from public, anon, authenticated;

select app.lic_semear_ledgra(id) from public.organizacoes;
