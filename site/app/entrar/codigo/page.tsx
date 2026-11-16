import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaginaCentral } from "@/components/ui";
import { obterSessao } from "@/lib/auth/sessao";
import { caminhoSeguro } from "@/lib/validacao";
import { FormularioCodigo } from "./Formulario";

export const metadata: Metadata = { title: "Código de verificação" };

export default async function PaginaCodigo({ searchParams }: PageProps<"/entrar/codigo">) {
  const parametros = await searchParams;
  const proximo = caminhoSeguro(typeof parametros.proximo === "string" ? parametros.proximo : null);

  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  if (sessao.aal === "aal2") redirect(proximo);

  return (
    <PaginaCentral
      titulo="Código de verificação"
      subtitulo="Abra o app autenticador no seu celular e digite o código de 6 números do Assistente Pessoal."
    >
      <FormularioCodigo proximo={proximo} />
    </PaginaCentral>
  );
}
