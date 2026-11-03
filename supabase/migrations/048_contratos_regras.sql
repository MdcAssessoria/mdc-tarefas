-- =====================================================================================================
--  048 · Contratos: regras decididas pelo Edvaldo e correções B-04 a B-09, B-12 e BD-03 (parecer de 03/11/2026)
--
--  Decisões do Edvaldo (03/11/2026, 20h40):
--   R1  Índice de reajuste NEGATIVO (ex.: IGP-M abaixo de zero no acumulado): o valor do contrato é MANTIDO
--       (o reajuste negativo vira 0%). A proposta mostra o índice como veio e propõe 0%; confirmar com % negativo é
--       recusado. Percentual fixo negativo também não é aceito no cadastro.
--   R2  Primeiro e último mês de contrato que começa ou termina no meio do mês: cobra o MÊS CHEIO. Já era assim (a
--       conta do mês sai sempre com o valor mensal inteiro); fica registrado aqui e provado no teste 106.
--   R3  Contrato a receber: a fatura VENCE NO MESMO MÊS em que é gerada (troca a regra da 045, que levava para o mês
--       seguinte quando o dia de vencer era menor ou igual ao dia de gerar). Para a fatura não nascer vencida, o
--       contrato a receber passa a exigir dia de gerar ATÉ o dia de vencer (ex.: gera dia 1, vence dia 5). O mesmo dia
--       vale (vence no dia em que é gerada). Contrato a pagar continua como na 041 (gera dia 1, vence no mês).
--
--  Correções:
--   B-04  Reajuste duplo trocando o mês de reajuste: o próximo ciclo só começa 12 meses depois do último reajuste
--         confirmado (app.fin_reajuste_candidato).
--   B-05  Ciclo não confirmado que sumia sem aviso: o ciclo mais antigo sem confirmação continua pendente até ser
--         confirmado; depois vem o seguinte (se já chegou, fica pendente na hora).
--   B-06  Rotina parada mais de um mês: a rotina recupera sozinha até 12 meses para trás (só mês sem conta nenhuma;
--         mês com conta cancelada não volta). Gerar um mês à mão continua em fin_fatura_gerar_agora (045).
--   B-07  Aviso de reajuste: espera o índice do mês anterior sair (IPCA sai por volta do dia 10) ou, sem índice,
--         avisa no dia 20 do mês de referência dizendo que o índice ainda não saiu; repete a cada 7 dias enquanto
--         estiver pendente; vai para administradores e quem tem Contratos operar ou gerir com acesso válido (não
--         vencido). O aviso de fim de vigência segue a mesma lista de pessoas.
--   B-08  Falhas da rotina: além da auditoria, o sino avisa os administradores e quem gere Contratos.
--   B-09  "Atualizar as contas em aberto" no reajuste: só muda conta com o valor antigo (ajuste manual fica como
--         está), não mexe em fatura com nota fiscal emitida ou boleto gerado e mostra a diferença dos meses do ciclo
--         já pagos com o valor antigo (não é lançada sozinha). A fatura acompanha a conta.
--   B-12  Renovação automática: prazo da renovação escolhido no contrato (1 a 60 meses, padrão 12) e a data base
--         guardada, para 29/02 voltar a ser 29/02 nos anos bissextos (não vira 28/02 para sempre).
--   BD-03 Contrato a PAGAR que lança contas: criar, editar, reativar, gerar à mão ou atualizar contas no reajuste exige
--         também o Financeiro (operar). Quem tem só Contratos continua cadastrando contrato a receber e contrato que
--         só guarda o documento.
--   Fatura: número AAAA/NNNNN por ano da emissão; recomeça em 00001 no ano novo, sem repetir (provado no teste 106).
--
--  Também entra fin_recorrentes.boleto_banco (Itaú ou Santander), escolhido no contrato quando o envio tem boleto;
--  a emissão pelo Ledgra Link vem na 049.
--
--  NÃO APLICAR pela frente: quem integra aplica. Testes: supabase/testes/105_base_048.sql e 106_regras_048.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 colunas
alter table public.fin_recorrentes
  add column if not exists renovacao_meses integer not null default 12,
  add column if not exists vigencia_fim_base date,
  add column if not exists reajuste_avisado_em date,
  add column if not exists boleto_banco text;
do $$
declare c record;
begin
  for c in select * from (values
    ('fin_recorrentes_renovacao_meses', 'check (renovacao_meses between 1 and 60)'),
    ('fin_recorrentes_boleto_banco', 'check (boleto_banco is null or boleto_banco in (''itau'', ''santander''))')
  ) x(nome, regra) loop
    if not exists (select 1 from pg_constraint where conname = c.nome) then
      execute format('alter table public.fin_recorrentes add constraint %I %s', c.nome, c.regra);
    end if;
  end loop;
end $$;
comment on column public.fin_recorrentes.renovacao_meses is 'Renovação automática: quantos meses cada renovação acrescenta (1 a 60, padrão 12) (048, B-12).';
comment on column public.fin_recorrentes.vigencia_fim_base is 'Fim da vigência de onde as renovações automáticas são contadas (29/02 volta a 29/02 no bissexto) (048, B-12).';
comment on column public.fin_recorrentes.reajuste_avisado_em is 'Último dia em que o sino avisou o reajuste pendente (repete a cada 7 dias) (048, B-07).';
comment on column public.fin_recorrentes.boleto_banco is 'Banco do boleto da fatura (itau ou santander), emitido pelo Ledgra Link (048/049).';
comment on column public.fin_recorrentes.dia_geracao is 'Dia do mês (1–28) em que a conta e a fatura nascem. A receber: vence no mesmo mês, e o dia de gerar não passa do dia de vencer (048). A pagar: sempre 1.';

-- ===================================================================================================== 2 vencimento (R3)
/** Vencimento da conta do mês: sempre no mesmo mês da geração (048, R3). Dia que o mês não tem vira o último dia. */
create or replace function app.fin_recorrente_vencimento(p_mes date, p_tipo text, p_dia_geracao int, p_dia_vencimento int)
returns date language sql immutable set search_path = '' as $$
  select app.fin_vencimento_no_mes(date_trunc('month', p_mes)::date, p_dia_vencimento)
$$;
revoke all on function app.fin_recorrente_vencimento(date, text, int, int) from public, anon, authenticated;
comment on function app.fin_recorrente_vencimento(date, text, int, int) is
  'Vencimento da conta do mês do contrato: no mesmo mês da geração (decisão do Edvaldo, 048).';

-- ===================================================================================================== 3 BD-03
/** Contrato a pagar que lança contas precisa também do Financeiro (operar); a receber, só Contratos (048, BD-03). */
create or replace function app.contratos_lanca_pode(p_cliente uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_tipo = 'receber' or app.gestao_pode(p_cliente, 'operar', array['financeiro'])
$$;
revoke all on function app.contratos_lanca_pode(uuid, text) from public, anon, authenticated;

-- ===================================================================================================== 4 reajuste (B-04, B-05, R1)
/** Primeiro mês com o mês do ano p_mes_ano que não seja antes de p_desde. */
create or replace function app.fin_mes_aniversario(p_desde date, p_mes_ano int)
returns date language sql immutable set search_path = '' as $$
  select case when make_date(extract(year from p_desde)::int, p_mes_ano, 1) >= date_trunc('month', p_desde)::date
              then make_date(extract(year from p_desde)::int, p_mes_ano, 1)
              else make_date(extract(year from p_desde)::int + 1, p_mes_ano, 1) end
$$;
revoke all on function app.fin_mes_aniversario(date, int) from public, anon, authenticated;

/**
 * Próximo ciclo de reajuste do contrato (048): o primeiro mês do reajuste que (1) já tem 12 meses de contrato, (2) é
 * depois do mês em que o contrato entrou no HUB e (3) vem 12 meses ou mais depois do último reajuste confirmado.
 * Assim trocar o mês do reajuste não reajusta duas vezes no ano (B-04) e um ciclo não confirmado não some (B-05).
 */
create or replace function app.fin_reajuste_candidato(p_contrato uuid)
returns date language plpgsql stable security definer set search_path = public as $$
declare k fin_recorrentes; v_ult date; v_desde date;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null or k.indice = 'nenhum' or k.mes_reajuste is null then return null; end if;
  select max(referencia) into v_ult from fin_recorrente_reajustes where recorrente_id = k.id and origem = 'reajuste';
  v_desde := greatest((k.inicio + interval '12 months')::date, (k.mes_cadastro + interval '1 month')::date,
                      coalesce((v_ult + interval '12 months')::date, k.inicio));
  return app.fin_mes_aniversario(v_desde, k.mes_reajuste);
end $$;
revoke all on function app.fin_reajuste_candidato(uuid) from public, anon, authenticated;

create or replace function app.fin_reajuste_pendente(p_contrato uuid)
returns date language plpgsql stable security definer set search_path = public as $$
declare k fin_recorrentes; v_ref date;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null or k.situacao <> 'ativo' then return null; end if;
  v_ref := app.fin_reajuste_candidato(k.id);
  if v_ref is null or v_ref > date_trunc('month', app.hoje(k.org_id))::date then return null; end if;
  return v_ref;
end $$;
revoke all on function app.fin_reajuste_pendente(uuid) from public, anon, authenticated;
comment on function app.fin_reajuste_pendente(uuid) is
  'Ciclo de reajuste pendente (o mais antigo não confirmado que já chegou), ou nulo (048, B-04/B-05).';

create or replace function app.fin_reajuste_proximo(p_contrato uuid)
returns date language sql stable security definer set search_path = public as $$
  select app.fin_reajuste_candidato(p_contrato)
$$;
revoke all on function app.fin_reajuste_proximo(uuid) from public, anon, authenticated;

/** Contas do ciclo (mês do reajuste em diante) e o que dá para atualizar com o valor novo (048, B-09). */
create or replace function app.fin_reajuste_contas(p_contrato uuid, p_ref date, p_valor_antigo numeric, p_valor_novo numeric)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select t.id, t.competencia, t.valor, t.valor_pago, t.situacao, f.id as fatura, f.numero as fatura_numero,
           f.nfse_situacao, f.boleto_situacao, f.situacao as fatura_situacao
      from fin_titulos t left join fin_faturas f on f.titulo_id = t.id and f.situacao <> 'cancelada'
     where t.recorrente_id = p_contrato and t.competencia >= p_ref and t.situacao <> 'cancelado'
  ), k as (
    select c.*,
           case when c.situacao = 'aberto' and c.valor_pago = 0 and c.valor = p_valor_antigo
                     and coalesce(c.nfse_situacao, '') <> 'emitida' and coalesce(c.boleto_situacao, '') <> 'gerado' then 'atualiza'
                when c.situacao = 'aberto' and c.valor_pago = 0 and c.valor <> p_valor_antigo then 'ajuste_manual'
                when c.situacao = 'aberto' and c.valor_pago = 0 then 'documento_emitido'
                else 'paga' end as caso
      from c
  )
  select jsonb_build_object(
    'atualizaveis', coalesce(jsonb_agg(jsonb_build_object('id', id, 'competencia', competencia, 'valor', valor, 'fatura', fatura_numero)
                                       order by competencia) filter (where caso = 'atualiza'), '[]'),
    'ajuste_manual', coalesce(jsonb_agg(jsonb_build_object('id', id, 'competencia', competencia, 'valor', valor)
                                        order by competencia) filter (where caso = 'ajuste_manual'), '[]'),
    'documento_emitido', coalesce(jsonb_agg(jsonb_build_object('id', id, 'competencia', competencia, 'valor', valor, 'fatura', fatura_numero)
                                            order by competencia) filter (where caso = 'documento_emitido'), '[]'),
    'pagas', coalesce(jsonb_agg(jsonb_build_object('id', id, 'competencia', competencia, 'valor', valor, 'pago', valor_pago)
                                order by competencia) filter (where caso = 'paga'), '[]'),
    'diferenca_pagas', coalesce(round(sum(greatest(p_valor_novo - valor, 0)) filter (where caso = 'paga'), 2), 0))
  from k
$$;
revoke all on function app.fin_reajuste_contas(uuid, date, numeric, numeric) from public, anon, authenticated;

/**
 * Proposta de reajuste (048): como na 041, e o acumulado negativo vira 0% (R1: o valor é mantido). Devolve as contas do
 * ciclo separadas (atualizáveis, com ajuste manual, com nota/boleto emitido e já pagas, com a diferença).
 */
create or replace function public.fin_recorrente_proposta(p_contrato uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_ref date; v_pend boolean; v_acum jsonb; v_pct numeric; v_indice numeric; v_novo numeric; v_contas jsonb;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  if k.id is null or not app.contratos_pode(k.cliente_id, 'ver') then raise exception 'Contrato não encontrado'; end if;
  if k.indice = 'nenhum' then raise exception 'Este contrato está marcado como sem reajuste'; end if;
  begin
    perform app.fin_indices_ler();
  exception when others then null;   -- a proposta sai com os índices que já existem
  end;
  v_ref := app.fin_reajuste_pendente(k.id);
  v_pend := v_ref is not null;
  v_ref := coalesce(v_ref, app.fin_reajuste_proximo(k.id));
  if k.indice = 'fixo' then
    v_indice := k.percentual_fixo;
    v_acum := jsonb_build_object('indice', 'fixo', 'meses', 12, 'faltam', '[]'::jsonb);
  else
    v_acum := app.fin_indice_acumulado(k.indice, v_ref);
    v_indice := (v_acum->>'percentual')::numeric;
  end if;
  v_pct := case when v_indice is not null then greatest(v_indice, 0) end;
  v_novo := case when v_pct is not null then round(k.valor * (1 + v_pct / 100), 2) end;
  v_contas := app.fin_reajuste_contas(k.id, v_ref, k.valor, coalesce(v_novo, k.valor));
  return v_acum || jsonb_build_object(
    'contrato', k.id, 'referencia', v_ref, 'pendente', v_pend, 'tipo', k.indice,
    'percentual', round(v_pct, 4), 'percentual_indice', round(v_indice, 4), 'negativo_vira_zero', coalesce(v_indice < 0, false),
    'valor_atual', k.valor, 'valor_novo', v_novo,
    'contas_em_aberto', v_contas->'atualizaveis', 'contas', v_contas,
    'indices_atualizados_em', (select max(atualizado_em) from fin_indices where indice = k.indice));
end $$;
comment on function public.fin_recorrente_proposta(uuid) is
  'Proposta de reajuste: acumulado de 12 meses (negativo vira 0%, valor mantido), valor novo e contas do ciclo separadas (048).';

/**
 * Confirma o reajuste do ciclo pendente (Contratos: operar; contrato a pagar que atualiza contas também Financeiro).
 * % negativo é recusado (R1). p_atualizar_abertas: muda só as contas do ciclo em aberto, sem pagamento, ainda com o
 * valor antigo e sem nota fiscal emitida ou boleto gerado (a fatura acompanha); as outras ficam como estão e a
 * diferença dos meses já pagos aparece no histórico (B-09).
 */
create or replace function public.fin_recorrente_reajustar(p_contrato uuid, p_percentual numeric, p_obs text default null,
                                                           p_atualizar_abertas boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_ref date; v_novo numeric; v_proposto numeric; n int := 0; v_contas jsonb; v_ids uuid[]; v_dif numeric;
  v_manual int; v_emitido int;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para reajustar contratos'; end if;
  if k.situacao <> 'ativo' then raise exception 'Só contrato ativo é reajustado'; end if;
  v_ref := app.fin_reajuste_pendente(k.id);
  if v_ref is null then raise exception 'Não há reajuste pendente para este contrato agora'; end if;
  if p_percentual is null or p_percentual > 100 then raise exception 'Percentual de reajuste fora do esperado (de 0%% a 100%%)'; end if;
  if p_percentual < 0 then
    raise exception 'Reajuste negativo não se aplica: pela regra da MDC o valor do contrato é mantido. Confirme com 0%%';
  end if;
  if p_atualizar_abertas and not app.contratos_lanca_pode(k.cliente_id, k.tipo) then
    raise exception 'Para atualizar contas a pagar já lançadas é preciso também o acesso ao Financeiro (operar)';
  end if;
  v_proposto := case when k.indice = 'fixo' then k.percentual_fixo
                     else (app.fin_indice_acumulado(k.indice, v_ref)->>'percentual')::numeric end;
  v_novo := round(k.valor * (1 + p_percentual / 100), 2);
  if v_novo <= 0 then raise exception 'O valor reajustado precisa ser maior que zero'; end if;
  v_contas := app.fin_reajuste_contas(k.id, v_ref, k.valor, v_novo);
  v_dif := (v_contas->>'diferenca_pagas')::numeric;
  v_manual := jsonb_array_length(v_contas->'ajuste_manual');
  v_emitido := jsonb_array_length(v_contas->'documento_emitido');
  if p_atualizar_abertas and v_novo <> k.valor then
    select array_agg((x->>'id')::uuid) into v_ids from jsonb_array_elements(v_contas->'atualizaveis') x;
    if v_ids is not null then
      update fin_titulos set valor = v_novo where id = any (v_ids) and situacao = 'aberto' and valor_pago = 0 and valor = k.valor;
      get diagnostics n = row_count;
      update fin_faturas set valor = v_novo where titulo_id = any (v_ids) and situacao <> 'cancelada';
    end if;
  end if;
  insert into fin_recorrente_reajustes (org_id, cliente_id, recorrente_id, origem, referencia, indice, percentual, percentual_proposto,
                                        valor_antes, valor_depois, titulos_atualizados, observacao, por)
  values (k.org_id, k.cliente_id, k.id, 'reajuste', v_ref, k.indice, round(p_percentual, 4), round(v_proposto, 4),
          k.valor, v_novo, n, nullif(trim(p_obs), ''), auth.uid());
  update fin_recorrentes set valor = v_novo, atualizado_em = now() where id = k.id;
  perform app.fin_recorrente_evento(k.id, 'reajuste', format('Reajuste de %s (%s %s%%): %s → %s%s%s%s%s', to_char(v_ref, 'MM/YYYY'),
    case when k.indice = 'fixo' then 'fixo' else k.indice end, replace(round(p_percentual, 4)::text, '.', ','), app.fin_brl(k.valor),
    app.fin_brl(v_novo),
    case when coalesce(v_proposto, 0) < 0 then format(' (índice de %s%% negativo: valor mantido)', replace(round(v_proposto, 2)::text, '.', ',')) else '' end,
    case when n > 0 then format('; %s conta(s) em aberto atualizada(s)', n) else '' end,
    case when p_atualizar_abertas and v_manual + v_emitido > 0
         then format('; %s conta(s) não mudaram (ajuste manual ou nota/boleto já emitido)', v_manual + v_emitido) else '' end,
    case when v_dif > 0 then format('; diferença de %s nos meses do ciclo já pagos com o valor antigo (não lançada)', app.fin_brl(v_dif)) else '' end));
  perform app.registrar(k.org_id, 'contratos', 'contrato_reajustar', k.id::text, jsonb_build_object('valor', k.valor),
    jsonb_build_object('valor', v_novo, 'referencia', v_ref, 'indice', k.indice, 'percentual', p_percentual,
                       'proposto', v_proposto, 'contas_atualizadas', n, 'ajuste_manual', v_manual, 'documento_emitido', v_emitido,
                       'diferenca_pagas', v_dif, 'obs', p_obs));
  return jsonb_build_object('valor', v_novo, 'referencia', v_ref, 'contas_atualizadas', n, 'ajuste_manual', v_manual,
                            'documento_emitido', v_emitido, 'diferenca_pagas', v_dif,
                            'proximo', app.fin_reajuste_pendente(k.id));
end $$;
comment on function public.fin_recorrente_reajustar(uuid, numeric, text, boolean) is
  'Confirma o reajuste do ciclo pendente (operar); % negativo recusado (valor mantido); atualiza só contas em aberto com o valor antigo (048, B-09).';

-- ===================================================================================================== 5 cadastro (R1, R3, B-12, BD-03)
/**
 * Cria ou edita um contrato (Contratos: operar). Mesmos campos da 045 e: renovacao_meses (1–60, padrão 12) e
 * boleto_banco ('itau' | 'santander', quando o envio tem boleto). Regras novas (048): a receber com dia de gerar até o
 * dia de vencer (vence no mesmo mês); % fixo não negativo; contrato a pagar que lança contas exige o Financeiro.
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
    v_documento := 'fatura'; v_envio := 'fatura'; v_dia_ger := 1; v_canais := '{}'; v_banco := null;
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
                                 servico_descricao, servico_codigo, iss_aliquota, renovacao_meses, boleto_banco)
    values (v_org, v_cliente, v_tipo, v_pessoa, trim(p->>'descricao'), v_valor, v_dia, app.uuid_campo(p->>'categoria', 'categoria'),
            app.uuid_campo(p->>'centro', 'centro de custo'), app.uuid_campo(p->>'conta_prevista', 'banco previsto'),
            v_inicio, v_desde, v_fim, v_mes, v_indice, case when v_indice = 'fixo' then v_fixo end,
            case when v_indice <> 'nenhum' then v_mes_reaj end, nullif(trim(p->>'observacao'), ''),
            nullif(trim(p->>'numero'), ''), nullif(trim(p->>'objeto'), ''), v_vig_ini, v_vig_fim, v_renova, v_aviso, v_gera, auth.uid(),
            v_documento, v_envio, v_dia_ger, v_canais, v_email, v_whats, v_carteira, v_serv_desc, v_serv_cod, round(v_iss, 2),
            v_ren_meses, v_banco)
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
           iss_aliquota = round(v_iss, 2), renovacao_meses = v_ren_meses, boleto_banco = v_banco, atualizado_em = now()
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
comment on function public.fin_recorrente_salvar(jsonb) is
  'Cria ou edita contrato (Contratos: operar). 048: a receber vence no mesmo mês (dia de gerar até o dia de vencer), % fixo não negativo, banco do boleto, prazo da renovação; a pagar que lança contas exige Financeiro.';

/** Reativa contrato suspenso (048: a pagar que lança contas exige também o Financeiro). */
create or replace function public.fin_recorrente_reativar(p_contrato uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_mes date; n int;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para reativar contratos'; end if;
  if k.gera_contas and not app.contratos_lanca_pode(k.cliente_id, k.tipo) then
    raise exception 'Contrato a pagar que lança contas precisa também do acesso ao Financeiro (operar) para reativar';
  end if;
  if k.situacao <> 'suspenso' then raise exception 'Só contrato suspenso pode ser reativado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da reativação'; end if;
  v_mes := date_trunc('month', app.hoje(k.org_id))::date;
  if k.fim is not null and k.fim < v_mes then raise exception 'O fim deste contrato já passou: encerre-o ou mude o fim antes'; end if;
  update fin_recorrentes set situacao = 'ativo', situacao_motivo = trim(p_motivo), situacao_em = now(), situacao_por = auth.uid(),
         gerar_desde = greatest(gerar_desde, v_mes), atualizado_em = now() where id = k.id;
  perform app.registrar(k.org_id, 'contratos', 'contrato_reativar', k.id::text, to_jsonb(k), jsonb_build_object('motivo', trim(p_motivo)));
  perform app.fin_recorrente_evento(k.id, 'reativado', format('Reativado (volta a lançar em %s): %s', to_char(v_mes, 'MM/YYYY'), trim(p_motivo)));
  n := app.fin_recorrentes_gerar(k.org_id, v_mes, k.id);
  return jsonb_build_object('geradas', n);
end $$;

/** Gera à mão a conta/fatura de um mês (045, B-06); 048: contrato a pagar exige também o Financeiro. */
create or replace function public.fin_fatura_gerar_agora(p_contrato uuid, p_competencia date, p_motivo text, p_vencimento date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_mes date := date_trunc('month', p_competencia)::date; v_atual date; v_existe fin_titulos; r jsonb;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para gerar faturas (módulo Contratos)'; end if;
  if not app.contratos_lanca_pode(k.cliente_id, k.tipo) then
    raise exception 'Lançar conta a pagar precisa também do acesso ao Financeiro (operar)';
  end if;
  if k.situacao <> 'ativo' then raise exception 'Só contrato ativo gera conta e fatura'; end if;
  if not k.gera_contas then raise exception 'Este contrato não lança contas (só guarda o documento e a vigência)'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo (ex.: mês que a rotina não gerou)'; end if;
  if v_mes is null then raise exception 'Escolha o mês'; end if;
  v_atual := date_trunc('month', app.hoje(k.org_id))::date;
  if v_mes > v_atual then raise exception 'Só dá para gerar até o mês atual; os próximos saem sozinhos no dia de gerar'; end if;
  if v_mes < k.inicio then raise exception 'O mês escolhido é anterior ao início do contrato'; end if;
  if k.fim is not null and v_mes > k.fim then raise exception 'O mês escolhido é depois do fim do contrato'; end if;
  if p_vencimento is not null and (p_vencimento < v_mes or p_vencimento > (v_mes + interval '13 months')::date) then
    raise exception 'Vencimento fora do esperado para %', to_char(v_mes, 'MM/YYYY');
  end if;
  select * into v_existe from fin_titulos where recorrente_id = k.id and competencia = v_mes and situacao <> 'cancelado' limit 1;
  if v_existe.id is not null then
    raise exception 'O mês % já tem conta%: cancele antes para gerar de novo', to_char(v_mes, 'MM/YYYY'),
      coalesce(' (' || (select 'fatura ' || numero from fin_faturas where titulo_id = v_existe.id) || ')', '');
  end if;
  r := app.fin_recorrente_lancar_mes(k.id, v_mes, p_vencimento, trim(p_motivo));
  return r;
end $$;
comment on function public.fin_fatura_gerar_agora(uuid, date, text, date) is
  'Gera à mão, com motivo, a conta/fatura de um mês do contrato (início até o mês atual) sem duplicar (Contratos: operar; a pagar também Financeiro) (048).';

-- ===================================================================================================== 6 rotina (B-06, B-07, B-08, B-12)
/** Quem recebe os avisos de Contratos: administradores e quem tem Contratos operar ou gerir com acesso válido (048, B-07). */
create or replace function app.contratos_quem_avisar(p_org uuid)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select m.user_id from membros m
   where m.org_id = p_org and m.ativo
     and (m.papel::text = 'admin'
          or exists (select 1 from hub_acessos a where a.org_id = p_org and a.user_id = m.user_id and a.app = 'contratos'
                        and a.papel in ('operar', 'gerir') and (a.expira_em is null or a.expira_em >= app.hoje(p_org))))
$$;
revoke all on function app.contratos_quem_avisar(uuid) from public, anon, authenticated;

/**
 * Rotina diária (pg_cron financeiro-recorrentes, 06h30). Como na 045, e (048):
 *  · renovação pelo prazo do contrato, contada da data base (29/02 volta a 29/02);
 *  · recupera até 12 meses sem conta (rotina parada), do mais antigo para o mais novo;
 *  · aviso de reajuste depois que o índice saiu (ou no dia 20 sem ele), repetido a cada 7 dias, para quem opera ou gere;
 *  · falhas avisadas no sino (administradores e quem gere Contratos), além da auditoria.
 */
create or replace function app.fin_recorrentes_rotina()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record; k record; u record; v_mes date; v_ger int := 0; v_enc int := 0; v_avisos int := 0; v_ind int := 0; v_falhas int := 0;
  v_nomes text[]; v_ids uuid[]; v_refs date[]; v_hoje date; v_novo date; v_base date; v_fins text[]; v_ren int := 0; i int;
  v_falhas_org int; v_antes_gerar int; v_semindice int; v_n int;
begin
  perform set_config('app.fin_falhas', '0', true);
  begin
    v_ind := app.fin_indices_ler();
  exception when others then
    raise notice 'Leitura dos índices falhou: %', sqlerrm;
  end;
  for o in select distinct org_id as id from fin_recorrentes where situacao <> 'encerrado' and app.empresa_gestao(cliente_id) loop
    v_hoje := app.hoje(o.id);
    v_mes := date_trunc('month', v_hoje)::date;
    v_falhas_org := 0;

    -- renovação automática (B-12): prazo do contrato, contado da data base
    for k in select id, vigencia_fim, vigencia_fim_base, renovacao_meses from fin_recorrentes
              where org_id = o.id and situacao <> 'encerrado' and renovacao_automatica
                and app.empresa_gestao(cliente_id) and vigencia_fim is not null and vigencia_fim < v_hoje order by id loop
      begin
        perform 1 from fin_recorrentes where id = k.id for update;
        v_base := coalesce(k.vigencia_fim_base, k.vigencia_fim);
        i := 1;
        loop
          v_novo := (v_base + make_interval(months => i * k.renovacao_meses))::date;
          exit when v_novo > k.vigencia_fim and v_novo >= v_hoje;
          i := i + 1;
        end loop;
        update fin_recorrentes set vigencia_fim = v_novo, vigencia_fim_base = v_base, aviso_fim_enviado = null, atualizado_em = now()
         where id = k.id;
        perform app.fin_recorrente_evento(k.id, 'renovado', format('Renovado automaticamente por %s mês(es): vigência até %s',
          k.renovacao_meses, to_char(v_novo, 'DD/MM/YYYY')));
        perform app.registrar(o.id, 'contratos', 'contrato_renovar', k.id::text, jsonb_build_object('vigencia_fim', k.vigencia_fim),
          jsonb_build_object('vigencia_fim', v_novo, 'por', 'rotina diária'));
        v_ren := v_ren + 1;
      exception when others then
        v_falhas_org := v_falhas_org + 1;
        perform app.registrar(o.id, 'financeiro', 'recorrente_falha', k.id::text, null, jsonb_build_object('etapa', 'renovar', 'erro', sqlerrm));
      end;
    end loop;

    -- geração (B-06): os últimos 12 meses, do mais antigo ao atual; só mês sem conta (cancelada não volta)
    v_antes_gerar := coalesce(nullif(current_setting('app.fin_falhas', true), ''), '0')::int;
    for i in reverse 11 .. 0 loop
      v_ger := v_ger + app.fin_recorrentes_gerar(o.id, (v_mes - make_interval(months => i))::date);
    end loop;
    v_falhas_org := v_falhas_org + coalesce(nullif(current_setting('app.fin_falhas', true), ''), '0')::int - v_antes_gerar;

    for k in select * from fin_recorrentes where org_id = o.id and situacao <> 'encerrado' and fim is not null and fim < v_mes
                and app.empresa_gestao(cliente_id) order by id loop
      begin
        perform 1 from fin_recorrentes where id = k.id for update;
        update fin_recorrentes set situacao = 'encerrado', situacao_motivo = 'Fim do prazo do contrato', situacao_em = now(),
               encerrado_em = (k.fim + interval '1 month - 1 day')::date, atualizado_em = now() where id = k.id;
        perform app.fin_recorrente_evento(k.id, 'encerrado', 'Encerrado pela rotina: fim do prazo do contrato');
        perform app.registrar(o.id, 'contratos', 'contrato_encerrar', k.id::text, to_jsonb(k),
          jsonb_build_object('motivo', 'Fim do prazo do contrato', 'por', 'rotina diária'));
        v_enc := v_enc + 1;
      exception when others then
        v_falhas_org := v_falhas_org + 1;
        perform app.registrar(o.id, 'financeiro', 'recorrente_falha', k.id::text, null, jsonb_build_object('etapa', 'encerrar', 'erro', sqlerrm));
      end;
    end loop;

    begin
      -- reajuste (B-07): só depois que o índice do ciclo saiu (ou no dia 20 sem ele); repete a cada 7 dias
      select array_agg(descricao order by descricao), array_agg(id order by descricao), array_agg(ref order by descricao),
             count(*) filter (where not completo)
        into v_nomes, v_ids, v_refs, v_semindice
        from (select r.id, r.descricao, r.reajuste_avisado, r.reajuste_avisado_em, x.ref,
                     (r.indice = 'fixo' or (app.fin_indice_acumulado(r.indice, x.ref)->>'percentual') is not null) as completo
                from fin_recorrentes r cross join lateral (select app.fin_reajuste_pendente(r.id) as ref) x
               where r.org_id = o.id and r.situacao = 'ativo' and r.indice <> 'nenhum' and app.empresa_gestao(r.cliente_id)) y
       where ref is not null
         and (completo or v_hoje >= ref + 19)
         and (reajuste_avisado is distinct from ref or reajuste_avisado_em is null or reajuste_avisado_em <= v_hoje - 7);
      if coalesce(cardinality(v_ids), 0) > 0 then
        for u in select * from app.contratos_quem_avisar(o.id) loop
          perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: reajuste pendente',
            format('%s contrato(s) com reajuste para confirmar: %s.%s Confira a proposta e confirme.', cardinality(v_ids),
                   array_to_string(v_nomes[1:5], ', ') || case when cardinality(v_ids) > 5 then '…' else '' end,
                   case when v_semindice > 0 then format(' %s ainda sem o índice do Banco Central: confira antes de confirmar.', v_semindice) else '' end),
            '/contratos/reajustes');
          v_avisos := v_avisos + 1;
        end loop;
        for i in 1 .. cardinality(v_ids) loop
          select count(*) into v_n from fin_recorrentes where id = v_ids[i] and reajuste_avisado is not distinct from v_refs[i];
          update fin_recorrentes set reajuste_avisado = v_refs[i], reajuste_avisado_em = v_hoje where id = v_ids[i];
          perform app.fin_recorrente_evento(v_ids[i], 'aviso', format('Aviso no sino%s: reajuste de %s pendente',
            case when v_n > 0 then ' (lembrete)' else '' end, to_char(v_refs[i], 'MM/YYYY')));
        end loop;
      end if;

      select array_agg(id order by vigencia_fim), array_agg(format('%s (%s %s)', descricao,
               case when renovacao_automatica then 'renova em' else 'termina em' end, to_char(vigencia_fim, 'DD/MM/YYYY')) order by vigencia_fim)
        into v_ids, v_fins
        from fin_recorrentes
       where org_id = o.id and situacao <> 'encerrado' and app.empresa_gestao(cliente_id) and vigencia_fim is not null
         and vigencia_fim >= v_hoje and vigencia_fim - aviso_dias <= v_hoje and aviso_fim_enviado is distinct from vigencia_fim;
      if coalesce(cardinality(v_ids), 0) > 0 then
        for u in select * from app.contratos_quem_avisar(o.id) loop
          perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: fim de vigência chegando',
            format('%s contrato(s): %s.', cardinality(v_ids), array_to_string(v_fins[1:5], '; ') ||
                   case when cardinality(v_ids) > 5 then '…' else '' end), '/contratos');
          v_avisos := v_avisos + 1;
        end loop;
        for i in 1 .. cardinality(v_ids) loop
          update fin_recorrentes set aviso_fim_enviado = vigencia_fim where id = v_ids[i];
          perform app.fin_recorrente_evento(v_ids[i], 'aviso', 'Aviso no sino: fim da vigência chegando');
        end loop;
      end if;
    exception when others then
      v_falhas_org := v_falhas_org + 1;
      perform app.registrar(o.id, 'financeiro', 'recorrente_falha', null, null, jsonb_build_object('etapa', 'avisos', 'erro', sqlerrm));
    end;

    -- B-08: falha também vai para o sino (uma vez por dia, quem gere Contratos e administradores)
    if v_falhas_org > 0 then
      begin
        for u in select m.user_id from membros m
                  where m.org_id = o.id and m.ativo
                    and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id
                           and a.app = 'contratos' and a.papel = 'gerir' and (a.expira_em is null or a.expira_em >= v_hoje)))
        loop
          perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: a rotina de hoje teve problema',
            format('%s contrato(s) não foram processados hoje (conta, fatura, renovação ou encerramento). Abra o contrato e confira; o detalhe está na Auditoria (recorrente_falha).',
                   v_falhas_org), '/contratos');
        end loop;
      exception when others then
        raise notice 'Aviso de falha não saiu: %', sqlerrm;
      end;
    end if;
    v_falhas := v_falhas + v_falhas_org;
  end loop;
  return jsonb_build_object('geradas', v_ger, 'encerrados', v_enc, 'renovados', v_ren, 'avisos', v_avisos, 'indices', v_ind,
                            'falhas', v_falhas);
end $$;
revoke all on function app.fin_recorrentes_rotina() from public, anon, authenticated;
comment on function app.fin_recorrentes_rotina() is
  'pg_cron financeiro-recorrentes (06h30): só a empresa da gestão; renova pelo prazo do contrato, gera e recupera até 12 meses sem duplicar, encerra vencidos, avisa reajuste (depois do índice, a cada 7 dias) e fim de vigência, e avisa falhas no sino (048).';

do $$
declare f text;
begin
  foreach f in array array['public.fin_recorrente_salvar(jsonb)', 'public.fin_recorrente_reativar(uuid, text)',
                           'public.fin_recorrente_proposta(uuid)', 'public.fin_recorrente_reajustar(uuid, numeric, text, boolean)',
                           'public.fin_fatura_gerar_agora(uuid, date, text, date)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
