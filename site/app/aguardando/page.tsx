import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { PaginaCentral } from "@/components/ui";
import { exigirLogin } from "@/lib/auth/sessao";
import { sair } from "../entrar/acoes";

export const metadata: Metadata = { title: "Aguardando aprovação" };

export default async function Aguardando() {
  const { perfil } = await exigirLogin();
  if (perfil.status === "aprovado") redirect("/painel");

  const recusado = perfil.status === "recusado";
  return (
    <PaginaCentral titulo={recusado ? "Cadastro não aprovado" : "Cadastro recebido"}>
      <div className="space-y-4 text-zinc-700">
        {recusado ? (
          <p>Seu cadastro não foi aprovado. Se acha que houve um engano, fale com o administrador.</p>
        ) : (
          <>
            <p>
              Obrigado, <strong>{perfil.nome}</strong>! Seu e-mail foi confirmado e seu cadastro está
              <strong> aguardando aprovação</strong>.
            </p>
            <p className="text-sm text-zinc-500">
              Assim que for aprovado, você recebe uma mensagem de boas-vindas no WhatsApp e já pode usar
              o assistente.
            </p>
          </>
        )}
        <form action={sair}>
          <BotaoEnviar variante="secundario" enviando="Saindo…">
            Sair
          </BotaoEnviar>
        </form>
      </div>
    </PaginaCentral>
  );
}
