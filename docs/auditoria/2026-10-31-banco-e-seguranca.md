# Auditoria do back-end HUB-MDC (Supabase)

**Escopo:** `supabase/migrations/001` a `019` (inclui `007b`), `supabase/functions/{convite,certificado,demonstrativo-pdf}`, e, como contexto, `supabase/simulador/001_encaminhar_leads_hub.sql`, `supabase/seed_mdc.sql` e `infra/cloudflare/README.md`.
**Método:** leitura estática; nenhum arquivo foi alterado e o banco em produção não foi consultado. Considerei o estado final depois da 016 ("correções da auditoria"), que já fechou a criação livre de organização (A1), o `cliente_id` cruzado (A2), a publicação direta (A3), o convite do portal para conta existente (C1), o caminho do upload do cliente (M3) e a mensagem "sistema" forjada (M4).
**Premissas confirmadas no repositório:** o cadastro público está desligado (infra/cloudflare/README.md, passo 6), as contas nascem só por convite e o front-end não usa o esquema `app` pela Data API.

---

## 1. Resumo executivo

| Severidade | Qtde | Assunto |
|---|---|---|
| Crítico | 0 | Não achei nada explorável sem login. |
| Alto | 2 | (A-1) Quem tem Atendimento/gerir ou é gestor consegue o link de acesso de uma conta convidada que ainda não entrou, inclusive de um administrador. (A-2) Acesso de portal usado como "porta dos fundos": a pessoa se põe como usuária do portal de qualquer cliente, e esse acesso continua depois que ela é inativada. |
| Médio | 6 | Balancete publicado pode ser alterado por quem só tem "operar" e sai assinado com o certificado ICP-Brasil; `soc_concluir_processo` deixa quem opera o Societário inativar cliente; arquivos abertos para a organização inteira (TV incluída), com possibilidade de expor o arquivo de um cliente para outro; funções internas do `app` ainda executáveis; referências entre organizações por FK simples (risco latente); lead anônimo sem limite. |
| Baixo | 5 | Ajustes no chat, nas tarefas, no CORS e nas mensagens de erro, e a edição direta de `membros`. |

**Visão geral de segurança.** O modelo está bem pensado. RLS está ligado nas 38 tabelas do `public`. Toda função `SECURITY DEFINER` fixa o `search_path`. As FKs compostas `(org_id, id)` do núcleo de Tarefas impedem referências entre organizações. O certificado fica no Vault e só o `service_role` executa `cert_*`. As Edge Functions validam o JWT do usuário e, sempre que possível, leem pelo RLS dele. Os dois problemas altos são de **fluxo**, não de RLS esquecido. Os dois atravessam o convite e o portal, e os dois dependem de um usuário interno com permissão de gestão no Atendimento.

**Visão geral de manutenção.** Hoje um humano não consegue responder "qual é a definição atual de X" sem ler as 20 migrações em ordem:
- 13 funções foram redefinidas de 2 a 3 vezes. `importar_clientes` aparece 3 vezes, e a 007b é **idêntica** à versão da 007.
- Há **zero** `COMMENT ON`.
- Parte das políticas é criada em laços `DO … format()`, e um `grep` não acha o nome delas.
- O arquivo `007b_…` não segue o padrão `<versão>_nome.sql` da Supabase CLI.
- O README manda rodar as migrações à mão no SQL Editor, então não existe histórico confiável do que foi aplicado.
- Os objetos temporários citados (`app.recebimento_temp`, `hub_receber_arquivo_temp`, `hub_ler_arquivo_temp`) **não existem em nenhum arquivo do repositório**. Se existem no banco, foram criados direto em produção, e isso já é a deriva que a seção 4 trata.

---

## 2. Achados de segurança

### [ALTO] A-1 · Tomada de conta convidada pela Edge Function `convite` (gestor ou Atendimento/gerir vira administrador)

- **Onde:**
  - `supabase/functions/convite/index.ts:45-52`: quando `inviteUserByEmail` falha, gera um link do tipo `invite` e **devolve esse link a quem chamou**.
  - `supabase/migrations/015_perfis_e_convites.sql:230-233`: no ramo "conta convidada e ainda não confirmada", basta o chamador ser gestor ou ter Atendimento/gerir numa organização em que essa conta seja **usuária do portal**.
  - `supabase/migrations/010_portal_cliente.sql:42-44`: `portal_usuarios_write` deixa gestor e Atendimento/gerir inserir `portal_usuarios` com **qualquer `user_id`**.
  - `015_perfis_e_convites.sql:183-208`: `app.aplicar_convites` torna a conta membro, com o papel do convite, **no momento em que o `auth.users` é criado**, antes de a pessoa aceitar.
  - `001_schema.sql:285-286`: todo membro lê `membros` e, com isso, o `user_id` de quem foi convidado.
- **Cenário de falha:**
  1. O admin convida `nova.socia@mdcassessoria.com` como **admin**. A Edge Function cria a conta (`invited_at` preenchido, sem confirmação), e o gatilho já grava a linha em `membros` com `papel='admin'`.
  2. Um usuário com o perfil "Gestor" (que tem `atendimento: gerir`, 008:277) lê `membros` e pega o `user_id` dela.
  3. Esse usuário faz `POST /rest/v1/portal_usuarios {org_id: MDC, user_id: <dela>, cliente_id: <qualquer cliente>}`. A política permite, e o gatilho `cliente_mesma_org` passa porque o cliente é da MDC.
  4. Ele chama `POST /functions/v1/convite {email: "nova.socia@…"}`. `hub_pode_enviar_convite` responde `true` pela linha 232. `inviteUserByEmail` falha em qualquer um destes casos: SMTP próprio ainda não ativo (o README diz que, sem ele, o e-mail só chega para a equipe do projeto), limite de e-mails por hora (30, o próprio atacante esgota com reenvios) ou o "reenvio" que o comentário da linha 48 já espera falhar. Nesse caso a função responde `{enviado:false, link: action_link}`.
  5. Ele abre o link, define a senha e passa a ser a "nova sócia", administradora da MDC.

  A mesma técnica vale para tomar a conta de qualquer colega recém-convidado e agir em nome dele, o que contamina a auditoria. Também vale pelo ramo 1 (linhas 227-229): um `portal_convites` criado para um e-mail ainda sem conta faz a conta nascer e recebe **todos** os convites pendentes desse e-mail, inclusive os de equipe.
- **Correção proposta:**
  1. **Nunca devolver `action_link` para quem não é admin da organização que convidou aquele e-mail para a equipe.** O mais seguro é nunca devolvê-lo:

     ```ts
     // convite/index.ts
     if (!error) return json(200, { enviado: true });
     console.error("convite por e-mail falhou", error.message);
     return json(502, { erro: "Não foi possível enviar o e-mail agora. Verifique o SMTP e tente mais tarde." });
     ```

     Se o link para WhatsApp for indispensável, devolva-o só quando `hub_pode_enviar_convite` indicar o ramo "admin de equipe da organização que convidou". Para isso, a função passa a retornar o motivo (`'equipe_admin'|'portal'|null`), e o link só sai para `'equipe_admin'` **e** quando `papel` do convite ≠ `'admin'`.
  2. Aplicar o convite **na confirmação**, não no `INSERT`. Troque o gatilho para `AFTER UPDATE OF email_confirmed_at ON auth.users WHEN (old.email_confirmed_at IS NULL AND new.email_confirmed_at IS NOT NULL)` e, até lá, mantenha o vínculo só em `app.convites`.
  3. Fechar a inserção direta em `portal_usuarios` (ver A-2).
- **Detecção atual:** parcial. `app.convite_envios` registra quem pediu o envio, mas nada alerta quando o link é devolvido. Registre `hub_auditoria(acao='convite_link_devolvido')` na Edge Function, usando o service client.

### [ALTO] A-2 · Acesso de portal como porta dos fundos: dura além da inativação e não é auditado

- **Onde:**
  - `010_portal_cliente.sql:42-44`: `portal_usuarios_write` aceita qualquer `user_id`, inclusive o do próprio usuário ou o de uma conta pessoal.
  - `016_endurecimento_auditoria.sql:38-45`: `app.portal_pode` só olha `portal_usuarios` e não verifica se a pessoa é da equipe.
  - `017_editar_membro.sql:31-34`: inativar membro não mexe em `portal_usuarios`.
  - `010:79-105`: `portal_convidar` bloqueia o e-mail da equipe, mas a escrita direta na tabela ignora essa regra.
- **Cenário de falha:** um analista com perfil Gestor, Societário ou Fiscal (todos com `atendimento` ≥ operar; Gestor tem gerir), ou qualquer gestor, sem acesso a Demonstrativos, faz:

  ```
  POST /rest/v1/portal_usuarios  (para cada cliente da lista, que ele lê em clientes_select)
  { "org_id": "<MDC>", "user_id": "<o próprio uid ou o de uma conta gmail convidada pelo portal>", "cliente_id": "<X>", "nome": "x", "email": "x" }
  ```

  A partir daí, `portal_pode(X,'demonstrativos')` é verdadeiro e ele lê balancetes e pareceres publicados (`bal_cliente_select`, `parecer_cliente`), documentos visíveis (`hub_arquivos_cliente_select` e o Storage), vencimentos, processos e todo o chat do cliente. Ao ser desligado, `membros.ativo=false` não remove nada disso. Com a conta pessoal, continua lendo os demonstrativos de toda a carteira. Nenhum registro vai para `hub_auditoria`, porque só `portal_convidar` chama `app.registrar`.
- **Correção proposta:**

  ```sql
  -- só pelas funções; a tela usa portal_convidar / uma nova portal_definir_acesso
  drop policy portal_usuarios_write on public.portal_usuarios;
  create policy portal_usuarios_update on public.portal_usuarios for update to authenticated
    using (app.eh_gestor(org_id) or app.hub_pode(org_id,'atendimento','gerir'))
    with check (app.eh_gestor(org_id) or app.hub_pode(org_id,'atendimento','gerir'));
  -- (sem INSERT/DELETE diretos: criar/remover só via RPC auditada)

  -- quem é da equipe não é usuário de portal da mesma organização
  create or replace function app.tg_portal_usuario_nao_equipe() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if exists (select 1 from membros where org_id = new.org_id and user_id = new.user_id) then
      raise exception 'Pessoa da equipe não pode ser usuária do portal';
    end if;
    perform app.registrar(new.org_id,'portal',tg_op,new.cliente_id::text,null,to_jsonb(new.user_id));
    return new;
  end $$;
  create trigger portal_usuario_nao_equipe before insert or update of user_id on public.portal_usuarios
    for each row execute function app.tg_portal_usuario_nao_equipe();
  ```

  Na inativação (`hub_editar_membro`), desative também os `portal_usuarios` criados por essa pessoa. Para isso, acrescente `criado_por uuid default auth.uid()` à tabela. Faça ainda uma revisão única hoje: `select * from portal_usuarios pu join membros m using (user_id)` deve voltar vazio, e convém conferir os `portal_usuarios` cujo e-mail não é do domínio do cliente.

### [MÉDIO] M-1 · Balancete publicado alterável por quem só "opera" e assinado com o certificado A1

- **Onde:**
  - `016:59-60`: `bal_linhas_equipe_write` exige só `operar`, para INSERT/UPDATE/DELETE, mesmo com o balancete já publicado. A trava `tg_publicacao_protegida` (016:74-100) cobre `portal_balancetes` e `portal_pareceres`, **não as linhas**.
  - `functions/demonstrativo-pdf/index.ts:59` lê as linhas, `:82-86` busca o certificado sempre que o balancete está publicado, e `:129-138` assina.
- **Cenário:** quem tem Demonstrativos/operar (num perfil personalizado) altera `saldo_atual` de contas de um mês já publicado. O cliente baixa o PDF, que sai **assinado com o certificado ICP-Brasil do responsável técnico** e mostra no anexo de balancete números diferentes dos demonstrativos publicados. Ninguém com `gerir` aprovou, e não fica auditoria.
- **Correção:** um gatilho em `portal_balancete_linhas` que bloqueia INSERT/UPDATE/DELETE quando o balancete pai está `publicado` (fora do `app.publicando`), ou uma política com `exists (select 1 from portal_balancetes b where b.id = balancete_id and b.status = 'rascunho')` no `USING`/`WITH CHECK` da escrita.

### [MÉDIO] M-2 · `soc_concluir_processo` chamável direto: quem "opera" o Societário inativa ou cria clientes

- **Onde:** `009_societario.sql:299-330`. É `public`, exige só `operar` e não confere `p.status = 'aberto'`.
- **Cenário:** quem só opera o Societário abre um processo do tipo `baixa` para o cliente X (`soc_abrir_processo`) e, em seguida, chama `rpc('soc_concluir_processo', {p_proc})`. O cliente fica inativo, as tarefas futuras são canceladas (`aplicar_inativacao`), os vencimentos são encerrados (gatilho 011:103-113) e o portal do cliente cai depois do mês. Pela regra da 007, isso é exclusivo do gestor (`inativar_cliente`, 007:45). A chamada também funciona sobre processo já **cancelado** ou **concluído**.
- **Correção:** tornar a função interna (`app.soc_concluir_processo`, sem `grant` a `authenticated`), chamada só por `soc_mudar_fase`. Ou, se for mesmo pública, adicionar `if p.status <> 'aberto' then raise …` e exigir `app.eh_gestor(p.org_id)` quando `t.codigo = 'baixa'`.

### [MÉDIO] M-3 · Arquivos: acesso pela organização inteira (TV incluída) e possibilidade de expor o arquivo de um cliente para outro

- **Onde:**
  - `008_hub_base.sql:320-321`: `hub_arquivos_equipe FOR ALL` para qualquer membro.
  - `008:333-338`: Storage com select, insert e delete para qualquer membro, sem `hub_pode`.
  - `010:367-370`: o cliente baixa o objeto cujo `name = hub_arquivos.caminho` de uma linha visível dele.
- **Cenário:**
  1. A conta `tv@` fica logada 24 h numa TV do escritório e lê **todos** os objetos do bucket: contratos do CRM, documentos de clientes e do Societário.
  2. Por engano ou má-fé, qualquer analista faz `update hub_arquivos set cliente_id = <B>, visivel_cliente = true where id = <arquivo do cliente A>`. O `cliente_mesma_org` passa porque é a mesma organização, e o cliente B baixa o documento do A. A tela já faz `update … visivel_cliente` direto (`web/src/components/TarefaEditor.tsx:298`), então a única proteção é essa política. Também é possível mudar o `caminho` de uma linha visível de B para apontar a qualquer outro objeto da organização.
  3. Qualquer membro pode **apagar** qualquer objeto, inclusive os envios dos clientes e a logo.
- **Correção:** separar por módulo e por papel.

  ```sql
  drop policy hub_arquivos_equipe on public.hub_arquivos;
  create policy hub_arq_select on public.hub_arquivos for select to authenticated
    using (app.hub_pode(org_id, app_modulo(app), 'ver'));          -- mapear 'portal'→'atendimento' etc.
  create policy hub_arq_insert on public.hub_arquivos for insert to authenticated
    with check (app.hub_pode(org_id, app_modulo(app), 'operar'));
  create policy hub_arq_update on public.hub_arquivos for update to authenticated
    using (app.hub_pode(org_id, app_modulo(app), 'operar'))
    with check (app.hub_pode(org_id, app_modulo(app), 'operar'));
  create policy hub_arq_delete on public.hub_arquivos for delete to authenticated
    using (app.hub_pode(org_id, app_modulo(app), 'gerir'));
  ```

  Também: um gatilho que torne `caminho`, `org_id` e `cliente_id` **imutáveis** depois do insert. Nas políticas do Storage, exigir `app.papel(org) <> 'tv'` e que o objeto tenha linha em `hub_arquivos` acessível ao usuário, com a mesma regra acima.

### [MÉDIO] M-4 · Funções internas do esquema `app` continuam executáveis (o `grant` em massa desfez os `revoke`)

- **Onde:**
  - `001:498` e `007:115` revogam `gerar_tarefas_recorrentes`, mas `008:343`, `009:401`, `010:533` e `011:122` repetem `grant execute on all functions in schema app to authenticated`.
  - A lista da `016:233-243` (B1) deixou de fora `app.soc_iniciar_fase`, `app.soc_tarefa_da_fase`, `app.soc_evento`, `app.venc_avisar`, `app.semear_societario`, `app.pendencias_membro` (018) e `app.equipe_do_cliente`.
  - Além disso, funções criadas num esquema que não é o `public` recebem `EXECUTE` para **PUBLIC**, o que inclui `anon`. O `revoke … from anon` da 004 não remove o grant feito a PUBLIC.
- **Cenário:** hoje o risco é **latente**, porque a Data API expõe só o `public`. Basta alguém incluir `app` em *API › Exposed schemas* (o que é comum quando se quer chamar um auxiliar pela tela) para qualquer conta, ou até a anônima, executar `app.soc_iniciar_fase(<processo de outra org>, 1)`, `app.venc_avisar()` (dispara avisos de todas as organizações) ou `app.soc_evento(...)` (injeta texto visível ao cliente), todas sem checagem de permissão.
- **Correção:** uma vez só, e depois tirar o `grant` em massa de todos os arquivos:

  ```sql
  revoke execute on all functions in schema app from public, anon, authenticated;
  alter default privileges in schema app revoke execute on functions from public;
  grant execute on function app.minhas_orgs(), app.papel(uuid), app.meu_setor(uuid), app.eh_gestor(uuid),
    app.hoje(uuid), app.hub_pode(uuid,text,text), app.hub_peso(text), app.portal_pode(uuid,text),
    app.equipe_do_cliente(uuid,text,text), app.uuid_ou_nulo(text) to authenticated;   -- só os predicados das políticas
  revoke usage on schema app from anon;
  ```

### [MÉDIO] M-5 · Referências entre organizações por FK simples (latente enquanto houver uma só organização)

- **Onde:** só o `cliente_id` ganhou a checagem de mesma organização (016:16-36). Ficaram FKs só por `id` em:
  - `soc_fases`, `soc_protocolos`, `soc_exigencias`, `soc_taxas` e `soc_eventos` → `processo_id` (009:47,68,79,90,103);
  - `portal_balancete_linhas.balancete_id` (010:419), em que `org_id` nem é FK;
  - `portal_pareceres.balancete_id`;
  - `crm_atividades` e `crm_contratos` → `oportunidade_id`;
  - `hub_arquivos.ref_id`, sem FK;
  - `portal_conversas.setor_id`, `tarefa_id` e `processo_id`.

  Algumas funções `SECURITY DEFINER` confiam no `org_id` da linha filha e agem sobre a linha pai. Exemplo: `soc_mudar_fase` checa `hub_pode(f.org_id)` e depois mexe no processo `f.processo_id` (009:231-265).
- **Cenário:** com duas organizações reais (o README, seção 5, prevê oferecer o sistema a outros escritórios), um gestor da organização B que conheça o UUID de um processo ou balancete da MDC insere `soc_fases(org_id=B, processo_id=<MDC>)`. Ao chamar `soc_mudar_fase`, avança a fase do processo da MDC e grava em `soc_eventos` um texto visível ao cliente da MDC. Da mesma forma, insere linhas `portal_balancete_linhas(org_id=B, balancete_id=<MDC publicado>)`, que aparecem para o cliente da MDC. Hoje não há organização B porque `criar_organizacao` foi revogada, e por isso o risco é latente.
- **Correção:** padronizar `unique (org_id, id)` nas tabelas pai e FK composta `(org_id, processo_id) references soc_processos(org_id, id)`, como já se faz em `tarefas`. Transformar `portal_balancete_linhas.org_id` em FK. Em `soc_mudar_fase`, `soc_registrar_exigencia` e afins, checar a permissão pelo `org_id` **do pai**.

### [MÉDIO] M-6 · `crm_receber_lead` anônimo sem limite de volume nem de tamanho

- **Onde:** `014_crm_e_dfc.sql:171-199`. Está liberado a `anon`, e a chave publicável é pública (`supabase/simulador/001_encaminhar_leads_hub.sql:10`).
- **Cenário:** um script faz milhares de `POST /rest/v1/rpc/crm_receber_lead` com `consentimento:true` e `id` aleatório. O resultado: o funil fica cheio de lixo, cada chamada gera notificações para todo o Comercial e os admins, e `dados_origem` guarda `p->'utm'`, `p->'folha'` etc. **sem limite de tamanho** (JSON de megabytes por linha). Além disso, o lead vai para "a primeira organização criada" (linha 177), o que fica frágil com mais de uma organização.
- **Correção:**
  - Mover a entrada para uma Edge Function com segredo compartilhado (o projeto do simulador envia `x-hub-token`) ou para um `pg_net` com chave própria. Revogar `anon`.
  - Limitar `octet_length(p::text) < 8000`.
  - Tirar as notificações em laço para um resumo diário.
  - Fixar a organização pelo slug (`'mdc'`).

### [BAIXO] B-1 · O cliente altera campos de SLA da conversa
`010:237-252`: o gatilho `tg_conversa_antes` restaura vários campos, mas não `respondida_em`, `atualizado_em`, `aberto_por` nem `avaliacao` fora do fluxo. Com isso, o cliente pode "responder" a própria conversa para o indicador e mexer na ordenação. **Correção:** para quem não é da equipe, restaurar todos os campos, exceto `avaliacao` e `status` (limitado a `resolvido`/`em_atendimento`).

### [BAIXO] B-2 · `anexo_id` da mensagem não é validado
`010:214`: o cliente pode citar qualquer `hub_arquivos.id`, inclusive interno ou de outro cliente. Ele não consegue baixar, mas a equipe vê o arquivo "enviado pelo cliente" e pode encaminhá-lo. **Correção:** no `tg_mensagem`, exigir que `anexo_id` pertença à mesma `cliente_id` e `org_id` da conversa.

### [BAIXO] B-3 · O analista muda visibilidade e cliente de tarefas
`001:330-337`: `tarefas_update` aceita qualquer coluna. O analista pode marcar `visivel_cliente=true`, escrever `pendencia_cliente` ou trocar o `cliente_id` (dentro da organização), e isso passa a aparecer em `portal_rotinas`. **Correção:** um gatilho que só permita `visivel_cliente`, `pendencia_cliente` e `cliente_id` a quem tem `hub_pode(org,'atendimento','operar')` ou é gestor.

### [BAIXO] B-4 · Edge Functions: CORS `*`, `localhost` na lista de origens e erro cru
- `convite/index.ts:16` aceita `http://localhost:3000` como destino do link.
- `certificado/index.ts:52` devolve a mensagem crua do `node-forge`.
- `Access-Control-Allow-Origin: *` nas três funções não é explorável com token Bearer, mas é desnecessário.
- **Correção:** origens fixas de produção (com o localhost só sob uma variável de ambiente de desenvolvimento) e mensagem genérica no erro do certificado.
- Não há `supabase/config.toml` no repositório. Confirme que as três funções foram publicadas **com** `verify_jwt` (o padrão).

### [BAIXO] B-5 · Escrita direta em `membros` contorna `hub_editar_membro`
`001:287-288` (`membros_admin FOR ALL`): o admin pode, pela API, mudar papel, perfil e ativo sem a auditoria nem as regras da 017. **Correção:** deixar só o SELECT pela política e fazer toda escrita por RPC auditada.

### Observação: objetos temporários
`app.recebimento_temp`, `hub_receber_arquivo_temp` e `hub_ler_arquivo_temp` **não aparecem em nenhum arquivo do repositório** (`grep` em todo o projeto). Se existem no banco, não dá para auditá-los por aqui. Se for uma função `SECURITY DEFINER` que recebe e lê arquivo, ela pode ser executável por PUBLIC (ver M-4). Rode no SQL Editor e apague o que não for usado:

```sql
select n.nspname, p.proname, p.prosecdef, p.proconfig, p.proacl::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname ~ '_temp$' or n.nspname in ('app','public') and p.proname ~ 'temp';
select table_schema, table_name from information_schema.tables where table_name ~ 'temp';
-- depois:  drop function if exists …; drop table if exists app.recebimento_temp;
```

### Pontos positivos
- RLS ligado em 100% das tabelas do `public`, e as tabelas do `app` têm `revoke all`.
- `search_path` fixo em todas as funções `SECURITY DEFINER` (conferido: 0 sem).
- FKs compostas `(org_id, …)` em `tarefas`, `cliente_responsaveis` e `membros`.
- Certificado A1 e senha no Vault, com `cert_*` só para o `service_role` e uma Edge Function que confere o admin no servidor.
- `demonstrativo-pdf` lê pelo RLS do usuário e só assina o que está publicado. A logo tem lista de domínios permitidos, o que evita SSRF.
- Proteção de publicação por flag de transação (`app.publicando`) e correção do "sistema" forjado (M4 da 016).
- `hub_auditoria` sem escrita direta. Limite diário de convites e `convite_envios`.
- A 016 corrigiu bem os achados anteriores e documentou cada um.

### Monitoramento
Hoje nenhum destes eventos seria notado: criação direta em `portal_usuarios` (A-2), devolução do link de convite (A-1), troca de `cliente_id`/`caminho`/`visivel_cliente` em `hub_arquivos` (M-3) e mudança em linhas de balancete publicado (M-1). Recomendo um gatilho genérico de auditoria (`app.tg_auditar`) nessas quatro tabelas, gravando em `hub_auditoria`, e um aviso no sino do admin para `convite_link_devolvido`.

---

## 3. Achados de manutenibilidade (como um humano descobre o estado atual)

### 3.1 Redefinições: qual versão vale
A versão que vale é sempre a **última da lista**:

| Objeto | Definido em |
|---|---|
| `app.aplicar_convites` | 005:20 → 008:221 → **015:183** |
| `app.gerar_tarefas_recorrentes` | 001:454 → 007:70 → **018:100** |
| `public.importar_clientes` | 006:21 → 007:118 → **007b:2** (idêntica à da 007) |
| `public.adicionar_membro` | 003:4 → **005:45** |
| `app.portal_pode` | 010:50 → **016:38** |
| `app.tg_mensagem` | 010:258 → **016:169** |
| `app.tg_membro_acesso_padrao` | 008:248 → **015:84** |
| `public.hub_definir_acesso` | 008:155 → **015:116** |
| `public.hub_aplicar_perfil` | 008:178 → **015:145** |
| `public.hub_convidar` | 008:195 (outra assinatura, apagada) → **015:154** |
| `public.hub_meus_apps` | 008:115 → **015:259** |
| `public.portal_publicar_balancete` / `_parecer` | 010 → **016** |
| `public.portal_conversa_para_tarefa` | 010:334 → **016:210** |

Políticas trocadas: `bal_equipe_write`, `bal_linhas_equipe`, `parecer_equipe` (010 → removidas e recriadas na 016); `hub_arquivos_cliente_insert` (010 → 016); `crm_op_write` (014 → dividida na 019).

### 3.2 Problemas estruturais
1. **Sem histórico de aplicação.** O README (seção 1) manda colar no SQL Editor, não há `supabase/config.toml` nem `supabase_migrations.schema_migrations` confiável, e já há objetos criados direto no banco (os `*_temp`). Não dá para saber se produção = repositório.
2. **`007b_…` fora do padrão.** A Supabase CLI só reconhece `<dígitos>_nome.sql` e **ignora** esse arquivo em `db push`/`db reset`. O conteúdo é redundante, então pode ser apagado.
3. **Zero `COMMENT ON`.** O significado de colunas como `tarefas.visivel_cliente` (null = segue o modelo), `portal_mapa_contas.cliente_id` (null = regra da organização), `venc_itens.avisos` ou os GUCs `app.publicando`/`app.msg_sistema` está só em comentários `--` espalhados pelas migrações. No painel do Supabase e no `psql \d+`, aparece em branco.
4. **Políticas geradas em laço** (`009:130-139`, `016:26-36`, `011:125-133`). Os nomes `soc_processos_select` etc. não existem como texto, e um `grep` não os acha.
5. **`grant` em massa repetido** (`grant execute on all functions in schema app`, 4 vezes) e `revoke` espalhados. A permissão final de cada função só se descobre consultando o catálogo.
6. **Regras dependentes do nome do setor** (`nome ilike 'societ%'` em 009:158, `'fiscal%'` em 011:70, `translate(lower(nome)…)` em 010:316). Renomear um setor na tela quebra o roteamento sem erro nenhum. Prefira uma coluna `setores.codigo`.
7. **Dados específicos da MDC dentro das migrações:** CNPJ, logo e e-mails (005), o contrato com CRC e endereço (014:205-259), a organização dos leads como "a primeira criada" (014:177). Isso deveria ficar em seed e configuração.
8. **Fuso fixo** `'America/Sao_Paulo'` nas views (001:367-401), embora exista `organizacoes.fuso`.
9. **Nomes inconsistentes:**
   - Prefixos de tabela: `tarefas`/`clientes` sem prefixo, `hub_`, `soc_`, `portal_`, `venc_`, `crm_`. Os demonstrativos estão sob `portal_` (`portal_balancetes`, `portal_mapa_dfc`), embora sejam usados pela equipe.
   - Autor/usuário: `user_id`, `autor_id`, `criado_por`, `enviado_por`, `importado_por`, `liberado_por`.
   - Datas: `criado_em`, `em`, `enviado_em`, `liberado_em`, `importado_em`, `mudou_em`.
   - O mesmo nome com domínios diferentes: `membros.papel` (enum admin/gestor/…) e `hub_acessos.papel` (ver/operar/gerir).
   - Status ora como `enum` (`status_tarefa`), ora como `text check`.
   - Políticas: `org_select`, `cresp_write`, `bal_equipe_insert`, `mapa_dfc_write`, `hub_storage_equipe_select`.
10. **README desatualizado:** lista só 001 a 003 e ainda diz que qualquer pessoa pode criar organização (seção 5), o que a 016 revogou.
11. **Cadeias de gatilhos implícitas:** tarefa concluída → `tg_tarefa_fase_societario` → `soc_mudar_fase` → `soc_iniciar_fase` → nova tarefa, ou `soc_concluir_processo` → cria ou inativa cliente → `tg_cliente_inativo_venc` → encerra vencimentos. Nada documenta essa sequência num lugar só.

---

## 4. Recomendações para tornar o banco legível

1. **Arquivo de estado atual, gerado e versionado.** Depois de cada migração, rode e faça commit:

   ```bash
   supabase db dump --schema public,app --schema-only -f supabase/schema/estado_atual.sql
   ```

   (ou `pg_dump -s -n public -n app`). Esse arquivo vira a resposta oficial para "qual é a definição atual". Um CI simples pode falhar se o dump não bater com o repositório.
2. **Adotar a Supabase CLI de verdade.**
   - `supabase init` e `supabase link`.
   - `supabase migration fetch`/`repair` para registrar o que já está aplicado.
   - `supabase db diff --linked` para revelar a deriva (os `*_temp` vão aparecer).
   - Daqui em diante, nomes `AAAAMMDDHHMMSS_assunto.sql` e **nada** pelo SQL Editor em produção.
   - Opcional: consolidar 001 a 019 numa única baseline `20261101000000_baseline.sql`, gerada do dump, e arquivar as antigas em `supabase/migrations_historico/`.
3. **Funções em arquivos próprios, uma por objeto.** Por exemplo, `supabase/schema/funcoes/app.hub_pode.sql` com `create or replace`. A migração só faz `\i` ou copia, e o diff do git mostra exatamente o que mudou na regra.
4. **`COMMENT ON` obrigatório** para toda tabela, toda coluna não óbvia, toda função e toda política nova. Um modelo:

   ```sql
   comment on function app.hub_pode(uuid,text,text) is
     'Regra única de acesso da equipe: admin = tudo; senão hub_acessos (ver<operar<gerir), respeitando expira_em. Usada pelas políticas RLS.';
   comment on column public.tarefas.visivel_cliente is 'null = segue modelos_recorrentes.visivel_cliente; true/false = decisão manual';
   ```

   Um teste (`select … from pg_class c left join pg_description d … where d.description is null`) pode barrar migrações sem comentário.
5. **Catálogo de segurança consultável:** uma view só para admin (ou uma consulta guardada no README) que lista o estado atual.

   ```sql
   -- funções: definer? search_path? quem executa?
   select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args,
          p.prosecdef definer, p.proconfig, p.proacl::text grants,
          obj_description(p.oid,'pg_proc') comentario
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','app') order by 1,2;
   -- políticas em vigor por tabela
   select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies
    where schemaname in ('public','storage') order by 2,3;
   -- gatilhos
   select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
     from information_schema.triggers where trigger_schema='public' order by 1,2;
   ```

6. **Convenções escritas** (`supabase/CONVENCOES.md`):
   - O prefixo da tabela é o módulo do Hub (renomear `portal_balancetes` → `dem_balancetes` numa baseline futura).
   - Políticas no formato `<tabela>_<cmd>_<quem>`, por exemplo `soc_fases_update_equipe`.
   - Colunas `criado_em`/`criado_por` padronizadas.
   - Papel do módulo sempre como `nivel`, nunca `papel`.
   - Funções públicas são RPCs com checagem de permissão na primeira linha; tudo o mais fica em `app`, sem `grant`.
7. **Políticas escritas por extenso** em vez de laços `DO … format()`. São poucas linhas a mais e passam a ser achadas por `grep`.
8. **Testes de RLS versionados** com pgTAP (`supabase test db`), cobrindo pelo menos: analista sem Demonstrativos, TV, usuário do portal de A tentando ler B, gestor tentando escrever em `portal_usuarios` e o fluxo de convite. O README diz que isso foi testado, mas os testes não estão no repositório.
9. **Mapa das cadeias de gatilhos** (tarefa ↔ fase ↔ processo ↔ cliente ↔ vencimentos) num diagrama em `docs/`, mantido junto com o dump.

---

*Arquivos relevantes:* `/home/claude/mdc-tarefas/supabase/functions/convite/index.ts`, `/home/claude/mdc-tarefas/supabase/migrations/010_portal_cliente.sql`, `/home/claude/mdc-tarefas/supabase/migrations/015_perfis_e_convites.sql`, `/home/claude/mdc-tarefas/supabase/migrations/016_endurecimento_auditoria.sql`, `/home/claude/mdc-tarefas/supabase/migrations/008_hub_base.sql`, `/home/claude/mdc-tarefas/supabase/migrations/009_societario.sql`, `/home/claude/mdc-tarefas/supabase/functions/demonstrativo-pdf/index.ts`.
