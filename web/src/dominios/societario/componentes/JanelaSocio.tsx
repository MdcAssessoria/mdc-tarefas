// Janela "Sócio" da ficha de abertura: pessoa física ou jurídica, documento, percentual, administrador, estado civil e
// regime de bens, profissão, RG, contato e endereço. Grava por soc_abertura_socio_salvar (o banco confere a soma
// de 100% e se o regime aceita o sócio).
"use client";

import { useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { cnpjValido, cpfValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { Modal } from "@/components/ui/Modal";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { Icone } from "@/components/ui/Icone";
import { mascaraTelefone } from "@/dominios/pessoal/contatoEmpresa";
import { ESTADOS_CIVIS, numeroDigitado, numeroParaCampo, REGIMES_BENS, somaPercentuais } from "../abertura";
import type { SocioAbertura } from "../abertura";
import { CamposEnderecoAbertura, mascaraCep } from "./CamposEnderecoAbertura";

export function JanelaSocio({
  processoId,
  socio,
  outros,
  aoFechar,
  aoSalvar,
}: {
  processoId: string;
  /** null = sócio novo. */
  socio: SocioAbertura | null;
  /** Os demais sócios (para mostrar quanto falta para 100%). */
  outros: SocioAbertura[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const idForm = useId();
  const s = (v: string | null | undefined) => v ?? "";
  const [c, setC] = useState(() => ({
    tipo: socio?.tipo ?? ("pf" as "pf" | "pj"),
    nome: s(socio?.nome),
    documento: socio?.documento ? formatarDocumento(socio.documento) : "",
    domiciliado_exterior: socio?.domiciliado_exterior ?? false,
    nacionalidade: socio?.nacionalidade ?? "Brasileira",
    data_nascimento: s(socio?.data_nascimento),
    estado_civil: s(socio?.estado_civil),
    regime_bens: s(socio?.regime_bens),
    profissao: s(socio?.profissao),
    rg: s(socio?.rg),
    rg_orgao: s(socio?.rg_orgao),
    email: s(socio?.email),
    celular: socio?.celular ? mascaraTelefone(socio.celular) : "",
    cep: socio?.cep ? mascaraCep(socio.cep) : "",
    logradouro: s(socio?.logradouro),
    numero: s(socio?.numero),
    complemento: s(socio?.complemento),
    bairro: s(socio?.bairro),
    municipio: s(socio?.municipio),
    uf: s(socio?.uf),
    percentual: socio ? numeroParaCampo(socio.percentual) : numeroParaCampo(Math.max(0, 100 - somaPercentuais(outros))),
    administrador: socio?.administrador ?? outros.length === 0,
    outras_empresas: s(socio?.outras_empresas),
  }));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof c>) => setC((x) => ({ ...x, ...p }));

  const pf = c.tipo === "pf";
  const pct = numeroDigitado(c.percentual);
  const doc = soDigitos(c.documento);
  const docRuim = doc.length > 0 && (pf ? !cpfValido(doc) : !cnpjValido(doc));
  const casado = c.estado_civil === "casado" || c.estado_civil === "uniao_estavel";
  const restante = Math.round((100 - somaPercentuais(outros)) * 10000) / 10000;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (pct == null || Number.isNaN(pct) || pct < 0 || pct > 100) return setErro("Percentual entre 0 e 100 (ex.: 50 ou 33,3333).");
    if (docRuim) return setErro(`${pf ? "CPF" : "CNPJ"} inválido: confira os números.`);
    setSalvando(true);
    setErro(null);
    const { error } = await supabase().rpc("soc_abertura_socio_salvar", {
      p_proc: processoId,
      p_socio: socio?.id ?? null,
      p: { ...c, documento: doc || null, percentual: pct, regime_bens: casado ? c.regime_bens : null },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoSalvar();
  }

  return (
    <Modal
      titulo={socio ? `Sócio · ${socio.nome}` : "Novo sócio"}
      descricao={`Participação ainda livre: ${String(restante).replace(".", ",")}% do capital.`}
      aoFechar={aoFechar}
      largura="6xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro}
          </p>
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
            {salvando ? "Salvando…" : "Salvar sócio"}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={salvar}>
        <ColunasFormulario>
          <ColunaFormulario>
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <label className="campo">
                <span>Sócio é</span>
                <select value={c.tipo} onChange={(e) => mudar({ tipo: e.target.value as "pf" | "pj" })}>
                  <option value="pf">Pessoa física</option>
                  <option value="pj">Empresa (PJ)</option>
                </select>
              </label>
              <label className="campo">
                <span>{pf ? "Nome completo" : "Razão social"}</span>
                <input required minLength={3} maxLength={150} value={c.nome} onChange={(e) => mudar({ nome: e.target.value })} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="campo">
                <span>{pf ? "CPF" : "CNPJ"}</span>
                <input
                  inputMode="numeric"
                  value={c.documento}
                  aria-invalid={docRuim}
                  onChange={(e) => mudar({ documento: formatarDocumento(soDigitos(e.target.value).slice(0, pf ? 11 : 14)) })}
                />
                {docRuim && <small className="text-xs text-red-700">{pf ? "CPF" : "CNPJ"} inválido</small>}
              </label>
              <label className="campo">
                <span>Participação (%)</span>
                <input inputMode="decimal" required value={c.percentual} onChange={(e) => mudar({ percentual: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={c.administrador} onChange={(e) => mudar({ administrador: e.target.checked })} />
                Sócio administrador
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.domiciliado_exterior} onChange={(e) => mudar({ domiciliado_exterior: e.target.checked })} />
              Mora (ou tem sede) fora do Brasil
            </label>
            {pf && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="campo">
                    <span>Nacionalidade</span>
                    <input value={c.nacionalidade} onChange={(e) => mudar({ nacionalidade: e.target.value })} maxLength={40} />
                  </label>
                  <label className="campo">
                    <span>Nascimento</span>
                    <input type="date" value={c.data_nascimento} onChange={(e) => mudar({ data_nascimento: e.target.value })} />
                  </label>
                  <label className="campo">
                    <span>Profissão</span>
                    <input value={c.profissao} onChange={(e) => mudar({ profissao: e.target.value })} maxLength={80} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="campo">
                    <span>Estado civil</span>
                    <select value={c.estado_civil} onChange={(e) => mudar({ estado_civil: e.target.value })}>
                      <option value="">Escolha…</option>
                      {ESTADOS_CIVIS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  {casado && (
                    <label className="campo">
                      <span>Regime de bens</span>
                      <select value={c.regime_bens} onChange={(e) => mudar({ regime_bens: e.target.value })}>
                        <option value="">Escolha…</option>
                        {REGIMES_BENS.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                      </select>
                      {c.regime_bens && ["comunhao_universal", "separacao_obrigatoria"].includes(c.regime_bens) && (
                        <small className="text-xs text-amber-800">
                          Se o cônjuge também for sócio, esse regime impede a sociedade entre eles (Código Civil, art. 977).
                        </small>
                      )}
                    </label>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="campo">
                    <span>RG</span>
                    <input value={c.rg} onChange={(e) => mudar({ rg: e.target.value })} maxLength={30} />
                  </label>
                  <label className="campo">
                    <span>Órgão emissor</span>
                    <input value={c.rg_orgao} onChange={(e) => mudar({ rg_orgao: e.target.value })} maxLength={20} placeholder="SSP/SP" />
                  </label>
                </div>
              </>
            )}
            <label className="campo">
              <span>Participa de outras empresas?</span>
              <input
                value={c.outras_empresas}
                onChange={(e) => mudar({ outras_empresas: e.target.value })}
                maxLength={500}
                placeholder="Nome e CNPJ, se tiver (importa para o Simples Nacional)"
              />
            </label>
          </ColunaFormulario>
          <ColunaFormulario>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>E-mail</span>
                <input type="email" value={c.email} onChange={(e) => mudar({ email: e.target.value })} />
              </label>
              <label className="campo">
                <span>Celular</span>
                <input inputMode="tel" value={c.celular} onChange={(e) => mudar({ celular: mascaraTelefone(e.target.value) })} />
              </label>
            </div>
            <CamposEnderecoAbertura valor={c} aoMudar={(p) => mudar(p)} />
          </ColunaFormulario>
        </ColunasFormulario>
      </form>
    </Modal>
  );
}
