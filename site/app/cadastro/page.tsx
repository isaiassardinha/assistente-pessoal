import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaginaCentral } from "@/components/ui";
import { obterSessao } from "@/lib/auth/sessao";
import { FormularioCadastro } from "./Formulario";

export const metadata: Metadata = { title: "Criar conta" };

export default async function PaginaCadastro() {
  if (await obterSessao()) redirect("/painel");
  return (
    <PaginaCentral titulo="Criar conta" subtitulo="Depois de confirmar o e-mail, seu cadastro passa por aprovação.">
      <FormularioCadastro />
    </PaginaCentral>
  );
}
