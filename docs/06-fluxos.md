# 6. Fluxos importantes

> **Resumo:** quatro fluxos concentram quase toda a regra de negócio: o balancete (Demonstrativos → Portal),
> as tarefas recorrentes do mês, o Societário (que cria tarefas e mexe em clientes) e o Atendimento.
> Muitas coisas acontecem **sozinhas no banco** (gatilhos e agendador); o mapa da seção 6.4 mostra todas.

## 6.1 Balancete: do Excel do Domínio ao Portal do cliente

```mermaid
sequenceDiagram
    actor A as Analista
    participant T as Tela Importar balancete
    participant L as dominios/demonstrativos/balancete (navegador)
    participant DB as Banco
    participant EF as Função demonstrativo-pdf
    actor C as Cliente
    A->>T: escolhe cliente, competência e o Excel do Domínio
    T->>L: lerBalancete → classificar (mapa de contas) → analisar
    L-->>T: resumo, índices, alertas, conferências, BP/DRE/DFC
    T->>DB: grava portal_balancetes (rascunho) + linhas
    A->>T: revisa painel, escreve parecer
    A->>DB: portal_publicar_balancete (só quem gere Demonstrativos)
    DB-->>C: aparece no Portal (aviso no sino)
    C->>EF: baixa o PDF
    EF->>DB: lê com o login do cliente (RLS)
    EF->>EF: assina com o certificado A1 do Cofre
    EF-->>C: PDF assinado
```

Regras: balancete publicado e suas linhas não mudam (gatilhos `publicacao_protegida` e
`linhas_balancete_protegidas`); para corrigir, despublique, ajuste e publique de novo.

## 6.2 Tarefas recorrentes do mês

```mermaid
flowchart LR
    CRON[pg_cron todo dia 06h05] --> G[app.gerar_tarefas_recorrentes]
    BOT[Botão Gerar tarefas<br/>Configurações] --> GC[gerar_competencia]
    GC --> G
    G --> M{Para cada modelo ativo<br/>e cada cliente que se encaixa<br/>regime · segmento · grupo}
    M --> P[prazo = dia do modelo<br/>ajustado para dia útil<br/>app.vencimento + feriados]
    P --> R[responsável = cliente_responsaveis<br/>do setor do modelo]
    R --> T[(tarefas)]
```

É idempotente: rodar de novo para a mesma competência não duplica tarefas.

## 6.3 Societário: uma tarefa concluída avança o processo

```mermaid
flowchart TB
    A[Tarefa da fase concluída] -->|gatilho tarefas_fase_societario| B[soc_mudar_fase]
    B --> C{Última fase?}
    C -- não --> D[app.soc_iniciar_fase<br/>cria a tarefa da próxima fase]
    C -- sim --> E[soc_concluir_processo]
    E -->|abertura| F[cria o cliente no cadastro]
    E -->|baixa| G[inativa o cliente<br/>app.aplicar_inativacao]
    G -->|gatilho clientes_inativo_venc| H[encerra os vencimentos do cliente]
    G --> I[cancela tarefas futuras]
```

Concluir uma **baixa** (que inativa o cliente) é só para gestor ou administrador.

## 6.4 Mapa de automações (o que acontece sem ninguém clicar)

| Gatilho ou agenda | Quando | O que faz |
| --- | --- | --- |
| pg_cron `gerar-tarefas-recorrentes` | Todo dia 06h05 | Gera as tarefas do mês |
| pg_cron `avisar-vencimentos` → `app.venc_avisar` | Todo dia 06h15 | Avisos de vencimento 60/30/7 dias no sino |
| `tarefas_historico` | Toda mudança de tarefa | Grava o histórico |
| `tarefas_fase_societario` | Tarefa de fase concluída | Avança o processo societário |
| `clientes_inativo_venc` | Cliente inativado | Encerra os vencimentos dele |
| `crm_op_etapa` | Oportunidade muda de etapa | Registra a data da etapa |
| `membros_perfil`, `hub_perfis_propagar` | Perfil trocado ou editado | Regrava os acessos da pessoa |
| `aplicar_convites`, `aplicar_convites_portal` | Conta criada pelo convite | Liga a conta à organização ou ao cliente |
| `portal_usuario_nao_equipe` | Acesso de portal criado ou mudado | Impede equipe como usuário do portal e audita |
| Simulador (projeto separado) → `crm_receber_lead` | Lead preenchido no site | Cria a oportunidade no CRM |

## 6.5 Atendimento: conversa vira tarefa

O cliente abre uma conversa no Portal (`portal_abrir_conversa`); a equipe responde em `/atendimento`. Se o pedido
der trabalho, o botão "virar tarefa" chama `portal_conversa_para_tarefa`, que cria a tarefa ligada à conversa e
avisa o cliente com uma mensagem de sistema.
