\set ON_ERROR_STOP 1
-- Base para a 050 (Portal › Faturas; roda por último). Usa as faturas publicadas no Portal pela 045 (Gama para o
-- cliente c1, Delta para o c3) e grava, sem os gatilhos, o que a emissão e o Ledgra Link gravariam:
--  · NFS-e emitida em produção para uma fatura do c1 e para a do c3, e uma nota de TESTE (produção restrita) do c1;
--  · um boleto registrado para a mesma fatura do c1;
--  · os XMLs no bucket fiscal (pasta nfse-emitidas da MDC).
select f.id as fat_c1 from fin_faturas f
 where f.cliente_carteira_id = '00000000-0000-0000-0000-0000000000c1' and f.situacao <> 'cancelada'
   and exists (select 1 from fin_envios e where e.fatura_id = f.id and e.canal = 'portal' and e.situacao = 'enviado')
 order by f.numero limit 1 \gset
select f.id as fat_c3 from fin_faturas f
 where f.cliente_carteira_id = '00000000-0000-0000-0000-0000000000c3' and f.situacao <> 'cancelada'
   and exists (select 1 from fin_envios e where e.fatura_id = f.id and e.canal = 'portal' and e.situacao = 'enviado')
 order by f.numero limit 1 \gset
set session_replication_role = replica;
insert into nfse_emissoes (id, org_id, cliente_id, fatura_id, ambiente, serie, ndps, id_dps, situacao, chave_acesso, numero_nfse, xml_caminho)
select x.id::uuid, f.org_id, f.cliente_id, f.id, x.amb, '1', x.n, 'DPS3507605248140121000165' || '00001' || lpad(x.n::text, 15, '0'), 'emitida',
       lpad(x.n::text, 50, '7'), x.n::text, f.org_id || '/' || f.cliente_id || '/nfse-emitidas/2028/01/' || x.arq
  from (values ('00000000-0000-0000-0000-00000000a501', :'fat_c1', 'producao', 9001, 'nota-c1.xml'),
               ('00000000-0000-0000-0000-00000000a502', :'fat_c3', 'producao', 9002, 'nota-c3.xml'),
               ('00000000-0000-0000-0000-00000000a503', :'fat_c1', 'producao_restrita', 9003, 'teste-c1.xml')) x(id, fat, amb, n, arq)
  join fin_faturas f on f.id = x.fat::uuid;
insert into fin_fatura_boletos (org_id, cliente_id, fatura_id, banco, cobranca_link_id, tipo, valor, vencimento, linha_digitavel, pix_copia_cola, nosso_numero)
select f.org_id, f.cliente_id, f.id, 'itau', '00000000-0000-0000-0000-00000000a5b1', 'boleto_hibrido', f.valor, f.vencimento,
       '34191.79001 01043.510047 91020.150008 1 99990000150000', '00020126580014br.gov.bcb.pix0136teste', '123'
  from fin_faturas f where f.id = :'fat_c1';
set session_replication_role = origin;
insert into storage.objects (bucket_id, name, owner_id)
select 'fiscal', e.xml_caminho, null from nfse_emissoes e where e.id in ('00000000-0000-0000-0000-00000000a501',
  '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000a503');
