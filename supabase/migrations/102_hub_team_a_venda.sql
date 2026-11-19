-- 102 · Hub-Team à venda (pedido do Edvaldo, 19/11/2026): o Hub-Team passou a conferir a licença no HUB (migração 079
-- do Hub-Team, como a 070 do EXato). Aqui o HUB ganha os módulos vendáveis do Hub-Team (slug "hub-team-<módulo>", o
-- código do módulo no Hub-Team é o slug sem o prefixo) e o sistema passa de "em breve" para "vendendo".
-- Diárias, operação, transporte e auditoria ficam fora do Hub-Team de vez, por isso não entram.
-- Preço zero: o valor de cada licença ou pacote é a MDC quem fecha (Pacotes de licença / assistente da licença).

create or replace function app.lic_semear_hub_team(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into lic_produtos (org_id, slug, nome, descricao, sistema, ordem)
  values
    (p_org, 'hub-team-rs', 'Hub-Team · Recrutamento e seleção', 'Vagas, funil, banco de talentos e portal do candidato', 'hub-team', 600),
    (p_org, 'hub-team-crm', 'Hub-Team · CRM', 'Prospecção, oportunidades, propostas, aprovações do jurídico e painel da diretoria', 'hub-team', 610),
    (p_org, 'hub-team-contratos', 'Hub-Team · Contratos e preços', 'Contrato por artigos, formação de preço, minuta e assinatura', 'hub-team', 620),
    (p_org, 'hub-team-faturamento', 'Hub-Team · Faturamento', 'Medições, faturas e NFS-e', 'hub-team', 630),
    (p_org, 'hub-team-financeiro', 'Hub-Team · Financeiro', 'Contas a pagar e a receber, bancos, conciliação e contabilidade', 'hub-team', 640),
    (p_org, 'hub-team-compras', 'Hub-Team · Compras', 'Solicitação, cotação e pedido de compra', 'hub-team', 650),
    (p_org, 'hub-team-estoque', 'Hub-Team · Estoque e notas de entrada', 'Depósitos, itens, notas de entrada e notas da SEFAZ', 'hub-team', 660),
    (p_org, 'hub-team-juridico', 'Hub-Team · Jurídico', 'Processos, prazos e audiências, provisões pelo CPC 25', 'hub-team', 670)
  on conflict (org_id, slug) do nothing;
end $$;
revoke all on function app.lic_semear_hub_team(uuid) from public, anon, authenticated;

-- organizações que já existem
select app.lic_semear_hub_team(id) from public.organizacoes;

-- organização nova: semeia depois dos sistemas (aa_org_sistemas roda antes por causa do nome)
create or replace function app.tg_org_hub_team() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.lic_semear_hub_team(new.id);
  return new;
end $$;
revoke all on function app.tg_org_hub_team() from public, anon, authenticated;
drop trigger if exists org_hub_team on public.organizacoes;
create trigger org_hub_team after insert on public.organizacoes for each row execute function app.tg_org_hub_team();

-- o Hub-Team passa a ser vendido
update public.lic_sistemas set situacao = 'vendendo' where slug = 'hub-team' and situacao = 'em_breve';
