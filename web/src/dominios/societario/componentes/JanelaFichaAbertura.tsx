// Janela "Ficha de abertura": empresa (regime, natureza, porte, nomes), atividades (CNAE principal e secundários pela
// lista oficial), capital e objeto social, endereço e imóvel, contato e contador. Grava tudo de uma vez por
// soc_abertura_salvar; o banco recusa a combinação que o regime não aceita e a mensagem aparece aqui.
"use client";

import { useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { Modal } from "@/components/ui/Modal";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { Icone } from "@/components/ui/Icone";
import { mascaraTelefone } from "@/dominios/pessoal/contatoEmpresa";
import {
  conferirAbertura,
  formatarCnae,
  NATUREZAS,
  numeroDigitado,
  numeroParaCampo,
  PORTES,
  quotas,
  REGIMES,
} from "../abertura";
import type { CnaeEscolhido, FichaAbertura, Natureza, Porte, Regime, RestricaoCnae, SocioAbertura } from "../abertura";
import { CampoCnae } from "./CampoCnae";
import { CamposEnderecoAbertura, mascaraCep } from "./CamposEnderecoAbertura";
import type { Endereco } from "./CamposEnderecoAbertura";

type Campos = Omit<FichaAbertura, "processo_id" | "org_id" | "capital_social" | "valor_quota" | "area_m2" | "atualizado_em"> & {
  capital: string;
  quota: string;
  area: string;
};

function inicial(f: FichaAbertura | null, padrao: { razao: string; uf: string }): Campos {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    regime: f?.regime ?? null,
    natureza: f?.natureza ?? null,
    porte: f?.porte ?? null,
    razao_social: f?.razao_social ?? padrao.razao,
    nome_fantasia: s(f?.nome_fantasia),
    cnae_principal: f?.cnae_principal ?? null,
    cnae_principal_descricao: f?.cnae_principal_descricao ?? null,
    cnaes_secundarios: f?.cnaes_secundarios ?? [],
    objeto_social: s(f?.objeto_social),
    capital: numeroParaCampo(f?.capital_social),
    quota: numeroParaCampo(f?.valor_quota ?? 1),
    integralizacao: f?.integralizacao ?? "no_ato",
    integralizacao_prazo: s(f?.integralizacao_prazo),
    integralizacao_forma: f?.integralizacao_forma ?? "moeda",
    cep: f?.cep ? mascaraCep(f.cep) : "",
    logradouro: s(f?.logradouro),
    numero: s(f?.numero),
    complemento: s(f?.complemento),
    bairro: s(f?.bairro),
    municipio: s(f?.municipio),
    municipio_ibge: s(f?.municipio_ibge),
    uf: f?.uf ?? padrao.uf,
    uso_endereco: f?.uso_endereco ?? "estabelecimento",
    imovel_situacao: f?.imovel_situacao ?? null,
    inscricao_imobiliaria: s(f?.inscricao_imobiliaria),
    area: numeroParaCampo(f?.area_m2),
    email: s(f?.email),
    telefone: f?.telefone ? mascaraTelefone(f.telefone) : "",
    contador_nome: s(f?.contador_nome),
    contador_crc: s(f?.contador_crc),
    observacoes: s(f?.observacoes),
  };
}

export function JanelaFichaAbertura({
  processoId,
  ficha,
  socios,
  restricoes,
  padrao,
  aoFechar,
  aoSalvar,
}: {
  processoId: string;
  ficha: FichaAbertura | null;
  socios: SocioAbertura[];
  restricoes: RestricaoCnae[];
  padrao: { razao: string; uf: string };
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const idForm = useId();
  const [c, setC] = useState<Campos>(() => inicial(ficha, padrao));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<Campos>) => setC((x) => ({ ...x, ...p }));

  const capital = numeroDigitado(c.capital);
  const quota = numeroDigitado(c.quota);
  const area = numeroDigitado(c.area);
  const numerosRuins = [capital, quota, area].some((n) => n != null && (Number.isNaN(n) || n <= 0));
  const totalQuotas = quotas(capital, quota);

  // prévia da conferência com o que está na janela (o banco confere de novo ao gravar)
  const previa = conferirAbertura(
    { ...c, processo_id: processoId, org_id: "", capital_social: capital, valor_quota: quota, area_m2: area } as FichaAbertura,
    socios,
    restricoes,
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (numerosRuins) return setErro("Confira o capital, o valor da quota e a área: use só números (ex.: 10.000,00).");
    setSalvando(true);
    setErro(null);
    const { capital: _c, quota: _q, area: _a, ...resto } = c;
    void _c;
    void _q;
    void _a;
    const { error } = await supabase().rpc("soc_abertura_salvar", {
      p_proc: processoId,
      p: {
        ...resto,
        capital_social: capital,
        valor_quota: quota,
        area_m2: area,
        integralizacao_prazo: c.integralizacao === "a_prazo" ? c.integralizacao_prazo || null : null,
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoSalvar();
  }

  const escolhidos = [c.cnae_principal, ...c.cnaes_secundarios.map((x) => x.codigo)].filter(Boolean) as string[];
  const endereco: Endereco = {
    cep: c.cep ?? "",
    logradouro: c.logradouro ?? "",
    numero: c.numero ?? "",
    complemento: c.complemento ?? "",
    bairro: c.bairro ?? "",
    municipio: c.municipio ?? "",
    uf: c.uf ?? "",
    municipio_ibge: c.municipio_ibge ?? "",
  };

  return (
    <Modal
      titulo="Ficha de abertura"
      descricao="Preencha aos poucos: o que estiver salvo fica guardado no processo. O regime escolhido confere os CNAE."
      aoFechar={aoFechar}
      largura="7xl"
      avisoRodape={
        (erro || previa.bloqueios.length > 0) && (
          <div role="alert" className="space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro && <p>{erro}</p>}
            {!erro && previa.bloqueios.map((b) => <p key={b}>{b}</p>)}
          </div>
        )
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button type="submit" form={idForm} className="btn-primario" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar ficha"}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={salvar}>
        <ColunasFormulario colunas="2-3">
          <ColunaFormulario className="lg:row-span-2 2xl:row-span-1">
            <h3 className="text-sm font-semibold text-[var(--marca)]">Empresa</h3>
            <fieldset className="campo">
              <legend className="mb-1 text-sm">Regime em que a empresa nasce</legend>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {REGIMES.map((r) => (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${c.regime === r.id ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"}`}
                    title={r.ajuda}
                  >
                    <input type="radio" name="regime" checked={c.regime === r.id} onChange={() => mudar({ regime: r.id as Regime })} className="mt-0.5" />
                    <span>
                      {r.nome}
                      {c.regime === r.id && <Icone nome="check" className="ml-1 inline h-3.5 w-3.5" />}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="campo">
              <span>Natureza jurídica</span>
              <select value={c.natureza ?? ""} onChange={(e) => mudar({ natureza: (e.target.value || null) as Natureza | null })}>
                <option value="">Escolha…</option>
                {NATUREZAS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Porte</span>
              <select value={c.porte ?? ""} onChange={(e) => mudar({ porte: (e.target.value || null) as Porte | null })}>
                <option value="">Escolha…</option>
                {PORTES.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Razão social</span>
              <input value={c.razao_social ?? ""} onChange={(e) => mudar({ razao_social: e.target.value })} maxLength={150} />
              <small className="text-xs text-[var(--texto-suave)]">Confira na viabilidade se o nome está livre na Junta.</small>
            </label>
            <label className="campo">
              <span>Nome fantasia</span>
              <input value={c.nome_fantasia ?? ""} onChange={(e) => mudar({ nome_fantasia: e.target.value })} maxLength={80} />
            </label>
          </ColunaFormulario>

          <ColunaFormulario>
            <h3 className="text-sm font-semibold text-[var(--marca)]">Atividades</h3>
            {c.cnae_principal ? (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--borda)] p-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-[var(--texto-suave)]">CNAE principal</span>
                  <span className="num font-medium">{formatarCnae(c.cnae_principal)}</span> {c.cnae_principal_descricao}
                </span>
                <button type="button" className="btn !min-h-8 !px-2.5" onClick={() => mudar({ cnae_principal: null, cnae_principal_descricao: null })}>
                  <Icone nome="fechar" className="h-4 w-4" />
                  Trocar
                </button>
              </div>
            ) : (
              <CampoCnae
                rotulo="CNAE principal"
                regime={c.regime}
                restricoes={restricoes}
                ja={escolhidos}
                aoEscolher={(x: CnaeEscolhido) => mudar({ cnae_principal: x.codigo, cnae_principal_descricao: x.descricao })}
              />
            )}
            <CampoCnae
              rotulo={`CNAE secundários (${c.cnaes_secundarios.length})`}
              regime={c.regime}
              restricoes={restricoes}
              ja={escolhidos}
              aoEscolher={(x) => mudar({ cnaes_secundarios: [...c.cnaes_secundarios, x] })}
            />
            {c.cnaes_secundarios.length > 0 && (
              <ul className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)] text-sm">
                {c.cnaes_secundarios.map((x) => (
                  <li key={x.codigo} className="flex items-start gap-2 px-2 py-1.5">
                    <span className="num shrink-0 font-medium">{formatarCnae(x.codigo)}</span>
                    <span className="min-w-0 flex-1">{x.descricao}</span>
                    <button
                      type="button"
                      className="btn !min-h-8 !px-2.5"
                      aria-label={`Retirar o CNAE ${formatarCnae(x.codigo)}`}
                      onClick={() => mudar({ cnaes_secundarios: c.cnaes_secundarios.filter((y) => y.codigo !== x.codigo) })}
                    >
                      <Icone nome="lixeira" className="h-4 w-4" />
                      Retirar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="campo">
              <span>Objeto social</span>
              <textarea rows={4} value={c.objeto_social ?? ""} onChange={(e) => mudar({ objeto_social: e.target.value })} maxLength={4000} />
              <small className="text-xs text-[var(--texto-suave)]">Texto do contrato; precisa cobrir todos os CNAE escolhidos.</small>
            </label>
            <h3 className="pt-1 text-sm font-semibold text-[var(--marca)]">Capital social</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>Capital (R$)</span>
                <input inputMode="decimal" value={c.capital} onChange={(e) => mudar({ capital: e.target.value })} placeholder="10.000,00" />
              </label>
              <label className="campo">
                <span>Valor de cada quota (R$)</span>
                <input inputMode="decimal" value={c.quota} onChange={(e) => mudar({ quota: e.target.value })} placeholder="1,00" />
              </label>
            </div>
            {capital != null && !Number.isNaN(capital) && (
              <p className="text-xs text-[var(--texto-suave)]">
                {brl(capital)} {totalQuotas != null ? `· ${totalQuotas.toLocaleString("pt-BR")} quotas` : "· o capital não fecha em quotas inteiras"}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>Integralização</span>
                <select value={c.integralizacao ?? ""} onChange={(e) => mudar({ integralizacao: (e.target.value || null) as Campos["integralizacao"] })}>
                  <option value="no_ato">No ato (na assinatura)</option>
                  <option value="a_prazo">A prazo</option>
                </select>
              </label>
              {c.integralizacao === "a_prazo" ? (
                <label className="campo">
                  <span>Integralizar até</span>
                  <input type="date" required value={c.integralizacao_prazo ?? ""} onChange={(e) => mudar({ integralizacao_prazo: e.target.value })} />
                </label>
              ) : (
                <label className="campo">
                  <span>Em</span>
                  <select value={c.integralizacao_forma ?? ""} onChange={(e) => mudar({ integralizacao_forma: (e.target.value || null) as Campos["integralizacao_forma"] })}>
                    <option value="moeda">Dinheiro</option>
                    <option value="bens">Bens</option>
                    <option value="moeda_e_bens">Dinheiro e bens</option>
                  </select>
                </label>
              )}
            </div>
          </ColunaFormulario>

          <ColunaFormulario>
            <h3 className="text-sm font-semibold text-[var(--marca)]">Endereço da empresa</h3>
            <CamposEnderecoAbertura valor={endereco} comIbge aoMudar={(p) => mudar(p)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>O endereço é</span>
                <select value={c.uso_endereco ?? ""} onChange={(e) => mudar({ uso_endereco: (e.target.value || null) as Campos["uso_endereco"] })}>
                  <option value="estabelecimento">Onde a empresa funciona</option>
                  <option value="fiscal">Só fiscal (sem atendimento)</option>
                </select>
              </label>
              <label className="campo">
                <span>Imóvel</span>
                <select value={c.imovel_situacao ?? ""} onChange={(e) => mudar({ imovel_situacao: (e.target.value || null) as Campos["imovel_situacao"] })}>
                  <option value="">Escolha…</option>
                  <option value="proprio">Próprio (de um sócio ou da empresa)</option>
                  <option value="alugado">Alugado</option>
                  <option value="cedido">Cedido</option>
                  <option value="comodato">Comodato</option>
                </select>
              </label>
              <label className="campo">
                <span>Inscrição imobiliária (IPTU)</span>
                <input value={c.inscricao_imobiliaria ?? ""} onChange={(e) => mudar({ inscricao_imobiliaria: e.target.value })} maxLength={40} />
              </label>
              <label className="campo">
                <span>Área usada (m²)</span>
                <input inputMode="decimal" value={c.area} onChange={(e) => mudar({ area: e.target.value })} />
              </label>
            </div>
            <h3 className="pt-1 text-sm font-semibold text-[var(--marca)]">Contato e contador</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>E-mail da empresa</span>
                <input type="email" value={c.email ?? ""} onChange={(e) => mudar({ email: e.target.value })} />
              </label>
              <label className="campo">
                <span>Telefone</span>
                <input inputMode="tel" value={c.telefone ?? ""} onChange={(e) => mudar({ telefone: mascaraTelefone(e.target.value) })} />
              </label>
              <label className="campo">
                <span>Contador responsável</span>
                <input value={c.contador_nome ?? ""} onChange={(e) => mudar({ contador_nome: e.target.value })} maxLength={120} />
              </label>
              <label className="campo">
                <span>CRC</span>
                <input value={c.contador_crc ?? ""} onChange={(e) => mudar({ contador_crc: e.target.value })} maxLength={30} placeholder="1SP000000/O-0" />
              </label>
            </div>
            <label className="campo">
              <span>Observações</span>
              <textarea rows={2} value={c.observacoes ?? ""} onChange={(e) => mudar({ observacoes: e.target.value })} maxLength={2000} />
            </label>
          </ColunaFormulario>
        </ColunasFormulario>
      </form>
    </Modal>
  );
}
