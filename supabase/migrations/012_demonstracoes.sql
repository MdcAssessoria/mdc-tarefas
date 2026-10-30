-- 012 · Demonstrações (Balanço, DFC, cruzamento DRE × DFC) e período do balancete
alter table public.portal_balancetes
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fim date,
  add column if not exists demonstracoes jsonb;
