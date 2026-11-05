-- Base para a 057 (regras fiscais): o cliente das notas de teste (e461, da 046) passa a ter cidade e UF, para provar a
-- retenção do ISS por município.
update fin_pessoas set cidade = 'Atibaia', uf = 'SP' where id = '00000000-0000-0000-0000-00000000e461';
