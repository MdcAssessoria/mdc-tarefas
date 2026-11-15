// Política de privacidade do MDC · Pessoal (pública, sem login). Exigida pela Google Play e pela App Store e referência
// da LGPD (Lei 13.709/2018). Mudou o que o app guarda ou com quem compartilha? Atualize este texto e a data no mesmo commit.
import type { Metadata } from "next";
import Link from "next/link";
import { PaginaSimples, Secao } from "../_componentes/PaginaSimples";
import { IDENTIDADE_MDC } from "@/lib/identidade";

export const metadata: Metadata = { title: "Política de privacidade · MDC · Pessoal" };

const ATUALIZADA = "14/11/2026";

export default function Privacidade() {
  const I = IDENTIDADE_MDC;
  return (
    <PaginaSimples titulo="Política de privacidade">
      <p className="text-sm text-neutral-500">Atualizada em {ATUALIZADA}</p>
      <p>
        O <b>MDC · Pessoal</b> é um app gratuito para organizar as finanças e as tarefas da família. Ele é oferecido pela{" "}
        <b>{I.razaoSocial}</b> (CNPJ {I.cnpj}, {I.cidadeUf}), que é a controladora dos dados, nos termos da Lei Geral de Proteção de Dados (LGPD, Lei
        13.709/2018). Aqui explicamos, em linguagem simples, o que guardamos, para quê e quais são os seus direitos.
      </p>

      <Secao titulo="O que guardamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Conta:</b> nome, e-mail e senha (a senha fica protegida e ninguém da MDC consegue lê-la).
          </li>
          <li>
            <b>O que você lança:</b> contas a pagar e a receber, entradas, gastos, contas bancárias, extratos que você enviar, tarefas e o nome da
            família.
          </li>
          <li>
            <b>Família:</b> quem você convidou, o papel de cada pessoa e os códigos de convite.
          </li>
          <li>
            <b>Avisos:</b> se você ligar o resumo diário, o endereço técnico do seu aparelho para receber o aviso.
          </li>
          <li>
            <b>&quot;Você tem empresa?&quot;:</b> só se você responder e autorizar, o CNPJ, o nome e o contato para a MDC falar com você.
          </li>
          <li>
            <b>Registro de uso:</b> datas de acesso e das ações importantes, para segurança e para resolver problemas.
          </li>
        </ul>
      </Secao>

      <Secao titulo="Para que usamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Fazer o app funcionar: mostrar suas contas, o resumo do mês, os gráficos e os avisos.</li>
          <li>Proteger a sua conta e a da sua família (login, convites, permissões).</li>
          <li>Falar com você sobre serviços da MDC, somente se você autorizou no &quot;Você tem empresa?&quot;. Você pode retirar a autorização a qualquer momento.</li>
        </ul>
        <p>
          <b>Não vendemos seus dados</b> e não usamos o que você lança para propaganda.
        </p>
      </Secao>

      <Secao titulo="Lançar falando">
        <p>
          Quando você usa o microfone, a fala vira texto pelo próprio navegador do celular (no Chrome, pelo serviço de voz do Google; no iPhone, pela
          Apple). O app entende a frase no próprio aparelho, sem mandar para nenhuma inteligência artificial. O áudio e a frase não ficam guardados: fica
          só o lançamento que você salvar e, no seu aparelho, as palavras que o app aprendeu com as suas correções.
        </p>
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        <p>Somente com os serviços que fazem o app funcionar, que guardam os dados com segurança e não podem usá-los para outros fins:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase (banco de dados e login) e Vercel (hospedagem do site).</li>
          <li>Google ou Apple, para entregar o aviso do resumo no seu celular, se você ligar.</li>
        </ul>
        <p>Também compartilhamos se a lei ou uma ordem judicial exigir.</p>
      </Secao>

      <Secao titulo="Por quanto tempo">
        <p>
          Enquanto a sua conta existir. Quando você exclui a conta, apagamos os seus dados e as famílias em que você estava sozinho. Nas famílias com
          outras pessoas, você sai e os lançamentos da família continuam com elas.
        </p>
      </Secao>

      <Secao titulo="Seus direitos">
        <p>
          Pela LGPD você pode pedir: confirmação e acesso aos dados, correção, exclusão, informação sobre compartilhamento e retirada do consentimento.
          Boa parte você faz no próprio app (editar, sair da família, retirar a autorização de contato).
        </p>
        <p>
          Para excluir a conta e os dados, use{" "}
          <Link href="/pessoal/excluir-conta" className="font-semibold text-[#8A6A2A] underline">
            Excluir minha conta
          </Link>
          .
        </p>
      </Secao>

      <Secao titulo="Segurança">
        <p>
          Os dados trafegam com criptografia (HTTPS). Cada família só vê o que é dela, e quem só acompanha não altera. Ninguém da MDC acessa os dados da
          sua família, a não ser para resolver um problema que você pedir.
        </p>
      </Secao>

      <Secao titulo="Crianças">
        <p>O app é para maiores de 18 anos. Menores só usam acompanhados pelo responsável da família.</p>
      </Secao>

      <Secao titulo="Fale com a gente">
        <p>
          Encarregado de dados: {I.responsavelTecnico.nome}, pelo e-mail <b>{I.email}</b> ou pelo WhatsApp <b>{I.telefone}</b>.
        </p>
      </Secao>
    </PaginaSimples>
  );
}
