-- =====================================================================================================
--  050 · Portal do Cliente › Faturas: o cliente vê as faturas da MDC publicadas para ele, com o que precisa para pagar
--
--  Pedido do Edvaldo (03/11/2026, fase 4): o Portal mostra a fatura, a nota fiscal (quando emitida) e o boleto (linha
--  digitável e Pix copia e cola). A 045 já tinha portal_minhas_faturas (só a lista); aqui:
--
--   1  portal_faturas_detalhe(p_cliente): as mesmas faturas de portal_minhas_faturas (publicadas no canal Portal, do
--      próprio cliente, permissão 'documentos'), com os campos do PDF da fatura (envio, código do serviço, ISS), o
--      nome do contrato, os dados do cliente que vão no PDF (nome, CNPJ/CPF, e-mail, cidade/UF do cadastro da MDC), se
--      já foi paga, a NFS-e emitida em produção (número, chave e caminho do XML) e o boleto válido (banco, linha
--      digitável, Pix, vencimento, situação). Nunca as de outro cliente; nada da nota de teste (produção restrita).
--   2  Bucket fiscal: o cliente do Portal lê o XML da NFS-e emitida da fatura publicada para ele (política
--      fis_storage_portal_nfse, pela função app.portal_nfse_pode). Nada mais da pasta da MDC.
--
--  Testes: supabase/testes/109_base_050.sql e 110_portal_faturas_050.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 faturas com detalhe
/** Fatura publicada no Portal para este cliente (canal portal enviado, não cancelada). Sem checar permissão. */
create or replace function app.portal_fatura_publicada(p_fatura uuid, p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fin_faturas f
     where f.id = p_fatura and f.cliente_carteira_id = p_cliente and f.situacao <> 'cancelada'
       and exists (select 1 from fin_envios e where e.fatura_id = f.id and e.canal = 'portal' and e.situacao = 'enviado'))
$$;
revoke all on function app.portal_fatura_publicada(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_faturas_detalhe(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_cliente is null or not app.portal_pode(p_cliente, 'documentos') then
    raise exception 'Sem acesso às faturas deste cliente';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'numero', f.numero, 'competencia', f.competencia, 'emissao', f.emissao, 'vencimento', f.vencimento,
             'valor', f.valor, 'descricao', f.descricao, 'documento', f.documento, 'envio', f.envio, 'situacao', f.situacao,
             'nfse_situacao', f.nfse_situacao, 'nfse_numero', f.nfse_numero, 'boleto_situacao', f.boleto_situacao,
             'servico_codigo', f.servico_codigo, 'iss_aliquota', f.iss_aliquota, 'cancelamento_motivo', null,
             'contrato', k.descricao,
             'paga', t.situacao = 'quitado', 'pago_em', case when t.situacao = 'quitado' then t.quitado_em end,
             'tomador', jsonb_build_object('nome', pe.nome, 'documento', pe.documento, 'email', pe.email, 'cidade', pe.cidade, 'uf', pe.uf),
             'nfse', (select jsonb_build_object('numero', e.numero_nfse, 'chave', e.chave_acesso, 'xml_caminho', e.xml_caminho)
                        from nfse_emissoes e
                       where e.fatura_id = f.id and e.ambiente = 'producao' and e.situacao = 'emitida' and e.xml_caminho is not null
                       limit 1),
             'boleto', (select jsonb_build_object('banco', b.banco, 'linha_digitavel', b.linha_digitavel, 'pix_copia_cola', b.pix_copia_cola,
                                                  'vencimento', b.vencimento, 'valor', b.valor, 'situacao', b.situacao)
                          from fin_fatura_boletos b
                         where b.fatura_id = f.id and b.situacao in ('registrada', 'vencida', 'paga', 'paga_parcial')
                         order by b.tentativa desc limit 1))
           order by f.vencimento desc, f.numero desc)
      from fin_faturas f
      join fin_recorrentes k on k.id = f.recorrente_id
      join fin_titulos t on t.id = f.titulo_id
      left join fin_pessoas pe on pe.id = f.pessoa_id
     where f.cliente_carteira_id = p_cliente and f.situacao <> 'cancelada'
       and exists (select 1 from fin_envios e where e.fatura_id = f.id and e.canal = 'portal' and e.situacao = 'enviado')), '[]');
end $$;
revoke all on function public.portal_faturas_detalhe(uuid) from public, anon;
grant execute on function public.portal_faturas_detalhe(uuid) to authenticated;
comment on function public.portal_faturas_detalhe(uuid) is
  'Portal › Faturas: faturas da MDC publicadas para o próprio cliente (documentos), com dados do PDF, se foi paga, NFS-e emitida e boleto válido (050).';

-- ===================================================================================================== 2 XML da NFS-e no Portal
/** O XML do bucket fiscal é de uma NFS-e emitida (produção) de fatura publicada para um cliente deste login (documentos). */
create or replace function app.portal_nfse_pode(p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from nfse_emissoes e join fin_faturas f on f.id = e.fatura_id
     where e.xml_caminho = p_nome and e.ambiente = 'producao' and e.situacao = 'emitida'
       and f.cliente_carteira_id is not null
       and app.portal_pode(f.cliente_carteira_id, 'documentos')
       and app.portal_fatura_publicada(f.id, f.cliente_carteira_id))
$$;
revoke all on function app.portal_nfse_pode(text) from public, anon;
grant execute on function app.portal_nfse_pode(text) to authenticated;

drop policy if exists fis_storage_portal_nfse on storage.objects;
create policy fis_storage_portal_nfse on storage.objects for select to authenticated
  using (bucket_id = 'fiscal' and (storage.foldername(name))[3] = 'nfse-emitidas' and app.portal_nfse_pode(name));
