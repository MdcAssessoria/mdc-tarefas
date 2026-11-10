-- =====================================================================================================
--  065 · Notas fiscais de saída: a nota de cada fatura vira um registro próprio, ajustável antes de emitir
--
--  Pedido do Edvaldo (10/11/2026): "quando o contrato é gerado e a emissão da NF é pedida, o sistema precisa carregar a
--  NF para o módulo de NF Saídas e todos os ajustes a mais que forem precisos para a emissão podem ser feitos nele".
--
--   1  nfse_notas: uma nota de saída por fatura que emite NFS-e (documento = 'nfse'). Nasce sozinha com a fatura
--      (gatilho) e as faturas que já existem ganham a sua agora. Guarda só o que a pessoa AJUSTOU para esta nota:
--      código do serviço, NBS, texto (discriminação) e tributos aproximados (%). Campo vazio = segue o contrato, a regra
--      fiscal do serviço e os parâmetros da empresa. O valor é sempre o da fatura (não muda na nota).
--   2  app.nfse_dados (046/057) passa a usar os ajustes da nota; a Função nfse-emitir não muda (lê a DPS pronta do banco).
--      Devolve também 'nota' com os ajustes e o padrão de cada campo, para a tela mostrar "voltar ao padrão".
--   3  nfse_nota_salvar(p): Contratos operar; não muda nota já emitida (produção) nem com envio em aberto (enviando ou
--      sem resposta certa: a mesma DPS pode ser reenviada); valida código (6 números), NBS (9) e % (0 a 100).
--   4  nfse_saidas(p_cliente, p_de, p_ate): lista das notas de saída por competência, com a situação em palavras
--      simples (para emitir, com pendência, enviando, sem resposta certa, recusada, de teste, emitida, cancelada).
--  Leitura com Contratos (ver), como as emissões. Nada se apaga.
--  Testes: supabase/testes/134_notas_saida_065.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 notas
create table if not exists public.nfse_notas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fatura_id uuid not null unique references public.fin_faturas(id) on delete restrict,
  servico_codigo text check (servico_codigo is null or servico_codigo ~ '^\d{6}$'),
  nbs text check (nbs is null or nbs ~ '^\d{9}$'),
  descricao text check (descricao is null or length(descricao) between 1 and 2000),
  p_tot_trib_sn numeric(5, 2) check (p_tot_trib_sn is null or (p_tot_trib_sn >= 0 and p_tot_trib_sn <= 100)),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  atualizado_por uuid
);
create index if not exists nfse_notas_cliente on public.nfse_notas (cliente_id);
comment on table public.nfse_notas is
  'Nota fiscal de saída (065): uma por fatura que emite NFS-e. Guarda só os ajustes desta nota (null = segue contrato, regra fiscal e parâmetros). Grava só nfse_nota_salvar; nada se apaga.';

alter table public.nfse_notas enable row level security;
drop policy if exists contratos_ver on public.nfse_notas;
create policy contratos_ver on public.nfse_notas for select to authenticated using ((select app.contratos_pode(cliente_id, 'ver')));
revoke all on public.nfse_notas from anon;
revoke insert, update, delete, truncate on public.nfse_notas from authenticated;
grant select on public.nfse_notas to authenticated;
drop trigger if exists gestao_so_empresa on public.nfse_notas;
create trigger gestao_so_empresa before insert or update of cliente_id on public.nfse_notas
  for each row execute function app.tg_gestao_so_empresa();
drop trigger if exists cliente_mesma_org on public.nfse_notas;
create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.nfse_notas
  for each row execute function app.tg_cliente_mesma_org();
drop trigger if exists nada_se_apaga on public.nfse_notas;
create trigger nada_se_apaga before delete on public.nfse_notas
  for each row execute function app.tg_nada_se_apaga('a nota de saída fica no histórico da fatura');

-- a fatura que emite NFS-e já nasce com a sua nota de saída
create or replace function app.tg_fin_fatura_nota_saida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.documento = 'nfse' then
    insert into nfse_notas (org_id, cliente_id, fatura_id) values (new.org_id, new.cliente_id, new.id)
    on conflict (fatura_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_fatura_nota_saida() from public, anon, authenticated;
drop trigger if exists nota_saida on public.fin_faturas;
create trigger nota_saida after insert or update of documento on public.fin_faturas
  for each row execute function app.tg_fin_fatura_nota_saida();

-- faturas que já existem
insert into public.nfse_notas (org_id, cliente_id, fatura_id)
select f.org_id, f.cliente_id, f.id from public.fin_faturas f where f.documento = 'nfse'
on conflict (fatura_id) do nothing;

-- ===================================================================================================== 2 dados da DPS
create or replace function app.nfse_dados(p_fatura uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f fin_faturas; c jsonb; p nfse_parametros; pe fin_pessoas; v_cert record; v_pend text[] := '{}'; v_cnpj text; v_ctrib text;
  v_doc text; v_email text; v_prox bigint; v_emissoes jsonb; v_desc text; v_hoje date; r fis_regras_servico; v_nbs text;
  v_retido boolean := false; v_mun text; v_nota nfse_notas; r2 fis_regras_servico; v_desc_padrao text; v_ptot numeric;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  select to_jsonb(x) into c from clientes x where x.id = f.cliente_id;
  select * into p from nfse_parametros where cliente_id = f.cliente_id;
  select * into pe from fin_pessoas where id = f.pessoa_id;
  select * into v_nota from nfse_notas where fatura_id = f.id;
  select valido_ate, cnpj into v_cert from fis_certificados where cliente_id = f.cliente_id;
  v_cnpj := app.fin_digitos(c->>'cnpj');
  v_ctrib := app.fin_digitos(coalesce(v_nota.servico_codigo, f.servico_codigo));
  v_doc := app.fin_digitos(pe.documento);
  v_email := case when pe.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(trim(pe.email)) <= 80 then lower(trim(pe.email)) end;
  v_hoje := app.hoje(f.org_id);
  select * into r from fis_regras_servico where cliente_id = f.cliente_id and servico_codigo = v_ctrib and ativo;
  select * into r2 from fis_regras_servico where cliente_id = f.cliente_id and servico_codigo = app.fin_digitos(f.servico_codigo) and ativo;
  v_nbs := coalesce(v_nota.nbs, r.nbs, p.nbs_padrao);
  v_ptot := coalesce(v_nota.p_tot_trib_sn, p.p_tot_trib_sn);
  v_mun := app.fis_chave_municipio(pe.cidade, pe.uf);
  v_retido := r.id is not null and (r.iss_retencao = 'sempre' or (r.iss_retencao = 'municipios' and v_mun = any (r.iss_retencao_municipios)));

  if f.documento <> 'nfse' then v_pend := v_pend || 'Esta fatura é só nota fatura: o contrato não emite nota fiscal'::text; end if;
  if f.situacao = 'cancelada' then v_pend := v_pend || 'Fatura cancelada não emite nota fiscal'::text; end if;
  if f.nfse_situacao = 'emitida' then
    v_pend := v_pend || format('A nota fiscal desta fatura já foi emitida (nº %s)', coalesce(f.nfse_numero, '—'));
  end if;
  if p.cliente_id is null then
    v_pend := v_pend || 'Configure a emissão em Contratos › Regras fiscais (NFS-e) — quem gere o módulo Contratos'::text;
  else
    if p.op_simples <> '3' then v_pend := v_pend || 'Por enquanto o HUB emite nota só para empresa ME/EPP do Simples Nacional'::text; end if;
    if v_ptot is null then
      v_pend := v_pend || 'Informe em Regras fiscais o percentual aproximado dos tributos do Simples (vai na nota, Lei 12.741/2012)'::text;
    end if;
    if v_nbs is null then
      v_pend := v_pend || 'Informe o código NBS na regra fiscal deste serviço ou o NBS padrão em Contratos › Regras fiscais'::text;
    end if;
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
    v_pend := v_pend || 'O código do serviço precisa ter 6 números (código de tributação nacional, ex.: 17.19.01): ajuste na nota de saída'::text;
  end if;
  if v_doc is null or length(v_doc) not in (11, 14) then
    v_pend := v_pend || format('Cadastre o CNPJ ou CPF do cliente "%s" em Cadastros › Fornecedores e clientes', coalesce(pe.nome, '—'));
  end if;
  if r.iss_retencao = 'municipios' and v_mun is null then
    v_pend := v_pend || format('A regra fiscal "%s" retém o ISS em alguns municípios: cadastre a cidade e a UF do cliente "%s" em Fornecedores e clientes',
                               r.nome, coalesce(pe.nome, '—'));
  end if;
  if v_retido then
    v_pend := v_pend || format('Pela regra fiscal "%s", o ISS desta nota é retido pelo cliente%s. O HUB ainda não emite nota com ISS retido: emita esta pelo Emissor Nacional',
                               r.nome, case when r.iss_retencao = 'municipios' then ' (' || coalesce(pe.cidade, '') || '/' || coalesce(pe.uf, '') || ')' else '' end);
  end if;

  v_prox := coalesce((select n.proximo from nfse_numeracao n where n.cliente_id = f.cliente_id and n.ambiente = p.ambiente and n.serie = p.serie), 1);
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'ambiente', e.ambiente, 'situacao', e.situacao, 'ndps', e.ndps,
           'numero_nfse', e.numero_nfse, 'chave_acesso', e.chave_acesso, 'mensagem', e.mensagem, 'mensagens', e.mensagens,
           'tentativas', e.tentativas, 'enviado_em', e.enviado_em, 'respondido_em', e.respondido_em, 'xml_caminho', e.xml_caminho)
           order by e.criado_em desc), '[]')
    into v_emissoes from (select * from nfse_emissoes where fatura_id = f.id order by criado_em desc limit 10) e;
  v_desc_padrao := f.descricao || ' · Fatura ' || f.numero || ' · Vencimento ' || to_char(f.vencimento, 'DD/MM/YYYY');
  v_desc := coalesce(nullif(trim(v_nota.descricao), ''), v_desc_padrao);

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
      'dCompet', f.competencia, 'cLocEmi', p.codigo_municipio,
      'prestador', jsonb_build_object('cnpj', v_cnpj, 'nome', coalesce(c->>'razao_social', c->>'nome'), 'im', p.inscricao_municipal,
                                      'opSimpNac', p.op_simples, 'regApTribSN', p.reg_ap_trib_sn, 'regEspTrib', p.reg_esp_trib),
      'tomador', jsonb_build_object('documento', v_doc, 'nome', pe.nome, 'email', v_email),
      'servico', jsonb_build_object('cLocPrestacao', p.codigo_municipio, 'cTribNac', v_ctrib, 'descricao', v_desc, 'cNBS', v_nbs),
      'valores', jsonb_build_object('vServ', f.valor, 'pTotTribSN', v_ptot, 'tribISSQN', '1', 'tpRetISSQN', '1')),
    'iss', jsonb_build_object('aliquota_referencia', coalesce(f.iss_aliquota, r.iss_aliquota),
                              'valor_estimado', case when coalesce(f.iss_aliquota, r.iss_aliquota) is not null
                                                     then round(f.valor * coalesce(f.iss_aliquota, r.iss_aliquota) / 100, 2) end,
                              'retido', v_retido),
    'regra', case when r.id is null then null else jsonb_build_object('id', r.id, 'nome', r.nome, 'nbs', r.nbs,
                  'iss_aliquota', r.iss_aliquota, 'iss_retencao', r.iss_retencao) end,
    'emissoes', v_emissoes,
    -- nota de saída (065): o que foi ajustado nela (null = segue o contrato e as regras) e o padrão de cada campo
    'nota', jsonb_build_object('id', v_nota.id, 'servico_codigo', v_nota.servico_codigo, 'nbs', v_nota.nbs, 'descricao', v_nota.descricao,
                               'p_tot_trib_sn', v_nota.p_tot_trib_sn, 'atualizado_em', v_nota.atualizado_em,
                               'padrao', jsonb_build_object('servico_codigo', app.fin_digitos(f.servico_codigo),
                                                            'nbs', coalesce(r2.nbs, p.nbs_padrao), 'descricao', v_desc_padrao,
                                                            'p_tot_trib_sn', p.p_tot_trib_sn)));
end $$;
revoke all on function app.nfse_dados(uuid) from public, anon, authenticated;

-- ===================================================================================================== 3 salvar ajustes
create or replace function public.nfse_nota_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n public.nfse_notas; f public.fin_faturas; v_antes jsonb; v_cod text; v_nbs text; v_desc text; v_ptot numeric;
begin
  select * into n from public.nfse_notas where id = nullif(p->>'id', '')::uuid;
  if n.id is null then raise exception 'Nota de saída não encontrada'; end if;
  if not app.contratos_pode(n.cliente_id, 'operar') then
    raise exception 'Sem permissão para ajustar a nota (é preciso operar o módulo Contratos)';
  end if;
  select * into f from public.fin_faturas where id = n.fatura_id for update;
  if f.situacao = 'cancelada' then raise exception 'A fatura desta nota foi cancelada: a nota não pode mais ser ajustada'; end if;
  if f.nfse_situacao = 'emitida' then
    raise exception 'A nota fiscal desta fatura já foi emitida (nº %): não dá para mudar uma nota emitida', coalesce(f.nfse_numero, '—');
  end if;
  if exists (select 1 from public.nfse_emissoes e where e.fatura_id = f.id and e.situacao in ('enviando', 'erro')) then
    raise exception 'A nota está sendo enviada ou ficou sem resposta certa do Emissor: tente emitir de novo antes de mudar os dados';
  end if;

  v_cod := nullif(regexp_replace(coalesce(p->>'servico_codigo', ''), '\D', '', 'g'), '');
  if v_cod is not null and length(v_cod) <> 6 then
    raise exception 'Código do serviço: 6 números (item, subitem da LC 116 e desdobramento; ex.: 17.19.01)';
  end if;
  v_nbs := nullif(regexp_replace(coalesce(p->>'nbs', ''), '\D', '', 'g'), '');
  if v_nbs is not null and length(v_nbs) <> 9 then raise exception 'Código NBS: 9 números (ex.: 1.1302.21.00)'; end if;
  v_desc := nullif(trim(coalesce(p->>'descricao', '')), '');
  if v_desc is not null and length(v_desc) > 2000 then raise exception 'O texto da nota passa de 2000 letras: resuma'; end if;
  v_ptot := nullif(replace(trim(coalesce(p->>'p_tot_trib_sn', '')), ',', '.'), '')::numeric;
  if v_ptot is not null and (v_ptot < 0 or v_ptot > 100) then raise exception 'Tributos aproximados: um percentual de 0 a 100'; end if;

  v_antes := to_jsonb(n);
  update public.nfse_notas
     set servico_codigo = v_cod, nbs = v_nbs, descricao = v_desc, p_tot_trib_sn = round(v_ptot, 2),
         atualizado_em = now(), atualizado_por = auth.uid()
   where id = n.id
  returning * into n;
  perform app.registrar(n.org_id, 'contratos', 'nota_saida_ajustar', n.id::text, v_antes, to_jsonb(n));
  return to_jsonb(n);
end $$;
revoke all on function public.nfse_nota_salvar(jsonb) from public, anon;
grant execute on function public.nfse_nota_salvar(jsonb) to authenticated;
comment on function public.nfse_nota_salvar(jsonb) is
  'Ajusta a nota de saída antes de emitir: código do serviço, NBS, texto e tributos aproximados; vazio volta ao padrão (Contratos: operar) (065).';

-- ===================================================================================================== 4 lista
create or replace function public.nfse_saidas(p_cliente uuid, p_de date default null, p_ate date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not app.contratos_pode(p_cliente, 'ver') then raise exception 'Sem permissão para ver as notas de saída (módulo Contratos)'; end if;
  with u as (
    select distinct on (e.fatura_id) e.*
      from public.nfse_emissoes e where e.cliente_id = p_cliente
     order by e.fatura_id, e.criado_em desc
  ), emitida as (
    select e.* from public.nfse_emissoes e where e.cliente_id = p_cliente and e.situacao = 'emitida' and e.ambiente = 'producao'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'fatura', f.id, 'fatura_numero', f.numero, 'competencia', f.competencia, 'vencimento', f.vencimento,
           'emissao_fatura', f.emissao, 'valor', f.valor, 'descricao', coalesce(n.descricao, f.descricao),
           'servico_codigo', coalesce(n.servico_codigo, app.fin_digitos(f.servico_codigo)),
           'tomador', pe.nome, 'tomador_documento', pe.documento,
           'ajustada', (n.servico_codigo is not null or n.nbs is not null or n.descricao is not null or n.p_tot_trib_sn is not null),
           'situacao', case
                         when f.situacao = 'cancelada' then 'cancelada'
                         when f.nfse_situacao = 'emitida' then 'emitida'
                         when u.situacao = 'enviando' then 'enviando'
                         when u.situacao = 'erro' then 'incerta'
                         when u.situacao = 'rejeitada' then 'recusada'
                         when u.situacao = 'emitida' and u.ambiente = 'producao_restrita' then 'teste'
                         else 'para_emitir' end,
           'numero_nfse', coalesce(em.numero_nfse, f.nfse_numero, case when u.ambiente = 'producao_restrita' then u.numero_nfse end),
           'chave_acesso', coalesce(em.chave_acesso, case when u.situacao = 'emitida' then u.chave_acesso end),
           'xml_caminho', coalesce(em.xml_caminho, case when u.situacao = 'emitida' then u.xml_caminho end),
           'emitida_em', coalesce(em.respondido_em, case when u.situacao = 'emitida' then u.respondido_em end),
           'ambiente', coalesce(em.ambiente, u.ambiente), 'mensagem', u.mensagem, 'tentativas', u.tentativas)
         order by f.competencia desc, f.numero desc), '[]'::jsonb)
    into v
    from public.nfse_notas n
    join public.fin_faturas f on f.id = n.fatura_id
    left join public.fin_pessoas pe on pe.id = f.pessoa_id
    left join u on u.fatura_id = f.id
    left join emitida em on em.fatura_id = f.id
   where n.cliente_id = p_cliente
     and (p_de is null or f.competencia >= p_de)
     and (p_ate is null or f.competencia <= p_ate);
  return v;
end $$;
revoke all on function public.nfse_saidas(uuid, date, date) from public, anon;
grant execute on function public.nfse_saidas(uuid, date, date) to authenticated;
comment on function public.nfse_saidas(uuid, date, date) is
  'Notas fiscais de saída por competência, com a situação em palavras simples (Contratos: ver) (065).';
