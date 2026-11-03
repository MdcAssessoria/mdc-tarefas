// =============================================================================
// @ledgra/link-cliente v0.1.0 — ARQUIVO GERADO, NÃO EDITE AQUI.
// Fonte: repositório ledgra-link (packages/cliente). Para atualizar,
// rode "node scripts/empacotar-sdk.mjs" lá e copie este arquivo de novo.
// Integridade: 556bd932dbeb8aba
// MDC Assessoria Ltda · CNPJ 48.140.121/0001-65
// =============================================================================
/**
 * Assinatura dos eventos que o Ledgra Link envia aos sistemas conectados.
 *
 *   Cabeçalho  Ledgra-Link-Assinatura: t=<unix segundos>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo>")>
 *
 * O sistema confere com o segredo recebido em PUT /v1/sistema/webhook e recusa
 * evento com mais de 5 minutos (evita reenvio malicioso de um aviso antigo).
 * Este arquivo é a única fonte da regra: o gateway assina e o SDK confere com ele.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const CABECALHO_ASSINATURA = 'ledgra-link-assinatura';
export const TOLERANCIA_SEGUNDOS = 300;

export function assinar(segredo: string, corpo: string, agora = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', segredo).update(`${agora}.${corpo}`).digest('hex');
  return `t=${agora},v1=${v1}`;
}

export type ResultadoVerificacao = { ok: true } | { ok: false; motivo: 'formato' | 'expirada' | 'assinatura' };

export function verificarAssinatura(segredo: string, corpo: string, cabecalho: string | undefined | null,
  agora = Math.floor(Date.now() / 1000)): ResultadoVerificacao {
  const m = /^t=(\d{10}),v1=([0-9a-f]{64})$/.exec(cabecalho ?? '');
  if (!m) return { ok: false, motivo: 'formato' };
  const t = Number(m[1]);
  if (Math.abs(agora - t) > TOLERANCIA_SEGUNDOS) return { ok: false, motivo: 'expirada' };
  const esperado = Buffer.from(createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex'), 'hex');
  const recebido = Buffer.from(m[2]!, 'hex');
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
    ? { ok: true } : { ok: false, motivo: 'assinatura' };
}

/** Formato do corpo de todo evento. */
export interface EventoMdc<T = Record<string, unknown>> {
  id: string;            // id_evento — use para não processar o mesmo evento duas vezes
  tipo: 'cobranca.paga' | 'cobranca.baixada' | 'cobranca.cancelada' | 'cobranca.vencida' | 'cobranca.rejeitada'
      | 'pix.recebido' | 'certificado.vencendo' | 'certificado.vencido';
  criado_em: string;
  tentativa: number;
  dados: T;
}

// ---------------------------------------------------------------- cliente
/**
 * @ledgra/link-cliente — SDK que HUB-MDC, Ledgra, EXato e Ledgra IA
 * instalam para usar a API Bancária MDC. Sem dependências: usa o fetch do Node 18+.
 *
 *   const banco = new LedgraLink({ url: process.env.LEDGRA_LINK_URL!, chave: process.env.LEDGRA_LINK_CHAVE! });
 *   const boleto = await banco.cobrancas.emitir({ conta_id, ref_externa: 'FAT-123', tipo: 'boleto_hibrido', valor: 150, vencimento: '2026-11-20', pagador });
 *
 * Regras embutidas:
 *  - Idempotency-Key automática e determinística por ref_externa: repetir a chamada
 *    (rede caiu, usuário clicou duas vezes) nunca gera boleto em dobro.
 *  - Nova tentativa só onde é seguro (leitura, ou escrita com idempotência) e só
 *    para falhas temporárias (rede, 429, 503).
 *  - Erros sempre como ErroLedgraLink, com mensagem em português pronta para tela.
 */


export interface OpcoesCliente {
  url: string;                 // ex.: https://link.ledgra.com.br
  chave: string;               // llk_...
  usuario?: string;            // e-mail padrão para X-MDC-Usuario (pode ser trocado por chamada)
  timeoutMs?: number;
  tentativas?: number;
  fetch?: typeof fetch;
}

export class ErroLedgraLink extends Error {
  constructor(public readonly status: number, public readonly codigo: string, mensagem: string,
    public readonly detalhes?: unknown) {
    super(mensagem);
    this.name = 'ErroLedgraLink';
  }
  /** Vale a pena tentar de novo mais tarde? */
  get temporario() { return this.status === 0 || this.status === 429 || this.status === 503; }
}

type Metodo = 'GET' | 'POST' | 'PUT';
interface Chamada { usuario?: string; idempotencia?: string }

// --------------------------------------------------------------- tipos de uso
export type TipoCobranca = 'boleto' | 'boleto_hibrido' | 'pix_imediato' | 'pix_vencimento';
export interface NovaCobranca {
  conta_id: string; ref_externa: string; tipo: TipoCobranca; valor: number;
  vencimento?: string; dias_apos_vencimento?: number; multa_percentual?: number; juros_mensal_percentual?: number;
  desconto?: { valor: number; ate: string }; mensagem?: string;
  pagador?: { documento: string; nome: string; email?: string;
    endereco?: { logradouro: string; numero?: string; bairro?: string; cidade: string; uf: string; cep: string } };
}
export interface Cobranca {
  id: string; status: string; tipo: TipoCobranca; valor: number; vencimento: string | null;
  nosso_numero: string | null; linha_digitavel: string | null; pix_copia_cola: string | null; txid: string | null;
}

/** Linha do painel de vencimentos (só dados públicos do certificado; o arquivo e a senha nunca saem do cofre). */
export interface CertificadoVencimento {
  id: string; titular_id: string; titular_documento: string; titular_razao_social: string;
  tipo: 'icp_a1_ecnpj' | 'icp_a1_ecpf' | 'banco_mtls' | 'webhook_servidor'; apelido: string;
  titular_cn: string | null; emissor_cn: string | null; valido_de: string; valido_ate: string;
  dias_para_vencer: number; situacao: 'vencido' | 'critico' | 'atencao' | 'ok'; status: string; ultimo_uso_em: string | null;
}

export class LedgraLink {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly o: OpcoesCliente) {
    if (!/^https:\/\//.test(o.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(o.url)) {
      throw new Error('A URL da API Bancária deve usar HTTPS.');
    }
    if (!/^llk_/.test(o.chave)) throw new Error('Chave de API inválida (deve começar com llk_).');
    this.base = o.url.replace(/\/+$/, '');
    this.f = o.fetch ?? fetch;
  }

  private async req<T>(metodo: Metodo, caminho: string, corpo?: unknown, c: Chamada = {}): Promise<T> {
    const cab: Record<string, string> = { authorization: `Bearer ${this.o.chave}`, accept: 'application/json' };
    const usuario = c.usuario ?? this.o.usuario;
    if (usuario) cab['x-mdc-usuario'] = usuario;
    if (c.idempotencia) cab['idempotency-key'] = c.idempotencia;
    let body: BodyInit | undefined;
    if (corpo instanceof FormData) body = corpo;
    else if (corpo !== undefined) { cab['content-type'] = 'application/json'; body = JSON.stringify(corpo); }

    const seguroRepetir = metodo === 'GET' || !!c.idempotencia;
    const max = seguroRepetir ? (this.o.tentativas ?? 3) : 1;
    for (let t = 1; ; t++) {
      let r: Response;
      try {
        r = await this.f(this.base + caminho, { method: metodo, headers: cab, body,
          signal: AbortSignal.timeout(this.o.timeoutMs ?? 45_000) });
      } catch (e) {
        if (t < max) { await espera(t); continue; }
        throw new ErroLedgraLink(0, 'sem_conexao', 'Não foi possível falar com a API Bancária. Verifique a internet e tente de novo.', e);
      }
      const texto = await r.text();
      const json = texto ? safeJson(texto) : undefined;
      if (r.ok) return json as T;
      const erro = new ErroLedgraLink(r.status, (json as any)?.erro ?? 'erro', (json as any)?.mensagem ?? `Falha HTTP ${r.status}`, json);
      if (erro.temporario && t < max) { await espera(t); continue; }
      throw erro;
    }
  }

  // ------------------------------------------------------------------ geral
  saude() { return this.req<{ ok: boolean }>('GET', '/saude'); }
  bancos() { return this.req<{ bancos: Array<{ banco: string; nome: string; recursos: string[] }> }>('GET', '/v1/bancos'); }

  readonly sistema = {
    eu: () => this.req<{ codigo: string; nome: string; escopos: string[]; url_webhook: string | null }>('GET', '/v1/sistema'),
    /** Devolve o segredo de assinatura UMA vez — guarde no cofre do seu sistema. */
    configurarWebhook: (url: string, eventos: EventoMdc['tipo'][] = []) =>
      this.req<{ url: string; segredo: string }>('PUT', '/v1/sistema/webhook', { url, eventos }),
  };

  // -------------------------------------------------------------- cadastros
  readonly titulares = {
    cadastrar: (t: { documento: string; razao_social: string; ref_externa?: string; email_contato?: string }) =>
      this.req<{ id: string; novo: boolean; liberado: boolean; mensagem: string }>('POST', '/v1/titulares', t),
    listar: (documento?: string) =>
      this.req<{ titulares: Array<{ id: string; documento: string; razao_social: string; autoriza_cobranca: boolean; autoriza_extrato: boolean }> }>(
        'GET', '/v1/titulares' + (documento ? `?documento=${encodeURIComponent(documento)}` : '')),
    registrarAutorizacao: (titularId: string, a: {
      escopos: Array<'cobranca' | 'extrato' | 'pagamento' | 'pix'>; documento_termo: string; hash_termo: string;
      assinado_por_nome: string; assinado_por_cpf: string; assinado_em: string; vigente_ate?: string;
      base_legal?: 'execucao_contrato' | 'obrigacao_legal' | 'exercicio_direitos' | 'legitimo_interesse';
    }, c?: Chamada) => this.req<{ id: string }>('POST', `/v1/titulares/${titularId}/autorizacoes`, a, c),
    revogarAutorizacao: (autorizacaoId: string, motivo: string, c?: Chamada) =>
      this.req('POST', `/v1/autorizacoes/${autorizacaoId}/revogar`, { motivo }, c),
  };

  readonly contas = {
    cadastrar: (conta: { titular_id: string; codigo_compe: string; agencia: string; conta: string; conta_dv?: string;
      apelido: string; convenio?: string; carteira?: string; workspace_id?: string; chave_pix?: string;
      ambiente?: 'sandbox' | 'homologacao' | 'producao'; conta_contabil?: string }) =>
      this.req<{ id: string }>('POST', '/v1/contas', conta),
    listar: (titularId: string) => this.req<{ contas: unknown[] }>('GET', `/v1/titulares/${titularId}/contas`),
    cadastrarCredencial: (contaId: string, cred: { produto: 'pix' | 'cobranca' | 'extrato' | 'pagamentos'; client_id: string;
      segredos: Record<string, string>; certificado_id?: string; escopos_oauth?: string[] }) =>
      this.req<{ id: string }>('POST', `/v1/contas/${contaId}/credenciais`, cred),
  };

  // ------------------------------------------------------------ certificados
  readonly certificados = {
    /** Envia o .pfx/.p12 e a senha. Exige usuário (quem está cadastrando). */
    enviar: (e: { titular_id: string; tipo: 'icp_a1_ecnpj' | 'icp_a1_ecpf' | 'banco_mtls' | 'webhook_servidor';
      apelido: string; arquivo: Uint8Array | Blob; nome_arquivo: string; senha: string }, c?: Chamada) => {
      const fd = new FormData();
      fd.set('titular_id', e.titular_id); fd.set('tipo', e.tipo); fd.set('apelido', e.apelido); fd.set('senha', e.senha);
      const blob = e.arquivo instanceof Blob ? e.arquivo : new Blob([new Uint8Array(e.arquivo)], { type: 'application/x-pkcs12' });
      fd.set('arquivo', blob, e.nome_arquivo);
      return this.req<{ id: string; valido_ate: string; substituiu: string | null; mensagem: string }>('POST', '/v1/certificados', fd, c);
    },
    vencimentos: (situacao?: 'vencido' | 'critico' | 'atencao' | 'ok') =>
      this.req<{ total: number; certificados: CertificadoVencimento[] }>(
        'GET', '/v1/certificados/vencimentos' + (situacao ? `?situacao=${situacao}` : '')),
    revogar: (id: string, motivo: string, c?: Chamada) => this.req('POST', `/v1/certificados/${id}/revogar`, { motivo }, c),
  };

  // --------------------------------------------------------------- cobranças
  readonly cobrancas = {
    /**
     * Emite a cobrança. A chave de idempotência padrão é derivada de ref_externa:
     * a mesma fatura nunca vira dois boletos. Para reemitir de propósito, use outra ref_externa.
     */
    emitir: (c: NovaCobranca, opc: Chamada = {}) =>
      this.req<Cobranca>('POST', '/v1/cobrancas', c, { ...opc, idempotencia: opc.idempotencia ?? `cob:${c.ref_externa}` }),
    consultar: (id: string) => this.req<Cobranca & { valor_pago: number | null; pago_em: string | null }>('GET', `/v1/cobrancas/${id}`),
  };

  readonly extrato = {
    sincronizar: (contaId: string, de: string, ate: string) =>
      this.req<{ recebidos: number; novos: number; duplicados: number }>('POST', `/v1/contas/${contaId}/extrato/sincronizar`, { de, ate }),
  };

  // ----------------------------------------------------------------- eventos
  /**
   * Use na rota que recebe os avisos da API Bancária. Passe o corpo BRUTO
   * (texto exatamente como chegou) e o cabeçalho ledgra-link-assinatura.
   */
  static lerEvento<T = Record<string, unknown>>(segredo: string, corpoBruto: string, cabecalho: string | null | undefined): EventoMdc<T> {
    const v = verificarAssinatura(segredo, corpoBruto, cabecalho);
    if (!v.ok) {
      throw new ErroLedgraLink(401, `assinatura_${v.motivo}`, v.motivo === 'expirada'
        ? 'Evento com mais de 5 minutos: recusado por segurança.' : 'Assinatura do evento não confere.');
    }
    return JSON.parse(corpoBruto) as EventoMdc<T>;
  }
}

function espera(t: number) {
  return new Promise((ok) => setTimeout(ok, Math.min(400 * 2 ** (t - 1), 4000) + Math.random() * 200));
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return { mensagem: t.slice(0, 200) }; } }
