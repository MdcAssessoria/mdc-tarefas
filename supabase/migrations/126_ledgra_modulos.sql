-- =====================================================================================================
--  126 · Ledgra Varredura na licença e "Módulos do Ledgra" no HUB (27/11/2026, pedido do Edvaldo: "a varredura
--        deverá ser um módulo à parte"; "do HUB MDC eu preciso habilitar acesso para chamar os módulos XML, Auditor,
--        Legislação e Varredura"; "conectar aos clientes que estão no HUB da MDC")
--
--  1  Produto ledgra-varredura (módulo "varredura" na chave do Ledgra; lic_ledgra_validar devolve o slug sem
--     "ledgra-"). Par no Ledgra: migração 20261902.
--  2  Ferramenta ledgra_modulos (Pessoas e acessos): quem tem "ver" abre a tela Módulos do Ledgra, com os botões que
--     entram direto no XML, Auditor, Legislação e Varredura. Quem decide o que a pessoa abre lá dentro é o Ledgra
--     (licença e acesso do mesmo e-mail). Função de borda ledgra-entrar confere por ledgra_entrada_pode.
--  3  integracao_clientes_carteira: a carteira inteira da MDC (ativos e inativos com CNPJ) para o Ledgra, pela
--     hub-integracao (ação clientes_carteira, só service_role). O Ledgra compara com a conta da MDC e só grava quando
--     o administrador confirma.
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
    (p_org, 'ledgra-integracoes', 'Ledgra · Integrações', 'Traz os dados de outros sistemas (Domínio, SAP Business One) para o Ledgra, com o de-para guardado por sistema', 'ledgra', 340),
    (p_org, 'ledgra-varredura', 'Ledgra · Varredura', 'Confere na Receita (Integra Contador) o que cada cliente entregou e pagou, dá baixa na agenda de obrigações e avisa o que falta', 'ledgra', 350)
  on conflict (org_id, slug) do update set sistema = 'ledgra';
end $$;
revoke all on function app.lic_semear_ledgra(uuid) from public, anon, authenticated;

select app.lic_semear_ledgra(id) from public.organizacoes;

insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem)
values ('ledgra_modulos', 'Módulos do Ledgra',
        'Entrada direta no Ledgra XML, Auditor, Legislação e Varredura com o mesmo e-mail',
        'externo', '/ledgra-modulos', 'ativo', false, 33)
on conflict (slug) do update set nome = excluded.nome, descricao = excluded.descricao, icone = excluded.icone,
  rota = excluded.rota, status = excluded.status, externo = excluded.externo, ordem = excluded.ordem;

create or replace function public.ledgra_entrada_pode(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and app.hub_pode(p_org, 'ledgra_modulos', 'ver')
$$;
revoke all on function public.ledgra_entrada_pode(uuid) from public, anon;
grant execute on function public.ledgra_entrada_pode(uuid) to authenticated;
comment on function public.ledgra_entrada_pode(uuid) is
  'A Função ledgra-entrar confere se quem chamou pode abrir os módulos do Ledgra pelo HUB (Módulos do Ledgra › ver, 126).';

create or replace function public.integracao_clientes_carteira()
returns table (id uuid, razao_social text, nome_fantasia text, cnpj text, regime text, cidade text, uf text,
               segmento text, ativo boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select o.id into v_org from organizacoes o where o.slug = 'mdc';
  if v_org is null then return; end if;
  return query
    select c.id, c.razao_social, c.nome_fantasia, regexp_replace(c.cnpj, '\D', '', 'g'), c.regime::text, c.cidade,
           c.uf, c.segmento::text, c.ativo
      from clientes c
     where c.org_id = v_org and length(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')) = 14
     order by c.razao_social;
end $$;
revoke all on function public.integracao_clientes_carteira() from public, anon, authenticated;
grant execute on function public.integracao_clientes_carteira() to service_role;
comment on function public.integracao_clientes_carteira() is
  'Carteira de clientes da MDC (com CNPJ, ativos e inativos) para a conta da MDC no Ledgra, pela Função hub-integracao '
  '(ação clientes_carteira, só service_role, 126).';
