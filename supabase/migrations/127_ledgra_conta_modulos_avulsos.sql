-- =====================================================================================================
--  127 · Conta própria no Ledgra para quem comprou só módulos avulsos (28/11/2026, pedido do Edvaldo: "uma vez que
--        no HUB é ligado um novo cliente e ele só comprou o XML e o Cofre como pacote, precisa ter seu acesso único
--        sem passar pelo Ledgra ERP"; "o mesmo ocorre com os demais módulos (Legislação, Raio-X, Auditor)").
--        Decisões dele: senha provisória mostrada no HUB; feito dos dois lados. Par no Ledgra: migração 20261737
--        (PR #244, rota /api/public/hub/conta).
--
--  1  Produto ledgra-cofre no semeador (já existia na MDC, cadastrado pela tela; agora vale para toda organização).
--  2  lic_ledgra_conta_preparar(contrato): confere a licença (Ledgra, ativa, pacote só de módulos avulsos, cliente
--     com CNPJ e não bloqueado), gera a chave nova do Ledgra e devolve os dados que a Função ledgra-conta manda ao
--     Ledgra. Quem pode: Licenças › operar (o mesmo de gerar a chave). Registra em auditoria.
--  3  Módulos do Ledgra: o texto do app passa a citar todos os módulos que entram direto.
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
    (p_org, 'ledgra-varredura', 'Ledgra · Varredura', 'Confere na Receita (Integra Contador) o que cada cliente entregou e pagou, dá baixa na agenda de obrigações e avisa o que falta', 'ledgra', 350),
    (p_org, 'ledgra-cofre', 'Ledgra · Cofre', 'Senhas de portais, procurações e certificados digitais dos clientes, com registro de cada acesso', 'ledgra', 360)
  on conflict (org_id, slug) do update set sistema = 'ledgra';
end $$;
revoke all on function app.lic_semear_ledgra(uuid) from public, anon, authenticated;

select app.lic_semear_ledgra(id) from public.organizacoes;

create or replace function public.lic_ledgra_conta_preparar(p_contrato uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_k lic_contratos; v_cli clientes; v_mods text[]; v_fora text[]; v_chave text; v_cnpj text;
  c_avulsos constant text[] := array['xml', 'auditor', 'legislacao', 'cofre', 'raiox', 'entrega', 'integracoes', 'varredura'];
begin
  select * into v_k from lic_contratos where id = p_contrato;
  if v_k.id is null then raise exception 'Licença não encontrada'; end if;
  if not app.hub_pode(v_k.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para criar o acesso no Ledgra'; end if;
  if v_k.sistema <> 'ledgra' then raise exception 'Esta licença não é do Ledgra'; end if;
  if v_k.situacao <> 'ativo' then raise exception 'A licença precisa estar ativa para criar o acesso'; end if;
  if v_k.modalidade = 'full' then
    raise exception 'Licença full usa o Ledgra completo: gere a chave e cole no Ledgra ERP';
  end if;
  select coalesce(array_agg(distinct replace(pr.slug, 'ledgra-', '') order by replace(pr.slug, 'ledgra-', '')), '{}')
    into v_mods
    from lic_contrato_produtos cp join lic_produtos pr on pr.id = cp.produto_id and pr.sistema = 'ledgra'
   where cp.contrato_id = v_k.id;
  if cardinality(v_mods) = 0 then raise exception 'A licença não tem módulo do Ledgra'; end if;
  select array_agg(m) into v_fora from unnest(v_mods) m where not (m = any (c_avulsos));
  if v_fora is not null then
    raise exception 'A licença tem módulo do Ledgra ERP (%): use a chave no Ledgra completo', array_to_string(v_fora, ', ');
  end if;
  select * into v_cli from clientes where id = v_k.cliente_id;
  v_cnpj := regexp_replace(coalesce(v_cli.cnpj, ''), '\D', '', 'g');
  if length(v_cnpj) <> 14 then raise exception 'Cadastre o CNPJ do cliente antes de criar o acesso'; end if;
  if app.cliente_bloqueado(v_cli.id) then raise exception 'Cliente bloqueado: desbloqueie antes de criar o acesso'; end if;
  v_chave := app.lic_chave_nova(v_cli.id, 'ledgra', 'Chave nova gerada ao criar o acesso direto aos módulos');
  perform app.registrar(v_k.org_id, 'licencas', 'criar_acesso_ledgra', v_k.id::text, null,
    jsonb_build_object('cliente', v_cli.id, 'modulos', to_jsonb(v_mods)));
  return jsonb_build_object(
    'cnpj', v_cnpj,
    'razao_social', v_cli.razao_social,
    'nome_fantasia', coalesce(v_cli.nome_fantasia, ''),
    'uf', coalesce(v_cli.uf, ''),
    'municipio', coalesce(v_cli.cidade, ''),
    'regime', case when v_cli.regime in ('simples', 'presumido', 'real') then v_cli.regime else 'simples' end,
    'atividade', case v_cli.segmento when 'industria' then 'industria' when 'comercio' then 'comercio' else 'servico' end,
    'chave', v_chave,
    'modulos', to_jsonb(v_mods));
end $$;
revoke all on function public.lic_ledgra_conta_preparar(uuid) from public, anon;
grant execute on function public.lic_ledgra_conta_preparar(uuid) to authenticated;
comment on function public.lic_ledgra_conta_preparar(uuid) is
  'Licenças › operar: confere a licença de módulos avulsos do Ledgra, gera a chave nova e devolve os dados que a Função '
  'ledgra-conta manda ao Ledgra para criar a conta própria do cliente (127).';

update public.hub_apps
   set descricao = 'Entrada direta no Ledgra XML, Auditor, Legislação, Varredura, Raio-X, Entrega, Integrações e Cofre com o mesmo e-mail'
 where slug = 'ledgra_modulos';
