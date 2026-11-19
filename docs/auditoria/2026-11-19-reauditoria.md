# Reauditoria de verificação — 19/11/2026 (noite)

Pedida pelo Edvaldo para conferir o que ainda falta do [parecer de 19/11](2026-11-19-parecer.md). Feita pelo agente
`auditor-hub`, que não escreveu o código, só lendo: repositório, banco de produção (`bulqqdgfrrpqquqvjjfa`, só SELECT,
lista de migrações, permissões, Funções Edge e avisos; do Vault só os nomes) e o PR do Ledgra.

## Cabeçalho

- **Escopo:** main em `21a570e` (`da616db..21a570e`: 089 lembretes das tarefas, 091 pacotes de licença e o parecer);
  ramo `seg01-hub-integracao` em `c9b870b` (PR #5, 092 e `hub-integracao`, já em produção); Ledgra
  `plataforma/hub-integracao` em `83db0ef` (PR #50, não publicado); migrações aplicadas em produção sem arquivo no
  repositório, em especial as do Omie/BI de hoje.
- **Verificações automáticas** (main e ramo seg01): `npm run verificar` ok (tipos, lint com 0 erros e 22 avisos, 87
  arquivos com 696 testes, núcleo, build); `npm audit` 2 moderadas (sem mudança); `bash supabase/testes/rodar.sh` exit 0,
  blocos "(deve falhar)" conferidos por script (só rótulos trocados em `161_pacotes_091.sql:16` e
  `116_envio_053.sql:25`); I1–I14 da 092 ok. PR #50: testes dos arquivos tocados e `tsc` ok.
  `npm run telas` **não rodou** (precisa do site no ar com login; regra 9).
- **Avisos do Supabase:** anon com função definer: 7 (os mesmos). Authenticated com função definer: 175 → **190** (+15,
  todas do Omie/BI de hoje, com checagem por dentro). RLS sem política: 10 → 11 (`app.integracao_chamadas`, proposital).
  Nenhuma função com `search_path` solto.

## Veredito

**Aprovado com ressalvas, e a ressalva cresceu.** 0 críticos · 3 altos (SEG-01 parcial, ALT-02 piorou, NOV-01 novo) ·
12 médios · 10 baixos.

## Achados do parecer de 19/11

| ID | Situação | Evidência | O que falta |
| --- | --- | --- | --- |
| SEG-01 (alto) | **Parcial** | 092 aplicada (md5 igual ao arquivo) e `hub-integracao` v1 igual ao ramo; `app.integracao_chamadas` só com as 4 chamadas de teste das 22h45 (o Ledgra de produção ainda não usa); PR #50 tira todo uso de `HUB_SUPABASE_SERVICE_ROLE_KEY` | merge do PR #5; Edvaldo: token na Vercel, publicar PR #50, testar, gerar nova chave de serviço e apagar a antiga. **Até a troca, o risco segue inteiro** |
| ALT-02 (alto) | **Piorou** | 17 migrações em produção sem arquivo (eram 12): + `090_bi_gestao_omie`, `090b_bi_relatorio_digitos`, `090c_omie_agendamento`, `090_omie_gestao`, `091_omie_restaura_agendamento`; números repetidos 083, 090 e 091; Função `omie-sincronizar` v9 em nenhum ramo | ver NOV-02/03; trazer para `supabase/migrations/externas/` com a Função |
| SEG-03 | Em aberto (a confirmar) | `pessoal-voz` v9 ativa; `pessoal_voz_pode` sem "desligado" | Edvaldo: conferir/tirar `ANTHROPIC_API_KEY` |
| SEG-04 | Em aberto | `hub_senha_trocada()` só tira a marca | migração de segurança (número novo: o 089 foi usado pelas Tarefas) |
| SEG-05 | Em aberto | `lic_assinatura_abrir` devolve o `assinatura` inteiro; `086:121` usa o 1º `x-forwarded-for` | como no parecer; validade com o Dr. Itamar |
| SEG-06 | Em aberto | `lic_uso_informar` com teto 100000 | uso pela `hub-integracao` |
| SEG-07 | Em aberto, **maior** | `crm_receber_lead` e também `crm_raiox_conferir` (agora chamada pela `hub-integracao`) com `order by criado_em limit 1` | `slug = 'mdc'` nas duas |
| ARQ-08 | Em aberto | `web.yml` igual | job com Postgres e `supabase/testes` |
| ARQ-09 | Em aberto, **piorou** | 092 publicada antes do merge; duas sessões aplicaram 090/091 do Omie no mesmo dia | homologação e "só vai para produção o que está na main" |
| COD-10 | Em aberto | `uuid` via `exceljs` | acompanhar |
| DES-11 | Em aberto | `AssistenteContrato.tsx:264`, `AssistenteItem.tsx:262` | ação principal primeiro |
| DES-12 | Parcial | 259 de 618 botões sem ícone; as telas novas (pacotes, avisos) cumprem | tela a tela |
| COD-13 | Em aberto | 22 avisos; `AssistenteContrato` 644 → 657 linhas | dividir ao mexer |
| SEG-14 a SEG-17, ARQ-18 | Em aberto | sem mudança | como no parecer |

## Achados novos

### Alto

**NOV-01 · Administrador de qualquer organização, inclusive pessoal, escolhe de qual conta Omie a empresa dele é
sincronizada.** A Função `omie-sincronizar` lê `Deno.env.get(\`OMIE_${credencial}_KEY\`)` pelo nome gravado na linha, e a
política `omie_emp_gerir` (090) libera insert/update a `app.papel(org) = 'admin'` com o cliente da organização (grant a
authenticated), sem `hub_pode` e sem a trava de organização pessoal. Uma família do MDC · Pessoal (cadastro aberto) grava
`credencial = 'CLARA_COMPANY'` no próprio cliente e recebe na rodada seguinte notas e títulos da Clara com o JSON
completo. Hoje ela não consegue ler (`bi_pode_ver` falso), mas a cópia indevida e o consumo da fila acontecem.
Conclusão pela política e pelo código (não exercitado em produção). **Correção:** revogar insert/update de
authenticated; gravar só por função com `hub_pode(org,'bi_gestao','gerir')` e organização não pessoal; ligar a
credencial ao CNPJ (conferir na Omie) ou usar a chave no Vault por cliente, como a `omie_conta_salvar`.

### Médios

- **NOV-02 · Duas implementações do Omie em produção, colididas e fora do repositório.** Modelo A (`omie_empresas`,
  `omie_notas`, `bi_*`, módulo `bi_gestao`; chaves como segredos da Função) funcionando com as 3 empresas do Grupo
  Clara. Modelo B (`omie_contas`, `omie_registros`, `gestao_*`, módulo `demonstrativos`; chaves no Vault) sem conexões,
  mas com plano e classificações semeados e 11 funções abertas ao authenticated. O B redefiniu `omie_token_confere` e o
  cron; a `091_omie_restaura_agendamento` desfez. Os dois montam a DRE de formas diferentes (notas × títulos). No B,
  `gestao_complementar_excluir` apaga de verdade e `gestao_complementar_salvar` não audita. **Decisão do Edvaldo:**
  qual modelo fica; remover o outro numa migração nova e trazer o escolhido para o repositório com testes e docs.
- **NOV-03 · Dados reais fora do piloto e dados de cliente no SQL.** O Grupo Clara não é do "Piloto HUB" (regra 8) e a
  carga guarda o JSON completo das notas. A `090_omie_gestao` traz no próprio SQL nomes de sócios e contratos de
  empréstimo: ao trazer para o repositório, separar a carga do cliente da estrutura.
- **NOV-04 · 092 e Função publicadas antes do merge** (PR #5 aberto; `database.types.ts` da main sem a 092).

### Baixos

| ID | Achado |
| --- | --- |
| NOV-05 | Modelo A: anon com SELECT em 11 tabelas `omie_*`/`bi_*` e escrita em 4 `bi_*` (as políticas barram hoje); `bi_linhas_ver` deixa qualquer logado ler nomes de linhas de outra organização |
| NOV-06 | `bi_complementar_importar` escolhe a organização pelo CNPJ da 1ª linha (`limit 1`) |
| NOV-07 | 089 sem teste SQL; lembrete não confere acesso atual a Tarefas; título e cliente na tela bloqueada |
| NOV-08 | `161_pacotes_091.sql:16` marcado "deve falhar" e não falha (RLS dá 0 linhas) |
| NOV-09 | `hub-integracao`: chamada recusada sempre grava linha, sem limite; `sistema in ACOES` aceita propriedade herdada (usar `Object.hasOwn`) |
| NOV-10 | Segredo órfão `omie_sinc_token` ao lado do `omie_sync_token` em uso |

**PR #50 do Ledgra:** sem achado próprio. Observação fora do PR: `bun install --frozen-lockfile` falha porque o
`bun.lock` não tem `@types/qrcode`; conferir a main do Ledgra.

**Bom do que entrou:** 089 (lembretes registrados, validade de 15 min, `search_path` vazio, fechada ao site) e 091
(pacotes com `gerir`, um sistema por pacote, preço adicional só por `lic_valores`; P10 confirma); telas novas com ícone,
filtros, Excel/PDF; Manual e docs 04/06 em dia.

## O que falta, em ordem

**Só código**
1. NOV-01: fechar a gravação de `omie_empresas` e testar no Postgres local.
2. Merge do PR #5 (092) na main.
3. ALT-02 + NOV-02/03: trazer as 17 migrações e a `omie-sincronizar` para `supabase/migrations/externas/`, sem os dados
   do cliente; registrar 036 partes, 043/045 e os números repetidos 083/090/091.
4. Migração de segurança com número novo: SEG-04 a SEG-07 (incluindo `crm_raiox_conferir`), com testes.
5. ARQ-08 (testes SQL no CI, com teste da 089).
6. Telas e baixos: DES-11, DES-12, COD-13, SEG-14 a 17, ARQ-18, NOV-05/06/08/09.

**Depende do Edvaldo**
1. SEG-01: token na Vercel do Ledgra → publicar PR #50 → testar → nova chave de serviço do HUB e apagar a antiga.
2. NOV-02: escolher o modelo do Omie e combinar com as outras sessões que nada vai para produção sem estar na main.
3. NOV-03: autorizar ou não o Grupo Clara fora do Piloto HUB.
4. SEG-03: tirar `ANTHROPIC_API_KEY` dos segredos das Funções.
5. ALT-02: API bancária no projeto do HUB ou em projeto próprio.
6. SEG-05: parecer do Dr. Itamar sobre a assinatura pelo link.
7. Depois do NOV-02: apagar o segredo `omie_sinc_token` do Vault.
