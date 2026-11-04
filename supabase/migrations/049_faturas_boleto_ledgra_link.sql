-- =====================================================================================================
--  049 · Contratos: boleto das faturas pelo Ledgra Link (Itaú e Santander), com baixa automática
--
--  Decisão do Edvaldo (03/11/2026, 20h40): boleto pelo Ledgra Link, nos bancos Itaú e Santander. Mesmo molde da
--  Cobrança Ledgra (043): o HUB pede "emita o boleto desta fatura" ao Ledgra Link pela Função Edge ledgra-link (com o
--  login de quem pediu) e recebe o aviso "foi paga" pela Função Edge ledgra-link-webhook (assinatura conferida).
--
--   1  link_contas_banco: por organização e banco (itau | santander), a conta da MDC no Ledgra Link (conta_link_id), a
--      conta bancária do Financeiro onde o dinheiro cai (fin_conta_id, para a baixa automática), o tipo (boleto
--      híbrido com Pix ou boleto simples) e ligado/desligado. Grava só por link_salvar_banco (Contratos: gerir).
--   2  fin_fatura_boletos: cada boleto emitido para uma fatura (banco, id da cobrança no Link, linha digitável, Pix
--      copia e cola, nosso número, situação). Um boleto válido por fatura; um recusado, baixado ou cancelado permite
--      emitir outro (fica o histórico). Nada se apaga.
--   3  fin_envios ganha a etapa ('principal' | 'boleto'): no "Nota fiscal + fatura" (boleto depois), quando o boleto sai
--      nasce um segundo envio por canal só com fatura + boleto. Nos envios com boleto no conteúdo, o Portal só publica
--      quando o boleto existe (app.fin_fatura_processar).
--   4  Funções: fatura_boleto_preparar (Contratos: operar; a Função Edge chama com o login de quem pediu e recebe os
--      dados do boleto), fatura_boleto_registrar (só service_role, depois que o Ledgra Link respondeu) e
--      link_aplicar_evento (043) passa a aplicar também os avisos dos boletos das faturas: pago = baixa automática da
--      conta a receber no Financeiro (fin_baixas, forma "Boleto (Ledgra Link)"), sem dobrar.
--
--  Do lado do Ledgra Link (fora do HUB): a MDC precisa estar cadastrada como titular, com as contas Itaú (341) e
--  Santander (033) e as credenciais de cobrança de cada banco. O HUB só guarda o id da conta no Link.
--
--  NÃO APLICAR pela frente: quem integra aplica. Testes: supabase/testes/107_base_049.sql e 108_boleto_049.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 contas por banco
create table if not exists public.link_contas_banco (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  banco text not null check (banco in ('itau', 'santander')),
  codigo_compe text not null check (codigo_compe in ('341', '033')),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  conta_link_id uuid not null,
  fin_conta_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  tipo text not null default 'boleto_hibrido' check (tipo in ('boleto_hibrido', 'boleto')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (org_id, banco),
  check ((banco = 'itau') = (codigo_compe = '341'))
);
comment on table public.link_contas_banco is
  'Conta da MDC no Ledgra Link por banco (Itaú 341, Santander 033) para o boleto das faturas, e a conta do Financeiro da baixa (049). Grava só por link_salvar_banco.';

create table if not exists public.fin_fatura_boletos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fatura_id uuid not null references public.fin_faturas(id) on delete restrict,
  banco text not null check (banco in ('itau', 'santander')),
  cobranca_link_id uuid not null unique,
  tipo text not null check (tipo in ('boleto_hibrido', 'boleto')),
  situacao text not null default 'registrada'
    check (situacao in ('registrada', 'paga', 'paga_parcial', 'baixada', 'cancelada', 'vencida', 'rejeitada')),
  valor numeric(15, 2) not null check (valor > 0 and valor not in ('NaN'::numeric, 'Infinity'::numeric)),
  vencimento date not null,
  linha_digitavel text,
  pix_copia_cola text,
  nosso_numero text,
  tentativa integer not null default 1 check (tentativa >= 1),
  emitido_em timestamptz not null default now(),
  emitido_por uuid,
  atualizado_em timestamptz not null default now(),
  unique (fatura_id, tentativa)
);
-- um boleto válido por fatura (registrado, pago ou pago em parte)
create unique index if not exists fin_fatura_boletos_um_valido on public.fin_fatura_boletos (fatura_id)
  where situacao in ('registrada', 'paga', 'paga_parcial', 'vencida');
create index if not exists fin_fatura_boletos_fatura on public.fin_fatura_boletos (fatura_id, tentativa desc);
comment on table public.fin_fatura_boletos is
  'Boletos das faturas emitidos pelo Ledgra Link (049): um válido por fatura; recusado/baixado/cancelado permite emitir outro. Só as funções gravam; nada se apaga.';

alter table public.link_contas_banco enable row level security;
alter table public.fin_fatura_boletos enable row level security;
drop policy if exists contratos_ver on public.link_contas_banco;
create policy contratos_ver on public.link_contas_banco for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
drop policy if exists contratos_ver on public.fin_fatura_boletos;
create policy contratos_ver on public.fin_fatura_boletos for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
revoke all on public.link_contas_banco, public.fin_fatura_boletos from anon;
revoke insert, update, delete, truncate on public.link_contas_banco, public.fin_fatura_boletos from authenticated;
grant select on public.link_contas_banco, public.fin_fatura_boletos to authenticated;
do $$
declare t text;
begin
  foreach t in array array['link_contas_banco', 'fin_fatura_boletos'] loop
    execute format('drop trigger if exists gestao_so_empresa on public.%I', t);
    execute format('create trigger gestao_so_empresa before insert or update of cliente_id on public.%I
                      for each row execute function app.tg_gestao_so_empresa()', t);
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                      for each row execute function app.tg_cliente_mesma_org()', t);
    execute format('drop trigger if exists nada_se_apaga on public.%I', t);
    execute format('create trigger nada_se_apaga before delete on public.%I
                      for each row execute function app.tg_nada_se_apaga(%L)', t,
                   case t when 'fin_fatura_boletos' then 'o histórico dos boletos é permanente'
                          else 'desligue a conta do banco em Contratos › Boleto' end);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.link_contas_banco, public.fin_fatura_boletos to service_role';
  end if;
end $$;

/** Boleto: fatura, banco e cobrança no Link não mudam; pago não volta. */
create or replace function app.tg_fin_fatura_boleto_fixo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fatura_id is distinct from old.fatura_id or new.banco is distinct from old.banco
     or new.cobranca_link_id is distinct from old.cobranca_link_id or new.tentativa is distinct from old.tentativa then
    raise exception 'Fatura, banco e cobrança do boleto não mudam';
  end if;
  if old.situacao = 'paga' and new.situacao <> 'paga' then raise exception 'Boleto pago não muda de situação'; end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function app.tg_fin_fatura_boleto_fixo() from public, anon, authenticated;
drop trigger if exists fatura_boleto_fixo on public.fin_fatura_boletos;
create trigger fatura_boleto_fixo before update on public.fin_fatura_boletos for each row execute function app.tg_fin_fatura_boleto_fixo();

/** Não cancela fatura com boleto ainda valendo no banco (o cliente pagaria uma fatura cancelada) (049). */
create or replace function app.tg_fin_fatura_boleto_valendo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.situacao = 'cancelada' and old.situacao <> 'cancelada'
     and exists (select 1 from fin_fatura_boletos b where b.fatura_id = new.id and b.situacao in ('registrada', 'vencida')) then
    raise exception 'Esta fatura tem boleto registrado no banco: peça a baixa do boleto no Ledgra Link antes de cancelar';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_fatura_boleto_valendo() from public, anon, authenticated;
drop trigger if exists fatura_boleto_valendo on public.fin_faturas;
create trigger fatura_boleto_valendo before update of situacao on public.fin_faturas for each row execute function app.tg_fin_fatura_boleto_valendo();

-- ===================================================================================================== 2 etapa do envio
alter table public.fin_envios add column if not exists etapa text not null default 'principal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_envios_etapa') then
    alter table public.fin_envios add constraint fin_envios_etapa check (etapa in ('principal', 'boleto'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'fin_envios_fatura_id_canal_key') then
    alter table public.fin_envios drop constraint fin_envios_fatura_id_canal_key;
  end if;
end $$;
create unique index if not exists fin_envios_fatura_canal_etapa on public.fin_envios (fatura_id, canal, etapa);
comment on column public.fin_envios.etapa is 'principal = o envio do dia de gerar; boleto = o envio do boleto que foi depois ("Nota fiscal + fatura") (049).';

/**
 * Processa a fila da fatura (045 + 049): o Portal publica quando a fatura não depende mais da NFS-e e, se o envio leva
 * boleto, quando o boleto já existe. E-mail e WhatsApp continuam aguardando configuração.
 */
create or replace function app.fin_fatura_processar(p_fatura uuid)
returns text language plpgsql security definer set search_path = public as $$
declare f fin_faturas;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null or f.situacao = 'cancelada' then return f.situacao; end if;
  if f.nfse_situacao not in ('a_emitir', 'erro') then
    update fin_envios set situacao = 'enviado', enviado_em = now(), tentativas = tentativas + 1, atualizado_em = now()
     where fatura_id = f.id and canal = 'portal' and situacao = 'pendente'
       and (not ('boleto' = any (conteudo)) or f.boleto_situacao = 'gerado');
  end if;
  return app.fin_fatura_situacao(f.id);
end $$;
revoke all on function app.fin_fatura_processar(uuid) from public, anon, authenticated;

-- ===================================================================================================== 3 configuração (tela)
/** Liga a conta de um banco (Itaú ou Santander) no Ledgra Link para o boleto das faturas (Contratos: gerir). */
create or replace function public.link_salvar_banco(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_banco text := lower(nullif(trim(p->>'banco'), '')); v_conta_fin uuid := app.uuid_campo(p->>'fin_conta', 'conta do Financeiro');
  v_link uuid; v_tipo text := coalesce(nullif(p->>'tipo', ''), 'boleto_hibrido'); v_ativo boolean := coalesce((p->>'ativo')::boolean, true);
  c fin_contas_bancarias; v_antes jsonb; n link_contas_banco;
begin
  if v_banco is null or v_banco not in ('itau', 'santander') then raise exception 'Escolha o banco: Itaú ou Santander'; end if;
  select * into c from fin_contas_bancarias where id = v_conta_fin;
  if c.id is null then raise exception 'Escolha a conta bancária do Financeiro onde o boleto cai'; end if;
  if not app.contratos_pode(c.cliente_id, 'gerir') then raise exception 'Sem permissão para configurar o boleto (módulo Contratos, nível gerir)'; end if;
  if not app.empresa_gestao(c.cliente_id) then raise exception 'A gestão do HUB é só da empresa da MDC'; end if;
  if v_ativo and not c.ativo then raise exception 'A conta bancária escolhida está inativa no Financeiro'; end if;
  begin
    v_link := nullif(trim(p->>'conta_link_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Código da conta no Ledgra Link inválido (copie do painel do Ledgra Link)';
  end;
  if v_link is null then raise exception 'Informe o código da conta da MDC neste banco no Ledgra Link'; end if;
  if v_tipo not in ('boleto_hibrido', 'boleto') then raise exception 'Tipo do boleto: boleto com Pix (híbrido) ou boleto simples'; end if;
  select to_jsonb(x) into v_antes from link_contas_banco x where org_id = c.org_id and banco = v_banco;
  insert into link_contas_banco (org_id, banco, codigo_compe, cliente_id, conta_link_id, fin_conta_id, tipo, ativo, atualizado_em, atualizado_por)
  values (c.org_id, v_banco, case v_banco when 'itau' then '341' else '033' end, c.cliente_id, v_link, c.id, v_tipo, v_ativo, now(), auth.uid())
  on conflict (org_id, banco) do update
     set cliente_id = excluded.cliente_id, conta_link_id = excluded.conta_link_id, fin_conta_id = excluded.fin_conta_id,
         tipo = excluded.tipo, ativo = excluded.ativo, atualizado_em = now(), atualizado_por = auth.uid()
  returning * into n;
  perform app.registrar(c.org_id, 'contratos', 'boleto_banco_config', v_banco, v_antes, to_jsonb(n));
  return to_jsonb(n);
end $$;
comment on function public.link_salvar_banco(jsonb) is
  'Configura a conta do Itaú ou do Santander no Ledgra Link para o boleto das faturas (Contratos: gerir) (049).';

-- ===================================================================================================== 4 emissão (Função Edge ledgra-link)
/**
 * Dados do boleto da fatura para a Função Edge (chamada com o login de quem pediu: Contratos operar). Recusa com o
 * motivo em português: fatura cancelada ou sem boleto, conta já recebida, boleto válido já emitido, banco do contrato
 * não configurado, cliente sem CNPJ/CPF.
 */
create or replace function public.fatura_boleto_preparar(p_fatura uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f fin_faturas; t fin_titulos; k fin_recorrentes; pe fin_pessoas; b link_contas_banco; lc link_config; v_doc text; v_tent int;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  if not app.contratos_pode(f.cliente_id, 'operar') then raise exception 'Sem permissão para gerar boleto (módulo Contratos, nível operar)'; end if;
  if not app.empresa_gestao(f.cliente_id) then raise exception 'A gestão do HUB é só da empresa da MDC'; end if;
  if f.situacao = 'cancelada' then raise exception 'Fatura cancelada não tem boleto'; end if;
  if f.boleto_situacao = 'nao_se_aplica' then raise exception 'Este contrato envia só a fatura, sem boleto'; end if;
  if exists (select 1 from fin_fatura_boletos where fatura_id = f.id and situacao in ('registrada', 'paga', 'paga_parcial', 'vencida')) then
    raise exception 'Esta fatura já tem boleto emitido';
  end if;
  select * into t from fin_titulos where id = f.titulo_id;
  if t.situacao <> 'aberto' or t.valor_pago > 0 then raise exception 'A conta desta fatura já tem recebimento ou não está em aberto no Financeiro'; end if;
  select * into k from fin_recorrentes where id = f.recorrente_id;
  if k.boleto_banco is null then raise exception 'Escolha o banco do boleto no contrato (Itaú ou Santander)'; end if;
  select * into b from link_contas_banco where org_id = f.org_id and banco = k.boleto_banco;
  if b.org_id is null or not b.ativo then
    raise exception 'Configure a conta do % no Ledgra Link em Contratos › Boleto antes de gerar', case k.boleto_banco when 'itau' then 'Itaú' else 'Santander' end;
  end if;
  select * into pe from fin_pessoas where id = f.pessoa_id;
  v_doc := app.fin_digitos(pe.documento);
  if v_doc is null or length(v_doc) not in (11, 14) then
    raise exception 'Cadastre o CNPJ ou CPF do cliente "%" em Cadastros › Fornecedores e clientes antes de gerar o boleto', coalesce(pe.nome, '—');
  end if;
  select * into lc from link_config where org_id = f.org_id;
  select coalesce(max(tentativa), 0) + 1 into v_tent from fin_fatura_boletos where fatura_id = f.id;
  return jsonb_build_object(
    'fatura', f.id, 'numero', f.numero, 'valor', t.valor - t.valor_pago, 'vencimento', f.vencimento,
    'mensagem', left(format('Fatura %s · %s', f.numero, f.descricao), 140),
    'pagador', jsonb_build_object('documento', v_doc, 'nome', left(pe.nome, 100)),
    'banco', b.banco, 'codigo_compe', b.codigo_compe, 'conta_link_id', b.conta_link_id, 'tipo', b.tipo, 'tentativa', v_tent,
    'ref_externa', 'FAT-' || f.id || case when v_tent > 1 then '-' || v_tent else '' end,
    'multa_percentual', coalesce(lc.multa_percentual, 2), 'juros_mensal_percentual', coalesce(lc.juros_mensal_percentual, 1),
    'dias_apos_vencimento', coalesce(lc.dias_apos_vencimento, 30),
    'hoje', app.hoje(f.org_id));
end $$;
comment on function public.fatura_boleto_preparar(uuid) is
  'Função Edge ledgra-link (com o login de quem pediu, Contratos operar): dados do boleto da fatura ou o motivo de não poder (049).';

/**
 * Só a Função Edge ledgra-link (service_role): guarda o boleto que o Ledgra Link emitiu, marca a fatura com boleto
 * gerado, cria o envio do boleto no "Nota fiscal + fatura" (boleto depois) e processa a fila (o Portal publica).
 * p = {cobranca_link_id, tipo, banco, valor, vencimento, linha_digitavel, pix_copia_cola, nosso_numero, tentativa}.
 */
create or replace function public.fatura_boleto_registrar(p_fatura uuid, p_user uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f fin_faturas; b fin_fatura_boletos; e record; v_sit text;
begin
  select * into f from fin_faturas where id = p_fatura for update;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  if f.situacao = 'cancelada' then raise exception 'Fatura cancelada não tem boleto'; end if;
  if exists (select 1 from fin_fatura_boletos where fatura_id = f.id and situacao in ('registrada', 'paga', 'paga_parcial', 'vencida')) then
    raise exception 'Esta fatura já tem boleto emitido';
  end if;
  insert into fin_fatura_boletos (org_id, cliente_id, fatura_id, banco, cobranca_link_id, tipo, valor, vencimento, linha_digitavel,
                                  pix_copia_cola, nosso_numero, tentativa, emitido_por)
  values (f.org_id, f.cliente_id, f.id, p->>'banco', (p->>'cobranca_link_id')::uuid, coalesce(p->>'tipo', 'boleto_hibrido'),
          round((p->>'valor')::numeric, 2), (p->>'vencimento')::date, nullif(p->>'linha_digitavel', ''), nullif(p->>'pix_copia_cola', ''),
          nullif(p->>'nosso_numero', ''), coalesce((p->>'tentativa')::int, 1), p_user)
  returning * into b;
  update fin_faturas set boleto_situacao = 'gerado' where id = f.id;
  -- "Nota fiscal + fatura" (boleto depois): o boleto vai num envio próprio, pelos mesmos canais
  if f.envio = 'nf_fatura' then
    for e in select canal, destino from fin_envios where fatura_id = f.id and etapa = 'principal' and situacao <> 'cancelado' loop
      insert into fin_envios (org_id, cliente_id, fatura_id, canal, destino, conteudo, situacao, etapa)
      values (f.org_id, f.cliente_id, f.id, e.canal, e.destino, array['fatura', 'boleto'],
              case when e.canal = 'portal' then 'pendente' else 'aguardando_configuracao' end, 'boleto')
      on conflict (fatura_id, canal, etapa) do nothing;
    end loop;
  end if;
  v_sit := app.fin_fatura_processar(f.id);
  insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (f.org_id, p_user, 'contratos', 'boleto_emitir', f.id::text, null, to_jsonb(b));
  insert into fin_recorrente_eventos (org_id, cliente_id, recorrente_id, tipo, texto, dados, por)
  values (f.org_id, f.cliente_id, f.recorrente_id, 'fatura',
          format('Boleto da fatura %s gerado no %s (%s, vence %s)', f.numero, case b.banco when 'itau' then 'Itaú' else 'Santander' end,
                 app.fin_brl(b.valor), to_char(b.vencimento, 'DD/MM/YYYY')),
          jsonb_build_object('fatura', f.id, 'boleto', b.id), p_user);
  return jsonb_build_object('boleto', b.id, 'fatura_situacao', v_sit);
end $$;
comment on function public.fatura_boleto_registrar(uuid, uuid, jsonb) is
  'Só a Função Edge ledgra-link (service_role): guarda o boleto emitido pelo Ledgra Link e libera o envio (049).';

-- ===================================================================================================== 5 avisos (webhook)
/**
 * Aplica o aviso do Ledgra Link uma vez só (043). 049: se a cobrança não é de mensalidade, procura o boleto de fatura:
 * pago = baixa automática da conta a receber (saldo total; o que passar vira juros), pago a menos não baixa sozinho,
 * pago com a conta já quitada ou a fatura cancelada fica para revisar; baixado/cancelado/recusado libera emitir outro.
 */
create or replace function public.link_aplicar_evento(p_evento uuid, p_tipo text, p_dados jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l link_cobrancas; c lic_cobrancas; v_res text; v_pago numeric; v_data date; v_baixa bigint;
  b fin_fatura_boletos; f fin_faturas; t fin_titulos; cb link_contas_banco; v_saldo numeric; v_fin text := current_setting('app.fin_interno', true);
begin
  if p_evento is null or coalesce(p_tipo, '') = '' then raise exception 'Aviso sem identificação'; end if;
  insert into link_eventos (id_evento, tipo, detalhe) values (p_evento, p_tipo, p_dados) on conflict do nothing;
  if not found then return 'repetido'; end if;

  if p_tipo not like 'cobranca.%' then
    update link_eventos set resultado = 'ignorado' where id_evento = p_evento;
    return 'ignorado';
  end if;

  select * into l from link_cobrancas where cobranca_link_id = nullif(p_dados ->> 'cobranca_id', '')::uuid for update;
  if l.lic_cobranca_id is null then
    -- ------------------------------------------------------------------ boleto de fatura dos contratos (049)
    select * into b from fin_fatura_boletos where cobranca_link_id = nullif(p_dados ->> 'cobranca_id', '')::uuid for update;
    if b.id is null then
      update link_eventos set resultado = 'cobranca_desconhecida' where id_evento = p_evento;
      return 'cobranca_desconhecida';
    end if;
    update link_eventos set org_id = b.org_id where id_evento = p_evento;
    select * into f from fin_faturas where id = b.fatura_id for update;
    select * into t from fin_titulos where id = f.titulo_id for update;
    if p_tipo = 'cobranca.paga' then
      v_pago := round(coalesce((p_dados ->> 'valor_pago')::numeric, 0), 2);
      v_data := coalesce(((p_dados ->> 'pago_em')::timestamptz at time zone
                  (select coalesce(fuso, 'America/Sao_Paulo') from organizacoes where id = b.org_id))::date, app.hoje(b.org_id));
      v_saldo := t.valor - t.valor_pago;
      if v_pago <= 0 then v_res := 'valor_invalido';
      elsif t.situacao = 'quitado' or v_saldo <= 0 then
        v_res := 'ja_baixada';
        update fin_fatura_boletos set situacao = 'paga' where id = b.id;
      elsif f.situacao = 'cancelada' or t.situacao = 'cancelado' then
        v_res := 'paga_mas_cancelada';
        update fin_fatura_boletos set situacao = 'paga' where id = b.id;
      elsif v_pago < v_saldo then
        v_res := 'pagamento_parcial';                     -- não baixa sozinho: a equipe decide
        update fin_fatura_boletos set situacao = 'paga_parcial' where id = b.id;
      else
        select * into cb from link_contas_banco where org_id = b.org_id and banco = b.banco;
        insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, juros, multa, desconto, forma, observacao, por)
        values (t.org_id, t.cliente_id, t.id, cb.fin_conta_id, v_data, v_saldo, greatest(v_pago - v_saldo, 0), 0, 0,
                'Boleto (Ledgra Link)', format('Baixa automática pelo aviso do banco (boleto da fatura %s)', f.numero), null)
        returning id into v_baixa;
        perform set_config('app.fin_interno', '1', true);
        update fin_titulos set valor_pago = valor, situacao = 'quitado', quitado_em = v_data where id = t.id;
        perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
        update fin_fatura_boletos set situacao = 'paga' where id = b.id;
        insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
        values (t.org_id, null, 'financeiro', 'baixar_receber', t.id::text, null,
                jsonb_build_object('baixa', v_baixa, 'data', v_data, 'total', v_pago, 'origem', 'Ledgra Link', 'fatura', f.numero, 'evento', p_evento));
        insert into fin_recorrente_eventos (org_id, cliente_id, recorrente_id, tipo, texto, dados)
        values (f.org_id, f.cliente_id, f.recorrente_id, 'fatura',
                format('Boleto da fatura %s pago em %s (%s): baixa automática no Financeiro', f.numero, to_char(v_data, 'DD/MM/YYYY'), app.fin_brl(v_pago)),
                jsonb_build_object('fatura', f.id, 'baixa', v_baixa));
        v_res := 'baixada';
      end if;
    elsif p_tipo in ('cobranca.baixada', 'cobranca.cancelada', 'cobranca.vencida', 'cobranca.rejeitada') then
      update fin_fatura_boletos set situacao = replace(p_tipo, 'cobranca.', '') where id = b.id and situacao not in ('paga', 'paga_parcial');
      -- boleto que deixou de valer: a fatura volta a "boleto a gerar" (pode emitir outro)
      if p_tipo <> 'cobranca.vencida' and f.situacao <> 'cancelada'
         and not exists (select 1 from fin_fatura_boletos where fatura_id = f.id and situacao in ('registrada', 'paga', 'paga_parcial', 'vencida')) then
        update fin_faturas set boleto_situacao = 'a_definir' where id = f.id;
      end if;
      v_res := 'situacao_atualizada';
    else
      v_res := 'ignorado';
    end if;
    update link_eventos set resultado = v_res where id_evento = p_evento;
    return v_res;
  end if;

  -- ------------------------------------------------------------------------ mensalidade da Cobrança Ledgra (043)
  update link_eventos set org_id = l.org_id where id_evento = p_evento;
  select * into c from lic_cobrancas where id = l.lic_cobranca_id for update;

  if p_tipo = 'cobranca.paga' then
    v_pago := round(coalesce((p_dados ->> 'valor_pago')::numeric, 0), 2);
    v_data := coalesce(((p_dados ->> 'pago_em')::timestamptz at time zone
                (select coalesce(fuso, 'America/Sao_Paulo') from organizacoes where id = c.org_id))::date, app.hoje(c.org_id));
    if v_pago <= 0 then v_res := 'valor_invalido';
    elsif v_pago < c.valor then
      v_res := 'pagamento_parcial';
      update link_cobrancas set situacao = 'paga_parcial', atualizado_em = now() where lic_cobranca_id = c.id;
    elsif c.situacao = 'paga' then
      v_res := 'ja_baixada';
      update link_cobrancas set situacao = 'paga', atualizado_em = now() where lic_cobranca_id = c.id;
    elsif c.situacao = 'cancelada' then
      v_res := 'paga_mas_cancelada';
      update link_cobrancas set situacao = 'paga', atualizado_em = now() where lic_cobranca_id = c.id;
    else
      insert into lic_baixas (org_id, cliente_id, cobranca_id, data, valor, juros, desconto, forma, observacao, por)
      values (c.org_id, c.cliente_id, c.id, v_data, c.valor, greatest(v_pago - c.valor, 0), 0,
              case when l.tipo = 'boleto' then 'Boleto (Ledgra Link)' else 'Pix/Boleto (Ledgra Link)' end,
              'Baixa automática pelo aviso do banco (Ledgra Link)', null)
      returning id into v_baixa;
      update lic_cobrancas set situacao = 'paga', pago_em = v_data, valor_pago = v_pago where id = c.id;
      update link_cobrancas set situacao = 'paga', atualizado_em = now() where lic_cobranca_id = c.id;
      insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
      values (c.org_id, null, 'licencas', 'baixar_cobranca', c.id::text, null,
              jsonb_build_object('baixa', v_baixa, 'data', v_data, 'total', v_pago, 'origem', 'Ledgra Link', 'evento', p_evento));
      v_res := 'baixada';
    end if;
  elsif p_tipo in ('cobranca.baixada', 'cobranca.cancelada', 'cobranca.vencida', 'cobranca.rejeitada') then
    update link_cobrancas set situacao = replace(p_tipo, 'cobranca.', ''), atualizado_em = now()
     where lic_cobranca_id = c.id and situacao <> 'paga';
    v_res := 'situacao_atualizada';
  else
    v_res := 'ignorado';
  end if;
  update link_eventos set resultado = v_res where id_evento = p_evento;
  return v_res;
end $$;
comment on function public.link_aplicar_evento(uuid, text, jsonb) is
  'Só a Função Edge ledgra-link-webhook (service_role): aplica o aviso do Ledgra Link uma vez só; mensalidade (043) ou boleto de fatura (049): pago = baixa automática.';

-- ===================================================================================================== permissões
revoke all on function public.link_salvar_banco(jsonb) from public, anon;
revoke all on function public.fatura_boleto_preparar(uuid) from public, anon;
grant execute on function public.link_salvar_banco(jsonb), public.fatura_boleto_preparar(uuid) to authenticated;
revoke all on function public.fatura_boleto_registrar(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.link_aplicar_evento(uuid, text, jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fatura_boleto_registrar(uuid, uuid, jsonb), public.link_aplicar_evento(uuid, text, jsonb) to service_role';
  end if;
end $$;
