# 8. Convenções e checklist

> **Resumo:** o código é em português (nomes, comentários, mensagens). Cada mudança passa por `npm run verificar`,
> segue as regras de tela para público leigo e termina com uma auditoria independente registrada em `docs/auditoria/`.
> O checklist da seção 8.5 vale para todo módulo novo.

## 8.1 Nomes

| O quê | Regra | Exemplo |
| --- | --- | --- |
| Arquivos e funções TS | português, camelCase | `lerBalancete`, `hojeISO` |
| Componentes React | português, PascalCase | `TarefaEditor`, `PainelResumo` |
| Termos de framework | ficam em inglês | `useEffect`, `props`, `layout` |
| Tabelas | `<prefixo do módulo>_<entidade no plural>` | `soc_processos`, `crm_contratos` |
| Funções RPC | `<prefixo>_<verbo>` | `soc_abrir_processo`, `crm_arquivar` |
| Funções internas | esquema `app`, sem permissão de execução para a API | `app.soc_iniciar_fase` |
| Migrações | `NNN_assunto_curto.sql`, nunca editar depois de aplicada | `020_seguranca_auditoria_2026_10.sql` |
| Colunas de autoria | `criado_por` / `criado_em` (novas tabelas) | |

Prefixos reservados para os módulos futuros: `fin_` (Financeiro), `fis_` (Entradas, Saídas e Fiscal),
`ctb_` (Contabilidade), `hub_pacotes` / `cliente_contratos` (Pacotes).

## 8.2 Commits e branches

- Mensagem em português dizendo **o que mudou e por quê**, primeira linha curta.
- Um assunto por commit (formatação separada de lógica; mover arquivo separado de mudar código).
- Mudança grande: branch + pull request; a verificação do GitHub precisa estar verde.

## 8.3 Regras de tela (obrigatórias)

Todo o HUB é pensado para **público leigo e de pouco conhecimento técnico**, com **boa aparência** e **uso intuitivo**:

1. Linguagem do dia a dia ("Dinheiro que entrou", "Contas a pagar"); termo técnico só com explicação ao passar o mouse.
2. Filtros fáceis: período em um clique (Este mês, Mês passado, Últimos 3 meses, Este ano, Escolher datas),
   no máximo três filtros à vista, o resto em "Mais filtros", e "Limpar".
3. Exportar sempre em **PDF** (papel timbrado da MDC) e **Excel** (formatado, valores como número) exatamente o que está na tela.
4. Tela vazia ensina o próximo passo; erro diz o que fazer em português (use `traduzirErro`).
5. Funciona no celular.
6. Componentes prontos: `components/ui/` (Modal, Abas, Aviso, Carregando, EstadoVazio), identidade em `lib/identidade.ts`,
   formatos em `lib/formato/`. Não recrie o que já existe.

### 8.3.1 Molde visual das telas de lista (desde o Financeiro v2, 01/11/2026)

Toda tela nova de lista ou relatório segue este molde (já aplicado no Financeiro, Plano de contas, Centros de custo,
Fornecedores e clientes e Relatórios). As peças:

| Peça | Onde | Como usar |
| --- | --- | --- |
| Cabeçalho de página | `components/ui/CabecalhoPagina` | `titulo`, `descricao` (uma frase do que a tela faz) e `acoes` à direita: exportar primeiro, o botão principal (`btn-primario`) por último. No celular as ações descem para baixo do título |
| Cartão de filtros | `components/ui/CartaoFiltros` + `MaisFiltros` | Empresa, período e no máximo mais um ou dois campos à vista; o resto em `MaisFiltros` (mostra quantos estão em uso). Passe `ativos` (etiquetas "Situação: Vencidos" com X para tirar) e `aoLimpar` ("Limpar filtros"). Campo de busca e seletor de empresa levam a classe `campo-largo` |
| Indicadores | `Indicador` em `dominios/financeiro/componentes/Comuns` | Sempre com `icone` e `tom` (verde, vermelho, âmbar, azul, violeta, neutro). Com `aoClicar` vira filtro da lista (`ativo` mostra "Filtrando") |
| Lista | `components/ui/QuadroTabela` | Cabeçalho e total fixos ao rolar, linhas zebradas suaves. No celular cada linha vira cartão: cada `td` leva `data-rotulo="Coluna"`, a célula principal `className="celula-titulo"` (vai para o topo do cartão) e a de botões `celula-acoes`. Tabela de duas colunas pode ficar tabela (`cartoes={false}`) |
| Situação | `Chip` em `Comuns` | Chip com bolinha de cor; use o mesmo tom para o mesmo significado (vermelho = vencido/problema, âmbar = atenção/a conciliar, azul = a vencer/previsto, verde = pago/feito, cinza = inativo/cancelado) |
| Dinheiro | `Valor` em `Comuns` | `brl()` com negativo em vermelho; `sinal` pinta entrada positiva de verde |
| Vazio | `components/ui/EstadoVazio` com `icone` e `titulo` | Ilustração + o que fazer agora + botão da ação (ou "Limpar filtros" quando é o filtro que esvaziou) |
| Carregando | `components/ui/Esqueleto` | Blocos no formato da tela (indicadores + linhas). Mantém "Carregando…" para leitores de tela e para o `npm run telas` |
| Botões | classes `btn` / `btn-primario` + `Icone` | Todo botão de ação tem ícone (`mais`, `editar`, `documento` para PDF, `planilha` para Excel, `transferir`, `check`…) |
| Gráficos | `dominios/financeiro/componentes/GraficosPainel` | SVG puro nas cores de `demonstrativos/componentes/paletas.ts`; o SVG acompanha a largura do quadro (letra legível no celular) |

Navegação dos módulos: cada módulo é um item do menu lateral (linha em `hub_apps`) com abas curtas na barra superior
(`components/shell/navegacao.ts`). Módulo com muitas telas junta as parecidas num grupo (`grupo` no link): no computador
vira aba com menu suspenso ("Bancos ▾"), no celular um botão "Você está em … · Telas" que abre todas as telas por grupo.

## 8.4 Regras de código

- Lista que pode crescer além de 1.000 linhas: leia com `lerTudo` (lib/lerTudo.ts), nunca com `.limit()` alto; o Supabase corta em 1.000 sem avisar.
- Leitura de dados com o hook `useConsulta`; gravação sempre lendo o `error` (use `exigir()`), nunca promessa solta.
- Datas "de hoje" sempre com `hojeISO(org.fuso)`; nunca `new Date().toISOString().slice(0, 10)`.
- Dinheiro com `brl()` de `lib/formato/moeda.ts`.
- Cálculo que vira documento (PDF assinado, guia, lançamento) roda no servidor, não só na tela (ADR 0003).
- Função pura nova (cálculo, leitura de arquivo, formatação) vem com teste em `*.test.ts` ao lado.
- Arquivo com mais de ~400 linhas é sinal para dividir.

## 8.5 Checklist de módulo novo

- [ ] Desenho em `docs/futuro/` aprovado pelo Edvaldo e decisão registrada em `docs/decisoes/` se houver escolha de arquitetura.
- [ ] Migração com tabelas prefixadas, `org_id`, RLS com `app.hub_pode`/`app.portal_pode`, gatilho `cliente_mesma_org`,
      índices `(org_id, cliente_id, ...)`, `comment on` em tudo e travas no banco para regras que não podem ser quebradas.
- [ ] Linha em `hub_apps` e perfis padrão atualizados.
- [ ] Tipos do banco regenerados (`web/src/lib/database.types.ts`).
- [ ] Telas seguindo a seção 8.3; relatórios no molde único.
- [ ] Testes das funções puras; `npm run verificar` e `npm run telas` verdes.
- [ ] Validado com os clientes do grupo **Piloto HUB** (MDC e Greencore).
- [ ] Documentação: capítulo do módulo em `docs/modulos/` (telas, tabelas, funções, diagrama) e mapa de automações (6.4) atualizado.
- [ ] Auditoria independente: só quando o Edvaldo pedir (seção 8.6).

## 8.6 Rotina de auditoria

**Desde 01/11/2026 a auditoria independente roda só quando o Edvaldo pedir** (decisão dele, para o projeto andar
mais rápido). Antes disso, toda implementação terminava com auditoria. As verificações automáticas (seção acima)
continuam obrigatórias em toda publicação. Quando a auditoria for pedida:

1. Quem implementou (pessoa ou IA) **não** se audita. A auditoria é feita pelo agente `auditor-hub`
   (definido em `.claude/agents/auditor-hub.md`), que lê o código sem saber o que foi planejado.
2. Como pedir: no Claude, dentro deste repositório, diga **"rodar a auditoria do HUB"** (skill `auditoria-hub`,
   em `.claude/skills/auditoria-hub/SKILL.md`). A skill define o escopo (o que mudou desde o último parecer),
   o que verificar (segurança, manutenção, documentação, regras de tela) e o formato do parecer.
3. O parecer é salvo em `docs/auditoria/AAAA-MM-DD-parecer.md` e listado em [`auditoria/README.md`](auditoria/README.md).
   Achados críticos e altos viram correção antes de liberar a funcionalidade aos clientes.
4. A **auditoria semanal agendada** (segunda-feira de manhã) foi **pausada** em 01/11/2026 junto com essa mudança;
   pode ser religada nas tarefas agendadas do Claude quando o Edvaldo quiser.
