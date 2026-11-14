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

## 3. Arquivos

- Banco: `supabase/migrations/075_mdc_pessoal.sql`; testes `supabase/testes/141_base_075.sql` e
  `142_pessoal_075.sql` (P1 a P23).
- Função Edge: `supabase/functions/pessoal-cadastro/index.ts`.
- Site: `web/src/app/pessoal/page.tsx` (entrada), `web/src/app/(hub)/familia/page.tsx`,
  `web/src/dominios/pessoal/` (`entrada.ts`, `resumo.ts`, `familia.ts` com testes; `componentes/InicioPessoal.tsx`,
  `componentes/JanelaConvidar.tsx`), `components/shell/MenuPessoal.tsx`.
- Fotos de tela da família: `PESSOAL=1 npm run telas` (a organização de exemplo vira "Família Carvalho").

## 4. Limitações e próximos passos

- Sem confirmação de e-mail no cadastro (o HUB não envia e-mail de cadastro); a trava é por IP e o robô cai no campo
  escondido.
- **Resumo diário com aviso** (fase 3, em construção): o resumo das finanças vai para o sino e, para quem permitir,
  para o celular; horário ajustável e opção de desligar. O aviso no celular precisa de uma chave que o Edvaldo
  cadastra uma vez no painel.
