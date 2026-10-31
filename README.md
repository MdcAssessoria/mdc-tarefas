# HUB-MDC

Hub de sistemas da **MDC Assessoria Contábil**: tarefas e rotinas da equipe, societário, demonstrativos
contábeis, atendimento, vencimentos, CRM comercial e o **Portal do Cliente**, num único login com acesso por perfil.

- Endereço: `https://mdcassessoria.com/hub-mdc` (também `https://mdc-tarefas.vercel.app/hub-mdc`)
- Tecnologia: Next.js 16 (navegador, Vercel) · Supabase (Postgres com RLS, login, arquivos, Funções Edge) · Cloudflare

```
mdc-tarefas/
├── web/                 site (telas) — Next.js
├── supabase/
│   ├── migrations/      banco: tabelas, regras de acesso, funções (aplicadas em ordem)
│   ├── functions/       Funções Edge: convite, certificado, demonstrativo-pdf
│   └── templates/       e-mails de convite e troca de senha
├── infra/cloudflare/    endereço mdcassessoria.com/hub-mdc
├── scripts/             utilitários (cópia do cálculo do balancete para a função de PDF)
├── docs/                documentação técnica, decisões e pareceres de auditoria  ← comece aqui
└── .claude/             agente auditor e rotina de auditoria
```

**Comece pela documentação:** [`docs/README.md`](docs/README.md).
Rodar e publicar: [`docs/07-como-rodar-e-publicar.md`](docs/07-como-rodar-e-publicar.md).
Regras para quem for mexer no código: [`CLAUDE.md`](CLAUDE.md) e [`docs/08-convencoes.md`](docs/08-convencoes.md).
