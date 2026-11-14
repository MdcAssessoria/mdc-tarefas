-- Catálogo padrão de rotinas contábeis da MDC (14/11/2026), para cadastrar em "Obrigações recorrentes".
-- Base: documento "HUB-MDC — Catálogo padrão de rotinas contábeis". Entram 38 rotinas que ainda não existem
-- (as 11 já cadastradas, como EFD-Reinf, PGDAS-D, ECD e ECF, ficam como estão: o script pula título repetido).
-- TODAS ENTRAM DESLIGADAS (ativo = false): nada é gerado para os clientes até alguém conferir prazo e setor em
-- Configurações › Obrigações recorrentes e ligar cada uma. Os prazos são de referência e precisam ser conferidos com a
-- agenda tributária e a legislação estadual e municipal de cada cliente.
-- Vencimento = dia_vencimento do mês (competência + meses_apos_competencia); dia 31 vira o último dia do mês e cai
-- para o dia útil anterior (ajuste "antecipa"). meses = competências em que a rotina vale (vazio = todo mês).
-- Ficaram de fora: rotinas "por evento" (admissão, férias, rescisão), que não têm data fixa, e o controle de
-- certificados digitais, que o HUB já faz em Vencimentos › Certificados.
-- Como aplicar: SQL Editor do projeto bulqqdgfrrpqquqvjjfa (pode rodar de novo: não duplica).
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

insert into public.modelos_recorrentes
  (org_id, titulo, descricao, setor_id, prioridade, regimes, segmentos, meses, dia_vencimento, meses_apos_competencia, ajuste, ativo, visivel_cliente)
select o.id, v.titulo, v.descricao, s.id, v.prioridade::prioridade, v.regimes, v.segmentos, v.meses, v.dia, v.apos,
       'antecipa', false, v.visivel
  from public.organizacoes o
  cross join (values
    -- Fiscal: escrituração
    ('Captura dos XML de NF-e e CT-e de entrada', 'Baixar da SEFAZ/portal os XML do mês e conferir se chegaram todos.', 'Fiscal', 'media', null::text[], null::text[], null::int[], 5, 1, false),
    ('Escrituração das notas de entrada', 'Importar e escriturar as notas de entrada no Domínio.', 'Fiscal', 'media', null, null, null, 5, 1, false),
    ('Escrituração das notas de saída e serviços', 'Importar e escriturar as notas de saída e de serviços prestados.', 'Fiscal', 'media', null, null, null, 5, 1, false),
    ('Conferência de CFOP, CST, NCM e alíquotas', 'Revisar a classificação fiscal das notas escrituradas.', 'Fiscal', 'media', null, null, null, 7, 1, false),
    ('Manifestação do destinatário e notas não escrituradas', 'Manifestar as NF-e recebidas e conferir notas emitidas contra o CNPJ que não foram escrituradas.', 'Fiscal', 'media', null, null, null, 7, 1, false),
    ('Escrituração das NFS-e tomadas e retenções', 'Lançar os serviços tomados e as retenções de ISS, IRRF, CSRF e INSS.', 'Fiscal', 'media', null, null, null, 7, 1, false),
    ('Apuração de ICMS, ICMS-ST e DIFAL', 'Apurar e emitir as guias. Conferir o vencimento da UF do cliente.', 'Fiscal', 'alta', array['presumido','real'], null, null, 10, 1, true),
    ('Apuração de IPI', 'Apurar o IPI do mês (indústrias).', 'Fiscal', 'alta', array['presumido','real'], array['industria'], null, 20, 1, true),
    ('Apuração do ISS próprio e retido', 'Apurar o ISS e emitir a guia. Conferir o vencimento do município.', 'Fiscal', 'alta', null, null, null, 10, 1, true),
    ('Apuração de PIS e COFINS', 'Apurar e emitir os DARF (vencimento dia 25).', 'Fiscal', 'alta', array['presumido','real'], null, null, 20, 1, true),
    ('Emissão e envio das guias ao cliente', 'Enviar todas as guias do mês ao cliente com pelo menos 3 dias de antecedência.', 'Fiscal', 'alta', null, null, null, 15, 1, true),
    -- Fiscal: obrigações acessórias
    ('Declarações municipais de serviços', 'Declaração de serviços prestados e tomados do município do cliente.', 'Fiscal', 'media', null, null, null, 10, 1, false),
    ('DeSTDA', 'Declaração de substituição tributária, DIFAL e antecipação (Simples Nacional, contribuinte do ICMS).', 'Fiscal', 'media', array['simples'], null, null, 28, 1, false),
    ('Conferência de débitos e pendências no e-CAC e na SEFAZ', 'Situação fiscal federal e estadual do cliente: débitos, omissões e mensagens.', 'Fiscal', 'media', null, null, null, 10, 1, false),
    ('Controle de validade das certidões negativas (CND)', 'Conferir as certidões federal, estadual, municipal e FGTS e renovar as que vencem.', 'Fiscal', 'baixa', null, null, null, 5, 1, false),
    -- Departamento Pessoal
    ('Recebimento das variáveis da folha', 'Cobrar e receber do cliente horas extras, faltas, comissões e demais variáveis.', 'Departamento Pessoal', 'alta', null, null, null, 25, 0, false),
    ('Pró-labore', 'Calcular o pró-labore dos sócios e os encargos.', 'Departamento Pessoal', 'media', null, null, null, 5, 1, true),
    ('Guia do FGTS Digital', 'Emitir e enviar a guia do FGTS (vencimento dia 20).', 'Departamento Pessoal', 'alta', null, null, null, 20, 1, true),
    ('Provisões de férias e 13º salário', 'Calcular as provisões do mês para a contabilidade.', 'Departamento Pessoal', 'media', array['presumido','real'], null, null, 10, 1, false),
    ('13º salário: 1ª parcela', 'Calcular e enviar a 1ª parcela do 13º (até 30/11).', 'Departamento Pessoal', 'alta', null, null, array[11], 30, 0, true),
    ('13º salário: 2ª parcela', 'Calcular e enviar a 2ª parcela do 13º (até 20/12).', 'Departamento Pessoal', 'alta', null, null, array[12], 20, 0, true),
    -- Contábil
    ('Solicitação de extratos bancários e de aplicações', 'Pedir ao cliente os extratos do mês de todas as contas e aplicações.', 'Contábil', 'media', null, null, null, 5, 1, false),
    ('Importação dos extratos (OFX) e conciliação bancária', 'Importar os extratos e conciliar os saldos bancários.', 'Contábil', 'alta', null, null, null, 15, 1, false),
    ('Integração fiscal e da folha na contabilidade', 'Integrar os lançamentos do fiscal e da folha e conferir os totais.', 'Contábil', 'media', null, null, null, 15, 1, false),
    ('Provisões, depreciação e apropriações', 'Lançar provisões, depreciação e apropriação de despesas antecipadas.', 'Contábil', 'media', array['presumido','real'], null, null, 20, 1, false),
    ('Conciliação de contas a pagar, a receber e adiantamentos', 'Conferir os saldos de fornecedores, clientes e adiantamentos.', 'Contábil', 'media', null, null, null, 20, 1, false),
    ('Conciliação de impostos a recolher e a recuperar', 'Conferir os saldos de impostos com as apurações e as guias pagas.', 'Contábil', 'media', null, null, null, 20, 1, false),
    ('Conciliação de estoque', 'Conferir o saldo contábil do estoque com o inventário/controle do cliente.', 'Contábil', 'media', null, array['comercio','industria'], null, 20, 1, false),
    ('Estimativa mensal de IRPJ e CSLL', 'Lucro Real por estimativa: balancete de suspensão/redução e DARF (vencimento no último dia útil).', 'Contábil', 'alta', array['real'], null, null, 25, 1, true),
    ('LALUR e LACS (e-Lalur)', 'Escriturar as adições, exclusões e compensações do ano (entrega junto com a ECF).', 'Contábil', 'alta', array['real'], null, array[12], 31, 7, false),
    ('Balancete mensal: análise e envio ao cliente', 'Analisar o balancete do mês e enviar ao cliente.', 'Contábil', 'media', null, null, null, 25, 1, true),
    ('Fechamento anual: balanço, DRE e notas explicativas', 'Encerrar o exercício e preparar as demonstrações do ano.', 'Contábil', 'alta', null, null, array[12], 30, 4, true),
    ('Distribuição de lucros e informes de rendimentos', 'Informes de rendimentos aos sócios e controle da distribuição de lucros do ano.', 'Contábil', 'alta', null, null, array[12], 28, 2, true),
    -- Atendimento e controle do cliente
    ('Checklist de documentos recebidos do cliente', 'Conferir se chegaram todos os documentos do mês.', null, 'media', null, null, null, 5, 1, false),
    ('Cobrança de documentos pendentes', 'Cobrar do cliente o que ainda não chegou.', null, 'media', null, null, null, 6, 1, false),
    ('Envio do pacote mensal ao cliente', 'Guias, folha e balancete do mês reunidos e enviados ao cliente.', null, 'media', null, null, null, 25, 1, true),
    ('Revisão do regime tributário do ano seguinte', 'Simular o regime do próximo ano e apresentar ao cliente antes de janeiro.', 'Fiscal', 'alta', null, null, array[11], 15, 1, true),
    ('Reunião de resultados com o cliente', 'Apresentar o resultado do trimestre (conforme o contrato do cliente).', 'Contábil', 'baixa', null, null, array[3,6,9,12], 20, 1, true)
  ) as v(titulo, descricao, setor, prioridade, regimes, segmentos, meses, dia, apos, visivel)
  left join public.setores s on s.org_id = o.id and s.nome = v.setor
 where o.id = '224d1feb-deb6-4fd1-a2c6-a63140d8426e'  -- MDC Assessoria
   and not exists (select 1 from public.modelos_recorrentes m where m.org_id = o.id and lower(m.titulo) = lower(v.titulo));
