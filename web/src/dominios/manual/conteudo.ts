// Texto do Manual do HUB-MDC, lido pela tela /manual (aberta a todos os usuários da equipe) e pelo PDF do manual.
// Formato: "## Área", "### Tela (Seção → Tela)", parágrafos, listas (- e 1.), tabelas (| … |) e imagens
// ![texto](/manual/arquivo.webp) com o arquivo em web/public/manual. O caminho "(Seção → Tela)" usa os nomes do menu
// (components/shell/navegacao.ts): com ele a tela do manual ganha o botão "Ir para a tela".
// Mudou uma tela ou regra? Atualize o trecho dela aqui no mesmo commit e acrescente uma linha em "Controle de versões".

export const VERSAO_MANUAL = { numero: "1.2", data: "19/11/2026" };

export const MANUAL_MD = `
## Como usar este manual

Cada capítulo cobre uma ferramenta do menu lateral do HUB. Para cada tela há para que ela serve, o que tem nela e o passo a passo das rotinas.

- Os nomes em **negrito** são exatamente os que aparecem na tela.
- O título de cada tela mostra o caminho no menu: **Seção → Tela**.
- **Quem usa** diz qual acesso a pessoa precisa. Se faltar uma ferramenta ou um botão, peça ao administrador em **Pessoas e acessos**.
- **Atenção** lista as regras que o HUB trava, para evitar erro.
- **Para achar uma explicação**, escreva a dúvida do seu jeito na pesquisa do Manual: "esqueci a senha", "dar acesso a uma pessoa", "mudar o prazo". O HUB ignora palavras como "como", "onde" e "para", entende plural e verbo e palavras do dia a dia (apagar = excluir; planilha = Excel).
- Em cada tela do manual, o botão **Ir para a tela** abre a tela de verdade (aparece só para quem tem acesso a ela).
- O manual inteiro ou só uma área sai em **PDF** pelos botões do topo.

O HUB-MDC reúne num único login as ferramentas da MDC Assessoria: tarefas e rotinas por cliente, societário, demonstrativos, atendimento, vencimentos, comercial, contratos e licenças, e o Portal do Cliente. Cada pessoa vê só as ferramentas que o acesso dela libera.

## Primeiro acesso

O acesso ao HUB é só pelo administrador: ninguém cria conta sozinho. O administrador cadastra a pessoa com uma senha provisória e ela troca a senha no primeiro login.

**Quem usa:** todos os usuários.

### Entrar no HUB

**Endereço oficial:** **hub.mdcassessoria.com/hub-mdc**. Use sempre este endereço (salve nos favoritos ou instale o app).

1. Abra o link recebido do administrador pelo WhatsApp.
2. Escreva o **e-mail** e a **senha provisória** e toque em **Entrar**.
3. O HUB pede para você criar a sua senha: de 8 a 72 caracteres, sem espaço no começo nem no fim.
4. Pronto: a partir daí entre sempre com o e-mail e a sua senha.

**Esqueci a senha:** peça ao administrador uma senha provisória nova (Pessoas e acessos → **Redefinir senha**). Ela chega pelo WhatsApp e você troca no primeiro login.

### Instalar o HUB no computador ou no celular

No menu lateral, **Instalar app** põe o HUB como aplicativo, com o ícone da MDC. No Chrome e no Edge (computador e Android) a instalação é com um toque; no iPhone o botão mostra o passo a passo do Safari (Compartilhar › Adicionar à Tela de Início). O botão some quando o HUB já está instalado.

## O que vale em todas as telas

- **Menu lateral:** cada ferramenta abre as telas dela logo abaixo do nome. Arraste a borda do menu para deixá-lo mais largo ou mais estreito; dois cliques na borda voltam ao tamanho padrão. **Recolher menu** deixa só os ícones.
- **Busca rápida (Ctrl K ou ⌘ K):** leva a ferramentas, telas e clientes digitando parte do nome, do CNPJ ou do código.
- **Sino:** avisos do HUB para você (tarefa atribuída, mensagem do cliente, vencimentos).
- **Excel e PDF:** as listas têm os botões para baixar exatamente o que está filtrado na tela.
- **Nada se apaga sem rastro:** cancelar, inativar ou retirar pede o motivo, e o motivo fica no histórico.
- **Rascunho automático:** se a página recarregar no meio de um cadastro (internet caiu, saiu versão nova), o HUB oferece **Recuperar** o que foi digitado.
- **Saiu uma versão nova:** aparece um aviso no topo com **Atualizar agora**. Sem janela aberta, o HUB atualiza sozinho.

## Tarefas

Tarefas e rotinas mensais da equipe por cliente: o que está atrasado, o que vence hoje e o que já foi feito.

**Quem usa:** toda a equipe com a ferramenta Tarefas. O analista vê as tarefas dele, as que criou e as do setor dele; gestores e administradores veem todas.

### Tarefas (Tarefas → Tarefas)

**Para que serve:** acompanhar e tocar o trabalho do dia, por cliente, setor e responsável.

**O que tem na tela:**

- Cartões **Atrasadas**, **Vencem hoje** e **Próximos 7 dias**: toque num cartão para filtrar a lista.
- **Buscar** (tarefa, cliente ou CNPJ), **Situação**, **Setor**, **Responsável** e **Mais filtros** (cliente, competência, prioridade).
- **Forma de ver:** **Lista** ou **Quadro** (colunas por situação).
- Botões de **Excel** e **PDF** do que está filtrado e **Nova tarefa**.
- **Ao vivo:** a lista se atualiza sozinha quando alguém da equipe muda uma tarefa.

**Situações de uma tarefa:** A fazer → Em andamento → Aguardando → Concluída. **Cancelada** só pelo botão **Cancelar tarefa**, com motivo.

### Criar uma tarefa para um cliente

1. Toque em **Nova tarefa**.
2. Escreva o **Título** (obrigatório) e, se quiser, a **Descrição**.
3. Deixe **Um cliente** marcado e escolha o **Cliente** (ou "Interna / sem cliente").
4. Escolha **Setor**, **Responsável**, **Prazo**, **Competência**, **Prioridade** e **Situação**.
5. Com cliente escolhido aparece o quadro **Portal do Cliente**: diga se a tarefa aparece para o cliente e o que ele precisa enviar.
6. Toque em **Salvar**.

### Criar a mesma tarefa para vários clientes de uma vez

Use quando a mesma rotina vale para muitos clientes (ex.: "Enviar informe de rendimentos", "Conferir DCTFWeb de outubro"). Em vez de criar uma tarefa por vez, o HUB cria uma tarefa para cada cliente marcado.

1. Toque em **Nova tarefa** e escreva o **Título**.
2. Em cima do campo de cliente, toque em **Vários clientes**.
3. Encontre os clientes: escreva no **Procurar** (nome, CNPJ ou código do Domínio) e use os filtros **Regime** e **Grupo**. Exemplo: Regime "Lucro Real" mostra só os clientes do Real.
4. Marque um a um ou toque em **Marcar os N mostrados** para marcar todos os que estão na lista. **Desmarcar todos** limpa a escolha. O contador mostra quantos clientes estão escolhidos.
5. Escolha o **Setor**. No **Responsável**, já vem **O responsável de cada cliente neste setor**: cada tarefa nasce com o responsável cadastrado para aquele cliente naquele setor (Tarefas → Configurações → Clientes). Se preferir, escolha uma pessoa só para todas.
6. Preencha **Prazo**, **Competência**, **Prioridade** e **Situação**: valem para todas as tarefas.
7. Toque em **Criar para N clientes**. A mensagem confirma quantas tarefas foram criadas.

**Atenção:**

- Cliente que já tem uma tarefa com o **mesmo título e a mesma competência** aparece com a etiqueta **já tem** e fica de fora, para não duplicar.
- Cliente sem responsável cadastrado no setor: a tarefa nasce **sem responsável** e a janela lista quais são, antes de criar.
- No máximo **500 clientes** por vez.
- A gravação é única: ou todas as tarefas são criadas, ou nenhuma (se faltar acesso, nada fica pela metade).
- Depois de criadas, cada tarefa é independente: mudar uma não muda as outras.

### Reunião ou compromisso com horário e lembrete

Para reunião, ligação marcada ou tarefa com hora certa, o HUB avisa o responsável **10 minutos antes** e **na hora**.

1. Na tarefa, escolha o **Prazo** (o dia) e preencha o **Horário (opcional)**, por exemplo 15:00.
2. Toque em **Salvar**. Na lista, a tarefa mostra o relógio e a hora ao lado do prazo, e no mesmo dia os compromissos vêm primeiro, na ordem da hora.
3. Às 14:50 chega o aviso **Em 10 minutos: título da tarefa** e às 15:00 o aviso **Agora: título da tarefa**. Tocar no aviso abre a tarefa.

**Para receber no celular ou no computador com o HUB fechado:** abra o **sino** (canto de cima), toque em **Ativar avisos neste aparelho** e aceite quando o navegador perguntar. Faça isso em cada aparelho (computador do escritório, celular). No iPhone, instale o HUB antes (Compartilhar → Adicionar à Tela de Início) e ative por ele.

**Atenção:**

- O aviso vai para o **Responsável** da tarefa; sem responsável, para quem criou.
- Sem **Prazo** não dá para marcar horário.
- Tarefa concluída ou cancelada não avisa. Mudou o dia ou a hora? O HUB avisa no novo horário.
- O aviso aparece sempre no **sino**. No celular ou no computador, só se o aparelho estiver ativado; aviso que não chega em 15 minutos (aparelho desligado) é descartado.
- Ao **Sair** do HUB, os avisos daquele aparelho são desligados.

### Concluir, mudar ou cancelar uma tarefa

1. Toque na tarefa para abrir.
2. Mude a **Situação**, o **Prazo**, o **Responsável** ou o que precisar e toque em **Salvar**. Tudo fica no **Histórico** da tarefa.
3. Na forma **Quadro**, o botão **Concluir** do cartão conclui sem abrir a tarefa.
4. **Cancelar tarefa** (gestor ou administrador) pede o motivo; a tarefa fica guardada como cancelada.

**Comentários e anexos:** dentro da tarefa, escreva comentários para a equipe e use **Anexar** para guias, recibos e holerites. Anexo de tarefa de cliente fica disponível no Portal do Cliente (desmarque **no portal** para manter interno).

### Relatórios (Tarefas → Relatórios)

**Para que serve:** ver as tarefas concluídas por pessoa e por período, no prazo e com atraso, com Excel e PDF.

### Painel TV (Tarefas → Painel TV)

**Para que serve:** painel para a TV do escritório, com o andamento das tarefas da equipe em tempo real. A TV usa um acesso próprio, só de leitura.

### Configurações (Tarefas → Configurações)

**Quem usa:** gestores e administradores.

- **Obrigações recorrentes:** as rotinas que viram tarefas sozinhas todo mês (título, setor, regimes, meses, dia de vencimento e ajuste para dia útil). As tarefas do mês são geradas todo dia de manhã sem duplicar; **Gerar tarefas** faz na hora.
- **Clientes:** carteira de clientes, grupos e o **responsável de cada cliente em cada setor** (é ele que entra quando a tarefa é criada para vários clientes ou pela recorrência).
- **Equipe**, **Setores** e **Feriados** (os feriados afastam o prazo para o dia útil).
- **Organização e painel:** nome, fuso e o link do Painel TV.
- **Integrações:** ligações com outros sistemas.

## Societário

Alterações contratuais, aberturas e baixas de empresas, fase a fase, com exigências e taxas.

**Quem usa:** equipe com a ferramenta Societário.

### Processos (Societário → Processos)

**Para que serve:** acompanhar cada processo societário. Concluir a tarefa de uma fase faz o processo andar para a próxima.

### Painel (Societário → Painel)

**Para que serve:** visão geral dos processos em andamento por fase.

### Documentos dos clientes (Societário → Documentos dos clientes)

**Para que serve:** acervo de cada cliente (contrato social, alterações, cartão CNPJ, sócios), usado como base da próxima alteração.

## Demonstrativos

Balancetes do Domínio transformados em Balanço, DRE, DFC, índices, fragilidades e parecer, com PDF para o cliente.

**Quem usa:** equipe com a ferramenta Demonstrativos (importar exige nível operar).

### Balancetes (Demonstrativos → Balancetes)

**Para que serve:** abrir o demonstrativo de cada cliente e período, conferir e publicar no Portal do Cliente.

### Importar (Demonstrativos → Importar)

**Para que serve:** enviar o balancete exportado do Domínio em Excel. O HUB monta os demonstrativos a partir dele.

### Histórico de importações (Demonstrativos → Histórico de importações)

**Para que serve:** ver o que foi importado, quando e por quem.

### Riscos da carteira (Demonstrativos → Riscos da carteira)

**Para que serve:** clientes com sinais de fragilidade nos números, para a equipe agir antes.

## Atendimento

Conversas com os clientes pelo Portal do Cliente.

### Caixa de entrada (Atendimento → Caixa de entrada)

**Para que serve:** responder as mensagens dos clientes. Uma conversa pode virar tarefa.

### Acessos do portal (Atendimento → Acessos do portal)

**Quem usa:** quem gere o Atendimento.

**Para que serve:** liberar o Portal do Cliente para as pessoas do cliente, com senha provisória enviada pelo WhatsApp.

## Vencimentos

Certificados digitais, alvarás, procurações e outros documentos com validade, com aviso antes de vencer.

### Vencimentos (Vencimentos → Vencimentos)

**Para que serve:** ver o que vence e quando. **Renovar** registra a nova data; **Encerrar** pede o motivo. Lista com Excel e PDF.

### Certificados digitais (Vencimentos → Certificados digitais)

**Para que serve:** todos os certificados guardados no HUB numa lista só, com validade e filtros.

## CRM Comercial

Funil de vendas da MDC, leads e contratos com o cliente novo.

### Funil (CRM Comercial → Funil)

**Para que serve:** acompanhar cada oportunidade por etapa até virar cliente.

### Leads (CRM Comercial → Leads)

**Para que serve:** contatos que chegaram (inclusive pelas ferramentas abertas, como o Simulador de Regime).

### Ferramentas abertas (CRM Comercial → Ferramentas abertas)

**Para que serve:** links das ferramentas sem login (Simulador de Regime 2027) para divulgar; quem preenche entra no funil.

## Contratos

Contratos de prestação de serviço com os clientes, faturas, notas fiscais, reajustes e envio da cobrança.

### Contratos (Contratos → Contratos)

**Para que serve:** cadastro e vigência dos contratos, anexos e contas do mês.

### Faturas e notas fiscais (Contratos → Faturas e notas fiscais)

**Para que serve:** faturas do mês, emissão da NFS-e e acompanhamento do recebimento.

### Reajustes (Contratos → Reajustes)

**Para que serve:** reajuste anual dos contratos pelo índice combinado.

## Sistemas

Os sistemas que a MDC licencia aos clientes (Ledgra ERP, EXato e os próximos): quem usa cada um, com quais módulos, quantos usuários, a chave e a receita. Cada cliente tem no máximo uma licença ativa por sistema.

### Licenças (Sistemas → Licenças)

**Para que serve:** cadastrar e acompanhar a licença de cada cliente em cada sistema.

**Como usar:**
1. Clique em **Nova licença**, escolha o cliente e o **sistema** (só aparecem os que estão à venda).
2. Escolha um plano, módulos avulsos ou o sistema **full** (todos os módulos, inclusive os que forem criados depois).
3. Em **Valor e usuários**, informe o valor mensal, quantos **usuários** estão incluídos e o valor por usuário a mais. Em **Quando passar do limite**, escolha **Liberar e cobrar** (o usuário a mais entra na cobrança do mês seguinte) ou **Não deixar passar** (o sistema não cadastra pessoa além do limite).
4. Em **Como cobrar**, deixe **Mensalidade da licença** (vai junto com o honorário) ou escolha um **contrato a receber** de Contratos: aí a fatura dele leva a licença e o usuário a mais.
5. Depois de salvar, em **Ações › Chave do sistema**, gere a chave e cole no sistema do cliente. A chave começa com o prefixo do sistema (LDG-… no Ledgra, EXA-… no EXato).

**Dicas:** a coluna **Usuários** mostra quantas pessoas o sistema informou neste mês (ex.: "12 de 10 usuário(s) (2 a mais)"). O filtro **Sistema** mostra só as licenças de um sistema.

### Sistemas e produtos (Sistemas → Sistemas e produtos)

**Para que serve:** cadastrar os sistemas (aba **Sistemas**: nome, código, prefixo da chave e situação — Vendendo, Em breve ou Fora de venda), os módulos de cada sistema com o preço de tabela (aba **Produtos**) e os pacotes (aba **Planos**).

**Dicas:** o módulo novo começa com o código do sistema (ex.: exato-rs). Sistema "Em breve" fica cadastrado, mas não aceita licença.

### Receita por sistema (Sistemas → Receita por sistema)

**Quem usa:** quem gere Sistemas e vê Contratos.

**Para que serve:** quanto cada sistema rende: contratos ativos, clientes, receita mensal, faturado, recebido e a previsão dos próximos 12 meses. Licença ligada a um contrato a receber entra aqui sozinha.

### Modelo do contrato (Sistemas → Modelo do contrato)

**Quem usa:** quem gere Sistemas.

**Para que serve:** texto-padrão do contrato de licença, com as variáveis preenchidas na emissão.

## Pessoas e acessos

**Quem usa:** o administrador.

### Dar acesso a uma pessoa da equipe

1. Abra **Pessoas e acessos** no menu.
2. Cadastre a pessoa (nome e e-mail) e escolha as ferramentas e o nível de cada uma.
3. Informe a **Senha provisória** ou deixe em branco para o HUB gerar uma.
4. A senha aparece **uma vez só**: use **Enviar pelo WhatsApp** ou **Copiar mensagem**. O link já vai no endereço oficial do HUB.
5. No primeiro login a pessoa cria a própria senha.

**Redefinir senha** gera uma senha provisória nova para quem esqueceu. Ao inativar uma pessoa, o HUB oferece passar as tarefas dela (e, se quiser, a carteira de clientes) para outra pessoa.

## Dúvidas frequentes

- **Não vejo uma ferramenta ou um botão:** o seu acesso não inclui. Peça ao administrador em Pessoas e acessos.
- **O link que recebi abriu outro endereço:** use sempre **hub.mdcassessoria.com/hub-mdc**. Links antigos continuam funcionando.
- **Criei a mesma tarefa duas vezes:** cancele a repetida (Cancelar tarefa, com motivo). Na criação para vários clientes o HUB já pula quem tem a tarefa com o mesmo título e competência.
- **Como baixo uma lista:** use os botões Excel ou PDF da tela; sai o que está filtrado.
- **A tela mostrou "Algo deu errado":** copie o texto de **Detalhe para o suporte** e mande para o administrador.

## Controle de versões

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 18/11/2026 | Primeira versão do manual dentro do HUB, aberta a todos os usuários. Inclui a criação da mesma tarefa para vários clientes de uma vez. |
| 1.1 | 18/11/2026 | Licenças Ledgra virou **Sistemas**: licença por sistema (Ledgra ERP, EXato…), usuários incluídos e a mais, cobrança pela fatura da Gestão, chave por sistema e Receita por sistema no mesmo menu. |
| 1.2 | 19/11/2026 | Tarefas com **Horário**: lembrete 10 min antes e na hora, no sino e no celular/computador (**Ativar avisos neste aparelho**, no sino). |
`;
