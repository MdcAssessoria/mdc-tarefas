// Janelas de Contratos › Ledgra Link (064): cadastrar empresa e, em cada empresa, os 4 passos (termo de autorização,
// certificado digital, conta bancária e credencial de API do banco). Cada janela confere os campos com as regras de
// dominios/contratos/ledgraLinkCadastro.ts e envia pela Função Edge (ledgraLinkChamadas.ts). Senha e Client Secret
// não ficam guardados na tela depois de enviar.
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { formatarDocumento } from "@/lib/documento";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { TituloEtapa } from "@/components/ui/TituloEtapa";
import {
  AMBIENTES,
  BANCOS_LINK,
  ESCOPOS,
  PRODUTOS,
  TIPOS_CERTIFICADO,
  conferirCertificado,
  conferirConta,
  conferirCredencial,
  conferirTermo,
  conferirTitular,
  nomeAmbiente,
  tipoCertificadoSugerido,
  type CertificadoLink,
  type Escopo,
  type NovaConta,
  type NovaCredencial,
  type NovoCertificado,
  type NovoTermo,
  type NovoTitular,
  type TitularLink,
} from "../ledgraLinkCadastro";
import { baixarTermoPdf, conferirModeloTermo, type DadosTermo } from "../termoLedgraLink";
import { cadastrarConta, cadastrarCredencial, cadastrarTitular, enviarCertificado, registrarTermo } from "../ledgraLinkChamadas";

type ContaTermo = Omit<DadosTermo["contas"][number], "conta_dv"> & { conta_dv: string };
const CONTA_VAZIA: ContaTermo = { codigo_compe: "033", agencia: "", conta: "", conta_dv: "" };

/** Moldura comum: título, erro acima dos botões, Voltar e o botão de enviar (trava enquanto envia). */
function JanelaEnvio({
  id,
  titulo,
  descricao,
  botao,
  largura = "2xl",
  aoFechar,
  enviar,
  children,
}: {
  id: string;
  titulo: string;
  descricao: React.ReactNode;
  botao: string;
  largura?: "lg" | "2xl" | "4xl" | "5xl";
  aoFechar: () => void;
  /** Confere e envia; devolve a mensagem de erro (o que faltou) ou null quando deu certo. */
  enviar: () => Promise<string | null>;
  children: React.ReactNode;
}) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      const falta = await enviar();
      if (falta) setErro(falta);
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={titulo}
      descricao={descricao}
      aoFechar={aoFechar}
      largura={largura}
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
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
          <button type="submit" form={id} className="btn-primario" disabled={enviando}>
            <Icone nome="check" className="h-4 w-4" />
            {enviando ? "Enviando…" : botao}
          </button>
        </>
      }
    >
      <form id={id} className="space-y-3" onSubmit={aoEnviar} autoComplete="off">
        {children}
      </form>
    </Modal>
  );
}

function AvisoCofre({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-[var(--borda)] bg-[var(--fundo)] p-3 text-sm">
      <Icone nome="escudo" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
      <span>{children}</span>
    </p>
  );
}

// ------------------------------------------------------------------------------------------------ empresa

export function JanelaEmpresa({ org, aoFechar, aoSalvar }: { org: string; aoFechar: () => void; aoSalvar: (msg: string) => void }) {
  const [t, setT] = useState<NovoTitular>({ documento: "", razao_social: "", email_contato: "" });
  const mudar = (p: Partial<NovoTitular>) => setT((x) => ({ ...x, ...p }));
  return (
    <JanelaEnvio
      id="form-link-empresa"
      titulo="+ Nova empresa no Ledgra Link"
      descricao="A empresa dona da conta bancária (a própria MDC ou um cliente). Depois vêm o termo, o certificado, a conta e a credencial."
      botao="Cadastrar empresa"
      largura="lg"
      aoFechar={aoFechar}
      enviar={async () => {
        const falta = conferirTitular(t);
        if (falta) return falta;
        const r = await cadastrarTitular(org, t);
        aoSalvar(r.mensagem ?? "Empresa cadastrada.");
        return null;
      }}
    >
      <label className="campo">
        <span>CNPJ ou CPF</span>
        <input required inputMode="numeric" value={t.documento} onChange={(e) => mudar({ documento: e.target.value })}
          onBlur={() => mudar({ documento: formatarDocumento(t.documento) })} placeholder="00.000.000/0000-00" className="num" />
      </label>
      <label className="campo">
        <span>Razão social (ou nome)</span>
        <input required maxLength={150} value={t.razao_social} onChange={(e) => mudar({ razao_social: e.target.value })} />
      </label>
      <label className="campo">
        <span>E-mail para avisos (opcional)</span>
        <input type="email" value={t.email_contato} onChange={(e) => mudar({ email_contato: e.target.value })}
          placeholder="financeiro@empresa.com.br" />
      </label>
    </JanelaEnvio>
  );
}

// ------------------------------------------------------------------------------------------------ termo

export function JanelaTermo({
  org,
  titular,
  hoje,
  logoUrl,
  aoFechar,
  aoSalvar,
}: {
  org: string;
  titular: TitularLink;
  hoje: string;
  logoUrl: string | null;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [t, setT] = useState<NovoTermo>({
    escopos: ["cobranca", "pix"], assinado_por_nome: "", assinado_por_cpf: "", assinado_em: hoje, vigente_ate: "", arquivo: null,
  });
  const mudar = (p: Partial<NovoTermo>) => setT((x) => ({ ...x, ...p }));
  const [cargo, setCargo] = useState("");
  // contas que entram no termo: as já cadastradas na empresa ou uma linha para preencher
  const [contas, setContas] = useState<ContaTermo[]>(() =>
    titular.contas.length
      ? titular.contas.map((c) => ({ codigo_compe: c.codigo_compe, agencia: c.agencia, conta: c.conta, conta_dv: c.conta_dv ?? "" }))
      : [{ ...CONTA_VAZIA }],
  );
  const mudarConta = (k: number, p: Partial<ContaTermo>) => setContas((l) => l.map((c, i) => (i === k ? { ...c, ...p } : c)));
  const [baixando, setBaixando] = useState(false);
  const [erroModelo, setErroModelo] = useState("");

  async function baixarModelo() {
    setErroModelo("");
    const dados = {
      empresa: { razao_social: titular.razao_social, documento: titular.documento },
      representante: { nome: t.assinado_por_nome, cpf: t.assinado_por_cpf, cargo },
      escopos: t.escopos,
      contas: contas.map((c) => ({ ...c, agencia: c.agencia.trim(), conta: c.conta.trim(), conta_dv: c.conta_dv.trim() || null })),
      data: hoje,
      vigente_ate: t.vigente_ate,
    };
    const falta = conferirModeloTermo(dados);
    if (falta) return setErroModelo(falta);
    setBaixando(true);
    try {
      await baixarTermoPdf(dados, logoUrl);
    } catch (x) {
      setErroModelo(traduzirErro(x));
    } finally {
      setBaixando(false);
    }
  }
  const alternar = (e: Escopo) =>
    mudar({ escopos: t.escopos.includes(e) ? t.escopos.filter((x) => x !== e) : [...t.escopos, e] });

  return (
    <JanelaEnvio
      id="form-link-termo"
      titulo={`Termo de autorização · ${titular.razao_social}`}
      descricao={`Preencha os dados, baixe o termo já pronto para assinar e, depois de assinado, anexe o PDF. Empresa: ${formatarDocumento(titular.documento)}.`}
      botao="Registrar termo assinado"
      largura="5xl"
      aoFechar={aoFechar}
      enviar={async () => {
        const falta = conferirTermo(t, hoje);
        if (falta) return falta;
        const r = await registrarTermo(org, titular.id, t);
        aoSalvar(r.mensagem ?? "Termo registrado.");
        return null;
      }}
    >
      <fieldset className="space-y-3 rounded-xl border border-[var(--borda)] p-3">
        <TituloEtapa numero={1} icone="documento">Dados do termo</TituloEtapa>
        <ColunasFormulario>
          <ColunaFormulario>
            <label className="campo">
              <span>Nome de quem assina pela empresa</span>
              <input required maxLength={120} value={t.assinado_por_nome} onChange={(e) => mudar({ assinado_por_nome: e.target.value })}
                placeholder="Representante legal" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>CPF de quem assina</span>
                <input required inputMode="numeric" className="num" value={t.assinado_por_cpf} placeholder="000.000.000-00"
                  onChange={(e) => mudar({ assinado_por_cpf: e.target.value })}
                  onBlur={() => mudar({ assinado_por_cpf: formatarDocumento(t.assinado_por_cpf) })} />
              </label>
              <label className="campo">
                <span>Cargo (opcional)</span>
                <input maxLength={60} value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: sócio administrador" />
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">O que a MDC pode fazer nas contas</legend>
              {ESCOPOS.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={t.escopos.includes(e.id)} onChange={() => alternar(e.id)} />
                  {e.nome}
                </label>
              ))}
            </fieldset>
            <label className="campo">
              <span>Válido até (opcional; em branco = sem prazo)</span>
              <input type="date" value={t.vigente_ate} onChange={(e) => mudar({ vigente_ate: e.target.value })} />
            </label>
          </ColunaFormulario>
          <ColunaFormulario>
            <p className="text-sm font-medium">Contas que entram no termo</p>
            {contas.map((c, k) => (
              <div key={k} className="space-y-2 rounded-lg border border-[var(--borda)] p-2">
                <div className="flex items-end gap-2">
                  <label className="campo min-w-0 flex-1">
                    <span>Banco</span>
                    <select value={c.codigo_compe} onChange={(e) => mudarConta(k, { codigo_compe: e.target.value })}>
                      {BANCOS_LINK.map((b) => (
                        <option key={b.codigo} value={b.codigo}>{b.codigo} · {b.nome}</option>
                      ))}
                    </select>
                  </label>
                  {contas.length > 1 && (
                    <button type="button" className="btn" aria-label={`Tirar a ${k + 1}ª conta do termo`}
                      onClick={() => setContas((l) => l.filter((_, i) => i !== k))}>
                      <Icone nome="lixeira" className="h-4 w-4" />
                      Tirar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,4rem)] gap-2 [&_input]:min-w-0 [&_input]:w-full">
                  <label className="campo">
                    <span>Agência</span>
                    <input inputMode="numeric" maxLength={5} className="num" value={c.agencia} placeholder="1234"
                      onChange={(e) => mudarConta(k, { agencia: e.target.value })} />
                  </label>
                  <label className="campo">
                    <span>Conta</span>
                    <input inputMode="numeric" maxLength={13} className="num" value={c.conta} placeholder="13000123"
                      onChange={(e) => mudarConta(k, { conta: e.target.value })} />
                  </label>
                  <label className="campo">
                    <span>Dígito</span>
                    <input maxLength={2} className="num" value={c.conta_dv} onChange={(e) => mudarConta(k, { conta_dv: e.target.value })} />
                  </label>
                </div>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => setContas((l) => [...l, { ...CONTA_VAZIA }])}>
              <Icone nome="mais" className="h-4 w-4" />
              Mais uma conta
            </button>
          </ColunaFormulario>
        </ColunasFormulario>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--borda)] pt-3">
          {erroModelo && <p role="alert" className="mr-auto rounded-md bg-red-50 p-2 text-sm text-red-800">{erroModelo}</p>}
          <button type="button" className="btn font-semibold ring-2 ring-[var(--destaque)]" onClick={baixarModelo} disabled={baixando}>
            <Icone nome="baixar" className="h-4 w-4" />
            {baixando ? "Gerando…" : "Baixar termo preenchido (PDF)"}
          </button>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-[var(--borda)] p-3">
        <TituloEtapa numero={2} icone="clipe">Termo assinado</TituloEtapa>
        <ColunasFormulario>
          <ColunaFormulario>
            <CampoArquivo accept=".pdf" escolhido={t.arquivo?.name} compacto titulo="Arraste o PDF assinado ou clique para escolher"
              aoEscolher={([a]) => mudar({ arquivo: a ?? null })} />
          </ColunaFormulario>
          <ColunaFormulario>
            <label className="campo">
              <span>Data da assinatura</span>
              <input required type="date" max={hoje} value={t.assinado_em} onChange={(e) => mudar({ assinado_em: e.target.value })} />
            </label>
            <p className="text-xs text-[var(--texto-suave)]">
              O HUB guarda o PDF e o Ledgra Link guarda a impressão digital dele (SHA-256), que prova que o arquivo não mudou. O CPF
              de quem assinou fica guardado mascarado.
            </p>
          </ColunaFormulario>
        </ColunasFormulario>
      </fieldset>
    </JanelaEnvio>
  );
}

// ------------------------------------------------------------------------------------------------ certificado

export function JanelaCertificado({
  org,
  titular,
  aoFechar,
  aoSalvar,
}: {
  org: string;
  titular: TitularLink;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [c, setC] = useState<NovoCertificado>({
    tipo: tipoCertificadoSugerido(titular.documento), apelido: "", senha: "", arquivo: null,
  });
  const mudar = (p: Partial<NovoCertificado>) => setC((x) => ({ ...x, ...p }));
  return (
    <JanelaEnvio
      id="form-link-certificado"
      titulo={`Certificado digital · ${titular.razao_social}`}
      descricao="O arquivo .pfx (ou .p12) do certificado A1 e a senha dele."
      botao="Enviar para o cofre"
      aoFechar={aoFechar}
      enviar={async () => {
        const falta = conferirCertificado(c);
        if (falta) return falta;
        const r = await enviarCertificado(org, titular.id, c);
        setC((x) => ({ ...x, senha: "" }));
        aoSalvar(r.mensagem ?? "Certificado guardado no cofre.");
        return null;
      }}
    >
      <AvisoCofre>
        O arquivo e a senha vão direto para o cofre do Ledgra Link (cifrados) e não ficam no HUB. Ninguém consegue baixar o
        certificado depois; para trocar, envie o novo aqui.
      </AvisoCofre>
      <CampoArquivo accept=".pfx,.p12" escolhido={c.arquivo?.name} titulo="Arraste o certificado (.pfx) ou clique para escolher"
        aoEscolher={([a]) => mudar({ arquivo: a ?? null })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Tipo</span>
          <select value={c.tipo} onChange={(e) => mudar({ tipo: e.target.value as NovoCertificado["tipo"] })}>
            {TIPOS_CERTIFICADO.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Apelido</span>
          <input required maxLength={60} value={c.apelido} onChange={(e) => mudar({ apelido: e.target.value })} placeholder="Ex.: e-CNPJ MDC 2026" />
          <small className="text-xs text-[var(--texto-suave)]">Aparece nas telas e no painel de vencimentos: nunca escreva a senha aqui.</small>
        </label>
        <label className="campo sm:col-span-2">
          <span>Senha do certificado</span>
          <input required type="password" autoComplete="new-password" value={c.senha} onChange={(e) => mudar({ senha: e.target.value })} />
        </label>
      </div>
    </JanelaEnvio>
  );
}

// ------------------------------------------------------------------------------------------------ conta

export function JanelaConta({
  org,
  titular,
  aoFechar,
  aoSalvar,
}: {
  org: string;
  titular: TitularLink;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [c, setC] = useState<NovaConta>({
    codigo_compe: "033", agencia: "", conta: "", conta_dv: "", apelido: "", convenio: "", carteira: "", chave_pix: "",
    ambiente: "producao",
  });
  const mudar = (p: Partial<NovaConta>) => setC((x) => ({ ...x, ...p }));
  const banco = BANCOS_LINK.find((b) => b.codigo === c.codigo_compe);
  return (
    <JanelaEnvio
      id="form-link-conta"
      titulo={`Conta bancária · ${titular.razao_social}`}
      descricao="Os dados da conta como estão no banco. O convênio e a carteira de cobrança o gerente do banco informa."
      botao="Cadastrar conta"
      largura="4xl"
      aoFechar={aoFechar}
      enviar={async () => {
        const falta = conferirConta(c);
        if (falta) return falta;
        const r = await cadastrarConta(org, titular.id, c);
        aoSalvar(r.mensagem ?? "Conta cadastrada.");
        return null;
      }}
    >
      <ColunasFormulario>
        <ColunaFormulario>
          <label className="campo">
            <span>Banco</span>
            <select required value={c.codigo_compe}
              onChange={(e) => mudar({ codigo_compe: e.target.value, apelido: c.apelido })}>
              {BANCOS_LINK.map((b) => (
                <option key={b.codigo} value={b.codigo}>
                  {b.codigo} · {b.nome}{b.pronto ? "" : " (em preparação)"}
                </option>
              ))}
            </select>
          </label>
          {banco && !banco.pronto && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              A cobrança automática do {banco.nome} ainda está em preparação no Ledgra Link. Dá para cadastrar a conta agora;
              o boleto funciona quando o banco for liberado.
            </p>
          )}
          <div className="grid grid-cols-[1fr_2fr_5rem] gap-3">
            <label className="campo">
              <span>Agência</span>
              <input required inputMode="numeric" maxLength={5} className="num" value={c.agencia}
                onChange={(e) => mudar({ agencia: e.target.value })} placeholder="1234" />
            </label>
            <label className="campo">
              <span>Conta</span>
              <input required inputMode="numeric" maxLength={13} className="num" value={c.conta}
                onChange={(e) => mudar({ conta: e.target.value })} placeholder="13000123" />
            </label>
            <label className="campo">
              <span>Dígito</span>
              <input maxLength={2} className="num" value={c.conta_dv} onChange={(e) => mudar({ conta_dv: e.target.value })} />
            </label>
          </div>
          <label className="campo">
            <span>Apelido da conta</span>
            <input required maxLength={60} value={c.apelido} onChange={(e) => mudar({ apelido: e.target.value })}
              placeholder={`Ex.: ${banco?.nome ?? "Banco"} ${titular.razao_social.split(" ")[0]}`} />
          </label>
        </ColunaFormulario>
        <ColunaFormulario>
          <div className="grid grid-cols-2 gap-3">
            <label className="campo">
              <span>Convênio de cobrança (opcional)</span>
              <input maxLength={20} className="num" value={c.convenio} onChange={(e) => mudar({ convenio: e.target.value })} />
            </label>
            <label className="campo">
              <span>Carteira (opcional)</span>
              <input maxLength={10} className="num" value={c.carteira} onChange={(e) => mudar({ carteira: e.target.value })} />
            </label>
          </div>
          <label className="campo">
            <span>Chave Pix da conta (opcional)</span>
            <input maxLength={77} value={c.chave_pix} onChange={(e) => mudar({ chave_pix: e.target.value })}
              placeholder="CNPJ, e-mail, celular ou chave aleatória" />
          </label>
          <label className="campo">
            <span>Ambiente</span>
            <select value={c.ambiente} onChange={(e) => mudar({ ambiente: e.target.value as NovaConta["ambiente"] })}>
              {AMBIENTES.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-[var(--texto-suave)]">{AMBIENTES.find((a) => a.id === c.ambiente)?.ajuda}</p>
        </ColunaFormulario>
      </ColunasFormulario>
    </JanelaEnvio>
  );
}

// ------------------------------------------------------------------------------------------------ credencial

export function JanelaCredencial({
  org,
  titular,
  certificados,
  aoFechar,
  aoSalvar,
}: {
  org: string;
  titular: TitularLink;
  certificados: CertificadoLink[];
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const certs = certificados.filter((x) => x.titular_id === titular.id && x.status === "ativo" && x.situacao !== "vencido");
  const [k, setK] = useState<NovaCredencial>({
    conta_id: titular.contas[0]?.id ?? "", produto: "cobranca", client_id: "", client_secret: "", certificado_id: certs[0]?.id ?? "",
  });
  const mudar = (p: Partial<NovaCredencial>) => setK((x) => ({ ...x, ...p }));
  return (
    <JanelaEnvio
      id="form-link-credencial"
      titulo={`Credencial de API · ${titular.razao_social}`}
      descricao="O Client ID e o Client Secret que o banco gera no portal do desenvolvedor, para cada produto (cobrança, Pix, extrato)."
      botao="Guardar credencial"
      aoFechar={aoFechar}
      enviar={async () => {
        const falta = conferirCredencial(k);
        if (falta) return falta;
        const r = await cadastrarCredencial(org, k);
        setK((x) => ({ ...x, client_secret: "" }));
        aoSalvar(r.mensagem ?? "Credencial guardada no cofre.");
        return null;
      }}
    >
      <AvisoCofre>O Client Secret vai cifrado para o cofre do Ledgra Link e não volta para a tela. A troca é obrigatória em 12 meses.</AvisoCofre>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo sm:col-span-2">
          <span>Conta</span>
          <select required value={k.conta_id} onChange={(e) => mudar({ conta_id: e.target.value })}>
            {titular.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido} · {c.banco} ag. {c.agencia} c/c {c.conta}{c.conta_dv ? `-${c.conta_dv}` : ""} · {nomeAmbiente(c.ambiente)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Produto</span>
          <select value={k.produto} onChange={(e) => mudar({ produto: e.target.value as NovaCredencial["produto"] })}>
            {PRODUTOS.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Certificado usado na conexão</span>
          <select value={k.certificado_id} onChange={(e) => mudar({ certificado_id: e.target.value })}>
            <option value="">Nenhum</option>
            {certs.map((c) => (
              <option key={c.id} value={c.id}>{c.apelido}</option>
            ))}
          </select>
        </label>
        <label className="campo sm:col-span-2">
          <span>Client ID</span>
          <input required maxLength={200} className="num" value={k.client_id} onChange={(e) => mudar({ client_id: e.target.value })} />
        </label>
        <label className="campo sm:col-span-2">
          <span>Client Secret</span>
          <input required type="password" autoComplete="new-password" value={k.client_secret}
            onChange={(e) => mudar({ client_secret: e.target.value })} />
        </label>
      </div>
    </JanelaEnvio>
  );
}
