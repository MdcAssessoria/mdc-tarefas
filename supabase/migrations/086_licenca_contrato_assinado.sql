-- =====================================================================================================
--  086 · Contrato de licença: arquivo assinado e aviso de assinatura (continuação da 085, 15/11/2026)
--
--  1. Contrato assinado em papel: o arquivo escaneado (PDF ou foto) fica guardado junto do contrato. Os arquivos ficam
--     no Storage na pasta "licencas-contrato" e só quem tem a permissão de valores das licenças (gerir) lê ou envia,
--     porque o contrato traz o preço (app.arquivo_pode ganha esse caso).
--  2. Quando o cliente assina pelo link, quem emitiu o contrato e os administradores recebem o aviso no sino.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- arquivos do contrato (gerir)
create or replace function app.arquivo_pode(p_org uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select app.papel(p_org) is not null and app.papel(p_org) <> 'tv' and case p_app
    when 'chat' then app.hub_pode(p_org, 'atendimento', p_min)
    when 'portal' then app.hub_pode(p_org, 'atendimento', p_min) or app.hub_pode(p_org, 'tarefas', p_min)
    -- contrato de licença assinado (086): traz o preço, então só com a permissão de valores das licenças
    when 'licencas-contrato' then app.hub_pode(p_org, 'licencas', 'gerir')
    else app.hub_pode(p_org, p_app, p_min)
  end
$$;
revoke all on function app.arquivo_pode(uuid, text, text) from public, anon;
grant execute on function app.arquivo_pode(uuid, text, text) to authenticated;

alter table public.lic_contrato_documentos add column if not exists arquivo_id uuid references public.hub_arquivos(id) on delete set null;
comment on column public.lic_contrato_documentos.arquivo_id is 'Arquivo do contrato assinado (escaneado), em hub_arquivos com app = licencas-contrato.';
grant select (arquivo_id) on public.lic_contrato_documentos to authenticated;

/** O arquivo precisa ser do mesmo contrato (pasta licencas-contrato, ref = o contrato emitido). */
create or replace function app.lic_documento_arquivo_confere(p_doc public.lic_contrato_documentos, p_arquivo uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_arquivo is null then return; end if;
  if not exists (select 1 from hub_arquivos a where a.id = p_arquivo and a.org_id = p_doc.org_id
                    and a.app = 'licencas-contrato' and a.ref_id = p_doc.id) then
    raise exception 'O arquivo enviado não é deste contrato. Envie o arquivo de novo.';
  end if;
end $$;
revoke all on function app.lic_documento_arquivo_confere(public.lic_contrato_documentos, uuid) from public, anon, authenticated;

-- registrar a assinatura em papel agora aceita o arquivo assinado (opcional)
drop function if exists public.lic_documento_assinatura_registrar(uuid, date, text);
create or replace function public.lic_documento_assinatura_registrar(p_doc uuid, p_data date, p_observacao text default null, p_arquivo uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos;
begin
  select * into d from lic_contrato_documentos where id = p_doc for update;
  if d.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(d.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para registrar a assinatura'; end if;
  if d.situacao not in ('emitido', 'enviado') then raise exception 'Este contrato não está esperando assinatura'; end if;
  if p_data is null then raise exception 'Informe a data em que o cliente assinou'; end if;
  if p_data > app.hoje(d.org_id) then raise exception 'A data da assinatura não pode ser depois de hoje'; end if;
  if p_data < (d.emitido_em at time zone 'America/Sao_Paulo')::date then raise exception 'A data da assinatura não pode ser antes da emissão do contrato'; end if;
  perform app.lic_documento_arquivo_confere(d, p_arquivo);
  update lic_contrato_documentos
     set situacao = 'assinado', assinado_em = now(), link_hash = null, link_expira_em = null,
         arquivo_id = coalesce(p_arquivo, arquivo_id),
         assinatura = jsonb_build_object('tipo', 'impresso', 'data', p_data, 'observacao', nullif(trim(coalesce(p_observacao, '')), ''),
                                         'registrado_por', auth.uid())
   where id = p_doc;
  perform app.registrar(d.org_id, 'licencas', 'assinatura_contrato', p_doc::text, null,
    jsonb_build_object('numero', d.numero, 'tipo', 'impresso', 'arquivo', p_arquivo));
end $$;

-- anexar (ou trocar) o arquivo assinado depois
create or replace function public.lic_documento_anexar(p_doc uuid, p_arquivo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos;
begin
  select * into d from lic_contrato_documentos where id = p_doc for update;
  if d.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(d.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para anexar o contrato assinado'; end if;
  if d.situacao = 'cancelado' then raise exception 'Este contrato foi cancelado'; end if;
  if p_arquivo is null then raise exception 'Escolha o arquivo do contrato assinado'; end if;
  perform app.lic_documento_arquivo_confere(d, p_arquivo);
  update lic_contrato_documentos set arquivo_id = p_arquivo where id = p_doc;
  perform app.registrar(d.org_id, 'licencas', 'anexar_contrato', p_doc::text, jsonb_build_object('arquivo', d.arquivo_id),
    jsonb_build_object('numero', d.numero, 'arquivo', p_arquivo));
end $$;

-- ------------------------------------------------------------------------------------- aviso no sino
create or replace function app.lic_avisar_assinatura(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos; v_cli text; u uuid;
begin
  select * into d from lic_contrato_documentos where id = p_doc;
  if d.id is null then return; end if;
  select c.razao_social into v_cli from lic_contratos k join clientes c on c.id = k.cliente_id where k.id = d.contrato_id;
  for u in
    select distinct x from (
      select d.emitido_por as x
      union all
      select m.user_id from membros m where m.org_id = d.org_id and m.ativo and m.papel::text = 'admin') s
    where x is not null
  loop
    perform app.notificar(d.org_id, u, 'licencas', 'Contrato assinado: ' || d.numero,
      coalesce(v_cli, 'O cliente') || ' assinou o contrato de licença pelo link.', '/licencas/contratos');
  end loop;
end $$;
revoke all on function app.lic_avisar_assinatura(uuid) from public, anon, authenticated;

create or replace function public.lic_assinatura_aceitar(p_token text, p_nome text, p_cpf text, p_concordo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos; v_cab json; v_ip text; v_ua text; v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then raise exception 'Link inválido. Peça um link novo à MDC.'; end if;
  select * into d from lic_contrato_documentos where link_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if d.id is null then raise exception 'Link inválido. Peça um link novo à MDC.'; end if;
  if d.situacao = 'assinado' then raise exception 'Este contrato já foi assinado.'; end if;
  if d.situacao <> 'enviado' then raise exception 'Este contrato não está mais esperando assinatura.'; end if;
  if d.link_expira_em < now() then raise exception 'O link venceu. Peça um link novo à MDC.'; end if;
  if d.link_tentativas >= 10 then raise exception 'Muitas tentativas com CPF errado. Peça um link novo à MDC.'; end if;
  if not coalesce(p_concordo, false) then raise exception 'Marque "Li e concordo" para assinar.'; end if;
  if array_length(regexp_split_to_array(trim(coalesce(p_nome, '')), '\s+'), 1) < 2 then raise exception 'Escreva o seu nome completo.'; end if;
  if v_cpf <> d.signatario->>'cpf' then
    -- devolve o erro em vez de levantar exceção, para a tentativa errada ficar gravada (exceção desfaria o update)
    update lic_contrato_documentos set link_tentativas = link_tentativas + 1 where id = d.id;
    return jsonb_build_object('ok', false, 'erro', 'O CPF não confere com o de quem foi indicado para assinar este contrato.',
                              'restam', greatest(0, 9 - d.link_tentativas));
  end if;
  begin v_cab := current_setting('request.headers', true)::json; exception when others then v_cab := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_cab->>'x-forwarded-for', v_cab->>'x-real-ip', ''), ',', 1)), '');
  v_ua := left(nullif(v_cab->>'user-agent', ''), 300);
  update lic_contrato_documentos
     set situacao = 'assinado', assinado_em = now(), link_expira_em = null,
         assinatura = jsonb_build_object('tipo', 'eletronico', 'nome', trim(p_nome), 'cpf', v_cpf, 'ip', v_ip,
                                         'navegador', v_ua, 'em', now())
   where id = d.id;
  perform app.registrar(d.org_id, 'licencas', 'assinatura_contrato', d.id::text, null,
    jsonb_build_object('numero', d.numero, 'tipo', 'eletronico', 'ip', v_ip));
  perform app.lic_avisar_assinatura(d.id);
  return jsonb_build_object('ok', true, 'numero', d.numero);
end $$;

revoke all on function public.lic_documento_assinatura_registrar(uuid, date, text, uuid), public.lic_documento_anexar(uuid, uuid)
  from public, anon;
grant execute on function public.lic_documento_assinatura_registrar(uuid, date, text, uuid), public.lic_documento_anexar(uuid, uuid)
  to authenticated;
revoke all on function public.lic_assinatura_aceitar(text, text, text, boolean) from public;
grant execute on function public.lic_assinatura_aceitar(text, text, text, boolean) to anon, authenticated;
