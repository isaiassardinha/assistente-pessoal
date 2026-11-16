import { LinkBotao } from "@/components/ui";
import { obterSessao } from "@/lib/auth/sessao";

const recursos = [
  { titulo: "Despesas", texto: "“Gastei 50 no mercado” e pronto: anotado, com totais por categoria e aviso de orçamento." },
  { titulo: "Tarefas e lembretes", texto: "“Me lembra amanhã às 9h de pagar a luz” e a mensagem chega no seu WhatsApp na hora certa." },
  { titulo: "Memórias", texto: "Guarde informações do dia a dia, como a placa do carro, e pergunte quando precisar." },
  { titulo: "Decisões", texto: "Organize prós e contras e registre o que decidiu e por quê." },
  { titulo: "Documentos", texto: "Mande uma foto ou um PDF e peça de volta quando precisar." },
  { titulo: "Relatórios", texto: "Peça o relatório do mês em PDF ou planilha, direto no WhatsApp." },
];

export default async function Inicio() {
  const sessao = await obterSessao();

  return (
    <main className="flex-1">
      <section className="mx-auto max-w-3xl px-6 pb-10 pt-16 text-center sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Assistente Pessoal</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight text-zinc-900 sm:text-5xl">
          Seu segundo cérebro no WhatsApp
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600">
          Escreva ou mande um áudio como se fosse para um amigo. O assistente anota, lembra e
          responde. Tudo também fica organizado aqui no site.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {sessao ? (
            <LinkBotao href="/painel">Ir para o meu painel</LinkBotao>
          ) : (
            <>
              <LinkBotao href="/cadastro">Criar conta</LinkBotao>
              <LinkBotao href="/entrar" variante="secundario">
                Entrar
              </LinkBotao>
            </>
          )}
        </div>
        {!sessao ? (
          <p className="mt-4 text-sm text-zinc-500">Cada cadastro passa por aprovação antes de ser liberado.</p>
        ) : null}
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {recursos.map((r) => (
          <div key={r.titulo} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold text-zinc-900">{r.titulo}</h2>
            <p className="mt-2 text-sm text-zinc-600">{r.texto}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
