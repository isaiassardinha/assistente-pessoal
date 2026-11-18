import Link from "next/link";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { sair } from "@/app/entrar/acoes";

type Item = { href: string; rotulo: string };

/** Menu do topo. No celular vira um botão "Menu" que abre a lista
 *  (feito com <details>, sem precisar de JavaScript). */
export function Cabecalho({ nome, admin }: { nome: string; admin: boolean }) {
  const itens: Item[] = [
    { href: "/painel", rotulo: "Painel" },
    { href: "/painel/despesas", rotulo: "Despesas" },
    { href: "/painel/tarefas", rotulo: "Tarefas" },
    { href: "/painel/lembretes", rotulo: "Lembretes" },
    { href: "/painel/cerebro", rotulo: "Cérebro" },
    { href: "/painel/conta", rotulo: "Minha conta" },
  ];
  if (admin) itens.push({ href: "/admin", rotulo: "Cadastros" }, { href: "/admin/whatsapp", rotulo: "WhatsApp" });

  const links = itens.map((i) => (
    <Link key={i.href} href={i.href} className="rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
      {i.rotulo}
    </Link>
  ));
  const botaoSair = (
    <form action={sair}>
      <BotaoEnviar variante="secundario" enviando="Saindo…">
        Sair
      </BotaoEnviar>
    </form>
  );

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/painel" className="font-semibold text-emerald-700">
          Assistente Pessoal
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links}
          <span className="mx-2 text-sm text-zinc-500">{nome}</span>
          {botaoSair}
        </nav>

        <details className="relative lg:hidden">
          <summary className="cursor-pointer list-none rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium">
            Menu
          </summary>
          <div className="absolute right-0 z-10 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
            <span className="px-3 py-1 text-xs text-zinc-500">{nome}</span>
            {links}
            <div className="px-1 pt-1">{botaoSair}</div>
          </div>
        </details>
      </div>
    </header>
  );
}
