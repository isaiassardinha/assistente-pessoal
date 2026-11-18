import type { Metadata } from "next";
import { Cabecalho } from "@/components/Cabecalho";
import { Secao } from "@/components/ui";
import { exigirAdmin } from "@/lib/auth/sessao";
import { estadoDoRobo } from "@/lib/robo";
import { Conexao } from "./Conexao";

export const metadata: Metadata = { title: "Conexão do WhatsApp" };

export default async function PaginaWhatsApp() {
  const { perfil } = await exigirAdmin();
  const estado = await estadoDoRobo();
  return (
    <>
      <Cabecalho nome={perfil.nome} admin />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Conexão do WhatsApp</h1>
        <Secao titulo="Robô" descricao="Esta página atualiza sozinha.">
          <Conexao inicial={estado} />
        </Secao>
      </main>
    </>
  );
}
