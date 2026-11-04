-- Testes da 055: o cliente do contrato nasce (ou é completado) com CNPJ, e-mail, telefone, cidade e UF.
-- Blocos "(deve falhar)" terminam em ERROR; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e48';

\echo '--- K1 CNPJ com tamanho errado (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Kappa Ltda",
  "pessoa_dados":{"documento":"12.345.678/0001"},"descricao":"Kappa","valor":"100","dia":5,
  "categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01","gera_contas":false}'::jsonb);

\echo '=== K2 cliente novo vindo da Receita: nasce com CNPJ, e-mail, telefone, cidade e UF (esperado: 55666777000199, k@kappa.com.br, BRAGANCA PAULISTA, SP)'
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Kappa Ltda",
  "pessoa_dados":{"documento":"55.666.777/0001-99","email":" K@Kappa.com.br ","telefone":"(11) 4033-0000","cidade":"BRAGANCA PAULISTA","uf":"sp"},
  "descricao":"Kappa","valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01",
  "gera_contas":false}'::jsonb)->>'id') is not null as contrato;
reset role;
select documento, email, telefone, cidade, uf, tipo from fin_pessoas where nome = 'Kappa Ltda';
set role authenticated;

\echo '=== K3 mesmo CNPJ com outro nome: usa a mesma pessoa, sem duplicar (esperado: 1)'
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"KAPPA COMERCIO LTDA",
  "pessoa_dados":{"documento":"55666777000199"},"descricao":"Kappa 2","valor":"100","dia":5,
  "categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01","gera_contas":false}'::jsonb)->>'id') is not null as contrato;
reset role;
select count(*) as pessoas_1 from fin_pessoas where documento = '55666777000199' and cliente_id = '00000000-0000-0000-0000-000000000c41';
set role authenticated;

\echo '=== K4 pessoa que já existia só com nome: completa o CNPJ e a cidade, não troca o e-mail (esperado: 34028316000103, antigo@padaria.com.br, Atibaia, SP)'
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Padaria Só Nome",
  "pessoa_dados":{"documento":"34.028.316/0001-03","email":"novo@padaria.com.br","cidade":"Atibaia","uf":"SP"},
  "descricao":"Padaria","valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01",
  "gera_contas":false}'::jsonb)->>'id') is not null as contrato;
reset role;
select documento, email, cidade, uf from fin_pessoas where id = '00000000-0000-0000-0000-0000000055e1';
set role authenticated;

\echo '=== K5 sem pessoa_dados continua como antes (só o nome) (esperado: t, sem documento)'
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa_nome":"Lambda Aluguéis",
  "descricao":"Aluguel Lambda","valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2029-01-01",
  "gera_contas":false}'::jsonb)->>'id') is not null as contrato;
reset role;
select documento is null as sem_documento, tipo from fin_pessoas where nome = 'Lambda Aluguéis';
