\set ON_ERROR_STOP 1
-- Base para a 053 (envio automático das faturas por e-mail e WhatsApp; roda por último). Usa a fila criada pela
-- 045/049 (e-mail e WhatsApp nasceram 'aguardando_configuracao') e grava, sem os gatilhos, o que a emissão e o
-- Ledgra Link gravariam. A tabela teste_053 guarda os envios escolhidos (os números de fatura se repetem):
--  · email_pronto_1 e email_pronto_2: e-mail de fatura + boleto, com o boleto gerado e registrado;
--  · email_sem_nota: e-mail que leva a NFS-e ainda a emitir (não pode sair);
--  · zap_pronto: WhatsApp com NFS-e emitida e boleto gerado; zap_cancelada: WhatsApp de fatura cancelada.
alter table organizacoes add column if not exists logo_url text; -- existe no banco real (001)
create table teste_053 (nome text primary key, envio bigint, fatura uuid);
insert into teste_053
select 'email_pronto_' || row_number() over (order by e.id), e.id, e.fatura_id from fin_envios e join fin_faturas f on f.id = e.fatura_id
 where e.canal = 'email' and e.conteudo @> '{boleto}' and not e.conteudo @> '{nfse}' and f.situacao <> 'cancelada'
 order by e.id limit 2;
insert into teste_053
select 'email_sem_nota', e.id, e.fatura_id from fin_envios e join fin_faturas f on f.id = e.fatura_id
 where e.canal = 'email' and e.conteudo @> '{nfse}' and f.nfse_situacao = 'a_emitir' order by e.id limit 1;
insert into teste_053
select 'zap_pronto', e.id, e.fatura_id from fin_envios e join fin_faturas f on f.id = e.fatura_id
 where e.canal = 'whatsapp' and e.conteudo @> '{nfse,boleto}' and f.situacao <> 'cancelada' order by e.id limit 1;
insert into teste_053
select 'zap_cancelada', e.id, e.fatura_id from fin_envios e join fin_faturas f on f.id = e.fatura_id
 where e.canal = 'whatsapp' and f.situacao = 'cancelada' order by e.id limit 1;
do $$ begin
  if (select count(*) from teste_053) <> 5 then raise exception 'Base da 053: faltou envio de exemplo (%)', (select count(*) from teste_053); end if;
end $$;
grant select on teste_053 to authenticated, service_role;

set session_replication_role = replica;
update fin_faturas set boleto_situacao = 'gerado'
 where id in (select fatura from teste_053 where nome in ('email_pronto_1', 'email_pronto_2', 'zap_pronto'));
update fin_faturas set nfse_situacao = 'emitida', nfse_numero = '9101' where id = (select fatura from teste_053 where nome = 'zap_pronto');
insert into fin_fatura_boletos (org_id, cliente_id, fatura_id, banco, cobranca_link_id, tipo, valor, vencimento, linha_digitavel, pix_copia_cola, nosso_numero)
select f.org_id, f.cliente_id, f.id, 'itau', gen_random_uuid(), 'boleto_hibrido', f.valor, f.vencimento,
       '34191.79001 01043.510047 91020.150008 1 99990000150000', '00020126580014br.gov.bcb.pix0136teste', right(f.numero, 3)
  from fin_faturas f where f.id in (select fatura from teste_053 where nome in ('email_pronto_1', 'email_pronto_2', 'zap_pronto'));
set session_replication_role = origin;
