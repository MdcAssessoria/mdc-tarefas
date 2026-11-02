// XMLs FICTÍCIOS para os testes (empresas, chaves e valores inventados; nenhum dado real de cliente).
// Destinatária: 12.345.678/0001-95 (empresa de teste). Fornecedor: 11.222.333/0001-81.

export const CNPJ_EMPRESA = "12345678000195";
export const CNPJ_FORNECEDOR = "11222333000181";
export const CHAVE_NFE = "35261011222333000181550010000012341123456780";
export const CHAVE_NFSE = "35034012112223330001810000000000000526100000000001";

export const PROC_NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE_NFE}" versao="4.00">
      <ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>1234</nNF>
        <dhEmi>2026-10-20T10:15:00-03:00</dhEmi><tpNF>1</tpNF></ide>
      <emit><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><xNome>Fornecedor de Teste &amp; Cia Ltda</xNome><IE>111111111111</IE>
        <enderEmit><xMun>Atibaia</xMun><UF>SP</UF></enderEmit></emit>
      <dest><CNPJ>${CNPJ_EMPRESA}</CNPJ><xNome>Empresa de Teste Ltda</xNome></dest>
      <det nItem="1">
        <prod><cProd>ABC-1</cProd><cEAN>SEM GTIN</cEAN><xProd>Parafuso sextavado 10mm (cx 100)</xProd><NCM>73181500</NCM>
          <CFOP>5102</CFOP><uCom>CX</uCom><qCom>10.0000</qCom><vUnCom>50.0000000000</vUnCom><vProd>500.00</vProd>
          <vFrete>20.00</vFrete><vDesc>10.00</vDesc></prod>
        <imposto>
          <ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>510.00</vBC><pICMS>18.00</pICMS><vICMS>91.80</vICMS></ICMS00></ICMS>
          <IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>500.00</vBC><pIPI>5.00</pIPI><vIPI>25.00</vIPI></IPITrib></IPI>
          <PIS><PISAliq><CST>01</CST><vBC>500.00</vBC><pPIS>1.65</pPIS><vPIS>8.25</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><CST>01</CST><vBC>500.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>38.00</vCOFINS></COFINSAliq></COFINS>
          <IBSCBS><CST>000</CST><gIBSCBS><vBC>500.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.50</vIBSUF></gIBSUF>
            <vIBS>0.50</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>4.50</vCBS></gCBS></gIBSCBS></IBSCBS>
        </imposto>
      </det>
      <det nItem="2">
        <prod><cProd>XYZ-9</cProd><cEAN>7890000000017</cEAN><xProd>Óleo lubrificante 1L</xProd><NCM>27101932</NCM>
          <CFOP>5405</CFOP><uCom>UN</uCom><qCom>4.0000</qCom><vUnCom>25.0000000000</vUnCom><vProd>100.00</vProd></prod>
        <imposto>
          <ICMS><ICMS60><orig>0</orig><CST>60</CST></ICMS60></ICMS>
          <PIS><PISNT><CST>04</CST></PISNT></PIS>
          <COFINS><COFINSNT><CST>04</CST></COFINSNT></COFINS>
        </imposto>
      </det>
      <total><ICMSTot><vBC>510.00</vBC><vICMS>91.80</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>600.00</vProd>
        <vFrete>20.00</vFrete><vSeg>0.00</vSeg><vDesc>10.00</vDesc><vIPI>25.00</vIPI><vPIS>8.25</vPIS><vCOFINS>38.00</vCOFINS>
        <vOutro>0.00</vOutro><vNF>635.00</vNF></ICMSTot>
        <IBSCBSTot><vBCIBSCBS>500.00</vBCIBSCBS><gIBS><vIBS>0.50</vIBS></gIBS><gCBS><vCBS>4.50</vCBS></gCBS></IBSCBSTot></total>
      <cobr><dup><nDup>001</nDup><dVenc>2026-11-20</dVenc><vDup>317.50</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-12-20</dVenc><vDup>317.50</vDup></dup></cobr>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${CHAVE_NFE}</chNFe><dhRecbto>2026-10-20T10:16:02-03:00</dhRecbto>
    <nProt>135260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

export const RES_NFE = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${CHAVE_NFE}</chNFe><CNPJ>${CNPJ_FORNECEDOR}</CNPJ>
<xNome>Fornecedor de Teste &amp; Cia Ltda</xNome><IE>111111111111</IE><dhEmi>2026-10-20T10:15:00-03:00</dhEmi><tpNF>1</tpNF>
<vNF>635.00</vNF><digVal>AAAA</digVal><dhRecbto>2026-10-20T10:16:02-03:00</dhRecbto><nProt>135260000000001</nProt><cSitNFe>1</cSitNFe></resNFe>`;

export const RES_EVENTO_CANCELAMENTO = `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><cOrgao>35</cOrgao><CNPJ>${CNPJ_FORNECEDOR}</CNPJ>
<chNFe>${CHAVE_NFE}</chNFe><dhEvento>2026-10-21T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento>
<xEvento>Cancelamento</xEvento><dhRecbto>2026-10-21T09:00:05-03:00</dhRecbto><nProt>135260000000099</nProt></resEvento>`;

export const NFSE = `<?xml version="1.0" encoding="utf-8"?>
<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFS${CHAVE_NFSE}">
    <xLocEmi>Atibaia</xLocEmi><nNFSe>52</nNFSe><xTribNac>Consultoria empresarial</xTribNac><cStat>100</cStat>
    <dhProc>2026-10-15T14:00:00-03:00</dhProc><nDFSe>998877</nDFSe>
    <emit><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><IM>12345</IM><xNome>Consultoria de Teste Ltda</xNome><enderNac><UF>SP</UF></enderNac></emit>
    <valores><vBC>2000.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>40.00</vISSQN><vTotalRet>70.00</vTotalRet><vLiq>1930.00</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS350340121122233300018100001000000000000052">
      <tpAmb>1</tpAmb><dhEmi>2026-10-15T13:59:00-03:00</dhEmi><serie>1</serie><nDPS>52</nDPS><dCompet>2026-10-15</dCompet>
      <prest><CNPJ>${CNPJ_FORNECEDOR}</CNPJ></prest>
      <toma><CNPJ>${CNPJ_EMPRESA}</CNPJ><xNome>Empresa de Teste Ltda</xNome></toma>
      <serv><cServ><cTribNac>170101</cTribNac><xDescServ>Assessoria em gestão</xDescServ><cNBS>113011000</cNBS></cServ></serv>
      <valores><vServPrest><vServ>2000.00</vServ></vServPrest>
        <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>
          <tribFed><piscofins><CST>01</CST><vBCPisCofins>2000.00</vBCPisCofins><pAliqPis>0.65</pAliqPis><pAliqCofins>3.00</pAliqCofins>
            <vPis>13.00</vPis><vCofins>60.00</vCofins><tpRetPisCofins>1</tpRetPisCofins></piscofins><vRetIRRF>30.00</vRetIRRF><vRetCSLL>40.00</vRetCSLL></tribFed>
        </trib></valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;

export const RET_DIST = (docs: { nsu: number; schema: string; zip: string }[], cStat = "138", ultNSU = 0, maxNSU = 0) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult>
<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><verAplic>1.7.6</verAplic><cStat>${cStat}</cStat>
<xMotivo>${cStat === "137" ? "Nenhum documento localizado" : "Documento(s) localizado(s)"}</xMotivo><dhResp>2026-11-01T10:00:00-03:00</dhResp>
<ultNSU>${String(ultNSU).padStart(15, "0")}</ultNSU><maxNSU>${String(maxNSU).padStart(15, "0")}</maxNSU>
${docs.length ? `<loteDistDFeInt>${docs.map((d) => `<docZip NSU="${String(d.nsu).padStart(15, "0")}" schema="${d.schema}">${d.zip}</docZip>`).join("")}</loteDistDFeInt>` : ""}
</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;

export const RET_EVENTO = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeRecepcaoEventoNFResult xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
<idLote>1</idLote><tpAmb>1</tpAmb><verAplic>AN_1.0</verAplic><cOrgao>91</cOrgao><cStat>128</cStat><xMotivo>Lote de evento processado</xMotivo>
<retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><verAplic>AN_1.0</verAplic><cOrgao>91</cOrgao><cStat>135</cStat>
<xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${CHAVE_NFE}</chNFe><tpEvento>210200</tpEvento>
<xEvento>Confirmacao da Operacao</xEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-01T10:05:00-03:00</dhRegEvento>
<nProt>891260000000123</nProt></infEvento></retEvento></retEnvEvento></nfeRecepcaoEventoNFResult></soap:Body></soap:Envelope>`;

// ---------------------------------------------------------------- exemplos completos para o espelho (DANFE/DANFSe)

export const CHAVE_NFE_COMPLETA = "35261011222333000181550010000056781987654321";
export const CHAVE_NFSE_COMPLETA = "35034012112223330001810000000000008726100000000007";
export const CHAVE_CTE = "35261099888777000166570010000004321123456789";

/** NF-e 55 com endereços, transporte, volumes, fatura, pagamento, informação adicional por item e do fisco. */
export const PROC_NFE_COMPLETA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE_NFE_COMPLETA}" versao="4.00">
      <ide><cUF>35</cUF><natOp>Venda de mercadoria adquirida de terceiros</natOp><mod>55</mod><serie>1</serie><nNF>5678</nNF>
        <dhEmi>2026-10-22T08:30:00-03:00</dhEmi><dhSaiEnt>2026-10-22T14:05:00-03:00</dhSaiEnt><tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
      <emit><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><xNome>Fornecedor de Teste &amp; Cia Ltda</xNome><xFant>Fornecedor Teste</xFant>
        <enderEmit><xLgr>Rua das Indústrias</xLgr><nro>1500</nro><xCpl>Galpão 3</xCpl><xBairro>Distrito Industrial</xBairro>
          <cMun>3504107</cMun><xMun>Atibaia</xMun><UF>SP</UF><CEP>12940000</CEP><fone>1144112233</fone></enderEmit>
        <IE>111111111111</IE><IEST>222222222222</IEST><CRT>3</CRT></emit>
      <dest><CNPJ>${CNPJ_EMPRESA}</CNPJ><xNome>Empresa de Teste Ltda</xNome>
        <enderDest><xLgr>Avenida Central</xLgr><nro>200</nro><xBairro>Centro</xBairro><cMun>3507605</cMun><xMun>Bragança Paulista</xMun>
          <UF>SP</UF><CEP>12900000</CEP><fone>11940001234</fone></enderDest><indIEDest>1</indIEDest><IE>333333333333</IE></dest>
      <det nItem="1">
        <prod><cProd>ABC-1</cProd><cEAN>SEM GTIN</cEAN><xProd>Parafuso sextavado 10mm (cx 100)</xProd><NCM>73181500</NCM>
          <CFOP>5102</CFOP><uCom>CX</uCom><qCom>10.0000</qCom><vUnCom>50.0000000000</vUnCom><vProd>500.00</vProd></prod>
        <imposto><vTotTrib>120.00</vTotTrib>
          <ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>500.00</vBC><pICMS>18.00</pICMS><vICMS>90.00</vICMS></ICMS00></ICMS>
          <IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>500.00</vBC><pIPI>5.00</pIPI><vIPI>25.00</vIPI></IPITrib></IPI>
          <PIS><PISAliq><CST>01</CST><vBC>500.00</vBC><pPIS>1.65</pPIS><vPIS>8.25</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><CST>01</CST><vBC>500.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>38.00</vCOFINS></COFINSAliq></COFINS>
        </imposto>
        <infAdProd>Lote 2026-10 · validade indeterminada</infAdProd>
      </det>
      <det nItem="2">
        <prod><cProd>XYZ-9</cProd><cEAN>7890000000017</cEAN><xProd>Óleo lubrificante 1L</xProd><NCM>27101932</NCM>
          <CFOP>5405</CFOP><uCom>UN</uCom><qCom>4.0000</qCom><vUnCom>25.0000000000</vUnCom><vProd>100.00</vProd></prod>
        <imposto><ICMS><ICMS60><orig>0</orig><CST>60</CST></ICMS60></ICMS>
          <PIS><PISNT><CST>04</CST></PISNT></PIS><COFINS><COFINSNT><CST>04</CST></COFINSNT></COFINS></imposto>
      </det>
      <det nItem="3">
        <prod><cProd>LUV-3</cProd><cEAN>SEM GTIN</cEAN><xProd>Luva de proteção nitrílica tamanho G (par)</xProd><NCM>40151900</NCM>
          <CFOP>5102</CFOP><uCom>PAR</uCom><qCom>20.0000</qCom><vUnCom>7.5000000000</vUnCom><vProd>150.00</vProd></prod>
        <imposto><ICMS><ICMS00><orig>2</orig><CST>00</CST><vBC>150.00</vBC><pICMS>12.00</pICMS><vICMS>18.00</vICMS></ICMS00></ICMS>
          <PIS><PISAliq><CST>01</CST><vBC>150.00</vBC><pPIS>1.65</pPIS><vPIS>2.48</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><CST>01</CST><vBC>150.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>11.40</vCOFINS></COFINSAliq></COFINS></imposto>
      </det>
      <total><ICMSTot><vBC>650.00</vBC><vICMS>108.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>750.00</vProd>
        <vFrete>30.00</vFrete><vSeg>0.00</vSeg><vDesc>5.00</vDesc><vII>0.00</vII><vIPI>25.00</vIPI><vPIS>10.73</vPIS><vCOFINS>49.40</vCOFINS>
        <vOutro>0.00</vOutro><vNF>800.00</vNF><vTotTrib>120.00</vTotTrib></ICMSTot></total>
      <transp><modFrete>0</modFrete>
        <transporta><CNPJ>99888777000166</CNPJ><xNome>Transportadora Exemplo Ltda</xNome><IE>444444444444</IE>
          <xEnder>Rodovia Fernão Dias, km 50</xEnder><xMun>Atibaia</xMun><UF>SP</UF></transporta>
        <veicTransp><placa>ABC1D23</placa><UF>SP</UF><RNTC>12345678</RNTC></veicTransp>
        <vol><qVol>3</qVol><esp>CAIXA</esp><marca>FT</marca><nVol>1-3</nVol><pesoL>42.500</pesoL><pesoB>45.000</pesoB></vol>
        <vol><qVol>1</qVol><esp>FARDO</esp><pesoL>8.000</pesoL><pesoB>8.400</pesoB></vol></transp>
      <cobr><fat><nFat>5678</nFat><vOrig>800.00</vOrig><vDesc>0.00</vDesc><vLiq>800.00</vLiq></fat>
        <dup><nDup>001</nDup><dVenc>2026-11-21</dVenc><vDup>400.00</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-12-21</dVenc><vDup>400.00</vDup></dup></cobr>
      <pag><detPag><tPag>15</tPag><vPag>800.00</vPag></detPag></pag>
      <infAdic><infAdFisco>Documento emitido por ME ou EPP: não.</infAdFisco>
        <infCpl>Pedido de compra 4521. Entrega no galpão 2, das 8h às 17h. Valor aproximado dos tributos R$ 120,00 (15,00%) - Fonte IBPT.</infCpl></infAdic>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${CHAVE_NFE_COMPLETA}</chNFe><dhRecbto>2026-10-22T08:31:10-03:00</dhRecbto>
    <nProt>135260000000777</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

/** NFS-e Nacional com endereços, ISS retido pelo tomador, retenções federais e informação complementar. */
export const NFSE_COMPLETA = `<?xml version="1.0" encoding="utf-8"?>
<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFS${CHAVE_NFSE_COMPLETA}">
    <xLocEmi>Atibaia</xLocEmi><xLocPrestacao>Bragança Paulista</xLocPrestacao><nNFSe>87</nNFSe><cLocIncid>3507605</cLocIncid>
    <xLocIncid>Bragança Paulista</xLocIncid><xTribNac>Assessoria ou consultoria de qualquer natureza</xTribNac><verAplic>1.0</verAplic>
    <ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat><dhProc>2026-10-25T09:12:00-03:00</dhProc><nDFSe>1122334</nDFSe>
    <emit><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><IM>12345</IM><xNome>Consultoria de Teste Ltda</xNome>
      <enderNac><xLgr>Rua do Comércio</xLgr><nro>45</nro><xBairro>Centro</xBairro><cMun>3504107</cMun><UF>SP</UF><CEP>12940100</CEP></enderNac>
      <fone>1144556677</fone><email>contato@consultoria.teste</email></emit>
    <valores><vCalcDR>0.00</vCalcDR><vBC>5000.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>100.00</vISSQN><vTotalRet>407.50</vTotalRet><vLiq>4592.50</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS350410711222333000181000010000000000000087">
      <tpAmb>1</tpAmb><dhEmi>2026-10-25T09:10:00-03:00</dhEmi><verAplic>1.0</verAplic><serie>1</serie><nDPS>87</nDPS><dCompet>2026-10-24</dCompet>
      <tpEmit>1</tpEmit><cLocEmi>3504107</cLocEmi>
      <prest><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>
      <toma><CNPJ>${CNPJ_EMPRESA}</CNPJ><xNome>Empresa de Teste Ltda</xNome>
        <end><endNac><cMun>3507605</cMun><CEP>12900000</CEP></endNac><xLgr>Avenida Central</xLgr><nro>200</nro><xBairro>Centro</xBairro></end>
        <fone>11940001234</fone><email>financeiro@empresa.teste</email></toma>
      <serv><locPrest><cLocPrestacao>3507605</cLocPrestacao></locPrest>
        <cServ><cTribNac>170101</cTribNac><cTribMun>001</cTribMun>
          <xDescServ>Consultoria em gestão financeira referente a outubro de 2026:
- revisão do fluxo de caixa e das contas a pagar;
- reunião mensal com a diretoria (4 horas);
- relatório de indicadores.</xDescServ><cNBS>113011000</cNBS></cServ>
        <infoCompl><xInfComp>Contrato 2026/015. Retenções conforme a legislação federal.</xInfComp></infoCompl></serv>
      <valores><vServPrest><vServ>5000.00</vServ></vServPrest>
        <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>2</tpRetISSQN><pAliq>2.00</pAliq></tribMun>
          <tribFed><piscofins><CST>01</CST><vBCPisCofins>5000.00</vBCPisCofins><pAliqPis>0.65</pAliqPis><pAliqCofins>3.00</pAliqCofins>
            <vPis>32.50</vPis><vCofins>150.00</vCofins><tpRetPisCofins>1</tpRetPisCofins></piscofins><vRetCP>0.00</vRetCP><vRetIRRF>75.00</vRetIRRF><vRetCSLL>50.00</vRetCSLL></tribFed>
          <totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;

/** NFS-e municipal no padrão ABRASF 2.04 (CompNfse), com ISS retido. */
export const NFSE_ABRASF = `<?xml version="1.0" encoding="UTF-8"?>
<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse versao="2.04"><InfNfse Id="nfse321">
  <Numero>321</Numero><CodigoVerificacao>AB12-CD34</CodigoVerificacao><DataEmissao>2026-10-18T11:00:00</DataEmissao>
  <ValoresNfse><BaseCalculo>1500.00</BaseCalculo><Aliquota>5.00</Aliquota><ValorIss>75.00</ValorIss><ValorLiquidoNfse>1425.00</ValorLiquidoNfse></ValoresNfse>
  <PrestadorServico><RazaoSocial>Manutenção Municipal de Teste Ltda</RazaoSocial>
    <Endereco><Endereco>Rua Treze</Endereco><Numero>13</Numero><Bairro>Jardim</Bairro><CodigoMunicipio>3507605</CodigoMunicipio><Uf>SP</Uf><Cep>12900100</Cep></Endereco>
    <Contato><Telefone>1140330000</Telefone></Contato></PrestadorServico>
  <OrgaoGerador><CodigoMunicipio>3507605</CodigoMunicipio><Uf>SP</Uf></OrgaoGerador>
  <DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico>
    <Rps><IdentificacaoRps><Numero>77</Numero><Serie>A</Serie><Tipo>1</Tipo></IdentificacaoRps></Rps><Competencia>2026-10-01</Competencia>
    <Servico><Valores><ValorServicos>1500.00</ValorServicos><ValorDeducoes>0.00</ValorDeducoes><ValorIss>75.00</ValorIss><Aliquota>5.00</Aliquota></Valores>
      <IssRetido>1</IssRetido><ItemListaServico>14.01</ItemListaServico><CodigoCnae>3314710</CodigoCnae>
      <Discriminacao>Manutenção preventiva de compressor de ar</Discriminacao><CodigoMunicipio>3507605</CodigoMunicipio></Servico>
    <Prestador><CpfCnpj><Cnpj>${CNPJ_FORNECEDOR}</Cnpj></CpfCnpj><InscricaoMunicipal>9988</InscricaoMunicipal></Prestador>
    <TomadorServico><IdentificacaoTomador><CpfCnpj><Cnpj>${CNPJ_EMPRESA}</Cnpj></CpfCnpj></IdentificacaoTomador><RazaoSocial>Empresa de Teste Ltda</RazaoSocial></TomadorServico>
    <OptanteSimplesNacional>2</OptanteSimplesNacional>
  </InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico>
</InfNfse></Nfse></CompNfse>`;

/** CT-e 57 rodoviário simples (para o layout DACTE). */
export const PROC_CTE = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe${CHAVE_CTE}" versao="4.00">
  <ide><cUF>35</cUF><CFOP>5353</CFOP><natOp>Prestação de serviço de transporte</natOp><mod>57</mod><serie>1</serie><nCT>4321</nCT>
    <dhEmi>2026-10-23T07:00:00-03:00</dhEmi><tpAmb>1</tpAmb><modal>01</modal><xMunIni>Atibaia</xMunIni><UFIni>SP</UFIni>
    <xMunFim>Bragança Paulista</xMunFim><UFFim>SP</UFFim><toma3><toma>3</toma></toma3></ide>
  <emit><CNPJ>99888777000166</CNPJ><IE>444444444444</IE><xNome>Transportadora Exemplo Ltda</xNome>
    <enderEmit><xLgr>Rodovia Fernão Dias</xLgr><nro>km 50</nro><xMun>Atibaia</xMun><UF>SP</UF></enderEmit></emit>
  <rem><CNPJ>${CNPJ_FORNECEDOR}</CNPJ><xNome>Fornecedor de Teste &amp; Cia Ltda</xNome><enderReme><xMun>Atibaia</xMun><UF>SP</UF></enderReme></rem>
  <dest><CNPJ>${CNPJ_EMPRESA}</CNPJ><xNome>Empresa de Teste Ltda</xNome><enderDest><xMun>Bragança Paulista</xMun><UF>SP</UF></enderDest></dest>
  <vPrest><vTPrest>30.00</vTPrest><vRec>30.00</vRec><Comp><xNome>Frete peso</xNome><vComp>30.00</vComp></Comp></vPrest>
  <imp><ICMS><ICMS00><CST>00</CST><vBC>30.00</vBC><pICMS>12.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS></imp>
  <infCTeNorm><infCarga><vCarga>800.00</vCarga><proPred>Parafusos e lubrificantes</proPred><infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>53.4000</qCarga></infQ></infCarga>
    <infDoc><infNFe><chave>${CHAVE_NFE_COMPLETA}</chave></infNFe></infDoc></infCTeNorm>
</infCte></CTe><protCTe versao="4.00"><infProt><tpAmb>1</tpAmb><chCTe>${CHAVE_CTE}</chCTe><dhRecbto>2026-10-23T07:01:00-03:00</dhRecbto>
  <nProt>135260000004321</nProt><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe></cteProc>`;
