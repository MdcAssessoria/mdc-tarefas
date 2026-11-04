-- Base para a 055 (cliente do contrato com CNPJ e endereço): uma pessoa já cadastrada só com o nome, para provar que o
-- contrato completa o que está em branco e não troca o que já existe.
insert into fin_pessoas (id, org_id, cliente_id, tipo, nome, email)
select '00000000-0000-0000-0000-0000000055e1', org_id, id, 'cliente', 'Padaria Só Nome', 'antigo@padaria.com.br'
  from clientes where id = '00000000-0000-0000-0000-000000000c41';
