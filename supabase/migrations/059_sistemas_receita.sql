-- =====================================================================================================
--  059 · HUB enxuto para a MDC e receita por sistema
--
--  Decisão do Edvaldo (05/11/2026): o HUB serve para controlar as finanças da MDC e a receita dos sistemas que ela
--  desenvolve e licencia (EXato, Ledgra e os próximos). Por isso:
--
--   1  Estoque, Entradas (notas recebidas, pedidos de compra) e Saídas (pedidos de venda) saem do menu: a ferramenta
--      fica "desligada" no catálogo (hub_apps). Nada se apaga e as regras do banco não mudam; para religar, volte o
--      status para 'ativo'. O certificado digital (usado na NFS-e) passa a ficar no Financeiro (só tela).
--   2  fin_sistemas: cadastro dos sistemas vendidos pela empresa em gestão (nome, descrição, ativo). Grava só por
--      fin_sistema_salvar (Contratos: gerir); nada se apaga (inativar).
--   3  fin_recorrentes.sistema_id: o contrato a receber diz qual sistema vende (opcional; honorários ficam sem).
--      fin_recorrente_salvar (cópia da 048) aceita 'sistema'; sistema de outra empresa ou inativo é recusado.
--   4  fin_receita_sistemas(cliente, mês): painel por sistema — contratos ativos (licenças), clientes, receita mensal
--      contratada, faturado e recebido no mês (competência), em atraso, novos e encerrados em 12 meses, o faturado dos
--      12 meses anteriores e a receita PREVISTA dos 12 meses seguintes (previsibilidade: valor atual de cada contrato
--      ativo que lança contas, nos meses dentro da vigência; reajustes futuros não entram).
-- =====================================================================================================

-- ===================================================================================================== 1 menu enxuto
update public.hub_apps set status = 'desligado' where slug in ('estoque', 'entradas', 'saidas') and status <> 'desligado';

-- ===================================================================================================== 2 sistemas
create table if not exists public.fin_sistemas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nome text not null check (length(trim(nome)) between 1 and 60),
  descricao text,
  ativo boolean not null default true,
  ordem int not null default 100,
  por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists fin_sistemas_nome on public.fin_sistemas (cliente_id, lower(trim(nome)));
comment on table public.fin_sistemas is
  'Sistemas que a empresa licencia (EXato, Ledgra…). O contrato a receber aponta o sistema; o painel soma a receita por sistema (059).';

alter table public.fin_sistemas enable row level security;
drop policy if exists fin_ver on public.fin_sistemas;
create policy fin_ver on public.fin_sistemas for select to authenticated using ((select app.contratos_pode(cliente_id, 'ver')));
revoke insert, update, delete, truncate on public.fin_sistemas from anon, authenticated;
revoke all on public.fin_sistemas from anon;
grant select on public.fin_sistemas to authenticated;
drop trigger if exists gestao_so_empresa on public.fin_sistemas;
create trigger gestao_so_empresa before insert or update of cliente_id on public.fin_sistemas
  for each row execute function app.tg_gestao_so_empresa();
drop trigger if exists nada_se_apaga on public.fin_sistemas;
create trigger nada_se_apaga before delete on public.fin_sistemas
  for each row execute function app.tg_nada_se_apaga('inative o sistema');

alter table public.fin_recorrentes add column if not exists sistema_id uuid references public.fin_sistemas(id) on delete restrict;
create index if not exists fin_recorrentes_sistema on public.fin_recorrentes (sistema_id) where sistema_id is not null;
comment on column public.fin_recorrentes.sistema_id is 'Sistema vendido por este contrato a receber (059); vazio = honorários e outros serviços.';

/** Cria ou edita um sistema (Contratos: gerir). p: id (editar), cliente (criar), nome, descricao, ativo. */
create or replace function public.fin_sistema_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := app.uuid_campo(p->>'id', 'sistema'); s fin_sistemas; v_cliente uuid; v_org uuid;
  v_nome text := nullif(trim(coalesce(p->>'nome', '')), ''); v_desc text := nullif(trim(coalesce(p->>'descricao', '')), '');
  v_ativo boolean := coalesce((p->>'ativo')::boolean, true);
begin
  if v_id is not null then
    select * into s from fin_sistemas where id = v_id for update;
    if s.id is null then raise exception 'Sistema não encontrado'; end if;
    v_cliente := s.cliente_id;
  else
    v_cliente := app.uuid_campo(p->>'cliente', 'empresa');
  end if;
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'gerir') then
    raise exception 'Sem permissão para cadastrar sistemas (módulo Contratos, nível gerir)';
  end if;
  if v_nome is null then raise exception 'Escreva o nome do sistema (ex.: EXato)'; end if;
  if length(v_nome) > 60 then raise exception 'Nome do sistema: no máximo 60 letras'; end if;
  if exists (select 1 from fin_sistemas x where x.cliente_id = v_cliente and lower(trim(x.nome)) = lower(v_nome)
              and x.id is distinct from v_id) then
    raise exception 'Já existe um sistema com o nome "%"', v_nome;
  end if;
  if s.id is null then
    insert into fin_sistemas (org_id, cliente_id, nome, descricao, ativo, por)
    values (v_org, v_cliente, v_nome, v_desc, v_ativo, auth.uid()) returning * into s;
    perform app.registrar(v_org, 'contratos', 'sistema_criar', s.id::text, null, to_jsonb(s));
  else
    update fin_sistemas set nome = v_nome, descricao = case when p ? 'descricao' then v_desc else descricao end,
           ativo = case when p ? 'ativo' then v_ativo else ativo end, atualizado_em = now()
     where id = s.id;
    perform app.registrar(v_org, 'contratos', 'sistema_editar', s.id::text, to_jsonb(s),
      (select to_jsonb(x) from fin_sistemas x where x.id = s.id));
  end if;
  return jsonb_build_object('id', s.id);
end $$;
revoke all on function public.fin_sistema_salvar(jsonb) from public, anon;
grant execute on function public.fin_sistema_salvar(jsonb) to authenticated;

-- ===================================================================================================== 3 contrato com sistema
/**
 * Cria ou edita um contrato (Contratos: operar). Igual à 048 e mais 'sistema' (059): só no contrato a receber; sistema
 * de outra empresa ou inativo é recusado (o inativo que o contrato já tinha continua valendo). Sem 'sistema' no pedido,
 * o contrato mantém o que tinha.
 */
create or replace function public.fin_recorrente_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := app.uuid_campo(p->>'id', 'contrato'); k fin_recorrentes; v_cliente uuid; v_org uuid; v_tipo text;
  v_hoje date; v_mes date; v_pessoa uuid; v_valor numeric := round(app.numero_campo(p->>'valor', 'valor'), 2);
  v_dia int := app.numero_campo(p->>'dia', 'dia do vencimento')::int;
  v_vig_ini date := app.data_campo(coalesce(p->>'vigencia_inicio', p->>'inicio'), 'início da vigência');
  v_vig_fim date := app.data_campo(coalesce(p->>'vigencia_fim', p->>'fim'), 'fim da vigência');
  v_renova boolean := coalesce((p->>'renovacao_automatica')::boolean, false);
  v_aviso int := coalesce(app.numero_campo(p->>'aviso_dias', 'dias de aviso')::int, 30);
  v_gera boolean := coalesce((p->>'gera_contas')::boolean, true);
  v_inicio date := date_trunc('month', v_vig_ini)::date;
  v_fim date;
  v_desde date := date_trunc('month', app.data_campo(p->>'gerar_desde', 'primeira conta'))::date;
  v_indice text := coalesce(nullif(p->>'indice', ''), 'nenhum');
  v_fixo numeric := app.numero_campo(p->>'percentual_fixo', 'percentual fixo');
  v_mes_reaj int := app.numero_campo(p->>'mes_reajuste', 'mês do reajuste')::int;
  v_geradas int := 0;
  v_documento text; v_envio text; v_dia_ger int; v_canais text[]; v_email text; v_whats text; v_carteira uuid;
  v_serv_desc text; v_serv_cod text; v_iss numeric; v_ren_meses int; v_banco text;
  v_sistema uuid;
begin
  if v_id is not null then
    select * into k from fin_recorrentes where id = v_id for update;
    if k.id is null then raise exception 'Contrato não encontrado'; end if;
    v_cliente := k.cliente_id; v_tipo := k.tipo;
  else
    v_cliente := app.uuid_campo(p->>'cliente', 'empresa');
    v_tipo := p->>'tipo';
  end if;
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'operar') then
    raise exception 'Sem permissão para cadastrar contratos desta empresa (módulo Contratos)';
  end if;
  if k.id is not null and k.situacao = 'encerrado' then raise exception 'Contrato encerrado não se edita'; end if;
  if v_tipo is null or v_tipo not in ('pagar', 'receber') then raise exception 'Escolha se o contrato é a pagar ou a receber'; end if;
  if v_gera and not app.contratos_lanca_pode(v_cliente, v_tipo) then
    raise exception 'Contrato a pagar que lança contas no Financeiro precisa também do acesso ao Financeiro (operar). Peça ao administrador ou marque "não lança contas"';
  end if;
  if coalesce(trim(p->>'descricao'), '') = '' then raise exception 'Escreva a descrição do contrato (ex.: Aluguel da sala)'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor mensal (maior que zero)'; end if;
  if v_dia is null or v_dia < 1 or v_dia > 31 then raise exception 'Dia do vencimento: de 1 a 31'; end if;
  if v_inicio is null then raise exception 'Informe o início da vigência do contrato'; end if;
  if v_vig_fim is not null and v_vig_fim < v_vig_ini then raise exception 'O fim da vigência precisa ser depois do início'; end if;
  if v_renova and v_vig_fim is null then raise exception 'Renovação automática precisa da data de fim da vigência'; end if;
  if v_aviso < 0 or v_aviso > 365 then raise exception 'Aviso antes do fim: de 0 a 365 dias'; end if;
  v_ren_meses := case when p ? 'renovacao_meses' then app.numero_campo(p->>'renovacao_meses', 'meses da renovação')::int
                      else coalesce(k.renovacao_meses, 12) end;
  if v_ren_meses is null or v_ren_meses < 1 or v_ren_meses > 60 then raise exception 'Cada renovação: de 1 a 60 meses'; end if;
  v_fim := case when v_vig_fim is not null and not v_renova then date_trunc('month', v_vig_fim)::date end;
  if v_indice not in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum') then raise exception 'Reajuste: IPCA, IGP-M, INPC, %% fixo ou sem reajuste'; end if;
  if v_indice = 'fixo' and (v_fixo is null or v_fixo < 0 or v_fixo > 100) then
    raise exception 'Informe o percentual fixo do reajuste (de 0%% a 100%%; reajuste negativo não se aplica)';
  end if;
  if v_indice <> 'nenhum' and (v_mes_reaj is null or v_mes_reaj < 1 or v_mes_reaj > 12) then
    raise exception 'Escolha o mês do reajuste';
  end if;

  if v_tipo = 'receber' then
    v_documento := case when p ? 'documento' then nullif(p->>'documento', '') else coalesce(k.documento, 'fatura') end;
    v_envio := case when p ? 'envio' then nullif(p->>'envio', '') else coalesce(k.envio, 'fatura') end;
    v_dia_ger := case when p ? 'dia_geracao' then app.numero_campo(p->>'dia_geracao', 'dia de gerar')::int else coalesce(k.dia_geracao, 1) end;
    if p ? 'canais' then
      if jsonb_typeof(p->'canais') is distinct from 'array' then raise exception 'Canais de envio: escolha e-mail, WhatsApp e/ou Portal do Cliente'; end if;
      select coalesce(array_agg(distinct x order by x), '{}') into v_canais from jsonb_array_elements_text(p->'canais') x;
    else
      v_canais := coalesce(k.canais, '{}');
    end if;
    v_email := case when p ? 'email_envio' then nullif(lower(trim(p->>'email_envio')), '') else k.email_envio end;
    v_whats := case when p ? 'whatsapp_envio' then app.fin_digitos(p->>'whatsapp_envio') else k.whatsapp_envio end;
    v_carteira := case when p ? 'cliente_carteira' then app.uuid_campo(p->>'cliente_carteira', 'cliente da carteira') else k.cliente_carteira_id end;
    v_serv_desc := case when p ? 'servico_descricao' then nullif(trim(p->>'servico_descricao'), '') else k.servico_descricao end;
    v_serv_cod := case when p ? 'servico_codigo' then nullif(trim(p->>'servico_codigo'), '') else k.servico_codigo end;
    v_iss := case when p ? 'iss_aliquota' then app.numero_campo(p->>'iss_aliquota', 'alíquota do ISS') else k.iss_aliquota end;
    v_banco := case when p ? 'boleto_banco' then nullif(lower(trim(p->>'boleto_banco')), '') else k.boleto_banco end;
    v_sistema := case when p ? 'sistema' then app.uuid_campo(p->>'sistema', 'sistema') else k.sistema_id end;
    if v_sistema is not null and not exists (
         select 1 from fin_sistemas s where s.id = v_sistema and s.cliente_id = v_cliente and (s.ativo or s.id = k.sistema_id)) then
      raise exception 'Sistema não encontrado (ou inativo) nesta empresa: escolha outro ou cadastre em Contratos › Receita por sistema';
    end if;

    if v_documento is null or v_documento not in ('nfse', 'fatura') then
      raise exception 'Escolha o documento do mês: nota fiscal de serviço (NFS-e) ou só a nota fatura';
    end if;
    if v_envio is null or v_envio not in ('nf_fatura_boleto', 'nf_fatura', 'fatura_boleto', 'fatura') then
      raise exception 'Escolha o que enviar ao cliente';
    end if;
    if (v_envio in ('nf_fatura_boleto', 'nf_fatura')) <> (v_documento = 'nfse') then
      raise exception 'Com nota fiscal, envie "Nota fiscal + fatura + boleto" ou "Nota fiscal + fatura"; sem nota, "Fatura + boleto" ou "Só a fatura"';
    end if;
    if v_dia_ger is null or v_dia_ger < 1 or v_dia_ger > 28 then raise exception 'Dia de gerar: de 1 a 28 (todo mês tem esses dias)'; end if;
    -- R3: vence no mesmo mês da geração; gerar depois do vencimento faria a fatura nascer vencida
    if v_dia_ger > v_dia then
      raise exception 'A fatura vence no mesmo mês em que é gerada: o dia de gerar (%) não pode ser depois do dia de vencer (%). Ex.: gerar dia 1 e vencer dia %',
        v_dia_ger, v_dia, v_dia;
    end if;
    if exists (select 1 from unnest(v_canais) x where x is null or x not in ('email', 'whatsapp', 'portal')) then
      raise exception 'Canal de envio desconhecido: use e-mail, WhatsApp ou Portal do Cliente';
    end if;
    if 'email' = any (v_canais) and (v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception 'Informe o e-mail que recebe a fatura (ex.: financeiro@cliente.com.br)';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail da fatura inválido'; end if;
    if 'whatsapp' = any (v_canais) and (v_whats is null or length(v_whats) not between 10 and 13) then
      raise exception 'Informe o WhatsApp que recebe a fatura, com DDD (ex.: 11 98888-7777)';
    end if;
    if v_whats is not null and length(v_whats) not between 10 and 13 then raise exception 'WhatsApp da fatura inválido: use DDD e número'; end if;
    if v_carteira is not null and not exists (select 1 from clientes where id = v_carteira and org_id = v_org) then
      raise exception 'Cliente da carteira não encontrado nesta organização';
    end if;
    if 'portal' = any (v_canais) and v_carteira is null then
      raise exception 'Para publicar no Portal, escolha o cliente da carteira (o cadastro dele no HUB)';
    end if;
    if v_documento = 'nfse' then
      if v_serv_desc is null then raise exception 'Com nota fiscal, descreva o serviço (é o texto que vai na nota)'; end if;
      if v_serv_cod is null then raise exception 'Com nota fiscal, informe o código do serviço (ex.: 17.01.01)'; end if;
      if v_iss is null then raise exception 'Com nota fiscal, informe a alíquota do ISS (de 0%% a 5%%)'; end if;
    end if;
    if v_serv_cod is not null and v_serv_cod !~ '^[0-9]{2}\.?[0-9]{2}(\.?[0-9]{2})?$' then
      raise exception 'Código do serviço: use o código de tributação nacional (ex.: 17.01.01) ou o item da LC 116 (ex.: 17.01)';
    end if;
    if v_iss is not null and (v_iss < 0 or v_iss > 5) then raise exception 'Alíquota do ISS: de 0%% a 5%%'; end if;
    if v_envio = 'fatura' then
      v_banco := null;
    elsif v_banco is null or v_banco not in ('itau', 'santander') then
      raise exception 'Escolha o banco do boleto: Itaú ou Santander';
    end if;
  else
    v_documento := 'fatura'; v_envio := 'fatura'; v_dia_ger := 1; v_canais := '{}'; v_banco := null; v_sistema := null;
  end if;

  v_hoje := app.hoje(v_org);
  v_mes := date_trunc('month', v_hoje)::date;
  v_pessoa := app.fin_recorrente_conferir(v_cliente, v_org, v_tipo, p);

  if k.id is null then
    v_desde := coalesce(v_desde, greatest(v_mes, v_inicio));
    if v_desde < v_mes then raise exception 'A primeira conta lançada pelo HUB é a deste mês ou de um mês futuro'; end if;
    if v_desde < v_inicio then raise exception 'A primeira conta não pode ser antes do início do contrato'; end if;
    if v_fim is not null and v_fim < v_desde then raise exception 'A vigência termina antes da primeira conta: confira as datas'; end if;
    insert into fin_recorrentes (org_id, cliente_id, tipo, pessoa_id, descricao, valor, dia_vencimento, categoria_id, centro_id,
                                 conta_prevista_id, inicio, gerar_desde, fim, mes_cadastro, indice, percentual_fixo, mes_reajuste, observacao,
                                 numero, objeto, vigencia_inicio, vigencia_fim, renovacao_automatica, aviso_dias, gera_contas, por,
                                 documento, envio, dia_geracao, canais, email_envio, whatsapp_envio, cliente_carteira_id,
                                 servico_descricao, servico_codigo, iss_aliquota, renovacao_meses, boleto_banco, sistema_id)
    values (v_org, v_cliente, v_tipo, v_pessoa, trim(p->>'descricao'), v_valor, v_dia, app.uuid_campo(p->>'categoria', 'categoria'),
            app.uuid_campo(p->>'centro', 'centro de custo'), app.uuid_campo(p->>'conta_prevista', 'banco previsto'),
            v_inicio, v_desde, v_fim, v_mes, v_indice, case when v_indice = 'fixo' then v_fixo end,
            case when v_indice <> 'nenhum' then v_mes_reaj end, nullif(trim(p->>'observacao'), ''),
            nullif(trim(p->>'numero'), ''), nullif(trim(p->>'objeto'), ''), v_vig_ini, v_vig_fim, v_renova, v_aviso, v_gera, auth.uid(),
            v_documento, v_envio, v_dia_ger, v_canais, v_email, v_whats, v_carteira, v_serv_desc, v_serv_cod, round(v_iss, 2),
            v_ren_meses, v_banco, v_sistema)
    returning * into k;
    perform app.registrar(v_org, 'contratos', 'contrato_criar', k.id::text, null, to_jsonb(k));
    perform app.fin_recorrente_evento(k.id, 'criado', format('Contrato cadastrado: %s por mês%s', app.fin_brl(v_valor),
      case when v_gera then format(', primeira conta em %s', to_char(v_desde, 'MM/YYYY')) else ' (não lança contas)' end));
  else
    if p ? 'tipo' and p->>'tipo' is distinct from k.tipo then raise exception 'O tipo do contrato (a pagar/receber) não muda'; end if;
    if k.ultima_competencia is not null then
      v_desde := k.gerar_desde;
    else
      v_desde := coalesce(v_desde, k.gerar_desde);
      if v_desde < v_mes then raise exception 'A primeira conta lançada pelo HUB é a deste mês ou de um mês futuro'; end if;
    end if;
    if v_desde < v_inicio then raise exception 'A primeira conta não pode ser antes do início do contrato'; end if;
    if v_fim is not null and v_fim < greatest(v_desde, coalesce(k.ultima_competencia, v_desde)) then
      raise exception 'O fim da vigência não pode ser antes do último mês já lançado (%)', to_char(coalesce(k.ultima_competencia, v_desde), 'MM/YYYY');
    end if;
    update fin_recorrentes
       set pessoa_id = v_pessoa, descricao = trim(p->>'descricao'), valor = v_valor, dia_vencimento = v_dia,
           categoria_id = app.uuid_campo(p->>'categoria', 'categoria'), centro_id = app.uuid_campo(p->>'centro', 'centro de custo'),
           conta_prevista_id = app.uuid_campo(p->>'conta_prevista', 'banco previsto'), inicio = v_inicio, gerar_desde = v_desde,
           fim = v_fim, indice = v_indice, percentual_fixo = case when v_indice = 'fixo' then v_fixo end,
           mes_reajuste = case when v_indice <> 'nenhum' then v_mes_reaj end, observacao = nullif(trim(p->>'observacao'), ''),
           numero = nullif(trim(p->>'numero'), ''), objeto = nullif(trim(p->>'objeto'), ''), vigencia_inicio = v_vig_ini,
           vigencia_fim = v_vig_fim, renovacao_automatica = v_renova, aviso_dias = v_aviso, gera_contas = v_gera,
           aviso_fim_enviado = case when v_vig_fim is distinct from k.vigencia_fim then null else aviso_fim_enviado end,
           vigencia_fim_base = case when v_vig_fim is distinct from k.vigencia_fim then null else vigencia_fim_base end,
           documento = v_documento, envio = v_envio, dia_geracao = v_dia_ger, canais = v_canais, email_envio = v_email,
           whatsapp_envio = v_whats, cliente_carteira_id = v_carteira, servico_descricao = v_serv_desc, servico_codigo = v_serv_cod,
           iss_aliquota = round(v_iss, 2), renovacao_meses = v_ren_meses, boleto_banco = v_banco, sistema_id = v_sistema, atualizado_em = now()
     where id = k.id;
    if v_valor <> k.valor then
      insert into fin_recorrente_reajustes (org_id, cliente_id, recorrente_id, origem, valor_antes, valor_depois, observacao, por)
      values (k.org_id, k.cliente_id, k.id, 'edicao', k.valor, v_valor, 'Valor alterado na edição do contrato', auth.uid());
      perform app.fin_recorrente_evento(k.id, 'valor', format('Valor mensal alterado na edição: %s → %s (vale para as próximas contas)',
        app.fin_brl(k.valor), app.fin_brl(v_valor)));
    end if;
    if v_mes_reaj is distinct from k.mes_reajuste and k.mes_reajuste is not null and v_indice <> 'nenhum' then
      perform app.fin_recorrente_evento(k.id, 'editado', format('Mês do reajuste mudou de %s para %s: o próximo reajuste continua só 12 meses depois do último',
        lpad(k.mes_reajuste::text, 2, '0'), lpad(v_mes_reaj::text, 2, '0')));
    end if;
    perform app.fin_recorrente_evento(k.id, 'editado', 'Dados do contrato editados');
    perform app.registrar(k.org_id, 'contratos', 'contrato_editar', k.id::text, to_jsonb(k),
      (select to_jsonb(x) from fin_recorrentes x where x.id = k.id));
  end if;

  if k.situacao = 'ativo' and v_gera then v_geradas := app.fin_recorrentes_gerar(v_org, v_mes, k.id); end if;
  return jsonb_build_object('id', k.id, 'geradas', v_geradas);
end $$;
revoke all on function public.fin_recorrente_salvar(jsonb) from public, anon;
grant execute on function public.fin_recorrente_salvar(jsonb) to authenticated;

-- ===================================================================================================== 4 painel
/**
 * Receita por sistema (Contratos: ver). Contratos a receber, agrupados pelo sistema (mais "Sem sistema" quando houver).
 * Faturado e recebido pela competência do mês (contas não canceladas do contrato); em atraso = saldo das contas em
 * aberto vencidas até hoje; novos = começaram nos 12 meses até o mês; encerrados = encerrados nesses 12 meses;
 * previsto = valor atual × meses dos 12 seguintes dentro da vigência (contratos ativos que lançam contas).
 */
create or replace function public.fin_receita_sistemas(p_cliente uuid, p_mes date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_hoje date; v_mes date; v_ini date; v_meses date[];
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(p_cliente, 'ver') then raise exception 'Sem permissão para ver os contratos desta empresa'; end if;
  v_hoje := app.hoje(v_org);
  v_mes := date_trunc('month', coalesce(p_mes, v_hoje))::date;
  v_ini := (v_mes - interval '11 months')::date;
  select array_agg(m::date order by m) into v_meses from generate_series(v_ini, v_mes, interval '1 month') m;
  return jsonb_build_object('mes', v_mes, 'hoje', v_hoje, 'meses', to_jsonb(v_meses), 'linhas', coalesce((
    with k as (
      select r.* from fin_recorrentes r where r.cliente_id = p_cliente and r.tipo = 'receber'
    ), t as (
      select t.valor, t.valor_pago, t.situacao, t.vencimento, t.competencia, k.sistema_id
        from fin_titulos t join k on k.id = t.recorrente_id
       where t.situacao <> 'cancelado'
    ), g as (
      select s.id, s.nome, s.descricao, s.ativo, s.ordem from fin_sistemas s where s.cliente_id = p_cliente
      union all
      select null, 'Sem sistema (honorários e outros)', null, true, 100000 where exists (select 1 from k where k.sistema_id is null)
    )
    select jsonb_agg(jsonb_build_object(
             'sistema', g.id, 'nome', g.nome, 'descricao', g.descricao, 'ativo', g.ativo,
             'contratos', (select count(*) from k where k.sistema_id is not distinct from g.id and k.situacao = 'ativo'),
             'suspensos', (select count(*) from k where k.sistema_id is not distinct from g.id and k.situacao = 'suspenso'),
             'clientes', (select count(distinct k.pessoa_id) from k where k.sistema_id is not distinct from g.id and k.situacao = 'ativo'),
             'mensal', (select coalesce(sum(k.valor), 0) from k where k.sistema_id is not distinct from g.id and k.situacao = 'ativo'),
             'faturado', (select coalesce(sum(t.valor), 0) from t where t.sistema_id is not distinct from g.id and t.competencia = v_mes),
             'recebido', (select coalesce(sum(t.valor_pago), 0) from t where t.sistema_id is not distinct from g.id and t.competencia = v_mes),
             'atraso', (select coalesce(sum(t.valor - t.valor_pago), 0) from t
                         where t.sistema_id is not distinct from g.id and t.situacao = 'aberto' and t.vencimento < v_hoje),
             'novos', (select count(*) from k where k.sistema_id is not distinct from g.id
                         and k.vigencia_inicio >= v_ini and k.vigencia_inicio < (v_mes + interval '1 month')::date),
             'encerrados', (select count(*) from k where k.sistema_id is not distinct from g.id and k.situacao = 'encerrado'
                         and k.encerrado_em >= v_ini and k.encerrado_em < (v_mes + interval '1 month')::date),
             'previsto', (select coalesce(sum(k.valor * (
                            select count(*) from generate_series((v_mes + interval '1 month')::date, (v_mes + interval '12 months')::date,
                                                                 interval '1 month') f
                             where f >= k.gerar_desde and (k.fim is null or f <= k.fim))), 0)
                            from k where k.sistema_id is not distinct from g.id and k.situacao = 'ativo' and k.gera_contas),
             'por_mes', (select jsonb_agg((select coalesce(sum(t.valor), 0) from t
                                            where t.sistema_id is not distinct from g.id and t.competencia = m) order by m)
                           from unnest(v_meses) m))
           order by g.ordem, lower(g.nome))
      from g
     where g.ativo or exists (select 1 from k where k.sistema_id is not distinct from g.id)
  ), '[]'::jsonb));
end $$;
revoke all on function public.fin_receita_sistemas(uuid, date) from public, anon;
grant execute on function public.fin_receita_sistemas(uuid, date) to authenticated;
comment on function public.fin_receita_sistemas(uuid, date) is
  'Painel de receita por sistema dos contratos a receber: contratos, clientes, mensal, faturado, recebido, atraso, novos e encerrados (059).';
