-- Ledgra Link: papel api_bancaria_svc usa o schema extensions (o papel nasce nas migrações api_bancaria_*, que ficam no repositório do Ledgra Link).
-- Aplicada direto em produção em 09/11/2026 como "svc_usa_extensions" (versão 20261109191521) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

grant usage on schema extensions to api_bancaria_svc;