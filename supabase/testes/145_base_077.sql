-- Base simulada para a 077 (contato da MDC pelo MDC · Pessoal): data de criação das organizações (a MDC é a primeira),
-- CNPJ dos clientes, arquivamento das oportunidades e as linhas de exemplo (um cliente da MDC e um lead aberto).
alter table organizacoes add column if not exists criado_em timestamptz not null default now();
update organizacoes set criado_em = '2020-01-01' where id = '00000000-0000-0000-0000-0000000000a1';
alter table clientes add column if not exists cnpj text;
alter table public.crm_oportunidades add column if not exists arquivado_em timestamptz, add column if not exists motivo_arquivo text;
alter table public.crm_atividades add column if not exists autor_id uuid, add column if not exists criado_em timestamptz default now();
insert into clientes (org_id, nome, cnpj, ativo) values ('00000000-0000-0000-0000-0000000000a1', 'Cliente 077', '44.555.666/0001-81', true);
insert into public.crm_oportunidades (org_id, empresa, cnpj, origem) values ('00000000-0000-0000-0000-0000000000a1', 'Lead aberto 077', '77.788.899/0001-83', 'outro');
