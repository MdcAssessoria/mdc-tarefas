-- =====================================================================================================
--  037 · Societário: processo de empresa que ainda não está no cadastro de clientes
--
--  Pedido do Edvaldo (02/11/2026): numa alteração contratual (ou baixa, transformação…) o HUB obrigava escolher um
--  cliente da base. Empresa que chega para a MDC já precisando de alteração ainda não está cadastrada.
--
--  O banco já aceitava (soc_abrir_processo grava futuro_cliente para qualquer tipo); a tela é que só deixava na abertura.
--  Aqui entra só o que faltava: ligar depois o processo ao cliente, quando a empresa for cadastrada.
--
--  soc_vincular_cliente  liga um processo sem cliente a um cliente ativo da mesma organização (Societário operar).
--                        Leva junto as tarefas das fases que estavam sem cliente. Fica no histórico e na auditoria.
-- =====================================================================================================

create or replace function public.soc_vincular_cliente(p_proc uuid, p_cliente uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p soc_processos; c clientes;
begin
  select * into p from soc_processos where id = p_proc for update;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if not app.hub_pode(p.org_id, 'societario', 'operar') then raise exception 'Sem permissão para mudar processos societários'; end if;
  if p.cliente_id is not null then raise exception 'Este processo já está ligado a um cliente'; end if;
  select * into c from clientes where id = p_cliente;
  if c.id is null or c.org_id <> p.org_id then raise exception 'Cliente não encontrado'; end if;
  if not c.ativo then raise exception 'Este cliente está inativo; reative antes de ligar ao processo'; end if;

  update soc_processos
     set cliente_id = c.id,
         cnpj = coalesce(nullif(trim(cnpj), ''), c.cnpj),
         uf = coalesce(nullif(trim(uf), ''), c.uf),
         atualizado_em = now()
   where id = p.id;
  update tarefas set cliente_id = c.id
   where cliente_id is null and id in (select tarefa_id from soc_fases where processo_id = p.id and tarefa_id is not null);
  perform app.soc_evento(p.id, 'status', 'Processo ligado ao cliente: ' || coalesce(c.nome_fantasia, c.razao_social), false);
  perform app.registrar(p.org_id, 'societario', 'vincular_cliente', p.id::text,
    jsonb_build_object('futuro_cliente', p.futuro_cliente), jsonb_build_object('cliente', c.id));
end $$;
revoke all on function public.soc_vincular_cliente(uuid, uuid) from public, anon;
grant execute on function public.soc_vincular_cliente(uuid, uuid) to authenticated;
comment on function public.soc_vincular_cliente(uuid, uuid) is
  'Liga um processo societário aberto para empresa fora do cadastro a um cliente ativo (Societário operar); fica no histórico.';
