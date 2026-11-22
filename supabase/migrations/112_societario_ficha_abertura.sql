-- =====================================================================================================
--  112 · Societário: ficha de abertura de empresa (pedido do Edvaldo, 22/11/2026)
--
--  O processo de abertura ganha uma ficha completa, preenchida aos poucos dentro do processo:
--    regime em que a empresa nasce (Simples, Presumido, Real), natureza jurídica, porte, razão social e fantasia,
--    CNAE principal e secundários, objeto social, capital (quotas e integralização), endereço com IBGE do município,
--    imóvel (IPTU, área, situação), contato, contador responsável, quadro societário (sócios, percentuais,
--    administradores, dados pessoais) e anexos com tipo (RG/CNH, comprovante, IPTU, locação…).
--
--  Regras que ficam no banco (combinação inválida não grava, em qualquer ordem de preenchimento):
--    • Simples Nacional: CNAE do Anexo VI da Resolução CGSN 140/2018 impede (principal ou secundário — LC 123/2006,
--      art. 17 e Res. CGSN 140/2018, art. 8º); porte precisa ser ME ou EPP (LC 123, art. 3º); sócio pessoa jurídica
--      (art. 3º, § 4º, I) ou domiciliado no exterior (art. 17, II) impede. CNAE do Anexo VII (atividade ambígua)
--      NÃO bloqueia: a tela avisa e o contador decide (art. 8º, § 2º).
--    • Lucro Presumido: atividade obrigada ao Lucro Real pela Lei 9.718/1998, art. 14, II, VI e VII (bancos,
--      financeiras, corretoras e distribuidoras, arrendamento, cooperativas de crédito, seguros, capitalização,
--      previdência aberta, factoring, securitização) impede. Receita acima de R$ 78 mi (art. 14, I) é aviso da tela.
--  Premissa a validar pelo contador: as listas dos Anexos VI e VII estão na redação da CGSN 143/2018, 150/2019 e
--  156/2020 (texto compilado da Res. 140/2018); alteração posterior entra por migração nova (tabela cnae_restricoes).
--
--  Gravação só por função (societario › operar): soc_abertura_salvar, soc_abertura_socio_salvar,
--  soc_abertura_socio_excluir, soc_abertura_documento_tipar. Ao concluir a abertura, o cliente nasce com a razão
--  social, fantasia, CNPJ, cidade, UF e regime da ficha.
-- =====================================================================================================

-- ---------------------------------------------------------------- restrições de CNAE por regime
create table if not exists public.cnae_restricoes (
  codigo      text not null check (codigo ~ '^\d{7}$'),           -- só dígitos (ex.: 6201501)
  regime      text not null check (regime in ('simples', 'presumido')),
  nivel       text not null check (nivel in ('impeditivo', 'ambiguo')),
  descricao   text not null,
  fundamento  text not null,
  primary key (codigo, regime)
);
comment on table public.cnae_restricoes is
  'CNAE que impede (impeditivo) ou exige análise (ambiguo) no Simples (Res. CGSN 140/2018, Anexos VI e VII) e no Presumido (Lei 9.718/1998, art. 14). Só migração grava (112).';
alter table public.cnae_restricoes enable row level security;
drop policy if exists cnae_restricoes_select on public.cnae_restricoes;
create policy cnae_restricoes_select on public.cnae_restricoes for select to authenticated using (true);
revoke insert, update, delete on public.cnae_restricoes from authenticated, anon;
grant select on public.cnae_restricoes to authenticated;

insert into public.cnae_restricoes (codigo, regime, nivel, descricao, fundamento)
select replace(replace(c, '-', ''), '/', ''), 'simples', 'impeditivo', d, 'Res. CGSN 140/2018, Anexo VI (LC 123/2006, art. 17)'
from (values
  ('1220-4/01','Fabricação de cigarros'),('1220-4/02','Fabricação de cigarrilhas e charutos'),
  ('1220-4/03','Fabricação de filtros para cigarros'),('2092-4/01','Fabricação de pólvoras, explosivos e detonantes'),
  ('2550-1/01','Fabricação de equipamento bélico pesado, exceto veículos militares de combate'),
  ('2550-1/02','Fabricação de armas de fogo, outras armas e munições'),
  ('2910-7/01','Fabricação de automóveis, camionetas e utilitários'),('3091-1/01','Fabricação de motocicletas'),
  ('3511-5/01','Geração de energia elétrica'),
  ('3511-5/02','Atividades de coordenação e controle da operação da geração e transmissão de energia elétrica'),
  ('3512-3/00','Transmissão de energia elétrica'),('3513-1/00','Comércio atacadista de energia elétrica'),
  ('3514-0/00','Distribuição de energia elétrica'),('4110-7/00','Incorporação de empreendimentos imobiliários'),
  ('4636-2/02','Comércio atacadista de cigarros, cigarrilhas e charutos'),
  ('4912-4/01','Transporte ferroviário de passageiros intermunicipal e interestadual'),
  ('4922-1/01','Transporte rodoviário coletivo de passageiros, com itinerário fixo, intermunicipal, exceto em região metropolitana'),
  ('4922-1/02','Transporte rodoviário coletivo de passageiros, com itinerário fixo, interestadual'),
  ('5310-5/01','Atividades do Correio Nacional'),('6410-7/00','Banco Central'),('6421-2/00','Bancos comerciais'),
  ('6422-1/00','Bancos múltiplos, com carteira comercial'),('6423-9/00','Caixas econômicas'),
  ('6424-7/01','Bancos cooperativos'),('6424-7/02','Cooperativas centrais de crédito'),
  ('6424-7/03','Cooperativas de crédito mútuo'),('6424-7/04','Cooperativas de crédito rural'),
  ('6431-0/00','Bancos múltiplos, sem carteira comercial'),('6432-8/00','Bancos de investimento'),
  ('6433-6/00','Bancos de desenvolvimento'),('6434-4/00','Agências de fomento'),
  ('6435-2/01','Sociedades de crédito imobiliário'),('6435-2/02','Associações de poupança e empréstimo'),
  ('6435-2/03','Companhias hipotecárias'),('6436-1/00','Sociedades de crédito, financiamento e investimento - financeiras'),
  ('6437-9/00','Sociedades de crédito ao microempreendedor'),('6438-7/01','Bancos de câmbio'),
  ('6438-7/99','Outras instituições de intermediação não monetária não especificadas anteriormente'),
  ('6440-9/00','Arrendamento mercantil'),('6450-6/00','Sociedades de capitalização'),
  ('6461-1/00','Holdings de instituições financeiras'),('6462-0/00','Holdings de instituições não financeiras'),
  ('6463-8/00','Outras sociedades de participação, exceto holdings'),
  ('6470-1/01','Fundos de investimento, exceto previdenciários e imobiliários'),
  ('6470-1/02','Fundos de investimento previdenciários'),('6470-1/03','Fundos de investimento imobiliários'),
  ('6491-3/00','Sociedades de fomento mercantil - factoring'),('6492-1/00','Securitização de créditos'),
  ('6499-9/01','Clubes de investimento'),('6499-9/02','Sociedades de investimento'),
  ('6499-9/03','Fundo garantidor de crédito'),('6499-9/04','Caixas de financiamento de corporações'),
  ('6499-9/05','Concessão de crédito pelas OSCIP'),
  ('6499-9/99','Outras atividades de serviços financeiros não especificadas anteriormente'),
  ('6511-1/01','Sociedade seguradora de seguros vida'),('6511-1/02','Planos de auxílio-funeral'),
  ('6512-0/00','Sociedade seguradora de seguros não vida'),('6520-1/00','Sociedade seguradora de seguros saúde'),
  ('6530-8/00','Resseguros'),('6541-3/00','Previdência complementar fechada'),('6542-1/00','Previdência complementar aberta'),
  ('6611-8/01','Bolsa de valores'),('6611-8/02','Bolsa de mercadorias'),('6611-8/03','Bolsa de mercadorias e futuros'),
  ('6611-8/04','Administração de mercados de balcão organizados'),
  ('6612-6/01','Corretoras de títulos e valores mobiliários'),('6612-6/02','Distribuidoras de títulos e valores mobiliários'),
  ('6612-6/03','Corretoras de câmbio'),('6612-6/04','Corretoras de contratos de mercadorias'),
  ('6612-6/05','Agentes de investimentos em aplicações financeiras'),('6619-3/01','Serviços de liquidação e custódia'),
  ('6619-3/03','Representações de bancos estrangeiros'),('6619-3/04','Caixas eletrônicos'),
  ('6810-2/02','Aluguel de imóveis próprios'),('6810-2/03','Loteamento de imóveis próprios'),
  ('6911-7/02','Atividades auxiliares da justiça'),('6912-5/00','Cartórios'),
  ('7820-5/00','Locação de mão de obra temporária'),('7830-2/00','Fornecimento e gestão de recursos humanos para terceiros'),
  ('8112-5/00','Condomínios prediais'),('8299-7/04','Leiloeiros independentes'),('8411-6/00','Administração pública em geral'),
  ('8412-4/00','Regulação das atividades de saúde, educação, serviços culturais e outros serviços sociais'),
  ('8413-2/00','Regulação das atividades econômicas'),('8421-3/00','Relações exteriores'),('8422-1/00','Defesa'),
  ('8423-0/00','Justiça'),('8424-8/00','Segurança e ordem pública'),('8425-6/00','Defesa civil'),
  ('8430-2/00','Seguridade social obrigatória'),('8550-3/01','Administração de caixas escolares'),
  ('9411-1/00','Atividades de organizações associativas patronais e empresariais'),
  ('9412-0/01','Atividades de fiscalização profissional'),('9412-0/99','Outras atividades associativas profissionais'),
  ('9420-1/00','Atividades de organizações sindicais'),('9430-8/00','Atividades de associações de defesa de direitos sociais'),
  ('9491-0/00','Atividades de organizações religiosas ou filosóficas'),('9492-8/00','Atividades de organizações políticas'),
  ('9493-6/00','Atividades de organizações associativas ligadas à cultura e à arte'),
  ('9499-5/00','Atividades associativas não especificadas anteriormente'),
  ('9900-8/00','Organismos internacionais e outras instituições extraterritoriais')
) as v(c, d)
on conflict (codigo, regime) do update set nivel = excluded.nivel, descricao = excluded.descricao, fundamento = excluded.fundamento;

insert into public.cnae_restricoes (codigo, regime, nivel, descricao, fundamento)
select replace(replace(c, '-', ''), '/', ''), 'simples', 'ambiguo', d, 'Res. CGSN 140/2018, Anexo VII (art. 8º, § 2º)'
from (values
  ('1113-5/02','Fabricação de cervejas e chopes'),('4635-4/02','Comércio atacadista de cerveja, chope e refrigerante'),
  ('4635-4/03','Comércio atacadista de bebidas com atividade de fracionamento e acondicionamento associada'),
  ('4635-4/99','Comércio atacadista de bebidas não especificadas anteriormente'),
  ('4684-2/99','Comércio atacadista de outros produtos químicos e petroquímicos não especificados anteriormente'),
  ('4924-8/00','Transporte escolar'),
  ('4929-9/02','Transporte rodoviário coletivo de passageiros, sob regime de fretamento, intermunicipal, interestadual e internacional'),
  ('4929-9/04','Organização de excursões em veículos rodoviários próprios, intermunicipal, interestadual e internacional'),
  ('4929-9/99','Outros transportes rodoviários de passageiros não especificados anteriormente'),
  ('4950-7/00','Trens turísticos, teleféricos e similares'),('5011-4/02','Transporte marítimo de cabotagem - passageiros'),
  ('5091-2/02','Transporte por navegação de travessia, intermunicipal, interestadual e internacional'),
  ('5099-8/01','Transporte aquaviário para passeios turísticos'),
  ('5099-8/99','Outros transportes aquaviários não especificados anteriormente'),
  ('5111-1/00','Transporte aéreo de passageiros regular'),
  ('5112-9/01','Serviço de táxi aéreo e locação de aeronaves com tripulação'),
  ('5112-9/99','Outros serviços de transporte aéreo de passageiros não regular'),
  ('5229-0/01','Serviços de apoio ao transporte por táxi, inclusive centrais de chamada'),
  ('5229-0/99','Outras atividades auxiliares dos transportes terrestres não especificadas anteriormente'),
  ('6619-3/02','Correspondentes de instituições financeiras'),
  ('6619-3/99','Outras atividades auxiliares dos serviços financeiros não especificadas anteriormente'),
  ('8299-7/99','Outras atividades de serviços prestados principalmente às empresas não especificadas anteriormente')
) as v(c, d)
on conflict (codigo, regime) do update set nivel = excluded.nivel, descricao = excluded.descricao, fundamento = excluded.fundamento;

insert into public.cnae_restricoes (codigo, regime, nivel, descricao, fundamento)
select replace(replace(c, '-', ''), '/', ''), 'presumido', 'impeditivo', d, f
from (values
  ('6421-2/00','Bancos comerciais','Lei 9.718/1998, art. 14, II'),
  ('6422-1/00','Bancos múltiplos, com carteira comercial','Lei 9.718/1998, art. 14, II'),
  ('6423-9/00','Caixas econômicas','Lei 9.718/1998, art. 14, II'),
  ('6424-7/01','Bancos cooperativos','Lei 9.718/1998, art. 14, II'),
  ('6424-7/02','Cooperativas centrais de crédito','Lei 9.718/1998, art. 14, II'),
  ('6424-7/03','Cooperativas de crédito mútuo','Lei 9.718/1998, art. 14, II'),
  ('6424-7/04','Cooperativas de crédito rural','Lei 9.718/1998, art. 14, II'),
  ('6431-0/00','Bancos múltiplos, sem carteira comercial','Lei 9.718/1998, art. 14, II'),
  ('6432-8/00','Bancos de investimento','Lei 9.718/1998, art. 14, II'),
  ('6433-6/00','Bancos de desenvolvimento','Lei 9.718/1998, art. 14, II'),
  ('6435-2/01','Sociedades de crédito imobiliário','Lei 9.718/1998, art. 14, II'),
  ('6436-1/00','Sociedades de crédito, financiamento e investimento - financeiras','Lei 9.718/1998, art. 14, II'),
  ('6438-7/01','Bancos de câmbio','Lei 9.718/1998, art. 14, II'),
  ('6440-9/00','Arrendamento mercantil','Lei 9.718/1998, art. 14, II'),
  ('6450-6/00','Sociedades de capitalização','Lei 9.718/1998, art. 14, II'),
  ('6511-1/01','Sociedade seguradora de seguros vida','Lei 9.718/1998, art. 14, II'),
  ('6512-0/00','Sociedade seguradora de seguros não vida','Lei 9.718/1998, art. 14, II'),
  ('6520-1/00','Sociedade seguradora de seguros saúde','Lei 9.718/1998, art. 14, II'),
  ('6530-8/00','Resseguros','Lei 9.718/1998, art. 14, II'),
  ('6542-1/00','Previdência complementar aberta','Lei 9.718/1998, art. 14, II'),
  ('6612-6/01','Corretoras de títulos e valores mobiliários','Lei 9.718/1998, art. 14, II'),
  ('6612-6/02','Distribuidoras de títulos e valores mobiliários','Lei 9.718/1998, art. 14, II'),
  ('6612-6/03','Corretoras de câmbio','Lei 9.718/1998, art. 14, II'),
  ('6491-3/00','Sociedades de fomento mercantil - factoring','Lei 9.718/1998, art. 14, VI'),
  ('6492-1/00','Securitização de créditos','Lei 9.718/1998, art. 14, VII')
) as v(c, d, f)
on conflict (codigo, regime) do update set nivel = excluded.nivel, descricao = excluded.descricao, fundamento = excluded.fundamento;

-- ---------------------------------------------------------------- ficha da abertura (uma por processo)
create table if not exists public.soc_aberturas (
  processo_id          uuid primary key references public.soc_processos(id) on delete cascade,
  org_id               uuid not null references public.organizacoes(id) on delete cascade,
  regime               text check (regime in ('simples', 'presumido', 'real')),
  natureza             text check (natureza in ('ltda', 'slu', 'ss', 'ei')),
  porte                text check (porte in ('me', 'epp', 'demais')),
  razao_social         text check (razao_social is null or length(razao_social) between 3 and 150),
  nome_fantasia        text check (nome_fantasia is null or length(nome_fantasia) <= 80),
  cnae_principal       text check (cnae_principal is null or cnae_principal ~ '^\d{7}$'),
  cnae_principal_descricao text check (cnae_principal_descricao is null or length(cnae_principal_descricao) <= 300),
  cnaes_secundarios    jsonb not null default '[]' check (jsonb_typeof(cnaes_secundarios) = 'array'
                                                          and jsonb_array_length(cnaes_secundarios) <= 99),
  objeto_social        text check (objeto_social is null or length(objeto_social) <= 4000),
  capital_social       numeric(15, 2) check (capital_social is null or capital_social > 0),
  valor_quota          numeric(15, 2) check (valor_quota is null or valor_quota > 0),
  integralizacao       text check (integralizacao in ('no_ato', 'a_prazo')),
  integralizacao_prazo date,
  integralizacao_forma text check (integralizacao_forma in ('moeda', 'bens', 'moeda_e_bens')),
  cep                  text check (cep is null or cep ~ '^\d{8}$'),
  logradouro           text check (logradouro is null or length(logradouro) <= 150),
  numero               text check (numero is null or length(numero) <= 20),
  complemento          text check (complemento is null or length(complemento) <= 80),
  bairro               text check (bairro is null or length(bairro) <= 80),
  municipio            text check (municipio is null or length(municipio) <= 80),
  municipio_ibge       text check (municipio_ibge is null or municipio_ibge ~ '^\d{7}$'),
  uf                   text check (uf is null or uf ~ '^[A-Z]{2}$'),
  uso_endereco         text check (uso_endereco in ('estabelecimento', 'fiscal')),
  imovel_situacao      text check (imovel_situacao in ('proprio', 'alugado', 'cedido', 'comodato')),
  inscricao_imobiliaria text check (inscricao_imobiliaria is null or length(inscricao_imobiliaria) <= 40),
  area_m2              numeric(12, 2) check (area_m2 is null or area_m2 > 0),
  email                text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone             text check (telefone is null or telefone ~ '^\d{10,11}$'),
  contador_nome        text check (contador_nome is null or length(contador_nome) <= 120),
  contador_crc         text check (contador_crc is null or length(contador_crc) <= 30),
  observacoes          text check (observacoes is null or length(observacoes) <= 2000),
  atualizado_por       uuid references auth.users(id) on delete set null,
  atualizado_em        timestamptz not null default now(),
  check (integralizacao is distinct from 'a_prazo' or integralizacao_prazo is not null)
);
comment on table public.soc_aberturas is
  'Ficha de abertura de empresa do processo societário (112). Grava só por soc_abertura_salvar (societario › operar).';

create table if not exists public.soc_abertura_socios (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizacoes(id) on delete cascade,
  processo_id         uuid not null references public.soc_processos(id) on delete cascade,
  ordem               int not null default 1,
  tipo                text not null default 'pf' check (tipo in ('pf', 'pj')),
  nome                text not null check (length(nome) between 3 and 150),
  documento           text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),   -- CPF ou CNPJ, só dígitos
  domiciliado_exterior boolean not null default false,
  nacionalidade       text check (nacionalidade is null or length(nacionalidade) <= 40),
  data_nascimento     date,
  estado_civil        text check (estado_civil in ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo', 'separado')),
  regime_bens         text check (regime_bens in ('comunhao_parcial', 'comunhao_universal', 'separacao_total',
                                                  'separacao_obrigatoria', 'participacao_final')),
  profissao           text check (profissao is null or length(profissao) <= 80),
  rg                  text check (rg is null or length(rg) <= 30),
  rg_orgao            text check (rg_orgao is null or length(rg_orgao) <= 20),
  email               text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  celular             text check (celular is null or celular ~ '^\d{10,11}$'),
  cep                 text check (cep is null or cep ~ '^\d{8}$'),
  logradouro          text check (logradouro is null or length(logradouro) <= 150),
  numero              text check (numero is null or length(numero) <= 20),
  complemento         text check (complemento is null or length(complemento) <= 80),
  bairro              text check (bairro is null or length(bairro) <= 80),
  municipio           text check (municipio is null or length(municipio) <= 80),
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  percentual          numeric(7, 4) not null default 0 check (percentual >= 0 and percentual <= 100),
  administrador       boolean not null default false,
  outras_empresas     text check (outras_empresas is null or length(outras_empresas) <= 500),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  check (estado_civil in ('casado', 'uniao_estavel') or regime_bens is null)
);
create index if not exists soc_abertura_socios_proc on public.soc_abertura_socios (processo_id, ordem);
comment on table public.soc_abertura_socios is
  'Quadro societário da ficha de abertura (112): sócio, percentual, administrador e dados pessoais. Grava só por soc_abertura_socio_*.';

create table if not exists public.soc_abertura_documentos (
  arquivo_id   uuid primary key references public.hub_arquivos(id) on delete cascade,
  org_id       uuid not null references public.organizacoes(id) on delete cascade,
  processo_id  uuid not null references public.soc_processos(id) on delete cascade,
  tipo         text not null check (tipo in ('rg_cnh', 'cpf', 'comprovante_residencia', 'certidao_casamento',
                                             'iptu', 'contrato_locacao', 'matricula_imovel', 'autorizacao_imovel',
                                             'procuracao', 'outro')),
  socio_id     uuid references public.soc_abertura_socios(id) on delete set null,
  tipado_por   uuid references auth.users(id) on delete set null default auth.uid(),
  tipado_em    timestamptz not null default now()
);
create index if not exists soc_abertura_documentos_proc on public.soc_abertura_documentos (processo_id);
comment on table public.soc_abertura_documentos is
  'Tipo de cada anexo da abertura (RG/CNH, comprovante, IPTU…) e de qual sócio é (112). Grava só por soc_abertura_documento_tipar.';

do $$
declare t text;
begin
  foreach t in array array['soc_aberturas', 'soc_abertura_socios', 'soc_abertura_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app.hub_pode(org_id, ''societario'', ''ver'')))',
                   t || '_select', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- regras
/** Processo de abertura que a pessoa pode operar e que ainda está em andamento. Devolve o processo. */
create or replace function app.soc_abertura_processo(p_proc uuid)
returns public.soc_processos language plpgsql security definer set search_path = '' as $$
declare p public.soc_processos; v_codigo text;
begin
  select * into p from public.soc_processos where id = p_proc;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if not app.hub_pode(p.org_id, 'societario', 'operar') then
    raise exception 'Você não tem permissão para preencher a ficha de abertura';
  end if;
  select codigo into v_codigo from public.soc_tipos where id = p.tipo_id;
  if v_codigo is distinct from 'abertura' then raise exception 'A ficha de abertura só existe em processo de abertura'; end if;
  if p.status <> 'aberto' then raise exception 'O processo não está em andamento: a ficha não muda mais'; end if;
  return p;
end $$;

/** Confere regime × CNAE × porte × sócios. Levanta o primeiro impedimento em português claro. */
create or replace function app.soc_abertura_conferir(p_proc uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.soc_aberturas; r record; v_nome text;
begin
  select * into a from public.soc_aberturas where processo_id = p_proc;
  if a.processo_id is null or a.regime is null or a.regime = 'real' then return; end if;
  select x.codigo, x.descricao, x.fundamento into r
    from public.cnae_restricoes x
   where x.regime = a.regime and x.nivel = 'impeditivo'
     and x.codigo in (select a.cnae_principal
                      union all
                      select e ->> 'codigo' from jsonb_array_elements(a.cnaes_secundarios) e)
   order by (x.codigo = a.cnae_principal) desc, x.codigo
   limit 1;
  if r.codigo is not null then
    raise exception 'O CNAE % (%) não é permitido no %: %. Troque o regime ou retire o CNAE.',
      substr(r.codigo, 1, 4) || '-' || substr(r.codigo, 5, 1) || '/' || substr(r.codigo, 6, 2), r.descricao,
      case a.regime when 'simples' then 'Simples Nacional' else 'Lucro Presumido' end, r.fundamento;
  end if;
  if a.regime = 'simples' then
    if a.porte = 'demais' then
      raise exception 'No Simples Nacional a empresa precisa ser ME ou EPP (LC 123/2006, art. 3º). Ajuste o porte ou o regime.';
    end if;
    select s.nome into v_nome from public.soc_abertura_socios s where s.processo_id = p_proc and s.tipo = 'pj' limit 1;
    if v_nome is not null then
      raise exception 'Sócio pessoa jurídica (%) impede o Simples Nacional (LC 123/2006, art. 3º, § 4º, I).', v_nome;
    end if;
    select s.nome into v_nome from public.soc_abertura_socios s where s.processo_id = p_proc and s.domiciliado_exterior limit 1;
    if v_nome is not null then
      raise exception 'Sócio domiciliado no exterior (%) impede o Simples Nacional (LC 123/2006, art. 17, II).', v_nome;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- gravação
/** Grava a ficha (o que vier em p substitui o campo; o que não vier fica como está). */
create or replace function public.soc_abertura_salvar(p_proc uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare pr public.soc_processos; v_sec jsonb; e jsonb; v_cods text[] := '{}';
begin
  pr := app.soc_abertura_processo(p_proc);
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados da ficha inválidos'; end if;

  -- CNAE secundários: lista de {codigo, descricao}, sem repetir e sem repetir o principal
  v_sec := coalesce(p -> 'cnaes_secundarios', (select cnaes_secundarios from public.soc_aberturas where processo_id = p_proc), '[]');
  if jsonb_typeof(v_sec) <> 'array' then raise exception 'CNAE secundários inválidos'; end if;
  for e in select value from jsonb_array_elements(v_sec) loop
    if coalesce(e ->> 'codigo', '') !~ '^\d{7}$' then raise exception 'CNAE secundário inválido: use os 7 números da subclasse'; end if;
    if e ->> 'codigo' = any (v_cods) then raise exception 'O CNAE % aparece duas vezes nos secundários', e ->> 'codigo'; end if;
    v_cods := v_cods || (e ->> 'codigo');
  end loop;
  if nullif(coalesce(p ->> 'cnae_principal', (select cnae_principal from public.soc_aberturas where processo_id = p_proc)), '') = any (v_cods) then
    raise exception 'O CNAE principal não pode repetir nos secundários';
  end if;

  insert into public.soc_aberturas (processo_id, org_id) values (p_proc, pr.org_id) on conflict (processo_id) do nothing;
  update public.soc_aberturas set
    regime               = case when p ? 'regime' then nullif(p ->> 'regime', '') else regime end,
    natureza             = case when p ? 'natureza' then nullif(p ->> 'natureza', '') else natureza end,
    porte                = case when p ? 'porte' then nullif(p ->> 'porte', '') else porte end,
    razao_social         = case when p ? 'razao_social' then nullif(btrim(p ->> 'razao_social'), '') else razao_social end,
    nome_fantasia        = case when p ? 'nome_fantasia' then nullif(btrim(p ->> 'nome_fantasia'), '') else nome_fantasia end,
    cnae_principal       = case when p ? 'cnae_principal' then nullif(p ->> 'cnae_principal', '') else cnae_principal end,
    cnae_principal_descricao = case when p ? 'cnae_principal_descricao' then nullif(btrim(p ->> 'cnae_principal_descricao'), '') else cnae_principal_descricao end,
    cnaes_secundarios    = v_sec,
    objeto_social        = case when p ? 'objeto_social' then nullif(btrim(p ->> 'objeto_social'), '') else objeto_social end,
    capital_social       = case when p ? 'capital_social' then (p ->> 'capital_social')::numeric else capital_social end,
    valor_quota          = case when p ? 'valor_quota' then (p ->> 'valor_quota')::numeric else valor_quota end,
    integralizacao       = case when p ? 'integralizacao' then nullif(p ->> 'integralizacao', '') else integralizacao end,
    integralizacao_prazo = case when p ? 'integralizacao_prazo' then nullif(p ->> 'integralizacao_prazo', '')::date else integralizacao_prazo end,
    integralizacao_forma = case when p ? 'integralizacao_forma' then nullif(p ->> 'integralizacao_forma', '') else integralizacao_forma end,
    cep                  = case when p ? 'cep' then nullif(regexp_replace(p ->> 'cep', '\D', '', 'g'), '') else cep end,
    logradouro           = case when p ? 'logradouro' then nullif(btrim(p ->> 'logradouro'), '') else logradouro end,
    numero               = case when p ? 'numero' then nullif(btrim(p ->> 'numero'), '') else numero end,
    complemento          = case when p ? 'complemento' then nullif(btrim(p ->> 'complemento'), '') else complemento end,
    bairro               = case when p ? 'bairro' then nullif(btrim(p ->> 'bairro'), '') else bairro end,
    municipio            = case when p ? 'municipio' then nullif(btrim(p ->> 'municipio'), '') else municipio end,
    municipio_ibge       = case when p ? 'municipio_ibge' then nullif(p ->> 'municipio_ibge', '') else municipio_ibge end,
    uf                   = case when p ? 'uf' then nullif(upper(p ->> 'uf'), '') else uf end,
    uso_endereco         = case when p ? 'uso_endereco' then nullif(p ->> 'uso_endereco', '') else uso_endereco end,
    imovel_situacao      = case when p ? 'imovel_situacao' then nullif(p ->> 'imovel_situacao', '') else imovel_situacao end,
    inscricao_imobiliaria = case when p ? 'inscricao_imobiliaria' then nullif(btrim(p ->> 'inscricao_imobiliaria'), '') else inscricao_imobiliaria end,
    area_m2              = case when p ? 'area_m2' then (p ->> 'area_m2')::numeric else area_m2 end,
    email                = case when p ? 'email' then nullif(lower(btrim(p ->> 'email')), '') else email end,
    telefone             = case when p ? 'telefone' then nullif(regexp_replace(p ->> 'telefone', '\D', '', 'g'), '') else telefone end,
    contador_nome        = case when p ? 'contador_nome' then nullif(btrim(p ->> 'contador_nome'), '') else contador_nome end,
    contador_crc         = case when p ? 'contador_crc' then nullif(btrim(p ->> 'contador_crc'), '') else contador_crc end,
    observacoes          = case when p ? 'observacoes' then nullif(btrim(p ->> 'observacoes'), '') else observacoes end,
    atualizado_por       = auth.uid(),
    atualizado_em        = now()
  where processo_id = p_proc;

  perform app.soc_abertura_conferir(p_proc);

  -- o cabeçalho do processo acompanha a ficha (nome da futura empresa e UF)
  update public.soc_processos x set
    futuro_cliente = case when x.cliente_id is null then coalesce(a.razao_social, x.futuro_cliente) else x.futuro_cliente end,
    uf = coalesce(a.uf, x.uf), atualizado_em = now()
  from public.soc_aberturas a where a.processo_id = p_proc and x.id = p_proc;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Algum valor da ficha está em formato inválido (número ou data). Confira e salve de novo.';
  when check_violation then
    raise exception 'Algum campo da ficha está fora do formato (CEP com 8 números, UF com 2 letras, e-mail, telefone, prazo da integralização…). Confira e salve de novo.';
end $$;

/** Inclui (p_socio nulo) ou altera um sócio. Devolve o id. */
create or replace function public.soc_abertura_socio_salvar(p_proc uuid, p_socio uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pr public.soc_processos; v_id uuid; v_doc text; v_tipo text; v_civil text;
begin
  pr := app.soc_abertura_processo(p_proc);
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados do sócio inválidos'; end if;
  v_tipo := coalesce(nullif(p ->> 'tipo', ''), 'pf');
  v_doc := nullif(regexp_replace(coalesce(p ->> 'documento', ''), '\D', '', 'g'), '');
  if v_doc is not null and v_tipo = 'pf' and length(v_doc) <> 11 then raise exception 'CPF do sócio precisa ter 11 números'; end if;
  if v_doc is not null and v_tipo = 'pj' and length(v_doc) <> 14 then raise exception 'CNPJ do sócio precisa ter 14 números'; end if;
  if v_doc is not null and exists (select 1 from public.soc_abertura_socios s
                                    where s.processo_id = p_proc and s.documento = v_doc and s.id is distinct from p_socio) then
    raise exception 'Este CPF/CNPJ já está no quadro societário';
  end if;
  v_civil := nullif(p ->> 'estado_civil', '');

  if p_socio is null then
    insert into public.soc_abertura_socios (org_id, processo_id, ordem, nome)
    values (pr.org_id, p_proc,
            coalesce((select max(ordem) + 1 from public.soc_abertura_socios where processo_id = p_proc), 1),
            coalesce(nullif(btrim(p ->> 'nome'), ''), '—'))
    returning id into v_id;
  else
    select id into v_id from public.soc_abertura_socios where id = p_socio and processo_id = p_proc for update;
    if v_id is null then raise exception 'Sócio não encontrado neste processo'; end if;
  end if;

  update public.soc_abertura_socios set
    tipo = v_tipo, nome = btrim(coalesce(p ->> 'nome', '')), documento = v_doc,
    domiciliado_exterior = coalesce((p ->> 'domiciliado_exterior')::boolean, false),
    nacionalidade = nullif(btrim(p ->> 'nacionalidade'), ''),
    data_nascimento = nullif(p ->> 'data_nascimento', '')::date,
    estado_civil = case when v_tipo = 'pf' then v_civil end,
    regime_bens = case when v_tipo = 'pf' and v_civil in ('casado', 'uniao_estavel') then nullif(p ->> 'regime_bens', '') end,
    profissao = nullif(btrim(p ->> 'profissao'), ''),
    rg = nullif(btrim(p ->> 'rg'), ''), rg_orgao = nullif(btrim(p ->> 'rg_orgao'), ''),
    email = nullif(lower(btrim(p ->> 'email')), ''),
    celular = nullif(regexp_replace(coalesce(p ->> 'celular', ''), '\D', '', 'g'), ''),
    cep = nullif(regexp_replace(coalesce(p ->> 'cep', ''), '\D', '', 'g'), ''),
    logradouro = nullif(btrim(p ->> 'logradouro'), ''), numero = nullif(btrim(p ->> 'numero'), ''),
    complemento = nullif(btrim(p ->> 'complemento'), ''), bairro = nullif(btrim(p ->> 'bairro'), ''),
    municipio = nullif(btrim(p ->> 'municipio'), ''), uf = nullif(upper(p ->> 'uf'), ''),
    percentual = coalesce((p ->> 'percentual')::numeric, 0),
    administrador = coalesce((p ->> 'administrador')::boolean, false),
    outras_empresas = nullif(btrim(p ->> 'outras_empresas'), ''),
    atualizado_em = now()
  where id = v_id;

  if (select sum(percentual) from public.soc_abertura_socios where processo_id = p_proc) > 100 then
    raise exception 'A soma dos percentuais passa de 100%%. Ajuste a participação dos sócios.';
  end if;
  perform app.soc_abertura_conferir(p_proc);
  return v_id;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Algum valor do sócio está em formato inválido (percentual ou data). Confira e salve de novo.';
  when check_violation then
    raise exception 'Algum campo do sócio está fora do formato (nome com 3 letras ou mais, CEP com 8 números, UF, e-mail, celular, percentual entre 0 e 100). Confira e salve de novo.';
end $$;

create or replace function public.soc_abertura_socio_excluir(p_socio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.soc_abertura_socios;
begin
  select * into s from public.soc_abertura_socios where id = p_socio;
  if s.id is null then raise exception 'Sócio não encontrado'; end if;
  perform app.soc_abertura_processo(s.processo_id);
  delete from public.soc_abertura_socios where id = p_socio;
  perform app.soc_evento(s.processo_id, 'comentario', 'Sócio retirado da ficha de abertura: ' || s.nome, false);
end $$;

/** Marca o tipo de um anexo do processo (e de qual sócio é). p_tipo nulo tira a marcação. */
create or replace function public.soc_abertura_documento_tipar(p_arquivo uuid, p_tipo text, p_socio uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.hub_arquivos; pr public.soc_processos;
begin
  select * into a from public.hub_arquivos where id = p_arquivo;
  if a.id is null or a.app <> 'societario' or a.ref_id is null then raise exception 'Anexo do processo não encontrado'; end if;
  pr := app.soc_abertura_processo(a.ref_id);
  if a.org_id <> pr.org_id then raise exception 'Anexo do processo não encontrado'; end if;
  if p_socio is not null and not exists (select 1 from public.soc_abertura_socios where id = p_socio and processo_id = pr.id) then
    raise exception 'Sócio não encontrado neste processo';
  end if;
  if p_tipo is null then
    delete from public.soc_abertura_documentos where arquivo_id = p_arquivo;
    return;
  end if;
  insert into public.soc_abertura_documentos (arquivo_id, org_id, processo_id, tipo, socio_id)
  values (p_arquivo, pr.org_id, pr.id, p_tipo, p_socio)
  on conflict (arquivo_id) do update set tipo = excluded.tipo, socio_id = excluded.socio_id,
                                        tipado_por = auth.uid(), tipado_em = now();
exception when check_violation then
  raise exception 'Tipo de documento inválido';
end $$;

-- ---------------------------------------------------------------- concluir abertura com os dados da ficha
create or replace function public.soc_concluir_processo(p_proc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p soc_processos; t soc_tipos; v_cli uuid; v_hoje date; f soc_aberturas;
begin
  select * into p from soc_processos where id = p_proc;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if not app.hub_pode(p.org_id, 'societario', 'operar') then raise exception 'Sem permissão'; end if;
  if p.status <> 'aberto' then raise exception 'Só processo em andamento pode ser concluído'; end if;
  select * into t from soc_tipos where id = p.tipo_id;
  if t.codigo = 'baixa' and p.cliente_id is not null and not app.eh_gestor(p.org_id) then
    raise exception 'Concluir uma baixa inativa o cliente: só gestor ou administrador';
  end if;
  v_hoje := app.hoje(p.org_id);
  update soc_processos set status = 'concluido', concluido_em = v_hoje, atualizado_em = now() where id = p_proc;
  update tarefas set status = 'cancelada'
   where id in (select tarefa_id from soc_fases where processo_id = p_proc and status not in ('concluida', 'dispensada'))
     and status not in ('concluida', 'cancelada');
  update soc_fases set status = 'dispensada', mudou_em = now()
   where processo_id = p_proc and status not in ('concluida', 'dispensada');

  if t.codigo = 'abertura' and p.cliente_id is null then
    select * into f from soc_aberturas where processo_id = p_proc;
    insert into clientes (org_id, razao_social, nome_fantasia, cnpj, cidade, uf, regime, ativo, cliente_desde)
    values (p.org_id, coalesce(f.razao_social, p.futuro_cliente), f.nome_fantasia, p.cnpj, f.municipio,
            coalesce(f.uf, p.uf), f.regime, true, date_trunc('month', v_hoje)::date)
    returning id into v_cli;
    update soc_processos set cliente_id = v_cli where id = p_proc;
    update hub_arquivos set cliente_id = v_cli where app = 'societario' and ref_id = p_proc and cliente_id is null;
    perform app.soc_evento(p_proc, 'status', 'Cliente cadastrado no Hub: ' || coalesce(f.razao_social, p.futuro_cliente), false);
  elsif t.codigo = 'baixa' and p.cliente_id is not null then
    update clientes set ativo = false, inativo_em = v_hoje,
           motivo_inativacao = coalesce(motivo_inativacao, 'Baixa/encerramento (Societário #' || p.numero || ')')
     where id = p.cliente_id and ativo;
    perform app.aplicar_inativacao(p.cliente_id);
    perform app.soc_evento(p_proc, 'status', 'Cliente inativado por baixa', false);
  end if;
  perform app.soc_evento(p_proc, 'status', 'Processo concluído', true);
end $$;

revoke all on function app.soc_abertura_processo(uuid) from public, anon, authenticated;
revoke all on function app.soc_abertura_conferir(uuid) from public, anon, authenticated;
revoke all on function public.soc_abertura_salvar(uuid, jsonb) from public, anon;
revoke all on function public.soc_abertura_socio_salvar(uuid, uuid, jsonb) from public, anon;
revoke all on function public.soc_abertura_socio_excluir(uuid) from public, anon;
revoke all on function public.soc_abertura_documento_tipar(uuid, text, uuid) from public, anon;
grant execute on function public.soc_abertura_salvar(uuid, jsonb) to authenticated;
grant execute on function public.soc_abertura_socio_salvar(uuid, uuid, jsonb) to authenticated;
grant execute on function public.soc_abertura_socio_excluir(uuid) to authenticated;
grant execute on function public.soc_abertura_documento_tipar(uuid, text, uuid) to authenticated;
