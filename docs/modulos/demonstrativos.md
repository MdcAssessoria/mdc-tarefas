# Módulo Demonstrativos

> **Resumo:** a equipe importa o balancete do Domínio (um arquivo ou vários de uma vez), o HUB calcula balanço, DRE,
> DFC, índices e fragilidades, a equipe revisa e publica, e o cliente vê no Portal. A análise pode ser vista por mês,
> trimestre, semestre ou ano do calendário, com comparação ao mesmo período do ano anterior.

## 1. Telas

| Endereço | Quem usa | O que faz |
| --- | --- | --- |
| `/demonstrativos` | Equipe | Lista de balancetes por cliente e competência; reprocessar rascunhos |
| `/demonstrativos/importar` | Equipe (operar) | Importa **um** arquivo (revisão conta a conta antes de gravar) ou **vários** de uma vez (lote) |
| `/demonstrativos/[id]` | Equipe | Análise do cliente: Painel, Balanço/DRE/DFC, Balancete, Índices, Fragilidades, Parecer; publicar |
| `/demonstrativos/riscos` | Equipe | Riscos da carteira (fragilidades de todos os clientes) |
| `/demonstrativos/certificado` | Administrador | Certificado A1 usado para assinar o PDF |
| `/portal` (abas Resumo, Balanço/DRE/DFC, Balancete, Índices, Parecer) | Cliente | Só os balancetes publicados |

Código: regras em `web/src/dominios/demonstrativos/` (leitura e cálculos em `balancete/`, `calculosDemonstracoes.ts`,
`periodos.ts`, `selecaoPeriodo.ts`, `importacaoLote.ts`, gravação em `repositorio.ts`, peças de tela em `componentes/`);
pedaços da tela de importação em `web/src/app/(hub)/demonstrativos/importar/_componentes/`.

## 2. Visão por período

No topo da análise (equipe: abas Painel, Balanço/DRE/DFC e Índices; Portal: todas as abas) ficam três escolhas:
**Ano** (só anos com balancete) · **Visão** (Mês, Trimestre, Semestre, Ano) · **Qual período** (jan…dez,
1º–4º trimestre, 1º–2º semestre, ano inteiro). A visão fica lembrada no navegador; ano e período começam no
período que contém o balancete aberto (equipe) ou no último com dado (Portal).

| Regra | Onde |
| --- | --- |
| Períodos fixos do calendário: jan–mar = 1º trimestre, jan–jun = 1º semestre, ano = todos os meses | `selecaoPeriodo.ts` (`mesesDoPeriodo`) |
| DRE e DFC somam os meses; balanço é o do último mês importado contra a abertura do primeiro | `periodos.ts` (`agregar`), chamado por `selecionar` |
| Índices: margens e carga sobre a DRE do período; liquidez e endividamento no fechamento; prazos pela média dos meses | `periodos.ts` (regras de antes, sem mudança) |
| Completude em linguagem simples: "3 de 3 meses importados", "2 de 3 meses importados · falta mar/2024" | `selecionar` |
| Comparação com o mesmo período do ano anterior quando ele existe (KPIs, DRE, DFC, PDF e Excel do período) | `mesmoPeriodoAnoAnterior` |
| Opção sem dado aparece desabilitada com o porquê | `opcoesDoAno`, `visoesDoAno` |
| Balancete **acumulado** (vários meses num arquivo, ex.: jan–dez de MDC e Greencore): é usado direto no menor período do calendário que o contém (jan–dez → Ano; jan–mar → 1º trimestre). Mês/Trimestre/Semestre cobertos só por ele ficam indisponíveis: "este cliente enviou o balancete do ano inteiro de uma vez" | `ehAcumulado`, `selecionar` |

Exportação:
- **Baixar PDF · <período>** (`componentes/BotaoPdf.tsx` → Função Edge `demonstrativo-pdf`): o PDF **completo** (capa,
  termômetro, balanço, DRE, DFC, índices, pontos de atenção e balancete de verificação) **do período escolhido**, assinado
  com o certificado A1 quando tudo o que entra nele está publicado. O botão manda só a escolha (ano, visão, número); o
  servidor refaz o período com as mesmas regras da tela (`selecaoPeriodo.ts`, `periodos.ts`, `linhasPeriodo.ts`, copiados
  pelo `scripts/sync-funcoes.sh`) **usando só meses publicados**, para ninguém conseguir mandar números próprios para um
  documento assinado. Mês único = PDF daquele mês (com acumulado do ano); trimestre/semestre/ano = coluna de comparação
  com o mesmo período do ano anterior, balancete do período (abertura do 1º mês, movimento somado, fechamento do último)
  e sem parecer (o parecer é mensal). Regra única para tela e servidor (`pdfPeriodo.ts`):
  - **completo** (todos os meses do período publicados): sai assinado;
  - **parcial** (só faltam os últimos meses): sai **sem assinatura**, com selo "período parcial" e "-parcial" no nome;
  - **lacuna** (falta mês publicado no meio ou no começo): não gera, porque caixa e balancete não fechariam; o botão
    fica desligado e diz o que publicar (no Portal: "fica disponível quando a MDC concluir …").
  - A coluna de comparação com o ano anterior só aparece quando os dois períodos estão completos.
  - Limitação conhecida: empresa aberta no meio do ano cai em "lacuna" no PDF anual do primeiro exercício.
- **Excel do período** (`componentes/ExportarPeriodo.tsx`): planilha no navegador com os valores como número.

```mermaid
flowchart LR
    H[(portal_balancetes<br/>do cliente)] --> A{Ano · Visão · Qual período}
    A --> S[selecionar]
    S -->|há acumulado do período| AC[usa o acumulado direto]
    S -->|balancetes mensais| AG[agregar: soma DRE e DFC,<br/>balanço do último mês,<br/>índices do período]
    AC --> P[Painel · Demonstrações · Índices]
    AG --> P
    S --> C[completude:<br/>3 de 3 meses / falta mar]
    A --> ANT[mesmo período<br/>do ano anterior] --> P
    P --> X[PDF e Excel do período<br/>no navegador]
    S --> B[balancete-base = último mês] --> PDF[PDF assinado<br/>demonstrativo-pdf]
```

## 3. Importação em lote

```mermaid
sequenceDiagram
    actor A as Analista
    participant T as Importar balancete
    participant L as importacaoLote.ts + leitor
    participant R as repositorio.ts (salvarBalancete)
    participant DB as Banco
    A->>T: arrasta vários Excel (várias empresas e meses)
    T->>L: lerBalancete em cada arquivo
    L-->>T: empresa (CNPJ ou código Domínio), competência, período (mês ou acumulado)
    T->>DB: balancetes já gravados da organização (cliente, competência, situação)
    T-->>A: lista: arquivo · empresa · competência · situação
    A->>T: escolhe empresa não reconhecida, marca "substituir rascunho"
    A->>T: Importar todos
    loop um arquivo por vez (barra de progresso)
        T->>R: classificar com o mapa da empresa + salvarBalancete
        R->>DB: grava rascunho + linhas
    end
    T-->>A: resumo por empresa (entrou / ficou de fora + motivo), PDF e Excel
```

Situações de cada arquivo: **Pronto**, **Pronto · substitui o rascunho**, **Empresa não encontrada** (escolha na lista),
**Falta a competência**, **Já existe (rascunho)** (marque "Substituir"), **Já publicado** (nunca substitui: despublique
antes), **Repetido neste lote**, **Arquivo ilegível** (com o motivo do leitor). Só os prontos são gravados.
Um arquivo só continua na revisão detalhada de sempre (grupos conta a conta, conferências e prévia).

## 3b. Pasta do SharePoint (agente automático)

Configurado em **Configurações › Integrações** (só administrador): endereço do site, biblioteca e pasta, gravados em
`hub_integracoes` (nada fica no código). A cada 15 minutos o `pg_cron` (`agente-balancetes`) chama a Função Edge
`balancete-agente`, que para cada arquivo da pasta:

1. lê com o SheetJS 0.20.3 e as **mesmas regras da tela** (cópias em `supabase/functions/balancete-agente/nucleo/`,
   geradas por `scripts/sync-funcoes.sh` a partir de `web/src`: leitura, classificação, `analise.ts`, reconhecimento da empresa);
2. reconhece a empresa (CNPJ ou código do Domínio) e a competência; classifica com as regras salvas;
3. grava o **rascunho** pela mesma função do banco da tela (`portal_gravar_balancete`, origem `pasta`), numa transação só;
4. move o arquivo para **Processados** ou **Com problema** e registra em `hub_importacoes`;
5. avisa no sino os administradores e gestores.

Nunca publica e nunca substitui mês publicado nem rascunho existente (ficam "para revisar", com o motivo). O acesso à
Microsoft é um aplicativo do Entra ID com `Sites.Selected` (só aquele site); segredos `MS_TENANT_ID`, `MS_CLIENT_ID`,
`MS_CLIENT_SECRET` nos segredos da função. Passo a passo do TI: [`infra/microsoft-365/README.md`](../../infra/microsoft-365/README.md).
A chamada do agendador usa um token gerado pelo próprio banco e guardado no Vault (`agente_balancete_token`).

**Histórico de importações** (`/demonstrativos/importacoes`): tudo o que chegou (um arquivo, lote ou pasta), com filtros
de período, porta e resultado, e exportação em PDF e Excel.

## 4. Tabelas usadas

| Tabela | Uso no módulo |
| --- | --- |
| `portal_balancetes` | Um registro por cliente e competência (resumo, índices, alertas, conferências, demonstrações, `periodo_inicio`/`periodo_fim`, situação rascunho/publicado) |
| `portal_balancete_linhas` | Contas do balancete importado |
| `portal_mapa_contas` | Regra conta → grupo (padrão da organização ou do cliente) |
| `portal_mapa_dfc` | Regra conta → linha da DFC |
| `portal_pareceres` | Parecer técnico por balancete, com versões |
| `hub_integracoes` | Configuração da pasta do SharePoint (só administrador) |
| `hub_importacoes` | Histórico de importações (arquivo, lote, pasta) |

Detalhes de colunas e travas no [capítulo 4](../04-banco-de-dados.md); o fluxo até o Portal na [seção 6.1](../06-fluxos.md#61-balancete-do-excel-do-domínio-ao-portal-do-cliente).

## 5. Limitações conhecidas

- Na tela, o cálculo ainda roda no navegador (o agente da pasta já calcula no servidor, com as mesmas regras); cada
  balancete é gravado numa transação só, mas o lote grava arquivo a arquivo: se a conexão cair no meio, os que já foram
  ficam gravados e o resumo mostra o resto.
- O PDF de trimestre, semestre ou ano não traz parecer técnico nem comentário do contador (os dois são mensais); os
  pontos de atenção são os do último mês do período.
- Período com mês faltando soma só os meses importados (a completude avisa); o balanço é o do último mês importado.
- Prazos médios do período são a média simples dos meses (regra de `periodos.ts`).
- Balancete acumulado que não começa em janeiro é tratado a partir de janeiro do ano da competência.
- Na tela da equipe as abas Balancete, Fragilidades e Parecer continuam sendo do arquivo aberto, não do período.
- O agente lê até 8 arquivos por organização a cada 15 minutos; o resto entra na rodada seguinte.
