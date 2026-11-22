// Endereço da ficha de abertura (empresa e sócios): CEP com "Buscar" (ViaCEP/BrasilAPI preenchem rua, bairro,
// município, UF e o código IBGE), número, complemento e o município sugerido pela lista oficial do IBGE da UF.
"use client";

import { useEffect, useId, useState } from "react";
import { soDigitos } from "@/lib/documento";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { buscarCep, carregarMunicipios, ibgeDoMunicipio, UFS } from "../consultasAbertura";
import type { Municipio } from "../consultasAbertura";

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  municipio_ibge?: string;
}

export const mascaraCep = (v: string) => {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export function CamposEnderecoAbertura({
  valor,
  aoMudar,
  comIbge = false,
}: {
  valor: Endereco;
  aoMudar: (parcial: Partial<Endereco>) => void;
  /** Guarda o código IBGE do município (endereço da empresa). */
  comIbge?: boolean;
}) {
  const idLista = useId();
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);

  useEffect(() => {
    let vivo = true;
    carregarMunicipios(valor.uf)
      .then((m) => vivo && setMunicipios(m))
      .catch(() => vivo && setMunicipios([]));
    return () => {
      vivo = false;
    };
  }, [valor.uf]);

  async function buscar() {
    setErro(null);
    setBuscando(true);
    try {
      const e = await buscarCep(valor.cep);
      aoMudar({
        cep: mascaraCep(e.cep),
        logradouro: e.logradouro || valor.logradouro,
        bairro: e.bairro || valor.bairro,
        municipio: e.municipio,
        uf: e.uf,
        ...(comIbge ? { municipio_ibge: e.ibge ?? "" } : {}),
      });
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setBuscando(false);
    }
  }

  function mudarMunicipio(nome: string) {
    aoMudar({ municipio: nome, ...(comIbge ? { municipio_ibge: ibgeDoMunicipio(municipios, nome) ?? "" } : {}) });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[10rem_auto_minmax(0,1fr)]">
        <label className="campo">
          <span>CEP</span>
          <input
            inputMode="numeric"
            value={valor.cep}
            placeholder="00000-000"
            onChange={(e) => aoMudar({ cep: mascaraCep(e.target.value) })}
            onBlur={() => soDigitos(valor.cep).length === 8 && !valor.logradouro && buscar()}
          />
        </label>
        <button type="button" className="btn" onClick={buscar} disabled={buscando || soDigitos(valor.cep).length !== 8}>
          <Icone nome="busca" className="h-4 w-4" />
          {buscando ? "Buscando…" : "Buscar CEP"}
        </button>
        {erro && (
          <p role="alert" className="col-span-2 text-sm text-red-700 sm:col-span-1">
            {erro}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <label className="campo">
          <span>Endereço (rua, avenida…)</span>
          <input value={valor.logradouro} onChange={(e) => aoMudar({ logradouro: e.target.value })} maxLength={150} />
        </label>
        <label className="campo">
          <span>Número</span>
          <input value={valor.numero} onChange={(e) => aoMudar({ numero: e.target.value })} maxLength={20} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Complemento</span>
          <input value={valor.complemento} onChange={(e) => aoMudar({ complemento: e.target.value })} maxLength={80} placeholder="Sala, bloco…" />
        </label>
        <label className="campo">
          <span>Bairro</span>
          <input value={valor.bairro} onChange={(e) => aoMudar({ bairro: e.target.value })} maxLength={80} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
        <label className="campo">
          <span>Município</span>
          <input list={idLista} value={valor.municipio} onChange={(e) => mudarMunicipio(e.target.value)} maxLength={80} />
          <datalist id={idLista}>
            {municipios.map((m) => (
              <option key={m.ibge} value={m.nome} />
            ))}
          </datalist>
          {comIbge && valor.municipio && (
            <small className="text-xs text-[var(--texto-suave)]">
              {valor.municipio_ibge ? `Código IBGE ${valor.municipio_ibge}` : "Escolha o município da lista para guardar o código IBGE."}
            </small>
          )}
        </label>
        <label className="campo">
          <span>UF</span>
          <select value={valor.uf} onChange={(e) => aoMudar({ uf: e.target.value, ...(comIbge ? { municipio_ibge: "" } : {}) })}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
