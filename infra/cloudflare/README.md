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

## Convites por e-mail

O e-mail de convite sai pelo SMTP do Supabase. Sem SMTP próprio, o Supabase só entrega
para os e-mails da equipe do projeto; por isso a tela de cadastro mostra o link para
copiar e enviar por WhatsApp quando o e-mail não sai. Para enviar a qualquer pessoa,
configure o SMTP do Microsoft 365 em **Authentication › Emails › SMTP Settings**
(host `smtp.office365.com`, porta 587, usuário e senha de app da caixa remetente).
