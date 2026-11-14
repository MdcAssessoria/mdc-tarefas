# MDC · Pessoal (finanças e tarefas da família)

> **Resumo:** app da família dentro do HUB (pedido do Edvaldo em 14/11/2026), com entrada própria em
> `/hub-mdc/pessoal`, marca e menu próprios. Cada família é uma organização do tipo `pessoal` (migração 075): tem
> Início com o resumo do dia, Tarefas (sem cliente e setor), Finanças (o Financeiro do HUB sem certificado digital e
> sem nota fiscal) e Família (pessoas, convites e permissões). O cadastro é aberto: qualquer pessoa cria a conta e a
> família começa do zero. O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

## 1. Telas

| Endereço | Quem vê | O que faz |
| --- | --- | --- |
| `/pessoal` | qualquer um (sem login) | Entrada: **Já tenho conta** / **Criar conta** (nome, e-mail, senha) e, para quem ainda não tem família, "Dê um nome para a sua família". "Esqueci a senha" manda falar com a MDC pelo WhatsApp. `?criar=1` abre direto em Criar conta; `?convite=ABCD-EFGH` mostra o aviso do convite e, depois do login ou do cadastro, entra na família do convite (`pessoal_aceitar_convite`) |
| `/` (Início) | membro da família | Saudação e quatro cartões: **Atrasadas**, **Vencem hoje**, **Próximos 7 dias** (a pagar) e **A receber em 7 dias**, com até 4 contas cada; atalhos "Lançar agora" e as tarefas em aberto. Regra em `dominios/pessoal/resumo.ts` |
| `/tarefas` | membro | A mesma tela de Tarefas do HUB, sem os campos e filtros de Cliente e Setor |
| `/financeiro/*` | membro (lançar: "Pode lançar") | O Financeiro do HUB (a pagar, a receber, entradas e saídas, contas bancárias, transferências, extratos, conciliação). Sem `/financeiro/certificado` |
| `/familia` | membro | Pessoas da família com a permissão (Responsável, Pode lançar, Só consulta); PDF e Excel. O responsável: **Convidar alguém**, **Mudar permissão**, **Tirar**, **Trocar o nome** e a lista de convites (Aguardando, Aceito, Cancelado, Vencido) com **Cancelar**. Quem não é responsável: **Sair da família** |

O menu da família (`components/shell/MenuPessoal.tsx`) só tem Início, Tarefas, Finanças e Família. A `Guarda` barra
qualquer outra tela do HUB enquanto a aba estiver numa família, e a busca rápida só mostra as telas da família.
Quem também é da equipe da MDC vê no menu do HUB o link "MDC · Pessoal" e, no menu da família, "Abrir o HUB da
MDC". A família escolhida vale para a aba (sessionStorage), então HUB e família podem ficar abertos lado a lado.

## 2. Regras (todas no banco, migração 075)

- **Família = organização `tipo = 'pessoal'`**, com um cliente "pessoa física" que é a empresa da gestão
  (`gestao_cliente_id`), plano de contas pessoal (37 contas: receitas e despesas de casa, de moradia a outras
  despesas) e 25 categorias. Não semeia licenças, perfis da equipe nem Ledgra. O tipo não muda pela tela.
- **Criar família** (`pessoal_criar_familia`): nome de 3 a 80 letras; até 3 famílias por conta; quem cria é o
  responsável (administrador) com Tarefas e Finanças em "gerir".
- **Cadastro aberto** (Função Edge `pessoal-cadastro`, sem login): campo escondido contra robôs, até 5 contas por
  hora por endereço de internet (só o resumo do IP é guardado), senha de 8 a 72 caracteres. A conta já nasce
  confirmada (o HUB não manda e-mail de cadastro).
- **Entrar numa família só por convite com código** (`pessoal_convidar` → `pessoal_aceitar_convite`): código
  `XXXX-XXXX` que aparece uma vez (no banco fica só o resumo), vale 7 dias e para uma pessoa; até 20 convites
  abertos por família; 10 códigos errados por hora por conta. A permissão vem do convite: **Pode lançar** = Tarefas e
  Finanças em "operar"; **Só consulta** = "ver".
- **Travas do cadastro aberto:** numa família não entra ninguém por convite do HUB, do Portal ou por link gerado
  (gatilho `pessoal_sem_convite`); `membros` de família só aceita quem tem entrada registrada
  (`app.pessoal_entradas`, gatilho `pessoal_porta_membro`); a **senha provisória do HUB não vale** para quem está
  numa família nem para conta com Portal em organização que quem pede não administra. Senha esquecida: a família
  fala com a MDC (WhatsApp 11 98859-8041).
- **Permissões** (`pessoal_definir_permissao`, só o responsável, nunca a própria) e **tirar/sair**
  (`pessoal_remover`: o responsável tira; a própria pessoa sai). O que a pessoa lançou continua.
- **Trocar o nome** (`pessoal_renomear`, só o responsável).
- Tudo vai para a auditoria (`app.registrar`, módulo `pessoal`).

## 3. Resumo diário (migração 076)

- **O que diz:** a pagar atrasado, a pagar hoje, a pagar nos próximos 7 dias, a receber até 7 dias e o que foi pago
  e recebido ontem (`app.pessoal_resumo_texto`, mesma divisão do Início). Sem nada a contar, não avisa.
- **Quando:** o agendador `pessoal-resumo` roda no minuto 3 de cada hora (`app.pessoal_resumo_rodar`); cada pessoa da
  família que vê as Finanças recebe **uma vez por dia**, a partir da hora escolhida (padrão 7h, no fuso da família).
- **Onde:** no sino do app e, para quem ligou "Avisar também no celular" e deixou o navegador avisar, na tela do
  aparelho (Web Push). Cada pessoa ajusta no Início › **Ajustar o resumo**: quero/não quero, horário (5h a 22h),
  celular, e liga ou desliga o aviso em cada aparelho (`pessoal_resumo_salvar`, `pessoal_push_inscrever`,
  `pessoal_push_remover`).
- **Entrega no celular:** o banco põe o aviso na fila `app.pessoal_push_fila`; o agendador só chama a Função
  `pessoal-aviso` quando há fila (token do Vault `pessoal_aviso_token`, como a 053). A função entrega com até 3
  tentativas e esquece aparelho que não existe mais. As chaves do Web Push (VAPID) são **geradas pela própria função
  na primeira vez e guardadas no Vault** (`pessoal_vapid`): ninguém digita nem cadastra chave.
- Service worker só de avisos: `web/public/sw-avisos.js` (não guarda cache).

## 4. "Você tem empresa?" — contato da MDC (migração 077)

- **Onde:** cartão no Início (só para o responsável, sem empresa indicada; "Agora não" esconde por 90 dias) e a seção
  "Contato da MDC sobre a sua empresa" na tela Família ("Indicar outra empresa", até 3 por família, e "Não quero mais
  contato").
- **O que a pessoa faz:** digita o CNPJ e toca em Buscar dados (a razão social vem da Receita pela BrasilAPI), confere
  o e-mail (vem o da conta) e o telefone (opcional), e marca a caixa da autorização — que vem **desmarcada** e mostra o
  texto em vigor (`app.pessoal_termo_contato`, versão 1).
- **O que vai para a MDC:** CNPJ, razão social, nome, e-mail e telefone da pessoa e os dados públicos da empresa na
  Receita (nome fantasia, cidade/UF, CNAE, porte, Simples/MEI, abertura, situação, endereço, telefone e e-mail
  cadastrais). Sem sócios e **nada das finanças da família**.
- **No Funil** (`pessoal_quero_contato`): CNPJ novo vira lead com origem **MDC · Pessoal**, anotação da autorização e
  aviso no sino do Comercial; CNPJ já no Funil (aberto) ganha só a anotação; CNPJ que já é cliente ativo da MDC não vira
  lead. A prova do consentimento (texto, versão e instante) fica em `pessoal_contatos_empresa`.
- **Retirar** (`pessoal_retirar_contato`): arquiva o lead que nasceu daquela autorização (com motivo) e anota na
  oportunidade que não se deve mais contatar por esse canal. Lead que já existia antes só ganha a anotação.
- **Ficha do lead no Comercial:** atalhos "Procurar no Google / Instagram / LinkedIn" com o nome e a cidade. A busca é
  feita por uma pessoa do Comercial; o HUB não coleta nada das redes sozinho (termos de uso das redes e LGPD: a
  autorização é para contato, não para montar perfil da pessoa).
- Antes de ir ao ar, o texto da autorização deve passar pelo advogado da MDC. Para mudar o texto, crie migração nova que
  troque `app.pessoal_termo_contato` subindo a versão.

## 5. Arquivos

- Banco: `supabase/migrations/075_mdc_pessoal.sql` e `076_pessoal_resumo_diario.sql`; testes
  `supabase/testes/141_base_075.sql`, `142_pessoal_075.sql` (P1 a P23), `143_base_076.sql` e `144_resumo_076.sql`
  (R1 a R15); `077_pessoal_contato_empresa.sql` com `145_base_077.sql` e `146_contato_077.sql` (C1 a C17).
- Funções Edge: `supabase/functions/pessoal-cadastro/index.ts` (cadastro aberto) e `pessoal-aviso/index.ts`
  (aviso no celular).
- Site: `web/src/app/pessoal/page.tsx` (entrada), `web/src/app/(hub)/familia/page.tsx`,
  `web/src/dominios/pessoal/` (`entrada.ts`, `resumo.ts`, `familia.ts` com testes; `componentes/InicioPessoal.tsx`,
  `componentes/JanelaConvidar.tsx`, `componentes/ResumoDiario.tsx`, `componentes/CartaoEmpresa.tsx`, `componentes/JanelasFamilia.tsx`; `contatoEmpresa.ts`, `avisoCelular.ts` com teste), `components/shell/MenuPessoal.tsx`.
- Fotos de tela da família: `PESSOAL=1 npm run telas` (a organização de exemplo vira "Família Carvalho").

## 6. Limitações

- Sem confirmação de e-mail no cadastro (o HUB não envia e-mail de cadastro); a trava é por IP e o robô cai no campo
  escondido.
- Aviso no celular depende do navegador: Chrome no Android e no computador funcionam direto; no iPhone só com o app
  instalado na tela de início (iOS 16.4 ou mais novo).
