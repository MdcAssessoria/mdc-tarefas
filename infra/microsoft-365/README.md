# Acesso do HUB à pasta de balancetes no SharePoint (para o TI, uma vez só)

O HUB lê a pasta de balancetes a cada 15 minutos pela Microsoft Graph. Para isso precisa de um **aplicativo no
Microsoft Entra ID** com acesso **somente ao site** onde fica a pasta (permissão `Sites.Selected`). Nada no código
guarda senha: o segredo do aplicativo fica nos segredos da Função Edge do Supabase.

> Quem faz: administrador do Microsoft 365 da MDC. Tempo: ~20 minutos.
> O Edvaldo (administrador do HUB) digita o segredo no painel do Supabase; ninguém manda o segredo por e-mail ou chat.

## 1. Criar a pasta

1. No SharePoint, escolha (ou crie) o site que vai guardar os balancetes. Ex.: `https://mdcassessoria.sharepoint.com/sites/HUB`.
2. Na biblioteca **Documentos**, crie a pasta `HUB-MDC/Balancetes/Entrada`.
   O HUB cria sozinho, dentro dela, as subpastas **Processados** e **Com problema**.

## 2. Registrar o aplicativo no Entra ID

1. Acesse **entra.microsoft.com › Aplicativos › Registros de aplicativo › Novo registro**.
   - Nome: `HUB-MDC Balancetes` · Contas: *somente este diretório* · sem URI de redirecionamento.
2. Anote o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**.
3. **Certificados e segredos › Novo segredo do cliente** (validade: 24 meses). Copie o **Valor** na hora (ele só aparece uma vez).
4. **Permissões de API › Adicionar › Microsoft Graph › Permissões de aplicativo › `Sites.Selected`** e clique em
   **Conceder consentimento do administrador**.

## 3. Liberar o aplicativo só para o site da pasta

`Sites.Selected` começa sem acesso a nada. Libere o site com o PowerShell (módulo PnP) ou pelo Graph Explorer:

```powershell
# PowerShell 7 + PnP.PowerShell, logado como administrador do SharePoint
Connect-PnPOnline -Url https://mdcassessoria.sharepoint.com/sites/HUB -Interactive -ClientId <app do PnP da MDC>
Grant-PnPAzureADAppSitePermission -AppId <ID do aplicativo HUB-MDC Balancetes> -DisplayName "HUB-MDC Balancetes" -Site https://mdcassessoria.sharepoint.com/sites/HUB -Permissions Write
```

Ou no Graph Explorer (logado como administrador): `POST https://graph.microsoft.com/v1.0/sites/{id-do-site}/permissions`
com o corpo:

```json
{ "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "<ID do aplicativo>", "displayName": "HUB-MDC Balancetes" } }] }
```

`write` é necessário porque o HUB **move** o arquivo para Processados/Com problema depois de ler.

## 4. Cadastrar os segredos no Supabase (Edvaldo)

Painel do Supabase › projeto `bulqqdgfrrpqquqvjjfa` › **Edge Functions › Secrets › Add new secret**:

| Nome | Valor |
| --- | --- |
| `MS_TENANT_ID` | ID do diretório (locatário) |
| `MS_CLIENT_ID` | ID do aplicativo (cliente) |
| `MS_CLIENT_SECRET` | Valor do segredo do cliente |

## 5. Ligar no HUB (Edvaldo)

HUB › **Configurações › Integrações**: endereço do site, biblioteca (`Documentos`) e pasta (`HUB-MDC/Balancetes/Entrada`),
**Salvar e ligar** e **Testar conexão**. A mensagem esperada é "Conexão ok…". Depois disso, cada arquivo colocado na pasta
aparece como rascunho em Demonstrativos em até 15 minutos, com aviso no sino, e fica registrado em
**Demonstrativos › Histórico de importações**.

## Renovação do segredo

O segredo vence (24 meses). Um mês antes: crie um segredo novo no Entra ID, troque `MS_CLIENT_SECRET` no Supabase e
apague o antigo. Sugestão: cadastre o vencimento em **Vencimentos** no próprio HUB.
