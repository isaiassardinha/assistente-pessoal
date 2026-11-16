import type { Metadata } from "next";
import { Aviso } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarCelular } from "@/lib/validacao";

export const metadata: Metadata = { title: "Painel" };

export default async function Painel({ searchParams }: PageProps<"/painel">) {
  const { perfil } = await exigirAprovado();
  const { aviso } = await searchParams;

  return (
    <div className="space-y-6">
      {aviso === "senha-alterada" ? <Aviso tipo="sucesso">Senha alterada com sucesso.</Aviso> : null}

      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Olá, {perfil.nome.split(" ")[0]}!</h1>
        <p className="mt-1 text-zinc-600">Seu assistente se chama {perfil.nome_assistente}.</p>
      </div>

      {!perfil.celular_verificado ? (
        <Aviso tipo="info">
          Seu celular {formatarCelular(perfil.celular)} ainda não foi verificado. A verificação por
          código no WhatsApp chega na próxima etapa do projeto.
        </Aviso>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {["Despesas do mês", "Próximos lembretes", "Tarefas pendentes"].map((titulo) => (
          <div key={titulo} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold text-zinc-900">{titulo}</h2>
            <p className="mt-2 text-sm text-zinc-500">Em breve.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
