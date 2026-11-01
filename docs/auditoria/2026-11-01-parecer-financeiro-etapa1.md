# Parecer de auditoria — migração 027 e Financeiro etapa 1 (01/11/2026)

- **Escopo:** (1) migração `027_equipe_recusa_conta_de_cliente.sql` (commit `4e67480`, main, não aplicada) — correção do
  achado R-A1; (2) Financeiro etapa 1, branch `financeiro-etapa1`, commits `5c4c142` e `d484355` (migração
  `026_financeiro_base.sql`, leitores de OFX/planilha/plano, telas `/financeiro`, `/financeiro/extratos`,
  `/financeiro/plano`, tipos, documentação). Nada enviado ao GitHub nem aplicado no banco.
- **Como:** leitura do código e das migrações; consultas **somente leitura** ao banco `bulqqdgfrrpqquqvjjfa`
  (políticas, gatilhos, chaves estrangeiras, privilégios de coluna, migrações aplicadas — última é a 025; nenhuma
  tabela `fin_*` nem linha `financeiro` em `hub_apps` ainda); testes de sonda com cenários concretos nos leitores
  (arquivo temporário, apagado depois); verificações automáticas na cópia do branch.

## Vereditos

| Item | Veredito |
| --- | --- |
| **027** | **Aprovada com ressalva.** Fecha a variante descrita no R-A1 e não quebra os fluxos legítimos. Resta **um caminho parecido (A-1)**: um **gestor** apaga um cliente de fachada e, em cascata, some o rastro do acesso de cliente. Como a 027 ainda não foi aplicada, dá para incluir a correção nela mesma antes de aplicar. |
| **026 (banco)** | **Segurança aprovada.** RLS, `security definer` com `search_path` fixo, permissão na primeira linha, cliente de outra organização e inserção direta: sem achado crítico ou alto. |
| **Telas e leitores (etapa 1)** | **Não liberar para uso (nem no piloto) antes de corrigir A-2 a A-5.** São erros que gravam extrato errado — e hoje não existe como desfazer uma importação. Como a 026 cria a linha `financeiro` em `hub_apps` já `ativo`, aplicar a 026 e fazer o push só depois das correções (ou criar o app como `em breve`). |

## Verificações automáticas

| Comando (na cópia `wt2`, branch `financeiro-etapa1`) | Resultado |
| --- | --- |
| `npm run verificar` | Ok — 22 arquivos de teste, **118 testes** passando, build completo com as rotas novas |
| `npm run telas` | Ok — **29 de 29 telas**, incluindo `/financeiro`, `/financeiro/extratos`, `/financeiro/plano` |

---

## Parte 1 — Migração 027

### O que foi conferido

| Ponto | Resultado | Evidência |
| --- | --- | --- |
| Variante do R-A1 (Atendimento cadastra o e-mail como cliente, cria a senha, desativa o acesso e espera o admin) | **Fechada** | `027:29` recusa qualquer linha em `portal_usuarios` da conta, ativa ou não. No banco, `portal_usuarios` **não tem política de DELETE** (só SELECT e UPDATE), e o gatilho `tg_portal_usuario_nao_equipe` impede trocar `user_id`/`cliente_id`/`org_id` no UPDATE. Quem gere o Atendimento não consegue apagar o rastro. |
| Ordem inversa (equipe convidada primeiro, cliente depois) | Fechada desde a 025 | `portal_convidar` (025:105-108) e gatilho `tg_portal_convite_sem_conta` (025:174) recusam e-mail com convite de equipe. |
| Admin convidando equipe nova | Ok | E-mail sem conta e sem convite de cliente → grava em `app.convites` (027:33-38). |
| Reenvio do convite de equipe | Ok | Convite de equipe pendente nunca convive com convite de cliente (gatilho acima), então a checagem 027:26 não dispara. |
| Membro já existente / reativação | Ok | 027:25 pula as recusas quando a conta já é membro da organização (inclusive inativo); o `on conflict` reativa. |
| Outros caminhos que criam membro | Sem furo novo | `hub_convidar` (015:153) chama `adicionar_membro`; `app.aplicar_convites` só consome `app.convites`; `criar_organizacao` está revogada para `authenticated` (016:13); política `membros_admin` (ALL, só admin) permite INSERT direto, mas o site não usa (único `from("membros")` de gravação é um UPDATE em `AbaEquipe.tsx:16`). |
| Fluxo legítimo que deixa de existir | Intencional | Cliente que vira funcionário com o **mesmo e-mail** não entra mais; documentado em `docs/05-seguranca-e-acessos.md:105`. |

### Achados da 027

- **A-1 (alto) — Gestor apaga o rastro apagando o cliente.** `portal_usuarios.cliente_id` tem `ON DELETE CASCADE`
  (consulta a `pg_constraint`: `portal_usuarios_cliente_id_fkey ... ON DELETE CASCADE`) e a política `clientes_write`
  (ALL) libera DELETE de cliente para `app.eh_gestor` (admin **ou gestor**); a tabela `clientes` não tem gatilho de
  exclusão. Cenário: o gestor cadastra um cliente de fachada, dá acesso de cliente ao e-mail do futuro funcionário,
  pega o link e cria a senha, depois **apaga o cliente** → as linhas de `portal_usuarios` somem em cascata → a conta
  fica sem nenhum vínculo → o admin adiciona o e-mail na equipe e a 027 aceita (`027:29` não acha nada) → o gestor
  entra como o funcionário (que pode ser admin). Fica registro em `hub_auditoria` (o gatilho do portal grava o
  INSERT), mas nada impede.
  **Correção sugerida (dentro da própria 027, ainda não aplicada):** guardar a marca "esta conta já foi de cliente"
  num lugar que não se apaga — por exemplo uma tabela `app.contas_de_cliente(user_id primary key)` preenchida por
  gatilho no INSERT de `portal_usuarios`, sem chave estrangeira em cascata e sem acesso pela API — e checar essa
  tabela em `adicionar_membro`. Alternativa mais simples, mas menos completa: trocar o `on delete cascade` de
  `portal_usuarios.cliente_id` para `restrict`.
- **B-1 (baixo) — Mensagem de convite de cliente antigo.** `027:27` manda usar outro e-mail; quando o convite de cliente
  é só um convite esquecido, a saída natural é cancelá-lo. Sugestão: "cancele o convite de cliente ou use outro e-mail".
- **A confirmar — cadastro aberto no Auth.** Se o cadastro público do Supabase Auth estiver ligado, qualquer pessoa
  cria uma conta com o e-mail de um futuro funcionário antes do convite, e `adicionar_membro` liga essa conta à
  equipe (não exige conta criada por convite). No banco há 2 de 7 contas sem `invited_at` (provavelmente criadas no
  painel). Confirmar no painel: Authentication › Sign In / Providers › "Allow new users to sign up" desligado.

---

## Parte 2 — Financeiro etapa 1

### Segurança do banco (026) — o que foi conferido

| Ponto | Resultado | Evidência |
| --- | --- | --- |
| `org_id` + RLS em todas as tabelas | Ok | 026:130-134; leitura por `app.hub_pode(org_id,'financeiro','ver')` (026:137-150). |
| Gravação direta | Ok | Plano, lotes e linhas sem política de INSERT/UPDATE/DELETE (026:151) → só pelas funções. Contas bancárias: INSERT/UPDATE com `operar`, sem DELETE. |
| Cliente de outra organização | Ok | `fin_importar_plano` tira a organização do cliente (026:158) e confere `operar` nela; `fin_importar_extrato` usa a organização da conta (026:200-202); gatilho `tg_fin_conta_bancaria` exige cliente da mesma organização e conta contábil do mesmo cliente (026:74-80) e trava troca de cliente/organização (026:81). |
| `security definer` | Ok | As três funções com `set search_path = public` e permissão conferida antes de gravar; `revoke ... from public, anon` e `grant` só a `authenticated`; gatilho revogado de todos. |
| Tipos à mão x 026 | Batem | Colunas e opcionais de `fin_*` em `database.types.ts` conferem com a 026; só `Relationships` vazio (o gerador vai preencher). Regenerar após aplicar, como previsto. |

### Achados — Financeiro

**Altos (corrigir antes de qualquer uso)**

- **A-2 — Lançamentos diferentes com o mesmo FITID são descartados em silêncio.** `ofx.ts:92` usa só o FITID como
  chave e `ofx.ts:103` não numera repetições quando há FITID. Teste de sonda: OFX com duas tarifas no mesmo dia
  (−0,50 e −12,00) e o mesmo `<FITID>20260110001` → chaves `["fitid:20260110001","fitid:20260110001"]`; no banco, o
  `on conflict do nothing` (026:216) grava só a primeira e conta a segunda como "repetida". Bancos brasileiros geram
  FITID repetido com frequência (FITID montado com data + documento). O saldo fica errado e ninguém vê.
  Correção: dentro do arquivo, se o mesmo FITID aparecer com data/valor/histórico diferentes, não confiar nele
  (cair para a chave data+valor+histórico+ordem, ou compor `fitid + data + valor`) e avisar na prévia.
- **A-3 — Cabeçalho "Data Lançamento" faz o histórico virar a data.** A regra do histórico (`extratoPlanilha.ts:14`)
  aceita qualquer coluna que **contenha** "LANCAMENTO", e a busca (`extratoPlanilha.ts:79`) pega a primeira. Teste:
  cabeçalho `Data Lançamento | Histórico | Valor` → `descricao: "05/01/2026"`. Correção: excluir a coluna da data e
  preferir HISTORICO/DESCRICAO antes de LANCAMENTO.
- **A-4 — Planilha com "Valor" sempre positivo e coluna D/C separada vira tudo entrada.** Quando há coluna `Valor`,
  o leitor ignora a coluna de natureza (`extratoPlanilha.ts:95`). Teste: `Data Mov. | Nr. Doc. | Histórico | Valor |
  Deb/Cred` com `50,00 | D` → `valor: 50` (entrada). Esse leiaute (valor sem sinal + coluna D/C ou "Tipo") é comum em
  extratos exportados em Excel/CSV. Correção: se existir coluna de natureza (D/C, Deb/Cred, Tipo, Entrada/Saída),
  aplicar o sinal por ela.
- **A-5 — Não há como desfazer uma importação errada.** Nenhuma política nem função apaga ou estorna um lote
  (026:151); conta errada escolhida, sinal invertido (A-4) ou arquivo trocado ficam para sempre no saldo. Correção:
  função `fin_excluir_lote(p_lote)` (com `operar`, só se nenhuma linha do lote estiver conciliada, registrada em
  `app.registrar`) e botão "Desfazer" no histórico de importações.

**Médios**

- **M-1 — OFX com mais de uma conta junta tudo numa só.** `lerOfx` parte o arquivo só por `<STMTTRN>` (`ofx.ts:53`) e
  lê o primeiro `ACCTID` (`ofx.ts:78`). Teste: OFX com dois `<STMTRS>` (contas 111 e 222) → 2 lançamentos, conta
  "111", sem aviso. Acontece em exportações de conta corrente + aplicação/poupança e em arquivos de cartão
  (`CCSTMTRS`). Correção: recusar (ou separar) arquivo com mais de um extrato.
- **M-2 — Saldo do banco não é conferido.** O OFX traz o saldo final (`LEDGERBAL`), que é gravado em
  `fin_extrato_lotes.saldo_final`, mas ninguém compara com o saldo calculado. Essa conferência pegaria A-2, A-4 e
  duplicidades de planilha. Sugestão: na prévia e no cartão da conta, "Saldo pelo HUB x saldo do banco" com alerta
  quando diferir.
- **M-3 — Data do saldo inicial ambígua (pode contar o dia em dobro).** `tipos.ts:77` soma lançamentos com
  `data >= saldo_inicial_em`. Se a pessoa digitar o saldo do fim do dia 31/12 (como aparece no extrato) com data
  31/12, os lançamentos de 31/12 entram duas vezes. Correção: usar `>` e rotular "saldo no fim do dia", ou rotular
  claramente "saldo no início do dia".
- **M-4 — Plano reimportado trava a edição da conta bancária.** Quando a conta contábil do banco sai do plano, a 026
  a inativa (026:179-180), e o gatilho exige conta analítica **ativa** em todo UPDATE (026:77-80). Resultado: não dá
  nem para desativar a conta bancária ou corrigir o saldo inicial sem escolher outra conta contábil, e o formulário
  mostra a lista vazia/sem a conta atual. Sugestão: o gatilho só confere a conta contábil quando
  `conta_contabil_id` muda; a tela de plano avisa, antes de gravar, quantas contas serão inativadas e quais estão
  ligadas a banco.
- **M-5 — Plano de outra empresa importado por engano.** A prévia do plano não confere se o arquivo é da empresa
  escolhida nem mostra quantas contas serão inativadas; um arquivo errado inativa o plano inteiro e deixa as contas
  erradas cadastradas para sempre (não há exclusão). Sugestão: mostrar na prévia "X novas, Y deixarão de existir" e
  pedir confirmação reforçada quando Y for grande.
- **M-6 — Saldo calculado no navegador lendo todo o histórico.** `/financeiro` carrega todas as linhas de todas as
  contas desde sempre (`page.tsx`, `lerLinhas(cliente.id)` sem período) a cada abertura. Com alguns anos de extrato
  fica lento. Sugestão: view ou função no banco que devolve o saldo por conta.
- **M-7 — Arquivos de tela acima de 400 linhas.** `financeiro/extratos/page.tsx` tem 502 linhas e
  `financeiro/page.tsx` 405. Separar importação/prévia e exportação em componentes.

**Baixos**

- **B-2** — Documentação diz que plano e extrato são "auditados" (`docs/05-seguranca-e-acessos.md`, linha nova), mas
  `fin_importar_extrato` não chama `app.registrar` e cadastro/edição de conta bancária também não deixa registro.
- **B-3** — `docs/README.md:20` (índice de módulos) não lista o Financeiro; checklist 8.5 também pede perfis padrão
  com a ferramenta nova (não alterados) e índices `(org_id, cliente_id, ...)` (as tabelas têm só `cliente_id`).
- **B-4** — `fin_importar_plano`: `distinct on (c.classificacao)` usa o valor sem `trim` e sem `order by`; duas
  linhas com a mesma classificação diferindo só por espaço derrubam a importação ("cannot affect row a second
  time"). O leitor do site já limpa, então só afeta chamada direta.
- **B-5** — `recebidas - novas` conta como "repetidas" também linhas descartadas por falta de data/valor/chave
  (026:215-219). Mensagem pode dizer "já estavam no HUB" para algo que na verdade foi rejeitado.
- **B-6** — OFX em XML com `&amp;` no histórico mostra o código literal; CSV em Windows-1252 depende do leitor de
  planilha (a confirmar com arquivo real).
- **B-7** — O aviso de conta diferente é calculado ao ler o arquivo; trocar a conta depois limpa a prévia (ok), mas
  quando a conta cadastrada não tem número nenhum aviso aparece.

### Leitura de OFX de bancos brasileiros — o que já está certo

SGML sem fechamento e XML (regex aceita os dois), `CHARSET:1252` (cai para Windows-1252 quando o UTF-8 quebra),
`TRNAMT` com vírgula ou ponto e milhar, `DTPOSTED` com fuso (`[-3:BRT]` ignorado, usa a data escrita), tag vazia
seguida de quebra de linha (testado: `<NAME>` vazio não "puxa" a linha seguinte). Ponto de atenção é o FITID (A-2) e
arquivos com mais de uma conta (M-1). **Antes do piloto, testar com um OFX real de cada banco** da MDC e da
Greencore (Itaú, Bradesco, BB, Caixa, Santander, Sicoob, Inter) e conferir o saldo final com o do banco.

### Chave do extrato entre reimportações

- Mesmo OFX duas vezes: estável (FITID ou data+valor+histórico+ordem). Ok.
- OFX com períodos sobrepostos sem FITID: estável — a ordem conta só lançamentos iguais no mesmo dia; se o primeiro
  arquivo tinha 1 tarifa e o segundo tem 2, a segunda entra como nova. Ok.
- **Mesma conta alimentada às vezes por OFX e às vezes por planilha: duplica tudo** (chaves de natureza diferente).
  Recomendo avisar na tela "use sempre o mesmo formato por conta" ou guardar o formato na conta.

### Tela para leigo (8.3)

Linguagem simples, filtros de período/conta/tipo/situação/busca, PDF e Excel do que está filtrado (com totais),
estados vazio/erro/carregando, prévia antes de gravar, mensagem clara de "nada novo": **ok**. Celular coberto pelo
`npm run telas`. Falta só o "desfazer importação" (A-5) e a conferência com o saldo do banco (M-2), que para o
público leigo são a forma de perceber um erro.

### Piloto HUB

Ainda não validado com MDC e Greencore (esperado: nada aplicado). A validação deve incluir pelo menos um OFX e uma
planilha reais por banco usado, comparando o saldo calculado com o saldo do extrato.

---

## Resumo sem jargão

- **Migração 027 (segurança dos convites):** resolve o problema apontado. Sobra uma brecha parecida: um **gestor**
  que apaga um cliente consegue apagar junto o rastro de que aquele e-mail já foi acesso de cliente. Dá para
  fechar isso na própria 027 antes de aplicar.
- **Financeiro (banco de dados):** bem protegido. Cada pessoa só vê e mexe no que a ferramenta Financeiro permite, e
  não há como gravar de fora das regras.
- **Financeiro (leitura dos extratos):** antes de usar, precisa corrigir quatro coisas: (1) quando o banco repete o
  "número do lançamento", o HUB joga fora lançamentos de verdade achando que são repetidos; (2) em planilhas com a
  coluna "Data Lançamento", o histórico aparece como a data; (3) em planilhas em que a saída vem marcada com "D" numa
  coluna separada, a saída entra como entrada; (4) não existe botão para desfazer uma importação errada. Também vale
  comparar o saldo calculado com o saldo que o banco informa no arquivo — isso mostra na hora quando algo saiu errado.
