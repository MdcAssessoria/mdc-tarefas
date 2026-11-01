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
