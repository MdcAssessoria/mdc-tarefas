// Texto do Manual do HUB-MDC, lido pela tela /manual (aberta a todos os usuários da equipe) e pelo PDF do manual.
// Formato: "## Área", "### Tela (Seção → Tela)", parágrafos, listas (- e 1.), tabelas (| … |) e imagens
// ![texto](/manual/arquivo.webp) com o arquivo em web/public/manual. O caminho "(Seção → Tela)" usa os nomes do menu
// (components/shell/navegacao.ts): com ele a tela do manual ganha o botão "Ir para a tela".
// Mudou uma tela ou regra? Atualize o trecho dela aqui no mesmo commit e acrescente uma linha em "Controle de versões".

export const VERSAO_MANUAL = { numero: "2.15", data: "23/11/2026" };

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

**Atenção:** a senha nova precisa ser diferente da provisória; o HUB só libera a entrada depois da troca.

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

**Corrigir ou apagar um processo:** com o processo em andamento, **Editar dados** (no quadro de dados) muda o nome da empresa (enquanto ainda não é cliente), CNPJ, UF, observações, responsável e previsão; o antes e o depois ficam na linha do tempo. **Excluir processo** (só quem gere o Societário, com motivo) apaga de vez um processo aberto por engano: não vale para processo concluído, e os anexos precisam ser retirados antes. As tarefas das fases ficam canceladas. Para encerrar sem apagar, use **Cancelar processo**.

**Abertura de empresa (ficha de abertura):** no processo de abertura, o cartão **Ficha de abertura** (com o quadro societário) fica logo abaixo dos dados do processo, e ao criar a abertura a ficha já abre para preencher. Depois, use **Editar ficha** e informe, aos poucos (o que foi salvo fica guardado):

- **Regime em que a empresa nasce** (Simples Nacional, Lucro Presumido ou Lucro Real), natureza jurídica, porte, razão social e nome fantasia.
- **CNAE principal e secundários**: digite o código ou uma palavra ("padaria", "contabilidade") e escolha na lista oficial. Pelo regime escolhido, o CNAE que não é permitido aparece como **Não permitido** e não pode ser escolhido (Simples: Anexo VI da Resolução CGSN 140/2018; Presumido: atividades obrigadas ao Lucro Real, Lei 9.718/1998, art. 14). O que aparece como **Analisar** (Anexo VII) pode ser escolhido, mas o contador confirma o que a empresa fará.
- **Objeto social, capital** (valor da quota e quantidade de quotas), integralização, **endereço** (o **Buscar CEP** preenche rua, bairro, município, UF e o código IBGE), imóvel (próprio, alugado, IPTU, área), contato e contador.

Depois, em **Quadro societário**, use **Novo sócio** para cada sócio: CPF (ou CNPJ), participação em %, quem é **sócio administrador**, estado civil e regime de bens, RG, contato e endereço. A soma tem de dar 100%. No Simples, sócio empresa ou que mora fora do Brasil não é aceito. Na lista **Documentos da abertura**, logo na ficha, cada documento tem o botão **Anexar** (RG/CNH e comprovante de endereço de cada sócio, certidão de casamento, IPTU, contrato de locação ou matrícula, contrato social prévio): o arquivo entra no processo já com o tipo marcado e a lista mostra o que ainda falta. O que for enviado pelo cartão **Documentos** também aparece ali para você dizer o que é. **PDF** e **Excel** baixam a ficha completa. Ao **Concluir processo**, a empresa entra em Clientes com a razão social, fantasia, cidade, UF e regime da ficha.

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

## BI de Gestão

DRE e fluxo de caixa (DFC) gerenciais de um grupo de empresas, mês a mês, a partir do sistema do cliente (Omie) e dos lançamentos complementares da MDC, com comparações, indicadores e orçamento.

**Quem usa:** equipe com a ferramenta BI de Gestão. Os números de cada empresa só abrem com acesso liberado.

### Escolher a empresa e pedir acesso (BI de Gestão → DRE e fluxo de caixa)

**Para que serve:** abrir só a empresa que você vai analisar. A tela começa sem números, com um cartão por empresa.

1. Procure a empresa por nome, CNPJ ou código do Domínio.
2. **Acesso liberado:** toque em **Abrir**. Para ver o grupo todo junto, toque em **Abrir o grupo**.
3. Sem acesso, toque em **Pedir acesso** e escreva o motivo. O administrador ou o responsável pela empresa recebe um aviso.
4. Quem aprova toca em **Aprovar** e escolhe por quantos dias (padrão 30) ou em **Recusar**. Ninguém aprova o próprio pedido.
5. Em **Pedidos e acessos** você vê seus pedidos, pode **Desistir** de um pendente ou encerrar um acesso.

**Atenção:** o administrador vê em **Quem abriu os números** cada vez que alguém abriu o relatório.

### Ver os números (BI de Gestão → DRE e fluxo de caixa)

**Para que serve:** ver resultado, caixa e indicadores do período e mandar ao cliente em PDF ou Excel.

1. Escolha o **Período** (padrão: **Este ano**) e as **Empresas** (ao menos uma).
2. Com mais de uma empresa, **Tirar vendas e pagamentos entre as empresas do grupo** vem marcado.
3. Use as abas: **Visão geral** (resumo, resultado × caixa com o acumulado, cascata da receita ao resultado e receita mês a mês), **DRE**, **Fluxo de caixa** (com **% da receita**), **Comparar**, **Empresas** (quanto cada empresa pesa na receita e no resultado, uma coluna por empresa e o consolidado) e **Indicadores**. Nos gráficos, passe o mouse ou toque num mês para ver os valores.
4. Em **Comparar**, escolha **Período anterior**, **Mesmo período do ano passado** ou **Orçamento** (realizado × orçado). Diferença verde é melhor para o resultado; vermelha, pior.
5. Na **DRE**, os cartões de **margem bruta, operacional e líquida** mostram o percentual, a faixa (vermelho = abaixo do esperado, amarelo = atenção, verde = saudável) e o que ela quer dizer em reais ("de cada R$ 100 de receita, sobraram…"). Faixas: bruta 20% e 35%; operacional 5% e 12%; líquida 0% e 8%.
6. Na DRE e no Fluxo de caixa, clique na **seta** ao lado de uma linha para abri-la nas contas do plano (ou em **Abrir as contas**) e, na seta de cada conta, para ver os **documentos** (notas e contas a pagar/receber) que formam o saldo, mês a mês. Os valores aparecem sem centavos; marque **Centavos** para ver completos. Clique num **valor** para ver as notas, os impostos das notas, as contas a pagar/receber e os pagamentos que formam aquele número, com busca e PDF/Excel.
7. **Resultado × caixa** compara o que a DRE mostra (competência) com o que entrou e saiu do banco, grupo a grupo (vendas, impostos, pessoal, custos, despesas, juros). Diferença de 10% ou mais (acima de R$ 5 mil) aparece em **Atenção**; de 25% ou mais, em **Alerta**, com a causa mais comum. No fim vêm os **saldos dos bancos** do Omie (início, fim e a diferença para o fluxo), que também aparecem na aba Fluxo de caixa. Com mais de uma empresa e "Tirar vendas e pagamentos entre as empresas" marcado, aparece ainda o quadro **Operações entre as empresas**: quantas operações têm as duas pontas lançadas no Omie e quais ficaram com uma ponta só (com a possível outra ponta lançada sem a empresa). É o que falta corrigir no Omie para o fluxo do grupo fechar com os bancos; dá para baixar em PDF ou Excel.
8. **Indicadores** abre com a **Saúde do negócio**: margem EBITDA, cobertura de juros, folga sobre o ponto de equilíbrio, fôlego de caixa (quantos meses o dinheiro nos bancos paga) e conversão em caixa, cada um com a faixa em cor e uma frase em reais (passe o mouse para ver a conta). Depois, prazos médios de recebimento e pagamento, ciclo financeiro, inadimplência, contas em aberto por atraso, maiores clientes e fornecedores e liquidez.
9. Use **PDF** ou **Excel** para baixar (com as contas que estiverem abertas).

**Atenção:** o aviso **Não classificado** mostra valores de categorias do Omie sem conta do plano ou lançadas no Omie como "Contas a classificar"; clique no valor da linha para ver quais são. A liquidez corrente, seca e geral vem do balancete do Domínio publicado em Demonstrativos; sem ele aparece só uma estimativa pelos títulos do Omie. Fornecedores aparecem pelo CNPJ/CPF.

### Parecer gerencial do BI (BI de Gestão → aba Parecer)

Só para a equipe MDC. O HUB monta o rascunho do parecer com os números do período escolhido: síntese, DRE, caixa e confronto com o resultado (NBC TG 03), prazos e inadimplência, pontos de atenção e premissas, cada parte com um quadro **Em linguagem simples**.

1. Escolha o grupo ou a empresa e o período e abra a aba **Parecer**.
2. Revise o texto à esquerda; à direita aparece como o cliente vai ver, com o cabeçalho da MDC.
3. Complete os trechos **[Revisar…]** (contexto da empresa, meses ainda sem extrato do banco, nome e CRC de quem assina).
4. Clique em **Imprimir / salvar PDF**. Na impressão saem só o parecer e a assinatura.

**Atenção:** o texto que você mudar fica guardado neste computador para a mesma empresa e o mesmo período. Mudou algum lançamento no Omie? Clique em **Montar de novo com os números**. O parecer é gerencial: não é auditoria nem substitui as demonstrações contábeis.

### Classificar as categorias do Omie (BI de Gestão → aba Classificação)

**Quem usa:** só a equipe MDC (nível gerir na ferramenta BI de Gestão).

**Para que serve:** pôr no plano de contas do BI as categorias do Omie que não têm o código do plano na frente do nome.

1. Abra a aba **Classificação**. Ela abre em **Pendentes**: categorias sem conta, lançadas como "Contas a classificar" e as marcadas **A conferir**. O cartão **Sem conta do plano** mostra quanto está fora dos relatórios no período.
2. Clique em **Classificar** (ou **Alterar**), escolha a **Conta do plano** e veja onde ela entra na DRE e no fluxo de caixa. Com mais de uma empresa, marque **Aplicar também em…** para gravar nas outras empresas que têm a mesma categoria com o mesmo nome.
3. Nas categorias **A conferir** (vindas do de-para antigo), confira a conta e clique em **Conferir**.
4. **Desfazer** tira a classificação da equipe (pede o motivo): a categoria volta a seguir o código do Omie ou fica sem conta.

**Atenção:** a classificação vale para todos os períodos e entra na hora em todos os relatórios. Tudo fica no histórico com o nome de quem fez. No aviso "Não classificado" da DRE, o botão **Classificar agora** leva direto para esta aba.

### Lançamentos e orçamento (BI de Gestão → aba Lançamentos)

**Para que serve:** completar o que não está no Omie, gravar a meta mensal para comparar realizado × orçado e projetar os anos seguintes.

1. **Lançamentos complementares:** toque em **Novo lançamento**, escolha empresa, mês, linha da DRE e/ou do DFC, valor positivo e histórico, e grave. Para vários de uma vez, **Baixar modelo**, preencha e **Importar Excel**.
2. Para desfazer um lançamento, toque em **Cancelar** e escreva o motivo.
3. **Orçamento:** escolha empresa, ano (de dois anos atrás até cinco à frente) e **DRE** ou **Fluxo de caixa**, digite a meta de cada mês (valor positivo; despesa e pagamento saem negativos no relatório) e toque em **Gravar**. Célula em branco = sem meta.
4. Para o ano todo de uma vez, **Baixar planilha**, preencha e **Importar Excel**. A importação grava tudo ou nada.
5. **Projeção (anos seguintes):** escolha empresa, **ano-base** (o realizado que serve de ponto de partida) e de 1 a 5 **anos à frente**. Ajuste as **premissas gerais** (crescimento da receita e inflação de cada ano) e, linha a linha, como ela projeta: **Crescimento/Reajuste %** sobre o ano anterior ou **% da receita**. Pode digitar o valor do ano direto (fica em amarelo; apague para voltar ao cálculo). Os subtotais e o resultado são calculados.
6. Toque em **Gravar estudo** (guarde vários cenários com nomes diferentes). Para trabalhar no Excel, **Baixar modelo**, preencha e **Importar Excel**: o HUB mostra o que leu e aplica ao estudo para você conferir e gravar.
7. **Provisionar no Orçamento** grava os anos projetados no Orçamento da DRE, mês a mês pela sazonalidade do ano-base, substituindo o que havia nesses anos. Depois compare em **Comparar → Orçamento**.

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

**Propostas que saem assinadas:** na ficha da oportunidade, aba **Proposta e contrato**, o quadro **Propostas em PDF** recebe o PDF da proposta (arraste ou clique para escolher). O botão **Baixar assinada** entrega o PDF com a assinatura digital do certificado da MDC (ICP-Brasil) e um rodapé dizendo quem assinou e onde conferir (validar.iti.gov.br), igual ao PDF dos demonstrativos. O arquivo anexado não muda; cada download fica no histórico como "Proposta assinada". Sem certificado válido em Configurações, a proposta não sai. Só o administrador pode **Retirar** uma proposta (com motivo).

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

Os sistemas que a MDC licencia aos clientes (Ledgra ERP, EXato e os próximos): quem usa cada um, com quais módulos, quantos usuários, a chave e a receita. Cada cliente tem no máximo uma licença ativa por sistema. No menu lateral, **Sistemas** é um item próprio (fora do grupo Gestão), com as telas logo abaixo.

### Licenças (Sistemas → Licenças)

**Para que serve:** cadastrar e acompanhar a licença de cada cliente em cada sistema.

**Como usar:**
1. Clique em **Nova licença**, escolha o cliente e o **sistema** (só aparecem os que estão à venda). A empresa ainda não está na lista? Procure pelo nome ou CNPJ: sem resultado, o cadastro abre sozinho (com o CNPJ que você digitou); ou toque em **+ Novo cliente**. Toque em **Buscar dados** e em **Cadastrar e escolher**: ela entra nos clientes com o grupo "Só licença" e já fica escolhida (só para gestor e administrador).
2. Escolha um **pacote**, módulos avulsos ou o sistema **full** (todos os módulos, inclusive os que forem criados depois). Ao escolher o pacote, os usuários incluídos, o valor do usuário a mais e o que fazer ao passar do limite já vêm preenchidos; dá para mudar só nesta licença.
3. Em **Valor e usuários**, informe o valor mensal, quantos **usuários** estão incluídos e o valor por usuário a mais. Em **Quando passar do limite**, escolha **Liberar e cobrar** (o usuário a mais entra na cobrança do mês seguinte) ou **Não deixar passar** (o sistema não cadastra pessoa além do limite).
4. Em **Como cobrar**, deixe **Mensalidade da licença** (vai junto com o honorário) ou escolha um **contrato a receber** de Contratos: aí a fatura dele leva a licença e o usuário a mais.
5. Depois de salvar, em **Ações › Chave do sistema**, gere a chave e cole no sistema do cliente. A chave começa com o prefixo do sistema (LDG-… no Ledgra, EXA-… no EXato).
6. Se o grupo do cliente tem várias empresas usando o mesmo sistema (ex.: no EXato, EXRH, TEAM Leasing e ACB), abra **Ações › Empresas no sistema** e marque as empresas do grupo (há o atalho "Marcar as filiais do mesmo CNPJ"). Em cada empresa marcada (e no próprio cliente da licença) dá para escolher os **módulos**: sem escolha, a empresa usa todo o pacote. No sistema, essas empresas chegam sozinhas como "A concluir" para o administrador terminar o cadastro — nunca aparece a carteira da MDC.

**Dicas:** a coluna **Usuários** mostra quantas pessoas o sistema informou neste mês (ex.: "12 de 10 usuário(s) (2 a mais)"). O filtro **Sistema** mostra só as licenças de um sistema.

**Usuários a conferir:** se o sistema informar muito mais pessoas do que o contratado (mais de 3 vezes os incluídos, com folga mínima de 20), a cobrança fica no limite e a linha mostra "a conferir"; quem cuida de licenças recebe aviso no sino. Toque em **Conferir**, escreva o motivo e escolha **Aceitar** (o número informado entra na cobrança) ou **Manter** (fica o que estava). Isso evita cobrar o cliente por uma chave usada por engano ou por outra pessoa.

### Sistemas e produtos (Sistemas → Sistemas e produtos)

**Para que serve:** cadastrar os sistemas (aba **Sistemas**: nome, código, prefixo da chave e situação — Vendendo, Em breve ou Fora de venda) e os módulos de cada sistema com o preço de tabela (aba **Produtos**). Os pacotes ficam na tela **Pacotes de licença**.

**Dicas:** o módulo novo começa com o código do sistema (ex.: exato-rs). Sistema "Em breve" fica cadastrado, mas não aceita licença.

### Pacotes de licença (Sistemas → Pacotes de licença)

**Para que serve:** montar o que cada sistema vende. Um pacote junta módulos de **um** sistema com um preço mensal, quantos **usuários** entram (qualquer número, a partir de 1, ou **sem limite**), o valor de cada **usuário a mais** e o que acontece quando passa do limite.

**Como usar:**
1. Clique em **Montar pacote**, dê um nome (ex.: "EXato Diárias") e escolha o **sistema**.
2. Marque os **módulos** (ou **Marcar todos**). Ao lado de cada um aparece o preço avulso.
3. Em **Usuários**, digite quantos entram no preço ou marque **Sem limite de usuários**. Com limite, informe o valor do usuário a mais e escolha **Libera e cobra no mês seguinte** ou **Bloqueia**.
4. Digite o **preço do pacote**. O quadro mostra quanto os módulos somariam avulsos, o desconto e um **exemplo de mensalidade** (mude o número de usuários do exemplo para simular).
5. Clique em **Salvar pacote**. Pacote **À venda** aparece ao cadastrar uma licença.

**Dicas:** a vista **Grade módulo × pacote** marca os módulos de vários pacotes de uma vez. Mudar um pacote não muda as licenças já fechadas (cada licença guarda a própria cópia). Pacote já usado numa licença não troca de sistema: monte outro. Preço e usuário a mais só aparecem para quem gere Sistemas.

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
| 1.3 | 19/11/2026 | **Pacotes de licença** (Sistemas): a MDC monta os pacotes de cada sistema com módulos, preço, usuários incluídos (qualquer número ou sem limite), valor do usuário a mais e o que fazer ao passar do limite; a licença puxa esses dados do pacote. |
| 1.4 | 19/11/2026 | **BI de Gestão**: DRE e fluxo de caixa do grupo de empresas, mês a mês, a partir do Omie, com escolha das empresas, opção de tirar as operações entre elas e PDF/Excel. |
| 1.5 | 19/11/2026 | **Empresas no sistema** (Sistemas › Licenças › Ações): a MDC marca as empresas do grupo que usam o sistema com aquela licença; o EXato traz do HUB só essas na tela Nova empresa. |
| 1.6 | 20/11/2026 | **Módulos por empresa** na licença (Empresas no sistema): sem escolha, todo o pacote; o EXato aplica ao receber as empresas. |
| 1.7 | 20/11/2026 | **BI de Gestão**: abre em cartões das empresas sem números; acesso por pedido aprovado pelo administrador ou responsável (padrão 30 dias) e registro de quem abriu; novas abas Visão geral, Comparar (período anterior, ano passado e orçamento), Empresas, Indicadores (prazos, inadimplência, aberto por atraso, maiores clientes e fornecedores, liquidez) e Lançamentos (complementares e orçamento, com importação por Excel). |
| 1.8 | 20/11/2026 | Novo módulo do EXato para vender na licença: **Pagamento de diárias por planilha** (precisa do Financeiro). |
| 2.0 | 20/11/2026 | Segurança: a senha nova precisa ser diferente da provisória; licença com **usuários a conferir** quando o sistema informa muito mais pessoas do que o contratado; o link de assinatura mostra o CPF mascarado depois de assinado. |
| 1.9 | 20/11/2026 | **BI de Gestão**: gráficos novos, legíveis também no celular: resultado acumulado no gráfico resultado × caixa, cascata da DRE da receita ao resultado, participação de cada empresa na receita e no resultado do grupo (aba Empresas) e balão com os valores do mês. |
| 2.1 | 20/11/2026 | **Licenças → Nova licença**: botão **Cadastrar empresa nova** no passo 1, para cadastrar pelo CNPJ uma empresa que ainda não é cliente (grupo "Só licença") sem sair da janela. |
| 2.2 | 20/11/2026 | **BI de Gestão**: o orçamento aceita mais anos (dois para trás e cinco para a frente). |
| 2.3 | 20/11/2026 | **BI de Gestão**: plano de contas gerencial padrão da MDC (classificação pelo código da categoria do Omie); DRE com margens por faixa e explicação, linhas que abrem nas contas do plano e clique no valor mostrando as notas e os títulos. |
| 2.4 | 20/11/2026 | **BI de Gestão**: aba Classificação (equipe MDC classifica as categorias do Omie, com histórico), aba Resultado × caixa com alertas de variação, saldos dos bancos do Omie no fluxo de caixa e adiantamentos recebidos em "Outros recebimentos". |
| 2.5 | 21/11/2026 | **BI de Gestão**: demonstrativos no novo padrão da MDC (tabela compacta com os 12 meses, subtotais e resultados destacados), documentos de cada conta dentro da DRE e do fluxo de caixa, e margens com régua de faixas. |
| 2.6 | 21/11/2026 | **BI de Gestão**: o fluxo de caixa passa a sair do extrato dos bancos do Omie (inclui tarifas, antecipações e pagamentos lançados direto na conta) e fecha com os saldos dos bancos. |
| 2.7 | 21/11/2026 | **BI de Gestão**: aba Indicadores com a Saúde do negócio (EBITDA, cobertura de juros, ponto de equilíbrio, fôlego e conversão em caixa) e tabelas no padrão MDC. |
| 2.8 | 21/11/2026 | **BI de Gestão**: aba Parecer (equipe MDC) monta o parecer gerencial com os números do período, para revisar e salvar em PDF. |
| 2.9 | 21/11/2026 | **Sistemas** sai do grupo Gestão e vira item próprio do menu, com as telas em submenu. **Nova licença**: cliente não encontrado na busca abre o cadastro na hora, já com o CNPJ digitado. |
| 2.10 | 21/11/2026 | **BI de Gestão**: correção do fluxo de caixa do grupo (com "tirar as operações entre as empresas", os movimentos sem CNPJ/CPF, como tarifas e débitos em conta, ficavam de fora); quadro Operações entre as empresas em Resultado × caixa; nome de clientes e fornecedores nos títulos do Omie; quadro mês a mês na Visão geral e Orçamento no padrão MDC; extrato também das contas inativas. |
| 2.13 | 22/11/2026 | **Societário**: Editar dados do processo (nome, CNPJ, UF, observações, responsável, previsão; registrado na linha do tempo) e Excluir processo (quem gere, com motivo; não vale para concluído nem com anexo). |
| 2.12 | 22/11/2026 | **Societário**: ficha de abertura no processo de abertura — regime (Simples, Presumido, Real) que confere os CNAE pela lista oficial, CNAE principal e secundários, quadro societário com percentuais e administrador, capital e quotas, endereço com busca de CEP e IBGE, imóvel, contato, contador e documentos por tipo; o cliente nasce com os dados da ficha. |
| 2.14 | 23/11/2026 | **CRM Comercial**: propostas em PDF anexadas na ficha saem **assinadas digitalmente** pela MDC ao baixar (botão Baixar assinada), com registro no histórico. |
| 2.15 | 23/11/2026 | **BI de Gestão**: Projeção da DRE para até 5 anos a partir do realizado (premissas de crescimento e inflação, % por linha editável ano a ano, valor digitado por cima), estudos gravados por empresa, planilha-modelo em Excel para baixar e subir, e "Provisionar no Orçamento". |
| 2.11 | 21/11/2026 | **Demonstrativos**: Balanço, DRE, DFC e Balancete no mesmo padrão de tabela do BI (cabeçalho verde preso no topo, primeira coluna presa ao rolar, subtotais e resultado em destaque); também no Portal do Cliente. |
`;
