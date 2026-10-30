# Endereço público do HUB-MDC: mdcassessoria.com/hub-mdc

O app roda na Vercel (`mdc-tarefas.vercel.app/hub-mdc`, `basePath` no `web/next.config.ts`).
O site institucional continua na Hostinger. O DNS do domínio já está na Cloudflare,
que repassa só o caminho `/hub-mdc` para a Vercel com o Worker deste diretório.

## Passo a passo (uma vez)

1. **Cloudflare › SSL/TLS › Visão geral:** modo **Full (strict)**. A Hostinger já tem certificado válido para o domínio.
2. **Cloudflare › DNS:** nos registros `mdcassessoria.com` (A) e `www` (CNAME), ligar o **proxy (nuvem laranja)**.
   O Worker só funciona em registros com proxy. Teste o site institucional logo depois.
3. **Workers e Pages › Criar › Worker:** nome `hub-mdc`, colar `hub-mdc-worker.js` e publicar.
4. **No Worker › Configurações › Domínios e rotas › Adicionar rota:**
   - `mdcassessoria.com/hub-mdc*` (zona mdcassessoria.com)
   - `www.mdcassessoria.com/hub-mdc*`
5. **Supabase › Authentication › URL Configuration:**
   - Site URL: `https://mdcassessoria.com/hub-mdc`
   - Redirect URLs: `https://mdcassessoria.com/hub-mdc/**` e `https://mdc-tarefas.vercel.app/hub-mdc/**`
6. **Supabase › Authentication › Sign In / Providers:** desligar **Allow new users to sign up**
   (as contas passam a ser criadas só por convite do administrador).
7. **Site (WordPress):** botão/menu “Área do cliente / HUB-MDC” apontando para `https://mdcassessoria.com/hub-mdc`.

## E-mails do Hub (convite e "esqueci a senha"): hub@mdcassessoria.com

Remetente: caixa **hub@mdcassessoria.com** no Microsoft 365, usada só para envio.

1. **Microsoft 365 › Admin › Usuários ativos › hub@ › Email › Gerenciar aplicativos de email:** marcar **SMTP autenticado**.
   Se o locatário usa "Padrões de segurança" (MFA obrigatório), o SMTP autenticado fica bloqueado:
   desligar os padrões e usar Acesso Condicional, ou usar um serviço de envio (Resend/Brevo) com o domínio.
2. **Supabase › Authentication › Emails › SMTP Settings › Enable custom SMTP:**
   - Sender email: `hub@mdcassessoria.com` · Sender name: `MDC Assessoria`
   - Host: `smtp.office365.com` · Port: `587`
   - Username: `hub@mdcassessoria.com` · Password: a senha da caixa (**digitada por você no painel**)
3. **Supabase › Authentication › Emails › Templates:**
   - *Invite user*: assunto `Seu acesso ao HUB-MDC`, corpo = `supabase/templates/convite.html`
   - *Reset password*: assunto `HUB-MDC: criar nova senha`, corpo = `supabase/templates/recuperar-senha.html`
4. **Supabase › Authentication › Rate limits:** subir "emails sent per hour" para 30.
5. **Cloudflare › DNS:** o SPF do domínio deve conter `include:spf.protection.outlook.com` (já é o padrão do 365).

Enquanto o SMTP não estiver ativo, o Supabase só entrega para os e-mails da equipe do projeto;
a tela de cadastro mostra o link do convite para copiar e enviar por WhatsApp quando o e-mail não sai.
