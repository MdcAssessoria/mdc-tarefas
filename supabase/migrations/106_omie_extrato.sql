-- 106 · Omie: movimentos do extrato de cada conta corrente (decisão do Edvaldo, 21/11/2026). O BI só trazia contas a
-- pagar/receber (ListarMovimentos); transferências, tarifas, antecipações e pagamentos lançados direto na conta corrente
-- ficavam de fora e o fluxo de caixa não fechava com os bancos (Grupo Clara, out–nov/2026: R$ 868 mil de diferença).
-- A omie-sincronizar já chama ListarExtrato para os saldos (105); agora grava também os movimentos de cada mês pedido.
-- Esta etapa só guarda os dados; a entrada no fluxo de caixa (só o que não veio de título) vem na migração seguinte,
-- depois de conferir os campos reais do Omie.

create table if not exists public.omie_extrato (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  org_id uuid not null,
  conta_corrente text not null,
  lancamento text not null,
  mes date not null check (mes = date_trunc('month', mes)::date),
  data date,
  valor numeric(15,2),
  natureza text,
  categoria_codigo text,
  origem text,
  codigo_titulo text,
  documento text,
  pessoa text,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, conta_corrente, lancamento)
);
create index if not exists omie_extrato_mes on public.omie_extrato (cliente_id, mes);
comment on table public.omie_extrato is 'Movimentos do extrato de cada conta corrente do Omie (ListarExtrato), por mês (106). Gravado só pela função omie-sincronizar; o mês pedido é regravado inteiro a cada rodada.';
alter table public.omie_extrato enable row level security;
revoke all on public.omie_extrato from anon, authenticated;
grant select on public.omie_extrato to authenticated;
drop policy if exists omie_extrato_ver on public.omie_extrato;
create policy omie_extrato_ver on public.omie_extrato for select to authenticated using ((select app.bi_pode_ver(cliente_id)));
