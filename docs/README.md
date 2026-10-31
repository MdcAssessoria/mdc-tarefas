# Documentação técnica do HUB-MDC

Esta pasta é o manual de quem vai **manter ou evoluir** o HUB-MDC, o hub de sistemas da MDC Assessoria Contábil.
Leia na ordem abaixo; cada capítulo começa com um resumo de três linhas.

| # | Capítulo | Você sai sabendo |
| --- | --- | --- |
| 1 | [Visão geral](01-visao-geral.md) | O que o HUB faz, quem usa, quais módulos existem e com o que ele conversa |
| 2 | [Arquitetura](02-arquitetura.md) | As peças (navegador, Vercel, Cloudflare, Supabase) e como um clique vira dado gravado |
| 3 | [Estrutura do código](03-estrutura-do-codigo.md) | Onde fica cada coisa no repositório e o padrão de uma tela |
| 4 | [Banco de dados](04-banco-de-dados.md) | Tabelas por domínio, diagramas, funções e como achar a versão atual |
| 5 | [Segurança e acessos](05-seguranca-e-acessos.md) | Papéis, perfis, RLS, convite e as regras que não podem ser quebradas |
| 6 | [Fluxos importantes](06-fluxos.md) | Balancete, tarefas recorrentes, Societário, Portal, automações escondidas |
| 7 | [Como rodar e publicar](07-como-rodar-e-publicar.md) | Rodar local, verificar, migrar banco, publicar funções e o site |
| 8 | [Convenções e checklist](08-convencoes.md) | Regras de nome, de commit, de tela para público leigo e o checklist de módulo novo |
| 9 | [Glossário](09-glossario.md) | Termos contábeis e técnicos usados no código |

Outras pastas:

- [`auditoria/`](auditoria/) — pareceres técnicos de cada auditoria (o mais recente no topo do [índice](auditoria/README.md)).
- [`decisoes/`](decisoes/) — registro de decisões de arquitetura (por que escolhemos X e não Y).
- [`futuro/`](futuro/) — desenho dos módulos ainda não construídos (Financeiro, Entradas, Saídas, Fiscal, Contabilidade, Pacotes).
- [`imagens/`](imagens/) e [`diagramas/`](diagramas/) — os diagramas em PNG e a fonte em Mermaid (`.mmd`).

> Os diagramas são escritos em Mermaid dentro dos próprios arquivos `.md`; o GitHub desenha sozinho.
> Para gerar as imagens PNG de novo: `mmdc -i docs/diagramas/<nome>.mmd -o docs/imagens/<nome>.png -b white -w 1400`.
