// Janela "Empresas que usam o <sistema>" da licença (095): a MDC marca, entre os clientes ativos, as empresas do grupo
// que vão usar o sistema além do próprio cliente da licença (ex.: no EXato, EXRH + TEAM Leasing + ACB). O sistema, na
// tela "Nova empresa", traz do HUB só estas empresas (lic_empresas, com a chave). Grava por lic_contrato_empresas_definir.
// 096: em cada empresa (inclusive o cliente da licença) a MDC pode escolher os módulos; sem escolha = todo o pacote.
"use client";

import { useCallback, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { Icone } from "@/components/ui/Icone";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { traduzirErro } from "@/lib/erros";
import { exigir } from "@/lib/exigir";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { semAcento } from "@/lib/texto";
import { definirEmpresasDaLicenca, definirModulosDaEmpresa } from "../repositorio";
import type { Contrato } from "../tipos";

const cnpjMascara = (c: string | null) => {
  const d = (c ?? "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c || "sem CNPJ";
};

export function JanelaEmpresasLicenca({
  contrato,
  cliente,
  nomeSistema,
  aoFechar,
  aoSalvar,
}: {
  contrato: Contrato;
  cliente: string;
  nomeSistema: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const { clientes } = useOrg();
  const atuais = useConsulta(
    useCallback(async () => {
      const sb = supabase();
      const [emp, mods, pacote] = await Promise.all([
        sb.from("lic_contrato_empresas").select("cliente_id").eq("contrato_id", contrato.id),
        sb.from("lic_contrato_empresa_modulos").select("cliente_id, modulos").eq("contrato_id", contrato.id),
        sb.rpc("lic_contrato_modulos", { p_contrato: contrato.id }),
      ]);
      const empresas = (exigir(emp) as { cliente_id: string }[]).map((x) => x.cliente_id);
      const modulos: Record<string, string[]> = {};
      for (const m of exigir(mods) as { cliente_id: string; modulos: string[] }[]) modulos[m.cliente_id] = m.modulos;
      return { empresas, modulos, pacote: (exigir(pacote) ?? []) as ModuloPacote[] };
    }, [contrato.id]),
  );
  return atuais.carregando || !atuais.dados ? (
    <Modal titulo={`Empresas que usam o ${nomeSistema}`} aoFechar={aoFechar} largura="2xl">
      {atuais.erro ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{atuais.erro}</p> : <Carregando />}
    </Modal>
  ) : (
    <Escolha
      contrato={contrato}
      cliente={cliente}
      nomeSistema={nomeSistema}
      inicial={atuais.dados.empresas}
      modulosIniciais={atuais.dados.modulos}
      pacote={atuais.dados.pacote}
      clientes={clientes.filter((c) => c.ativo && c.id !== contrato.cliente_id)}
      daLicenca={clientes.find((c) => c.id === contrato.cliente_id)}
      aoFechar={aoFechar}
      aoSalvar={aoSalvar}
    />
  );
}

interface ModuloPacote {
  modulo: string;
  nome: string;
}

function Escolha({
  contrato,
  cliente,
  nomeSistema,
  inicial,
  modulosIniciais,
  pacote,
  clientes,
  daLicenca,
  aoFechar,
  aoSalvar,
}: {
  contrato: Contrato;
  cliente: string;
  nomeSistema: string;
  inicial: string[];
  modulosIniciais: Record<string, string[]>;
  pacote: ModuloPacote[];
  clientes: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; cidade?: string | null; uf?: string | null }[];
  daLicenca?: { razao_social: string; nome_fantasia: string | null; cnpj: string | null };
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(inicial));
  // módulos escolhidos por empresa (sem chave = todo o pacote) e qual empresa está com a escolha aberta
  const [mods, setMods] = useState<Record<string, string[]>>(modulosIniciais);
  const [abertaMods, setAbertaMods] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soMarcadas, setSoMarcadas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const raizDaLicenca = (daLicenca?.cnpj ?? "").replace(/\D/g, "").slice(0, 8);

  const lista = useMemo(() => {
    const b = semAcento(busca.trim()).toLowerCase();
    const dig = busca.replace(/\D/g, "");
    return clientes
      .filter((c) => !soMarcadas || marcadas.has(c.id))
      .filter(
        (c) =>
          !b ||
          semAcento(`${c.razao_social} ${c.nome_fantasia ?? ""}`).toLowerCase().includes(b) ||
          (dig.length >= 3 && (c.cnpj ?? "").replace(/\D/g, "").includes(dig)),
      )
      .sort((a, b2) => Number(marcadas.has(b2.id)) - Number(marcadas.has(a.id)) || a.razao_social.localeCompare(b2.razao_social));
  }, [clientes, busca, soMarcadas, marcadas]);

  // filiais do mesmo CNPJ (mesma raiz) da licença ainda não marcadas: atalho para marcar todas
  const filiaisSoltas = raizDaLicenca
    ? clientes.filter((c) => (c.cnpj ?? "").replace(/\D/g, "").startsWith(raizDaLicenca) && !marcadas.has(c.id))
    : [];

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function salvar() {
    setOcupado(true);
    setErro("");
    try {
      const n = await definirEmpresasDaLicenca(contrato.id, [...marcadas]);
      // módulos: só das empresas que ficaram na licença e cuja escolha mudou
      for (const id of [contrato.cliente_id, ...marcadas]) {
        const antes = (modulosIniciais[id] ?? []).join(",");
        const agora = (mods[id] ?? []).join(",");
        if (antes !== agora) await definirModulosDaEmpresa(contrato.id, id, mods[id] ?? []);
      }
      aoSalvar(`Empresas do ${nomeSistema} salvas: ${cliente} e mais ${n}.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  const textoMods = (id: string) =>
    mods[id]?.length ? `${mods[id].length} de ${pacote.length} módulos` : "Todos os módulos";
  const alternarModulo = (id: string, m: string) =>
    setMods((x) => {
      const atual = new Set(x[id]?.length ? x[id] : pacote.map((p) => p.modulo));
      if (atual.has(m)) atual.delete(m);
      else atual.add(m);
      const lista = [...atual].sort();
      const copia = { ...x };
      if (!lista.length || lista.length === pacote.length) delete copia[id];
      else copia[id] = lista;
      return copia;
    });
  const escolhaModulos = (id: string) =>
    pacote.length > 0 && (
      <span className="mt-1 block">
        <button
          type="button"
          className="btn-acao"
          aria-expanded={abertaMods === id}
          onClick={(e) => {
            e.preventDefault();
            setAbertaMods((a) => (a === id ? null : id));
          }}
        >
          <Icone nome={abertaMods === id ? "recolher" : "expandir"} />
          {textoMods(id)}
        </button>
        {abertaMods === id && (
          <span className="mt-2 flex flex-wrap gap-2">
            {pacote.map((p) => {
              const ligado = !mods[id]?.length || mods[id].includes(p.modulo);
              return (
                <label key={p.modulo} className={`chip cursor-pointer ${ligado ? "chip-ok" : "chip-rascunho"}`}>
                  <input type="checkbox" className="sr-only" checked={ligado} onChange={() => alternarModulo(id, p.modulo)} />
                  {p.nome}
                </label>
              );
            })}
          </span>
        )}
      </span>
    );

  return (
    <Modal
      titulo={`Empresas que usam o ${nomeSistema}`}
      descricao={`${cliente} · marque as empresas do grupo que vão usar o ${nomeSistema} com esta licença e, se quiser, os módulos de cada uma. Elas chegam sozinhas no ${nomeSistema} para o administrador concluir o cadastro.`}
      aoFechar={aoFechar}
      largura="2xl"
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <>
          <button className="btn-primario" onClick={salvar} disabled={ocupado}>
            <Icone nome="check" />
            {ocupado ? "Salvando…" : `Salvar (${marcadas.size + 1} ${marcadas.size ? "empresas" : "empresa"})`}
          </button>
          <button className="btn" onClick={aoFechar} disabled={ocupado}>
            <Icone nome="voltar" />
            Voltar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">
          <strong>{nomeCliente(daLicenca, cliente)}</strong> ({cnpjMascara(daLicenca?.cnpj ?? null)}) já vale sempre: é o cliente da
          licença.
        </p>
        {escolhaModulos(contrato.cliente_id)}
        {filiaisSoltas.length > 0 && (
          <button className="btn" onClick={() => setMarcadas((s) => new Set([...s, ...filiaisSoltas.map((c) => c.id)]))}>
            <Icone nome="check" />
            Marcar as filiais do mesmo CNPJ ({filiaisSoltas.length})
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="campo min-w-0 flex-1">
            <span>Buscar cliente</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, fantasia ou parte do CNPJ" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soMarcadas} onChange={(e) => setSoMarcadas(e.target.checked)} />
            Só as marcadas ({marcadas.size})
          </label>
        </div>
        <ul className="max-h-[50vh] divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
          {lista.length === 0 && <li className="p-3 text-sm text-neutral-600">Nenhum cliente com essa busca.</li>}
          {lista.slice(0, 200).map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-neutral-50">
                <input type="checkbox" className="mt-1" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} />
                <span className="min-w-0">
                  <span className="block font-medium">{nomeCliente(c)}</span>
                  <span className="block text-xs text-neutral-600">
                    {c.razao_social} · {cnpjMascara(c.cnpj)}
                    {c.cidade ? ` · ${c.cidade}/${c.uf ?? ""}` : ""}
                  </span>
                </span>
              </label>
              {marcadas.has(c.id) && <div className="pb-2 pl-10 pr-3">{escolhaModulos(c.id)}</div>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
