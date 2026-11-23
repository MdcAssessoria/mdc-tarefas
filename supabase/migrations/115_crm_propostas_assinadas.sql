-- =====================================================================
--  115 · CRM: propostas em PDF que já saem assinadas ao baixar (23/11/2026)
--  A proposta é anexada na ficha da oportunidade (hub_arquivos, app
--  'comercial', ref_id = oportunidade) pelo armazenamento que o HUB já usa.
--  Ao baixar, a Função Edge proposta-pdf carimba e assina o PDF com o
--  certificado A1 da organização (o mesmo do demonstrativo) e registra no
--  histórico da oportunidade o tipo novo 'proposta' (só o sistema grava).
-- =====================================================================

alter table public.crm_atividades drop constraint if exists crm_atividades_tipo_check;
alter table public.crm_atividades add constraint crm_atividades_tipo_check
  check (tipo in ('nota', 'ligacao', 'reuniao', 'email', 'whatsapp', 'tarefa', 'etapa', 'contrato', 'proposta'));

comment on column public.crm_atividades.tipo is
  'nota, ligacao, reuniao, email, whatsapp, tarefa (à mão); etapa, contrato e proposta (só o sistema: proposta = PDF anexado baixado já assinado, 115).';
