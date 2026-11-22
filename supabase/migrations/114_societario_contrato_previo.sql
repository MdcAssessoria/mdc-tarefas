-- =====================================================================================================
--  114 · Societário: tipo "contrato social prévio" nos documentos da abertura (pedido do Edvaldo, 22/11/2026)
--  Na fase inicial da abertura juntam-se os documentos pessoais, comprovante de endereço, IPTU e a minuta do
--  contrato social. A ficha (112) passa a aceitar o tipo contrato_social_previo; os demais tipos continuam.
-- =====================================================================================================
alter table public.soc_abertura_documentos drop constraint if exists soc_abertura_documentos_tipo_check;
alter table public.soc_abertura_documentos add constraint soc_abertura_documentos_tipo_check
  check (tipo in ('rg_cnh', 'cpf', 'comprovante_residencia', 'certidao_casamento', 'iptu', 'contrato_locacao',
                  'matricula_imovel', 'autorizacao_imovel', 'contrato_social_previo', 'procuracao', 'outro'));
