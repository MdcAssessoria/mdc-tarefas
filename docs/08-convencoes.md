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
4. Tela vazia ensina o próximo passo; erro diz o que fazer em português (use `traduzirErro`). Só chegam à pessoa como
   vieram as mensagens do próprio HUB (`raise exception` das funções do banco, código P0001, e `ErroApp`/`new Error`
   do site); erro técnico desconhecido vira "Não foi possível concluir. Tente de novo; se continuar, avise a equipe MDC."
5. Funciona no celular.
6. Componentes prontos: `components/ui/` (Modal, Abas, Aviso, Carregando, EstadoVazio e as peças da 8.3.1), identidade
   em `lib/identidade.ts`, formatos em `lib/formato/`, CPF/CNPJ em `lib/documento.ts`, saudação e fuso em `lib/datas.ts`.
   Não recrie o que já existe.
7. **Proibido `window.confirm`, `window.prompt` e `window.alert`** (feios, sem acessibilidade, bloqueados em alguns
   celulares). Use `JanelaConfirmar` ou `useConfirmar()` (sim/não), `JanelaMotivo` (quando o motivo fica no histórico)
   e `useAviso()` (mensagem). O ESLint avisa (`no-restricted-globals`); vira erro depois que as telas antigas forem trocadas.
8. **Quem pode abrir a tela é a Guarda** (`components/shell/Guarda.tsx`): confere a ferramenta do módulo e o nível da
   aba da rota (`minimo`/`gestor` em `navegacao.ts`; telas sem aba em `TELAS_RESTRITAS`), com uma mensagem padrão.
   A página não repete essa checagem; dentro dela, `pode("<ferramenta do módulo>", nível)` só esconde botões. Cada
   módulo confere a própria ferramenta (Entradas usa `pode("entradas", …)`); `pode("financeiro", "gerir")` só onde o
   banco é estrito (certificado digital da empresa, estoque negativo).
9. Saudação ("Bom dia", "Boa tarde", "Boa noite") sempre por `saudacao(horaNoFuso(org.fuso))`; datas e horas filtradas
   pelo dia da organização com `inicioDoDiaUtc(data, org.fuso)`, nunca `T03:00:00Z` ou `-03:00` fixos.

### 8.3.1 Molde visual das telas de lista (desde o Financeiro v2, 01/11/2026)

Toda tela nova de lista ou relatório segue este molde (já aplicado no Financeiro, Plano de contas, Centros de custo,
Fornecedores e clientes e Relatórios). As peças moram em `components/ui/` (desde 02/11/2026; antes ficavam em
`dominios/financeiro/componentes/Comuns`, que só reexporta enquanto o trabalho paralelo é integrado). **Gestão sem
seletor de empresa (decisão do Edvaldo, 03/11/2026):** Financeiro, Entradas, Saídas, Estoque, Centros de custo, Plano de
contas, Relatórios, Contratos e Fornecedores e clientes cuidam só das rotinas da MDC. A empresa é sempre a própria da
organização (`organizacoes.gestao_cliente_id`), lida por `useClienteGestao()` (ou pela moldura `TelaEmpresa`) de
`dominios/organizacao/componentes/EmpresaEmGestao`; não há campo "Empresa" nem empresa lembrada no navegador. Se
`gestao_cliente_id` estiver vazio, a tela mostra `SemEmpresaGestao` ("A empresa da MDC ainda não foi definida para a
Gestão. Peça ao administrador."). Textos falam "da MDC", não "da empresa escolhida". A Cobrança Ledgra é cobrança de
clientes e continua listando clientes. As peças:

| Peça | Onde | Como usar |
| --- | --- | --- |
| Cabeçalho de página | `components/ui/CabecalhoPagina` | `titulo`, `descricao` (uma frase do que a tela faz) e `acoes` à direita: exportar primeiro, o botão principal (`btn-primario`) por último. No celular as ações descem para baixo do título |
| Cartão de filtros | `components/ui/CartaoFiltros` + `MaisFiltros` | Período e no máximo mais dois campos à vista; o resto em `MaisFiltros` (mostra quantos estão em uso). Passe `ativos` (etiquetas "Situação: Vencidos" com X para tirar) e `aoLimpar` ("Limpar filtros"). Campo de busca leva a classe `campo-largo` |
| Período | `components/ui/FiltroPeriodo` (+ `lib/periodo.ts`) | Este mês, Mês passado, Próximo mês, Últimos 90 dias, Este ano, Escolher datas, Tudo |
| Exportar | `components/ui/BotoesExportar` (+ `lib/arquivos/exportarLista.ts`) | PDF e Excel do que está filtrado; as colunas são definidas uma vez para os dois |
| Indicadores | `components/ui/Indicador` | `icone` é **obrigatório** (tipo `NomeIcone`) e `tom` (verde, vermelho, âmbar, azul, violeta, neutro; mesmos significados do Chip: "A vencer" é azul). Com `aoClicar` vira filtro da lista (`ativo` mostra "Filtrando") |
| Lista | `components/ui/QuadroTabela` | Cabeçalho e total fixos ao rolar, linhas zebradas suaves. No celular cada linha vira cartão: cada `td` leva `data-rotulo="Coluna"`, a célula principal `className="celula-titulo"` (vai para o topo do cartão) e a de botões `celula-acoes`. Tabela de duas colunas pode ficar tabela (`cartoes={false}`) |
| Situação | `components/ui/Chip` (tons em `Tons.ts`) | Chip com bolinha de cor; use o mesmo tom para o mesmo significado (vermelho = vencido/problema, âmbar = atenção/a conciliar, azul = a vencer/previsto, verde = pago/feito, cinza = inativo/cancelado) |
| Dinheiro | `components/ui/Valor` | `brl()` com negativo em vermelho; `sinal` pinta entrada positiva de verde |
| Vazio | `components/ui/EstadoVazio` com `icone` e `titulo` | Ilustração + o que fazer agora + botão da ação (ou "Limpar filtros" quando é o filtro que esvaziou) |
| Carregando | `components/ui/Esqueleto` | Blocos no formato da tela (indicadores + linhas). Mantém "Carregando…" para leitores de tela e para o `npm run telas` |
| Botões | classes `btn` / `btn-primario` + `Icone` | Todo botão de ação tem ícone (`mais`, `editar`, `documento` para PDF, `planilha` para Excel, `transferir`, `check`, `lixeira`, `cancelar`, `olho`, `copiar`, `voltar`, `imprimir`, `atualizar`…). Ícone novo: mesmo traço (24×24, 1,7) em `components/ui/Icone.tsx`; nome inexistente avisa no console em desenvolvimento |
| CNPJ | `components/ui/CampoCnpj` (+ `lib/consultaCnpj.ts`) | Campo com "Buscar dados": consulta a Receita pela BrasilAPI (pública, sem chave) e entrega razão social, endereço, CNAE e sócios para a tela preencher; `ResumoCnpj` mostra o que veio. Usado no Novo processo do Societário e no cadastro de clientes |
| Ordem dos botões | `globals.css` | Em janela ou formulário, o botão principal (Salvar, Confirmar, Criar) aparece **antes** do Cancelar/Voltar (pedido do Edvaldo, 02/11/2026). Uma regra de CSS faz isso em todo rodapé `justify-end`; escreva o rodapé normalmente |
| Confirmar | `components/ui/JanelaConfirmar` / `useConfirmar()` | Sim ou não, em janela acessível; `perigo` deixa o botão vermelho. Com motivo para o histórico: `JanelaMotivo`. Duas ou mais escolhas ("Só para esta empresa" / "Para todas"): `JanelaEscolha` / `useEscolha()` |
| Gráficos | `dominios/financeiro/componentes/GraficosPainel`, `dominios/demonstrativos/componentes/Graficos` | SVG puro nas cores de `demonstrativos/componentes/paletas.ts`; o SVG acompanha a largura do quadro com `lib/useLargura` (viewBox = largura real, letra de 11 px de verdade no celular); rótulos do eixo com `saltoRotulos`; legenda em HTML |

Navegação dos módulos: cada módulo é um item do menu lateral (linha em `hub_apps`); os módulos de gestão (`MODULOS_GESTAO` em `navegacao.ts`: Financeiro, Entradas, Saídas, Estoque, Centros de custo, Plano de contas, Relatórios, Cobrança Ledgra, mais Fornecedores e clientes) ficam juntos no grupo recolhível **Gestão** (02/11/2026), cada um com permissão própria. Desde 02/11/2026 a MDC usa a gestão só para ela mesma; o produto para os clientes é o Ledgra (sistema à parte), e só a cobrança dos assinantes do Ledgra fica no HUB com abas curtas na barra superior
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
