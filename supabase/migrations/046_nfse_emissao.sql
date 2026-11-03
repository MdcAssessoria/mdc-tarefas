-- =====================================================================================================
--  046 · Contratos: emissão da NFS-e das faturas pelo Emissor Nacional (etapa 2 do faturamento)
--
--  Pedido do Edvaldo (03/11/2026): a MDC é do Simples Nacional e, pela Resolução CGSN 191/2026, desde 01/11/2026 a ME/EPP
--  do Simples emite NFS-e pelo Emissor Nacional (web ou API). O HUB passa a emitir a nota das faturas dos contratos com
--  documento = 'nfse' pela API da Sefin Nacional, com o certificado A1 da MDC que já está no cofre (o mesmo da captura).
--
--   1  nfse_parametros (uma linha por empresa da gestão = a MDC): ambiente ('producao_restrita' = teste sem valor fiscal,
--      padrão; 'producao'), modo ('conferir' = a fatura fica "NFS-e pronta para emitir" e alguém confere e clica Emitir,
--      padrão; 'automatico' = guardado para a próxima etapa, hoje funciona como conferir), série da DPS (1 a 49999 = faixa
--      de "aplicativo próprio", regra E0010), opção do Simples (opSimpNac 3 = ME/EPP), regime de apuração (regApTribSN),
--      regime especial (regEspTrib), inscrição municipal, código IBGE do município (Bragança Paulista = 3507605), código
--      NBS padrão do serviço e o percentual aproximado dos tributos do Simples (pTotTribSN, Lei 12.741/2012).
--   2  nfse_numeracao: próximo nDPS por empresa, ambiente e série, com trava (for update): nunca repete.
--   3  nfse_emissoes: cada DPS enviada (fatura, nDPS, Id da DPS, situação enviando/emitida/rejeitada/erro, chave de acesso,
--      número da NFS-e, XML guardado no bucket fiscal, mensagens da recusa em português, tentativas). Nada se apaga.
--      'rejeitada' = o Emissor recusou (nada foi criado; a próxima tentativa usa outro nDPS). 'erro' = sem resposta certa
--      (a nota pode ter saído): a próxima tentativa CONFERE no Emissor (GET /dps/{id}) e reenvia a MESMA DPS só se não saiu.
--      Ambiente de teste (produção restrita): a nota de teste fica registrada, mas a fatura não muda (não publica no Portal
--      nem marca "emitida"), para a nota de verdade sair depois em produção.
--   4  Funções: nfse_preparar(p_fatura) — dados da DPS e pendências para a tela conferir (Contratos: ver);
--      nfse_parametros_salvar(p) — Contratos: gerir; app.nfse_reservar / app.nfse_registrar_resultado — só a Função Edge
--      nfse-emitir, pelos públicos nfse_reservar / nfse_registrar_resultado (execute só para service_role).
--      Emitida em produção → fin_faturas.nfse_situacao = 'emitida', nfse_numero e app.fin_fatura_processar (libera a fila
--      do Portal). Recusada/erro em produção → nfse_situacao = 'erro' (a fatura continua "aguardando nota fiscal").
--   5  Trava: não cancela fatura com nota sendo enviada ou com resultado incerto em produção (pode ter saído).
--   6  Bucket fiscal: o XML das notas emitidas fica em <org>/<cliente>/nfse-emitidas/AAAA/MM/…; quem vê Contratos lê essa
--      pasta (app.fis_caminho_pode). Gravação só pela Função Edge (service_role).
--
--  IBS/CBS: optante do Simples não preenche o grupo IBSCBS em 2026 (LC 214/2025, art. 348); o leiaute 1.01 deixa o grupo
--  opcional. A partir de 2027 entra numa próxima migração.
--  NÃO APLICAR pela frente: quem integra aplica. Testes: supabase/testes/101_base_046.sql e 102_nfse_046.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 parâmetros
create table if not exists public.nfse_parametros (
  cliente_id uuid primary key references public.clientes(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  ambiente text not null default 'producao_restrita' check (ambiente in ('producao_restrita', 'producao')),
  modo text not null default 'conferir' check (modo in ('conferir', 'automatico')),
  serie text not null default '1' check (serie ~ '^[1-9][0-9]{0,4}$' and serie::int between 1 and 49999),
  op_simples text not null default '3' check (op_simples in ('1', '2', '3')),
  reg_ap_trib_sn text default '1' check (reg_ap_trib_sn is null or reg_ap_trib_sn in ('1', '2', '3')),
  reg_esp_trib text not null default '0' check (reg_esp_trib in ('0', '1', '2', '3', '4', '5', '6')),
  inscricao_municipal text check (inscricao_municipal is null or inscricao_municipal ~ '^[0-9A-Za-z./-]{1,15}$'),
  codigo_municipio text not null default '3507605' check (codigo_municipio ~ '^[0-9]{7}$'),
  nbs_padrao text check (nbs_padrao is null or nbs_padrao ~ '^[0-9]{9}$'),
  p_tot_trib_sn numeric(4, 2) check (p_tot_trib_sn is null or (p_tot_trib_sn >= 0 and p_tot_trib_sn < 100)),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check ((op_simples = '3') = (reg_ap_trib_sn is not null)),
  check (reg_ap_trib_sn is distinct from '1' or reg_esp_trib = '0')
);
comment on table public.nfse_parametros is
  'Parâmetros da emissão da NFS-e pelo Emissor Nacional (046): ambiente, modo, série, regime do Simples, IM, município, NBS e % de tributos. Grava só por nfse_parametros_salvar (Contratos: gerir).';
comment on column public.nfse_parametros.ambiente is 'producao_restrita = teste sem valor fiscal (padrão); producao = nota de verdade.';
comment on column public.nfse_parametros.modo is 'conferir = alguém confere e clica Emitir (padrão); automatico = próxima etapa (hoje funciona como conferir).';
comment on column public.nfse_parametros.p_tot_trib_sn is 'Percentual aproximado do total dos tributos da alíquota do Simples Nacional (DPS totTrib/pTotTribSN).';

create table if not exists public.nfse_numeracao (
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  ambiente text not null check (ambiente in ('producao_restrita', 'producao')),
  serie text not null check (serie ~ '^[1-9][0-9]{0,4}$'),
  proximo bigint not null default 1 check (proximo between 1 and 999999999999999),
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, ambiente, serie)
);
comment on table public.nfse_numeracao is 'Próximo número da DPS (nDPS) por empresa, ambiente e série (046). Reservado com trava: nunca repete.';

-- ===================================================================================================== 2 emissões
create table if not exists public.nfse_emissoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fatura_id uuid not null references public.fin_faturas(id) on delete restrict,
  ambiente text not null check (ambiente in ('producao_restrita', 'producao')),
  serie text not null check (serie ~ '^[1-9][0-9]{0,4}$'),
  ndps bigint not null check (ndps between 1 and 999999999999999),
  id_dps text not null check (id_dps ~ '^DPS[0-9]{42}$'),
  situacao text not null check (situacao in ('enviando', 'emitida', 'rejeitada', 'erro')),
  chave_acesso text check (chave_acesso is null or chave_acesso ~ '^[0-9]{50}$'),
  numero_nfse text,
  xml_caminho text,
  dps_caminho text,
  mensagem text,
  mensagens jsonb not null default '[]' check (jsonb_typeof(mensagens) = 'array'),
  tentativas integer not null default 1 check (tentativas >= 1),
  enviado_em timestamptz not null default now(),
  respondido_em timestamptz,
  por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, ambiente, serie, ndps),
  unique (ambiente, id_dps),
  check (situacao <> 'emitida' or (chave_acesso is not null and xml_caminho is not null)),
  check (situacao not in ('rejeitada', 'erro') or mensagem is not null)
);
-- uma nota de verdade por fatura; uma DPS em aberto (enviando ou com resultado incerto) por fatura e ambiente
create unique index if not exists nfse_emissoes_uma_emitida on public.nfse_emissoes (fatura_id) where situacao = 'emitida' and ambiente = 'producao';
create unique index if not exists nfse_emissoes_uma_aberta on public.nfse_emissoes (fatura_id, ambiente) where situacao in ('enviando', 'erro');
create index if not exists nfse_emissoes_fatura on public.nfse_emissoes (fatura_id, criado_em desc);
comment on table public.nfse_emissoes is
  'Cada DPS enviada ao Emissor Nacional (046): enviando → emitida | rejeitada | erro (resultado incerto: confere antes de reenviar). Grava só pela Função Edge nfse-emitir; nada se apaga.';
comment on column public.nfse_emissoes.mensagens is 'Recusa do Emissor: [{codigo, descricao, complemento, texto}] — texto em português simples, descricao como veio.';

-- segurança: leitura com Contratos (ver); gravação só pelas funções; nada se apaga; só a empresa da gestão
alter table public.nfse_parametros enable row level security;
alter table public.nfse_numeracao enable row level security;
alter table public.nfse_emissoes enable row level security;
do $$
declare t text;
begin
  foreach t in array array['nfse_parametros', 'nfse_numeracao', 'nfse_emissoes'] loop
    execute format('drop policy if exists contratos_ver on public.%I', t);
    execute format('create policy contratos_ver on public.%I for select to authenticated using (app.contratos_pode(cliente_id, ''ver''))', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists gestao_so_empresa on public.%I', t);
    execute format('create trigger gestao_so_empresa before insert or update of cliente_id on public.%I
                      for each row execute function app.tg_gestao_so_empresa()', t);
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                      for each row execute function app.tg_cliente_mesma_org()', t);
    execute format('drop trigger if exists nada_se_apaga on public.%I', t);
    execute format('create trigger nada_se_apaga before delete on public.%I
                      for each row execute function app.tg_nada_se_apaga(%L)', t,
                   case t when 'nfse_emissoes' then 'o histórico das notas emitidas é permanente'
                          else 'mude os parâmetros da emissão (Contratos › Nota fiscal)' end);
  end loop;
end $$;

/** Emissão: fatura, DPS e ambiente não mudam; resultado final (emitida, rejeitada) não volta. */
create or replace function app.tg_nfse_emissao_fixa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fatura_id is distinct from old.fatura_id or new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id
     or new.ambiente is distinct from old.ambiente or new.serie is distinct from old.serie or new.ndps is distinct from old.ndps
     or new.id_dps is distinct from old.id_dps then
    raise exception 'Fatura, número e identificação da DPS não mudam';
  end if;
  if old.situacao in ('emitida', 'rejeitada') and new.situacao is distinct from old.situacao then
    raise exception 'Esta emissão já terminou (%): não muda mais', old.situacao;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function app.tg_nfse_emissao_fixa() from public, anon, authenticated;
drop trigger if exists nfse_emissao_fixa on public.nfse_emissoes;
create trigger nfse_emissao_fixa before update on public.nfse_emissoes for each row execute function app.tg_nfse_emissao_fixa();

/** Não cancela a fatura com nota sendo enviada ou com resultado incerto em produção (a nota pode ter saído). */
create or replace function app.tg_fin_fatura_nfse_aberta()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.situacao = 'cancelada' and old.situacao <> 'cancelada'
     and exists (select 1 from nfse_emissoes e where e.fatura_id = new.id and e.ambiente = 'producao' and e.situacao in ('enviando', 'erro')) then
    raise exception 'A nota fiscal desta fatura foi enviada e o HUB ainda não sabe se saiu. Clique em "Emitir nota fiscal" para o HUB conferir no Emissor Nacional antes de cancelar';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_fatura_nfse_aberta() from public, anon, authenticated;
drop trigger if exists fatura_nfse_aberta on public.fin_faturas;
create trigger fatura_nfse_aberta before update of situacao on public.fin_faturas for each row execute function app.tg_fin_fatura_nfse_aberta();

-- ===================================================================================================== 3 dados da DPS
/**
 * Monta os dados da DPS da fatura e a lista de pendências em português (o que falta para emitir). Não confere permissão:
 * quem chama confere. Usada pela tela (nfse_preparar) e pela reserva (app.nfse_reservar).
 * Regras do Simples ME/EPP (Anexo I, leiaute DPS): regApTribSN obrigatório (E0166); sem retenção do ISS (tpRetISSQN = 1)
 * a alíquota NÃO vai na DPS (E0625/E0631: o ISS está no DAS); totTrib = pTotTribSN (E0712 proíbe indTotTrib).
 */
create or replace function app.nfse_dados(p_fatura uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f fin_faturas; c jsonb; p nfse_parametros; pe fin_pessoas; v_cert record; v_pend text[] := '{}'; v_cnpj text; v_ctrib text;
  v_doc text; v_email text; v_prox bigint; v_emissoes jsonb; v_desc text; v_hoje date;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  select to_jsonb(x) into c from clientes x where x.id = f.cliente_id;
  select * into p from nfse_parametros where cliente_id = f.cliente_id;
  select * into pe from fin_pessoas where id = f.pessoa_id;
  select valido_ate, cnpj into v_cert from fis_certificados where cliente_id = f.cliente_id;
  v_cnpj := app.fin_digitos(c->>'cnpj');
  v_ctrib := app.fin_digitos(f.servico_codigo);
  v_doc := app.fin_digitos(pe.documento);
  v_email := case when pe.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(trim(pe.email)) <= 80 then lower(trim(pe.email)) end;
  v_hoje := app.hoje(f.org_id);

  if f.documento <> 'nfse' then v_pend := v_pend || 'Esta fatura é só nota fatura: o contrato não emite nota fiscal'::text; end if;
  if f.situacao = 'cancelada' then v_pend := v_pend || 'Fatura cancelada não emite nota fiscal'::text; end if;
  if f.nfse_situacao = 'emitida' then
    v_pend := v_pend || format('A nota fiscal desta fatura já foi emitida (nº %s)', coalesce(f.nfse_numero, '—'));
  end if;
  if p.cliente_id is null then
    v_pend := v_pend || 'Configure a emissão em Contratos › Nota fiscal (NFS-e) — quem gere o módulo Contratos'::text;
  else
    if p.op_simples <> '3' then v_pend := v_pend || 'Por enquanto o HUB emite nota só para empresa ME/EPP do Simples Nacional'::text; end if;
    if p.p_tot_trib_sn is null then
      v_pend := v_pend || 'Informe nos parâmetros o percentual aproximado dos tributos do Simples (vai na nota, Lei 12.741/2012)'::text;
    end if;
    if p.nbs_padrao is null then v_pend := v_pend || 'Informe nos parâmetros o código NBS do serviço (9 números)'::text; end if;
  end if;
  if v_cnpj is null or length(v_cnpj) <> 14 then v_pend := v_pend || 'Cadastre o CNPJ da empresa no HUB'::text; end if;
  if v_cert.valido_ate is null then
    v_pend := v_pend || 'Envie o certificado digital A1 da empresa em Entradas › Certificado digital'::text;
  elsif v_cert.valido_ate < now() then
    v_pend := v_pend || format('O certificado digital venceu em %s: envie o novo em Entradas › Certificado digital', to_char(v_cert.valido_ate, 'DD/MM/YYYY'));
  elsif v_cnpj is not null and left(app.fin_digitos(v_cert.cnpj), 8) is distinct from left(v_cnpj, 8) then
    v_pend := v_pend || 'O certificado digital guardado não é do CNPJ da empresa'::text;
  end if;
  if v_ctrib is null or length(v_ctrib) <> 6 then
    v_pend := v_pend || 'O código do serviço do contrato precisa ter 6 números (código de tributação nacional, ex.: 17.19.01): edite o contrato'::text;
  end if;
  if v_doc is null or length(v_doc) not in (11, 14) then
    v_pend := v_pend || format('Cadastre o CNPJ ou CPF do cliente "%s" em Cadastros › Fornecedores e clientes', coalesce(pe.nome, '—'));
  end if;

  v_prox := coalesce((select n.proximo from nfse_numeracao n where n.cliente_id = f.cliente_id and n.ambiente = p.ambiente and n.serie = p.serie), 1);
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'ambiente', e.ambiente, 'situacao', e.situacao, 'ndps', e.ndps,
           'numero_nfse', e.numero_nfse, 'chave_acesso', e.chave_acesso, 'mensagem', e.mensagem, 'mensagens', e.mensagens,
           'tentativas', e.tentativas, 'enviado_em', e.enviado_em, 'respondido_em', e.respondido_em, 'xml_caminho', e.xml_caminho)
           order by e.criado_em desc), '[]')
    into v_emissoes from (select * from nfse_emissoes where fatura_id = f.id order by criado_em desc limit 10) e;
  v_desc := f.descricao || ' · Fatura ' || f.numero || ' · Vencimento ' || to_char(f.vencimento, 'DD/MM/YYYY');

  return jsonb_build_object(
    'org', f.org_id, 'cliente', f.cliente_id,
    'fatura', jsonb_build_object('id', f.id, 'numero', f.numero, 'competencia', f.competencia, 'emissao', f.emissao,
                                 'vencimento', f.vencimento, 'valor', f.valor, 'situacao', f.situacao,
                                 'nfse_situacao', f.nfse_situacao, 'nfse_numero', f.nfse_numero),
    'pronto', coalesce(cardinality(v_pend), 0) = 0,
    'pendencias', to_jsonb(v_pend),
    'ambiente', p.ambiente, 'modo', p.modo, 'hoje', v_hoje,
    'dps', jsonb_build_object(
      'ambiente', p.ambiente, 'serie', p.serie, 'proximo_ndps', v_prox,
      -- competência da nota = primeiro dia do mês da fatura (a fatura só existe até o mês atual)
      'dCompet', f.competencia, 'cLocEmi', p.codigo_municipio,
      'prestador', jsonb_build_object('cnpj', v_cnpj, 'nome', coalesce(c->>'razao_social', c->>'nome'), 'im', p.inscricao_municipal,
                                      'opSimpNac', p.op_simples, 'regApTribSN', p.reg_ap_trib_sn, 'regEspTrib', p.reg_esp_trib),
      'tomador', jsonb_build_object('documento', v_doc, 'nome', pe.nome, 'email', v_email),
      'servico', jsonb_build_object('cLocPrestacao', p.codigo_municipio, 'cTribNac', v_ctrib, 'descricao', v_desc, 'cNBS', p.nbs_padrao),
      'valores', jsonb_build_object('vServ', f.valor, 'pTotTribSN', p.p_tot_trib_sn, 'tribISSQN', '1', 'tpRetISSQN', '1')),
    -- só para a tela: o ISS do Simples vai no DAS; a alíquota do contrato é referência
    'iss', jsonb_build_object('aliquota_referencia', f.iss_aliquota,
                              'valor_estimado', case when f.iss_aliquota is not null then round(f.valor * f.iss_aliquota / 100, 2) end,
                              'retido', false),
    'emissoes', v_emissoes);
end $$;
revoke all on function app.nfse_dados(uuid) from public, anon, authenticated;

/** Tela: dados da DPS para conferir antes de emitir, as pendências e as emissões anteriores (Contratos: ver). */
create or replace function public.nfse_preparar(p_fatura uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cliente uuid;
begin
  select cliente_id into v_cliente from fin_faturas where id = p_fatura;
  if v_cliente is null then raise exception 'Fatura não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'ver') then raise exception 'Sem permissão para ver as faturas (módulo Contratos)'; end if;
  return app.nfse_dados(p_fatura) || jsonb_build_object('pode_emitir', app.contratos_pode(v_cliente, 'operar'));
end $$;
comment on function public.nfse_preparar(uuid) is
  'Dados da DPS da fatura para conferir (tomador, serviço, código, valor, ISS, ambiente), pendências e emissões anteriores (Contratos: ver) (046).';

-- ===================================================================================================== 4 reservar e registrar
/**
 * Reserva o nDPS da fatura (só a Função Edge, com service_role; a função confere antes o login com nfse_preparar).
 * Trava a fatura e a numeração: duas emissões ao mesmo tempo nunca pegam o mesmo número. DPS com resultado incerto
 * ('erro') ou presa em 'enviando' há mais de 3 minutos é reaproveitada (mesmo nDPS, reenvio = true: a Função Edge confere
 * no Emissor antes de mandar de novo). Devolve os dados de app.nfse_dados com a emissão, o nDPS e o Id da DPS.
 */
create or replace function app.nfse_reservar(p_fatura uuid, p_por uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f fin_faturas; p nfse_parametros; e nfse_emissoes; v jsonb; v_n bigint; v_id text; v_reenvio boolean := false; v_cnpj text;
begin
  select * into f from fin_faturas where id = p_fatura for update;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  if not app.empresa_gestao(f.cliente_id) then raise exception 'A gestão do HUB é só da empresa da MDC'; end if;
  v := app.nfse_dados(p_fatura);
  if not (v->>'pronto')::boolean then
    raise exception 'Falta ajustar antes de emitir: %', (select string_agg(x, '; ') from jsonb_array_elements_text(v->'pendencias') x);
  end if;
  select * into p from nfse_parametros where cliente_id = f.cliente_id;
  v_cnpj := v->'dps'->'prestador'->>'cnpj';

  select * into e from nfse_emissoes where fatura_id = f.id and ambiente = p.ambiente and situacao in ('enviando', 'erro') for update;
  if e.id is not null then
    if e.situacao = 'enviando' and e.atualizado_em > now() - interval '3 minutes' then
      raise exception 'A nota desta fatura já está sendo enviada ao Emissor Nacional. Espere a resposta (cerca de 1 minuto)';
    end if;
    update nfse_emissoes set situacao = 'enviando', tentativas = tentativas + 1, enviado_em = now(), por = coalesce(p_por, por)
     where id = e.id returning * into e;
    v_reenvio := true;
  else
    insert into nfse_numeracao (cliente_id, org_id, ambiente, serie) values (f.cliente_id, f.org_id, p.ambiente, p.serie)
    on conflict do nothing;
    select proximo into v_n from nfse_numeracao where cliente_id = f.cliente_id and ambiente = p.ambiente and serie = p.serie for update;
    -- nunca repete: nem o número de uma DPS já registrada (ex.: parâmetro mexido à mão)
    v_n := greatest(v_n, coalesce((select max(ndps) + 1 from nfse_emissoes
                                    where cliente_id = f.cliente_id and ambiente = p.ambiente and serie = p.serie), 1));
    update nfse_numeracao set proximo = v_n + 1, atualizado_em = now()
     where cliente_id = f.cliente_id and ambiente = p.ambiente and serie = p.serie;
    -- "DPS" + município (7) + tipo de inscrição (1 = CPF, 2 = CNPJ) + CNPJ (14) + série (5) + nDPS (15) = 45 posições
    v_id := 'DPS' || p.codigo_municipio || '2' || v_cnpj || lpad(p.serie, 5, '0') || lpad(v_n::text, 15, '0');
    insert into nfse_emissoes (org_id, cliente_id, fatura_id, ambiente, serie, ndps, id_dps, situacao, por)
    values (f.org_id, f.cliente_id, f.id, p.ambiente, p.serie, v_n, v_id, 'enviando', p_por)
    returning * into e;
  end if;
  perform app.registrar(f.org_id, 'contratos', 'nfse_enviar', e.id::text, null,
    jsonb_build_object('fatura', f.numero, 'ndps', e.ndps, 'id_dps', e.id_dps, 'ambiente', e.ambiente, 'tentativa', e.tentativas,
                       'reenvio', v_reenvio, 'por', p_por));
  return v || jsonb_build_object('emissao', e.id, 'ndps', e.ndps, 'id_dps', e.id_dps, 'serie', e.serie, 'ambiente', e.ambiente,
                                 'reenvio', v_reenvio, 'tentativa', e.tentativas);
end $$;
revoke all on function app.nfse_reservar(uuid, uuid) from public, anon, authenticated;

/**
 * Grava o retorno do Emissor Nacional (só a Função Edge). p = {situacao: emitida|rejeitada|erro, chave, numero,
 * xml_caminho, dps_caminho, mensagem, mensagens}. Em produção: emitida → fatura com nfse_situacao 'emitida', o número e
 * app.fin_fatura_processar (publica no Portal); rejeitada/erro → nfse_situacao 'erro'. No ambiente de teste a fatura
 * não muda. Tudo vai para o histórico do contrato e para a auditoria.
 */
create or replace function app.nfse_registrar_resultado(p_emissao uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e nfse_emissoes; f fin_faturas; v_sit text := p->>'situacao'; v_chave text := app.fin_digitos(p->>'chave');
  v_num text := nullif(trim(p->>'numero'), ''); v_msg text := nullif(trim(p->>'mensagem'), ''); v_fat text;
  v_teste boolean;
begin
  select * into e from nfse_emissoes where id = p_emissao for update;
  if e.id is null then raise exception 'Emissão não encontrada'; end if;
  if e.situacao <> 'enviando' then raise exception 'Esta emissão já tem resultado (%)', e.situacao; end if;
  if v_sit is null or v_sit not in ('emitida', 'rejeitada', 'erro') then raise exception 'Resultado da emissão inválido'; end if;
  if v_sit = 'emitida' and (v_chave is null or length(v_chave) <> 50) then raise exception 'Nota emitida sem a chave de acesso de 50 números'; end if;
  if v_sit = 'emitida' and nullif(p->>'xml_caminho', '') is null then raise exception 'Nota emitida sem o XML guardado'; end if;
  if v_sit <> 'emitida' and v_msg is null then raise exception 'Informe a mensagem da recusa ou do erro'; end if;
  if p ? 'mensagens' and jsonb_typeof(p->'mensagens') is distinct from 'array' then raise exception 'Mensagens da recusa em formato inválido'; end if;
  v_teste := e.ambiente <> 'producao';

  update nfse_emissoes
     set situacao = v_sit, chave_acesso = case when v_sit = 'emitida' then v_chave end, numero_nfse = case when v_sit = 'emitida' then v_num end,
         xml_caminho = nullif(p->>'xml_caminho', ''), dps_caminho = coalesce(nullif(p->>'dps_caminho', ''), dps_caminho),
         mensagem = v_msg, mensagens = coalesce(p->'mensagens', '[]'::jsonb), respondido_em = now()
   where id = e.id returning * into e;

  select * into f from fin_faturas where id = e.fatura_id for update;
  if not v_teste then
    if v_sit = 'emitida' then
      update fin_faturas set nfse_situacao = 'emitida', nfse_numero = v_num where id = f.id;
      v_fat := app.fin_fatura_processar(f.id);
    else
      update fin_faturas set nfse_situacao = 'erro' where id = f.id and nfse_situacao <> 'emitida';
      v_fat := app.fin_fatura_situacao(f.id);
    end if;
  else
    v_fat := f.situacao;
  end if;

  perform app.registrar(e.org_id, 'contratos', 'nfse_' || v_sit, e.id::text, null,
    jsonb_build_object('fatura', f.numero, 'ndps', e.ndps, 'ambiente', e.ambiente, 'chave', e.chave_acesso, 'numero', e.numero_nfse,
                       'mensagem', e.mensagem, 'tentativa', e.tentativas));
  perform app.fin_recorrente_evento(f.recorrente_id, 'fatura',
    case v_sit
      when 'emitida' then format('%s nº %s emitida para a fatura %s', case when v_teste then 'Nota fiscal de TESTE (sem valor fiscal)' else 'Nota fiscal' end,
                                 coalesce(v_num, '—'), f.numero)
      when 'rejeitada' then format('%s da fatura %s recusada pelo Emissor Nacional: %s', case when v_teste then 'Nota de teste' else 'Nota fiscal' end,
                                   f.numero, v_msg)
      else format('%s da fatura %s sem resposta certa do Emissor Nacional: %s', case when v_teste then 'Nota de teste' else 'Nota fiscal' end,
                  f.numero, v_msg) end,
    jsonb_build_object('fatura', f.id, 'emissao', e.id));
  return jsonb_build_object('emissao', e.id, 'situacao', e.situacao, 'fatura', f.id, 'fatura_situacao', v_fat, 'teste', v_teste);
end $$;
revoke all on function app.nfse_registrar_resultado(uuid, jsonb) from public, anon, authenticated;

-- portas públicas para a Função Edge (o esquema app não é exposto pela API): execute só para service_role
create or replace function public.nfse_reservar(p_fatura uuid, p_por uuid default null)
returns jsonb language sql security definer set search_path = public as $$ select app.nfse_reservar(p_fatura, p_por) $$;
create or replace function public.nfse_registrar_resultado(p_emissao uuid, p jsonb)
returns jsonb language sql security definer set search_path = public as $$ select app.nfse_registrar_resultado(p_emissao, p) $$;
revoke all on function public.nfse_reservar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nfse_registrar_resultado(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.nfse_reservar(uuid, uuid) to service_role;
grant execute on function public.nfse_registrar_resultado(uuid, jsonb) to service_role;
comment on function public.nfse_reservar(uuid, uuid) is 'Só a Função Edge nfse-emitir (service_role): reserva o nDPS da fatura sem repetir (046).';
comment on function public.nfse_registrar_resultado(uuid, jsonb) is 'Só a Função Edge nfse-emitir (service_role): grava o retorno do Emissor Nacional (046).';

-- ===================================================================================================== 5 parâmetros (tela)
/**
 * Salva os parâmetros da emissão (Contratos: gerir). p = {cliente, ambiente, modo, serie, op_simples, reg_ap_trib_sn,
 * reg_esp_trib, inscricao_municipal, codigo_municipio, nbs_padrao, p_tot_trib_sn, proximo_ndps?, confirmo_producao?}.
 * Ir para produção pede confirmo_producao = true (a nota passa a valer). proximo_ndps (opcional) vale para o ambiente e a
 * série escolhidos e nunca fica abaixo de um número já usado. Campo ausente mantém o gravado (ou o padrão, na primeira vez).
 */
create or replace function public.nfse_parametros_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := app.uuid_campo(p->>'cliente', 'empresa'); v_org uuid; a nfse_parametros; n nfse_parametros;
  v_amb text; v_modo text; v_serie text; v_op text; v_reg text; v_esp text; v_im text; v_mun text; v_nbs text; v_ptot numeric;
  v_prox bigint := app.numero_campo(p->>'proximo_ndps', 'próximo número da DPS')::bigint; v_usado bigint;
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'gerir') then
    raise exception 'Sem permissão para mudar a emissão da nota fiscal (módulo Contratos, nível gerir)';
  end if;
  select * into a from nfse_parametros where cliente_id = v_cliente for update;
  v_amb := case when p ? 'ambiente' then nullif(p->>'ambiente', '') else coalesce(a.ambiente, 'producao_restrita') end;
  v_modo := case when p ? 'modo' then nullif(p->>'modo', '') else coalesce(a.modo, 'conferir') end;
  v_serie := case when p ? 'serie' then ltrim(trim(coalesce(p->>'serie', '')), '0') else coalesce(a.serie, '1') end;
  v_op := case when p ? 'op_simples' then nullif(p->>'op_simples', '') else coalesce(a.op_simples, '3') end;
  v_reg := case when p ? 'reg_ap_trib_sn' then nullif(p->>'reg_ap_trib_sn', '') else coalesce(a.reg_ap_trib_sn, '1') end;
  v_esp := case when p ? 'reg_esp_trib' then nullif(p->>'reg_esp_trib', '') else coalesce(a.reg_esp_trib, '0') end;
  v_im := case when p ? 'inscricao_municipal' then nullif(trim(p->>'inscricao_municipal'), '') else a.inscricao_municipal end;
  v_mun := case when p ? 'codigo_municipio' then app.fin_digitos(p->>'codigo_municipio') else coalesce(a.codigo_municipio, '3507605') end;
  v_nbs := case when p ? 'nbs_padrao' then app.fin_digitos(p->>'nbs_padrao') else a.nbs_padrao end;
  v_ptot := case when p ? 'p_tot_trib_sn' then app.numero_campo(p->>'p_tot_trib_sn', 'percentual dos tributos') else a.p_tot_trib_sn end;
  if v_amb is null or v_amb not in ('producao_restrita', 'producao') then raise exception 'Ambiente: teste (produção restrita) ou produção'; end if;
  if v_amb = 'producao' and a.ambiente is distinct from 'producao' and coalesce((p->>'confirmo_producao')::boolean, false) is not true then
    raise exception 'Para emitir notas de verdade (produção), confirme que os testes no ambiente de teste deram certo';
  end if;
  if v_modo is null or v_modo not in ('conferir', 'automatico') then raise exception 'Modo: conferir antes de emitir ou automático'; end if;
  if v_serie is null or v_serie !~ '^[1-9][0-9]{0,4}$' or v_serie::int > 49999 then
    raise exception 'Série da DPS: de 1 a 49999 (faixa de sistema próprio do Emissor Nacional)';
  end if;
  if v_op is distinct from '3' then raise exception 'Por enquanto o HUB emite nota só para empresa ME/EPP do Simples Nacional (opção 3)'; end if;
  v_reg := coalesce(v_reg, '1');
  if v_reg not in ('1', '2', '3') then raise exception 'Regime de apuração do Simples: 1, 2 ou 3'; end if;
  v_esp := coalesce(v_esp, '0');
  if v_esp not in ('0', '1', '2', '3', '4', '5', '6') then raise exception 'Regime especial de tributação inválido'; end if;
  if v_reg = '1' and v_esp <> '0' then raise exception 'Com o ISS apurado pelo Simples, o regime especial precisa ser "Nenhum"'; end if;
  if v_im is not null and v_im !~ '^[0-9A-Za-z./-]{1,15}$' then raise exception 'Inscrição municipal: até 15 letras ou números'; end if;
  if v_mun is null or length(v_mun) <> 7 then raise exception 'Código do município: os 7 números do IBGE (Bragança Paulista = 3507605)'; end if;
  if v_nbs is not null and length(v_nbs) <> 9 then raise exception 'Código NBS: 9 números (ex.: 1.1302.10.00 → 113021000)'; end if;
  if v_ptot is not null and (v_ptot < 0 or v_ptot >= 100) then raise exception 'Percentual dos tributos do Simples: de 0 a 99,99'; end if;

  insert into nfse_parametros as t (cliente_id, org_id, ambiente, modo, serie, op_simples, reg_ap_trib_sn, reg_esp_trib, inscricao_municipal,
                                    codigo_municipio, nbs_padrao, p_tot_trib_sn, atualizado_em, atualizado_por)
  values (v_cliente, v_org, v_amb, v_modo, v_serie, v_op, v_reg, v_esp, v_im, v_mun, v_nbs, round(v_ptot, 2), now(), auth.uid())
  on conflict (cliente_id) do update
     set ambiente = excluded.ambiente, modo = excluded.modo, serie = excluded.serie, op_simples = excluded.op_simples,
         reg_ap_trib_sn = excluded.reg_ap_trib_sn, reg_esp_trib = excluded.reg_esp_trib, inscricao_municipal = excluded.inscricao_municipal,
         codigo_municipio = excluded.codigo_municipio, nbs_padrao = excluded.nbs_padrao, p_tot_trib_sn = excluded.p_tot_trib_sn,
         atualizado_em = now(), atualizado_por = auth.uid()
  returning * into n;

  if v_prox is not null then
    select max(ndps) into v_usado from nfse_emissoes where cliente_id = v_cliente and ambiente = v_amb and serie = v_serie;
    if v_prox < 1 or v_prox > 999999999999999 then raise exception 'Próximo número da DPS: de 1 a 999999999999999'; end if;
    if v_usado is not null and v_prox <= v_usado then
      raise exception 'O próximo número da DPS precisa ser maior que %, o último já usado nesta série', v_usado;
    end if;
    insert into nfse_numeracao (cliente_id, org_id, ambiente, serie, proximo) values (v_cliente, v_org, v_amb, v_serie, v_prox)
    on conflict (cliente_id, ambiente, serie) do update set proximo = excluded.proximo, atualizado_em = now();
  end if;
  perform app.registrar(v_org, 'contratos', 'nfse_parametros', v_cliente::text, to_jsonb(a),
    to_jsonb(n) || jsonb_build_object('proximo_ndps', v_prox));
  return to_jsonb(n) || jsonb_build_object('proximo_ndps',
    (select proximo from nfse_numeracao where cliente_id = v_cliente and ambiente = n.ambiente and serie = n.serie));
end $$;
comment on function public.nfse_parametros_salvar(jsonb) is
  'Parâmetros da emissão da NFS-e (Contratos: gerir); produção pede confirmação; próximo nDPS nunca abaixo de um já usado (046).';

do $$
declare f text;
begin
  foreach f in array array['public.nfse_preparar(uuid)', 'public.nfse_parametros_salvar(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ===================================================================================================== 6 bucket fiscal
/** Acesso ao bucket fiscal: como na 036, e quem vê Contratos lê o XML das notas emitidas (<org>/<cliente>/nfse-emitidas/…). */
create or replace function app.fis_caminho_pode(p_nome text, p_nivel text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clientes c
     where c.id = app.uuid_ou_nulo((storage.foldername(p_nome))[2])
       and c.org_id::text = (storage.foldername(p_nome))[1]
       and (case when p_nivel = 'ver' then app.fin_pode(c.id, 'ver')
                 else app.gestao_pode(c.id, p_nivel, array['entradas', 'financeiro']) end
            or (p_nivel = 'ver' and (storage.foldername(p_nome))[3] = 'nfse-emitidas' and app.contratos_pode(c.id, 'ver'))))
$$;
comment on function app.fis_caminho_pode(text, text) is
  'Bucket fiscal: ver = Financeiro/gestão da empresa do caminho, ou Contratos (ver) na pasta nfse-emitidas; gravar = Entradas/Financeiro (046).';
