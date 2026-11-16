import { Cabecalho } from "@/components/Cabecalho";
import { exigirAprovado } from "@/lib/auth/sessao";

export default async function LayoutPainel({ children }: LayoutProps<"/painel">) {
  const { perfil } = await exigirAprovado();
  return (
    <>
      <Cabecalho nome={perfil.nome} admin={perfil.is_admin} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
