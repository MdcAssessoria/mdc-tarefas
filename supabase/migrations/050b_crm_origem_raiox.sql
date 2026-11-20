-- CRM: origem 'raiox' nas oportunidades.
-- Aplicada direto em produção em 04/11/2026 como "crm_origem_raiox" (versão 20261104175437) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

alter table public.crm_oportunidades drop constraint crm_oportunidades_origem_check;
alter table public.crm_oportunidades add constraint crm_oportunidades_origem_check
  check (origem = any (array['simulador','indicacao','site','whatsapp','instagram','evento','outro','raiox']));