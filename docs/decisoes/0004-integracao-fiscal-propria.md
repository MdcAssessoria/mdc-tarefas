# 0004 · Integração fiscal própria num serviço separado (Cloud Run)

**Situação:** aceita (30–31/10/2026, decisão do Edvaldo).

**Decisão.** Emissão e recebimento de NF-e/NFS-e sem API paga de terceiros: o HUB fala direto com as SEFAZ
(Distribuição DF-e, autorização, eventos) e com o ambiente nacional da NFS-e, usando bibliotecas maduras
(ex.: sped-nfe/NFePHP ou PyNFe), num **serviço fiscal separado** no Google Cloud Run (região São Paulo, cota
gratuita mensal). O serviço só assina e transmite; XML, PDF e protocolos ficam no Supabase, sem exclusão.
Integra Contador (Serpro) para guias entra num segundo momento, após a implantação.

**Cuidados registrados pela auditoria.** O certificado A1 do cliente não deve trafegar livre a cada chamada
(decidir entre o serviço ler do Cofre com credencial própria ou guardar no Secret Manager); fila com repetição e
idempotência; numeração de nota sem buracos; o HUB calcula os tributos e o serviço só monta e assina o XML;
`hub_certificados` precisa passar a ser por cliente.

**Pendência.** Conta do Google Cloud: o Edvaldo cria e faz login; depois o projeto `hub-mdc-fiscal` é configurado.
