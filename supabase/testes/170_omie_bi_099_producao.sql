-- Testes da 099 (Omie/BI sem gravação direta). Rodam NA PRODUÇÃO dentro de begin…rollback, porque as tabelas
-- omie_*/bi_* ainda não estão nas migrações do repositório (ALT-02). Nada fica gravado.
-- Usuário: Edvaldo (admin da MDC). Empresas do Grupo Clara.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
-- T1 admin não troca a credencial da Omie (NOV-01) — esperado: permission denied
do $$ begin update omie_empresas set credencial = 'CLARA_COMPANY' where cliente_id = '2bfba338-901a-46ce-8b0d-fdc5163169da';
  insert into _r values ('t1_update_credencial', 'GRAVOU'); exception when others then insert into _r values ('t1_update_credencial', sqlerrm); end $$;
-- T2 admin não cria ligação nova — esperado: permission denied
do $$ begin insert into omie_empresas (cliente_id, org_id, credencial) select id, org_id, 'CLARA_COMPANY' from clientes limit 1;
  insert into _r values ('t2_insert', 'GRAVOU'); exception when others then insert into _r values ('t2_insert', sqlerrm); end $$;
-- T3 grupos e mapa sem gravação direta — esperado: permission denied
do $$ begin insert into bi_mapa_categorias (org_id, prefixo, linha_dre) select org_id, 'x', 'receita_bruta' from omie_empresas limit 1;
  insert into _r values ('t3_mapa', 'GRAVOU'); exception when others then insert into _r values ('t3_mapa', sqlerrm); end $$;
-- T4 leitura continua — esperado: 3 empresas, relatório com valor
insert into _r select 't4_le_empresas', count(*)::text from omie_empresas;
insert into _r select 't4_relatorio', count(*)::text from public.bi_relatorio('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-03-31', true);
insert into _r select 't4_linhas', count(*)::text from bi_linhas;
-- T5 pedir sincronização continua — esperado: ok
do $$ begin perform public.omie_pedir_sincronizacao('128cce4c-cb86-414c-8096-c786c320cff0'); insert into _r values ('t5_pedir_sinc', 'ok');
  exception when others then insert into _r values ('t5_pedir_sinc', sqlerrm); end $$;
-- T6 importar complementar continua (NOV-06) — esperado: ok true, lote na org da empresa
insert into _r select 't6_importar', public.bi_complementar_importar('teste.xlsx',
  '[{"cnpj":"14.012.035/0001-55","competencia":"2026-02-01","linha_dre":"despesas_pessoal","valor":"100","historico":"teste 099"}]'::jsonb)::text;
insert into _r select 't6_lote_org_ok', (l.org_id = c.org_id)::text from bi_complementar_lotes l join bi_complementares b on b.lote_id = l.id
  join clientes c on c.id = b.cliente_id where b.historico = 'teste 099';
reset role;
set local role anon;
-- T7 anon sem leitura — esperado: permission denied
do $$ begin perform count(*) from bi_linhas; insert into _r values ('t7_anon', 'LEU'); exception when others then insert into _r values ('t7_anon', sqlerrm); end $$;
reset role;
select k, v from _r order by k;
