-- =====================================================================================================
--  036 · Correções da auditoria independente de 02/11/2026 (banco, arquitetura e telas)
--
--  Provas dos achados: supabase/testes/90_auditoria_036.sql (cada exploração agora termina em erro em português).
--  NÃO APLICAR pela frente: quem aplica é o Edvaldo (ou com a aprovação dele).
--
--   1  (A-01/S-06) app.hub_pode volta à regra estrita da 008 (a ferramenta pedida). Novas regras:
--        app.hub_pode_algum(org, ferramentas[], nível)  equipe com ALGUMA das ferramentas no nível
--        app.gestao_pode(cliente, nível, módulos[])     equipe com algum dos módulos, ou Portal (ver/operar) com a
--                                                        permissão financeiro (ou financeiro_ver só para ver) e
--                                                        contrato ativo de algum dos módulos, sem bloqueio
--        app.fin_pode(cliente, nível)                    LEITURA ('ver') = qualquer módulo de gestão;
--                                                        GRAVAÇÃO = módulos que gravam: financeiro, entradas, saídas, estoque
--      Conjuntos por assunto (decisão desta migração):
--        títulos avulsos, baixas, transferências ............ financeiro
--        notas de entrada (enviar, lançar, desfazer, de-para,
--        manifestar, XML no Storage) ......................... entradas, financeiro
--        pedido de venda .................................... saídas, financeiro   (gatilho em est_pedidos)
--        pedido de compra ................................... entradas, financeiro  (gatilho em est_pedidos)
--        itens, estoques, movimentos, inventário, fotos ...... estoque, financeiro, entradas, saídas (= app.fin_pode)
--        fornecedores/clientes (fin_pessoas) ................ estoque, financeiro, entradas, saídas (= app.fin_pode)
--        plano de contas (importar) e categorias ............ plano_contas, financeiro (só equipe)
--        centros de custo ................................... centros_custo, financeiro (só equipe)
--        relatórios ......................................... só leitura
--      Continuam ESTRITOS em hub_pode(org, 'financeiro', ...): certificado A1 (gerir), regras dos tipos de entrada
--      (gerir), estoque negativo (gerir), importar extrato e desfazer importação (operar), contas bancárias
--      (gravar: operar), parâmetros de notas (operar). Ler contas bancárias e plano: qualquer módulo de gestão.
--      Títulos gerados por nota ou pedido: fin_lancar virou porta de permissão; nota e pedido gravam pela função
--      interna app.fin_lancar_titulos (quem lança nota com "entradas" gera contas a pagar sem precisar do Financeiro).
--      O que NÃO foi separado: est_pedido_salvar continua conferindo app.fin_pode na entrada; a separação venda/compra
--      vale pelo gatilho est_pedido_permissao (toda gravação de pedido passa por ele, inclusive confirmar/cancelar).
--   2  (S-01) Permissões do Portal: lista fechada (app.portal_perm_validas); liberar financeiro/financeiro_ver exige
--      Financeiro (gerir). Vale em portal_convidar e em gravação direta (gatilho em portal_usuarios e portal_convites).
--   3  (S-02/B-03) fis_pode_certificado e app.fis_org_visivel: Portal só com cliente sem bloqueio e contrato de
--      entradas ou financeiro.
--   4  (A-03/S-04) Envio de XML: chave confere (DV módulo 11, CNPJ do emitente, modelo 55/65/57 ou NFS-e de 50
--      dígitos); o modelo vem da chave; "outro" é recusado. Nota capturada da SEFAZ/ADN substitui a enviada à mão
--      ainda não lançada; se já foi lançada, fica aviso na auditoria e no sino dos administradores.
--   5  (M-01..M-06) desfazer nota recalcula o custo médio e trava itens em ordem; cancelamento de nota já lançada
--      avisa e impede pagar o título; título de nota/pedido só muda pelo documento de origem; contrato de licença
--      sem corrida (gatilho trava o cliente); venda faturada só cancela com gerir e motivo citando a nota; saída com
--      data passada não deixa a ficha negativa em nenhuma data.
--   6  (B-02) Portal: permissão nova financeiro_ver (só leitura); financeiro = ver e lançar.
--   7  (B-01/S-07) fotos de itens e envios do Portal: a pasta [1] precisa ser a organização do cliente.
--   8  (B-04) Desfazer importação de extrato marca como desfeita (com motivo) em vez de apagar.
--   9  (B-05/B-06) rotina diária de licenças: encerramento na auditoria, aviso de bloqueio com <= e sem repetir,
--      gera também o mês anterior; app.cliente_tem_modulo exige o módulo ativo.
--  10  (B-07) índices.
--  11  (S-03) fin_lancar/fin_baixar/fin_cancelar_titulo/fin_estornar_baixa devolvem app.fin_interno ao valor anterior.
--  12  (S-10) clientes: sem delete direto; CNPJ não muda se há certificado ou nota fiscal (salvo administrador).
--  13  (S-08) crm_receber_lead: no máximo 20 leads do Simulador por minuto.
--  14  Conversões inválidas (código/data) nas funções novas viram mensagem em português.
--  15  Nada se apaga (auditoria de telas): tarefas, vencimentos, CRM, feriados, perfis de acesso, convites do Portal
--      e clientes perdem o DELETE (política e grant) e ganham gatilho que recusa apagar; no lugar:
--      tarefa_cancelar, venc_encerrar, crm_arquivar (já existia), feriado_inativar, hub_inativar_perfil,
--      portal_cancelar_convite (todos com motivo e auditoria). A única exclusão que continua é a do convite do
--      Portal já usado (app.aplicar_convites_portal, ao criar a conta), marcada pelo próprio banco.
-- =====================================================================================================

-- ===================================================================================================== 14 auxiliares
/** Texto → uuid com mensagem clara (nulo ou vazio = nulo). */
create or replace function app.uuid_campo(p_txt text, p_campo text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if nullif(trim(p_txt), '') is null then return null; end if;
  return trim(p_txt)::uuid;
exception when invalid_text_representation then
  raise exception 'O campo "%" veio com um código inválido; escolha de novo na lista', p_campo;
end $$;
revoke all on function app.uuid_campo(text, text) from public, anon, authenticated;

/** Texto → data com mensagem clara (nulo ou vazio = nulo). */
create or replace function app.data_campo(p_txt text, p_campo text)
returns date language plpgsql stable set search_path = '' as $$
begin
  if nullif(trim(p_txt), '') is null then return null; end if;
  return trim(p_txt)::date;
exception when others then
  raise exception 'Data inválida em "%": use o formato dia/mês/ano válido', p_campo;
end $$;
revoke all on function app.data_campo(text, text) from public, anon, authenticated;

/** Texto → número com mensagem clara (nulo ou vazio = nulo). */
create or replace function app.numero_campo(p_txt text, p_campo text)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if nullif(trim(p_txt), '') is null then return null; end if;
  return trim(p_txt)::numeric;
exception when others then
  raise exception 'Valor inválido em "%": use só números', p_campo;
end $$;
revoke all on function app.numero_campo(text, text) from public, anon, authenticated;

/** Administradores ativos da organização (para avisos no sino). */
create or replace function app.avisar_admins(p_org uuid, p_app text, p_titulo text, p_texto text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare u record;
begin
  for u in select m.user_id from membros m where m.org_id = p_org and m.ativo and m.papel::text = 'admin' loop
    perform app.notificar(p_org, u.user_id, p_app, p_titulo, p_texto, p_link);
  end loop;
end $$;
revoke all on function app.avisar_admins(uuid, text, text, text, text) from public, anon, authenticated;

-- ===================================================================================================== 1 regras de acesso
-- Regra única da equipe, de volta à 008: só a ferramenta pedida.
create or replace function app.hub_pode(p_org uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.papel(p_org) is null then false
    when app.papel(p_org) = 'admin' then true
    else exists (
      select 1 from public.hub_acessos a
       where a.org_id = p_org and a.user_id = auth.uid() and a.app = p_app
         and (a.expira_em is null or a.expira_em >= app.hoje(p_org))
         and app.hub_peso(a.papel) >= app.hub_peso(p_min))
  end
$$;
comment on function app.hub_pode(uuid, text, text) is
  'Regra única de acesso da equipe: admin = tudo; senão hub_acessos da ferramenta pedida (ver < operar < gerir), respeitando expira_em (008; a 035 foi desfeita pela 036).';

/** Equipe com ALGUMA das ferramentas no nível pedido. */
create or replace function app.hub_pode_algum(p_org uuid, p_apps text[], p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.papel(p_org) is null then false
    when app.papel(p_org) = 'admin' then true
    else exists (
      select 1 from public.hub_acessos a
       where a.org_id = p_org and a.user_id = auth.uid() and a.app = any (p_apps)
         and (a.expira_em is null or a.expira_em >= app.hoje(p_org))
         and app.hub_peso(a.papel) >= app.hub_peso(p_min))
  end
$$;
comment on function app.hub_pode_algum(uuid, text[], text) is 'Equipe com alguma das ferramentas no nível pedido (036).';

/** Módulos de gestão que GRAVAM dados compartilhados (os demais — centros de custo, plano, relatórios — só leem). */
create or replace function app.modulos_operar()
returns text[] language sql immutable set search_path = '' as $$
  select array['financeiro', 'entradas', 'saidas', 'estoque']
$$;

/** O módulo pago só vale se o produto estiver ativo (036, B-06). */
create or replace function app.cliente_tem_modulo(p_cliente uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from lic_contratos k
      join lic_contrato_produtos cp on cp.contrato_id = k.id
      join lic_produtos p on p.id = cp.produto_id
     where k.cliente_id = p_cliente and p.slug = p_modulo and p.ativo and k.situacao = 'ativo'
       and k.inicio <= app.hoje(k.org_id) and (k.fim is null or k.fim >= app.hoje(k.org_id)))
    and not app.cliente_bloqueado(p_cliente)
$$;

/** Pessoa do cliente no Portal: financeiro = ver e lançar; financeiro_ver = só ver (036, B-02). */
create or replace function app.portal_gestao(p_cliente uuid, p_min text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_min
    when 'ver' then app.portal_pode(p_cliente, 'financeiro') or app.portal_pode(p_cliente, 'financeiro_ver')
    when 'operar' then app.portal_pode(p_cliente, 'financeiro')
    else false end
$$;

/**
 * Dados de gestão do cliente com o conjunto de módulos que dá direito: equipe com algum dos módulos no nível pedido,
 * ou pessoa do cliente no Portal (ver/operar) com contrato ativo de algum dos módulos e sem bloqueio.
 */
create or replace function app.gestao_pode(p_cliente uuid, p_min text, p_modulos text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode_algum(c.org_id, p_modulos, p_min))
      or (p_min in ('ver', 'operar') and app.portal_gestao(p_cliente, p_min)
          and exists (select 1 from unnest(p_modulos) m where app.cliente_tem_modulo(p_cliente, m)))
$$;
comment on function app.gestao_pode(uuid, text, text[]) is
  'Equipe com algum dos módulos no nível, ou Portal (financeiro para operar; financeiro ou financeiro_ver para ver) com contrato ativo de algum dos módulos e sem bloqueio (036).';

create or replace function app.fin_pode(p_cliente uuid, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_min = 'ver' then app.gestao_pode(p_cliente, 'ver', app.modulos_gestao())
              else app.gestao_pode(p_cliente, p_min, app.modulos_operar()) end
$$;
comment on function app.fin_pode(uuid, text) is
  'Dados de gestão compartilhados: ver = qualquer módulo de gestão; operar/gerir = módulos que gravam (financeiro, entradas, saídas, estoque). Conjuntos específicos em app.gestao_pode (036).';

/** O cliente é da organização? (para as pastas do Storage; a pessoa do Portal não lê a tabela clientes). */
create or replace function app.cliente_da_org(p_cliente uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_cliente is not null and p_org is not null and exists (select 1 from clientes where id = p_cliente and org_id = p_org)
$$;

revoke all on function app.hub_pode_algum(uuid, text[], text), app.modulos_operar(), app.portal_gestao(uuid, text),
  app.gestao_pode(uuid, text, text[]), app.cliente_da_org(uuid, uuid) from public, anon;
grant execute on function app.hub_pode_algum(uuid, text[], text), app.modulos_operar(), app.portal_gestao(uuid, text),
  app.gestao_pode(uuid, text, text[]), app.cliente_da_org(uuid, uuid), app.modulos_gestao(), app.fin_pode(uuid, text),
  app.cliente_tem_modulo(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------------- 1 políticas por assunto
-- plano de contas e contas bancárias: qualquer módulo de gestão LÊ (equipe) ; Portal pela regra de leitura
drop policy if exists fin_plano_ver on public.fin_plano_contas;
create policy fin_plano_ver on public.fin_plano_contas for select to authenticated
  using (app.hub_pode_algum(org_id, app.modulos_gestao(), 'ver'));
drop policy if exists fin_contas_ver on public.fin_contas_bancarias;
create policy fin_contas_ver on public.fin_contas_bancarias for select to authenticated
  using (app.hub_pode_algum(org_id, app.modulos_gestao(), 'ver'));
drop policy if exists fin_contas_ver_portal on public.fin_contas_bancarias;
create policy fin_contas_ver_portal on public.fin_contas_bancarias for select to authenticated using (app.fin_pode(cliente_id, 'ver'));
drop policy if exists fin_plano_ver_portal on public.fin_plano_contas;
create policy fin_plano_ver_portal on public.fin_plano_contas for select to authenticated using (app.fin_pode(cliente_id, 'ver'));
-- (fin_contas_incluir / fin_contas_alterar continuam em hub_pode(org, 'financeiro', 'operar'): agora estritos)

-- categorias: plano de contas ou financeiro (só equipe); centros de custo: centros_custo ou financeiro (só equipe)
drop policy if exists fin_incluir on public.fin_categorias;
create policy fin_incluir on public.fin_categorias for insert to authenticated
  with check (app.hub_pode_algum(org_id, array['plano_contas', 'financeiro'], 'operar'));
drop policy if exists fin_alterar on public.fin_categorias;
create policy fin_alterar on public.fin_categorias for update to authenticated
  using (app.hub_pode_algum(org_id, array['plano_contas', 'financeiro'], 'operar'))
  with check (app.hub_pode_algum(org_id, array['plano_contas', 'financeiro'], 'operar'));
drop policy if exists fin_incluir on public.fin_centros_custo;
create policy fin_incluir on public.fin_centros_custo for insert to authenticated
  with check (app.hub_pode_algum(org_id, array['centros_custo', 'financeiro'], 'operar'));
drop policy if exists fin_alterar on public.fin_centros_custo;
create policy fin_alterar on public.fin_centros_custo for update to authenticated
  using (app.hub_pode_algum(org_id, array['centros_custo', 'financeiro'], 'operar'))
  with check (app.hub_pode_algum(org_id, array['centros_custo', 'financeiro'], 'operar'));

-- títulos (edição direta pela tela): só Financeiro
drop policy if exists fin_incluir on public.fin_titulos;
create policy fin_incluir on public.fin_titulos for insert to authenticated
  with check (app.gestao_pode(cliente_id, 'operar', array['financeiro']));
drop policy if exists fin_alterar on public.fin_titulos;
create policy fin_alterar on public.fin_titulos for update to authenticated
  using (app.gestao_pode(cliente_id, 'operar', array['financeiro'])) with check (app.gestao_pode(cliente_id, 'operar', array['financeiro']));

-- de-para de itens das notas: entradas ou financeiro
drop policy if exists fis_incluir on public.fis_depara_itens;
create policy fis_incluir on public.fis_depara_itens for insert to authenticated
  with check (app.gestao_pode(cliente_id, 'operar', array['entradas', 'financeiro']));
drop policy if exists fis_alterar on public.fis_depara_itens;
create policy fis_alterar on public.fis_depara_itens for update to authenticated
  using (app.gestao_pode(cliente_id, 'operar', array['entradas', 'financeiro']))
  with check (app.gestao_pode(cliente_id, 'operar', array['entradas', 'financeiro']));

-- ------------------------------------------------------------------------------------- 1 plano de contas
create or replace function public.fin_importar_plano(p_cliente uuid, p_arquivo text, p_contas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_total int; v_novas int; v_inativadas int;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.hub_pode_algum(v_org, array['plano_contas', 'financeiro'], 'operar') then
    raise exception 'Sem permissão para importar o plano de contas (precisa de Plano de contas ou Financeiro: operar)';
  end if;
  if jsonb_typeof(p_contas) is distinct from 'array' or jsonb_array_length(p_contas) = 0 then raise exception 'O plano veio sem contas'; end if;

  create temporary table _plano on commit drop as
    select distinct on (trim(c.classificacao)) trim(c.classificacao) as classificacao, nullif(trim(c.codigo), '') as codigo,
           coalesce(nullif(trim(c.descricao), ''), '(sem nome)') as descricao, coalesce(c.analitica, true) as analitica,
           coalesce(c.nivel, array_length(string_to_array(trim(c.classificacao), '.'), 1)) as nivel
      from jsonb_to_recordset(p_contas) as c(classificacao text, codigo text, descricao text, analitica boolean, nivel int)
     where trim(c.classificacao) ~ '^\d+(\.\d+)*$';
  select count(*) into v_total from _plano;
  if v_total = 0 then raise exception 'Nenhuma conta com classificação válida'; end if;

  select count(*) into v_novas from _plano n where not exists (select 1 from fin_plano_contas p where p.cliente_id = p_cliente and p.classificacao = n.classificacao);
  insert into fin_plano_contas (org_id, cliente_id, codigo, classificacao, descricao, analitica, nivel, ativo, atualizado_em)
  select v_org, p_cliente, n.codigo, n.classificacao, n.descricao, n.analitica, n.nivel, true, now() from _plano n
  on conflict (cliente_id, classificacao) do update
     set codigo = excluded.codigo, descricao = excluded.descricao, analitica = excluded.analitica, nivel = excluded.nivel,
         ativo = true, atualizado_em = now();
  update fin_plano_contas p set ativo = false, atualizado_em = now()
   where p.cliente_id = p_cliente and p.ativo and not exists (select 1 from _plano n where n.classificacao = p.classificacao);
  get diagnostics v_inativadas = row_count;

  insert into fin_plano_importacoes (org_id, cliente_id, arquivo, total, novas, inativadas, por)
  values (v_org, p_cliente, p_arquivo, v_total, v_novas, v_inativadas, auth.uid());
  perform app.registrar(v_org, 'financeiro', 'importar_plano', p_cliente::text, null,
    jsonb_build_object('arquivo', p_arquivo, 'total', v_total, 'novas', v_novas, 'inativadas', v_inativadas));
  return jsonb_build_object('total', v_total, 'novas', v_novas, 'inativadas', v_inativadas);
end $$;

-- ===================================================================================================== 5 (M-03) título
/**
 * Título (036): além das travas da 030, fora das funções (modo interno) a nota, quem lançou e a data de criação não
 * mudam; título gerado por nota ou pedido não muda valor, vencimento, categoria nem fornecedor/cliente.
 */
create or replace function app.tg_fin_titulo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo_cat text; v_interno boolean := coalesce(current_setting('app.fin_interno', true), '') = '1';
begin
  if tg_op = 'UPDATE' then
    if new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id or new.tipo is distinct from old.tipo
       or new.grupo is distinct from old.grupo or new.parcela is distinct from old.parcela or new.parcelas is distinct from old.parcelas then
      raise exception 'Empresa, tipo e parcela do título não mudam';
    end if;
    if not v_interno then
      if new.situacao is distinct from old.situacao or new.valor_pago is distinct from old.valor_pago
         or new.quitado_em is distinct from old.quitado_em or new.cancelado_motivo is distinct from old.cancelado_motivo then
        raise exception 'A situação do título muda só ao pagar, receber, estornar ou cancelar';
      end if;
      if new.nota_id is distinct from old.nota_id or new.por is distinct from old.por or new.criado_em is distinct from old.criado_em then
        raise exception 'A nota de origem, quem lançou e a data de criação do título não mudam';
      end if;
      if old.situacao <> 'aberto' then raise exception 'Título quitado ou cancelado não pode ser editado; estorne a baixa antes'; end if;
      if (old.nota_id is not null or exists (select 1 from est_pedido_titulos where titulo_id = old.id))
         and (new.valor is distinct from old.valor or new.vencimento is distinct from old.vencimento
              or new.categoria_id is distinct from old.categoria_id or new.pessoa_id is distinct from old.pessoa_id) then
        raise exception 'Esta conta foi gerada por nota fiscal ou pedido: valor, vencimento, categoria e fornecedor/cliente mudam só pelo documento de origem';
      end if;
      if old.valor_pago > 0 and new.valor <= old.valor_pago then
        raise exception 'O valor precisa ser maior do que já foi pago (%); para encerrar, dê baixa do restante', old.valor_pago;
      end if;
    end if;
  elsif not v_interno then
    if new.valor_pago <> 0 or new.situacao <> 'aberto' or new.quitado_em is not null then
      raise exception 'Título novo entra em aberto; use Pagar/Receber para dar baixa';
    end if;
    if new.nota_id is not null then raise exception 'Conta ligada a nota fiscal nasce só pelo lançamento da nota'; end if;
    new.por := auth.uid();
    new.criado_em := now();
  end if;
  select tipo into v_tipo_cat from fin_categorias where id = new.categoria_id and cliente_id = new.cliente_id;
  if v_tipo_cat is null then raise exception 'Categoria não encontrada nesta empresa'; end if;
  if (new.tipo = 'pagar' and v_tipo_cat <> 'despesa') or (new.tipo = 'receber' and v_tipo_cat <> 'receita') then
    raise exception 'Conta a pagar usa categoria de despesa; conta a receber usa categoria de receita';
  end if;
  if new.pessoa_id is not null and not exists (select 1 from fin_pessoas where id = new.pessoa_id and cliente_id = new.cliente_id) then
    raise exception 'Fornecedor/cliente não encontrado nesta empresa';
  end if;
  if new.centro_id is not null and not exists (select 1 from fin_centros_custo where id = new.centro_id and cliente_id = new.cliente_id) then
    raise exception 'Centro de custo não encontrado nesta empresa';
  end if;
  if new.conta_prevista_id is not null and not exists (select 1 from fin_contas_bancarias where id = new.conta_prevista_id and cliente_id = new.cliente_id) then
    raise exception 'Conta bancária não encontrada nesta empresa';
  end if;
  return new;
end $$;

-- ===================================================================================================== 1/11 lançar, baixar, cancelar
/**
 * Lançamento de títulos SEM conferência de permissão (uso interno): fin_lancar (tela, Financeiro), notas (Entradas)
 * e pedidos (Saídas/Entradas) chamam esta. Mesmos campos de fin_lancar (030). Devolve o modo interno ao valor anterior.
 */
create or replace function app.fin_lancar_titulos(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := app.uuid_campo(p->>'cliente', 'empresa'); v_org uuid; v_n int;
  v_total numeric := round(app.numero_campo(p->>'valor', 'valor'), 2); v_parcela numeric; v_grupo uuid; v_id uuid; v_ids uuid[] := '{}';
  v_venc date := app.data_campo(p->>'vencimento', 'vencimento'); v_pago jsonb := p->'pago'; v_conta uuid; v_data_pago date; k int;
  v_pessoa uuid := app.uuid_campo(p->>'pessoa', 'fornecedor/cliente'); v_nome text := nullif(trim(p->>'pessoa_nome'), '');
  v_fin text := current_setting('app.fin_interno', true);
begin
  v_n := coalesce(app.numero_campo(p->>'parcelas', 'parcelas'), 1)::int;
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if v_total is null or v_total <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if v_venc is null then raise exception 'Informe o vencimento'; end if;
  if v_n < 1 or v_n > 120 then raise exception 'Parcelas: de 1 a 120'; end if;
  if v_total / v_n < 0.01 then raise exception 'Valor pequeno demais para tantas parcelas'; end if;
  if v_pago is not null and jsonb_typeof(v_pago) = 'object' then
    v_conta := app.uuid_campo(v_pago->>'conta', 'conta bancária');
    v_data_pago := app.data_campo(v_pago->>'data', 'data do pagamento');
    if v_conta is null or v_data_pago is null then raise exception 'Para lançar já pago, informe a data e a conta bancária'; end if;
    if not exists (select 1 from fin_contas_bancarias where id = v_conta and cliente_id = v_cliente and ativo) then
      raise exception 'Conta bancária não encontrada ou inativa';
    end if;
  else
    v_pago := null;
  end if;

  if v_pessoa is null and v_nome is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = v_cliente and lower(nome) = lower(v_nome) order by ativo desc, criado_em limit 1;
    if v_pessoa is null then
      insert into fin_pessoas (org_id, cliente_id, tipo, nome)
      values (v_org, v_cliente, case when p->>'tipo' = 'pagar' then 'fornecedor' else 'cliente' end, v_nome)
      returning id into v_pessoa;
    end if;
  end if;

  v_grupo := case when v_n > 1 then gen_random_uuid() end;
  v_parcela := trunc(v_total / v_n, 2);
  perform set_config('app.fin_interno', '1', true);
  for k in 1..v_n loop
    insert into fin_titulos (org_id, cliente_id, tipo, pessoa_id, categoria_id, centro_id, conta_prevista_id, descricao, documento,
                             emissao, vencimento, valor, parcela, parcelas, grupo, observacao, por)
    values (v_org, v_cliente, p->>'tipo', v_pessoa, app.uuid_campo(p->>'categoria', 'categoria'), app.uuid_campo(p->>'centro', 'centro de custo'),
            coalesce(app.uuid_campo(p->>'conta_prevista', 'conta prevista'), v_conta),
            trim(p->>'descricao') || case when v_n > 1 then format(' (%s/%s)', k, v_n) else '' end,
            nullif(trim(p->>'documento'), ''), app.data_campo(p->>'emissao', 'emissão'), (v_venc + make_interval(months => k - 1))::date,
            case when k = v_n then v_total - v_parcela * (v_n - 1) else v_parcela end, k, v_n, v_grupo,
            nullif(trim(p->>'observacao'), ''), auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
    if v_pago is not null then
      insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, forma, por)
      select org_id, cliente_id, id, v_conta, v_data_pago, valor, nullif(v_pago->>'forma', ''), auth.uid()
        from fin_titulos where id = v_id;
      update fin_titulos set valor_pago = valor, situacao = 'quitado', quitado_em = v_data_pago where id = v_id;
    end if;
  end loop;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);

  perform app.registrar(v_org, 'financeiro', 'lancar_' || (p->>'tipo'), coalesce(v_grupo, v_id)::text, null,
    p || jsonb_build_object('titulos', to_jsonb(v_ids)));
  return jsonb_build_object('titulos', to_jsonb(v_ids), 'grupo', v_grupo);
end $$;
revoke all on function app.fin_lancar_titulos(jsonb) from public, anon, authenticated;

/** Conta a pagar/receber avulsa (tela do Financeiro): exige o módulo Financeiro (operar). */
create or replace function public.fin_lancar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cliente uuid := app.uuid_campo(p->>'cliente', 'empresa');
begin
  if not exists (select 1 from clientes where id = v_cliente) then raise exception 'Empresa não encontrada'; end if;
  if not app.gestao_pode(v_cliente, 'operar', array['financeiro']) then
    raise exception 'Sem permissão para lançar no Financeiro desta empresa';
  end if;
  return app.fin_lancar_titulos(p);
end $$;
revoke all on function public.fin_lancar(jsonb) from public, anon;
grant execute on function public.fin_lancar(jsonb) to authenticated;
comment on function public.fin_lancar(jsonb) is 'Lança conta a pagar/receber avulsa (Financeiro: operar). Parcelas mensais; opcionalmente já paga. Tudo ou nada; auditada.';

create or replace function public.fin_baixar(
  p_titulo uuid, p_data date, p_valor numeric, p_conta uuid,
  p_juros numeric default 0, p_multa numeric default 0, p_desconto numeric default 0, p_forma text default null, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t fin_titulos; v_valor numeric := round(p_valor, 2); v_baixa bigint; v_pago numeric; v_fin text := current_setting('app.fin_interno', true);
begin
  select * into t from fin_titulos where id = p_titulo for update;
  if t.id is null then raise exception 'Título não encontrado'; end if;
  if not app.gestao_pode(t.cliente_id, 'operar', array['financeiro']) then raise exception 'Sem permissão para dar baixa'; end if;
  if t.situacao <> 'aberto' then raise exception 'Este título não está em aberto'; end if;
  if t.nota_id is not null and exists (select 1 from fis_notas where id = t.nota_id and situacao = 'cancelada') then
    raise exception 'A nota fiscal desta conta foi cancelada pelo emitente: não pague; desfaça o lançamento da nota';
  end if;
  if p_data is null then raise exception 'Informe a data do pagamento'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor baixado'; end if;
  if v_valor > t.valor - t.valor_pago then raise exception 'O valor baixado é maior que o saldo em aberto (%)', t.valor - t.valor_pago; end if;
  if coalesce(p_juros, 0) < 0 or coalesce(p_multa, 0) < 0 or coalesce(p_desconto, 0) < 0 then raise exception 'Juros, multa e desconto não podem ser negativos'; end if;
  if v_valor + coalesce(p_juros, 0) + coalesce(p_multa, 0) - coalesce(p_desconto, 0) < 0 then raise exception 'O desconto é maior que o valor pago'; end if;
  if not exists (select 1 from fin_contas_bancarias where id = p_conta and cliente_id = t.cliente_id and ativo) then
    raise exception 'Conta bancária não encontrada ou inativa';
  end if;

  insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, juros, multa, desconto, forma, observacao, por)
  values (t.org_id, t.cliente_id, t.id, p_conta, p_data, v_valor, round(coalesce(p_juros, 0), 2), round(coalesce(p_multa, 0), 2),
          round(coalesce(p_desconto, 0), 2), nullif(trim(p_forma), ''), nullif(trim(p_obs), ''), auth.uid())
  returning id into v_baixa;
  v_pago := t.valor_pago + v_valor;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set valor_pago = v_pago,
         situacao = case when v_pago >= valor then 'quitado' else 'aberto' end,
         quitado_em = case when v_pago >= valor then p_data end
   where id = t.id;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  perform app.registrar(t.org_id, 'financeiro', 'baixar_' || t.tipo, t.id::text, null,
    jsonb_build_object('baixa', v_baixa, 'data', p_data, 'valor', v_valor, 'juros', p_juros, 'multa', p_multa, 'desconto', p_desconto, 'conta', p_conta));
  return jsonb_build_object('baixa', v_baixa, 'quitado', v_pago >= t.valor, 'saldo', t.valor - v_pago);
end $$;

create or replace function public.fin_estornar_baixa(p_baixa bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b fin_baixas; t fin_titulos; v_fin text := current_setting('app.fin_interno', true);
begin
  select * into b from fin_baixas where id = p_baixa for update;
  if b.id is null then raise exception 'Pagamento não encontrado'; end if;
  if not app.gestao_pode(b.cliente_id, 'operar', array['financeiro']) then raise exception 'Sem permissão para estornar'; end if;
  if b.estornada then raise exception 'Este pagamento já foi estornado'; end if;
  if b.extrato_linha_id is not null then raise exception 'Este pagamento já foi conciliado com o extrato; desfaça a conciliação antes'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  select * into t from fin_titulos where id = b.titulo_id for update;
  update fin_baixas set estornada = true, estornada_em = now(), estorno_motivo = trim(p_motivo) where id = b.id;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set valor_pago = valor_pago - b.valor, situacao = 'aberto', quitado_em = null where id = t.id;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  perform app.registrar(b.org_id, 'financeiro', 'estornar_baixa', t.id::text, to_jsonb(b), jsonb_build_object('motivo', trim(p_motivo)));
  return jsonb_build_object('titulo', t.id);
end $$;

/** Cancela título avulso em aberto. Título de nota ou pedido cancela só pelo documento de origem (036, M-03). */
create or replace function public.fin_cancelar_titulo(p_titulo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t fin_titulos; v_fin text := current_setting('app.fin_interno', true);
begin
  select * into t from fin_titulos where id = p_titulo for update;
  if t.id is null then raise exception 'Título não encontrado'; end if;
  if not app.gestao_pode(t.cliente_id, 'operar', array['financeiro']) then raise exception 'Sem permissão para cancelar'; end if;
  if t.nota_id is not null then raise exception 'Esta conta veio de uma nota fiscal: para cancelar, desfaça o lançamento da nota em Entradas'; end if;
  if exists (select 1 from est_pedido_titulos where titulo_id = t.id) then
    raise exception 'Esta conta veio de um pedido: para cancelar, cancele o pedido';
  end if;
  if t.situacao <> 'aberto' then raise exception 'Só título em aberto pode ser cancelado'; end if;
  if t.valor_pago > 0 then raise exception 'Este título tem pagamento; estorne o pagamento antes de cancelar'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set situacao = 'cancelado', cancelado_motivo = trim(p_motivo) where id = t.id;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  perform app.registrar(t.org_id, 'financeiro', 'cancelar_' || t.tipo, t.id::text, to_jsonb(t), jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- transferências: só Financeiro
create or replace function public.fin_transferir(p_origem uuid, p_destino uuid, p_data date, p_valor numeric, p_obs text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare o fin_contas_bancarias; d fin_contas_bancarias; v_valor numeric := round(p_valor, 2); v_id bigint;
begin
  select * into o from fin_contas_bancarias where id = p_origem;
  select * into d from fin_contas_bancarias where id = p_destino;
  if o.id is null or d.id is null then raise exception 'Conta bancária não encontrada'; end if;
  if not app.gestao_pode(o.cliente_id, 'operar', array['financeiro']) then raise exception 'Sem permissão para transferir no Financeiro desta empresa'; end if;
  if o.id = d.id then raise exception 'Escolha contas diferentes para a origem e o destino'; end if;
  if o.cliente_id <> d.cliente_id then raise exception 'As duas contas precisam ser da mesma empresa'; end if;
  if not o.ativo or not d.ativo then raise exception 'Conta bancária inativa: ative a conta antes de transferir'; end if;
  if p_data is null then raise exception 'Informe a data da transferência'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor da transferência'; end if;
  insert into fin_transferencias (org_id, cliente_id, origem_id, destino_id, data, valor, observacao, por)
  values (o.org_id, o.cliente_id, o.id, d.id, p_data, v_valor, nullif(trim(p_obs), ''), auth.uid())
  returning id into v_id;
  perform app.registrar(o.org_id, 'financeiro', 'transferir', v_id::text, null,
    jsonb_build_object('origem', o.id, 'destino', d.id, 'data', p_data, 'valor', v_valor));
  return v_id;
end $$;

create or replace function public.fin_estornar_transferencia(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t fin_transferencias;
begin
  select * into t from fin_transferencias where id = p_id for update;
  if t.id is null then raise exception 'Transferência não encontrada'; end if;
  if not app.gestao_pode(t.cliente_id, 'operar', array['financeiro']) then raise exception 'Sem permissão para estornar'; end if;
  if t.estornada then raise exception 'Esta transferência já foi estornada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  update fin_transferencias set estornada = true, estornada_em = now(), estorno_motivo = trim(p_motivo) where id = t.id;
  perform app.registrar(t.org_id, 'financeiro', 'estornar_transferencia', t.id::text, to_jsonb(t), jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- ===================================================================================================== 8 (B-04) extratos
alter table public.fin_extrato_lotes
  add column if not exists desfeito_em timestamptz,
  add column if not exists desfeito_por uuid,
  add column if not exists desfeito_motivo text;
alter table public.fin_extrato_linhas drop constraint if exists fin_extrato_linhas_situacao_check;
alter table public.fin_extrato_linhas add constraint fin_extrato_linhas_situacao_check
  check (situacao in ('pendente', 'conciliado', 'ignorado', 'desfeita'));
-- a chave impede duplicidade só entre lançamentos valendo: reimportar depois de desfazer volta a gravar
alter table public.fin_extrato_linhas drop constraint if exists fin_extrato_linhas_conta_id_chave_key;
create unique index if not exists fin_extrato_linhas_chave_valendo on public.fin_extrato_linhas (conta_id, chave) where situacao <> 'desfeita';
comment on column public.fin_extrato_lotes.desfeito_em is 'Importação desfeita (por engano): lote e lançamentos ficam guardados, marcados, com motivo.';

create or replace function public.fin_importar_extrato(
  p_conta uuid, p_arquivo text, p_formato text, p_inicio date, p_fim date, p_saldo_final numeric, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c fin_contas_bancarias; v_lote uuid; v_recebidas int; v_novas int;
begin
  select * into c from fin_contas_bancarias where id = p_conta;
  if c.id is null or not c.ativo then raise exception 'Conta bancária não encontrada ou inativa'; end if;
  if not app.hub_pode(c.org_id, 'financeiro', 'operar') then raise exception 'Sem permissão para importar extratos'; end if;
  if p_formato not in ('ofx', 'planilha') then raise exception 'Formato inválido'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'O extrato veio sem lançamentos'; end if;

  insert into fin_extrato_lotes (org_id, cliente_id, conta_id, arquivo, formato, inicio, fim, saldo_final, por)
  values (c.org_id, c.cliente_id, c.id, p_arquivo, p_formato, p_inicio, p_fim, p_saldo_final, auth.uid())
  returning id into v_lote;

  select count(*) into v_recebidas
    from jsonb_to_recordset(p_linhas) as l(data date, valor numeric, chave text)
   where l.data is not null and l.valor is not null and round(l.valor, 2) <> 0 and coalesce(l.chave, '') <> '';
  if v_recebidas = 0 then raise exception 'O extrato veio sem lançamentos válidos'; end if;
  insert into fin_extrato_linhas (org_id, cliente_id, conta_id, lote_id, data, valor, descricao, documento, fitid, chave)
  select c.org_id, c.cliente_id, c.id, v_lote, l.data, round(l.valor, 2), coalesce(nullif(trim(l.descricao), ''), '(sem descrição)'),
         nullif(trim(l.documento), ''), nullif(trim(l.fitid), ''), l.chave
    from jsonb_to_recordset(p_linhas) as l(data date, valor numeric, descricao text, documento text, fitid text, chave text)
   where l.data is not null and l.valor is not null and round(l.valor, 2) <> 0 and coalesce(l.chave, '') <> ''
  on conflict (conta_id, chave) where situacao <> 'desfeita' do nothing;
  get diagnostics v_novas = row_count;

  update fin_extrato_lotes set recebidas = v_recebidas, novas = v_novas, repetidas = v_recebidas - v_novas where id = v_lote;
  perform app.registrar(c.org_id, 'financeiro', 'importar_extrato', c.id::text, null,
    jsonb_build_object('arquivo', p_arquivo, 'lote', v_lote, 'novas', v_novas, 'repetidas', v_recebidas - v_novas));
  return jsonb_build_object('lote_id', v_lote, 'recebidas', v_recebidas, 'novas', v_novas, 'repetidas', v_recebidas - v_novas);
end $$;

drop function if exists public.fin_desfazer_lote(uuid);
/** Desfaz um extrato importado por engano: marca o lote e os lançamentos como desfeitos, com motivo (não apaga). */
create or replace function public.fin_desfazer_lote(p_lote uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l fin_extrato_lotes; v_n int;
begin
  select * into l from fin_extrato_lotes where id = p_lote for update;
  if l.id is null then raise exception 'Importação não encontrada'; end if;
  if not app.hub_pode(l.org_id, 'financeiro', 'operar') then raise exception 'Sem permissão para desfazer importações'; end if;
  if l.desfeito_em is not null then raise exception 'Esta importação já foi desfeita'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo para desfazer a importação'; end if;
  if exists (select 1 from fin_extrato_linhas x where x.lote_id = p_lote and x.situacao not in ('pendente', 'desfeita')) then
    raise exception 'Este extrato já tem lançamentos conciliados ou ignorados; desfaça a conciliação antes';
  end if;
  update fin_extrato_linhas set situacao = 'desfeita' where lote_id = p_lote and situacao = 'pendente';
  get diagnostics v_n = row_count;
  update fin_extrato_lotes set desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = trim(p_motivo) where id = p_lote;
  perform app.registrar(l.org_id, 'financeiro', 'desfazer_extrato', l.conta_id::text, null,
    jsonb_build_object('arquivo', l.arquivo, 'lote', p_lote, 'desfeitas', v_n, 'motivo', trim(p_motivo)));
  return jsonb_build_object('desfeitas', v_n, 'apagadas', 0);
end $$;
revoke all on function public.fin_desfazer_lote(uuid, text) from public, anon;
grant execute on function public.fin_desfazer_lote(uuid, text) to authenticated;
comment on function public.fin_desfazer_lote(uuid, text) is
  'Desfaz um extrato importado por engano (se nenhum lançamento foi conciliado): marca lote e lançamentos como desfeitos, com motivo. Auditado.';

-- ===================================================================================================== 3 notas: quem vê, quem envia
create or replace function app.fis_org_visivel(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.hub_pode_algum(p_org, app.modulos_gestao(), 'ver')
      or exists (select 1 from portal_usuarios u join clientes c on c.id = u.cliente_id and c.org_id = u.org_id
                  where u.user_id = auth.uid() and u.org_id = p_org and u.ativo
                    and u.permissoes && array['financeiro', 'financeiro_ver']
                    and (app.cliente_tem_modulo(c.id, 'entradas') or app.cliente_tem_modulo(c.id, 'financeiro')))
$$;

create or replace function public.fis_pode(p_cliente uuid, p_nivel text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_nivel = 'ver' then app.fin_pode(p_cliente, 'ver')
              else app.gestao_pode(p_cliente, p_nivel, array['entradas', 'financeiro']) end
$$;

/** Certificado A1: equipe com Financeiro (gerir) ou o cliente no Portal (financeiro) sem bloqueio e com Entradas/Financeiro. */
create or replace function public.fis_pode_certificado(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', 'gerir'))
      or (app.portal_pode(p_cliente, 'financeiro')
          and (app.cliente_tem_modulo(p_cliente, 'entradas') or app.cliente_tem_modulo(p_cliente, 'financeiro')))
$$;

create or replace function app.fis_caminho_pode(p_nome text, p_nivel text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clientes c
     where c.id = app.uuid_ou_nulo((storage.foldername(p_nome))[2])
       and c.org_id::text = (storage.foldername(p_nome))[1]
       and case when p_nivel = 'ver' then app.fin_pode(c.id, 'ver')
                else app.gestao_pode(c.id, p_nivel, array['entradas', 'financeiro']) end)
$$;

-- ===================================================================================================== 4 chave de acesso
/** Dígito verificador (módulo 11, pesos 2 a 9 da direita para a esquerda) dos 43 primeiros dígitos da chave. */
create or replace function app.fis_dv_chave(p43 text)
returns int language plpgsql immutable set search_path = '' as $$
declare s int := 0; peso int := 2; k int; r int;
begin
  for k in reverse length(p43)..1 loop
    s := s + substr(p43, k, 1)::int * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  r := s % 11;
  return case when r < 2 then 0 else 11 - r end;
end $$;
revoke all on function app.fis_dv_chave(text) from public, anon, authenticated;

/**
 * Confere a chave da nota enviada à mão e devolve o modelo: 44 dígitos = NF-e/NFC-e/CT-e (DV, CNPJ do emitente nas
 * posições 7 a 20 igual ao do XML, modelo 55, 65 ou 57); 50 dígitos = NFS-e (padrão nacional). Outros: recusa.
 */
create or replace function app.fis_modelo_da_chave(p_chave text, p_emitente text)
returns text language plpgsql immutable set search_path = '' as $$
declare v_mod text;
begin
  if p_chave ~ '^\d{50}$' then return 'nfse'; end if;
  if p_chave !~ '^\d{44}$' then raise exception 'Chave de acesso inválida: precisa ter 44 dígitos (NF-e, NFC-e, CT-e) ou 50 (NFS-e)'; end if;
  if app.fis_dv_chave(left(p_chave, 43)) <> right(p_chave, 1)::int then
    raise exception 'Chave de acesso inválida (dígito verificador não confere): confira se o XML é o original';
  end if;
  if substr(p_chave, 7, 14) <> coalesce(p_emitente, '') and lpad(coalesce(p_emitente, ''), 14, '0') <> substr(p_chave, 7, 14) then
    raise exception 'O CNPJ do emitente na chave de acesso não é o do XML: o arquivo foi alterado';
  end if;
  v_mod := substr(p_chave, 21, 2);
  if v_mod not in ('55', '65', '57') then
    raise exception 'Modelo de documento % não é aceito aqui (só NF-e 55, NFC-e 65, CT-e 57 e NFS-e)', v_mod;
  end if;
  return v_mod;
end $$;
revoke all on function app.fis_modelo_da_chave(text, text) from public, anon, authenticated;

create or replace function public.fis_registrar_upload(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := app.uuid_campo(p->>'cliente', 'empresa'); c clientes; v_raiz text; v_caminho text := p->>'caminho'; v_existe fis_notas; v_id uuid;
  v_chave text := app.fis_digitos(p->'nota'->>'chave'); v_modelo text; v_nota jsonb;
begin
  select * into c from clientes where id = v_cliente;
  if c.id is null then raise exception 'Empresa não encontrada'; end if;
  if not app.gestao_pode(v_cliente, 'operar', array['entradas', 'financeiro']) then raise exception 'Sem permissão para enviar notas desta empresa'; end if;
  if v_caminho is null or v_caminho not like c.org_id || '/' || c.id || '/upload/%' or lower(v_caminho) not like '%.xml' then
    raise exception 'Caminho do arquivo inválido';
  end if;
  v_raiz := left(app.fis_digitos(c.cnpj), 8);
  if v_raiz is null then raise exception 'Cadastre o CNPJ da empresa antes de enviar notas'; end if;
  if not (left(app.fis_digitos(p->'nota'->>'emitente_doc'), 8) = v_raiz or left(app.fis_digitos(p->'nota'->>'destinatario_doc'), 8) = v_raiz) then
    raise exception 'Esta nota não é desta empresa: o CNPJ dela não aparece como emitente nem como destinatário/tomador';
  end if;
  if coalesce(p->'nota'->>'conteudo', 'completa') <> 'completa' then raise exception 'Envie o XML completo da nota (não o resumo)'; end if;
  if coalesce(p->'nota'->>'modelo', '') = 'outro' then raise exception 'Tipo de documento não aceito: envie NF-e, NFC-e, CT-e ou NFS-e'; end if;
  v_modelo := app.fis_modelo_da_chave(v_chave, app.fis_digitos(p->'nota'->>'emitente_doc'));
  v_nota := (p->'nota') || jsonb_build_object('modelo', v_modelo, 'chave', v_chave);
  select * into v_existe from fis_notas where cliente_id = v_cliente and chave = v_chave;
  if v_existe.id is not null and v_existe.conteudo = 'completa' then
    raise exception 'Esta nota já está no HUB (nº %, %)', v_existe.numero, v_existe.emitente_nome;
  end if;
  v_id := app.fis_gravar_nota(v_cliente, 'upload', v_nota, v_caminho, null);
  perform app.registrar(c.org_id, 'financeiro', 'notas_upload', v_id::text, null,
    jsonb_build_object('chave', v_chave, 'modelo', v_modelo, 'caminho', v_caminho, 'numero', p->'nota'->>'numero'));
  return jsonb_build_object('nota', v_id);
end $$;

/**
 * Grava (ou completa) uma nota (032) + 036: nota capturada da SEFAZ/ADN (completa) SUBSTITUI a que foi enviada à mão e
 * ainda não foi lançada (itens regravados; fica na auditoria). Se a enviada à mão já foi lançada, só registra aviso na
 * auditoria e no sino dos administradores (alguém precisa conferir e desfazer o lançamento se os valores diferirem).
 */
create or replace function app.fis_gravar_nota(p_cliente uuid, p_origem text, p_nota jsonb, p_caminho text, p_nsu bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c clientes; v fis_notas; v_id uuid; v_chave text := app.fis_digitos(p_nota->>'chave'); v_conteudo text := coalesce(p_nota->>'conteudo', 'completa');
  i jsonb; n int := 0; v_substitui boolean := false;
begin
  select * into c from clientes where id = p_cliente;
  if c.id is null then raise exception 'Empresa não encontrada'; end if;
  if v_chave is null or length(v_chave) not between 44 and 50 then raise exception 'Chave de acesso inválida'; end if;
  perform pg_advisory_xact_lock(hashtext(p_cliente::text || v_chave));
  select * into v from fis_notas where cliente_id = p_cliente and chave = v_chave for update;

  if v.id is not null then
    if v.origem = 'upload' and p_origem in ('dfe', 'adn') and v_conteudo = 'completa' then
      if not v.processada then
        v_substitui := true;
        delete from fis_nota_itens where nota_id = v.id;
        perform app.registrar(c.org_id, 'financeiro', 'notas_upload_substituida', v.id::text,
          jsonb_build_object('origem', v.origem, 'modelo', v.modelo, 'valor_total', v.valor_total, 'emitente', v.emitente_doc, 'xml', v.xml_caminho),
          jsonb_build_object('origem', p_origem, 'modelo', p_nota->>'modelo', 'valor_total', p_nota->>'valor_total', 'xml', p_caminho));
      else
        perform app.registrar(c.org_id, 'financeiro', 'notas_upload_divergencia', v.id::text,
          jsonb_build_object('origem', v.origem, 'valor_total', v.valor_total, 'xml', v.xml_caminho),
          jsonb_build_object('origem', p_origem, 'valor_total', p_nota->>'valor_total', 'xml', p_caminho));
        perform app.avisar_admins(c.org_id, 'financeiro', 'Nota enviada à mão já lançada: confira',
          format('A nota %s de %s chegou pela SEFAZ/ADN. Confira se os valores batem com o lançamento.', coalesce(v.numero, ''), coalesce(v.emitente_nome, '')),
          '/entradas');
      end if;
    end if;
    if not v_substitui then
      if v.conteudo = 'resumo' and v_conteudo = 'completa' then
        delete from fis_nota_itens where nota_id = v.id;
      else
        update fis_notas set
          situacao = case when p_nota->>'situacao' in ('cancelada', 'denegada') then p_nota->>'situacao' else situacao end,
          xml_caminho = coalesce(xml_caminho, p_caminho), atualizado_em = now()
         where id = v.id;
        return v.id;
      end if;
    end if;
  end if;

  if v.id is null then
    insert into fis_notas (org_id, cliente_id, direcao, modelo, chave, conteudo, origem, nsu)
    values (c.org_id, p_cliente, app.fis_direcao(p_nota, c.cnpj), coalesce(p_nota->>'modelo', 'outro'), v_chave, v_conteudo, p_origem, p_nsu)
    returning id into v_id;
  else
    v_id := v.id;
    if v_substitui then
      update fis_notas set origem = p_origem, modelo = coalesce(p_nota->>'modelo', modelo), direcao = app.fis_direcao(p_nota, c.cnpj),
             xml_caminho = null, nsu = p_nsu
       where id = v_id;
    end if;
  end if;

  update fis_notas set
    conteudo = v_conteudo, numero = p_nota->>'numero', serie = p_nota->>'serie',
    emissao = nullif(p_nota->>'emissao', '')::timestamptz, autorizacao = nullif(p_nota->>'autorizacao', '')::timestamptz,
    protocolo = p_nota->>'protocolo',
    situacao = case when situacao = 'cancelada' then 'cancelada' else coalesce(p_nota->>'situacao', 'autorizada') end,
    tipo_nf = p_nota->>'tipo_nf', natureza = p_nota->>'natureza',
    emitente_doc = app.fis_digitos(p_nota->>'emitente_doc'), emitente_nome = p_nota->>'emitente_nome',
    emitente_ie = p_nota->>'emitente_ie', emitente_uf = p_nota->>'emitente_uf',
    destinatario_doc = app.fis_digitos(p_nota->>'destinatario_doc'), destinatario_nome = p_nota->>'destinatario_nome',
    valor_total = coalesce((p_nota->>'valor_total')::numeric, 0), valor_produtos = coalesce((p_nota->>'valor_produtos')::numeric, 0),
    valor_frete = coalesce((p_nota->>'valor_frete')::numeric, 0), valor_seguro = coalesce((p_nota->>'valor_seguro')::numeric, 0),
    valor_desconto = coalesce((p_nota->>'valor_desconto')::numeric, 0), valor_outros = coalesce((p_nota->>'valor_outros')::numeric, 0),
    icms_base = coalesce((p_nota->>'icms_base')::numeric, 0), icms_valor = coalesce((p_nota->>'icms_valor')::numeric, 0),
    icms_st_base = coalesce((p_nota->>'icms_st_base')::numeric, 0), icms_st_valor = coalesce((p_nota->>'icms_st_valor')::numeric, 0),
    ipi_valor = coalesce((p_nota->>'ipi_valor')::numeric, 0), pis_valor = coalesce((p_nota->>'pis_valor')::numeric, 0),
    cofins_valor = coalesce((p_nota->>'cofins_valor')::numeric, 0), iss_valor = coalesce((p_nota->>'iss_valor')::numeric, 0),
    iss_retido = coalesce((p_nota->>'iss_retido')::boolean, false), ibs_valor = coalesce((p_nota->>'ibs_valor')::numeric, 0),
    cbs_valor = coalesce((p_nota->>'cbs_valor')::numeric, 0), retencoes = coalesce((p_nota->>'retencoes')::numeric, 0),
    cfop_principal = p_nota->>'cfop_principal', duplicatas = coalesce(p_nota->'duplicatas', '[]'),
    xml_caminho = coalesce(p_caminho, xml_caminho), nsu = coalesce(nsu, p_nsu), atualizado_em = now()
   where id = v_id;

  for i in select * from jsonb_array_elements(coalesce(p_nota->'itens', '[]')) loop
    n := n + 1;
    insert into fis_nota_itens (nota_id, org_id, cliente_id, numero, codigo, gtin, descricao, ncm, cest, cfop, unidade, quantidade,
      valor_unitario, valor_total, desconto, frete, seguro, outros, icms_cst, icms_base, icms_aliquota, icms_valor, icms_st_valor,
      ipi_valor, pis_cst, pis_valor, cofins_cst, cofins_valor, ibs_valor, cbs_valor)
    values (v_id, c.org_id, p_cliente, coalesce(nullif(i->>'numero', '')::int, n), i->>'codigo', i->>'gtin',
      coalesce(nullif(trim(i->>'descricao'), ''), '(sem descrição)'), i->>'ncm', i->>'cest', i->>'cfop', i->>'unidade',
      coalesce((i->>'quantidade')::numeric, 0), coalesce((i->>'valor_unitario')::numeric, 0), coalesce((i->>'valor_total')::numeric, 0),
      coalesce((i->>'desconto')::numeric, 0), coalesce((i->>'frete')::numeric, 0), coalesce((i->>'seguro')::numeric, 0),
      coalesce((i->>'outros')::numeric, 0), i->>'icms_cst', coalesce((i->>'icms_base')::numeric, 0),
      coalesce((i->>'icms_aliquota')::numeric, 0), coalesce((i->>'icms_valor')::numeric, 0), coalesce((i->>'icms_st_valor')::numeric, 0),
      coalesce((i->>'ipi_valor')::numeric, 0), i->>'pis_cst', coalesce((i->>'pis_valor')::numeric, 0), i->>'cofins_cst',
      coalesce((i->>'cofins_valor')::numeric, 0), coalesce((i->>'ibs_valor')::numeric, 0), coalesce((i->>'cbs_valor')::numeric, 0));
  end loop;

  update fis_eventos set nota_id = v_id where cliente_id = p_cliente and chave = v_chave and nota_id is null;
  if exists (select 1 from fis_eventos where nota_id = v_id and tp_evento in ('110111', '110112')) then
    update fis_notas set situacao = 'cancelada' where id = v_id;
  end if;
  return v_id;
end $$;

-- ===================================================================================================== 5 (M-02) cancelamento de nota lançada
create or replace function app.fis_gravar_evento(p_cliente uuid, p_origem text, p_ev jsonb, p_xml text, p_por uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_chave text := app.fis_digitos(p_ev->>'chave'); v_tp text := p_ev->>'tpEvento'; v_nota uuid; v_id bigint;
  v_cstat text := p_ev->>'cStat'; v_prot text := nullif(p_ev->>'protocolo', ''); v_aceito boolean; v_man text; n fis_notas;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if v_chave is null or v_tp is null then raise exception 'Evento sem chave ou tipo'; end if;
  v_aceito := coalesce(v_cstat in ('135', '136', '155'), false) or (v_cstat is null and v_prot is not null);
  select id into v_nota from fis_notas where cliente_id = p_cliente and chave = v_chave;
  if v_prot is not null then
    select id into v_id from fis_eventos where cliente_id = p_cliente and chave = v_chave and tp_evento = v_tp and protocolo = v_prot;
    if v_id is not null then return v_id; end if;
  end if;
  insert into fis_eventos (org_id, cliente_id, nota_id, chave, tp_evento, descricao, sequencia, justificativa, cstat, motivo, protocolo,
                           registrado_em, origem, xml, por)
  values (v_org, p_cliente, v_nota, v_chave, v_tp, p_ev->>'descricao', coalesce((p_ev->>'sequencia')::int, 1), p_ev->>'justificativa',
          v_cstat, p_ev->>'motivo', v_prot, nullif(p_ev->>'registrado_em', '')::timestamptz, p_origem, p_xml, p_por)
  returning id into v_id;
  if v_aceito and v_nota is not null then
    if v_tp in ('110111', '110112') then
      update fis_notas set situacao = 'cancelada', atualizado_em = now() where id = v_nota returning * into n;
      if n.processada then
        perform app.registrar(v_org, 'financeiro', 'notas_cancelada_apos_lancamento', n.id::text, null,
          jsonb_build_object('numero', n.numero, 'emitente', n.emitente_nome, 'titulos', to_jsonb(n.titulos), 'protocolo', v_prot));
        perform app.avisar_admins(v_org, 'financeiro', 'Nota lançada foi cancelada pelo emitente',
          format('A nota %s de %s foi cancelada na SEFAZ depois de lançada. Desfaça o lançamento (contas a pagar e estoque).',
                 coalesce(n.numero, ''), coalesce(n.emitente_nome, '')), '/entradas');
      end if;
    else
      v_man := app.fis_manifestacao_do_tipo(v_tp);
      if v_man is not null then
        update fis_notas set manifestacao = v_man, manifestacao_em = coalesce(nullif(p_ev->>'registrado_em', '')::timestamptz, now()),
               manifestacao_protocolo = v_prot, atualizado_em = now()
         where id = v_nota and not (v_man = 'ciencia' and manifestacao is not null and manifestacao <> 'ciencia');
      end if;
    end if;
  end if;
  return v_id;
end $$;

-- ===================================================================================================== 1 lançar nota (entradas/financeiro)
create or replace function public.fis_processar_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n fis_notas; regra record; v_tipo text := p->>'tipo_entrada'; v_pessoa uuid := app.uuid_campo(p->>'pessoa', 'fornecedor');
  v_cat uuid := app.uuid_campo(p->>'categoria', 'categoria'); v_local uuid := app.uuid_campo(p->>'local', 'estoque');
  v_data date; v_grupo uuid := gen_random_uuid(); v_movs bigint[] := '{}'; v_titulos uuid[] := '{}'; v_r jsonb;
  it jsonb; ni fis_nota_itens; v_item uuid; e est_itens; v_fator numeric; v_qtd numeric; v_custo numeric;
  v_parc jsonb; k int := 0; v_n int; v_soma numeric := 0; v_doc text; v_desc text; v_fin text;
begin
  select * into n from fis_notas where id = app.uuid_campo(p->>'nota', 'nota') for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.gestao_pode(n.cliente_id, 'operar', array['entradas', 'financeiro']) then raise exception 'Sem permissão para lançar notas desta empresa'; end if;
  if n.direcao <> 'entrada' then raise exception 'Só notas de entrada são lançadas aqui'; end if;
  if n.processada then raise exception 'Esta nota já foi lançada'; end if;
  if n.situacao <> 'autorizada' then raise exception 'Nota cancelada ou denegada não pode ser lançada'; end if;
  if n.conteudo <> 'completa' then raise exception 'Ainda não temos o XML completo desta nota; dê ciência e aguarde a próxima busca, ou envie o XML'; end if;
  if n.modelo = 'outro' then raise exception 'Tipo de documento não aceito para lançamento'; end if;
  if n.modelo = '55' and coalesce(n.manifestacao, '') <> 'confirmada' then
    raise exception 'Confirme a operação na SEFAZ antes de lançar (só nota confirmada gera conta a pagar e estoque)';
  end if;
  select * into regra from app.fis_tipo_efetivo(n.cliente_id, v_tipo);
  if regra.movimenta_estoque is null then raise exception 'Escolha o tipo de entrada'; end if;
  v_data := coalesce(app.data_campo(p->>'data_entrada', 'data de entrada'), (n.emissao at time zone 'America/Sao_Paulo')::date, app.hoje(n.org_id));
  v_doc := app.fis_digitos(n.emitente_doc);

  if v_pessoa is null and v_doc is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = n.cliente_id and documento = v_doc order by ativo desc limit 1;
  end if;
  if v_pessoa is null then
    insert into fin_pessoas (org_id, cliente_id, tipo, nome, documento, uf)
    values (n.org_id, n.cliente_id, case when v_tipo = 'devolucao_venda' then 'cliente' else 'fornecedor' end,
            coalesce(nullif(trim(n.emitente_nome), ''), 'Fornecedor ' || coalesce(v_doc, '')),
            case when length(v_doc) in (11, 14) then v_doc end, case when n.emitente_uf ~ '^[A-Z]{2}$' then n.emitente_uf end)
    returning id into v_pessoa;
  elsif not exists (select 1 from fin_pessoas where id = v_pessoa and cliente_id = n.cliente_id) then
    raise exception 'Fornecedor não encontrado nesta empresa';
  end if;

  if regra.movimenta_estoque and v_local is null then
    select id into v_local from est_locais where cliente_id = n.cliente_id and padrao and ativo;
  end if;
  for ni in select * from fis_nota_itens where nota_id = n.id order by numero loop
    select x into it from jsonb_array_elements(coalesce(p->'itens', '[]')) x where (x->>'id') = ni.id::text;
    v_item := app.uuid_campo(it->>'item', 'item do estoque');
    v_fator := coalesce(app.numero_campo(it->>'fator', 'fator'), ni.fator, 1);
    if v_fator <= 0 then raise exception 'Fator de unidade inválido no item %', ni.numero; end if;
    if v_item is null and it ? 'novo' and jsonb_typeof(it->'novo') = 'object' then
      insert into est_itens (org_id, cliente_id, codigo, nome, tipo, unidade, controla_estoque, ncm, custo)
      values (n.org_id, n.cliente_id, nullif(trim(it->'novo'->>'codigo'), ''),
              coalesce(nullif(trim(it->'novo'->>'nome'), ''), ni.descricao), 'produto',
              upper(left(coalesce(nullif(trim(it->'novo'->>'unidade'), ''), ni.unidade, 'UN'), 6)),
              coalesce((it->'novo'->>'controla_estoque')::boolean, regra.movimenta_estoque),
              case when coalesce(it->'novo'->>'ncm', ni.ncm) ~ '^\d{8}$' then coalesce(it->'novo'->>'ncm', ni.ncm) end,
              case when ni.quantidade > 0 then round(ni.valor_total / (ni.quantidade * v_fator), 4) end)
      returning id into v_item;
    end if;
    if v_item is null and ni.codigo is not null and v_doc is not null then
      select item_id, fator into v_item, v_fator from fis_depara_itens
       where cliente_id = n.cliente_id and fornecedor_doc = v_doc and codigo_fornecedor = ni.codigo;
      v_fator := coalesce(app.numero_campo(it->>'fator', 'fator'), v_fator, 1);
    end if;
    if v_item is not null then
      select * into e from est_itens where id = v_item and cliente_id = n.cliente_id;
      if e.id is null then raise exception 'Item do estoque não encontrado nesta empresa (item % da nota)', ni.numero; end if;
      update fis_nota_itens set item_id = v_item, fator = v_fator where id = ni.id;
      if coalesce((it->>'lembrar')::boolean, true) and ni.codigo is not null and length(v_doc) in (11, 14) then
        insert into fis_depara_itens (org_id, cliente_id, fornecedor_doc, codigo_fornecedor, item_id, fator)
        values (n.org_id, n.cliente_id, v_doc, ni.codigo, v_item, v_fator)
        on conflict (cliente_id, fornecedor_doc, codigo_fornecedor) do update set item_id = excluded.item_id, fator = excluded.fator;
      end if;
    end if;
    if regra.movimenta_estoque then
      if v_item is null then raise exception 'Ligue o item % (%) a um item do estoque ou cadastre um novo', ni.numero, ni.descricao; end if;
      if e.controla_estoque and ni.quantidade > 0 then
        if v_local is null then raise exception 'Escolha o estoque (local) de entrada'; end if;
        v_qtd := round(ni.quantidade * v_fator, 4);
        v_custo := round((ni.valor_total + ni.frete + ni.seguro + ni.outros - ni.desconto + ni.ipi_valor + ni.icms_st_valor) / v_qtd, 4);
        v_movs := v_movs || app.est_gravar(v_item, v_local, v_data, 'entrada', v_qtd, greatest(v_custo, 0), 'nota_entrada', n.id::text,
                                           v_grupo, format('NF %s · %s', n.numero, left(coalesce(n.emitente_nome, ''), 60)));
      end if;
    end if;
    e := null;
  end loop;

  if regra.gera_pagar then
    v_cat := coalesce(v_cat, regra.categoria_id);
    if v_cat is null then raise exception 'Escolha a categoria (despesa) desta compra'; end if;
    v_n := jsonb_array_length(coalesce(p->'parcelas', '[]'));
    if v_n = 0 then raise exception 'Informe ao menos uma parcela (vencimento e valor)'; end if;
    for v_parc in select * from jsonb_array_elements(p->'parcelas') loop
      v_soma := v_soma + coalesce(app.numero_campo(v_parc->>'valor', 'valor da parcela'), 0);
    end loop;
    if round(v_soma, 2) > n.valor_total + 0.01 then
      raise exception 'A soma das parcelas (%) passa do valor da nota (%)', round(v_soma, 2), n.valor_total;
    end if;
    v_desc := format('NF %s · %s', coalesce(n.numero, ''), left(coalesce(n.emitente_nome, ''), 80));
    for v_parc in select * from jsonb_array_elements(p->'parcelas') loop
      k := k + 1;
      v_r := app.fin_lancar_titulos(jsonb_build_object(
        'cliente', n.cliente_id, 'tipo', 'pagar', 'pessoa', v_pessoa, 'categoria', v_cat, 'centro', nullif(p->>'centro', ''),
        'conta_prevista', nullif(p->>'conta_prevista', ''),
        'descricao', v_desc || case when v_n > 1 then format(' (%s/%s)', k, v_n) else '' end,
        'documento', left(format('NF %s%s', coalesce(n.numero, ''), case when v_n > 1 then '/' || k else '' end), 60),
        'emissao', (n.emissao at time zone 'America/Sao_Paulo')::date, 'vencimento', v_parc->>'vencimento',
        'valor', v_parc->>'valor', 'parcelas', 1, 'observacao', nullif(trim(p->>'observacao'), '')));
      v_titulos := v_titulos || array(select jsonb_array_elements_text(v_r->'titulos')::uuid);
    end loop;
    v_fin := current_setting('app.fin_interno', true);
    perform set_config('app.fin_interno', '1', true);
    update fin_titulos set nota_id = n.id where id = any(v_titulos);
    perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  end if;

  update fis_notas set processada = true, processada_em = now(), processada_por = auth.uid(), tipo_entrada = v_tipo,
         data_entrada = v_data, pessoa_id = v_pessoa, titulos = v_titulos,
         estoque_grupo = case when cardinality(v_movs) > 0 then v_grupo end, atualizado_em = now()
   where id = n.id;
  perform app.registrar(n.org_id, 'financeiro', 'notas_lancar', n.id::text, null,
    p || jsonb_build_object('titulos', to_jsonb(v_titulos), 'movimentos', to_jsonb(v_movs)));
  return jsonb_build_object('titulos', to_jsonb(v_titulos), 'movimentos', to_jsonb(v_movs), 'pessoa', v_pessoa);
end $$;

/**
 * Desfaz o lançamento de uma nota (036, M-01/M-03): cancela as contas a pagar dela no modo interno (recusa se alguma
 * já teve pagamento), estorna as entradas de estoque travando os itens em ordem de item e recalcula a ficha e o custo médio.
 */
create or replace function public.fis_desfazer_lancamento(p_nota uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare n fis_notas; m record; v_saldo numeric; v_neg boolean; v_fin text := current_setting('app.fin_interno', true); v_motivo text := trim(p_motivo);
begin
  select * into n from fis_notas where id = p_nota for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.gestao_pode(n.cliente_id, 'operar', array['entradas', 'financeiro']) then raise exception 'Sem permissão para desfazer o lançamento desta nota'; end if;
  if not n.processada then raise exception 'Esta nota não está lançada'; end if;
  if coalesce(v_motivo, '') = '' then raise exception 'Informe o motivo'; end if;
  perform 1 from fin_titulos where id = any(n.titulos) order by id for update;
  if exists (select 1 from fin_titulos where id = any(n.titulos) and (valor_pago > 0 or situacao = 'quitado')) then
    raise exception 'Uma conta a pagar desta nota já tem pagamento; estorne o pagamento antes';
  end if;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set situacao = 'cancelado', cancelado_motivo = 'Lançamento da nota desfeito: ' || v_motivo
   where id = any(n.titulos) and situacao = 'aberto';
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);

  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = n.cliente_id), false);
  -- trava os itens na ordem do item (duas operações ao mesmo tempo não se travam uma à outra)
  perform 1 from est_itens where id in (select item_id from est_movimentos where n.estoque_grupo is not null and grupo = n.estoque_grupo)
   order by id for update;
  for m in select * from est_movimentos where n.estoque_grupo is not null and grupo = n.estoque_grupo and origem = 'nota_entrada' and not estornado
            order by item_id, id loop
    if not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = m.item_id and local_id = m.local_id and not estornado;
      if v_saldo - m.quantidade < 0 then
        raise exception 'Desfazer deixaria o estoque negativo (item %, saldo atual %)', (select nome from est_itens where id = m.item_id), v_saldo;
      end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = 'Lançamento da nota desfeito: ' || v_motivo where id = m.id;
  end loop;
  for m in select item_id, min(data) as desde from est_movimentos
            where n.estoque_grupo is not null and grupo = n.estoque_grupo and origem = 'nota_entrada' group by item_id order by item_id loop
    perform app.est_recalcular(m.item_id, m.desde);
  end loop;
  update fis_notas set processada = false, processada_em = null, processada_por = null, titulos = '{}', estoque_grupo = null, atualizado_em = now()
   where id = n.id;
  perform app.registrar(n.org_id, 'financeiro', 'notas_desfazer', n.id::text, to_jsonb(n), jsonb_build_object('motivo', v_motivo));
end $$;

-- ===================================================================================================== 5 (M-06) estoque
/**
 * Grava um movimento (033) + 036: saída (quantidade negativa) sem estoque negativo liberado confere o saldo do local
 * na data do movimento e em todas as datas depois dela (a ficha não pode ficar negativa em nenhum dia).
 */
create or replace function app.est_gravar(
  p_item uuid, p_local uuid, p_data date, p_tipo text, p_qtd numeric, p_custo numeric,
  p_origem text, p_origem_id text, p_grupo uuid, p_obs text)
returns bigint language plpgsql security definer set search_path = public as $$
declare i est_itens; v_saldo numeric; v_id bigint; v_data date; v_fin text := current_setting('app.fin_interno', true); r record;
begin
  select * into i from est_itens where id = p_item for update;
  if i.id is null then raise exception 'Item não encontrado'; end if;
  if not i.controla_estoque then raise exception 'O item "%" não controla estoque', i.nome; end if;
  if not exists (select 1 from est_locais where id = p_local and cliente_id = i.cliente_id and ativo) then
    raise exception 'Estoque (local) não encontrado ou inativo';
  end if;
  if p_qtd is null or p_qtd = 0 then raise exception 'Informe a quantidade'; end if;
  if p_custo is not null and p_custo < 0 then raise exception 'O custo não pode ser negativo'; end if;
  v_data := coalesce(p_data, app.hoje(i.org_id));
  if p_qtd < 0 and not coalesce((select permite_negativo from est_parametros where cliente_id = i.cliente_id), false) then
    select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos
     where item_id = p_item and local_id = p_local and not estornado;
    if v_saldo + p_qtd < 0 then
      raise exception 'Estoque insuficiente de "%": saldo % %, saída de %', i.nome, trim(to_char(v_saldo, 'FM999999990.####')), i.unidade,
        trim(to_char(-p_qtd, 'FM999999990.####'));
    end if;
    -- saldo no fim do dia do movimento e depois de cada movimento posterior
    select v_data as dia, coalesce(sum(quantidade), 0) as saldo into r from est_movimentos
     where item_id = p_item and local_id = p_local and not estornado and data <= v_data;
    if r.saldo + p_qtd < 0 then
      raise exception 'Saída em % deixaria o estoque de "%" negativo naquele dia (saldo %). Use uma data em que havia saldo ou lance a entrada antes',
        to_char(v_data, 'DD/MM/YYYY'), i.nome, trim(to_char(r.saldo, 'FM999999990.####'));
    end if;
    select x.data as dia, x.saldo into r from (
      select m.data, m.id, sum(m.quantidade) over (order by m.data, m.id rows unbounded preceding) as saldo
        from est_movimentos m where m.item_id = p_item and m.local_id = p_local and not m.estornado) x
     where x.data > v_data and x.saldo + p_qtd < 0 order by x.data, x.id limit 1;
    if r.dia is not null and r.dia > v_data then
      raise exception 'Saída em % deixaria o estoque de "%" negativo em % (saldo %). Use uma data posterior ou ajuste antes',
        to_char(v_data, 'DD/MM/YYYY'), i.nome, to_char(r.dia, 'DD/MM/YYYY'), trim(to_char(r.saldo + p_qtd, 'FM999999990.####'));
    end if;
  end if;
  insert into est_movimentos (org_id, cliente_id, item_id, local_id, data, tipo, quantidade, custo_unitario, origem, origem_id, grupo, observacao, por)
  values (i.org_id, i.cliente_id, i.id, p_local, v_data, p_tipo, round(p_qtd, 4), round(p_custo, 4), p_origem, p_origem_id,
          p_grupo, nullif(trim(p_obs), ''), auth.uid())
  returning id into v_id;
  if p_tipo = 'entrada' and p_qtd > 0 and p_custo is not null and p_custo > 0 then
    perform set_config('app.fin_interno', '1', true);
    update est_itens set custo = round(p_custo, 4) where id = i.id and custo is distinct from round(p_custo, 4);
    perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  end if;
  perform app.est_recalcular(i.id, v_data);
  return v_id;
end $$;

-- ===================================================================================================== 1/5 pedidos
/** Pedido: venda grava com Saídas ou Financeiro; compra com Entradas ou Financeiro (toda gravação passa por aqui). */
create or replace function app.tg_est_pedido_permissao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not app.gestao_pode(new.cliente_id, 'operar',
       case new.tipo when 'venda' then array['saidas', 'financeiro'] else array['entradas', 'financeiro'] end) then
    raise exception 'Sem permissão para pedidos de % desta empresa (precisa de % ou Financeiro)',
      new.tipo, case new.tipo when 'venda' then 'Saídas' else 'Entradas' end;
  end if;
  return new;
end $$;
revoke all on function app.tg_est_pedido_permissao() from public, anon, authenticated;
drop trigger if exists est_pedido_permissao on public.est_pedidos;
create trigger est_pedido_permissao before insert or update on public.est_pedidos
  for each row execute function app.tg_est_pedido_permissao();

create or replace function app.est_pedido_travar(p_pedido uuid)
returns est_pedidos language plpgsql security definer set search_path = public as $$
declare ped est_pedidos;
begin
  select * into ped from est_pedidos where id = p_pedido for update;
  if ped.id is null then raise exception 'Pedido não encontrado'; end if;
  if not app.gestao_pode(ped.cliente_id, 'operar', case ped.tipo when 'venda' then array['saidas', 'financeiro'] else array['entradas', 'financeiro'] end) then
    raise exception 'Sem permissão para mexer nos pedidos desta empresa';
  end if;
  return ped;
end $$;

/** Lança estoque e financeiro do pedido (033) + 036: contas pela função interna (quem tem Saídas/Entradas gera as contas). */
create or replace function app.est_pedido_lancar(p_pedido uuid, p_data date, p_pago jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  ped est_pedidos; l record; v_mov bigint; v_custo numeric; v_ajuste numeric; v_nome text; v_pessoa text; e jsonb; n int; r jsonb;
  v_tit text; v_data date;
begin
  select * into ped from est_pedidos where id = p_pedido;
  v_nome := app.est_pedido_nome(ped);
  v_data := coalesce(p_data, ped.data);
  if exists (select 1 from est_pedido_itens pl join est_itens it on it.id = pl.item_id
              where pl.pedido_id = ped.id and not pl.removido and it.controla_estoque) and ped.local_id is null then
    raise exception 'Escolha o estoque (local) de onde os produtos % ', case ped.tipo when 'venda' then 'saem' else 'entram' end;
  end if;
  v_ajuste := ped.frete - ped.desconto;

  for l in select pl.*, i.controla_estoque, i.custo_medio, i.custo as custo_item
             from est_pedido_itens pl join est_itens i on i.id = pl.item_id
            where pl.pedido_id = ped.id and not pl.removido order by pl.item_id, pl.ordem loop
    v_mov := null;
    if ped.tipo = 'venda' then
      v_mov := app.est_saida(l.item_id, ped.local_id, v_data, l.quantidade * l.fator, 'pedido_venda', ped.id::text);
      v_custo := coalesce((select custo_medio from est_itens where id = l.item_id), l.custo_item);
    else
      v_custo := round((l.total + case when ped.total_itens > 0 then v_ajuste * l.total / ped.total_itens else 0 end) / (l.quantidade * l.fator), 4);
      if v_custo < 0 then v_custo := 0; end if;
      if l.controla_estoque then
        v_mov := app.est_gravar(l.item_id, ped.local_id, v_data, 'entrada', l.quantidade * l.fator, v_custo, 'pedido_compra', ped.id::text, null, v_nome);
      end if;
    end if;
    if v_mov is not null and ped.tipo = 'venda' then
      update est_movimentos set observacao = v_nome where id = v_mov;
    end if;
    update est_pedido_itens set movimento_id = v_mov, custo_unitario = v_custo where id = l.id;
  end loop;

  if ped.total > 0 then
    if ped.categoria_id is null then
      raise exception 'Escolha a categoria do pedido (%) para gerar as contas a %',
        case ped.tipo when 'venda' then 'receita, ex.: Venda de mercadorias' else 'despesa, ex.: Compra de mercadorias' end,
        case ped.tipo when 'venda' then 'receber' else 'pagar' end;
    end if;
    select nome into v_pessoa from fin_pessoas where id = ped.pessoa_id;
    n := jsonb_array_length(ped.parcelas);
    for e in select * from jsonb_array_elements(ped.parcelas) loop
      r := app.fin_lancar_titulos(jsonb_build_object(
        'cliente', ped.cliente_id, 'tipo', case ped.tipo when 'venda' then 'receber' else 'pagar' end,
        'pessoa', ped.pessoa_id, 'categoria', ped.categoria_id, 'centro', ped.centro_id,
        'descricao', v_nome || coalesce(' · ' || v_pessoa, '') || case when n > 1 then format(' (%s/%s)', e->>'numero', n) else '' end,
        'documento', coalesce(ped.documento, case ped.tipo when 'venda' then 'PV ' else 'PC ' end || ped.numero),
        'emissao', ped.data, 'vencimento', e->>'vencimento', 'valor', (e->>'valor')::numeric, 'parcelas', 1,
        'observacao', ped.observacao, 'pago', p_pago));
      for v_tit in select jsonb_array_elements_text(r->'titulos') loop
        insert into est_pedido_titulos (titulo_id, pedido_id, org_id, cliente_id) values (v_tit::uuid, ped.id, ped.org_id, ped.cliente_id);
      end loop;
    end loop;
  end if;
  update est_pedidos set lancado_em = now(), lancado_por = auth.uid() where id = ped.id;
end $$;

/**
 * Cancela o pedido (033) + 036 (M-05): venda já faturada (nota emitida) só cancela com Financeiro (gerir) e com motivo
 * que cite a nota (o cancelamento da nota na SEFAZ é feito fora do HUB).
 */
create or replace function public.est_pedido_cancelar(p_pedido uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ped est_pedidos; t record; m record; v_neg boolean; v_saldo numeric; v_nome text; v_motivo text := trim(p_motivo);
  v_fin text := current_setting('app.fin_interno', true);
begin
  ped := app.est_pedido_travar(p_pedido);
  if ped.situacao = 'cancelado' then raise exception 'Este pedido já está cancelado'; end if;
  if coalesce(v_motivo, '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  if ped.situacao = 'faturado' then
    if not app.hub_pode(ped.org_id, 'financeiro', 'gerir') then
      raise exception 'Esta venda já foi faturada (nota emitida): só a equipe MDC com Financeiro (gerir) pode cancelar';
    end if;
    if v_motivo !~* '(nota|\mnf)' and (ped.documento is null or strpos(lower(v_motivo), lower(ped.documento)) = 0) then
      raise exception 'Venda faturada: no motivo, cite a nota fiscal e o que foi feito com ela (ex.: "NF 77 cancelada na SEFAZ")';
    end if;
  end if;
  v_nome := app.est_pedido_nome(ped);

  for t in select ft.* from fin_titulos ft join est_pedido_titulos pt on pt.titulo_id = ft.id
            where pt.pedido_id = ped.id order by ft.id for update of ft loop
    if t.valor_pago > 0 then
      raise exception 'Não dá para cancelar: a parcela de % (vencimento %) já tem % registrado. Estorne o % em Contas a % e tente de novo',
        app.brl(t.valor), to_char(t.vencimento, 'DD/MM/YYYY'),
        case t.tipo when 'receber' then 'recebimento' else 'pagamento' end,
        case t.tipo when 'receber' then 'recebimento' else 'pagamento' end,
        case t.tipo when 'receber' then 'receber' else 'pagar' end;
    end if;
  end loop;

  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = ped.cliente_id), false);
  for m in select mv.*, i.nome as item_nome, i.unidade from est_movimentos mv join est_itens i on i.id = mv.item_id
            where mv.origem = 'pedido_' || ped.tipo and mv.origem_id = ped.id::text and not mv.estornado
            order by mv.item_id, mv.id loop
    perform 1 from est_itens where id = m.item_id for update;
    if m.quantidade > 0 and not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = m.item_id and local_id = m.local_id and not estornado;
      if v_saldo - m.quantidade < 0 then
        raise exception 'Não dá para cancelar: parte de "%" desta compra já saiu do estoque (saldo %, a compra trouxe %). Lance a devolução ou um ajuste antes',
          m.item_nome, trim(to_char(v_saldo, 'FM999999990.####')), trim(to_char(m.quantidade, 'FM999999990.####'));
      end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = 'Cancelamento do ' || v_nome || ': ' || v_motivo
     where id = m.id;
    perform app.est_recalcular(m.item_id, m.data);
  end loop;

  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set situacao = 'cancelado', cancelado_motivo = 'Cancelamento do ' || v_nome || ': ' || v_motivo
   where id in (select titulo_id from est_pedido_titulos where pedido_id = ped.id) and situacao = 'aberto';
  update est_pedidos set situacao = 'cancelado', cancelado_em = now(), cancelado_motivo = v_motivo where id = ped.id;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  perform app.registrar(ped.org_id, 'financeiro', 'pedido_cancelar', ped.id::text, to_jsonb(ped), jsonb_build_object('motivo', v_motivo));
end $$;

-- ===================================================================================================== 5 (M-04) contrato de licença sem corrida
/**
 * Módulo de contrato: trava o cliente e confere de novo, já com o que as outras gravações confirmaram, que o módulo não
 * está em outro contrato ativo do mesmo cliente. Fecha a corrida de dois lic_salvar_contrato ao mesmo tempo.
 */
create or replace function app.tg_lic_contrato_produto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_nome text;
begin
  select cliente_id into v_cli from lic_contratos where id = new.contrato_id;
  perform 1 from clientes where id = v_cli for update;
  select p.nome into v_nome from lic_contratos k join lic_contrato_produtos cp on cp.contrato_id = k.id join lic_produtos p on p.id = cp.produto_id
   where k.cliente_id = v_cli and k.situacao = 'ativo' and k.id <> new.contrato_id and cp.produto_id = new.produto_id limit 1;
  if v_nome is not null then
    raise exception 'O cliente já tem contrato ativo com: %. Edite aquele contrato ou encerre antes', v_nome;
  end if;
  return new;
end $$;
revoke all on function app.tg_lic_contrato_produto() from public, anon, authenticated;
drop trigger if exists lic_contrato_produto_unico on public.lic_contrato_produtos;
create trigger lic_contrato_produto_unico before insert or update on public.lic_contrato_produtos
  for each row execute function app.tg_lic_contrato_produto();

-- ===================================================================================================== 9 (B-05) rotina diária de licenças
alter table public.lic_cobrancas add column if not exists aviso_bloqueio_em timestamptz;
comment on column public.lic_cobrancas.aviso_bloqueio_em is 'Quando o HUB avisou que esta mensalidade chegou ao atraso de sugerir bloqueio (avisa uma vez só).';

create or replace function app.lic_rotina_diaria()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record; k record; v_hoje date; v_dias int; v_ultimo date; n_enc int; n_ger int; n_venc int; v_venc numeric; n_sug int; v_texto text; u record;
  v_total_ger int := 0; v_total_enc int := 0; v_avisos int := 0; v_clientes uuid[];
begin
  for o in select id from organizacoes loop
    v_hoje := app.hoje(o.id);
    insert into lic_parametros (org_id) values (o.id) on conflict do nothing;
    select dias_sugerir_bloqueio, ultimo_aviso into v_dias, v_ultimo from lic_parametros where org_id = o.id for update;

    n_enc := 0;
    for k in select * from lic_contratos where org_id = o.id and situacao = 'ativo' and fim is not null and fim < v_hoje order by id for update loop
      update lic_contratos set situacao = 'encerrado', encerrado_em = k.fim, encerrado_motivo = 'Fim do prazo do contrato' where id = k.id;
      perform app.registrar(o.id, 'licencas', 'encerrar_contrato', k.id::text, to_jsonb(k),
        jsonb_build_object('data', k.fim, 'motivo', 'Fim do prazo do contrato', 'por', 'rotina diária'));
      n_enc := n_enc + 1;
    end loop;
    -- mês atual e o anterior (se a rotina falhou no dia 1, o mês passado também sai)
    n_ger := app.lic_gerar(o.id, v_hoje) + app.lic_gerar(o.id, (date_trunc('month', v_hoje) - interval '1 month')::date);
    v_total_ger := v_total_ger + n_ger;
    v_total_enc := v_total_enc + n_enc;

    if v_ultimo is distinct from v_hoje then
      select count(*), coalesce(sum(valor), 0) into n_venc, v_venc
        from lic_cobrancas where org_id = o.id and situacao = 'aberta' and vencimento = v_hoje - 1;
      -- chegou (ou passou) do atraso de sugerir bloqueio e ainda não foi avisado
      select array_agg(distinct c.cliente_id) into v_clientes
        from lic_cobrancas c where c.org_id = o.id and c.situacao = 'aberta' and c.vencimento <= v_hoje - v_dias
         and c.aviso_bloqueio_em is null and not app.cliente_bloqueado(c.cliente_id);
      n_sug := coalesce(cardinality(v_clientes), 0);
      if n_venc > 0 or n_sug > 0 then
        v_texto := concat_ws(' ',
          case when n_venc > 0 then format('%s mensalidade(s) venceram ontem sem baixa (R$ %s).', n_venc,
                                            translate(to_char(v_venc, 'FM999,999,990.00'), ',.', '.,')) end,
          case when n_sug > 0 then format('%s cliente(s) chegaram a %s dias de atraso: avalie o bloqueio.', n_sug, v_dias) end);
        for u in select m.user_id from membros m
                  where m.org_id = o.id and m.ativo
                    and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id and a.app = 'licencas'))
        loop
          perform app.notificar(o.id, u.user_id, 'licencas', 'Licenças: mensalidades em atraso', v_texto, '/licencas/inadimplentes');
          v_avisos := v_avisos + 1;
        end loop;
      end if;
      if n_sug > 0 then
        update lic_cobrancas set aviso_bloqueio_em = now()
         where org_id = o.id and situacao = 'aberta' and vencimento <= v_hoje - v_dias and aviso_bloqueio_em is null
           and cliente_id = any (v_clientes);
      end if;
      update lic_parametros set ultimo_aviso = v_hoje where org_id = o.id;
    end if;
  end loop;
  return jsonb_build_object('geradas', v_total_ger, 'encerrados', v_total_enc, 'avisos', v_avisos);
end $$;
revoke all on function app.lic_rotina_diaria() from public, anon, authenticated;

-- ===================================================================================================== 2/6 permissões do Portal
/**
 * Permissões válidas do Portal (lista fechada; mesma lista de web/src/dominios/portal/permissoes.ts). Liberar o
 * Financeiro (financeiro = ver e lançar; financeiro_ver = só ver) exige Financeiro (gerir) na organização.
 * Devolve a lista limpa (sem repetição; financeiro já inclui financeiro_ver).
 */
create or replace function app.portal_perm_validas(p_org uuid, p_perm text[])
returns text[] language plpgsql stable security definer set search_path = public as $$
declare v_ruins text; v_lista text[];
begin
  if p_perm is null or cardinality(p_perm) = 0 then raise exception 'Marque ao menos uma área do portal'; end if;
  select string_agg(x, ', ') into v_ruins from unnest(p_perm) x
   where x is null or x not in ('demonstrativos', 'rotinas', 'chat', 'documentos', 'societario', 'folha', 'financeiro', 'financeiro_ver');
  if v_ruins is not null then raise exception 'Permissão do portal desconhecida: %', coalesce(v_ruins, '(vazia)'); end if;
  if p_perm && array['financeiro', 'financeiro_ver'] and not app.hub_pode(p_org, 'financeiro', 'gerir') then
    raise exception 'Só quem gere o Financeiro (gerir) pode liberar o Financeiro no Portal';
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(p_perm) x
   where not (x = 'financeiro_ver' and 'financeiro' = any (p_perm));
  return v_lista;
end $$;
revoke all on function app.portal_perm_validas(uuid, text[]) from public, anon, authenticated;

/** Gravação direta em portal_usuarios/portal_convites: lista fechada; Financeiro só com gerir (quando muda). */
create or replace function app.tg_portal_perm()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_novas text[];
begin
  v_novas := array(select x from unnest(new.permissoes) x
                    where tg_op = 'INSERT' or not (x = any (coalesce(old.permissoes, '{}'))));
  -- só a lista fechada (a recusa do Financeiro vale para quem acrescenta; o banco aplicando um convite já conferido passa)
  if exists (select 1 from unnest(new.permissoes) x
              where x is null or x not in ('demonstrativos', 'rotinas', 'chat', 'documentos', 'societario', 'folha', 'financeiro', 'financeiro_ver')) then
    perform app.portal_perm_validas(new.org_id, new.permissoes);
  end if;
  if auth.uid() is not null and v_novas && array['financeiro', 'financeiro_ver'] and not app.hub_pode(new.org_id, 'financeiro', 'gerir') then
    raise exception 'Só quem gere o Financeiro (gerir) pode liberar o Financeiro no Portal';
  end if;
  return new;
end $$;
revoke all on function app.tg_portal_perm() from public, anon, authenticated;
drop trigger if exists portal_perm_valida on public.portal_usuarios;
create trigger portal_perm_valida before insert or update of permissoes on public.portal_usuarios
  for each row execute function app.tg_portal_perm();
drop trigger if exists portal_perm_valida on public.portal_convites;
create trigger portal_perm_valida before insert or update of permissoes on public.portal_convites
  for each row execute function app.tg_portal_perm();

-- convites do Portal: cancelar com motivo (15) em vez de apagar
alter table public.portal_convites
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_motivo text;
comment on column public.portal_convites.cancelado_em is 'Convite cancelado (com motivo): não vale mais, mas fica guardado.';

create or replace function public.portal_convidar(p_cliente uuid, p_email text, p_nome text, p_permissoes text[] default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_user uuid; v_email text := lower(trim(p_email)); v_perm text[];
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not (app.eh_gestor(v_org) or app.hub_pode(v_org, 'atendimento', 'gerir')) then
    raise exception 'Sem permissão para convidar usuários do cliente';
  end if;
  v_perm := app.portal_perm_validas(v_org, coalesce(p_permissoes, array['demonstrativos','rotinas','chat','documentos','societario']));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido: %', p_email; end if;
  if exists (select 1 from membros m join auth.users u on u.id = m.user_id where lower(u.email) = v_email)
     or exists (select 1 from app.convites c where c.email = v_email) then
    raise exception 'Este e-mail não pode receber acesso de cliente; use outro e-mail';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into portal_convites (org_id, email, cliente_id, nome, permissoes)
    values (v_org, v_email, p_cliente, nullif(trim(p_nome), ''), v_perm)
    on conflict (email, cliente_id) do update set nome = excluded.nome, permissoes = excluded.permissoes,
      cancelado_em = null, cancelado_por = null, cancelado_motivo = null;
    perform app.registrar(v_org, 'portal', 'convite', p_cliente::text, null, jsonb_build_object('email', v_email, 'permissoes', v_perm));
    return 'convite';
  end if;
  insert into portal_usuarios (org_id, user_id, cliente_id, nome, email, permissoes)
  values (v_org, v_user, p_cliente, coalesce(nullif(trim(p_nome), ''), split_part(v_email, '@', 1)), v_email, v_perm)
  on conflict (user_id, cliente_id) do update set permissoes = excluded.permissoes, ativo = true, nome = excluded.nome;
  perform app.registrar(v_org, 'portal', 'convite', p_cliente::text, null, to_jsonb(v_email));
  return 'liberado';
end $$;

/** Cancela um convite do Portal ainda não usado (com motivo; fica guardado e na auditoria). */
create or replace function public.portal_cancelar_convite(p_cliente uuid, p_email text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c portal_convites;
begin
  select * into c from portal_convites where cliente_id = p_cliente and email = lower(trim(p_email)) for update;
  if c.email is null then raise exception 'Convite não encontrado'; end if;
  if not (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')) then
    raise exception 'Sem permissão para cancelar convites do portal';
  end if;
  if c.cancelado_em is not null then raise exception 'Este convite já foi cancelado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  update portal_convites set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = trim(p_motivo)
   where cliente_id = c.cliente_id and email = c.email;
  perform app.registrar(c.org_id, 'portal', 'cancelar_convite', c.cliente_id::text, to_jsonb(c.email), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.portal_cancelar_convite(uuid, text, text) from public, anon;
grant execute on function public.portal_cancelar_convite(uuid, text, text) to authenticated;

/** Ao criar a conta: aplica os convites do Portal NÃO cancelados e tira da lista os usados (exclusão feita pelo banco). */
create or replace function app.aplicar_convites_portal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.portal_usuarios (org_id, user_id, cliente_id, nome, email, permissoes)
    select c.org_id, new.id, c.cliente_id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.permissoes
      from public.portal_convites c where c.email = lower(new.email) and c.cancelado_em is null
    on conflict do nothing;
    perform set_config('app.pode_apagar', '1', true);
    delete from public.portal_convites where email = lower(new.email) and cancelado_em is null;
    perform set_config('app.pode_apagar', '', true);
  exception when others then
    raise warning 'aplicar_convites_portal: %', sqlerrm;
  end;
  return new;
end $$;

-- link e envio de convite: convite cancelado não vale
create or replace function public.hub_pode_ver_link_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_org uuid; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  if v_conta.id is not null and (v_conta.email_confirmed_at is not null or v_conta.last_sign_in_at is not null) then
    return false;
  end if;
  v_equipe := exists (select 1 from app.convites c where c.email = v_email)
           or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id));
  if v_equipe then
    if exists (select 1 from app.convites c where c.email = v_email and app.papel(c.org_id) is distinct from 'admin')
       or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id
                                                 and app.papel(m.org_id) is distinct from 'admin')) then
      return false;
    end if;
    select coalesce(
      (select c.org_id from app.convites c where c.email = v_email limit 1),
      (select m.org_id from membros m where m.user_id = v_conta.id limit 1)) into v_org;
  else
    select c.org_id into v_org from portal_convites c
     where c.email = v_email and c.cancelado_em is null and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')) limit 1;
    if v_org is null and v_conta.id is not null then
      select p.org_id into v_org from portal_usuarios p
       where p.user_id = v_conta.id and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')) limit 1;
    end if;
  end if;
  if v_org is null then return false; end if;
  perform app.registrar(v_org, 'acessos', 'link_convite', v_email, null, jsonb_build_object('pedido_por', auth.uid()));
  return true;
end $$;

create or replace function public.hub_pode_enviar_convite(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_conta auth.users; v_ok boolean; v_equipe boolean;
begin
  if auth.uid() is null then return false; end if;
  select * into v_conta from auth.users where lower(email) = v_email;
  if v_conta.id is not null and not (v_conta.invited_at is not null and v_conta.email_confirmed_at is null
                                     and v_conta.last_sign_in_at is null) then
    return false;
  end if;
  v_equipe := exists (select 1 from app.convites c where c.email = v_email)
           or (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id));
  if v_equipe then
    v_ok := not exists (select 1 from app.convites c where c.email = v_email and app.papel(c.org_id) is distinct from 'admin')
        and not (v_conta.id is not null and exists (select 1 from membros m where m.user_id = v_conta.id
                                                       and app.papel(m.org_id) is distinct from 'admin'));
  elsif v_conta.id is null then
    v_ok := exists (select 1 from portal_convites c where c.email = v_email and c.cancelado_em is null
                     and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')));
  else
    v_ok := exists (select 1 from portal_usuarios p where p.user_id = v_conta.id
                     and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')));
  end if;
  if not v_ok then return false; end if;
  if (select count(*) from app.convite_envios where user_id = auth.uid() and em > now() - interval '1 day') >= 40 then
    raise exception 'Limite diário de convites atingido. Tente amanhã.';
  end if;
  insert into app.convite_envios (user_id, email) values (auth.uid(), v_email);
  return true;
end $$;

-- ===================================================================================================== 7 (B-01/S-07) Storage
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists est_fotos_ver on storage.objects';
    execute $p$create policy est_fotos_ver on storage.objects for select to authenticated
      using (bucket_id = 'hub-arquivos' and (storage.foldername(name))[2] = 'estoque'
             and app.cliente_da_org(app.uuid_ou_nulo((storage.foldername(name))[3]), app.uuid_ou_nulo((storage.foldername(name))[1]))
             and app.fin_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'ver'))$p$;
    execute 'drop policy if exists est_fotos_enviar on storage.objects';
    execute $p$create policy est_fotos_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'hub-arquivos' and (storage.foldername(name))[2] = 'estoque'
                  and app.cliente_da_org(app.uuid_ou_nulo((storage.foldername(name))[3]), app.uuid_ou_nulo((storage.foldername(name))[1]))
                  and app.fin_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'operar')
                  and lower(name) ~ '\.(jpg|jpeg|png|webp)$')$p$;
    execute 'drop policy if exists hub_storage_cliente_insert on storage.objects';
    execute $p$create policy hub_storage_cliente_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'hub-arquivos' and (storage.foldername(name))[2] = 'portal'
                  and app.cliente_da_org(app.uuid_ou_nulo((storage.foldername(name))[3]), app.uuid_ou_nulo((storage.foldername(name))[1]))
                  and (app.portal_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'documentos')
                       or app.portal_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'chat')))$p$;
  end if;
end $$;

-- ===================================================================================================== 10 (B-07) índices
create index if not exists lic_contratos_cliente_ativo on public.lic_contratos (cliente_id) where situacao = 'ativo';
create index if not exists fin_extrato_linhas_lote on public.fin_extrato_linhas (lote_id);
create index if not exists fin_titulos_pessoa on public.fin_titulos (pessoa_id) where pessoa_id is not null;
create index if not exists fin_titulos_categoria on public.fin_titulos (categoria_id);
create index if not exists est_pedido_itens_movimento on public.est_pedido_itens (movimento_id) where movimento_id is not null;
create index if not exists fis_nota_itens_item on public.fis_nota_itens (item_id) where item_id is not null;
create index if not exists est_pedidos_pessoa on public.est_pedidos (pessoa_id) where pessoa_id is not null;

-- ===================================================================================================== 13 (S-08) leads do Simulador
create or replace function public.crm_receber_lead(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_dest uuid;
begin
  if coalesce((p->>'consentimento')::boolean, false) is not true then return; end if;
  if char_length(coalesce(p->>'nome','')) not between 2 and 120 or char_length(coalesce(p->>'empresa','')) not between 2 and 160 then return; end if;
  select id into v_org from organizacoes order by criado_em limit 1;
  -- trava curta por organização: a contagem e a gravação não se cruzam entre dois envios ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('crm_receber_lead:' || v_org::text));
  if (select count(*) from crm_oportunidades where org_id = v_org and origem = 'simulador' and criado_em > now() - interval '1 minute') >= 20 then
    raise exception 'Muitos envios em pouco tempo. Tente de novo em um minuto.';
  end if;
  insert into crm_oportunidades (org_id, empresa, razao_social, cnpj, contato_nome, email, whatsapp, cidade, uf, atividade,
                                 regime_atual, faturamento, origem, origem_ref, dados_origem)
  values (v_org, left(p->>'empresa', 160), left(p->>'razao_social', 200), left(p->>'cnpj', 18), left(p->>'nome', 120),
          left(p->>'email', 160), left(p->>'whatsapp', 20), left(p->>'cidade', 80), left(p->>'uf', 2), left(p->>'atividade', 20),
          left(p->>'regime_atual', 20), app.numero_campo(p->>'faturamento', 'faturamento'), 'simulador', coalesce(left(p->>'id', 60), gen_random_uuid()::text),
          jsonb_strip_nulls(jsonb_build_object(
            'melhor_regime', p->'melhor_regime', 'economia_estimada', p->'economia_estimada', 'carga_pct_melhor', p->'carga_pct_melhor',
            'folha', p->'folha', 'compras', p->'compras', 'margem', p->'margem', 'pct_b2b', p->'pct_b2b',
            'cnae', p->'cnae', 'cnae_descricao', p->'cnae_descricao', 'porte', p->'porte', 'situacao_cadastral', p->'situacao_cadastral',
            'origem', p->'origem', 'utm', p->'utm', 'criado_em_simulador', p->'created_at')))
  on conflict (org_id, origem, origem_ref) do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  for v_dest in select m.user_id from membros m where m.org_id = v_org and m.ativo
                  and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = v_org and a.user_id = m.user_id and a.app = 'comercial'))
  loop
    perform app.notificar(v_org, v_dest, 'comercial', 'Novo lead: ' || left(p->>'empresa', 80),
                          coalesce(p->>'nome', '') || coalesce(' · ' || (p->>'cidade'), ''), '/comercial/' || v_id);
  end loop;
end $$;
revoke execute on function public.crm_receber_lead(jsonb) from public;
grant execute on function public.crm_receber_lead(jsonb) to anon, authenticated;
create index if not exists crm_op_simulador_recentes on public.crm_oportunidades (org_id, criado_em) where origem = 'simulador';

-- ===================================================================================================== 15 nada se apaga
/** Recusa apagar (o motivo/caminho certo vem no argumento). Só o próprio banco, marcando app.pode_apagar, passa. */
create or replace function app.tg_nada_se_apaga()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.pode_apagar', true), '') = '1' then return old; end if;
  raise exception 'Nada se apaga no HUB: %', tg_argv[0];
end $$;
revoke all on function app.tg_nada_se_apaga() from public, anon, authenticated;

-- tarefas: cancelar com motivo
alter table public.tarefas
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_motivo text;
drop policy if exists tarefas_delete on public.tarefas;
revoke delete on public.tarefas from authenticated, anon;
drop trigger if exists nada_se_apaga on public.tarefas;
create trigger nada_se_apaga before delete on public.tarefas
  for each row execute function app.tg_nada_se_apaga('cancele a tarefa (com motivo)');

create or replace function public.tarefa_cancelar(p_tarefa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa for update;
  if t.id is null then raise exception 'Tarefa não encontrada'; end if;
  if not (app.eh_gestor(t.org_id)
          or (app.papel(t.org_id) = 'analista' and (t.responsavel_id = auth.uid() or t.criado_por = auth.uid()
               or (t.setor_id is not null and t.setor_id = app.meu_setor(t.org_id))))) then
    raise exception 'Sem permissão para cancelar esta tarefa';
  end if;
  if t.status::text = 'cancelada' then raise exception 'Esta tarefa já está cancelada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  update tarefas set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = trim(p_motivo) where id = t.id;
  perform app.registrar(t.org_id, 'tarefas', 'cancelar_tarefa', t.id::text, jsonb_build_object('titulo', t.titulo, 'status', t.status),
    jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.tarefa_cancelar(uuid, text) from public, anon;
grant execute on function public.tarefa_cancelar(uuid, text) to authenticated;

-- vencimentos: encerrar com motivo
alter table public.venc_itens
  add column if not exists encerrado_em timestamptz,
  add column if not exists encerrado_por uuid,
  add column if not exists encerrado_motivo text;
drop policy if exists venc_delete on public.venc_itens;
revoke delete on public.venc_itens from authenticated, anon;
drop trigger if exists nada_se_apaga on public.venc_itens;
create trigger nada_se_apaga before delete on public.venc_itens
  for each row execute function app.tg_nada_se_apaga('encerre o vencimento (com motivo)');

create or replace function public.venc_encerrar(p_item uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v venc_itens;
begin
  select * into v from venc_itens where id = p_item for update;
  if v.id is null then raise exception 'Vencimento não encontrado'; end if;
  if not app.hub_pode(v.org_id, 'vencimentos', 'gerir') then raise exception 'Sem permissão para encerrar vencimentos'; end if;
  if v.status <> 'ativo' then raise exception 'Este vencimento já não está ativo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  update venc_itens set status = 'encerrado', encerrado_em = now(), encerrado_por = auth.uid(), encerrado_motivo = trim(p_motivo) where id = v.id;
  perform app.registrar(v.org_id, 'vencimentos', 'encerrar', v.id::text, to_jsonb(v), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.venc_encerrar(uuid, text) from public, anon;
grant execute on function public.venc_encerrar(uuid, text) to authenticated;

-- CRM: arquivar (crm_arquivar, 019) no lugar de excluir
drop policy if exists crm_op_delete on public.crm_oportunidades;
drop policy if exists crm_at_write on public.crm_atividades;
create policy crm_at_insert on public.crm_atividades for insert to authenticated with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_at_update on public.crm_atividades for update to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));
drop policy if exists crm_ct_write on public.crm_contratos;
create policy crm_ct_insert on public.crm_contratos for insert to authenticated with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_ct_update on public.crm_contratos for update to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));
revoke delete on public.crm_oportunidades, public.crm_atividades, public.crm_contratos from authenticated, anon;
drop trigger if exists nada_se_apaga on public.crm_oportunidades;
create trigger nada_se_apaga before delete on public.crm_oportunidades
  for each row execute function app.tg_nada_se_apaga('arquive a oportunidade (com motivo)');
drop trigger if exists nada_se_apaga on public.crm_atividades;
create trigger nada_se_apaga before delete on public.crm_atividades
  for each row execute function app.tg_nada_se_apaga('a atividade fica no histórico da oportunidade');
drop trigger if exists nada_se_apaga on public.crm_contratos;
create trigger nada_se_apaga before delete on public.crm_contratos
  for each row execute function app.tg_nada_se_apaga('mude o contrato para cancelado');

-- feriados: inativar com motivo (o cálculo de dia útil ignora os inativos)
alter table public.feriados
  add column if not exists ativo boolean not null default true,
  add column if not exists inativado_em timestamptz,
  add column if not exists inativado_por uuid,
  add column if not exists inativado_motivo text;
drop index if exists public.feriados_uk;
create unique index if not exists feriados_uk_ativo on public.feriados (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), data) where ativo;
drop policy if exists feriados_write on public.feriados;
create policy feriados_insert on public.feriados for insert to authenticated
  with check (org_id is not null and app.eh_gestor(org_id));
create policy feriados_update on public.feriados for update to authenticated
  using (org_id is not null and app.eh_gestor(org_id)) with check (org_id is not null and app.eh_gestor(org_id));
revoke delete on public.feriados from authenticated, anon;
drop trigger if exists nada_se_apaga on public.feriados;
create trigger nada_se_apaga before delete on public.feriados
  for each row execute function app.tg_nada_se_apaga('inative o feriado (com motivo)');

create or replace function app.dia_util(p_org uuid, p_data date, p_ajuste public.ajuste_vencimento)
returns date language plpgsql stable set search_path = public as $$
declare d date := p_data; passo int;
begin
  if p_ajuste = 'nenhum' then return d; end if;
  passo := case when p_ajuste = 'antecipa' then -1 else 1 end;
  while extract(isodow from d) in (6, 7)
     or exists (select 1 from public.feriados f where f.data = d and f.ativo and (f.org_id is null or f.org_id = p_org)) loop
    d := d + passo;
  end loop;
  return d;
end $$;

create or replace function public.feriado_inativar(p_feriado uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare f feriados;
begin
  select * into f from feriados where id = p_feriado for update;
  if f.id is null then raise exception 'Feriado não encontrado'; end if;
  if f.org_id is null then raise exception 'Feriado nacional não pode ser tirado'; end if;
  if not app.eh_gestor(f.org_id) then raise exception 'Sem permissão para mudar os feriados'; end if;
  if not f.ativo then raise exception 'Este feriado já está inativo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  update feriados set ativo = false, inativado_em = now(), inativado_por = auth.uid(), inativado_motivo = trim(p_motivo) where id = f.id;
  perform app.registrar(f.org_id, 'config', 'inativar_feriado', f.id::text, to_jsonb(f), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.feriado_inativar(uuid, text) from public, anon;
grant execute on function public.feriado_inativar(uuid, text) to authenticated;

-- perfis de acesso: inativar com motivo (as pessoas do perfil passam a acesso manual, mantendo o que têm)
alter table public.hub_perfis
  add column if not exists ativo boolean not null default true,
  add column if not exists inativado_em timestamptz,
  add column if not exists inativado_por uuid,
  add column if not exists inativado_motivo text;
drop policy if exists hub_perfis_admin on public.hub_perfis;
create policy hub_perfis_insert on public.hub_perfis for insert to authenticated with check (app.papel(org_id) = 'admin');
create policy hub_perfis_update on public.hub_perfis for update to authenticated
  using (app.papel(org_id) = 'admin') with check (app.papel(org_id) = 'admin');
revoke delete on public.hub_perfis from authenticated, anon;
drop trigger if exists nada_se_apaga on public.hub_perfis;
create trigger nada_se_apaga before delete on public.hub_perfis
  for each row execute function app.tg_nada_se_apaga('inative o perfil (com motivo)');

/** Pessoa (ou convite de equipe) só recebe perfil ativo. */
create or replace function app.tg_perfil_ativo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.perfil_id is not null and not exists (select 1 from hub_perfis where id = new.perfil_id and ativo) then
    raise exception 'Este perfil está inativo; escolha outro';
  end if;
  return new;
end $$;
revoke all on function app.tg_perfil_ativo() from public, anon, authenticated;
drop trigger if exists perfil_ativo on public.membros;
create trigger perfil_ativo before insert or update of perfil_id on public.membros
  for each row execute function app.tg_perfil_ativo();

create or replace function public.hub_inativar_perfil(p_perfil uuid, p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare p hub_perfis; n int;
begin
  select * into p from hub_perfis where id = p_perfil for update;
  if p.id is null then raise exception 'Perfil não encontrado'; end if;
  if app.papel(p.org_id) is distinct from 'admin' then raise exception 'Apenas administradores mudam os perfis'; end if;
  if not p.ativo then raise exception 'Este perfil já está inativo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  -- quem segue o perfil passa a acesso manual (mantém os acessos de hoje)
  update membros set perfil_id = null where org_id = p.org_id and perfil_id = p.id;
  get diagnostics n = row_count;
  update app.convites set perfil_id = null where org_id = p.org_id and perfil_id = p.id;
  -- o nome fica livre para um perfil novo
  update hub_perfis set ativo = false, inativado_em = now(), inativado_por = auth.uid(), inativado_motivo = trim(p_motivo),
         nome = left(p.nome, 60) || ' (inativo em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')'
   where id = p.id;
  perform app.registrar(p.org_id, 'hub', 'inativar_perfil', p.id::text, to_jsonb(p), jsonb_build_object('motivo', trim(p_motivo), 'pessoas', n));
  return n;
end $$;
revoke all on function public.hub_inativar_perfil(uuid, text) from public, anon;
grant execute on function public.hub_inativar_perfil(uuid, text) to authenticated;

-- convites do Portal: sem delete direto (portal_cancelar_convite acima)
drop policy if exists portal_convites_all on public.portal_convites;
create policy portal_convites_select on public.portal_convites for select to authenticated
  using (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));
create policy portal_convites_insert on public.portal_convites for insert to authenticated
  with check (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));
create policy portal_convites_update on public.portal_convites for update to authenticated
  using (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'))
  with check (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));
revoke delete on public.portal_convites from authenticated, anon;
drop trigger if exists nada_se_apaga on public.portal_convites;
create trigger nada_se_apaga before delete on public.portal_convites
  for each row execute function app.tg_nada_se_apaga('cancele o convite (com motivo)');

-- ===================================================================================================== 12 (S-10) clientes
drop policy if exists clientes_write on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated with check (app.eh_gestor(org_id));
create policy clientes_update on public.clientes for update to authenticated
  using (app.eh_gestor(org_id)) with check (app.eh_gestor(org_id));
revoke delete on public.clientes from authenticated, anon;
drop trigger if exists nada_se_apaga on public.clientes;
create trigger nada_se_apaga before delete on public.clientes
  for each row execute function app.tg_nada_se_apaga('inative o cliente');

/** O CNPJ do cliente não muda se já há certificado A1 ou nota fiscal ligados a ele (salvo administrador). */
create or replace function app.tg_cliente_cnpj()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g') is distinct from regexp_replace(coalesce(old.cnpj, ''), '\D', '', 'g')
     and auth.uid() is not null and app.papel(old.org_id) is distinct from 'admin'
     and (exists (select 1 from fis_certificados where cliente_id = old.id) or exists (select 1 from fis_notas where cliente_id = old.id)) then
    raise exception 'Este cliente já tem certificado digital ou notas fiscais no HUB: só um administrador muda o CNPJ';
  end if;
  if regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g') is distinct from regexp_replace(coalesce(old.cnpj, ''), '\D', '', 'g') then
    perform app.registrar(old.org_id, 'clientes', 'mudar_cnpj', old.id::text, to_jsonb(old.cnpj), to_jsonb(new.cnpj));
  end if;
  return new;
end $$;
revoke all on function app.tg_cliente_cnpj() from public, anon, authenticated;
drop trigger if exists cliente_cnpj on public.clientes;
create trigger cliente_cnpj before update of cnpj on public.clientes
  for each row execute function app.tg_cliente_cnpj();

-- ===================================================================================================== permissões das funções novas
do $$
declare f text;
begin
  foreach f in array array['app.uuid_campo(text, text)', 'app.data_campo(text, text)', 'app.numero_campo(text, text)',
                           'app.avisar_admins(uuid, text, text, text, text)', 'app.fin_lancar_titulos(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
