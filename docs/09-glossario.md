# 9. Glossário

| Termo | Significado no HUB |
| --- | --- |
| **Organização** (`organizacoes`) | Empresa que usa o HUB. Hoje só a MDC. Tudo é separado por `org_id`. |
| **Membro** | Pessoa da equipe da organização (`membros`). Papel: admin, gestor, analista ou tv. |
| **Perfil** | Conjunto de ferramentas e níveis (ver, operar, gerir) dado a uma pessoa da equipe. |
| **Ferramenta / app** | Módulo do HUB (`hub_apps.slug`): tarefas, societario, demonstrativos... |
| **Usuário do portal** | Pessoa do cliente com acesso ao Portal (`portal_usuarios`), uma linha por empresa. |
| **RLS** | *Row Level Security*: regra do Postgres que filtra linha por linha o que cada login pode ver/alterar. |
| **RPC** | Função do banco chamada pela tela (`supabase().rpc(...)`), com regra de negócio dentro. |
| **Função Edge** | Pequeno programa (Deno) no Supabase para tarefas com segredo: convite, certificado, PDF. |
| **Competência** | Mês de referência de uma obrigação ou balancete (ex.: 2026-09). |
| **Regime** | Enquadramento tributário do cliente: Simples, Presumido, Real, MEI, imune/isenta, PF. |
| **Segmento / grupos** | Ramo do cliente (comércio, indústria...) e etiquetas livres (ex.: "Grupo Greencore", "Piloto HUB"). |
| **Obrigação recorrente** | Modelo que gera uma tarefa todo mês para cada cliente que se encaixa (`modelos_recorrentes`). |
| **Domínio** | Sistema contábil oficial da MDC (Thomson Reuters). Fonte da carteira e dos balancetes. |
| **Balancete** | Saldos de todas as contas num período. Importado do Excel do Domínio. |
| **Classificação** | Código hierárquico da conta (ex.: 1.1.1.02). Usado para agrupar nas demonstrações. |
| **Grupo (demonstrativos)** | Agrupamento da conta para o Balanço/DRE (ex.: "Disponível", "Fornecedores"). Mapa em `portal_mapa_contas`. |
| **BP / DRE / DFC** | Balanço Patrimonial, Demonstração do Resultado, Demonstração dos Fluxos de Caixa. |
| **Índices** | Liquidez, endividamento, margens, prazos médios (PMR, PMP, PME, PMV), ciclos, carga tributária. |
| **Fragilidades / alertas** | Pontos de atenção calculados a partir dos índices e conferências. |
| **Parecer** | Texto técnico do contador que acompanha o balancete publicado. |
| **Publicar** | Tornar visível ao cliente no Portal. Só quem **gere** Demonstrativos publica. |
| **Certificado A1** | Certificado digital ICP-Brasil em arquivo; assina os PDFs. Fica no Cofre (Vault). |
| **Processo societário** | Abertura, alteração ou baixa de empresa, acompanhada fase a fase. |
| **Exigência** | Pendência apontada por Junta, Receita ou prefeitura num processo. |
| **Vencimento** | Item com data de validade (certificado, alvará, procuração) com avisos automáticos. |
| **Oportunidade / lead** | Possível cliente no CRM. Lead vindo do Simulador de Regime. |
| **Piloto HUB** | Grupo de clientes de teste (MDC e Greencore) usado para validar novidades. |
