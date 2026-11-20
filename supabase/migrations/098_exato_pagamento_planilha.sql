-- 098 · Add-on do EXato vendável pelo HUB: Pagamento de diárias por planilha.
-- O EXato (083) ganha o módulo pagamento_planilha: carga do Excel com diárias e valor por pessoa, cadastro/atualização
-- dos diaristas e do PIX, lote com nome próprio e remessa CNAB 240 PIX. Aqui o HUB só passa a oferecer o produto na
-- licença do EXato (o código do módulo no EXato é o slug sem "exato-").

create or replace function app.lic_semear_exato(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into lic_produtos (org_id, slug, nome, descricao, sistema, ordem)
  values
    (p_org, 'exato-diaristas', 'EXato · Diaristas', 'Cadastro do diarista pelo celular, conferência, biometria e PIX', 'exato', 400),
    (p_org, 'exato-operacao', 'EXato · Operação', 'Pedido do cliente, pré-lista, dobra de diária e tablet do preposto', 'exato', 410),
    (p_org, 'exato-transporte', 'EXato · Transporte', 'Roteirização, embarque e app do motorista', 'exato', 420),
    (p_org, 'exato-auditoria', 'EXato · Auditoria e lotes', 'Auditoria das diárias e lote de pagamento dos diaristas', 'exato', 430),
    (p_org, 'exato-rs', 'EXato · Recrutamento e seleção', 'Vagas, funil, banco de talentos e portal do candidato', 'exato', 440),
    (p_org, 'exato-crm', 'EXato · CRM', 'Prospecção, oportunidades, propostas e aprovações do jurídico', 'exato', 450),
    (p_org, 'exato-contratos', 'EXato · Contratos e preços', 'Contrato por artigos, formação de preço, minuta e assinatura', 'exato', 460),
    (p_org, 'exato-faturamento', 'EXato · Faturamento', 'Medições, faturas e NFS-e', 'exato', 470),
    (p_org, 'exato-financeiro', 'EXato · Financeiro', 'Contas a pagar e a receber, bancos, conciliação e contabilidade', 'exato', 480),
    (p_org, 'exato-pagamento_planilha', 'EXato · Pagamento de diárias por planilha',
     'Carga do Excel com diárias e valor por pessoa, cadastro do PIX, lote nomeado e remessa CNAB 240 (precisa do Financeiro)', 'exato', 485),
    (p_org, 'exato-compras', 'EXato · Compras', 'Solicitação, cotação e pedido de compra', 'exato', 490),
    (p_org, 'exato-estoque', 'EXato · Estoque e notas de entrada', 'Depósitos, itens, notas de entrada e notas da SEFAZ', 'exato', 500),
    (p_org, 'exato-juridico', 'EXato · Jurídico', 'Processos, prazos e audiências, provisões pelo CPC 25', 'exato', 510)
  on conflict (org_id, slug) do nothing;
end $$;
revoke all on function app.lic_semear_exato(uuid) from public, anon, authenticated;
select app.lic_semear_exato(id) from public.organizacoes;
