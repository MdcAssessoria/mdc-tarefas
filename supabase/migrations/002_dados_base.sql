-- =====================================================================
--  Dados base: feriados nacionais 2026–2027
--  (feriados municipais/estaduais: cadastrar por organização na tela Configurações)
-- =====================================================================
insert into public.feriados (org_id, data, descricao) values
  (null, '2026-01-01', 'Confraternização Universal'),
  (null, '2026-02-16', 'Carnaval (ponto facultativo)'),
  (null, '2026-02-17', 'Carnaval (ponto facultativo)'),
  (null, '2026-04-03', 'Sexta-feira Santa'),
  (null, '2026-04-21', 'Tiradentes'),
  (null, '2026-05-01', 'Dia do Trabalho'),
  (null, '2026-06-04', 'Corpus Christi (ponto facultativo)'),
  (null, '2026-09-07', 'Independência'),
  (null, '2026-10-12', 'Nossa Senhora Aparecida'),
  (null, '2026-11-02', 'Finados'),
  (null, '2026-11-15', 'Proclamação da República'),
  (null, '2026-11-20', 'Dia da Consciência Negra'),
  (null, '2026-12-25', 'Natal'),
  (null, '2027-01-01', 'Confraternização Universal'),
  (null, '2027-02-08', 'Carnaval (ponto facultativo)'),
  (null, '2027-02-09', 'Carnaval (ponto facultativo)'),
  (null, '2027-03-26', 'Sexta-feira Santa'),
  (null, '2027-04-21', 'Tiradentes'),
  (null, '2027-05-01', 'Dia do Trabalho'),
  (null, '2027-05-27', 'Corpus Christi (ponto facultativo)'),
  (null, '2027-09-07', 'Independência'),
  (null, '2027-10-12', 'Nossa Senhora Aparecida'),
  (null, '2027-11-02', 'Finados'),
  (null, '2027-11-15', 'Proclamação da República'),
  (null, '2027-11-20', 'Dia da Consciência Negra'),
  (null, '2027-12-25', 'Natal')
on conflict do nothing;
