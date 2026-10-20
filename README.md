[README.md](https://github.com/user-attachments/files/33718983/README.md)
# MDC Tarefas

Controle de tarefas e obrigações recorrentes da equipe, com painel em tempo real para TV.
Multiempresa desde o início: a MDC é a primeira organização; cada cliente que adotar o sistema
vira uma organização isolada (dados separados por RLS no banco, marca própria no painel).

**Stack:** Next.js 16 (Vercel) · Supabase (Postgres, Auth, Realtime, pg_cron)

```
mdc-tarefas/
├── supabase/
│   ├── migrations/001_schema.sql      tabelas, RLS, views do painel, recorrência, realtime, cron
│   ├── migrations/002_dados_base.sql  feriados nacionais 2026–2027
│   ├── migrations/003_membros_rpc.sql adicionar membro por e-mail
│   └── seed_mdc.sql                   cria a organização MDC, setores e obrigações de exemplo
└── web/                               app Next.js (login, tarefas, configurações, /tv)
```

---

## 1. Banco de dados (Supabase)

1. Crie um projeto em supabase.com, região **South America (São Paulo)**.
2. Em **SQL Editor**, rode na ordem: `001_schema.sql`, `002_dados_base.sql`, `003_membros_rpc.sql`.
   - O `001` já liga o Realtime na tabela `tarefas` e agenda o **pg_cron** (todo dia 06:05).
     Se aparecer o aviso "pg_cron indisponível", habilite em *Database › Extensions › pg_cron* e rode:
     `select cron.schedule('gerar-tarefas-recorrentes', '5 9 * * *', 'select app.gerar_tarefas_recorrentes()');`
3. Em **Authentication › URL Configuration**, defina *Site URL* com o endereço final do app
   (ex.: `https://tarefas.mdcassessoria.com`) e adicione o mesmo em *Redirect URLs*.
4. Em **Project Settings › API**, copie a *Project URL* e a chave **publishable/anon**.
   Nunca use a chave `service_role` no app.

## 2. App web (Vercel)

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel: *Add New › Project*, escolha o repositório e defina **Root Directory = `web`**.
3. Variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_KEY` = chave publishable/anon
4. Deploy. Opcional: aponte um subdomínio (ex.: `tarefas.mdcassessoria.com`).

Para rodar local: `cd web && cp .env.example .env.local` (preencha) e `npm install && npm run dev`.

## 3. Primeira carga da MDC

1. Abra o app, clique em **Criar conta** com `edvaldo@mdcassessoria.com`.
2. No SQL Editor, rode `seed_mdc.sql` (confira o e-mail no topo do script).
   Isso cria a organização, os 4 setores, você como administrador e 11 obrigações recorrentes de exemplo.
3. Em **Configurações**:
   - **Clientes** › *Importar lista*: cole do Excel `Razão social; CNPJ; regime; nome curto`.
     Depois defina o responsável de cada cliente por setor (as tarefas recorrentes já nascem atribuídas).
   - **Obrigações recorrentes**: revise dias e regimes. Os prazos do seed são **prazos internos de exemplo**
     e antecipam automaticamente em fim de semana e feriado.
   - **Feriados**: inclua os municipais de Bragança Paulista.
   - **Obrigações › Gerar tarefas**: gera na hora a competência escolhida (é idempotente, pode repetir).
4. **Equipe**: cada pessoa cria a conta na tela de login; você a adiciona por e-mail, com papel e setor.

### Papéis

| Papel | Vê | Edita |
|---|---|---|
| Administrador | tudo da organização | tudo, inclusive equipe e identidade |
| Gestor | tudo da organização | tarefas e cadastros |
| Analista | as suas, as do seu setor e as que criou | essas mesmas tarefas |
| Painel TV | tudo (somente leitura) | nada |

## 4. TV

1. Crie a conta `tv@mdcassessoria.com` e adicione-a na Equipe com papel **Painel TV**.
2. Na TV, use um **Chromecast com Google TV** ou **Fire TV Stick** com o app **Fully Kiosk Browser**:
   - *Start URL*: `https://SEU-DOMINIO/tv?org=mdc`
   - Ative *Keep Screen On*, *Autostart on Boot* e *Reload on Network Reconnect*.
3. Faça login uma única vez. A sessão se renova sozinha; o painel escuta o Realtime,
   recarrega os números a cada 60 s como garantia e faz um refresh completo a cada 6 h.

O painel mostra: atrasadas, vencem hoje, próximos 7 dias, em andamento, concluídas no mês
(% no prazo), lista de atenção com rolagem automática, carga por setor, equipe e um letreiro
com as últimas concluídas.

## 5. Oferecer para outros clientes

Qualquer pessoa que criar conta e não pertencer a nenhuma organização vê a tela **Criar organização**.
Ela vira administradora daquela organização, com setores padrão, e configura logo e cores
em *Configurações › Organização e painel*. Os dados de uma organização nunca aparecem para outra
(testado no banco: inserção e leitura cruzadas são bloqueadas pelo RLS).

Próximos passos naturais para a versão comercial: plano/assinatura na tabela `organizacoes`,
convite por e-mail via Edge Function, notificações de atraso (e-mail/WhatsApp) e anexos no Storage.

## O que foi testado

- Migrations aplicadas em Postgres 16 com stubs do Supabase Auth.
- Recorrência: geração idempotente, filtro por regime e meses, ajuste de fim de semana e feriado
  (ex.: prazo 12/10/2026, feriado → antecipado para 09/10).
- RLS: analista, TV, gestor e uma segunda organização, incluindo tentativa de inserir na MDC e de se autopromover.
- Todas as consultas do app executadas via PostgREST com JWT real.
- Build de produção do Next.js e telas renderizadas em desktop, celular e 1920×1080.
