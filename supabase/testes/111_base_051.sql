\set ON_ERROR_STOP 1
-- Base para a 051 (conciliação do extrato; roda por último). Extrato de outubro/2030 importado no Banco MDC (b401) e
-- no Santander MDC (b402, da 049), contas da MDC em aberto e uma linha de outra empresa (c1) para provar o bloqueio.
--   L1 +1.500,00  recebimento do Cliente Alfa         ↔ conta a receber de 1.500,00 (vence 05/10)
--   L2   −500,00  pagamento agrupado                  ↔ duas contas a pagar: 300,00 + 200,00
--   L3    −80,00  tarifa bancária                     → criar lançamento (despesa Aluguel, só para o teste)
--   L4 −1.000,00  transferência para o Santander      → criar transferência
--   L5 +1.000,00  (Santander) chegada da transferência ↔ a transferência criada na L4
--   L6    +50,00  depósito de teste do banco          → ignorar
--   L7 +1.520,00  recebimento com juros               ↔ conta a receber de 1.500,00 + 20,00 de juros
--   L8   −250,00  pagamento já baixado na tela         ↔ baixa existente (sem extrato)
set session_replication_role = replica;
insert into fin_titulos (id, org_id, cliente_id, tipo, pessoa_id, categoria_id, descricao, vencimento, valor) values
  ('00000000-0000-0000-0000-0000000051a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'receber',
   '00000000-0000-0000-0000-00000000e402', '00000000-0000-0000-0000-00000000d402', 'Honorários outubro', '2030-10-05', 1500),
  ('00000000-0000-0000-0000-0000000051a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'pagar',
   '00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000d401', 'Aluguel sala 1', '2030-10-06', 300),
  ('00000000-0000-0000-0000-0000000051a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'pagar',
   '00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000d401', 'Aluguel sala 2', '2030-10-06', 200),
  ('00000000-0000-0000-0000-0000000051a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'receber',
   '00000000-0000-0000-0000-00000000e402', '00000000-0000-0000-0000-00000000d402', 'Honorários atrasados', '2030-10-01', 1500),
  ('00000000-0000-0000-0000-0000000051a5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'pagar',
   '00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000d401', 'Condomínio', '2030-10-10', 250);
-- a conta de 250,00 já foi paga pela tela (baixa sem extrato)
insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, forma) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '00000000-0000-0000-0000-0000000051a5',
   '00000000-0000-0000-0000-00000000b401', '2030-10-10', 250, 'Pix');
update fin_titulos set valor_pago = 250, situacao = 'quitado', quitado_em = '2030-10-10' where id = '00000000-0000-0000-0000-0000000051a5';

insert into fin_extrato_lotes (id, org_id, cliente_id, conta_id, arquivo, formato, inicio, fim) values
  ('00000000-0000-0000-0000-0000000051b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41',
   '00000000-0000-0000-0000-00000000b401', 'extrato-outubro.ofx', 'ofx', '2030-10-01', '2030-10-31'),
  ('00000000-0000-0000-0000-0000000051b2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41',
   '00000000-0000-0000-0000-00000000b402', 'santander-outubro.ofx', 'ofx', '2030-10-01', '2030-10-31');
insert into fin_extrato_linhas (org_id, cliente_id, conta_id, lote_id, data, valor, descricao, chave)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', x.conta::uuid, x.lote::uuid, x.d::date, x.v, x.h, x.ch
  from (values
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-06', 1500.00, 'PIX RECEBIDO CLIENTE ALFA LTDA', 'L1'),
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-07', -500.00, 'PAGAMENTO BOLETOS IMOBILIARIA CENTRO', 'L2'),
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-08', -80.00, 'TARIFA PACOTE SERVICOS', 'L3'),
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-09', -1000.00, 'TED ENVIADA MDC SANTANDER', 'L4'),
    ('00000000-0000-0000-0000-00000000b402', '00000000-0000-0000-0000-0000000051b2', '2030-10-09', 1000.00, 'TED RECEBIDA MDC', 'L5'),
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-12', 50.00, 'DEPOSITO TESTE', 'L6'),
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-15', 1520.00, 'PIX CLIENTE ALFA ATRASADO', 'L7'),
    ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000051b1', '2030-10-10', -250.00, 'PIX CONDOMINIO', 'L8')
  ) x(conta, lote, d, v, h, ch);
-- linha de outra empresa (c1) na conta b1 dela, gravada sem as travas: a conciliação tem que recusar
insert into fin_extrato_lotes (id, org_id, cliente_id, conta_id, arquivo, formato) values
  ('00000000-0000-0000-0000-0000000051b9', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b1', 'outra.ofx', 'ofx');
insert into fin_extrato_linhas (org_id, cliente_id, conta_id, lote_id, data, valor, descricao, chave) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000051b9', '2030-10-06', -10, 'OUTRA EMPRESA', 'X1');
set session_replication_role = origin;
