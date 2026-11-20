import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidade" };

const CONTATO = "isaias.sards@gmail.com";

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-zinc-900">{titulo}</h2>
      <div className="space-y-2 text-zinc-700">{children}</div>
    </section>
  );
}

/** Página pública (sem login): o Google aponta para ela na tela de permissão. */
export default function Privacidade() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
      <div>
        <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
          Assistente Pessoal
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-900">Política de privacidade</h1>
        <p className="mt-2 text-sm text-zinc-500">Atualizada em 19 de novembro de 2026.</p>
      </div>

      <p className="text-zinc-700">
        O Assistente Pessoal é um serviço privado, de uso restrito a pessoas convidadas: todo cadastro passa por aprovação. Esta página explica,
        de forma direta, o que o assistente guarda, para quê e como você pode pedir para apagar.
      </p>

      <Bloco titulo="O que guardamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados do cadastro: nome, e-mail e celular.</li>
          <li>O que você registra pelo site ou pelo WhatsApp: despesas, contas, tarefas, lembretes, anotações e documentos.</li>
          <li>As últimas mensagens da conversa com o assistente, para ele entender o contexto.</li>
          <li>
            Em grupos ligados a um espaço: as mensagens, áudios (transformados em texto), documentos e fotos enviados pelos membros do espaço.
            Quem está no grupo mas não é membro não tem nada guardado.
          </li>
          <li>Se você conectar o e-mail: apenas remetente, assunto, um resumo curto e a importância de cada e-mail, por 60 dias.</li>
        </ul>
      </Bloco>

      <Bloco titulo="Dados do Google">
        <p>Quando você clica em &quot;Conectar com Google&quot;, o assistente pede só o necessário:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Google Agenda</strong> (ver e editar eventos): para mostrar seus compromissos, avisar antes deles e marcar, mudar ou
            cancelar quando você pede.
          </li>
          <li>
            <strong>Google Drive</strong> (só os arquivos criados pelo próprio assistente): para guardar os documentos de um espaço numa pasta
            criada por ele. O assistente não enxerga nenhum outro arquivo do seu Drive.
          </li>
        </ul>
        <p>
          O uso e a transferência das informações recebidas das APIs do Google seguem a{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-emerald-700 underline"
            target="_blank"
            rel="noopener"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado. Esses dados não são vendidos, não são usados para publicidade e não são usados para
          treinar modelos de inteligência artificial.
        </p>
        <p>Você pode cortar o acesso a qualquer momento no site (Minha conta ou Espaços) ou em myaccount.google.com/permissions.</p>
      </Bloco>

      <Bloco titulo="Como os dados são usados">
        <p>
          Só para o próprio serviço: responder suas mensagens, organizar o que você registra, ler seus documentos para responder perguntas sobre
          eles e mandar os avisos que você configurou. Cada pessoa vê apenas os próprios dados; o conteúdo de um espaço só é visível para os
          membros daquele espaço.
        </p>
      </Bloco>

      <Bloco titulo="Onde os dados ficam e quem ajuda a processar">
        <ul className="list-disc space-y-1 pl-5">
          <li>Banco de dados e arquivos: Supabase (servidores em São Paulo).</li>
          <li>Site e robô: servidor próprio na Hostinger.</li>
          <li>Inteligência artificial: Google Gemini, para entender mensagens e áudios, ler documentos e responder.</li>
          <li>E-mails do sistema (confirmação de cadastro, troca de senha): Resend.</li>
          <li>Documentos de espaços com o Drive conectado: a pasta do assistente no Google Drive de um administrador do espaço.</li>
        </ul>
        <p>As senhas e permissões de conexões (e-mail, agenda, Drive) ficam guardadas criptografadas.</p>
      </Bloco>

      <Bloco titulo="Seus direitos (LGPD)">
        <p>
          Você pode pedir para ver, corrigir ou apagar seus dados, ou excluir sua conta, escrevendo para{" "}
          <a href={`mailto:${CONTATO}`} className="text-emerald-700 underline">
            {CONTATO}
          </a>
          . Muita coisa você mesmo apaga pelo site, inclusive as suas mensagens guardadas em espaços. Ao excluir a conta, apagamos seus dados
          pessoais; documentos que você enviou a um espaço compartilhado podem continuar lá para os demais membros, a menos que você peça para
          apagar.
        </p>
      </Bloco>
    </main>
  );
}
