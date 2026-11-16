import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Aviso, PaginaCentral } from "@/components/ui";
import { obterSessao } from "@/lib/auth/sessao";
import { caminhoSeguro } from "@/lib/validacao";
import { FormularioEntrar } from "./Formulario";

export const metadata: Metadata = { title: "Entrar" };

const AVISOS: Record<string, { tipo: "erro" | "sucesso" | "info"; texto: string }> = {
  "link-invalido": { tipo: "erro", texto: "Esse link já foi usado ou venceu. Entre com sua senha ou peça um link novo." },
  "senha-alterada": { tipo: "sucesso", texto: "Senha alterada. Entre com a nova senha." },
};

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const parametros = await searchParams;
  const proximo = caminhoSeguro(typeof parametros.proximo === "string" ? parametros.proximo : null);
  const aviso = typeof parametros.aviso === "string" ? AVISOS[parametros.aviso] : undefined;

  if (await obterSessao()) redirect(proximo);

  return (
    <PaginaCentral titulo="Entrar">
      {aviso ? (
        <div className="mb-4">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      ) : null}
      <FormularioEntrar proximo={proximo} />
    </PaginaCentral>
  );
}
