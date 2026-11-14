-- Testes da 080 (PIN das organizações pessoais). Roda sobre uma base simulada mínima (criada aqui mesmo) e depois a
-- migração 080: bash supabase/testes/rodar_pin.sh. Linhas "(deve falhar)" precisam terminar em ERROR em português.
\set ON_ERROR_STOP 0
\echo '--- PIN: entrar sem PIN criado (deve falhar)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.pin_conferir('00000000-0000-0000-0000-00000000000b', '4826');

\echo '--- PIN fraco (deve falhar)'
select public.pin_definir('00000000-0000-0000-0000-00000000000b', '1234');
\echo '--- PIN com letras (deve falhar)'
select public.pin_definir('00000000-0000-0000-0000-00000000000b', '48a6');

\echo '--- cria o PIN 4826 (já fica liberado)'
select (public.pin_definir('00000000-0000-0000-0000-00000000000b', '4826')->>'definido')::boolean as definido;
select app.pin_liberado() as liberado_apos_criar;
\echo '--- PIN guardado só como resumo (não pode aparecer 4826)'
select pin_hash <> '4826' and pin_hash like '$2%' as so_resumo from app.pin_usuarios;

\echo '--- liberado: admin cadastra pessoa na organização com PIN'
insert into public.membros (org_id, user_id, papel) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a2', 'analista');

\echo '--- trancado: cadastrar pessoa (deve falhar)'
select public.pin_trancar();
insert into public.membros (org_id, user_id, papel) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a3', 'analista');
\echo '--- trancado: mudar papel de outra pessoa (deve falhar)'
update public.membros set papel = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a2';
\echo '--- trancado: tirar pessoa (deve falhar)'
delete from public.membros where user_id = '00000000-0000-0000-0000-0000000000a2';
\echo '--- trancado: liberar ferramenta para outra pessoa (deve falhar)'
insert into public.hub_acessos (org_id, user_id, app, papel) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a2', 'tarefas', 'operar');
\echo '--- trancado: convite do HUB (deve falhar)'
insert into app.convites (org_id, email) values ('00000000-0000-0000-0000-00000000000b', 'novo@exemplo.com');
\echo '--- trancado: convite da família (deve falhar)'
insert into public.pessoal_convites (org_id, nome) values ('00000000-0000-0000-0000-00000000000b', 'Fulano');
\echo '--- trancado: desligar o PIN pela tabela (deve falhar)'
update public.organizacoes set exige_pin = false where id = '00000000-0000-0000-0000-00000000000b';
\echo '--- trancado: desligar o PIN pela função (deve falhar)'
select public.org_definir_exige_pin('00000000-0000-0000-0000-00000000000b', false);

\echo '--- organização SEM PIN (MDC) segue normal mesmo trancado'
insert into public.membros (org_id, user_id, papel) values ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a3', 'analista');
\echo '--- a própria pessoa mexendo no próprio cadastro segue normal'
update public.membros set papel = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a1' and org_id = '00000000-0000-0000-0000-00000000000b';
\echo '--- sem login (rotina do sistema) segue normal'
select set_config('request.jwt.claim.sub', '', false);
insert into public.membros (org_id, user_id, papel) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a4', 'analista');

\echo '--- PIN errado: devolve ok=false e 4 tentativas restantes'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.pin_conferir('00000000-0000-0000-0000-00000000000b', '0001') ->> 'restantes' as restantes;
\echo '--- mais 4 erros: trava por 15 minutos'
select public.pin_conferir('00000000-0000-0000-0000-00000000000b', '0002');
select public.pin_conferir('00000000-0000-0000-0000-00000000000b', '0003');
select public.pin_conferir('00000000-0000-0000-0000-00000000000b', '0004');
select (public.pin_conferir('00000000-0000-0000-0000-00000000000b', '0005') ->> 'bloqueado_ate') is not null as travou;
\echo '--- travado: nem o PIN certo libera'
select (public.pin_conferir('00000000-0000-0000-0000-00000000000b', '4826') ->> 'ok')::boolean as ok_travado;
\echo '--- trocar PIN travado sem login recente (deve falhar)'
select public.pin_definir('00000000-0000-0000-0000-00000000000b', '7391');
\echo '--- "Esqueci meu PIN": entrou com a senha agora, cria PIN novo sem o atual'
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000a1';
select (public.pin_definir('00000000-0000-0000-0000-00000000000b', '7391') ->> 'liberado_ate') is not null as liberado;
\echo '--- PIN novo confere'
select public.pin_trancar();
select (public.pin_conferir('00000000-0000-0000-0000-00000000000b', '7391') ->> 'ok')::boolean as ok;
\echo '--- trocar PIN trancado e sem login recente (deve falhar)'
update auth.users set last_sign_in_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000000a1';
select public.pin_trancar();
select public.pin_definir('00000000-0000-0000-0000-00000000000b', '5820');
\echo '--- trocar PIN logo depois de digitar o atual (liberado)'
select (public.pin_conferir('00000000-0000-0000-0000-00000000000b', '7391') ->> 'ok')::boolean as conferiu;
select (public.pin_definir('00000000-0000-0000-0000-00000000000b', '5820') ->> 'definido')::boolean as trocou;
\echo '--- liberado: desligar e religar o PIN pela função'
select public.org_definir_exige_pin('00000000-0000-0000-0000-00000000000b', false);
select public.org_definir_exige_pin('00000000-0000-0000-0000-00000000000b', true);
select exige_pin from public.organizacoes where id = '00000000-0000-0000-0000-00000000000b';
\echo '--- analista não liga/desliga o PIN (deve falhar)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
select public.org_definir_exige_pin('00000000-0000-0000-0000-00000000000b', false);
\echo '--- registro de auditoria das tentativas'
select acao, count(*) from public.hub_auditoria group by acao order by acao;
